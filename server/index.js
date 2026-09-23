/**
 * ITAM 服务端入口
 * 零外部依赖：仅使用 Node.js 内置模块（node:http / node:https / node:sqlite / node:crypto）
 */
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

import {
  db, migrate, seedIfEmpty, getSetting, setSetting, allSettings, audit,
  DATA_DIR, UPLOAD_DIR, EXPORT_DIR, ROOT, BACKUP_DIR,
  get as dbGet, update as dbUpdate,
} from './db.js';
import * as svc from './services.js';
import { exportDevices, buildTemplate, previewImport, importDevices, importBatches,
  collectRows, toCSV, toHTMLTable, toHTMLWorkbook, liveManifest, liveManifestText,
  liveToken, resetLiveToken, checkLiveToken, categoryColumns, sheetColumnsFor, allColumns,
  photoColumns, attachPhotoUrls, hasDistinctOriginal } from './excel.js';
import { recognize, ocrStatus } from './lib/ocr.js';
import { interpret } from './lib/recognize.js';
import { qrcodeSvg } from './lib/qrcode.js';
import { decodeQR } from './lib/qrdecode.js';
import { decodeBarcode } from './lib/bardecode.js';
import {
  decodeAgentBody, parseBasicAuth, parseProlog, contactAnswer,
  tokenVerify, tokenCreate, tokenList, tokenSetEnabled, tokenDelete,
  ingest, logReport as logAgentReport, machineList as agentMachineList, machineGet as agentMachineGet,
  machineReports as agentMachineReports, reportList as agentReportList, monitorList as agentMonitorList,
  stats as agentStats, matchCandidates as agentMatchCandidates,
} from './lib/agent.js';
import { readBody, readJson, parseMultipart, mimeOf, extOf } from './lib/http-util.js';
import { clientIp, isInsideDir, createRateLimiter, createGate, applySecurityHeaders } from './lib/guard.js';
import {
  ensureAdminUser, authenticate, verifyPassword, signSession, setSessionCookie, clearSessionCookie,
  checkLoginRate, recordLoginFail, clearLoginFail, checkAccountLocked, bumpFailedAttempts,
  clearFailedAttempts, recordLoginMeta, logLogin, loginLogList, registerUser, registerConfig,
  changeOwnPassword, createUser, updateUser, deleteUser, resetUserPassword, userList,
  findUserByName, findUserById, publicUser, can, permissionsOf, ROLES, USER_STATUS,
  maskSecrets, isMasked, SESSION_TTL,
} from './auth.js';
import { logger, HttpError, nowISO, uuid, str, formatBytes } from './util.js';

const PUBLIC_DIR = path.join(ROOT, 'public');
const CERT_DIR = path.join(ROOT, 'certs');
const VERSION = '1.0.0';

const PORT = Number(process.env.PORT || 8080);
const HTTPS_PORT = Number(process.env.HTTPS_PORT || 8443);
const HOST = process.env.HOST || '0.0.0.0';
const ENABLE_HTTP = process.env.DISABLE_HTTP !== '1';

/** 一次最多收多少照片数据（原图 + 压缩图 + 缩略图一起） */
const MAX_PHOTO_BYTES = 48 * 1024 * 1024;

/** 一帧灰度图最多多大（服务端兜底扫码用）。1100×1100 = 1.16 MB，留一倍余量 */
const MAX_SCAN_BYTES = 4 * 1024 * 1024;

/* ================================================================== *
 * 限流与并发闸门
 *
 * 分两层，缺一不可：
 *   · 限流（速率）：挡住「同一个人狂打」，也顺手浇掉大部分扫描器。
 *   · 闸门（并发）：挡住「很多人各打一次」。Node 是单线程，/api/scan 一次要啃
 *     1~3 秒 CPU，10 个并发就不是慢，而是整个服务（连 /api/health）都停止响应。
 * 2026-09-23 实测：连打 30 次 /api/scan 全部放行、限流一条没触发。
 * ================================================================== */
const apiLimiter = createRateLimiter({
  limit: Number(process.env.ITAM_RATE_API || 600), windowMs: 60_000, name: '全站接口',
});
/**
 * 重接口：烧 CPU（扫码/二维码）或烧钱（OCR 第三方调用）或全表扫描（导出）
 *
 * 阈值怎么定的（2026-09-23 按真实用量反推，不是拍脑袋）：
 *   · 手机扫码：按一次快门最多发 **2** 个 /api/scan（见 m.js serverDecodeFrame：
 *     条码走「扁带→整帧」、二维码走「中心方形→整帧」，各 2 次），而且**只在浏览器
 *     自带解码器失手后**才发 —— 正常一扫就中的情况是 0 次。
 *   · 一个「狂按快门」的人 ≈ 60 次/分钟 → 120 个请求/分钟，这是单人的现实上界。
 *   · 关键：限流的 key 是 IP。几台手机经同一个 NAT / 反向代理（且没转发 XFF）时
 *     **共用一份配额**，所以阈值必须显著高于单人上界，否则「多人一起扫码」就报
 *     「请求过于频繁」—— 那是把安全措施做成了功能故障。
 *   → 取 240：刚好是单人上界的 2 倍，同时仍把脚本洪水压在 4 请求/秒以内。
 *
 * ⚠️ 真正兜住「把事件循环啃死」的是下面的**闸门**（并发上限），不是这个阈值。
 *    闸门满了直接回 503，不排队；限流只是速率上的第二道。所以这里放宽一点，
 *    并不会让服务变得容易被拖垮 —— 但**不要**反过来因为「闸门够了」就把它删掉：
 *    没有限流，一个账号可以把闸门的 503 刷成日志洪水和审计洪水。
 */
const heavyLimiter = createRateLimiter({
  limit: Number(process.env.ITAM_RATE_HEAVY || 240), windowMs: 60_000, name: '重接口',
});
const HEAVY_API = /^\/api\/(scan|ocr|ocr\/test|qrcode|qrcode\/device\/[^/]+|excel\/(export|preview|import|template))(\/|$|\?)/;

/**
 * 扫码解码是纯 JS 的**同步**重活，必须限制「同时在排队的有几个」。
 *
 * ⚠️ 2026-09-23 实测（两轮，都是量出来的，别凭直觉改）：
 *   ① 闸门只写 `max` 但套在解码外面（`await readBody()` 之后）→ **完全无效**：
 *      8 个并发 1200×1200 请求全部 200，耗时严格线性叠加（302/593/…/2282ms），
 *      计数器在下个请求进来前就减回 0 了。
 *   ② 改成「事件循环滞后 > 阈值才丢弃」→ **不稳定**：探针里 24 个并发丢掉了 21 个，
 *      同一段测试里 24 个并发又全部放行（滞后信号依赖定时器有没有抢到相位）。
 *      安全措施时灵时不灵，比没有更糟 —— 于是改成**确定性**的在途计数。
 *   ⇒ 最终做法：在 `/scan` 路由里 `await readBody()` **之前**先 `acquire()` 占坑
 *     （占坑早于第一个 await，各请求 handler 由 socket I/O 交错驱动，计数才涨得上去）。
 *
 * max 取 4 的依据：最坏情况「健康检查被挡住的时长」= max × 单次解码
 *   ≈ 4 × 529ms（1600px）≈ 2.1 秒 —— 运维还能确认「服务是活的」；
 *   同时留得下 4 台手机同时扫码不被误伤。
 */
const scanGate = createGate({ max: 4, name: '扫码解码' });
/** OCR 是网络等待（临界区里真的有 await，计数能涨上去），走 run() 包起来即可 */
const ocrGate = createGate({ max: 6, name: '图像识别' });

/**
 * 把内存里的图片写到 data/uploads/<日期>/<uuid>.<ext>，返回可访问的相对路径。
 * 顺带兜住扩展名，避免把非图片内容存成 .jpg 后被浏览器当图片渲染。
 */
function saveUpload(buffer, mime = 'image/jpeg', stamp = nowISO().slice(0, 10), subdir = '') {
  const ext = mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : mime === 'image/gif' ? '.gif' : '.jpg';
  const name = `${subdir ? subdir + '/' : ''}${stamp}/${uuid()}${ext}`;
  const abs = path.join(UPLOAD_DIR, name);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, buffer);
  return `/uploads/${name}`;
}

/* 权限点的中文名（用于 403 提示） */
const PERM_LABEL = {
  'device.read': '查看设备',
  'device.write': '新增/编辑设备',
  'device.delete': '删除设备',
  'excel.import': 'Excel 导入',
  'excel.export': 'Excel 导出',
  'org.write': '组织架构管理',
  'category.write': '设备分类管理',
  'trash.manage': '回收站管理',
  'audit.read': '查看审计日志',
  'settings.read': '查看系统设置',
  'settings.write': '修改系统设置',
  'user.manage': '用户管理',
};

/* ================================================================== *
 * 初始化
 * ================================================================== */
migrate();
seedIfEmpty({ withDemo: process.env.SEED_DEMO !== '0' });
const initialAdmin = ensureAdminUser();
const initialPassword = initialAdmin.generated;

/* ================================================================== *
 * 辅助
 * ================================================================== */
function json(res, status, data, extraHeaders = {}) {
  const body = Buffer.from(JSON.stringify(data ?? null), 'utf8');
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(body);
}

function ok(res, data) { json(res, 200, { ok: true, data }); }
function fail(res, status, message, detail) {
  json(res, status, { ok: false, error: message, detail: detail ?? null });
}

/* 客户端真实 IP 见 lib/guard.js —— 那里做了「可信代理」判定。
   ⚠️ 别再在本文件重新实现一遍：老版本在这里无条件采信 X-Forwarded-For，
      攻击者每次换个伪造值就能绕开 auth.js 的按 IP 登录限流。 */

