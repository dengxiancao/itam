/**
 * 安全回归套件
 *
 * 覆盖 2026-09-23 实测确认并修复的 7 个问题，外加护栏模块的纯函数单测。
 * 每一项都对应一个**具体攻击手法**，不是「有没有写某行代码」的形式检查。
 *
 * 设计原则（与 tests/all.js 一致）：
 *   · **自起隔离实例**：临时库（全新，不读真实库）+ 独立端口 8096，
 *     跑完就关、临时库直接删。绝不碰 8080/8443。
 *   · 限流类断言会**故意把限流打满**，所以必须有自己的实例 ——
 *     打满共享实例会让后面所有套件集体 429。
 *
 * 用法：
 *   node tests/security.js                      # 自起隔离实例（端口 8096），跑全部
 *   SEC_PORT=9096 node tests/security.js        # 换个端口
 *
 * 不需要任何环境变量；BASE 会被忽略（见 Part B 的说明）。
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const NODE = process.execPath;

const OWN_PORT = Number(process.env.SEC_PORT || 8096);

/* ---------------- 断言harness ---------------- */
let pass = 0;
const failures = [];
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  \x1b[32m✔\x1b[0m ${name}${detail ? '  \x1b[2m' + detail + '\x1b[0m' : ''}`); }
  else { failures.push(name); console.log(`  \x1b[31m✘\x1b[0m ${name}${detail ? '\n      \x1b[2m' + detail + '\x1b[0m' : ''}`); }
};
const head = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

/* ==================================================================== *
 * Part A —— 护栏模块纯函数（不需要服务，无副作用）
 * ==================================================================== */
const guard = await import(pathToUrl(path.join(ROOT, 'server/lib/guard.js')));
const { clientIp, isInsideDir, safeColor, createRateLimiter, createGate } = guard;
const qrcode = await import(pathToUrl(path.join(ROOT, 'server/lib/qrcode.js')));
const httpUtil = await import(pathToUrl(path.join(ROOT, 'server/lib/http-util.js')));

function pathToUrl(p) { return new URL('file:///' + p.replace(/\\/g, '/')); }

head('A1 clientIp —— 不可信直连方不得采信 X-Forwarded-For（修 P6）');
{
  const mk = (peer, xff, xreal) => ({
    socket: { remoteAddress: peer },
    headers: { 'x-forwarded-for': xff, 'x-real-ip': xreal },
  });

  // 公网直连 + 伪造 XFF → 必须返回**对端地址**，而不是伪造值
  const forged = clientIp(mk('203.0.113.9', '198.51.100.77'));
  ok('公网直连时忽略伪造的 XFF', forged === '203.0.113.9', `得到 ${forged}`);

  // 同一个攻击者轮换 XFF：每次都必须落回同一个地址，否则限流桶会被轮换打散
  const rotated = new Set();
  for (let i = 0; i < 50; i++) rotated.add(clientIp(mk('203.0.113.9', `198.51.100.${i}`)));
  ok('轮换 50 个伪造 XFF 后仍归一到同一个 IP（限流桶不会被打散）',
    rotated.size === 1 && rotated.has('203.0.113.9'), `得到 ${rotated.size} 个不同值：${[...rotated].slice(0, 5).join(',')}`);

  // 本机隧道（frp/nginx 同机）→ 对端是回环，可信，采信 XFF
  const viaTunnel = clientIp(mk('::ffff:127.0.0.1', '203.0.113.7'));
  ok('本机反代（对端 127.0.0.1）时采信 XFF 里的真实客户端', viaTunnel === '203.0.113.7', `得到 ${viaTunnel}`);

  // 追加式代理链：左边是攻击者伪造的，最右边才是真实客户端 → 必须取右边那个
  const appended = clientIp(mk('::ffff:127.0.0.1', '198.51.100.9, 203.0.113.50'));
  ok('代理链取「最右边不可信」的地址，而不是最左边伪造的那个', appended === '203.0.113.50', `得到 ${appended}`);

  // 没有 XFF 时用 X-Real-IP 兜底
  const viaReal = clientIp(mk('::ffff:127.0.0.1', undefined, '203.0.113.8'));
  ok('可信对端且无 XFF 时回退到 X-Real-IP', viaReal === '203.0.113.8', `得到 ${viaReal}`);

  // ::ffff: 前缀与端口都要剥掉，否则同一个 IP 会分裂成多个限流桶
  const normalized = clientIp(mk('::ffff:203.0.113.9', undefined));
  ok('IPv4-mapped 地址归一化（::ffff: 前缀剥掉）', normalized === '203.0.113.9', `得到 ${normalized}`);

  // 收紧白名单后，私网对端也不再被信任
  process.env.ITAM_TRUSTED_PROXIES = '10.9.9.9';
  const strict = clientIp(mk('192.168.1.20', '198.51.100.1'));
  delete process.env.ITAM_TRUSTED_PROXIES;
  ok('设了 ITAM_TRUSTED_PROXIES 后私网对端不再被信任', strict === '192.168.1.20', `得到 ${strict}`);
}

head('A2 isInsideDir —— 同名前缀的兄弟目录必须挡住（硬化 P2）');
{
  const root = path.resolve('C:/app/public');
  ok('正常子文件放行', isInsideDir(root, path.resolve(root, 'assets/admin.js')) === true);
  ok('目录本身不算「在里面」', isInsideDir(root, root) === false);
  // 这就是 startsWith 判断漏掉的那一类：public-evil 也以 public 开头
  ok('兄弟目录 public-evil 被拒（startsWith 判断会漏掉这个）',
    isInsideDir(root, path.resolve('C:/app/public-evil/x.js')) === false);
  ok('上层目录被拒', isInsideDir(root, path.resolve('C:/app/other/x.js')) === false);
  ok('再上一层被拒', isInsideDir(root, path.resolve('C:/x.js')) === false);
}

head('A3 safeColor + qrcodeSvg —— 颜色参数不得成为 SVG 注入口（修 P1）');
{
  const evil = '" /><script>alert(document.domain)</script><rect x="';
  ok('safeColor 把注入串换成默认值', safeColor(evil, '#111827') === '#111827', JSON.stringify(safeColor(evil, '#111827')).slice(0, 40));
  ok('safeColor 放行合法 hex', safeColor('#ff0000', '#111827') === '#ff0000');
  ok('safeColor 放行 rgb()', safeColor('rgb(1, 2, 3)', '#000') === 'rgb(1, 2, 3)');
  ok('safeColor 拒掉 javascript: 伪协议', safeColor('javascript:alert(1)', '#111827') === '#111827');

  const svg = qrcode.qrcodeSvg('hello', { dark: evil, light: evil });
  ok('qrcodeSvg 产出的 SVG 里没有 <script', !/<script/i.test(svg));
  ok('qrcodeSvg 产出的 SVG 里没有 alert', !/alert/.test(svg));
  ok('qrcodeSvg 产出的 fill 全是合法颜色',
    [...svg.matchAll(/fill="([^"]*)"/g)].every((m) => safeColor(m[1], null) !== null),
    [...svg.matchAll(/fill="([^"]*)"/g)].map((m) => m[1]).join(' | '));
  ok('合法颜色不被改写', /fill="#ff0000"/.test(qrcode.qrcodeSvg('hi', { dark: '#ff0000' })));

  // 非法纠错等级以前会 EC_TABLE[x][v] 抛 TypeError → 500
  let ecErr = '';
  try { qrcode.qrcodeEncode('hi', 'zzz'); qrcode.qrcodeEncode('hi', '__proto__'); } catch (e) { ecErr = e.message; }
  ok('非法 ecLevel 不再抛异常（原来是 500）', ecErr === '', ecErr);
}

head('A4 parseMultipart —— 边界炸弹不得拖成 O(n²)（修 P7）');
{
  // ① 正常表单必须还能解出来（别为了防炸把功能改坏）
  const { boundary, body } = httpUtil.buildMultipart(
    { provider: 'mock', note: '正常字段' },
    { image: { filename: 'a.jpg', mime: 'image/jpeg', data: Buffer.from([1, 2, 3, 4, 5]) } },
  );
  const parsed = httpUtil.parseMultipart(body, `multipart/form-data; boundary=${boundary}`);
  ok('正常表单：字段解析正确', parsed.fields.provider === 'mock' && parsed.fields.note === '正常字段', JSON.stringify(parsed.fields));
  ok('正常表单：文件解析正确',
    parsed.files.image?.filename === 'a.jpg' && parsed.files.image.data.length === 5,
    `filename=${parsed.files.image?.filename} len=${parsed.files.image?.data?.length}`);

  /*
   * ② 分段数上限：几万个边界的请求直接被拒。
   *
   * 注意这条只证明了**外层**防线（计数上限）。它会在跑到任何一次 indexOf 之前就抛错，
   * 所以**测不到**内层那个「只在 [start,end) 里搜头结束」的修复 ——
   * 变异测试（__patch/mutate-security.mjs M4）就是这么发现这个覆盖缺口的。
   * 内层的覆盖在 ③。
   */
  const bombBoundary = '----bomb' + Date.now();
  const unit = Buffer.from(`--${bombBoundary}\r\nZ`, 'utf8');
  const repeats = 40000;
  const bomb = Buffer.concat(Array.from({ length: repeats }, () => unit));
  const t0 = Date.now();
  let threw = null;
  try { httpUtil.parseMultipart(bomb, `multipart/form-data; boundary=${bombBoundary}`); } catch (e) { threw = e; }
  const ms = Date.now() - t0;
  ok('超多分段的请求被快速拒绝（<1500ms）', ms < 1500, `${(bomb.length / 1024).toFixed(0)}KB / ${repeats} 段 → ${ms}ms（修复前实测 16321ms）`);
  ok('超多分段返回 400 而不是 500', threw && threw.status === 400, `status=${threw?.status} msg=${threw?.message}`);

  /*
   * ③ 内层覆盖：**同样总字节数**，只把「分段数」从 8 提到 64。
   *
   * 为什么这样设计：段数上限挡住了极端构造，那就用一个合法的段数（64 正好是上限）
   * 把总长度做大。此时
   *   · 修复后：每段只在本段内搜索 → 总扫描量 ≈ 请求体大小 → 段数几乎不影响耗时
   *   · 修复前：每段都从自己开头扫到**缓冲区末尾** → 总扫描量 ≈ 段数 × 体大小
   * 所以「段数×8 而总字节不变」这件事，在修复前后差一个 8 倍量级。
   * 断言用**比值**而不是绝对毫秒：比值对机器快慢不敏感，跑在慢机器上也不会假红。
   */
  const mkBody = (parts, segBytes) => {
    const chunk = Buffer.concat([Buffer.from(`--${bombBoundary}\r\n`, 'utf8'), Buffer.alloc(segBytes, 0x41)]);
    return Buffer.concat([...Array.from({ length: parts }, () => chunk), Buffer.from(`--${bombBoundary}--\r\n`, 'utf8')]);
  };
  const TOTAL = 64 * 1024 * 1024;
  const few = mkBody(8, TOTAL / 8);
  const many = mkBody(64, TOTAL / 64);
  const timeIt = (b) => { const t = Date.now(); try { httpUtil.parseMultipart(b, `multipart/form-data; boundary=${bombBoundary}`); } catch { /* 无头字段，会被跳过 */ } return Date.now() - t; };
  timeIt(few);                       // 预热，别把首次的 JIT/分配算进去
  const tFew = Math.min(...Array.from({ length: 3 }, () => timeIt(few)));
  const tMany = Math.min(...Array.from({ length: 3 }, () => timeIt(many)));
  ok('段数×8（总字节不变）不会让耗时同比涨上去 —— 证明搜索被限制在段内',
    tMany < Math.max(tFew * 3, 80),
    `8 段 ${tFew}ms → 64 段 ${tMany}ms（同 ${(TOTAL / 1024 / 1024).toFixed(0)}MB；修复前应约 ${Math.round(tFew * 8)}ms+）`);
  ok('64 段 / 64MB 的合法请求能在 1200ms 内解完', tMany < 1200, `${tMany}ms`);
}

head('A5 限流器与并发闸门');
{
  const rl = createRateLimiter({ limit: 3, windowMs: 60_000, name: '单测' });
  let codes = [];
  for (let i = 0; i < 5; i++) { try { rl.check('k'); codes.push(200); } catch (e) { codes.push(e.status); } }
  ok('超过阈值抛 429', codes.join(',') === '200,200,200,429,429', codes.join(','));
  ok('429 带 Retry-After 秒数',
    (() => { try { rl.check('k'); return false; } catch (e) { return Number.isInteger(e.retryAfter) && e.retryAfter > 0; } })());
  rl.dispose();

  // 内存护栏：key 是攻击者可控的字符串，必须有条数上限
  const rl2 = createRateLimiter({ limit: 1000, windowMs: 60_000, maxKeys: 50, name: '内存护栏' });
  for (let i = 0; i < 5000; i++) rl2.check('ip-' + i);
  ok('限流表的 key 数量有上限（防被洪水撑爆内存）', rl2.stats().keys <= 50, `keys=${rl2.stats().keys}`);
  rl2.dispose();

  const gate = createGate({ max: 2, name: '单测闸门' });
  let release;
  const blocker = new Promise((r) => { release = r; });
  const running = [gate.run(() => blocker), gate.run(() => blocker)];
  let third = null;
  try { await gate.run(() => blocker); } catch (e) { third = e; }
  release();
  await Promise.all(running);
  ok('超过并发上限抛 503（而不是排队把事件循环堵住）', third?.status === 503, `status=${third?.status} msg=${third?.message}`);
  ok('放行后并发计数归零', gate.stats().running === 0, `running=${gate.stats().running}`);
}

/* ==================================================================== *
 * Part B —— HTTP 层
 *
 * 一律**自起实例**，不复用 all.js/run-isolated 起的那个共享实例。
 * 原因很实在：本套件为了验证限流会**故意把限流打满**（40 次/分钟），
 * 打在共享实例上会把后面所有套件的配额一起吃光，变成一片假红。
 * 独立实例只是多花两三秒启动，换掉一整类互相干扰。
 * ==================================================================== */
const ADMIN_PASS = 'SecProbe!' + Math.floor(Math.random() * 1e6);
const started = [];

/**
 * 起一个隔离实例（全新临时库 + 独立端口 + 固定测试口令）。
 * @returns {{base, port, stop, jget, login}} stop 会关进程并删掉临时库
 */
async function startInstance(port, extraEnv = {}) {
  // 只读别碰真实实例
  if ([80, 443, 8080, 8443].includes(port)) throw new Error(`端口 ${port} 是真实实例的端口，拒绝启动`);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `itam-sec-${port}-`));
  const logFd = fs.openSync(path.join(dir, 'server.log'), 'a');
  const proc = spawn(NODE, [path.join(ROOT, 'server/index.js')], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      HTTPS_PORT: String(port + 1000),
      HOST: '0.0.0.0',
      // 全新临时库：不读真实库、不写真实库（migrate + seed 会自己建）
      ITAM_DB: path.join(dir, 'itam.db'),
      ITAM_ADMIN_USER: 'admin',
      ITAM_ADMIN_PASSWORD: ADMIN_PASS,
      // 把限流阈值压低，好在几秒内把 429 打出来（生产默认是 600/120）
      ITAM_RATE_API: '40',
      ITAM_RATE_HEAVY: '12',
      ...extraEnv,
    },
    stdio: ['ignore', logFd, logFd],
    windowsHide: true,
  });

  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 30_000;
  let up = false;
  while (Date.now() < deadline) {
    try { const r = await fetch(`${base}/api/health`); if ((await r.json())?.ok) { up = true; break; } } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!up) {
    console.log(`✘ 端口 ${port} 的隔离实例未就绪（被占用？），日志尾部：`);
    try { console.log(fs.readFileSync(path.join(dir, 'server.log'), 'utf8').slice(-1500)); } catch { /* ignore */ }
    throw new Error(`实例 ${port} 启动失败`);
  }

  const stop = () => {
    if (proc.exitCode == null) {
      try { spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); }
      catch { try { proc.kill('SIGKILL'); } catch { /* ignore */ } }
    }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  };

  const jget = async (p, cookie = '', init = {}) => {
    const r = await fetch(base + p, { ...init, headers: { ...(init.headers || {}), ...(cookie ? { cookie } : {}) } });
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch { /* 非 JSON */ }
    return { status: r.status, headers: r.headers, text, json };
  };

  const login = async () => {
    const r = await fetch(`${base}/api/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: ADMIN_PASS }),
    });
    const sc = typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : [];
    const cookie = (sc.length ? sc.join('; ') : (r.headers.get('set-cookie') || '')).split(';')[0];
    return { status: r.status, cookie };
  };

  const inst = { base, port, dir, proc, stop, jget, login };
  started.push(inst);
  return inst;
}

