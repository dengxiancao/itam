/**
 * 安全护栏（零依赖）
 *
 * 只放「每个请求都要过一遍」的通用防线，不放业务逻辑：
 *   1. clientIp()      —— 可信代理判定，别让 X-Forwarded-For 变成免死金牌
 *   2. isInsideDir()   —— 目录包含判定，路径穿越的唯一正确写法
 *   3. createRateLimiter() / createGate() —— 限流 + 并发闸门
 *   4. securityHeaders() / applySecurityHeaders() —— 安全响应头（含 CSP）
 *   5. safeColor()     —— 颜色白名单（防把用户输入插进 SVG/HTML 属性）
 *
 * 为什么单独成文件：这些是**横切关注点**，散在 index.js 各处就会漏（事实上已经漏了：
 * 2026-09-23 实测确认 XFF 可伪造绕过登录限流、/api/qrcode 可注入 <script>）。
 */
import path from 'node:path';

/* ================================================================== *
 * 1. 客户端 IP —— 只在「直连方本身可信」时才采信 X-Forwarded-For
 * ================================================================== */

/** 拆掉 ::ffff: 前缀、方括号和端口，只留裸地址 */
function normalizeAddr(v) {
  let s = String(v || '').trim();
  if (!s) return '';
  if (s.startsWith('[')) s = s.slice(1).replace(/\](:.*)?$/, '');   // [::1]:1234
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(s)) s = s.replace(/:\d+$/, '');  // 1.2.3.4:56
  return s.replace(/^::ffff:/i, '').toLowerCase();
}

/** 内网/回环地址：这类直连方通常是本机的 frp/nginx，它们会如实转发 XFF */
function isPrivateAddr(a) {
  if (!a) return false;
  if (a === '::1' || a === 'localhost') return true;
  if (a.startsWith('127.')) return true;
  if (a.startsWith('10.')) return true;
  if (a.startsWith('192.168.')) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(a)) return true;
  if (/^f[cd][0-9a-f]{2}:/.test(a)) return true;    // fc00::/7 唯一本地地址
  if (/^fe[89ab][0-9a-f]:/.test(a)) return true;    // fe80::/10 链路本地
  return false;
}

/**
 * 可信代理白名单。默认「回环 + 私网」都算可信 —— 因为本机 frp / 同网段 nginx
 * 是最常见的两种部署，MUST 保持它们转发 XFF 的能力。
 *
 * 如果不想让同网段的机器也能伪造 XFF，设 ITAM_TRUSTED_PROXIES=127.0.0.1,192.168.1.5
 * （逗号分隔，填了就以它为准，不再自动放行整个私网）。
 */
function trustedProxyList() {
  const raw = String(process.env.ITAM_TRUSTED_PROXIES || '').trim();
  if (!raw) return null;
  return raw.split(',').map(normalizeAddr).filter(Boolean);
}

function isTrustedPeer(addr) {
  const list = trustedProxyList();
  if (list) return list.includes(addr);
  return isPrivateAddr(addr);
}

/**
 * 取真实客户端 IP。
 *
 * ⚠️ 修复的缺陷（2026-09-23 实测）：老实现是
 *     `(x-forwarded-for?.split(',')[0] || remoteAddress)`
 * 也就是**无条件**采信 XFF 的第一段。后果实测确认：
 *   ① 攻击者每次请求换一个伪造 XFF → auth.js 里按 IP 计的登录限流形同虚设，
 *      可以无限次爆破口令（实测 14 次失败一次都没被 429 拦住）；
 *   ② 顺带把审计日志里的 IP 写成攻击者随便编的值，事后无法追溯。
 *
 * 正确做法：先看**直连方**可不可信。不可信就直接用它的地址，它说什么都不算数；
 * 可信才解析 XFF，且从右往左找**第一个不可信**的地址 —— 因为越靠右越接近本机，
 * 中间可能叠了好几层代理，左边那些是攻击者自己塞的。
 *
 * ⚠️ 残留的信任边界（说清楚，不假装没有）：
 *   对端在私网时我们默认信它。也就是说**同一局域网内的**一台机器仍可伪造 XFF。
 *   这是「可用性」与「严格性」的取舍 —— 局域网/本机反代是最常见的两种部署，
 *   不放行就等于让它们全部退化成「所有人共用一个 IP」。
 *   想收紧就设 ITAM_TRUSTED_PROXIES=127.0.0.1（只信本机）。
 *   另外 auth.js 里还有一道**与 IP 无关**的全局登录失败闸门兜底，
 *   所以即使 XFF 被伪造，暴力破解的总量仍然被封顶。
 */