/* ---------------- 认证：哪些路径不需要登录 ---------------- */
const PUBLIC_API = new Set([
  '/health', '/auth/status', '/auth/login', '/auth/register', '/auth/config',
  '/live/manifest.json', '/live/manifest.txt', '/live/devices.csv', '/live/devices.html',
  '/live/workbook.html',   // 用 token 鉴权，供 Excel/WPS 直连
  '/agent',                // GLPI Agent 上报纸质：走 HTTP Basic 令牌，没有会话 Cookie
]);
const PUBLIC_FILES = [/^\/login(\.html)?$/, /^\/register(\.html)?$/, /^\/assets\//, /^\/favicon\.ico$/];

/**
 * GLPI Agent 可能被配成好几种地址，这里全都收：
 *   /api/agent                  我们文档里推荐的
 *   /front/inventory.php        GLPI 官方的默认地址（照抄官方文档的人会填这个）
 *   /inventory.php              老版本文档里的写法
 *   POST /                      只填了主机名的配置（agent 会把盘点发到根路径）
 * 最后一条只在「带了 GLPI-Agent-ID 头」时才认，浏览器请求绝不会被它截走。
 */
const AGENT_PATHS = new Set(['/api/agent', '/api/agent/inventory', '/api/agent/ca', '/front/inventory.php', '/inventory.php']);

function isAgentRequest(p, method, req) {
  if (AGENT_PATHS.has(p)) return true;
  if (method === 'POST' && (p === '/' || p === '/index.php') && req.headers['glpi-agent-id']) return true;
  return false;
}

/** 一次最多收多少 agent 上报数据（未压缩；实测最大的机器带完整软件列表约 1.2MB） */
const MAX_AGENT_BYTES = 16 * 1024 * 1024;

function isPublicPath(p) {
  if (p.startsWith('/api/')) return PUBLIC_API.has(p.slice(4));
  return PUBLIC_FILES.some((re) => re.test(p));
}

/**
 * GLPI Agent 的 HTTP 入口。
 *
 * 和本站其它接口有两点根本不同，所以应答必须自己写：
 *   ① 认证走 HTTP Basic 里的**上报令牌**，不是会话 Cookie（agent 拿不到 Cookie）；
 *   ② 应答体必须是**裸 JSON**，如 {"status":"ok","expiration":24}。
 *      套上我们那个 {ok:true,data:...} 包装的话，agent 读不到 status 就当你没回话。
 *
 * 协议来自 https://github.com/glpi-project/json-protocol（公开文档），
 * 三个动作都要认：CONTACT（打招呼）、INVENTORY（交盘点）、REGISTER（注册）。
 */
async function handleAgent(req, res, { ip, method = 'POST', path: p = '/api/agent' }) {
  const agentId = String(req.headers['glpi-agent-id'] || '').trim();
  const reqId = req.headers['glpi-request-id'];

  /*
   * CA 证书下载（给安装脚本用）。
   * 走 HTTPS + 自签证书的机器，agent 必须知道我们的 CA 才不会拒绝连接；
   * 安装脚本就从这个地址把 ca.pem 拉过去，省得人工拷贝文件。
   * 证书是**公开信息**（本来就发给每一个连上来的客户端），所以这里不需要令牌。
   */
  if (method === 'GET' && /\/ca$/.test(p)) {
    try {
      const pem = fs.readFileSync(path.join(CERT_DIR, 'ca.pem'), 'utf8');
      res.writeHead(200, {
        'Content-Type': 'application/x-pem-file; charset=utf-8',
        'Content-Disposition': 'attachment; filename="itam-ca.pem"',
        'Cache-Control': 'public, max-age=3600',
      });
      res.end(pem);
    } catch {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ status: 'error', message: 'no-ca' }));
    }
    return undefined;
  }

  const respond = (status, body) => {
    const headers = {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
    };
    // 协议规定：服务端要把 agent 的 id 回写（代理场景靠它路由回话）
    if (agentId) headers['GLPI-Agent-ID'] = agentId;
    if (reqId) headers['GLPI-Request-ID'] = reqId;
    res.writeHead(status, headers);
    res.end(JSON.stringify(body));
  };

  /* ---- 令牌 ---- */
  let token = null;
  try {
    const auth = parseBasicAuth(req.headers.authorization);
    token = tokenVerify(auth?.user, auth?.pass, { ip });
  } catch (e) {
    logger.warn(`agent 令牌校验异常：${e.message}`);
  }
  if (!token) {
    logAgentReport({ deviceid: agentId, action: 'auth', ip, result: 'error', message: '令牌无效或未配置' });
    audit({ actor: 'agent', ip, method: req.method, path: '/api/agent', action: 'agent.auth', detail: '令牌无效', status: 401 });
    return respond(401, { status: 'error', message: 'forbidden' });
  }

  /* ---- 收体 ---- */
  let raw;
  try {
    raw = await readBody(req, MAX_AGENT_BYTES);
  } catch (e) {
    logAgentReport({ deviceid: agentId, action: 'read', ip, token_id: token.id, token_name: token.name, result: 'error', message: e.message });
    return respond(e.status || 400, { status: 'error', message: 'bad-request' });
  }

  const { text, format } = decodeAgentBody(raw, req.headers['content-type'], req.headers['content-encoding']);
  const base = { deviceid: agentId, ip, bytes: raw.length, format, token_id: token.id, token_name: token.name };

  /* ---- 老式 PROLOG（GLPI 9 时代 FusionInventory 的 XML 招呼）----
     只认得出「这是招呼」就够：协议明确说，只要看到 GLPI-Agent-ID 头，
     就应该用新的 JSON 协议回答。 */
  const prolog = parseProlog(text);
  if (prolog) {
    logAgentReport({ ...base, deviceid: prolog.deviceid || agentId, action: 'prolog', result: 'ok' });
    return respond(200, contactAnswer());
  }

  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    logAgentReport({ ...base, action: 'parse', result: 'error', message: 'malformed json', message_head: text.slice(0, 80) });
    return respond(400, { status: 'error', message: 'malformed json' });
  }
  if (!payload || typeof payload !== 'object') {
    logAgentReport({ ...base, action: 'parse', result: 'error', message: 'not an object' });
    return respond(400, { status: 'error', message: 'malformed json' });
  }

  const action = String(payload.action || (payload.content ? 'inventory' : 'contact')).toLowerCase();
  const agentName = str(payload.name, 60) || null;
  const agentVersion = str(payload.version, 40) || null;
  const dev = str(payload.deviceid, 120) || agentId || null;
  const versionclient = str(payload?.content?.versionclient, 60) || null;

  /* ---- ① CONTACT：告诉它用哪套协议、多久再来 ---- */
  if (action === 'contact') {
    logAgentReport({ ...base, deviceid: dev, action, result: 'ok', agent_name: agentName, agent_version: agentVersion });
    return respond(200, contactAnswer());
  }

  /* ---- ② REGISTER：agent 注册。我们靠令牌鉴权，认同即可 ---- */
  if (action === 'register') {
    logAgentReport({ ...base, deviceid: dev, action, result: 'ok', agent_name: agentName, agent_version: agentVersion });
    return respond(200, { status: 'registered', expiration: '30d' });
  }

  /* ---- ③ INVENTORY：正式交盘点 ---- */
  if (action === 'inventory') {
    try {
      // 上报日志由 ingest() 自己写（成功那条），这里只管业务
      const r = ingest(payload, {
        agentName: agentName || versionclient, agentVersion, ip,
        bytes: raw.length, format, token_id: token.id, token_name: token.name,
      });
      audit({
        actor: `agent:${token.name}`, ip, method: req.method, path: '/api/agent', action: 'agent.inventory',
        detail: `${r.machine?.hostname || dev} sn=${r.machine?.sn || '-'} ${r.partial ? '部分' : '全量'}(${r.sections.length}段)`,
        status: 200,
      });
      // 认领过的机器：顺势把盘点结果同步进台账（只填空字段 + 刷新 MAC/IP/系统等）
      if (r.machine?.claimed_device_id) {
        try { svc.agentSyncMachine(r.machine.id, 'agent'); } catch (e) { logger.warn(`agent 同步台账失败：${e.message}`); }
      }
      return respond(200, { status: 'ok', expiration: 24 });
    } catch (e) {
      logAgentReport({ ...base, deviceid: dev, action, result: 'error', message: e.message });
      return respond(e.status || 400, { status: 'error', message: e.agentError || 'bad-format' });
    }
  }

  /* ---- 其它动作（netdiscovery / netinventory / deploy / collect ...）----
     我们只做电脑盘点。网络扫描那几种的 content 结构完全不同，
     硬塞进来只会造出一堆空字段的垃圾记录，所以明确回绝：
     agent 会记一条「服务端不支持该任务」，不会反复重试。 */
  logAgentReport({ ...base, deviceid: dev, action, result: 'error', message: 'unsupported action' });
  return respond(200, {
    status: 'ok',
    expiration: 24,
    message: `ITAM 只支持 inventory 任务，已忽略 ${action}`,
  });
}

function isSecureReq(req) {
  // 反代（frp/nginx）通常在 X-Forwarded-Proto 里告知原始协议
  const xf = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  if (xf) return xf === 'https';
  return !!req.socket.encrypted;
}