const stopAll = () => { for (const i of started) { try { i.stop(); } catch { /* ignore */ } } };

head(`Part B 启动隔离实例（端口 ${OWN_PORT}）`);
const own = await startInstance(OWN_PORT);
const BASE = own.base;
let cookie = '';
const jget = (p, init = {}) => own.jget(p, cookie, init);

/** 裸 socket 请求：绕过 fetch/URL 的路径规范化，才是攻击者的真实手法 */
function rawGet(rawPath, cookieValue = '') {
  return new Promise((resolve) => {
    const s = net.connect(Number(new URL(BASE).port), new URL(BASE).hostname, () => {
      s.write(`GET ${rawPath} HTTP/1.1\r\nHost: ${new URL(BASE).host}\r\nConnection: close\r\n`
        + (cookieValue ? `Cookie: ${cookieValue}\r\n` : '') + '\r\n');
    });
    let buf = '';
    s.on('data', (c) => { buf += c.toString('latin1'); });
    s.on('close', () => { const m = /^HTTP\/1\.\d (\d+)/.exec(buf); resolve({ status: m ? Number(m[1]) : 0, body: buf }); });
    s.on('error', () => resolve({ status: 0, body: '' }));
    setTimeout(() => { try { s.destroy(); } catch { /* ignore */ } resolve({ status: 0, body: buf }); }, 8000).unref?.();
  });
}