export function clientIp(req) {
  const peer = normalizeAddr(req.socket?.remoteAddress);
  if (!isTrustedPeer(peer)) return peer || 'unknown';

  const list = trustedProxyList();
  const chain = String(req.headers['x-forwarded-for'] || '')
    .split(',')
    .map(normalizeAddr)
    .filter(Boolean);

  // X-Real-IP 只在没有 XFF 时兜底（nginx 常用它）
  if (!chain.length) {
    const real = normalizeAddr(req.headers['x-real-ip']);
    if (real) return real;
    return peer || 'unknown';
  }

  for (let i = chain.length - 1; i >= 0; i--) {
    const addr = chain[i];
    const trusted = list ? list.includes(addr) : isPrivateAddr(addr);
    if (!trusted) return addr;
  }
  // 整条链都是可信地址（典型：本机 frp 转发，XFF 只有 127.0.0.1）
  return chain[0];
}

/* ================================================================== *
 * 2. 目录包含判定
 * ================================================================== */

/**
 * target 是否真的在 root 里面。
 *
 * 为什么不用 `abs.startsWith(root)`：`C:\app\public-evil\x` 也以 `C:\app\public` 开头，
 * 于是同级的 `public-*` / `exports-*` 目录就能被读到。path.relative 会给跨目录结果
 * 带上 `..` 前缀，一并挡住。
 */
export function isInsideDir(root, target) {
  const rel = path.relative(root, target);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/* ================================================================== *
 * 3. 限流 + 并发闸门
 * ================================================================== */

/**
 * 固定窗口令牌桶（按 key 计数）。
 *
 * 返回 `{ check, stats, dispose }`。
 * ⚠️ 注意是**对象**不是函数：调用点写的是 `limiter.check(ip)`，
 *    如果这里 `return check`（把函数本身返回），调用点会拿到 undefined 再被 `()` 调用，
 *    报的是「limiter.check is not a function」—— 一个只在真实请求路径上才炸的错。
 *
 * 除了「拦请求」，还必须**自己管住内存**：key 是攻击者可控的字符串（IP），
 * 不清理就是一个可以打爆内存的漏洞。所以有上限淘汰 + 定时清扫两条。
 */
export function createRateLimiter({ limit, windowMs, maxKeys = 20000, name = 'limiter' }) {
  const hits = new Map();

  const sweep = () => {
    const now = Date.now();
    for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k);
    // 清完还是爆表（说明正被洪水打）→ 直接清空重来，宁可短暂放宽也不能 OOM
    if (hits.size > maxKeys) hits.clear();
  };
  const timer = setInterval(sweep, Math.max(30000, windowMs));
  timer.unref?.();   // 别拖住进程退出

  const check = (key) => {
    const k = String(key || 'unknown');
    const now = Date.now();
    let rec = hits.get(k);
    if (!rec || now > rec.resetAt) {
      if (hits.size >= maxKeys) sweep();
      rec = { count: 0, resetAt: now + windowMs };
      hits.set(k, rec);
    }
    rec.count++;
    if (rec.count > limit) {
      const retryAfter = Math.max(1, Math.ceil((rec.resetAt - now) / 1000));
      const e = new Error(`请求过于频繁（${name}：每 ${Math.round(windowMs / 1000)} 秒最多 ${limit} 次），请 ${retryAfter} 秒后再试`);
      e.status = 429;
      e.retryAfter = retryAfter;
      throw e;
    }
    return rec.count;
  };

  return {
    check,
    stats: () => ({ keys: hits.size, limit, windowMs }),
    dispose: () => clearInterval(timer),
  };
}