async function handle(req, res) {
  // 安全响应头先挂上：后面任何一条 return 路径（含 4xx/302）都自动带上
  applySecurityHeaders(res, { secure: isSecureReq(req) });

  /*
   * ⚠️ URL 解析要能失败。
   * 请求行里的 `%E0%A4%A` 这种半截 UTF-8 会让 decodeURIComponent 抛 URIError，
   * 老代码直接冒到最外层 → 回 500「服务器内部错误」并写一条 error 日志。
   * 那是**客户端的错**，不是服务器的错；而且能被人拿来白刷错误日志。
   */
  let url;
  let p;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    p = decodeURIComponent(url.pathname);
  } catch {
    return fail(res, 400, '请求路径格式不合法');
  }
  const q = Object.fromEntries(url.searchParams.entries());
  const method = req.method.toUpperCase();
  const ip = clientIp(req);
  const secure = isSecureReq(req);

  // ---------- 限流（只对 API；静态资源不限，否则页面都刷不开） ----------
  if (p.startsWith('/api/')) {
    try {
      apiLimiter.check(ip);
      if (HEAVY_API.test(p)) heavyLimiter.check(ip);
    } catch (e) {
      if (e.retryAfter) res.setHeader('Retry-After', String(e.retryAfter));
      audit({ actor: 'anonymous', ip, method, path: p, action: 'rate.limit', detail: e.message, status: 429 });
      return fail(res, e.status || 429, e.message);
    }
  }

  // ---------- GLPI Agent 上报（不走会话，走 Basic 令牌，应答格式也不是我们的 {ok,data} 包装） ----------
  if (isAgentRequest(p, method, req)) {
    return handleAgent(req, res, { ip, method, path: p });
  }

  const user = authenticate(req);
  const session = user ? { u: user.username, uid: user.id, role: user.role } : null;

  /* ---------------- 登录门禁 ---------------- */
  // 照片默认要登录才能看；Excel/WPS 拿不到会话 Cookie；
  // 所以导出的表格里照片链接会带上实时数据 token，凭 token 放行。
  const tokenPhoto = p.startsWith('/uploads/') && checkLiveToken(q.token);
  if (!isPublicPath(p) && !tokenPhoto && !user) {
    if (p.startsWith('/api/')) {
      return fail(res, 401, '未登录或登录已过期，请重新登录');
    }
    const next = encodeURIComponent(p + (url.search || ''));
    res.writeHead(302, { Location: `/login?next=${next}` });
    res.end();
    return undefined;
  }

  // ---------- 静态资源 ----------
  if (!p.startsWith('/api/')) {
    return serveStatic(req, res, p);
  }

  // ---------- API ----------
  let route = p.slice(4); // 去掉 /api
  if (route === '') route = '/';

  try {
    const result = await routeApi({
      req, res, method, route, q, ip, url, user, session, secure,
      actor: user?.username || 'anonymous',
    });
    if (result !== undefined && !res.writableEnded) ok(res, result);
  } catch (e) {
    const status = e.status || 500;
    if (e.retryAfter) res.setHeader('Retry-After', String(e.retryAfter));
    /*
     * 503 要**在 5xx 之前**单独分支处理（2026-09-23 修）：
     *   闸门主动丢弃请求（扫码解码忙不过来）时抛的是 503，而 503 >= 500，
     *   会被下面那条通用分支接住 —— 后果有两个，都很难受：
     *     ① 客户端拿到的是「服务器内部错误」而不是「繁忙，请重试」，
     *        运维照着这句去查一个根本不存在的故障；
     *     ② 每丢一个请求就 logger.error 打一整条堆栈 —— 这正是「被灌请求」
     *        的时候，日志会被自己的告警刷爆，把真正的线索冲掉。
     *   丢弃是**预期行为**，记审计（可追溯）但绝不记 error。
     */
    if (status === 503) {
      audit({ actor: user?.username || 'anonymous', ip, method, path: p, action: 'gate.reject', detail: e.reason || e.message, status: 503 });
      return fail(res, 503, e.message || '服务繁忙，请稍后重试', e.detail);
    }
    if (status >= 500) {
      logger.error(`${method} ${p} ->`, e.stack || e.message);
      // 500 只回一句通用话术：堆栈、SQL、文件路径这类内部信息不该出现在响应里
      return fail(res, 500, '服务器内部错误，请稍后重试或联系管理员');
    }
    audit({ actor: user?.username || 'anonymous', ip, method, path: p, action: route, detail: e.message, status });
    fail(res, status, e.message || '请求无法处理', e.detail);
  }
}

/* ================================================================== *
 * 路由表
 * ================================================================== */