try {
  head('B0 登录隔离实例');
  {
    const r = await jget('/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: ADMIN_PASS }),
    });
    const setC = typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : [];
    cookie = (setC.length ? setC.join('; ') : (r.headers.get('set-cookie') || '')).split(';')[0];
    ok('能登录（拿到会话 Cookie）', r.status === 200 && !!cookie, `status=${r.status}`);
  }

  head('B1 /api/qrcode 的 SVG 注入（修 P1：实测确认过的 XSS）');
  {
    const evil = encodeURIComponent('" /><script>alert(document.domain)</script><rect x="');
    const r = await jget(`/api/qrcode?text=hi&dark=${evil}`);
    ok('响应体里不含 <script', !/<script/i.test(r.text), `content-type=${r.headers.get('content-type')}`);
    ok('响应体里不含 alert', !/alert/.test(r.text));
    const csp = r.headers.get('content-security-policy') || '';
    ok('SVG 响应带 sandbox CSP（残余注入也执行不了）', /sandbox/.test(csp) && /default-src 'none'/.test(csp), csp || '（无）');
    // 合法用法不能被误伤
    const good = await jget('/api/qrcode?text=ASSET-001&dark=%23ff0000');
    ok('合法颜色仍然生效', /fill="#ff0000"/.test(good.text));
    const badEc = await jget('/api/qrcode?text=x&ec=zzz');
    ok('非法 ec 参数不再打出 500', badEc.status === 200, `status=${badEc.status}`);
  }

  head('B2 安全响应头（修 P4）');
  {
    const need = {
      'content-security-policy': /default-src 'self'/,
      'x-content-type-options': /nosniff/,
      'x-frame-options': /SAMEORIGIN/,
      'referrer-policy': /same-origin/,
      'permissions-policy': /camera=\(self\)/,
      'cross-origin-opener-policy': /same-origin/,
    };
    const r = await jget('/api/health');
    for (const [h, re] of Object.entries(need)) {
      const v = r.headers.get(h) || '';
      ok(`响应头 ${h} 存在且取值正确`, re.test(v), v ? v.slice(0, 90) : '（缺失）');
    }
    // 静态页与重定向响应也必须带（挂头的位置在 handle 最前面）
    const html = await jget('/login');
    ok('HTML 页面同样带 CSP', /default-src 'self'/.test(html.headers.get('content-security-policy') || ''),
      (html.headers.get('content-security-policy') || '（缺失）').slice(0, 60));
  }

  head('B3 畸形请求路径（修 P3）');
  {
    const r = await rawGet('/api/%E0%A4%A');
    ok('半截 UTF-8 百分号编码返回 400（原来 500）', r.status === 400, `status=${r.status}`);
    ok('且不把内部异常文本吐出来', !/URI malformed/.test(r.body), r.body.split('\r\n').pop()?.slice(0, 120));
  }

  head('B4 路径穿越（裸 socket，修 P2 的判定方式）');
  {
    const cases = [
      '/api/files/../../data/itam.db',
      '/api/files/..%2f..%2fdata%2fitam.db',
      '/api/files/%2e%2e%2f%2e%2e%2fitam.db',
      '/uploads/..%2f..%2fitam.db',
      '/uploads/../../itam.db',
      '/..%2f..%2fitam.db',
      '/%2e%2e%2f%2e%2e%2fitam.db',
      '/..%2fkey.txt',
    ];
    const leaked = [];
    const codes = [];
    for (const p of cases) {
      const r = await rawGet(p, cookie);
      codes.push(`${p}=${r.status}`);
      if (/SQLite format/.test(r.body) || /BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY/.test(r.body)) leaked.push(p);
    }
    ok('8 种穿越写法都读不到库文件 / 私钥', leaked.length === 0,
      leaked.length ? '⚠️ 泄露：' + leaked.join(' ') : `${[...new Set(codes.map((c) => c.split('=').pop()))].join('/')}（状态码，无泄露）`);
  }

  head('B5 照片不能被公共缓存缓存（修 P7 附带项）');
  {
    // 隔离库是全新的，多半没有照片；有就验，没有就确认路径本身已生效
    const r = await jget('/uploads/__nonexistent__.jpg');
    ok('不存在的上传文件返回 404', r.status === 404, `status=${r.status}`);
    const src = fs.readFileSync(path.join(ROOT, 'server/index.js'), 'utf8');
    ok('serveFile 对 uploads 用 private 缓存（代理不会再缓存别人的证件照）',
      /isUpload\s*\?\s*'private, max-age=86400'/.test(src) && !/uploads'\s*\)\s*\?\s*'public/.test(src));
  }

  head('B6 限流与并发闸门真的接上了（修 P8）');
  {
    // 重接口阈值被压到 12/min：打 15 次必出 429
    const w = 64, h = 64;
    const gray = Buffer.alloc(w * h, 255);
    const codes = [];
    let first429 = null;
    for (let i = 0; i < 20 && first429 === null; i++) {
      const r = await fetch(`${BASE}/api/scan?w=${w}&h=${h}&kind=bar`, {
        method: 'POST', headers: { cookie, 'content-type': 'application/octet-stream' }, body: gray,
      });
      codes.push(r.status);
      if (r.status === 429) first429 = i + 1;
    }
    ok('重接口 /api/scan 会触发 429（修复前连打 30 次全放行）', first429 !== null,
      first429 ? `第 ${first429} 次触发` : `statuses=${[...new Set(codes)].join(',')}`);
    ok('429 带 Retry-After 头', (await (async () => {
      const r = await fetch(`${BASE}/api/scan?w=${w}&h=${h}&kind=bar`, {
        method: 'POST', headers: { cookie, 'content-type': 'application/octet-stream' }, body: gray,
      });
      return r.headers.get('retry-after');
    })()) !== null);

    // 全站限流（阈值 40/min）：/api/health 也要算进去，打满后 429
    let sawApi429 = false;
    for (let i = 0; i < 60 && !sawApi429; i++) {
      const r = await fetch(`${BASE}/api/health`);
      if (r.status === 429) sawApi429 = true;
    }
    ok('全站接口限流对普通接口同样生效', sawApi429);
  }

  head('B7 5xx 不泄露内部信息 + 限流的审计留痕（源码级守护）');
  {
    const strip = (s) => s
      .replace(/\/\*[\s\S]*?\*\//g, '')      // 块注释
      .replace(/^[ \t]*\/\/.*$/gm, '');      // 行注释
    // ⚠️ 必须先去注释再匹配：我上一轮就栽在这 ——
    //    注释里为了说明「以前是这么写的」而原样引用了坏代码，正则把它当成真代码匹配上了，
    //    结果守护断言对**已修复**的代码报红。注释掉的坏代码不是坏代码。
    const src = strip(fs.readFileSync(path.join(ROOT, 'server/index.js'), 'utf8'));

    ok('5xx 分支不再回 e.message',
      /status >= 500[\s\S]{0,220}return fail\(res, 500, '服务器内部错误/.test(src)
      && !/fail\(res, status, e\.message \|\| '服务器内部错误'/.test(src));
    ok('API 限流在 handle() 里对 /api/ 生效',
      /apiLimiter\.check\(ip\)[\s\S]{0,120}heavyLimiter\.check\(ip\)/.test(src));
    ok('重接口清单包含扫码与 OCR',
      /HEAVY_API = \/\^\\\/api\\\/\(scan\|ocr/.test(src));
    ok('并发闸门接在扫码与 OCR 上',
      /scanGate\.acquire\(\)/.test(src) && /ocrGate\.run/.test(src));
    /*
     * 闸门**必须**在 `await readBody()` 之前占坑。这条顺序是闸门生效的唯一天键：
     * 挪到 readBody 下面 → 计数永远涨不上去 → 闸门静默失效（2026-09-23 实测
     * 24 个并发全放行）。所以它值得一条独立的顺序断言，不能只断言「调用了 acquire」。
     */
    ok('扫码闸门在 await readBody 之前占坑（顺序错了闸门就静默失效）',
      /scanGate\.acquire\(\)[\s\S]{0,300}?await readBody\(req/.test(src));
    ok('不再无条件采信 X-Forwarded-For（本文件里已无自建 clientIp）',
      !/x-forwarded-for'\]\?\.split/.test(src) && !/function clientIp/.test(src));
    ok('静态与导出目录改用 isInsideDir',
      (src.match(/isInsideDir\(/g) || []).length >= 3, `出现 ${(src.match(/isInsideDir\(/g) || []).length} 次`);
  }

  head('B8 自检：限流不能把正常使用误伤（回退阈值后仍可用）');
  {
    // 上一节把限流打满了。这里只做「服务本身没崩」的确认 ——
    // 429 是预期行为，不是故障；健康检查虽然也可能被限流，但不该出现 5xx。
    const r = await jget('/api/health');
    ok('服务未因限流而崩溃或 5xx', r.status < 500, `status=${r.status}`);
  }

  /* ================================================================== *
   * B9 —— 登录爆破的两道闸门（这是 P6 的端到端证明）
   *
   * ⚠️ 为什么必须另起实例：本地测试时对端永远是 127.0.0.1，按默认策略它是
   *    「可信代理」，于是 XFF 会被采信 —— 正好复现攻击者轮换 XFF 的场景。
   *    要在本地验证「不可信对端忽略 XFF」，只能把可信白名单改成不含 127.0.0.1。
   * ================================================================== */
  head('B9 登录爆破：XFF 轮换不得绕过限流（修 P6，端到端）');
  {
    // ---- 场景 1：对端【不可信】时，轮换 XFF 完全无效 ----
    const strict = await startInstance(OWN_PORT + 1, { ITAM_TRUSTED_PROXIES: '10.9.9.9' });
    try {
      const statuses = [];
      let first429 = null;
      for (let i = 0; i < 14; i++) {
        const r = await fetch(strict.base + '/api/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-forwarded-for': `203.0.113.${100 + i}` },
          body: JSON.stringify({ username: 'nobody-strict', password: `wrong-${i}` }),
        });
        statuses.push(r.status);
        if (r.status === 429 && first429 === null) first429 = i + 1;
      }
      ok('对端不可信时，轮换 14 个伪造 XFF 仍被按 IP 限流拦住',
        first429 !== null && first429 <= 13,
        first429 ? `第 ${first429} 次触发 429` : `全部放行（statuses=${statuses.join(',')}）→ 可无限爆破`);

      /*
       * 审计日志里的 IP 必须是真实对端，而不是攻击者编的值。
       *
       * ⚠️ 这里**直连临时库**读，而不是走 /api/audit：
       *    我们刚把该实例的登录限流打满，此刻从 127.0.0.1 再也登不进去，
       *    走 HTTP 只会拿到 401 空数组 —— 那条件就会退化成一条永远通过的空断言。
       */
      const { DatabaseSync } = await import('node:sqlite');
      const adb = new DatabaseSync(path.join(strict.dir, 'itam.db'), { readOnly: true });
      const items = adb.prepare('SELECT action, ip FROM audit_log ORDER BY created_at DESC LIMIT 100').all();
      adb.close();
      // 先确认「真的有日志可查」——否则下面那条断言就是空的（0 条时永远通过）
      ok('审计日志确实记录了这批失败登录（防止下面的断言变成空断言）',
        items.length > 0, `拿到 ${items.length} 条`);
      const forged = items.filter((x) => String(x.ip || '').startsWith('203.0.113.'));
      ok('审计日志没有被伪造的 XFF 污染（记录的是真实对端 127.0.0.1）',
        forged.length === 0,
        forged.length ? `有 ${forged.length} 条记着伪造 IP` : `抽查 ${items.length} 条，无 203.0.113.*`);
      ok('审计日志里确实有 auth.login.fail 记录（证明查的是对的那批数据）',
        items.some((x) => x.action === 'auth.login.fail'),
        `动作取值：${[...new Set(items.map((x) => x.action))].slice(0, 6).join(',')}`);
    } finally { strict.stop(); }

    // ---- 场景 2：对端【可信】时（本机反代，XFF 必然被采信）→ 靠全局闸门兜底 ----
    // 这里刻意只换用户名不换 IP：账号锁定会挡住单一账号，所以用「轮换用户名」模拟
    // 撞库；同时轮换 XFF 让按 IP 的桶失效。能拦住它的只剩与 IP 无关的全局闸门。
    const loose = await startInstance(OWN_PORT + 2, { ITAM_LOGIN_GLOBAL_MAX: '10' });
    try {
      let first429 = null;
      let msg = '';
      const statuses = [];
      for (let i = 0; i < 20 && first429 === null; i++) {
        const r = await fetch(loose.base + '/api/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${i}` },
          body: JSON.stringify({ username: `nobody-stuffing-${i}`, password: 'x' }),
        });
        statuses.push(r.status);
        if (r.status === 429) {
          first429 = i + 1;
          msg = (await r.json())?.error || '';
        }
      }
      ok('轮换 XFF + 轮换用户名时，与 IP 无关的全局闸门仍然拦得住',
        first429 !== null,
        first429 ? `第 ${first429} 次触发：${msg}` : `20 次全部放行（statuses=${statuses.join(',')}）`);
      ok('拦住它的是全局闸门而不是「该 IP」闸门（证明兜底真的与 IP 无关）',
        !!msg && !msg.includes('该 IP'), msg || '（没拿到消息）');
    } finally { loose.stop(); }
  }

  /* ================================================================== *
   * B10 —— 生产默认阈值不能把「正常扫码」误伤（B6 的反面断言）
   *
   * B6 证明的是「阈值压到 12 时第 13 次会 429」—— 机制是对的。
   * 但**机制对 ≠ 默认值合理**：如果生产默认值比真实用量还低，安全措施就变成了
   * 功能故障 —— 用户狂按快门时弹出「请求过于频繁」，扫码这个主打功能直接废掉。
   * 这一节专门量这件事，而且是真的把整轮请求打进去，不是只在源码上算个不等式。
   *
   * 真实用量从代码反推（m.js serverDecodeFrame）：
   *   一次快门最多 2 个 /api/scan（条码走「扁带→整帧」、二维码走「中心方形→整帧」），
   *   且**只在浏览器端解码失手之后**才发。所以「60 次/分钟的狂按」= 120 请求/分钟。
   * ================================================================== */
  head('B10 生产默认阈值不会误伤正常扫码（按 60 次快门/分钟量）');
  {
    const srcRaw = fs.readFileSync(path.join(ROOT, 'server/index.js'), 'utf8');
    const mm = /ITAM_RATE_HEAVY \|\| (\d+)/.exec(srcRaw);
    const prodDefault = mm ? Number(mm[1]) : null;
    ok('能从源码里解析出重接口的生产默认阈值（解析不到说明写法被改过了）',
      Number.isFinite(prodDefault), `解析到 ${prodDefault}`);

    const PRESSES_PER_MIN = 60;   // 「狂按快门」的现实上界
    const PER_PRESS = 2;          // serverDecodeFrame 单次最多发 2 个 /api/scan
    const burst = PRESSES_PER_MIN * PER_PRESS;   // = 120，单人一分钟的现实峰值
    /*
     * 安全系数 2 的来由（不是凑数）：限流 key 是 IP，而几台手机经同一个 NAT /
     * 反向代理（且代理没转发 XFF）时会**共用一份配额**。所以阈值不能只按单人下界取，
     * 否则「两个人同时狂扫」就报「请求过于频繁」。
     * ⚠️ 这一条同时是「防回退」的钉子：老默认值正好是 120（= 单人下界），
     *    没有余量。若有人把它改回 120，本节会红 —— 这是刻意的。
     */
    const SAFETY_FACTOR = 2;
    const need = burst * SAFETY_FACTOR;   // = 240

    ok(`默认阈值 ≥ ${SAFETY_FACTOR}× 单人现实上界（${burst} × ${SAFETY_FACTOR} = ${need}/分钟）`,
      prodDefault !== null && prodDefault >= need,
      `默认 ${prodDefault}，需要 ≥ ${need}；等于 ${burst} 就说明只剩单人余量、多人共用 IP 会被误伤`);
    // 太松也不行：重接口阈值若高过全站接口阈值，这道就先被全站那道拦下，等于没设
    ok('默认阈值没有松到失去意义（≤ 全站接口默认 600）',
      prodDefault !== null && prodDefault <= 600, `默认 ${prodDefault}`);

    // 真发一遍：起一个「重接口 = 生产默认值」的实例，把整轮打进去
    // ⚠️ 端口用 +4 而不是 +3：OWN_PORT(8096)+3 = 8099，而 8099 是
    //    tests/all.js 与 __patch/run-isolated.mjs 的测试服务器端口，
    //    在 `npm test` 下会撞端口 → 实例起不来 → 假红。留开这一段。
    const prod = await startInstance(OWN_PORT + 4, {
      ITAM_RATE_HEAVY: String(prodDefault),
      ITAM_RATE_API: '100000',   // 关掉全站那道，单独量重接口这道
    });
    try {
      const { cookie: ck, status: loginStatus } = await prod.login();
      ok('生产默认实例能登录（拿到 cookie 才打得动 /api/scan）',
        loginStatus === 200 && !!ck, `status=${loginStatus}`);

      const w = 64, h = 64;
      const gray = Buffer.alloc(w * h, 255);
      const codes = new Set();
      let first429 = null;
      for (let i = 0; i < burst; i++) {
        const r = await fetch(`${prod.base}/api/scan?w=${w}&h=${h}&kind=bar`, {
          method: 'POST',
          headers: { cookie: ck, 'content-type': 'application/octet-stream' },
          body: gray,
        });
        codes.add(r.status);
        if (r.status === 429) { first429 = i + 1; break; }
      }
      ok(`${PRESSES_PER_MIN} 次快门（${burst} 个请求）在生产默认值下一次都没被限流`,
        first429 === null && codes.has(200),
        first429
          ? `第 ${first429} 个请求就被 429 —— 默认值 ${prodDefault} 太紧，会打断正常扫码`
          : `状态码 ${[...codes].join(',')}`);
    } finally { prod.stop(); }
  }

  /* ================================================================== *
   * B11 —— 并发闸门必须真的会丢弃（否则那句「多的直接 503」是空话）
   *
   * ⚠️ 这一节是 2026-09-23 实测逼出来的，前后推翻了两个版本：
   *    v1：闸门只有 `running >= max`，且套在解码外面（readBody 之后）
   *        → 8 个并发 1200×1200 **全部 200**，耗时严格线性叠加（302/593/…/2282ms）。
   *        原因：/api/scan 的解码是纯同步 JS，同步期间事件循环不跑别的 JS，
   *        `running` 在下个请求进来前就减回 0 了；**积压躲在 socket 缓冲区里**，
   *        JS 侧计数器看不见 → 闸门形同不存在。
   *    v2：改成「事件循环滞后 > 1.5s 才丢弃」→ **时灵时不灵**。同一份代码，
   *        探针里 24 个并发丢掉了 21 个，本套件里 24 个并发又全部放行
   *        （滞后信号取决于定时器能不能抢到事件循环相位）。时灵时不灵的安全
   *        措施比没有更糟 —— 于是有了 v3。
   *    v3（现行）：在 `await readBody()` **之前** `acquire()` 占坑。各请求的
   *        handler 由 socket I/O 事件交错驱动，第 1 个在读 body 时会主动让出循环，
   *        第 2、3…个 handler 才有机会跑起来并看见「已经有 n 个在排队」→ **确定性生效**。
   *
   * 两个方向都要量：
   *   (a) 正常单扫**不许**被丢弃 —— 否则把安全措施做成了功能故障；
   *   (b) 灌请求时**必须**出现 503，且 /api/health 仍然答得上来（可观测性不能被陪葬）。
   * ================================================================== */
  head('B11 闸门：正常扫描不误伤，洪水必须被丢弃且健康检查仍可用');
  {
    const g = await startInstance(OWN_PORT + 5, {
      ITAM_RATE_API: '100000', ITAM_RATE_HEAVY: '100000',   // 隔离出闸门，别被限流抢答
    });
    try {
      const { cookie: ck, status: ls } = await g.login();
      ok('闸门实例能登录', ls === 200 && !!ck, `status=${ls}`);

      const post = async (side) => {
        const gray = Buffer.alloc(side * side, 255);
        const r = await fetch(`${g.base}/api/scan?w=${side}&h=${side}&kind=qr`, {
          method: 'POST',
          headers: { cookie: ck, 'content-type': 'application/octet-stream' },
          body: gray,
        });
        return r.status;
      };

      // (a) 正常使用：手机端最大就是 1600px。连着扫 3 次、中间留出人类操作间隔。
      const normal = [];
      for (let i = 0; i < 3; i++) {
        normal.push(await post(1600));
        await new Promise((r) => setTimeout(r, 250));   // 人类两次点按之间的间隔
      }
      ok('正常单扫（1600px，间隔 250ms 连做 3 次）一次都不能被丢弃',
        normal.length === 3 && normal.every((s) => s === 200), `状态 ${normal.join(',')}`);

      // (b) 洪水：24 个并发 1600px。同时不停探 /api/health。
      let polling = true;
      const health = [];
      const poller = (async () => {
        while (polling) {
          const t = Date.now();
          try { const r = await fetch(`${g.base}/api/health`); health.push({ s: r.status, ms: Date.now() - t }); }
          catch { health.push({ s: 0, ms: Date.now() - t }); }
          await new Promise((r) => setTimeout(r, 100));
        }
      })();
      const flood = await Promise.all(Array.from({ length: 24 }, () => post(1600)));
      polling = false;
      await poller;

      const shed = flood.filter((s) => s === 503).length;
      const served = flood.filter((s) => s === 200).length;
      // 理想情况丢弃 24 - max(4) = 20 个；留出余量按 ≥10 断言，只要求「确实在丢」
      ok('洪水下真的会丢弃请求（修复前 8 个并发全 200，闸门形同不存在）',
        shed >= 10, `24 个并发：200×${served} 503×${shed}（闸门上限 4，理想丢弃 ≥20）`);
      ok('但没有「一律拒绝」——仍有一部分被正常服务',
        served >= 1, `200×${served}`);
      ok('丢弃用的是 503（不是被 5xx 通用分支吃成 500）',
        flood.every((s) => s === 200 || s === 503), `出现的状态码 ${[...new Set(flood)].join(',')}`);

      // 健康检查是「服务还活着吗」的唯一入口，被陪葬就等于失去可观测性
      ok('洪水期间 /api/health 始终没有 5xx / 连不上',
        health.length > 0 && health.every((h) => h.s === 200),
        `采样 ${health.length} 次，状态 ${[...new Set(health.map((h) => h.s))].join(',')}`);
      ok('洪水期间确实探到了健康检查（防止上面那条变成空断言）', health.length > 0, `${health.length} 次`);
    } finally { g.stop(); }
  }
} finally {
  stopAll();
}

/* ---------------- 汇总 ---------------- */
console.log(`\n${'─'.repeat(52)}`);
console.log(`安全回归：通过 ${pass} / 失败 ${failures.length}（自起隔离实例，端口 ${OWN_PORT}）`);
if (failures.length) {
  console.log('失败项：');
  for (const f of failures) console.log('  · ' + f);
  process.exit(1);
}