/**
 * 并发闸门：超额时直接抛 503（不排队），别把事件循环堵死。
 *
 * ⚠️⚠️ 用错位置的坑（2026-09-23 实测，务必先读再改）：
 *   闸门**必须套在「第一个 await 之前」**。我第一版把它套在解码外面
 *   （`await readBody()` 之后），结果 24 个并发 1600×1600 请求**全部 200**，
 *   闸门形同不存在。原因很硬：
 *     · Node 是单线程，而 `decodeQR` 是**纯同步**的 —— 解码期间事件循环
 *       根本不跑别的 JS。所以每个请求进闸门时，前面那个早已 `finally` 减回 0 了。
 *     · 积压真正待在 **socket 缓冲区**里，JS 侧的计数器看不见。
 *   把 `acquire()` 提到 `await readBody()` **之前**就成立了：各请求的 handler
 *   是由 socket I/O 事件交错驱动的（第 1 个读 body 时会让出循环，第 2、3…个
 *   handler 才有机会跑起来并看到「已经有 n 个在排队」）→ 计数真的涨得上去。
 *
 * 「丢弃」而不是「排队」是刻意的：队列在 socket 缓冲区里，排队的代价是
 * **所有接口一起变慢**，包括 /api/health —— 运维连「服务是不是活着」都测不出来。
 * 宁可让多出来的扫码请求拿 503 重试，也不能让服务器整体失去响应。
 *
 * 对外有两套用法：
 *   · `run(fn)`            —— 包住「临界区里有 await」的场景（如 OCR 的网络等待）
 *   · `acquire()/release()` —— 需要自己控制占坑位置时用（如先占坑再读请求体）
 */
export function createGate({ max, name = 'gate' } = {}) {
  let running = 0;

  const busy = () => {
    const e = new Error(`${name} 繁忙，请稍后重试`);
    e.status = 503;
    e.retryAfter = 3;
    return e;
  };

  /** 同步占坑：超额立即抛 503（不排队） */
  const acquire = () => {
    if (running >= max) throw busy();
    running++;
  };
  const release = () => { if (running > 0) running--; };

  return {
    acquire,
    release,
    async run(fn) {
      acquire();
      try { return await fn(); } finally { release(); }
    },
    stats: () => ({ running, max }),
  };
}

/* ================================================================== *
 * 4. 安全响应头
 * ================================================================== */

/**
 * 应用页面用的 CSP。
 *
 * 说明：前端有两个内联 <script>（登录/注册页的引导）和大量内联 on* 事件属性，
 * 所以 script-src **必须**留 'unsafe-inline' —— 不放的话按钮全部失灵。
 * 即使如此，这条 CSP 仍然实际挡掉四类攻击：
 *   · 加载任何外部域名的脚本（挖矿/钓鱼 JS 引不进来）
 *   · eval / new Function 这类字符串执行
 *   · <object>/<embed> 插件面
 *   · 被注入 <base> 后把相对地址劫持到别的域名
 * 另外 connect-src 只放 'self'：XSS 拿不到会话（HttpOnly），也很难把数据外发。
 */
const PAGE_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
  "form-action 'self'",
].join('; ');

/**
 * 由用户参数拼出来的 SVG（二维码）用这条：直接禁掉一切脚本与外部加载。
 * `sandbox` 让浏览器把它当成一个没有脚本权限的隔离文档 —— 就算哪天又漏了转义，
 * 注入的 <script> 也只是死文本。
 */
const SVG_CSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

export function securityHeaders({ secure = false, svg = false } = {}) {
  const h = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'same-origin',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Content-Security-Policy': svg ? SVG_CSP : PAGE_CSP,
    // 摄像头要给移动端扫码用（(self) = 只允许同源页面调用），其余一律关掉
    'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(), payment=(), usb=(), serial=()',
  };
  if (secure) h['Strict-Transport-Security'] = 'max-age=31536000';
  return h;
}

export function applySecurityHeaders(res, opts) {
  const h = securityHeaders(opts);
  for (const [k, v] of Object.entries(h)) res.setHeader(k, v);
  return h;
}

/* ================================================================== *
 * 5. 颜色白名单
 * ================================================================== */

const HEX_RE = /^#[0-9a-f]{3,8}$/i;
const FUNC_RE = /^(rgb|rgba|hsl|hsla)\(\s*[\d.%,\s/]+\)$/i;
const NAMED = new Set([
  'black', 'white', 'red', 'green', 'blue', 'gray', 'grey', 'silver', 'navy',
  'teal', 'olive', 'purple', 'maroon', 'aqua', 'cyan', 'fuchsia', 'magenta',
  'lime', 'yellow', 'orange', 'pink', 'brown', 'transparent', 'currentcolor', 'none',
]);

/**
 * 只放行「真正的颜色字面量」，其它一律回退到 fallback。
 *
 * 存在的意义：`fill="${dark}"` 这种写法一旦参数来自 query，就是注入口
 * （`dark='" /><script>…`）。校验放在**产出 SVG 的那一层**，谁调都跑不掉。
 */
export function safeColor(v, fallback) {
  const s = String(v ?? '').trim();
  if (!s) return fallback;
  if (HEX_RE.test(s) || FUNC_RE.test(s) || NAMED.has(s.toLowerCase())) return s;
  return fallback;
}