async function routeApi(ctx) {
  const { req, res, method, route, q, ip, url, user, secure, actor } = ctx;
  const seg = route.split('/').filter(Boolean);

  /** 权限守卫：无权限直接 403 */
  const require = (perm) => {
    if (!can(user, perm)) {
      throw new HttpError(403, `没有权限执行该操作（需要「${PERM_LABEL[perm] || perm}」权限）`);
    }
  };

  /* ---------------- 认证 ---------------- */
  if (route === '/auth/status') {
    const reg = registerConfig();
    return {
      enabled: true,
      authenticated: !!user,
      username: user ? user.username : null,
      display_name: user ? user.display_name : null,
      role: user ? user.role : null,
      role_label: user ? (ROLES.find((r) => r.id === user.role)?.label || user.role) : null,
      permissions: user ? permissionsOf(user.role) : [],
      must_change: user ? !!user.must_change : false,
      allow_register: reg.allow,
    };
  }

  if (route === '/auth/config') {
    return { allow_register: registerConfig().allow, roles: ROLES };
  }

  if (route === '/auth/login' && method === 'POST') {
    checkLoginRate(ip);
    const body = await readJson(req);
    const name = String(body.username || '').trim();
    const ua = req.headers['user-agent'] || '';
    const fail = (msg, status = 401, userId = null) => {
      recordLoginFail(ip);
      logLogin({ userId, username: name, action: 'login_failed', ip, userAgent: ua, note: msg });
      audit({ actor: name, ip, method, path: url.pathname, action: 'auth.login.fail', detail: msg, status });
      throw new HttpError(status, msg);
    };

    const target = findUserByName(name);
    if (!target) fail('用户名或密码错误');

    checkAccountLocked(target);
    if (!verifyPassword(body.password, target.password_hash)) {
      const r = bumpFailedAttempts(target);
      if (r.locked) {
        logLogin({ userId: target.id, username: name, action: 'lockout', ip, userAgent: ua, note: '连续失败达上限，账号锁定 10 分钟' });
      }
      fail('用户名或密码错误');
    }
    if (target.status === 'pending') fail('账号正在等待管理员审核，暂时无法登录', 403, target.id);
    if (target.status === 'disabled') fail('账号已被停用，请联系管理员', 403, target.id);

    clearLoginFail(ip);
    clearFailedAttempts(target);
    recordLoginMeta(target.id, ip);

    const ttl = body.remember ? SESSION_TTL.remember : SESSION_TTL.default;
    const fresh = { ...target, login_count: (target.login_count || 0) + 1 };
    setSessionCookie(res, signSession(fresh, ttl), ttl, secure);
    logLogin({ userId: target.id, username: target.username, action: 'login', ip, userAgent: ua, note: '登录成功' });
    audit({ actor: target.username, ip, method, path: url.pathname, action: 'auth.login', detail: '登录成功', status: 200 });

    return {
      ok: true,
      username: target.username,
      display_name: target.display_name,
      role: target.role,
      must_change: !!target.must_change,
    };
  }

  if (route === '/auth/register' && method === 'POST') {
    checkLoginRate(ip);
    const body = await readJson(req);
    const r = registerUser({
      username: body.username,
      password: body.password,
      display_name: body.display_name,
      email: body.email,
      phone: body.phone,
    }, ip);
    audit({ actor: r.username, ip, method, path: url.pathname, action: 'auth.register', detail: `状态 ${r.status}`, status: 200 });
    return r;
  }

  if (route === '/auth/logout' && method === 'POST') {
    clearSessionCookie(res, secure);
    logLogin({ userId: user?.id, username: user?.username, action: 'logout', ip, userAgent: req.headers['user-agent'] || '', note: '退出登录' });
    return { ok: true };
  }

  /* ---------------- 个人资料 ---------------- */
  if (route === '/profile' && method === 'GET') {
    return { user: publicUser(user) };
  }
  if (route === '/profile' && (method === 'POST' || method === 'PUT')) {
    const body = await readJson(req);
    const next = changeOwnPassword(user.id, {
      oldPassword: body.old_password,
      newPassword: body.new_password,
      displayName: body.display_name,
    });
    // 改密会提升 token_version，旧 Cookie 立刻失效，这里给当前浏览器重新签名
    // 注意：必须用数据库原始行签名（publicUser 不含 token_version）
    const row = findUserById(next.id);
    const ttl = SESSION_TTL.default;
    setSessionCookie(res, signSession(row, ttl), ttl, secure);
    audit({ actor: actor, ip, method, path: url.pathname, action: 'profile.password', detail: '修改本人密码', status: 200 });
    return { ok: true, user: next };
  }
  if (route === '/profile/logins' && method === 'GET') {
    return { items: loginLogList({ username: user.username, limit: 50 }) };
  }

  /* ---------------- 用户管理（仅管理员） ---------------- */
  if (seg[0] === 'users') {
    if (route === '/users/meta' && method === 'GET') {
      require('user.manage');
      return {
        roles: ROLES,
        statuses: USER_STATUS,
        current_user_id: user.id,
        admin_count: undefined,
      };
    }
    if (route === '/users' && method === 'GET') {
      require('user.manage');
      return userList({
        keyword: q.keyword, role: q.role, status: q.status,
        page: q.page, page_size: q.page_size || q.pageSize,
      });
    }
    if (route === '/users' && method === 'POST') {
      require('user.manage');
      const body = await readJson(req);
      const created = createUser(body, actor);
      audit({ actor, ip, method, path: url.pathname, action: 'user.create', detail: `${created.username} (${created.role})`, status: 200 });
      return created;
    }
    if (route === '/users/login-log' && method === 'GET') {
      require('user.manage');
      return { items: loginLogList({ username: q.username, limit: q.limit }) };
    }
    if (method === 'GET' && seg.length === 2) {
      require('user.manage');
      const u = dbGet('SELECT * FROM app_user WHERE id = ?', [seg[1]]);
      if (!u) throw new HttpError(404, '用户不存在');
      return publicUser(u);
    }
    if ((method === 'PUT' || method === 'PATCH') && seg.length === 2) {
      require('user.manage');
      const body = await readJson(req);
      const updated = updateUser(seg[1], body, actor);
      audit({ actor, ip, method, path: url.pathname, action: 'user.update', detail: updated.username, status: 200 });
      return updated;
    }
    if (method === 'DELETE' && seg.length === 2) {
      require('user.manage');
      const r = deleteUser(seg[1], actor);
      audit({ actor, ip, method, path: url.pathname, action: 'user.delete', detail: seg[1], status: 200 });
      return r;
    }
    if (method === 'POST' && seg.length === 3 && seg[2] === 'reset-password') {
      require('user.manage');
      const r = resetUserPassword(seg[1], actor);
      audit({ actor, ip, method, path: url.pathname, action: 'user.reset_password', detail: r.username, status: 200 });
      return r;
    }
    if (method === 'POST' && seg.length === 3 && seg[2] === 'unlock') {
      require('user.manage');
      const u = dbGet('SELECT * FROM app_user WHERE id = ?', [seg[1]]);
      if (!u) throw new HttpError(404, '用户不存在');
      dbUpdate('app_user', u.id, { failed_attempts: 0, locked_until: null, updated_at: nowISO() });
      audit({ actor, ip, method, path: url.pathname, action: 'user.unlock', detail: u.username, status: 200 });
      return { ok: true };
    }
    if (method === 'POST' && seg.length === 3 && seg[2] === 'approve') {
      require('user.manage');
      return updateUser(seg[1], { status: 'active' }, actor);
    }
  }

  /* ---------------- 系统 ---------------- */
  if (route === '/health') {
    return {
      status: 'ok', version: VERSION, time: nowISO(),
      uptime: Math.round(process.uptime()),
      db: path.join(DATA_DIR, 'itam.db'),
      counts: {
        devices: db.prepare('SELECT COUNT(*) AS c FROM device WHERE deleted_at IS NULL').get().c,
        orgs: db.prepare('SELECT COUNT(*) AS c FROM org_unit').get().c,
        categories: db.prepare('SELECT COUNT(*) AS c FROM device_category').get().c,
      },
    };
  }

  if (route === '/options') { require('device.read'); return svc.deviceOptions(); }

  if (route === '/dashboard' || route === '/stats') { require('device.read'); return svc.dashboard(); }

  if (route === '/audit') { require('audit.read'); return svc.auditList({ limit: q.limit, offset: q.offset }); }

  /* ---------------- 设置 ---------------- */
  if (route === '/settings' && method === 'GET') {
    require('settings.read');
    const s = allSettings();
    delete s.auth;                       // 账号信息（含哈希/密钥）不下发
    // 密钥一律脱敏，避免任何人从前端拿到明文
    const masked = maskSecrets(s);
    return { settings: masked, ocr_status: ocrStatus() };
  }
  if (route === '/settings' && method === 'PUT') {
    require('settings.write');
    const body = await readJson(req);
    const existing = allSettings();
    for (const [k, v] of Object.entries(body || {})) {
      if (k.startsWith('__') || k === 'auth') continue;   // 不允许通过设置接口改账号
      if (v === null) { db.prepare('DELETE FROM app_setting WHERE key=?').run(k); continue; }
      // 前端回传的是掩码（含 ****）时，保留数据库里的真实值
      let next = v;
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const prev = (existing[k] && typeof existing[k] === 'object') ? existing[k] : {};
        next = { ...prev };
        for (const [fk, fv] of Object.entries(v)) {
          if (isMasked(fv)) continue;                      // 掩码不回写
          if (fv === '' && prev[fk] !== undefined) { delete next[fk]; continue; }
          next[fk] = fv;
        }
      }
      setSetting(k, next);
    }
    audit({ actor, ip, method, path: url.pathname, action: 'settings.update', detail: Object.keys(body || {}), status: 200 });
    return { saved: true, settings: maskSecrets(allSettings()) };
  }

  /* ---------------- 组织 ---------------- */
  if (seg[0] === 'orgs') {
    if (method === 'GET' && seg.length === 1) {
      require('device.read');
      return {
        tree: svc.orgList({ tree: true }),
        flat: svc.orgFlatWithPath().map(({ children, ...o }) => o),
        stats: svc.orgDeviceStats(),
        types: svc.ORG_TYPES,
      };
    }
    if (method === 'POST' && seg.length === 1) {
      require('org.write');
      const body = await readJson(req);
      const r = svc.orgCreate(body);
      audit({ actor, ip, method, path: url.pathname, action: 'org.create', detail: r.name, status: 200 });
      return r;
    }
    if (method === 'GET' && seg.length === 2) { require('device.read'); return svc.orgGet(seg[1]); }
    if ((method === 'PUT' || method === 'PATCH') && seg.length === 2) {
      require('org.write');
      const body = await readJson(req);
      const r = svc.orgUpdate(seg[1], body);
      audit({ actor, ip, method, path: url.pathname, action: 'org.update', detail: r.name, status: 200 });
      return r;
    }
    if (method === 'DELETE' && seg.length === 2) {
      require('org.write');
      const r = svc.orgDelete(seg[1], { force: q.force === '1' });
      audit({ actor, ip, method, path: url.pathname, action: 'org.delete', detail: seg[1], status: 200 });
      return r;
    }
  }

  /* ---------------- 设备分类 ---------------- */
  if (seg[0] === 'categories') {
    if (method === 'GET' && seg.length === 1) {
      require('device.read');
      return { items: svc.categoryList(), icons: svc.CATEGORY_ICONS };
    }
    if (method === 'POST' && seg.length === 1) {
      require('category.write');
      const r = svc.categoryCreate(await readJson(req));
      audit({ actor, ip, method, path: url.pathname, action: 'category.create', detail: r.name, status: 200 });
      return r;
    }
    if (method === 'GET' && seg.length === 2) { require('device.read'); return svc.categoryGet(seg[1]); }
    if ((method === 'PUT' || method === 'PATCH') && seg.length === 2) {
      require('category.write');
      const r = svc.categoryUpdate(seg[1], await readJson(req));
      audit({ actor, ip, method, path: url.pathname, action: 'category.update', detail: r.name, status: 200 });
      return r;
    }
    if (method === 'DELETE' && seg.length === 2) {
      require('category.write');
      const r = svc.categoryDelete(seg[1], { force: q.force === '1' });
      audit({ actor, ip, method, path: url.pathname, action: 'category.delete', detail: seg[1], status: 200 });
      return r;
    }
  }

  /* ---------------- 设备 ---------------- */
  if (seg[0] === 'devices') {
    if (method === 'GET' && seg.length === 1) {
      require('device.read');
      return svc.deviceList({
        keyword: q.keyword || q.q,
        category_id: q.category_id,
        org_id: q.org_id,
        status: q.status,
        brand: q.brand,
        supplier: q.supplier,
        sn: q.sn,
        owner: q.owner,
        date_from: q.date_from,
        date_to: q.date_to,
        warranty: q.warranty,
        sort: q.sort,
        order: q.order,
        page: q.page,
        page_size: q.page_size || q.pageSize,
      });
    }
    if (method === 'POST' && seg.length === 1) {
      require('device.write');
      const body = await readJson(req);
      const r = svc.deviceCreate(body, actor);
      audit({ actor, ip, method, path: url.pathname, action: 'device.create', detail: r.asset_no, status: 200 });
      return r;
    }
    if (method === 'POST' && seg[1] === 'bulk') {
      const body = await readJson(req);
      require(body.action === 'delete' ? 'device.delete' : 'device.write');
      // 前端有两种传法：
      //   ids:[...]                        —— 逐台勾选（可现在跨页，所以可能远超一页 20 条）
      //   all_matching:true + query:{...}  —— 勾了「选中当前筛选下的全部 N 台」，只传筛选条件
      // 后者在这里展开成真实 id：前端不必存几万个 uuid，且以「执行那一刻」的筛选结果为准。
      // ⚠️ 展开后的条数校验在 deviceBulk / deviceIdsByQuery 里，别在这里各判一次（口径会分叉）。
      const ids = body.all_matching
        ? svc.deviceIdsByQuery(body.query || {})
        : body.ids;
      const r = svc.deviceBulk(ids, body.action, body.payload || {}, actor);
      audit({ actor, ip, method, path: url.pathname, action: `device.bulk.${body.action}`, detail: `${r.ok} 成功 / ${r.failed} 失败`, status: 200 });
      return r;
    }
    if (method === 'GET' && seg[1] === 'lookup') {
      require('device.read');
      const items = svc.deviceGetBySN(q.sn);
      return { found: items.length > 0, items };
    }
    if (method === 'GET' && seg[1] === 'brands') { require('device.read'); return { items: svc.brandOptions() }; }

    /* ---- 回收站（软删除设备）---- */
    if (route === '/devices/trash' && method === 'GET') {
      require('trash.manage');
      return svc.deletedDeviceList({ keyword: q.keyword, page: q.page, page_size: q.page_size });
    }
    if (route === '/devices/trash/restore' && method === 'POST') {
      require('trash.manage');
      const body = await readJson(req);
      const r = svc.deviceRestoreMany(body.ids || []);
      audit({ actor, ip, method, path: url.pathname, action: 'device.restore', detail: `${r.ok} 成功 / ${r.failed} 失败`, status: 200 });
      return r;
    }
    if (route === '/devices/trash/empty' && method === 'POST') {
      require('trash.manage');
      const body = await readJson(req);
      const r = svc.devicePurgeAll(body?.ids || []);
      audit({ actor, ip, method, path: url.pathname, action: 'device.purge', detail: `${r.purged} 台`, status: 200 });
      return r;
    }
    if (method === 'DELETE' && seg.length === 3 && seg[2] === 'permanent') {
      require('trash.manage');
      const r = svc.devicePurge(seg[1]);
      audit({ actor, ip, method, path: url.pathname, action: 'device.purge', detail: r.asset_no, status: 200 });
      return r;
    }
    if (method === 'GET' && seg.length === 3 && seg[2] === 'history') { require('device.read'); return svc.deviceHistory(seg[1]); }
    if (method === 'GET' && seg.length === 2) { require('device.read'); return svc.deviceGet(seg[1]); }
    if ((method === 'PUT' || method === 'PATCH') && seg.length === 2) {
      require('device.write');
      const body = await readJson(req);
      const r = svc.deviceUpdate(seg[1], body, actor);
      audit({ actor, ip, method, path: url.pathname, action: 'device.update', detail: r.asset_no, status: 200 });
      return r;
    }
    if (method === 'DELETE' && seg.length === 2) {
      require('device.delete');
      const r = svc.deviceDelete(seg[1], actor);
      audit({ actor, ip, method, path: url.pathname, action: 'device.delete', detail: seg[1], status: 200 });
      return r;
    }
    if (method === 'POST' && seg.length === 3 && seg[2] === 'restore') {
      require('trash.manage');
      return svc.deviceRestore(seg[1]);
    }
    if (method === 'POST' && seg.length === 3 && seg[2] === 'verify') {
      require('device.read');
      // 扫码核对：确认 SN 与设备是否一致
      const body = await readJson(req);
      const dev = svc.deviceGet(seg[1]);
      const scanned = String(body.sn || '').replace(/\s+/g, '').toUpperCase();
      const expected = String(dev.sn || '').replace(/\s+/g, '').toUpperCase();
      const match = !!scanned && !!expected && scanned === expected;
      svc.deviceLogAdd(dev.id, 'verify', `扫码核对：${match ? '一致' : `不一致（扫描值 ${body.sn}）`}`, actor);
      return { match, expected: dev.sn, scanned: body.sn, device: dev };
    }
  }

  /* ---------------- OCR 识别 ---------------- */
  if (route === '/ocr' && method === 'POST') {
    require('device.write');
    const ctype = req.headers['content-type'] || '';
    let buffer = null;
    let mime = 'image/jpeg';
    let provider = q.provider;
    let saveImage = q.save !== '0';
    let operator = 'mobile';
    let originalFile = null;   // 原图（手机拍的全分辨率照片）
    let thumbFile = null;      // 缩略图（导出 Excel 时嵌进单元格）
    if (ctype.includes('multipart/form-data')) {
      const raw = await readBody(req, MAX_PHOTO_BYTES);
      const { fields, files } = parseMultipart(raw, ctype);
      const file = files.image || files.photo || Object.values(files)[0];
      if (!file) throw new HttpError(400, '未收到图片文件（字段名应为 image）');
      buffer = file.data;
      mime = file.mime || mime;
      provider = fields.provider || provider;
      operator = fields.operator || operator;
      saveImage = fields.save !== '0';
      originalFile = files.original || null;
      thumbFile = files.thumb || null;
    } else if (ctype.includes('application/json')) {
      const body = await readJson(req, MAX_PHOTO_BYTES);
      const b64 = body.image || body.base64 || '';
      const m = /^data:([^;]+);base64,(.*)$/s.exec(b64);
      if (m) { mime = m[1]; buffer = Buffer.from(m[2], 'base64'); }
      else if (b64) buffer = Buffer.from(b64, 'base64');
      provider = body.provider || provider;
      operator = body.operator || operator;
      const ob = body.original || '';
      const om = /^data:([^;]+);base64,(.*)$/s.exec(ob);
      if (om) originalFile = { data: Buffer.from(om[2], 'base64'), mime: om[1] };
      const tb = body.thumb || '';
      const tm = /^data:([^;]+);base64,(.*)$/s.exec(tb);
      if (tm) thumbFile = { data: Buffer.from(tm[2], 'base64'), mime: tm[1] };
    } else {
      buffer = await readBody(req, MAX_PHOTO_BYTES);
      mime = ctype.split(';')[0] || mime;
    }

    if (!buffer?.length) throw new HttpError(400, '图片数据为空');

    const t0 = Date.now();
    // 闸门：OCR 走第三方网络，慢但不等 CPU；限并发是为了拦住「一个账号开一千个并发」
    const ocrResult = await ocrGate.run(() => recognize({ buffer, mime, provider }));
    const parsed = interpret(ocrResult.lines, ocrResult.text);

    // 三份图一起落盘：压缩图（识别/预览）、原图、缩略图（Excel 嵌入）
    let imagePath = null;
    let originalPath = null;
    let thumbPath = null;
    if (saveImage) {
      const stamp = nowISO().slice(0, 10);
      const photoCfg = svc.photoSettings();
      imagePath = saveUpload(buffer, mime, stamp);
      if (photoCfg.keep_original) {
        // 手机没单独传原图、或原图超出体积上限时，识别用的这张就兼作原图
        const maxOrig = photoCfg.max_original_mb * 1024 * 1024;
        const usable = originalFile?.data?.length && originalFile.data.length <= maxOrig;
        originalPath = usable
          ? saveUpload(originalFile.data, originalFile.mime || 'image/jpeg', stamp)
          : imagePath;
      }
      if (photoCfg.keep_thumb && thumbFile?.data?.length) {
        thumbPath = saveUpload(thumbFile.data, thumbFile.mime || 'image/jpeg', stamp);
      }
    }

    // SN 兜底纠错：拿同品牌已归档的编号规律比一比。
    // 只自动改「前缀前面粘了标签/多余字符」这种一定是脏数据的（改完历史前缀完整出现），
    // 其它（某一位看错了）一律只作为候选给出，让录入的人一点就用，绝不擅自改。
    const neighbors = parsed.sn ? svc.snNeighbors(parsed.sn, parsed.brand) : [];
    const safeFix = neighbors.find((c) => c.sn !== parsed.sn && /去掉前面多出来的字符/.test(c.reason));
    let snFix = null;
    if (safeFix) {
      snFix = { from: parsed.sn, to: safeFix.sn, reason: safeFix.reason };
      parsed.sn = safeFix.sn;
      parsed.sn_confidence = Math.max(Number(parsed.sn_confidence) || 0, 0.95);
    }
    const snCand = neighbors.filter((c) => c.sn !== parsed.sn);

    const deviceGuess = parsed.sn ? svc.deviceGetBySN(parsed.sn) : [];

    audit({ actor: operator, ip, method, path: url.pathname, action: 'ocr.recognize', detail: `${ocrResult.provider} sn=${parsed.sn || '-'}`, status: 200 });

    return {
      ...parsed,
      provider: ocrResult.provider,
      mocked: !!ocrResult.mocked,
      note: ocrResult.note || null,
      elapsed: Date.now() - t0,
      service_elapsed: ocrResult.elapsed,
      image_path: imagePath,
      original_path: originalPath,
      thumb_path: thumbPath,
      sn_fix: snFix,             // 自动纠正过的，界面上要说明
      sn_candidates: snCand,     // 供人工一点替换
      duplicate: deviceGuess.length ? { exists: true, items: deviceGuess } : { exists: false, items: [] },
    };
  }

  /* ---------------- 自动盘点（GLPI Agent）管理端接口 ----------------
     ⚠️ 注意：agent 自己用的上报入口是 handleAgent()，不走这里
        （认证方式和应答格式都不同）。这里只服务管理端页面。 */
  if (route === '/agent/overview') {
    require('device.read');
    // 公网入口只认「外部访问地址」这个设置：没配就不编造，由前端提示去配。
    const publicBase = String(getSetting('system', {})?.link_base_url || '').trim().replace(/\/+$/, '');
    return {
      stats: agentStats(),
      tokens: agentTokenSafeList(),
      endpoint: `${linkBaseOf(req)}/api/agent`,
      endpoint_lan: `http://${localIPs()[0] || '127.0.0.1'}:${PORT}/api/agent`,
      endpoint_public: publicBase ? `${publicBase}/api/agent` : '',
      ca_fingerprint: caFingerprintOf(),
      max_bytes: MAX_AGENT_BYTES,
    };
  }

  if (route === '/agent/tokens' && method === 'GET') {
    require('device.read');
    return agentTokenSafeList();
  }

  if (route === '/agent/tokens' && method === 'POST') {
    require('settings.write');
    const body = await readJson(req);
    const r = tokenCreate({ name: body.name, note: body.note, createdBy: actor });
    audit({ actor, ip, method, path: url.pathname, action: 'agent.token.create', detail: r.name, status: 200 });
    return r;   // ⚠️ 明文令牌只在这里出现这一次，之后库里只有哈希
  }

  if (seg[0] === 'agent' && seg[1] === 'tokens' && seg[2] && method === 'PATCH') {
    require('settings.write');
    const body = await readJson(req);
    tokenSetEnabled(seg[2], body.enabled !== false);
    return { ok: true };
  }

  if (seg[0] === 'agent' && seg[1] === 'tokens' && seg[2] && method === 'DELETE') {
    require('settings.write');
    tokenDelete(seg[2]);
    audit({ actor, ip, method, path: url.pathname, action: 'agent.token.delete', detail: seg[2], status: 200 });
    return { ok: true };
  }

  if (route === '/agent/machines' && method === 'GET') {
    require('device.read');
    return agentMachineList({
      q: str(q.q, 80), only: str(q.only, 20),
      page: Number(q.page) || 1, page_size: Number(q.page_size) || 50,
    });
  }

  if (seg[0] === 'agent' && seg[1] === 'machines' && seg[2]) {
    require('device.read');
    const m = agentMachineGet(seg[2]);
    if (!m) throw new HttpError(404, '自动盘点记录不存在');
    // agentMachineGet 已经带齐 sn / sn_alt / uuid / hostname，正好是认领推荐要用的
    const full = m;

    if (seg[3] === 'reports') return agentMachineReports(m.deviceid, Number(q.limit) || 50);
    if (seg[3] === 'candidates') return agentMatchCandidates(full);
    if (seg[3] === 'claim' && method === 'POST') {
      require('device.write');
      const body = await readJson(req);
      const r = svc.agentClaimMachine(seg[2], { deviceId: body.device_id || null, actor, create: body.create || {} });
      audit({ actor, ip, method, path: url.pathname, action: 'agent.claim', detail: `${m.hostname || m.deviceid} → ${r.device.asset_no}`, status: 200 });
      return r;
    }
    if (seg[3] === 'unclaim' && method === 'POST') {
      require('device.write');
      return svc.agentUnclaimMachine(seg[2], actor);
    }
    if (seg[3] === 'sync' && method === 'POST') {
      require('device.write');
      const body = await readJson(req);
      if (body.auto_sync !== undefined) svc.agentSetSync(seg[2], body.auto_sync !== false);
      return svc.agentSyncMachine(seg[2], actor);
    }
    if (seg[3] === 'delete' && method === 'POST') {
      require('device.delete');
      svc.agentDeleteMachine(seg[2]);
      audit({ actor, ip, method, path: url.pathname, action: 'agent.machine.delete', detail: m.hostname || seg[2], status: 200 });
      return { ok: true };
    }
    if (!seg[3] && method === 'GET') {
      return { machine: full, monitors: agentMonitorList({ machineId: seg[2] }), candidates: agentMatchCandidates(full) };
    }
  }

  if (route === '/agent/monitors' && method === 'GET') {
    require('device.read');
    return agentMonitorList({ only: str(q.only, 20) });
  }

  if (seg[0] === 'agent' && seg[1] === 'monitors' && seg[2]) {
    require('device.read');
    if (seg[3] === 'candidates') return svc.agentMonitorCandidates(seg[2]);
    if (seg[3] === 'claim' && method === 'POST') {
      require('device.write');
      const body = await readJson(req);
      const r = svc.agentClaimMonitor(seg[2], { deviceId: body.device_id || null, actor, create: body.create || {} });
      audit({ actor, ip, method, path: url.pathname, action: 'agent.monitor.claim', detail: r.device.asset_no, status: 200 });
      return r;
    }
    if (seg[3] === 'unclaim' && method === 'POST') {
      require('device.write');
      return svc.agentUnclaimMonitor(seg[2]);
    }
  }

  if (route === '/agent/reports' && method === 'GET') {
    require('device.read');
    return agentReportList({ page: Number(q.page) || 1, page_size: Number(q.page_size) || 50, only_error: q.only === 'error' });
  }

  /* ---------------- 二维码兜底解码 ---------------- */
  /*
   * 为什么要有这个接口：
   *   手机浏览器自带的 BarcodeDetector 在「对着显示器拍」时经常解不出来
   *   （摩尔纹 + 视频压缩 + 浏览器内部缩放），iPhone 的 Safari 更是压根没有这个 API。
   *   前端在浏览器解不出来时，把这一帧转成灰度图发上来，由服务端纯 JS 解码器兜底。
   *
   * 协议：POST /api/scan?w=<宽>&h=<高>，body 是 w*h 字节的灰度像素（0 黑 255 白，行优先）。
   *   故意不用 base64/JSON —— 一帧 900×900 就是 81 万字节，base64 要多背 33% 还多一次编解码。
   *
   * 可选查询参数 `kind=qr|bar`（默认 qr）：决定走哪个解码器。
   *   二维码走 qrdecode.js（定位图案 + 纠错），一维码走 bardecode.js（逐行扫条空）。
   *   两者算法完全不同，**不能互相顶替** —— 拿二维码解码器去解条码只会白跑一遍。
   */
  if (route === '/scan' && method === 'POST') {
    require('device.read');
    const w = Number(q.w);
    const h = Number(q.h);
    if (!Number.isInteger(w) || !Number.isInteger(h) || w < 8 || h < 8 || w > 4000 || h > 4000) {
      throw new HttpError(400, '缺少合法的 w / h 查询参数（灰度图宽高）');
    }
    const kind = q.kind === 'bar' ? 'bar' : 'qr';
    const bytes = w * h;
    /*
     * ⚠️ 占坑必须在**第一个 await 之前**（`await readBody` 的上方）—— 这是整个
     *    闸门能不能生效的唯一天键，2026-09-23 实测两轮才定位到（详见 scanGate 定义处）。
     *    挪到 readBody 下面 = 闸门立即失效（24 个并发全放行）。
     */
    scanGate.acquire();
    try {
      const raw = await readBody(req, Math.min(MAX_SCAN_BYTES, bytes + 1024));
      if (raw.length < bytes) throw new HttpError(400, `灰度数据不足：需要 ${bytes} 字节，收到 ${raw.length}`);
      const gray = new Uint8Array(raw.buffer, raw.byteOffset, bytes);
      const t0 = Date.now();
      let hit = null;
      try {
        // ⚠️ 一维条码的返回形状要和二维码对齐（都带 text），前端只认 `text`。
        //    bardecode 给的是 { text, format, row }，这里补一个 version:null 保持字段一致。
        hit = kind === 'bar' ? decodeBarcode(gray, w, h) : decodeQR(gray, w, h);
      } catch (e) {
        // 解码器再怎么失手也不能把接口打成 500：扫码失败 = 没扫到，让前端提示重扫
        hit = null;
        audit({ actor, ip, method, path: url.pathname, action: 'scan.error', detail: String(e && e.message || e), status: 200 });
      }
      const elapsed = Date.now() - t0;
      audit({ actor, ip, method, path: url.pathname, action: 'scan.decode', detail: `${kind} ${w}x${h} ${hit ? '命中 ' + hit.text : '未命中'} ${elapsed}ms`, status: 200 });
      return {
        ok: !!hit,
        text: hit ? hit.text : null,
        kind,
        format: hit ? (hit.format || 'qr_code') : null,
        version: hit ? (hit.version ?? null) : null,
        elapsed,
      };
    } finally {
      scanGate.release();
    }
  }

  if (route === '/ocr/status') { require('device.read'); return ocrStatus(); }

  if (route === '/ocr/test' && method === 'POST') {
    require('settings.write');
    // 用一张内置的小图测试识别通道是否通畅
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    const r = await recognize({ buffer: png, mime: 'image/png' });
    return { ok: true, provider: r.provider, lines: r.lines.length, mocked: !!r.mocked, note: r.note || null };
  }

  /* ---------------- 图片上传 ---------------- */
  if (route === '/upload' && method === 'POST') {
    require('device.write');
    const ctype = req.headers['content-type'] || '';
    let buffer = null;
    let filename = 'upload.jpg';
    let mime = 'image/jpeg';
    let subdir = str(q.dir || 'misc', 30).replace(/[^a-zA-Z0-9_-]/g, '') || 'misc';

    if (ctype.includes('multipart/form-data')) {
      const raw = await readBody(req, 20 * 1024 * 1024);
      const { fields, files } = parseMultipart(raw, ctype);
      const file = files.file || files.image || Object.values(files)[0];
      if (!file) throw new HttpError(400, '未收到文件');
      buffer = file.data;
      filename = file.filename;
      mime = file.mime;
      if (fields.dir) subdir = str(fields.dir, 30).replace(/[^a-zA-Z0-9_-]/g, '') || subdir;
    } else if (ctype.includes('application/json')) {
      const body = await readJson(req, 20 * 1024 * 1024);
      const m = /^data:([^;]+);base64,(.*)$/s.exec(body.image || '');
      if (!m) throw new HttpError(400, '缺少 image 字段（dataURL）');
      mime = m[1];
      buffer = Buffer.from(m[2], 'base64');
      filename = body.filename || filename;
    } else {
      buffer = await readBody(req, 20 * 1024 * 1024);
      mime = ctype.split(';')[0];
    }
    if (!buffer?.length) throw new HttpError(400, '文件为空');

    const ext = extOf(filename) || (mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : '.jpg');
    const name = `${subdir}/${nowISO().slice(0, 10)}/${uuid()}${ext}`;
    const abs = path.join(UPLOAD_DIR, name);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, buffer);
    return { path: `/uploads/${name}`, size: buffer.length, size_text: formatBytes(buffer.length), mime };
  }
  /* ---------------- 实时数据链接（Excel/WPS 直连自动刷新，用 token 鉴权） ---------------- */
  if (route.startsWith('/live/')) {
    if (!checkLiveToken(q.token)) {
      throw new HttpError(401, '实时数据链接已失效（token 不正确或已被重置），请在「Excel 对接」页重新复制链接');
    }
    const base = baseUrlOf(req);      // 取数地址：Excel 从哪拉数据，尊重用户选的地址
    const photoBase = linkBaseOf(req); // 照片地址：要在别的电脑/手机上点开，本机地址自动替换

    if (route === '/live/manifest.json') return liveManifest(base, {});
    if (route === '/live/manifest.txt') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(liveManifestText(base));
      return undefined;
    }

    // 一个页面里包含所有分类的表格：导入时可一次勾选多张表
    if (route === '/live/workbook.html') {
      const sheetsData = [];
      const livePhotoCols = (rows) => photoColumns({ embed: false, hasOriginal: hasDistinctOriginal(rows) });
      for (const c of svc.categoryList()) {
        const rows = collectRows({ category_id: c.id });
        if (rows.length) {
          const withUrls = attachPhotoUrls(rows, photoBase);
          sheetsData.push({
            name: c.name,
            rows: withUrls,
            columns: [...categoryColumns(c), ...livePhotoCols(withUrls)],
          });
        }
      }
      const uncat = collectRows({ uncategorized: '1' });
      if (uncat.length) {
        const withUrls = attachPhotoUrls(uncat, photoBase);
        sheetsData.push({
          name: '未分类',
          rows: withUrls,
          columns: [...sheetColumnsFor('未分类', uncat), ...livePhotoCols(withUrls)],
        });
      }
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Table-Count': String(sheetsData.length),
      });
      res.end(toHTMLWorkbook(sheetsData));
      return undefined;
    }

    if (route === '/live/devices.csv' || route === '/live/devices.html') {
      const query = {};
      if (q.category_id) query.category_id = q.category_id;
      else if (q.category) {
        const c = svc.categoryList().find((x) => x.name === q.category);
        if (c) query.category_id = c.id;
        else throw new HttpError(404, `没有找到分类「${q.category}」`);
      }
      if (q.uncategorized === '1') query.uncategorized = '1';
      for (const k of ['keyword', 'org_id', 'status', 'brand', 'supplier', 'owner']) {
        if (q[k]) query[k] = q[k];
      }

      const rows = collectRows(query);
      const catObj = q.category_id ? svc.categoryList().find((c) => c.id === q.category_id) : null;
      const catName = catObj
        ? catObj.name
        : (q.uncategorized === '1' ? '未分类' : '全部设备');
      const title = `IT 资产台账 · ${catName}`;
      // 指定分类就只导出该分类的字段（显示器不带 CPU/内存/硬盘…）；
      // 「全部设备」是跨分类的汇总视图，保持完整列，避免实时表列数忽多忽少。
      const withPhotos = attachPhotoUrls(rows, photoBase);
      const columns = [
        ...(catObj
          ? categoryColumns(catObj)
          : (q.uncategorized === '1' ? sheetColumnsFor('未分类', rows) : allColumns())),
        // 照片链接（实时表里只能给链接，图片不能嵌入）
        // 只有真的有独立原图时才出「原图链接」，避免两列一模一样
        ...photoColumns({ embed: false, hasOriginal: hasDistinctOriginal(withPhotos) }),
      ];
      const commonHeaders = {
        'Cache-Control': 'no-store',
        'X-Row-Count': String(rows.length),
        'X-Col-Count': String(columns.length),
        'X-Photo-Count': String(withPhotos.filter((r) => r.photo_url).length),
        'X-Sheet-Name': encodeURIComponent(catName),
      };

      if (route === '/live/devices.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...commonHeaders });
        res.end(toHTMLTable(withPhotos, columns, title));
        return undefined;
      }

      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'inline; filename="itam-devices.csv"',
        ...commonHeaders,
      });
      res.end(toCSV(withPhotos, columns));
      return undefined;
    }

    throw new HttpError(404, `未知的实时接口：${route}`);
  }

  /* ---------------- Excel ---------------- */
  if (seg[0] === 'excel') {
    if (route === '/excel/template' && method === 'GET') {
      require('excel.export');
      const { buffer, filename } = await buildTemplate();
      return download(res, buffer, filename);
    }
    if (route === '/excel/export' && method === 'GET') {
      require('excel.export');
      // ids 用逗号分隔：只导出这几台（「导出所选」）
      const ids = String(q.ids || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 5000);
      const { buffer, filename, count, sheets, photos } = await exportDevices({
        keyword: q.keyword, category_id: q.category_id, org_id: q.org_id,
        status: q.status, brand: q.brand, owner: q.owner,
        supplier: q.supplier,
        date_from: q.date_from, date_to: q.date_to, warranty: q.warranty,
        sort: q.sort, order: q.order,
        ...(ids.length ? { ids } : {}),
      }, {
        withHelp: q.help !== '0',
        split: q.split === '1',
        baseUrl: linkBaseOf(req),
        embedPhotos: q.photos !== '0',   // 默认把设备照片一起导出
      });
      const scope = ids.length ? `所选 ${ids.length} 台` : '全部/筛选结果';
      audit({ actor, ip, method, path: url.pathname, action: 'excel.export', detail: `${scope} → ${count} 行 / ${sheets} 表 / ${photos} 张照片${q.split === '1' ? '（按分类分表）' : ''}`, status: 200 });
      return download(res, buffer, filename);
    }
    if (route === '/excel/preview' && method === 'POST') {
      require('excel.import');
      const ctype = req.headers['content-type'] || '';
      let buffer;
      let sheet;
      if (ctype.includes('multipart/form-data')) {
        const raw = await readBody(req, 30 * 1024 * 1024);
        const { fields, files } = parseMultipart(raw, ctype);
        const f = files.file || files.excel || Object.values(files)[0];
        if (!f) throw new HttpError(400, '未收到 Excel 文件');
        buffer = f.data;
        sheet = fields.sheet || undefined;
      } else {
        buffer = await readBody(req, 30 * 1024 * 1024);
      }
      const r = previewImport(buffer, { sheet, maxRows: Number(q.rows) || 20 });
      return r;
    }
    if (route === '/excel/import' && method === 'POST') {
      require('excel.import');
      const ctype = req.headers['content-type'] || '';
      let buffer;
      let opts = { sheet: q.sheet, dryRun: q.dry === '1', updateExisting: q.update !== '0', createMissing: q.create !== '0', filename: '' };
      if (ctype.includes('multipart/form-data')) {
        const raw = await readBody(req, 30 * 1024 * 1024);
        const { fields, files } = parseMultipart(raw, ctype);
        const f = files.file || files.excel || Object.values(files)[0];
        if (!f) throw new HttpError(400, '未收到 Excel 文件');
        buffer = f.data;
        opts.filename = f.filename;
        if (fields.sheet) opts.sheet = fields.sheet;
        if (fields.dry_run) opts.dryRun = fields.dry_run === '1' || fields.dry_run === 'true';
        if (fields.update_existing !== undefined) opts.updateExisting = !(fields.update_existing === '0' || fields.update_existing === 'false');
        if (fields.create_missing !== undefined) opts.createMissing = !(fields.create_missing === '0' || fields.create_missing === 'false');
        opts.operator = fields.operator || 'excel-import';
      } else {
        buffer = await readBody(req, 30 * 1024 * 1024);
      }
      const r = importDevices(buffer, opts);
      audit({ actor: opts.operator, ip, method, path: url.pathname, action: 'excel.import', detail: `新增 ${r.created} / 更新 ${r.updated} / 失败 ${r.failed}`, status: 200 });
      return r;
    }
    if (route === '/excel/batches' && method === 'GET') { require('excel.import'); return { items: importBatches(q.limit) }; }

    /* ---- 实时数据链接（Excel/WPS 自动刷新用）---- */
    if (route === '/excel/live-links' && method === 'GET') {
      require('excel.export');
      return liveLinksPayload(req);
    }
    if (route === '/excel/live-token/reset' && method === 'POST') {
      require('excel.export');
      resetLiveToken();
      audit({ actor, ip, method, path: url.pathname, action: 'excel.live_token.reset', detail: '重置实时数据 token', status: 200 });
      return liveLinksPayload(req);
    }
  }

  /* ---------------- 二维码 ---------------- */
  if (route === '/qrcode' || seg[0] === 'qrcode') {
    require('device.read');
    const text = q.text || (seg[1] === 'device' ? `${baseUrlOf(req)}/m/#/device/${seg[2]}` : '');
    if (!text) throw new HttpError(400, '缺少 text 参数');
    // ⚠️ ec / quiet / dark / light 全都来自 query，**绝不能**原样拼进 SVG：
    //    这个响应是顶层 image/svg+xml 文档，注入的 <script> 会以本应用的源执行。
    //    颜色与纠错等级在 qrcode.js 里已做白名单（产出层兜底），这里再做一次取值收窄。
    const ec = ['L', 'M', 'Q', 'H'].includes(String(q.ec || '').toUpperCase()) ? String(q.ec).toUpperCase() : 'M';
    const svg = qrcodeSvg(text, {
      ecLevel: ec,
      quiet: Number(q.quiet ?? 3),
      dark: q.dark || '#111827',
      light: q.light || '#ffffff',
    });
    if (q.raw === '1') return { svg, text };
    // 默认直接返回 SVG 图片，前端可用 <img src="/api/qrcode?text=..."> 展示。
    // CSP 换成 SVG 专用（default-src 'none' + sandbox）：即便哪天转义又出洞，脚本也是死的。
    applySecurityHeaders(res, { secure, svg: true });
    res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
    res.end(svg);
    return undefined;
  }

  /* ---------------- 导出文件下载 ---------------- */
  if (seg[0] === 'files' && method === 'GET') {
    require('device.read');
    const rel = seg.slice(1).join('/');
    const abs = path.normalize(path.join(EXPORT_DIR, rel));
    if (!isInsideDir(EXPORT_DIR, abs) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
      throw new HttpError(404, '文件不存在');
    }
    const buf = fs.readFileSync(abs);
    return download(res, buf, path.basename(abs));
  }

  /* ---------------- 备份 ---------------- */
  if (route === '/backup' && method === 'POST') {
    require('settings.write');
    const name = `itam-backup-${nowISO().replace(/[:.]/g, '-')}.db`;
    const abs = path.join(BACKUP_DIR, name);
    db.exec(`VACUUM INTO '${abs.replace(/'/g, "''")}'`);
    return { file: name, path: abs, size_text: formatBytes(fs.statSync(abs).size) };
  }

  throw new HttpError(404, `接口不存在：${method} ${route}`);
}

/* ================================================================== *
 * 静态文件
 * ================================================================== */
function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 Not Found');
  return undefined;
}
function forbidden(res) {
  res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Forbidden');
  return undefined;
}

function serveStatic(req, res, pathname) {
  let rel = pathname;
  if (rel === '/' || rel === '') rel = '/index.html';
  // 移动端独立入口
  if (rel === '/m') rel = '/m/index.html';
  // 登录页 / 注册页 / 使用手册
  if (rel === '/login') rel = '/login.html';
  if (rel === '/register') rel = '/register.html';
  if (rel === '/manual') rel = '/manual.html';

  // /uploads -> data/uploads。它和 public 是**两棵独立的树**，各自判各自的根，
  // 别拿 public 的包含判定去覆盖 uploads（老代码就是这么混着写的）。
  if (rel === '/uploads' || rel.startsWith('/uploads/')) {
    const abs = path.normalize(path.join(UPLOAD_DIR, rel.slice('/uploads'.length)));
    if (!isInsideDir(UPLOAD_DIR, abs)) return forbidden(res);
    return serveFile(req, res, abs);
  }

  const abs = path.normalize(path.join(PUBLIC_DIR, rel));
  // ⚠️ 不能用 `abs.startsWith(PUBLIC_DIR)`：同级的 `public-xxx` 也能通过这个前缀判断。
  //    isInsideDir 走 path.relative，跨目录会带 `..` 前缀，一并挡掉。
  if (!isInsideDir(PUBLIC_DIR, abs)) return forbidden(res);

  // SPA 回退：管理端
  if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
    const isMobile = rel.startsWith('/m');
    const fallback = path.join(PUBLIC_DIR, isMobile ? 'm/index.html' : 'index.html');
    if (fs.existsSync(fallback)) return serveFile(req, res, fallback);
    return notFound(res);
  }
  return serveFile(req, res, abs);
}

function serveFile(req, res, abs) {
  if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) return notFound(res);
  const stat = fs.statSync(abs);
  const etag = `W/"${stat.size}-${stat.mtimeMs}"`;
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304).end();
    return undefined;
  }
  const isUpload = abs.startsWith(UPLOAD_DIR);
  res.writeHead(200, {
    'Content-Type': mimeOf(path.extname(abs)),
    'Content-Length': stat.size,
    ETag: etag,
    /*
     * 上传的图片是**登录后才能看**的内容，只能进浏览器私有缓存。
     * 原来写的是 `public, max-age=86400` —— 那样公司里的共享缓存 / 反向代理
     * 可以把别人的证件照缓存下来再发给另一个不相关的人。
     */
    'Cache-Control': isUpload ? 'private, max-age=86400' : 'no-cache',
  });
  fs.createReadStream(abs).pipe(res);
  return undefined;
}

function download(res, buffer, filename) {
  res.writeHead(200, {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Length': buffer.length,
    'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    'Cache-Control': 'no-store',
  });
  res.end(buffer);
  return undefined;
}

/* ================================================================== *
 * 启动
 * ================================================================== */
/**
 * 上报令牌列表 —— ⚠️ 绝不返回 token_hash。
 * 界面上只需要「是哪一个」（prefix）和「什么时候用过」，哈希给了也没用、泄了更糟。
 */
function agentTokenSafeList() {
  return tokenList().map((t) => ({ ...t, token_hash: undefined }));
}

/** CA 证书指纹：给 agent 配 ssl-fingerprint 用（比 no-ssl-check 安全） */
function caFingerprintOf() {
  try {
    const pem = fs.readFileSync(path.join(CERT_DIR, 'ca.pem'), 'utf8');
    return new crypto.X509Certificate(pem).fingerprint256;
  } catch { return null; }
}

function baseUrlOf(req) {
  const proto = req.socket.encrypted ? 'https' : 'http';
  // 用客户端实际访问的 Host（含端口），这样经隧道/反代访问时链接也是对的
  const host = req.headers.host || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

/** 127.0.0.1 / localhost 这类只在本机有效的地址 */
function isLoopbackBase(base) {
  try {
    const h = new URL(base).hostname.toLowerCase();
    return h === '127.0.0.1' || h === 'localhost' || h === '::1' || h === '0.0.0.0' || h === '[::1]';
  } catch { return false; }
}

/**
 * 写进 Excel 的**照片链接**该用哪个地址。
 *
 * 为什么不能直接用请求里的 Host：如果管理员是在服务器本机用 127.0.0.1 打开后台，
 * 导出的链接就是 http://127.0.0.1:8080/...，换任何一台电脑点开都是「无法访问」。
 * 所以：
 *   1) 系统设置里手填了「外部访问地址」→ 用它（想用公网域名就填公网地址）
 *   2) 请求来自本机地址 → 自动换成局域网 IP
 *   3) 其它情况 → 用请求本身的地址
 */
function linkBaseOf(req) {
  const configured = String(getSetting('system', {})?.link_base_url || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  const base = baseUrlOf(req);
  if (!isLoopbackBase(base)) return base;
  const ip = localIPs()[0];
  return ip ? `http://${ip}:${PORT}` : base;
}

/**
 * 实时数据链接：同时给出「本机 / 局域网 / 当前地址」三种来源。
 * Excel/WPS 在电脑上取数时用局域网或本机地址最快，也避开自签证书与隧道认证页。
 */
function liveLinksPayload(req) {
  const token = liveToken();
  const bases = [];
  const seen = new Set();
  const add = (label, base, hint) => {
    if (!base || seen.has(base)) return;
    seen.add(base);
    bases.push({ label, base, hint: hint || '', ...liveManifest(base, {}) });
  };

  add('本机（Excel 和服务器在同一台电脑，最快）', `http://127.0.0.1:${PORT}`);
  for (const ip of localIPs()) add(`局域网（${ip}）`, `http://${ip}:${PORT}`, '同一 WiFi / 同一网段的电脑用这个');
  add('当前访问地址', baseUrlOf(req), '若当前是公网 https 地址，Excel/WPS 可能因自签证书或隧道认证页取不到数据');

  // 顶层再放一份「第一个地址」的数据，保持旧调用方式（all / sheets / manifest）依然可用
  return { token, bases, current_base: baseUrlOf(req), ...(bases[0] || {}) };
}

function localIPs() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal) out.push(i.address);
    }
  }
  return out;
}

/**
 * 收尾处理：安全头已在 handle() 里统一挂好，这里只兜住「handle 自己抛了」的极端情况。
 * ⚠️ 兜底也不回 e.message：那是最外层的意外，最容易带出路径/堆栈。
 */
function onRequest(req, res) {
  handle(req, res).catch((e) => {
    logger.error('未捕获异常', e);
    if (!res.writableEnded) fail(res, 500, '服务器内部错误，请稍后重试或联系管理员');
  });
}

/**
 * 抗慢速攻击（slowloris）的硬上限。
 *
 * 默认值在这种「挂着公网隧道」的部署里太宽松：攻击者开几百个连接、每次只发几个字节，
 * 就能把连接数占满。这里把「收完请求头」「收完整个请求」都压到分钟级以内，
 * 并把单连接的最大请求头数量限死（默认 2000 个，够被拿来放大内存）。
 *
 * ⚠️ maxHeaderSize 不在这里：它是 http.createServer 的**构造参数**，
 *    建完再赋值只是往对象上挂了个没人读的属性（实测默认值是 undefined）。
 *    Node 自己给的默认 16 KB 就合适，不折腾。
 */
const NET_HARDENING = {
  headersTimeout: 30_000,      // 30s 内没发完请求头就断开
  requestTimeout: 10 * 60_000, // 单请求最长 10 分钟（Excel 大导出要留够时间）
  keepAliveTimeout: 15_000,
  maxHeadersCount: 100,
};
function hardenServer(s, label) {
  Object.assign(s, NET_HARDENING);
  s.on('clientError', (err, socket) => {
    // 畸形请求（含裸 socket 打的乱码）不应该让 Node 打一整段堆栈，安静拒掉即可
    logger.warn(`${label} 收到畸形请求：${err?.code || err?.message || 'unknown'}`);
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  });
  return s;
}

const server = hardenServer(http.createServer(onRequest), 'HTTP');

server.listen(PORT, HOST, () => {
  const ips = localIPs();
  logger.ok(`IT 资产管理服务已启动`);
  logger.info(`管理端  http://localhost:${PORT}/`);
  for (const ip of ips) logger.info(`局域网   http://${ip}:${PORT}/`);
  logger.info(`移动端  http://localhost:${PORT}/m  （手机需用 HTTPS 才能调用相机）`);

  if (initialPassword) {
    const line = '='.repeat(64);
    console.log(`\n\x1b[33m${line}`);
    console.log(`  ⚠️  已创建管理员账号，请立刻记下并登录后修改密码`);
    console.log(`      用户名 ${initialAdmin.user.username}`);
    console.log(`      初始密码: \x1b[1m${initialPassword}\x1b[0m\x1b[33m`);
    console.log(`      （也已写入 data/admin-password.txt，改密后会自动删除）`);
    console.log(`${line}\x1b[0m\n`);
  } else {
    logger.info(`管理员账号 ${initialAdmin.user?.username || 'admin'}（密码为上次设置的值）`);
  }
});

/* HTTPS（手机调用摄像头必需） */
let httpsServer = null;
const certFile = process.env.SSL_CERT || path.join(CERT_DIR, 'cert.pem');
const keyFile = process.env.SSL_KEY || path.join(CERT_DIR, 'key.pem');
try {
  if (fs.existsSync(certFile)) {
    const opts = { cert: fs.readFileSync(certFile) };
    if (fs.existsSync(keyFile)) opts.key = fs.readFileSync(keyFile);
    httpsServer = hardenServer(https.createServer(opts, onRequest), 'HTTPS');
    httpsServer.listen(HTTPS_PORT, HOST, () => {
      logger.ok(`HTTPS 已启用（手机相机可用）`);
      for (const ip of localIPs()) logger.info(`手机访问 https://${ip}:${HTTPS_PORT}/m`);
    });
  } else {
    logger.warn(`未找到证书，HTTPS 未启用。运行 "npm run cert" 生成自签证书后，手机才能调用摄像头。`);
  }
} catch (e) {
  logger.warn('HTTPS 启动失败', e.message);
}

/* 优雅退出 */
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    logger.info('正在关闭服务…');
    server.close();
    httpsServer?.close();
    try { db.close(); } catch { /* ignore */ }
    process.exit(0);
  });
}

process.on('uncaughtException', (e) => logger.error('uncaughtException', e));
process.on('unhandledRejection', (e) => logger.error('unhandledRejection', e?.message || e));

export { server, httpsServer };
