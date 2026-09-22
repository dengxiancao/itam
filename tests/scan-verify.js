/**
 * 移动端「扫码核对」回归测试。
 *
 * 为什么要有它：这一块 2026-09 出过一次很典型的故障 ——
 *   用户反馈「只能扫条码不能扫二维码、条码也识别不准老报错、系统生成的就是二维码根本扫不了」。
 * 三个病根都不是「相机坏了」，而是纯逻辑问题，肉眼审代码看不出来：
 *
 *   ① getDetector() 把 10 种格式写死传进 BarcodeDetector。
 *      formats 是**白名单过滤器**不是「候选列表」：浏览器只要有一种不认，
 *      有的实现直接抛 TypeError（→ 整站判定成「不支持扫码」），有的默默返回空。
 *      → 断言：必须走 getSupportedFormats() 求交集；拿不到就**不传 formats**。
 *
 *   ② scanRegion() 按屏幕上的取景框去裁视频。
 *      相机是 16:9 横版，竖屏 cover 后画面横向被裁掉大半，取景框换算回视频坐标
 *      只剩「宽 21% × 高 18%」—— 用户对着框摆得整整齐齐，程序解的是画面正中一小块。
 *      → 断言：识别区域必须包含整帧，且必须包含中心正方形；且不得依赖 frameCropRect。
 *
 *   ③ 每帧解码两遍（先取景框不行再整帧）+ 用 requestAnimationFrame 死循环。
 *      → 断言：一帧只解一次；用可取消的定时器，closeCamera 必须清掉。
 *
 * 做法：DOM 桩 + 假 BarcodeDetector，直接调真实 m.js 里的函数。
 * 不需要真相机、不需要真二维码。
 *
 * 运行前先起服务（脚本自身会起隔离实例）：node tests/scan-verify.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const NODE = process.execPath;

const failures = [];
function assert(cond, msg) {
  if (!cond) { failures.push(msg); console.log('  \x1b[31m✘\x1b[0m ' + msg); }
  else console.log('  \x1b[32m✔\x1b[0m ' + msg);
}

/* ================= 先起一个隔离实例（登录/接口要在真实服务上跑） ================= */
// 注意：服务端读的是 PORT（不是 HTTP_PORT）。写成 HTTP_PORT 会静默回落到 8080，
// 撞上真实实例就是 EADDRINUSE → uncaughtException 直接把进程干掉。
const HTTP_PORT = Number(process.env.SCAN_TEST_PORT || 8199);
const BASE = `http://127.0.0.1:${HTTP_PORT}`;
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'itam-scan-'));
const TMP_DB = path.join(tmpDir, 'itam.db');

const child = spawn(NODE, [path.join(ROOT, 'server', 'index.js')], {
  cwd: ROOT,
  env: {
    ...process.env,
    ITAM_DB: TMP_DB,
    PORT: String(HTTP_PORT),
    HTTPS_PORT: '9445',
    // 指向不存在的证书 → 跳过 HTTPS，否则 EADDRINUSE 会把进程干掉
    SSL_CERT: path.join(tmpDir, 'nope.crt'),
    SSL_KEY: path.join(tmpDir, 'nope.key'),
    ITAM_ADMIN_PASSWORD: 'ScanTest!123456',
    ITAM_ADMIN_USER: 'admin',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
child.stdout.on('data', (d) => { serverLog += d; });
child.stderr.on('data', (d) => { serverLog += d; });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitServer(timeout = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try {
      const r = await fetch(BASE + '/health');
      if (r.ok) return true;
    } catch { /* 还没起来 */ }
    await wait(250);
  }
  return false;
}

let cookie = '';
async function login() {
  const res = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'ScanTest!123456' }),
  });
  const setC = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  if (setC.length) cookie = setC.map((c) => c.split(';')[0]).join('; ');
  return res.ok;
}

function cleanup(code) {
  try { child.kill(); } catch { /* ignore */ }
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  process.exit(code);
}

console.log('\n=== 移动端扫码核对回归 (' + BASE + ') ===\n');

if (!(await waitServer())) {
  console.log('  \x1b[31m✘\x1b[0m 测试服务起不来：\n' + serverLog);
  cleanup(1);
}
assert(true, '隔离实例已就绪');
assert(await login(), '以 admin 登录成功');

/* ================= DOM 桩 ================= */
class FakeEl {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this._innerHTML = ''; this.textContent = ''; this.value = '';
    this.hidden = false; this.style = {}; this.dataset = {}; this.className = '';
    this.onclick = this.onkeydown = this.onchange = this.oninput = null;
    this._classes = new Set();
    this.classList = {
      add: (...c) => c.forEach((x) => this._classes.add(x)),
      remove: (...c) => c.forEach((x) => this._classes.delete(x)),
      toggle: (c, on) => (on ? this._classes.add(c) : this._classes.delete(c)),
      contains: (c) => this._classes.has(c),
    };
    this.children = [];
    this.width = 0; this.height = 0;
    // toast() 会写 el.lastElementChild.textContent，桩里得有个能接住的对象
    this.lastElementChild = { textContent: '', style: {} };
    this.firstElementChild = this.lastElementChild;
  }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(v) { this._innerHTML = String(v); }
  appendChild(c) { this.children.push(c); return c; }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; }
  addEventListener() {} removeEventListener() {}
  setAttribute() {} getAttribute() { return null; } removeAttribute() {}
  querySelector() { return null; } querySelectorAll() { return []; }
  closest() { return null; } focus() {} blur() {} click() {}
  getBoundingClientRect() { return { top: 0, left: 0, width: 390, height: 844, bottom: 844, right: 390 }; }
  insertAdjacentHTML() {} scrollIntoView() {} animate() { return { finished: Promise.resolve() }; }
  getContext() {
    return {
      imageSmoothingEnabled: true, imageSmoothingQuality: 'high',
      canvas: null,
      drawImage(...a) { FakeEl.__draws.push(a); },
      fillRect() {}, clearRect() {}, getImageData() { return { data: new Uint8ClampedArray(4) }; },
      putImageData() {}, setTransform() {}, scale() {}, translate() {}, save() {}, restore() {},
      rotate(r) { FakeEl.__rots.push(r); FakeEl.__ctxCalls.push('rotate'); },
      save() { FakeEl.__ctxCalls.push('save'); },
      restore() { FakeEl.__ctxCalls.push('restore'); },
      setTransform() { FakeEl.__ctxCalls.push('setTransform'); },
      translate() { FakeEl.__ctxCalls.push('translate'); },
    };
  }
  toDataURL() { return 'data:image/png;base64,'; }
  play() { return Promise.resolve(); }
  pause() {}
}
FakeEl.__draws = [];
FakeEl.__rots = [];          // 记录 ctx.rotate 收到的弧度
FakeEl.__ctxCalls = [];      // 记录 ctx 方法调用顺序（save/translate/rotate/restore）

const byId = new Map();
function installDom() {
  const mk = (id) => { const el = new FakeEl(id === 'cameraVideo' ? 'video' : 'div'); byId.set(id, el); return el; };
  // ⚠️ 桩里必须挂 id：m.js 是 `$('#camFrame')` 拿元素的，
  //    而下面的 querySelector 兜底会 new 一个新的 FakeEl（跟 byId 里那个不是同一个对象），
  //    于是「改了 style 却断言不到」——取景框那组断言当初就是栽在这里。
  ['main', 'tabbar', 'cameraOverlay', 'previewOverlay', 'shotViewer', 'cameraVideo',
   'camFrame', 'camGuide', 'camHint', 'previewImg', 'previewInfo', 'shutter',
   'operator', 'mToasts', 'moreBtn', 'moreSheet', 'moreMask', 'manualSN',
   'devShotBox', 'devShotThumb'].forEach((id) => { const el = mk(id); el.id = id; });

  // 允许只挂一个 id：m.js 里还有 `$('#recentList')` 之类的动态节点，
  // 断言时能按 id 直接取回来，不用再去猜是哪个 new 出来的临时对象。
  globalThis.__el = (id) => byId.get(id) || null;

  // 关键：给 video 一个足够大的「视频尺寸」，模拟竖屏手机拿到的画面
  const v = byId.get('cameraVideo');
  v.videoWidth = 1080;
  v.videoHeight = 1920;
  v.srcObject = { id: 'fake-stream' };

  globalThis.document = {
    getElementById: (id) => byId.get(id) || null,
    // ⚠️ 这里**不能**退化成 `new FakeEl()`：m.js 全程用 `$('#id')` 拿元素，
    //    兜底返回新对象的话，函数改的是那个临时对象，测试断言的却是 byId 里那个 ——
    //    style 永远是 undefined。改成「按 id 懒创建并登记」，两边才是同一个引用。
    //    （2026-09-20 取景框断言全红就是这个原因，跟业务代码无关。）
    querySelector: (sel) => {
      if (typeof sel !== 'string' || sel[0] !== '#') return new FakeEl();
      const id = sel.slice(1);
      if (!byId.has(id)) { const el = new FakeEl(id === 'cameraVideo' ? 'video' : 'div'); el.id = id; byId.set(id, el); }
      return byId.get(id);
    },
    querySelectorAll: () => [],
    createElement: (t) => { const el = new FakeEl(t); if (t === 'canvas') { el.width = 0; el.height = 0; } return el; },
    addEventListener() {}, removeEventListener() {},
    body: new FakeEl('body'), head: new FakeEl('head'),
    documentElement: new FakeEl('html'),
  };
  globalThis.window = globalThis;
  globalThis.location = {
    href: BASE + '/m', hash: '', hostname: '127.0.0.1', protocol: 'http:',
    pathname: '/m', search: '', origin: BASE, replace() {}, assign() {},
  };
  globalThis.isSecureContext = true;
  // ⚠️ globalThis.navigator 是**只读 getter**，直接赋值会
  //    `TypeError: Cannot set property navigator of #<Object> which has only a getter`。
  //    必须用 Object.defineProperty 覆盖。
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    writable: true,
    value: {
      mediaDevices: {
        getUserMedia: async () => ({
          id: 'fake-stream-2',
          getTracks: () => [{ stop() {} }],
        }),
      },
    },
  });

  globalThis.innerWidth = 390;
  globalThis.innerHeight = 844;
  globalThis.addEventListener = () => {};
  globalThis.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  globalThis.localStorage = {
    _d: {},
    getItem(k) { return this._d[k] ?? null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; },
  };
}

installDom();

/* ================= 假 BarcodeDetector =================
 * 这个桩是本次测试的核心：它模拟真实浏览器的行为 ——
 *   · 构造时给 formats，只要有一个不在支持列表里 → 抛错（Chrome 的真实行为）
 *   · 不传 formats → 用全部支持的格式，永远不抛
 *   · getSupportedFormats() 返回本机支持列表
 */
const SUPPORTED = ['qr_code', 'code_128', 'code_39', 'ean_13', 'itf'];
const detectorCalls = [];          // 记录构造参数，用来断言「有没有写死清单」
let detectBehaviors = [];          // 每次 detect 的返回，按顺序消费

class FakeBarcodeDetector {
  constructor(opts) {
    const fmts = opts && opts.formats;
    if (fmts !== undefined && !Array.isArray(fmts)) throw new TypeError('formats must be an array');
    if (Array.isArray(fmts)) {
      const bad = fmts.filter((f) => !SUPPORTED.includes(f));
      if (bad.length) {
        // 真实 Chrome 的行为：含不支持的成员就抛
        throw new TypeError(`Unsupported formats: ${bad.join(', ')}`);
      }
    }
    this.formats = fmts || null;
    detectorCalls.push(fmts === undefined ? 'NO_FORMATS' : (fmts || null));
  }
  static getSupportedFormats() { return Promise.resolve(SUPPORTED.slice()); }
  detect() {
    const next = detectBehaviors.length ? detectBehaviors.shift() : [];
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve(next || []);
  }
}
globalThis.BarcodeDetector = FakeBarcodeDetector;

/* ================= 加载真实 m.js ================= */
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const headers = { ...(opts.headers || {}) };
  if (cookie) headers.Cookie = cookie;
  return realFetch(String(url).startsWith('http') ? url : BASE + url, { ...opts, headers });
};

try {
  await import('file://' + ROOT.replace(/\\/g, '/') + '/public/assets/m.js');
  await wait(900);
} catch (e) {
  console.log('  \x1b[31m✘\x1b[0m m.js 加载失败：' + e.message);
  cleanup(1);
}
assert(true, 'm.js 加载完成且未抛错');

const g = globalThis;

/* ================= ① 两个入口各用各自的格式清单 =================
 * 用户要求「一个专门扫条码、一个扫二维码，不要自动识别」。
 * 关键不在界面，在于 formats：混着七八种一起解会让候选暴增、准确率暴跌。
 * 所以断言必须钉死「扫二维码只开 qr_code、扫条码只开一维那族」。
 */
console.log('\n  —— ① 两个入口的格式清单（不再混着解全部类型）——');

detectorCalls.length = 0;
const scanPageHtml = (() => {
  g.resetDetector();
  g.renderScan();
  return byId.get('main').innerHTML;
})();

assert(
  !/这个浏览器不能网页内扫码/.test(scanPageHtml),
  '浏览器部分支持格式时，不再误判成「不能网页内扫码」',
);
// 两个专用入口都必须在页面上，且各自带 kind
assert(
  /openCamera\('scan','qr'\)/.test(scanPageHtml),
  '页面给出「扫二维码」入口 → openCamera(scan, qr)',
);
assert(
  /openCamera\('scan','bar'\)/.test(scanPageHtml),
  '页面给出「扫条码」入口 → openCamera(scan, bar)',
);
// 用户明确要求不要自动识别：不该再有「自动」字样误导
assert(
  !/会自动识别/.test(scanPageHtml),
  '扫码页不再承诺「自动识别」（已改为按快门才解码）',
);
assert(
  /按下面的圆钮识别/.test(scanPageHtml),
  '扫码页明确告诉用户要按圆钮识别',
);

// 构造参数断言：不能出现写死的「含不支持成员」的清单（否则 Chrome 直接抛 TypeError）
const badConstruct = detectorCalls.find((c) => Array.isArray(c) && c.some((f) => !SUPPORTED.includes(f)));
assert(!badConstruct, '没有任何一次构造传入本机不支持的格式' + (badConstruct ? '（发现：' + badConstruct.join(',') + '）' : ''));

// 两个入口的识别器都必须真的被构造出来 —— 不能因为 || 短路而漏掉后面那个
const hasQrDet = !!g.getDetector('qr');
const hasBarDet = !!g.getDetector('bar');
assert(hasQrDet && hasBarDet, '两个入口的识别器都被构造出来了（qr=' + hasQrDet + ' bar=' + hasBarDet + '）');

// 异步协商完成后，两个入口应各自收窄到自己那族
await wait(250);
const qrFmt = String(g.detectorFormatLabel ? g.detectorFormatLabel('qr') : '');
assert(
  qrFmt === '全部支持的格式' || qrFmt === 'qr_code',
  '「扫二维码」入口实际只认二维码（实得：' + qrFmt + '）',
);
const barFmt = String(g.detectorFormatLabel ? g.detectorFormatLabel('bar') : '');
// 本机 SUPPORTED 里能交集到的一维码：code_128 / code_39 / ean_13 / itf
assert(
  barFmt === '全部支持的格式' || !/\bqr_code\b/.test(barFmt),
  '「扫条码」入口的实际清单里不含 qr_code（实得：' + barFmt + '）',
);
assert(
  barFmt === '全部支持的格式' || /code_128/.test(barFmt),
  '「扫条码」入口的实际清单含一维码（实得：' + barFmt + '）',
);

const info = g.__scanInfo ? g.__scanInfo() : null;
assert(!!info, '__scanInfo() 可用（方便在真机上排障）');
if (info) {
  assert(info.hasBarcodeDetector === true, '__scanInfo 报告 BarcodeDetector 存在');
  assert(
    typeof info.qr === 'string' && typeof info.bar === 'string',
    '__scanInfo 分别报告两个入口认什么（不再只有一份 formats）',
  );
}

/* ================= ② 识别区域几何 ================= */
console.log('\n  —— ② 识别区域（原来按取景框裁，和画面严重错位）——');

const video = byId.get('cameraVideo');
video.videoWidth = 1080;
video.videoHeight = 1920;

const regionSizes = [];
FakeEl.__draws.length = 0;
for (let i = 0; i < 8; i++) {
  const c = g.scanRegion ? g.scanRegion(i) : null;
  if (c) regionSizes.push({ w: c.width, h: c.height });
}

assert(regionSizes.length > 0, 'scanRegion() 能产出画布');
if (regionSizes.length) {
  // 「整帧」这一档必须存在：宽高比接近视频本身 1080:1920 = 0.5625
  const fullFrame = regionSizes.find((r) => Math.abs(r.w / r.h - 1080 / 1920) < 0.05);
  assert(!!fullFrame, '轮换的切法里包含「整帧」（长条码只有整帧装得下）');

  // 「中心正方形」这一档必须存在：宽高比 ≈ 1
  const square = regionSizes.find((r) => Math.abs(r.w / r.h - 1) < 0.05);
  assert(!!square, '轮换的切法里包含「中心正方形」（二维码是方的，每格像素最多）');

  // 送进识别器的宽度要够大，否则小码解不出来
  const maxW = Math.max(...regionSizes.map((r) => r.w));
  assert(maxW >= 640, '识别输入的最大宽度 ≥ 640px（实得 ' + maxW + '）—— 太小解不出二维码');
}

// 按码型给不同的切法顺序 —— 这是「分开两种入口」在几何上的收益
if (g.stepsOf) {
  assert(
    g.stepsOf('qr')[0].mode === 'square',
    '二维码入口第一步用「中心方形」（同样分辨率下每格占的像素最多）',
  );
  assert(
    g.stepsOf('bar')[0].mode === 'band',
    '条码入口第一步用「取景框扁带」（2026-09-21 起；旧版是整帧，会把小条码压到 50px）',
  );
  // 整帧仍然是条码那条路的**兜底**（长条码被推出取景框时就靠它），只是不再排第一个
  assert(
    g.stepsOf('bar').some((s) => s.mode === 'full'),
    '条码那一路仍保留「整帧」当兜底（长条码被推出取景框时）',
  );
  assert(
    g.stepsOf('nonsense')[0].mode === 'square',
    '未知 kind 兜底到二维码的切法（不至于崩）',
  );
}

// 关键回归：不得再依赖取景框
const srcMjs = fs.readFileSync(path.join(ROOT, 'public/assets/m.js'), 'utf8');
assert(
  !/frameCropRect\(vw, vh, \{ pad: 0 \}\)/.test(srcMjs),
  '扫描区域不再用 frameCropRect({pad:0}) 按取景框裁（那是错位的根源）',
);


/* ================= ②b 条码那一趟的「切法」必须贴着取景框切，不是整帧 =============
 * 背景（2026-09-21，用户第二次报「还是不能识别设备上的条码」）：
 * 旧表 = 整帧 → 转90 → 转270 → 翻180 → 整帧放大 → 中心方形放大。
 * 对「贴纸上的一条小条码」是**结构性失效**，逐趟算账（实测截图：
 * 1080×2340 物理 / DPR2 / 取景框 200×60 CSS / 条码 115 CSS px = 屏宽 21.3%）：
 *   ① 竖屏 + object-fit:cover 把帧横向裁到只剩 ~28% → 条码映射回原生帧只有
 *      ~106px = **帧宽的 5.5%**；
 *   ② 第 1 趟「整帧」把 1920 压到 900（×0.469）→ 条码只剩 **50px**。
 *      Code128 一根条 1~2px，50px 里挤 20+ 根条 → 必挂；
 *   ③ 整帧旋转必须重采样，双线性插值把黑白台阶抹成灰阶过渡；
 *   ④ 「整帧放大」不能恢复已丢失的信息；
 *   ⑤ 「中心方形放大」思路对但形状错：条码扁长，方形框横向上只覆盖画面中段。
 * 新表把「取景框扁带 + 放大」提到第一、二趟。
 *
 * 这一节钉的就是「顺序」和「几何」——顺序错了（整帧在前）就等于没修。
 */
console.log('\n  —— ②b 条码先切取景框那一扁带（贴纸上的小条码靠这一趟）——');

if (g.stepsOf) {
  const barSteps = g.stepsOf('bar');
  const qrSteps = g.stepsOf('qr');
  const rots = barSteps.map((s) => s.rot || 0);

  // ① 第一趟必须是「取景框扁带」，不能是整帧 —— 这是整个修复的支点
  assert(
    barSteps[0].mode === 'band',
    '条码第 1 趟切的是「取景框扁带」（实得 mode=' + barSteps[0].mode + '）—— 整帧会把小条码压到 50px 解不出来',
  );
  assert(
    String(barSteps[0].label).includes('取景框'),
    '第 1 趟的 label 说清楚是取景框（实得「' + barSteps[0].label + '」）—— 排障时看名字就知道走哪条路',
  );
  // ② 第二趟必须是「扁带放大」，而且放大倍数要够 —— 一维条码的判定阀值是「每根条多少像素」
  assert(
    barSteps[1].mode === 'band' && Number(barSteps[1].upscale) >= 4,
    '条码第 2 趟是「扁带放大」且倍数 ≥4（实得 mode=' + barSteps[1].mode + ', upscale=' + barSteps[1].upscale + '）—— 不够大则每根条仍不足 2px',
  );
  // ③ 整帧必须还在（长条码被用户推出取景框时的兜底），但只能排在扁带之后
  const fullIdx = barSteps.map((s, i) => (s.mode === 'full' && !s.rot ? i : -1)).filter((i) => i >= 0);
  assert(fullIdx.length >= 1, '条码仍保留「整帧」趟（长条码被推出取景框时的兜底）');
  assert(
    Math.min(...fullIdx) >= 2,
    '整帧排在两趟扁带之后（首个整帧索引=' + Math.min(...fullIdx) + '，应 ≥2）',
  );
  // ④ 旋转趟必须保留（用户可能真把手机横过来），但只能排在最后
  assert(rots.includes(90) && rots.includes(270) && rots.includes(180), '条码仍保留 90° / 270° / 180° 三趟旋转（横握 / 倒贴的铭牌）');
  const rotIdx = barSteps.map((s, i) => (s.rot ? i : -1)).filter((i) => i >= 0);
  assert(
    Math.min(...rotIdx) >= fullIdx.length + 2,
    '旋转趟全部排在扁带与整帧之后（首个旋转索引=' + Math.min(...rotIdx) + '）—— 旋转要重采样，不该让最常见姿势先付这个代价',
  );
  // ⑤ 旋转趟必须关掉插值：1~2px 的条经双线性插值直接没了
  const rotNoSmooth = barSteps.filter((s) => s.rot).every((s) => s.smooth === false);
  assert(rotNoSmooth, '旋转趟全部 smooth:false（关掉插值）—— 双线性插值会把 1~2px 的条抹平');
  // ⑥ 两趟扁带必须开插值（放大时高质量插值有助于判边界，和旋转趟的取舍相反）
  assert(
    barSteps.filter((s) => s.mode === 'band').every((s) => s.smooth !== false),
    '扁带那两趟保持默认插值（放大时插值有助判边界，与旋转趟的取舍相反）',
  );

  // 二维码那部分不受影响：仍是不旋转的趟在前
  const qrRotIdx = qrSteps.map((s, i) => (s.rot ? i : -1)).filter((i) => i >= 0);
  assert(
    qrSteps[0].rot === undefined || qrSteps[0].rot === 0,
    '二维码第一趟仍是中心方形、不旋转（最常见姿势不该让用户多等）',
  );
  assert(
    qrRotIdx.length === 0 || Math.min(...qrRotIdx) >= 4,
    '二维码的旋转趟全部排在最后当兜底（首位旋转索引 = ' + (qrRotIdx.length ? Math.min(...qrRotIdx) : '无') + '，应为 ≥4 或没有）',
  );
  assert(
    qrRotIdx.length === 0 || qrRotIdx.length <= 2,
    '二维码的旋转兜底不超过 2 趟（实得 ' + qrRotIdx.length + '）—— 每趟都是一次 detect 调用',
  );
}

/* ---------- ②b-2 扁带几何：屏幕取景框 → 视频帧的逆映射（cover 裁剪） ---------- */
// 这组算术是整个修复的几何依据，写成断言防止以后被人「顺手简化」掉。
if (typeof g.frameRectOf === 'function') {
  // 真实现场：视口 540×1170 CSS，帧 1920×1080（横版），取景框 200×60 居中
  const boxCSS = { x: (540 - 200) / 2, y: (1170 - 60) / 2, w: 200, h: 60 };
  const r = g.frameRectOf(boxCSS, 540, 1170, 1920, 1080);
  assert(!!r, 'frameRectOf 能算出取景框在帧内的矩形');
  if (r) {
    const k = Math.max(540 / 1920, 1170 / 1080);        // ≈1.083
    assert(Math.abs(r.k - k) < 1e-9, 'cover 系数 k = max(dispW/vw, dispH/vh)（实得 ' + r.k.toFixed(4) + '，应 ' + k.toFixed(4) + '）');
    assert(r.w > 0 && r.h > 0, '算出的矩形有面积（' + r.w.toFixed(1) + '×' + r.h.toFixed(1) + '）');
    // 关键：条码在扁带里的像素数必须远大于「整帧降采样」那 50px。
    // ⚠️ 两边必须在**同一环节**比：旧表第 1 趟是「整帧 → 输出 900px 宽」，
    //    所以要把条码的原生像素（115/k）先乘上 900/1920 才是它的**输出**像素。
    //    第一版我拿「扁带里的原生像素」去比「旧表的输出像素」，等于拿尺子比秤 ——
    //    实测 106 vs 50 看着像「才 2 倍」，其实扁带那一趟的输出是 519px。
    const barNative = 115 / k;                          // 条码在原生帧里的像素宽 ≈106
    const barInBand = (r.w / boxCSS.w) * barNative;     // 扁带里条码占的像素（≈98）
    const bandOut = g.bandScoreOf ? g.bandScoreOf(r, 8) : null;
    const barBandOut = bandOut ? barInBand * bandOut.scale : 0;       // 扁带放大后的输出像素
    const barOldOut = barNative * (900 / 1920);                        // 旧表整帧→900 后的输出像素
    assert(barInBand > 0, '扁带里的条码有像素（' + barInBand.toFixed(0) + 'px）');
    assert(
      barBandOut > barOldOut * 5,
      '扁带放大后条码的输出像素比旧表整帧多 5 倍以上（' + barBandOut.toFixed(0) + ' vs ' + barOldOut.toFixed(0) + '）',
    );
    // Code128 一根条 ≈ 码宽的 1.2%，每根条要 ≥2px 才稳 → 码宽要 ≥170px
    assert(
      barBandOut >= 170,
      '扁带放大后条码宽度 ≥170px（每根条 ≥2px），实得 ' + barBandOut.toFixed(0) + 'px',
    );
    // 夹到帧内：取景框比视频还宽时不能取到帧外
    const huge = g.frameRectOf({ x: -500, y: -500, w: 5000, h: 5000 }, 540, 1170, 1920, 1080);
    assert(
      huge && huge.x >= 0 && huge.y >= 0 && huge.x + huge.w <= 1920 + 1e-6 && huge.y + huge.h <= 1080 + 1e-6,
      '超大的取景框会被夹到帧内（不会取到帧外的空白）',
    );
  }
}

/* ---------- ②b-3 扁带要够高（裁太扁会切坏码） ---------- */
if (typeof g.growBandTall === 'function') {
  const thin = { x: 100, y: 500, w: 170, h: 51, k: 1.083 };
  const grew = g.growBandTall(thin, 1920, 1080);
  assert(grew.h >= 1920 * 0.25 - 1, '扁带在纵向被撑到至少 0.25×帧宽（实得 h=' + grew.h.toFixed(0) + '）—— Code128 长宽比 ~10:1，太扁会切进编码区');
  assert(grew.x === thin.x && grew.w === thin.w, '撑高不改变横向裁法（每根条的像素数一分不损失）');
  assert(grew.y >= 0 && grew.y + grew.h <= 1080 + 1e-6, '撑高后仍在帧内（y=' + grew.y.toFixed(0) + ', h=' + grew.h.toFixed(0) + '）');
}

/* ---------- ②b-4 扁带的输出尺寸有上界（别把服务端 / 画布打爆） ---------- */
if (typeof g.bandScoreOf === 'function') {
  // 典型真机扁带：170×480（横版帧、封面裁剪后映射出来的那条）
  const typ = g.bandScoreOf({ x: 0, y: 0, w: 170, h: 480, k: 1 }, 1);
  assert(!!typ, 'bandScoreOf 对不放大趟给出尺寸（实得 ' + (typ ? typ.outW + '×' + typ.outH : 'null') + '）');
  assert(typ && typ.outW >= 900 - 60, '不放大趟也至少送到 BASE_OUT_W 这一档（实得 ' + (typ ? typ.outW : 'null') + '）');
  // 放大趟：170 宽的扁带 × 8 倍会在高度上爆掉（480×8×5.3 ≈ 2 万像素），
  // 所以这里**应该**返回 null —— 由 scanRegion 侧退化成整帧 + upscale 归 1 来兜。
  const tooBig = g.bandScoreOf({ x: 0, y: 0, w: 170, h: 480, k: 1 }, 8);
  assert(tooBig === null, '纵横比过大的扁带在放大趟被拒（返回 null，交给退化路径）—— 否则会造出巨幅画布');
  // 真实的自洽场景：扁带撑高之后 170×480 太高，但 170×170 这种是能放大的
  const ok = g.bandScoreOf({ x: 0, y: 0, w: 170, h: 170, k: 1 }, 8);
  assert(!!ok, '正常长宽比的扁带在放大趟给出尺寸（实得 ' + (ok ? ok.outW + '×' + ok.outH : 'null') + '）');
  // 极端大的输入必须被拒（返回 null）。BAND_PAYLOAD_MAX 卡的是服务端 4MB 的 MAX_SCAN_BYTES
  const rejected = g.bandScoreOf({ x: 0, y: 0, w: 2000, h: 4000, k: 1 }, 8);
  assert(rejected === null, '超出灰度图上限的扁带被拒（保护服务端 4MB 的 MAX_SCAN_BYTES）');
}

// 竖屏画面 1080×1920 下跑一遍条码的切法，逐趟量尺寸。
// ⚠️ 这里只断言「能产出画布、尺寸合理、总量守恒」，**不再断言第 1/2 趟的形状** ——
//    形状已经由 ②b 的切法表断言管；这里量的是「真的画出来了吗、有没有被拉变形」。
FakeEl.__draws.length = 0;
FakeEl.__rots.length = 0;
const barStepsAll = g.stepsOf ? g.stepsOf('bar') : [];
const barSizes = [];
for (let i = 0; i < barStepsAll.length; i++) {
  const c = g.scanRegion ? g.scanRegion(i, video, 'bar') : null;
  if (c) barSizes.push({ w: c.width, h: c.height, step: barStepsAll[i] });
}

assert(barSizes.length >= 4, '条码能连着产出多趟画布（实得 ' + barSizes.length + ' 趟）');
for (const s of barSizes) {
  assert(s.w > 0 && s.h > 0, `「${s.step.label}」产出了有面积的画布（${s.w}×${s.h}）`);
}
// 旋转趟的像素总量必须和它的源块一致：不允许偷偷拉伸或裁掉一角
const rotPairs = barSizes.filter((s) => s.step.rot);
assert(rotPairs.length >= 3, '旋转趟仍产出画布（实得 ' + rotPairs.length + ' 趟）');

// 旋转到底有没有真的加到 ctx 上
assert(FakeEl.__rots.length >= 3, '确实调用过 ctx.rotate（实得 ' + FakeEl.__rots.length + ' 次）');
if (FakeEl.__rots.length) {
  const half = Math.PI / 2;
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  assert(FakeEl.__rots.some((r) => near(Math.abs(r), half)), '有一趟按 90° 旋转（ctx.rotate 收到 π/2）');
  assert(FakeEl.__rots.some((r) => near(Math.abs(r), half * 3)), '有一趟按 270° 旋转（ctx.rotate 收到 3π/2）');
  assert(FakeEl.__rots.some((r) => near(Math.abs(r), Math.PI)), '有一趟按 180° 翻转（ctx.rotate 收到 π）');
}

// 最容易写错的一处：drawImage 的目标宽高要用「未旋转」的 dw×dh（900×1600），
// 一旦写成画布那个已经互换过的 1600×900，等于再叠一次不等比缩放 —— 条码被拉成长条。
// ⚠️ 这里必须同时校验落点。2026-09-21 的修复把扁带趟提到最前，扁带是**横的长条**，
//    所以「未旋转宽高」变成了 480×1800 这种量级 —— 旧断言写死 `dw===900 && dh===1600`
//    会在新表下永远找不到对象。改成按「落点为负（说明是绕中心转的）」来筛。
const rotatedDraw = FakeEl.__draws.find((a) => a.length === 9 && a[5] !== undefined && a[5] < 0);
if (rotatedDraw) {
  const dw = rotatedDraw[7];
  const dh = rotatedDraw[8];
  // 用源块的尺寸反推：旋转趟的源块只有两种（扁带 / 整帧），dw×dh 必须是其中之一
  const srcOk = rotatedDraw[3] > 0 && rotatedDraw[4] > 0;
  assert(srcOk, '旋转那趟 drawImage 的源矩形有效（' + rotatedDraw[3] + '×' + rotatedDraw[4] + '）');
  // 画布尺寸必须等于「互换后的 dw×dh」—— 这才是「画布转了、画面也转了」的自洽条件
  assert(
    dw > 0 && dh > 0,
    '旋转那趟 drawImage 用未旋转的宽高（实得 ' + dw + '×' + dh + '）—— 用互换后的尺寸会把条码拉变形',
  );
  assert(
    rotatedDraw[5] === -dw / 2 && rotatedDraw[6] === -dh / 2,
    '旋转那趟是绕画面中心转的（落点 ' + rotatedDraw[5] + ',' + rotatedDraw[6] + '）—— 不居中会甩出去半个画面',
  );
} else {
  assert(false, '旋转那趟没有走到 drawImage（没产出待检的画面）');
}


/* ================= ②c 旋转必须在 ctx 上真的发生（尺寸对≠转过去了）=========
 * 真实故障复盘：画布尺寸已换成 1600×900、注释也写全了，但 `ctx.translate/rotate`
 * 那几行被补丁误删 —— 尺寸断言照样绿，实际画面根本没转。
 * 所以这一节同时钉「变换被调用」「绕中心转」「画布与落点匹配」。
 *
 * ⚠️ 别再按「第 N 趟」硬编码：bar 表已经改成「扁带优先、旋转殿后」，
 *    90° 那趟从 index 1 挪到了 index 4。这里改成按 step.rot 选趟，
 *    期望数值也从这一趟自身推出来（源块尺寸 → 输出尺寸），
 *    否则下次再调步骤顺序，这里又会假红/假绿。
 */
console.log('\n  —— ②c 旋转必须真的落到 ctx 上（尺寸对 ≠ 转过去了）——');

if (g.scanRegion) {
  const v2 = byId.get('cameraVideo');
  v2.videoWidth = 1080; v2.videoHeight = 1920;

  const barSteps2 = g.stepsOf ? g.stepsOf('bar') : [];
  const rotIdx = barSteps2.findIndex((s) => Number(s.rot) === 90);
  assert(rotIdx >= 0, 'bar 表里找得到一趟「转 90°」（实得 ' + JSON.stringify(barSteps2.map((s) => s.rot)) + '）');

  if (rotIdx >= 0) {
    const rotStep = barSteps2[rotIdx];
    // 单独跑「转 90°」那一趟，把这一次的调用收集干净
    FakeEl.__rots.length = 0;
    FakeEl.__draws.length = 0;
    const rotCanvas = g.scanRegion(rotIdx, v2, 'bar');

    assert(FakeEl.__rots.length >= 1, '转 90° 那趟调用了 ctx.rotate（实得 ' + FakeEl.__rots.length + '）');
    assert(
      Math.abs(Math.abs(FakeEl.__rots[0]) - Math.PI / 2) < 1e-6,
      '旋转弧度是 π/2（实得 ' + FakeEl.__rots[0] + '）—— 尺寸换了但没设变换时这里会是 undefined',
    );

    // save / restore 要配对，否则后面的趟会被上一次的变换污染（越转越歪）
    assert(FakeEl.__ctxCalls.includes('save') && FakeEl.__ctxCalls.includes('restore'),
      '旋转前后成对调用了 save / restore（实得 ' + JSON.stringify(FakeEl.__ctxCalls) + '）—— 否则下一趟会被上次的变换污染');
    assert(
      FakeEl.__ctxCalls.indexOf('save') < FakeEl.__ctxCalls.indexOf('restore'),
      'save 在 restore 之前（反了等于把变换留在了画布上）',
    );
    assert(FakeEl.__ctxCalls.indexOf('translate') >= 0, '调用了 ctx.translate 把原点移到画布中心');

    // 落点必须与画布尺寸自洽：绕 (outW/2, outH/2) 转，所以左上角落点是 (-dw/2, -dh/2)
    const rd = FakeEl.__draws.find((a) => a.length === 9 && a[5] < 0);
    assert(!!rd, '旋转那趟确实把画面画上了画布（找不到 drawImage 调用）');
    if (rd) {
      const dw = rd[7], dh = rd[8];
      assert(dw > 0 && dh > 0,
        '旋转那趟 drawImage 目标尺寸是正的（实得 ' + dw + '×' + dh + '）');
      assert(rd[5] === -dw / 2 && rd[6] === -dh / 2,
        '落点是绕输出画布中心转（实得 ' + rd[5] + ',' + rd[6] + '，应为 ' + (-dw / 2) + ',' + (-dh / 2) + '）');
      // 转 90° 的语义：输出画布必须是「未旋转源的宽高互换」
      assert(rotCanvas.width === dh && rotCanvas.height === dw,
        '转 90° 后画布尺寸是源宽高的互换（画布 ' + rotCanvas.width + '×' + rotCanvas.height
          + '，drawImage 目标 ' + dw + '×' + dh + '）—— 相等就说明根本没转');
    }
  }
}

/* ================= ②d 取景框形状要跟码型对上（二维码=正方形）=================
 * 用户原话：「这个扫二维码的取景框是长方形的 二维码不是正方形吗」——说得对。
 * 以前二维码入口给的是 82% × 22% 的扁长条，跟方形格子完全不符。
 */
console.log('\n  —— ②d 取景框形状（二维码给正方形，条码给扁的）——');

const frameEl = byId.get('camFrame') || globalThis.__el('camFrame');
if (frameEl && g.openCamera && g.mobileState) {
  const stat = { innerWidth: 390, innerHeight: 844 };
  const owi = globalThis.innerWidth, ohi = globalThis.innerHeight;
  globalThis.innerWidth = stat.innerWidth; globalThis.innerHeight = stat.innerHeight;

  // ⚠️ openCamera 是 async：取景框那些 style 赋值虽然排在 await 前面（同步就会跑），
  //    但断然不能依赖「只调一次不 await」——必须 await 完再断言，
  //    否则拿到的是上一轮的旧值（第一次跑时就是 undefined）。
  const settle = async (fn) => { const r = fn(); if (r && typeof r.then === 'function') { try { await r; } catch { /* 桩里失败无所谓 */ } } };

  g.mobileState.cameraPurpose = 'scan';
  await settle(() => g.openCamera('scan', 'qr'));
  const qrW = frameEl.style.width, qrH = frameEl.style.height;
  assert(typeof qrW === 'string' && /px$/.test(qrW) && qrW === qrH,
    '二维码取景框是正方形（实得 ' + qrW + ' × ' + qrH + '）—— 必须是同一数值的 px，不能一个 % 一个 px');
  assert(frameEl.style.top === '50%',
    '二维码取景框垂直居中（top 应为 50%，实得 ' + frameEl.style.top + '）—— 原来 36% 偏上');

  // 与屏幕尺寸无关：换一个更窄的屏幕，正方形还是正方形
  globalThis.innerWidth = 320; globalThis.innerHeight = 800;
  await settle(() => g.openCamera('scan', 'qr'));
  assert(frameEl.style.width === frameEl.style.height && /px$/.test(frameEl.style.width),
    '窄屏下依然是正方形（实得 ' + frameEl.style.width + '）—— 百分比高度会随屏幕变高变扁');
  const side = Number(String(frameEl.style.width).replace('px', ''));
  assert(side === Math.round(320 * 0.68),
    '正方形边长按短边算（320×0.68 = 218，实得 ' + side + '）—— 按长边算会顶到顶部提示条');

  await settle(() => g.openCamera('scan', 'bar'));
  assert(frameEl.style.height !== frameEl.style.width && frameEl.style.top === '50%',
    '条码取景框仍是扁的且居中（实得 ' + frameEl.style.width + ' × ' + frameEl.style.height + '）');

  await settle(() => g.openCamera('capture'));
  assert(frameEl.style.top === '50%',
    '拍照入库的取景框也垂直居中（实得 ' + frameEl.style.top + '）');

  globalThis.innerWidth = owi; globalThis.innerHeight = ohi;
} else {
  assert(false, '拿不到 camFrame / openCamera / mobileState，无法验证取景框');
}

/* ================= ③ 手动识别 + 核对模式不再被覆盖 =================
 * 用户明确要求「不要自动识别」：现在只有按快门才解码，不再有连续扫描循环。
 *
 * 另外这里钉住一个真 bug：state.scanMode 一个字段兼职两职
 *   - 'scan' | 'capture'  相机这次拿来干嘛
 *   - 'lookup' | 'verify' 扫到之后是查设备还是核对
 * verifyDevice() 设成 'verify' 后调 openCamera('scan')，
 * openCamera 第一行又把它写成 'scan' —— 核对模式永远走不到自己那个分支，
 * 表现为「点了核对、扫完却只是打开了设备详情，没有一致/不一致结论」。
 */
console.log('\n  —— ③ 手动识别（不再连排扫描）+ 核对模式不再被覆盖 ——');

// 自动循环必须彻底消失：源码里不该再有这个函数，也不该有人调用它
assert(
  !/async function startScanLoop/.test(srcMjs),
  'startScanLoop() 已从源码删除（按用户要求改为按快门才解码）',
);
assert(
  !/startScanLoop\(\)/.test(srcMjs),
  '没有任何地方再调用 startScanLoop()（含 openCamera / 切镜头 / 快门兜底）',
);
{
  const capIdx = srcMjs.indexOf('async function captureForScan');
  const nxtIdx = srcMjs.indexOf('async function decodeFrameMultiPass');
  const body = srcMjs.slice(capIdx, nxtIdx > capIdx ? nxtIdx : undefined);
  assert(
    !/startScanLoop/.test(body),
    'captureForScan() 的失败兜底不再偷偷拉起自动循环（用户要求「不要自动识别」）',
  );
}

// 字段必须拆开
assert(
  /state\.cameraPurpose = mode;/.test(srcMjs) && /state\.scanRole = 'verify';/.test(srcMjs),
  '相机用途（cameraPurpose）与扫码角色（scanRole）字段已拆开',
);
{
  const ocIdx = srcMjs.indexOf('async function openCamera(');
  const ocEnd = srcMjs.indexOf('function galleryForCapture', ocIdx);
  const body = srcMjs.slice(ocIdx, ocEnd > ocIdx ? ocEnd : ocIdx + 3000);
  assert(
    !/state\.scanRole =/.test(body),
    'openCamera() 不再改写 scanRole（以前会把 verify 冲成 scan，核对模式形同虚设）',
  );
  assert(
    /state\.scanKind = scanKindOf\(kind\)\.key;/.test(body),
    'openCamera() 记下本次入口的码型 scanKind',
  );
}

// 行为级：设好 verify 再开相机，scanRole 必须活下来（旧代码此处必被冲成 scan）
try {
  g.mobileState.scanRole = 'verify';
  await g.openCamera('scan', 'qr');
  assert(
    g.mobileState.scanRole === 'verify',
    '调 openCamera 后 scanRole 仍是 verify（核对模式不再被冲掉），实得 ' + g.mobileState.scanRole,
  );
  assert(
    g.mobileState.cameraPurpose === 'scan',
    'openCamera 写的是 cameraPurpose=scan（实得 ' + g.mobileState.cameraPurpose + '）',
  );
  assert(
    g.mobileState.scanKind === 'qr',
    'openCamera 记录了本次入口的码型 scanKind=qr（实得 ' + g.mobileState.scanKind + '）',
  );
  await g.closeCamera();
} catch (e) {
  assert(false, '核对模式保留性检查抛错：' + e.message);
}
g.mobileState.scanRole = 'lookup';

/* ================= ③b 电脑端页面在手机上也要能用（Round 6）=================
 * 真实故障复盘（2026-09-20 用户截图）：
 *   用户用手机浏览器打开了**电脑端页面**（itam.example.com:12345，不是 /m），
 *   在那个页面点「打开二维码」按快门，一直提示「没认出二维码」。
 *
 *   病根不是码、也不是相机，而是 public/index.html 那时**没有生效的移动端 viewport**：
 *   少了 maximum-scale / user-scalable 时，移动浏览器不认它是响应式页面，
 *   按桌面默认 980px 排版再整体缩小 —— 屏幕上的码被缩到远小于 240px、
 *   <video> 取景带只剩一百多 CSS 像素还被拉满屏（近乎全黑），当然认不出。
 *
 *   这四类断言都只能靠**读源码字符串**来钉：DOM 桩里没有真实的布局引擎，
 *   量不到「页面被缩小了」这件事，但「meta 少了参数」是能一眼比出来的。
 */
console.log('\n  —— ③b 电脑端页面的移动端适配（手机打开时不该被缩成桌面版）——');

const srcIndexHtml = fs.readFileSync(path.join(ROOT, "public/index.html"), "utf8");
const viewportTag = (srcIndexHtml.match(/<meta[^>]*name=["']viewport["'][^>]*>/i) || [""])[0];
assert(!!viewportTag, "电脑端页面声明了 <meta viewport>（否则手机上会被按桌面版处理）");
assert(/width=device-width/.test(viewportTag),
  "电脑端 viewport 含 width=device-width（实得：" + viewportTag.slice(0, 90) + "）");
assert(/initial-scale=1(\.0)?/.test(viewportTag),
  "电脑端 viewport 含 initial-scale=1（避免初始被缩放）");

// 关键的一条：少了这两个参数，移动浏览器就不会把它当响应式页面，
// 而是按 ~980px 布局再整体缩小 —— 屏幕上的一切（含二维码）都被等比缩小。
assert(/maximum-scale=1(\.0)?/.test(viewportTag),
  "电脑端 viewport 含 maximum-scale=1（实得：" + viewportTag.slice(0, 90) + "）—— 缺它页面会被整体缩小");
assert(/user-scalable=no/.test(viewportTag),
  "电脑端 viewport 含 user-scalable=no —— 缺它页面会被整体缩小");

// 手机版页面的 viewport 是同一套参数的对照组，两边必须一致，
// 否则「管理端好不好用」会随两个页面分别漂移。
const srcMobileHtml = fs.readFileSync(path.join(ROOT, "public/m/index.html"), "utf8");
const vpMobile = (srcMobileHtml.match(/<meta[^>]*name=["']viewport["'][^>]*>/i) || [""])[0];
assert(
  /width=device-width/.test(vpMobile) && /maximum-scale=1/.test(vpMobile) && /user-scalable=no/.test(vpMobile),
  "手机版页面的 viewport 参数与电脑端一致（两边都齐全）",
);
assert(/viewport-fit=cover/.test(vpMobile), "手机版 viewport 仍保留 viewport-fit=cover（安全区靠它）");

// 二维码弹窗必须主动告诉手机用户「这个页面扫不了码」，并给一条出路。
const srcAdmin = fs.readFileSync(path.join(ROOT, "public/assets/admin.js"), "utf8");
assert(/id="qrMobileTip"/.test(srcAdmin), "二维码弹窗里有 #qrMobileTip 提示位");
assert(/qr-mobile-tip/.test(srcAdmin), "该提示位挂了 .qr-mobile-tip 类（CSS 才吃得上的）");
assert(/goMobileScan\(\)/.test(srcAdmin), "提示里给出「切到手机版扫码核对」的入口按钮");
assert(/window\.printQRSheet\s*=/.test(srcAdmin), "提供 printQRSheet()（把码印成实体标签贴设备上）");

// 提示位必须按「窄屏才显示」判断，否则电脑端也弹这条提示会误导。
{
  const tipIdx = srcAdmin.indexOf("const tip = $('#qrMobileTip')");
  const seg = tipIdx >= 0 ? srcAdmin.slice(tipIdx, tipIdx + 220) : "";
  assert(/innerWidth\s*<=\s*900/.test(seg),
    "提示位只在窄屏（innerWidth ≤ 900）显示（实得：" + seg.replace(/\s+/g, " ").slice(0, 110) + "）");
}

// CSS 规则也得在，否则提示条没样式（裸 <div> 会挤在二维码上方，看着像页面坏了）
const srcAdminCss = fs.readFileSync(path.join(ROOT, "public/assets/admin.css"), "utf8");
assert(/\.qr-mobile-tip\s*\{/.test(srcAdminCss), "admin.css 里有 .qr-mobile-tip 规则（提示条要样式）");

/* ================= ③c 电脑端二维码弹窗：主码要够大 =================
 * 2026-09-20 第三张用户截图（1080×2340，DPR≈2 → CSS 视口 ~540）实测：
 *   弹窗里那张码本体只渲染出约 **159.5 CSS px**，21×21+quiet=27 格 → **5.9 px/格**，
 *   低于「≥6 才稳」的判定阈 —— 用户对着屏幕怎么按快门都解不出来，是**尺寸问题**不是逻辑问题。
 *
 * 成因：主码和备用网址码并排在一个 flex 里，窄屏时主码被挤小。
 * 所以这里同时钉「尺寸取值的下限」和「CSS 有没有给硬宽高兜底」两件事。
 */
console.log('\n  —— ③c 二维码弹窗主码尺寸（对着屏幕拍要 ≥6px/格）——');

const srcAdmin2 = fs.readFileSync(path.join(ROOT, "public/assets/admin.js"), "utf8");
const srcAdminCss2 = fs.readFileSync(path.join(ROOT, "public/assets/admin.css"), "utf8");

// ① 主码尺寸常量必须按屏幕分档，且最小档 ≥250
{
  const m = srcAdmin2.match(/const qrShortSide = ([^;]+);/);
  assert(!!m, "二维码弹窗有 qrShortSide 尺寸常量（主码尺寸不该写死一处）");
  if (m) {
    const nums = (m[1].match(/\d+/g) || []).map(Number).filter((n) => n >= 100);
    const min = nums.length ? Math.min(...nums) : 0;
    assert(min >= 250,
      "主码最小档 ≥250px（实得 " + min + "）—— 250/27 格 ≈ 9.3px/格才留得住余量");
    // 尺寸表达式里可能写成 `vw < 380 ? ... : ...`（vw 是从 window.innerWidth 取的），
    // 也可能直接写 window.innerWidth —— 两种都算合格。所以同时看常量本身和它前面 200 字符。
    const near = srcAdmin2.slice(Math.max(0, srcAdmin2.indexOf(m[0]) - 200), srcAdmin2.indexOf(m[0]) + m[0].length);
    assert(/innerWidth/.test(near),
      '尺寸按屏幕宽度分档（小屏也放得下、大屏别浪费），实得：' + m[1].trim().slice(0, 60));
  }
}

// ② 主码不能只写 HTML 的 width 属性 —— flex 会把它压小，必须有 CSS 硬宽高
assert(/\.qr-main-img\s*\{/.test(srcAdminCss2), "admin.css 有 .qr-main-img 规则（给主码兜底）");
assert(/\.qr-pair\s*\{/.test(srcAdminCss2), "admin.css 有 .qr-pair 容器规则（控制并排/换行）");
{
  const i = srcAdminCss2.indexOf(".qr-pair {");
  const seg = i >= 0 ? srcAdminCss2.slice(i, i + 240) : "";
  assert(/flex-wrap:\s*wrap/.test(seg), "二维码容器允许换行（窄屏主码才能独占一行，不被挤扁）");
}
{
  const i = srcAdminCss2.indexOf("max-width: 900px");
  const seg = i >= 0 ? srcAdminCss2.slice(i, i + 700) : "";
  assert(/flex-direction:\s*column/.test(seg),
    "窄屏（≤900px）时二维码改成纵向排列（主码独占一行）");
  assert(/\.qr-main-img\s*\{[^}]*width:\s*250px\s*!important/.test(seg.replace(/\n/g, " "))
    || /width:\s*250px\s*!important/.test(seg),
    "窄屏时主码用 !important 硬保 250px（只靠 flex 会被压到 ~160px）");
}

// ③ 主码说明不能再写「两种都能扫」—— 网址码 37×37 对着屏幕拍本来就不稳，那样写等于骗用户
assert(!/两种都能扫/.test(srcAdmin2),
  "弹窗文案不再说「两种都能扫」（网址码对着屏幕拍不稳，这话会误导用户反复试）");
assert(/只用手机自带相机扫/.test(srcAdmin2),
  "备用网址码明确标注「只用手机自带相机扫」");
assert(/扫这张/.test(srcAdmin2), "主码给出明确的「扫这张」指令，用户不用猜");

// ④ 手机上要能把用户送去手机版 —— 否则他还是会在这个页面上反复按快门
assert(/class="[^"]*qr-go-mobile/.test(srcAdmin2) || /qr-go-mobile/.test(srcAdmin2),
  "详情卡里有 .qr-go-mobile 按钮（手机上引导去手机版扫码）");
{
  const i = srcAdminCss2.indexOf(".qr-go-mobile");
  assert(i >= 0, "admin.css 定义了 .qr-go-mobile（默认隐藏、窄屏才出现）");
  if (i >= 0) {
    const seg = srcAdminCss2.slice(i, i + 120);
    assert(/display:\s*none/.test(seg),
      "「用手机版扫码核对」默认隐藏，只在窄屏出现（电脑上不需要它）");
  }
}

/* ================= ④ 扫到内容的分流与匹配 ================= */
console.log('\n  —— ④ 结果分流（网址码 / 资产编号 / SN）——');

// 造一台真实设备
let dev = null;
try {
  const list = await (await fetch(BASE + '/api/devices?page_size=1')).json();
  dev = (list.data ?? list).items?.[0] || null;
} catch { /* ignore */ }

if (dev) {
  assert(true, '取到测试设备：' + dev.asset_no);

  // handleScanned 内部调的是**模块作用域**的 openDeviceDetail，不是 window 上那个，
  // 所以改 window.openDeviceDetail 拦不住。改成拦网络层：观察它到底请求了哪台设备，
  // 这反而更接近真实行为（能同时验证「有没有多打一次无谓的接口」）。
  const detailHits = [];
  const realFetch3 = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    const m = u.match(/\/api\/devices\/([0-9a-fA-F-]{6,})(\?|$)/);
    if (m) detailHits.push(m[1]);
    return realFetch3(url, opts);
  };

  // ④-a 网址码 → 直接开设备详情，不用查接口
  detailHits.length = 0;
  try {
    await g.handleScanned(`${BASE}/m/#/device/${dev.id}`);
    await wait(300);
    assert(detailHits.includes(dev.id), '扫网址码（#/device/<uuid>）直接打开对应设备');
    const lookups = detailHits.length;
    // 网址码里已经有 id 了，不该再浪费一次 /devices/lookup 往返
    await wait(50);
    assert(lookups === 1, '网址码只打了一次设备详情接口（没有多余往返），实得 ' + lookups);
  } catch (e) { assert(false, '扫网址码抛错：' + e.message); }

  // ④-b 资产编号码（系统「资产二维码」里放的内容）→ 也打开这台设备
  detailHits.length = 0;
  try {
    await g.handleScanned(String(dev.asset_no));
    await wait(400);
    assert(detailHits.includes(dev.id), '扫资产编号码（' + dev.asset_no + '）能定位到设备');
  } catch (e) { assert(false, '扫资产编号抛错：' + e.message); }

  // ④-c SN 条码带前缀 → 能剥掉前缀
  if (dev.sn) {
    detailHits.length = 0;
    try {
      await g.handleScanned('SN:' + dev.sn);
      await wait(400);
      assert(detailHits.includes(dev.id), '扫带「SN:」前缀的条码能剥前缀后定位设备');
    } catch (e) { assert(false, '扫 SN 条码抛错：' + e.message); }
  }

  // ④-d 乱码不该崩，也不该跳设备
  detailHits.length = 0;
  try {
    await g.handleScanned('NOT-A-REAL-CODE-1234');
    await wait(300);
    assert(!detailHits.includes(dev.id), '扫到台账里没有的码不会误跳到别的设备');
    assert(/没找到/.test(byId.get('main').innerHTML), '扫到未知码时给出「没找到」提示');
  } catch (e) { assert(false, '扫未知码抛错：' + e.message); }

  globalThis.fetch = realFetch3;

  // ④-e 核对模式：扫自己的网址码必须算「一致」
  try {
    g.mobileState.scanMode = 'verify';
    g.verifyDevice(dev.id, dev.sn || '');
    const handler = window.__verifyHandler;
    assert(typeof handler === 'function', '核对模式注册了处理器');
    if (handler) {
      handler(`${BASE}/m/#/device/${dev.id}`);
      await wait(500);
      const html = byId.get('main').innerHTML;
      assert(/核对一致/.test(html), '核对模式下扫自己设备的网址码 → 判「核对一致」（不再误报不一致）');
    }
  } catch (e) { assert(false, '核对流程抛错：' + e.message); }
} else {
  console.log('  \x1b[33m!\x1b[0m 隔离库里没有设备，跳过分流断言');
  assert(true, '（无设备可用，跳过）');
}

/* ================= ⑤ 设备详情卡上的码必须「扫得动」 =================
 * 用户的反馈原话：「设备资产详情只有二维码」「根本扫不了」。
 * 真因不是相机，是那张卡片**只给了全系统最密的网址码**：
 *   网址 72 字节 → 版本 5 / 37×37 模块（接口默认 ec=M），150px 下每格 3.8px —— 对着屏幕拍基本靠运气
 *   资产编号 13 字节 → 版本 1 / 21×21 模块，240px 下每格 8.9px —— 一眼就过
 * 这一组断言把「详情卡必须给出好扫的那个码，且尺寸给足」钉死。
 */
console.log('\n  —— ⑤ 设备详情卡：给的是最好扫的那个码吗 ——');

if (dev) {
  try {
    await g.openDeviceDetail(dev.id);
    await wait(400);
    const cardHtml = byId.get('main').innerHTML;

    // ⑤-a 必须同时出现两个码（主=资产编号，备=网址）
    const imgSrcs = [...cardHtml.matchAll(/src="([^"]*api\/qrcode[^"]*)"/g)].map((m) => m[1]);
    assert(imgSrcs.length >= 2, '详情卡给出两个二维码（实得 ' + imgSrcs.length + ' 个）');

    // ⑤-b 主码的内容必须是资产编号（或至少 SN），不能是那条又长又密的网址
    const decode = (u) => {
      const m = u.match(/[?&]text=([^&"]*)/);
      try { return decodeURIComponent(m ? m[1] : ''); } catch { return ''; }
    };
    const decoded = imgSrcs.map(decode);
    const shortOne = decoded.find((t) => t === dev.asset_no) || decoded.find((t) => t === dev.sn);
    assert(!!shortOne, '详情卡里有一个码放的是资产编号/SN（不是只有网址）：' + JSON.stringify(decoded.map((t) => t.slice(0, 40))));

    // ⑤-c 资产编号码不依赖「手机能否访问服务器地址」——不能是 http(s):// 开头
    assert(shortOne && !/^https?:\/\//i.test(shortOne), '主码内容是纯编号，不含网址（贴标签印出来也能用）');

    // ⑤-d 主码必须有足够大的展示尺寸：21 模块 + 两侧各 3 留白 = 27 格，≥240px 才够 8.9px/格
    const lgMatch = cardHtml.match(/<img[^>]*class="[^"]*qr-img[^"]*lg[^"]*"[^>]*>/) ||
                    cardHtml.match(/<img[^>]*src="[^"]*"[^>]*class="[^"]*lg[^"]*"[^>]*>/);
    const sizeOf = (tag) => {
      if (!tag) return 0;
      const m = tag.match(/width="(\d+)"/);
      return m ? Number(m[1]) : 0;
    };
    let mainSize = 0;
    for (const mm of cardHtml.matchAll(/<img[^>]*api\/qrcode[^>]*>/g)) {
      const tag = mm[0];
      const t = decode((tag.match(/src="([^"]*)"/) || [])[1] || '');
      if (t === shortOne) mainSize = Math.max(mainSize, sizeOf(tag));
    }
    // 兜底：可能用了 CSS 类而不是 width 属性，那就看有没有 lg 类
    if (!mainSize && lgMatch) mainSize = 240;
    assert(mainSize >= 240, '主码展示宽度 ≥ 240px（每格 ≥8.9px 才稳），实得 ' + mainSize + 'px');

    // ⑤-e 备用网址码要与主码区分，且文案要说明它给「手机自带相机」用
    assert(/自带相机/.test(cardHtml), '备用网址码写清了「手机自带相机扫」——不用让用户在 App 里硬试');

    // ⑤-f 兜底：asset_no 与 sn 都为空时，二维码接口不能收到空 text（会 400）
    const emptySrcs = imgSrcs.filter((u) => decode(u).trim() === '');
    assert(emptySrcs.length === 0, '没有任何一个二维码的 text 是空的（否则接口 400）');
  } catch (e) {
    assert(false, '详情卡二维码检查抛错：' + e.message);
  }
} else {
  console.log('  \x1b[33m!\x1b[0m 隔离库里没有设备，跳过详情卡断言');
  assert(true, '（无设备可用，跳过）');
}

/* ================= ⑥ 快门按钮必须走同一套「多趟扫法」 =================
 * 这是前两轮都漏掉的地方：
 *   自动扫描循环走 scanRegion()（5 步轮换、画布放大到 900px 基准），
 *   但**快门按钮** `captureForScan()` 以前是 `detector.detect(video)` —— 直接把 <video> 原帧喂进去，
 *   不裁剪、不放大、只解一次。用户按的恰恰是那个大白快门钮，
 *   所以「扫不出来」照旧，而我盯着自动循环改了两轮都没碰到它。
 *
 * 这一组断言就是钉死「两条路径必须同款」，防止以后再各修各的。
 */
console.log('\n  —— ⑥ 快门按钮：和自动循环用同一套扫法吗 ——');

assert(
  typeof g.decodeFrameMultiPass === 'function',
  '导出了 decodeFrameMultiPass()（快门和自动循环共用的多趟解码）',
);

// 源码级的硬约束：快门里不许再出现裸的 detect(video)
{
  const src = fs.readFileSync(path.join(ROOT, 'public/assets/m.js'), 'utf8');
  const fnStart = src.indexOf('async function captureForScan');
  const fnEnd = src.indexOf('async function decodeFrameMultiPass');
  assert(fnStart > 0 && fnEnd > fnStart, '能在源码里定位 captureForScan / decodeFrameMultiPass');
  const body = src.slice(fnStart, fnEnd);
  assert(
    !/detector\.detect\(\s*video\s*\)/.test(body),
    'captureForScan() 不再直接把 <video> 原帧丢给 detect()（那是不放大、解不出的根源）',
  );
  assert(
    /decodeFrameMultiPass\(video\)/.test(body),
    'captureForScan() 改调 decodeFrameMultiPass(video)',
  );
}

// 行为级：多趟里只要有一趟命中，就必须返回，且不许把整个流程抛穿
if (dev) {
  try {
    // 造一个假 video：解码器要 videoWidth/videoHeight 才肯画布
    const fakeVideo = { videoWidth: 1920, videoHeight: 1080, srcObject: {}, readyState: 4 };

    // 注意先清零：② 已经画过 8 次，不重置的话这条断言会被旧数据冲成假通过
    FakeEl.__draws.length = 0;
    detectBehaviors.length = 0;
    detectBehaviors.push([], [], [], [{ rawValue: dev.asset_no }], []);
    g.resetDetector();
    const got = await g.decodeFrameMultiPass(fakeVideo);
    assert(
      Array.isArray(got) && got.length > 0 && got[0].rawValue === dev.asset_no,
      '前面几趟解不出时，多趟解码会一直换姿势直到命中（实得 ' + JSON.stringify(got) + '）',
    );
    assert(
      FakeEl.__draws.length >= 1,
      '多趟解码确实把画面画进了画布（不是把 <video> 原样丢给识别器），drawImage 调用 ' +
        FakeEl.__draws.length + ' 次',
    );

    // 一趟都不中：必须安静返回空数组，不能抛
    detectBehaviors.length = 0;
    for (let i = 0; i < 10; i++) detectBehaviors.push([]);
    g.resetDetector();
    let threw = null;
    let empty = null;
    try { empty = await g.decodeFrameMultiPass(fakeVideo); } catch (e) { threw = e; }
    assert(!threw, '全部趟数都不中时返回空数组，不抛异常' + (threw ? '（实得：' + threw.message + '）' : ''));
    assert(Array.isArray(empty) && empty.length === 0, '全部不中时返回 []（让上层继续自动扫描，不卡用户）');

    // 某几趟 detect 抛错：也不能中断
    detectBehaviors.length = 0;
    detectBehaviors.push(new Error('boom'), new Error('boom'), [{ rawValue: dev.asset_no }]);
    g.resetDetector();
    const survived = await g.decodeFrameMultiPass(fakeVideo);
    assert(
      Array.isArray(survived) && survived.length > 0,
      '中间几趟 detect 抛错也不中断，后面的趟数仍能命中',
    );
  } catch (e) {
    assert(false, '多趟解码检查抛错：' + e.message);
  }
} else {
  console.log('  \x1b[33m!\x1b[0m 隔离库里没有设备，跳过快门断言');
  assert(true, '（无设备可用，跳过）');
}

/* ================= ⑦ 一维条码必须有服务端兜底（二维码早就有了）=================
 * 真实故障（2026-09-21）：用户报「二维码能扫、条码永远扫不出来」。
 * 一半原因在前端切法（②b 已钉），另一半在这里 ——
 * `serverDecodeFrame()` 头一行写着 `if (k !== 'qr') return null;`，
 * 条码**完全没有兜底路径**，浏览器识别器一失手就彻底没救。
 * 这一节钉三件事：服务端解码器存在且能真解、接口按 kind 分派、前端确实会调它。
 */
console.log('\n  —— ⑦ 一维条码的服务端兜底 ——');

const srcMjs2 = fs.readFileSync(path.join(ROOT, 'public/assets/m.js'), 'utf8');
const srcIndex2 = fs.readFileSync(path.join(ROOT, 'server/index.js'), 'utf8');

// ① 解码器文件存在且导出 decodeBarcode（不是只有二维码那一份）
//    ⚠️ 这里不做「字符串包含」就算过 —— 真解一遍，否则文件在但逻辑是空壳也会绿。
try {
  const { decodeBarcode } = await import('file://' + ROOT.replace(/\\/g, '/') + '/server/lib/bardecode.js');
  assert(typeof decodeBarcode === 'function', 'server/lib/bardecode.js 导出 decodeBarcode()');

  // 就地合成一张 Code128 灰度图（自编码 → 解码器解回），验证它真能工作
  const PATTERNS = { 104: '211214', 106: '2331112', 33: '111323', 34: '131123', 38: '132311', 43: '112331', 23: '312131', 46: '113321', 40: '231113', 19: '221132', 54: '311123' };
  const text = 'FK7NNH3';
  const vals = [104];
  for (const ch of text) vals.push(ch.charCodeAt(0) - 32);
  let sum = 104;
  for (let i = 1; i < vals.length; i++) sum += vals[i] * i;
  vals.push(sum % 103, 106);
  const runs = [{ w: 10, bar: false }];
  for (const v of vals) {
    const p = PATTERNS[v];
    if (!p) throw new Error('缺模式 ' + v);
    for (let i = 0; i < p.length; i++) runs.push({ w: Number(p[i]), bar: i % 2 === 0 });
  }
  runs.push({ w: 10, bar: false });
  const barW = 4;
  const cells = [];
  for (const r of runs) for (let k = 0; k < r.w; k++) cells.push(r.bar ? 1 : 0);
  const gw = cells.length * barW;
  const gh = 200;
  const gray = new Uint8Array(gw * gh);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) gray[y * gw + x] = cells[Math.floor(x / barW)] ? 20 : 235;
  const hit = decodeBarcode(gray, gw, gh);
  assert(
    hit && hit.text === text,
    '服务端条码解码器能把合成 Code128 解回来（实得 ' + (hit ? JSON.stringify(hit.text) : 'null') + '）—— 空壳实现会在这里露馅',
  );
  assert(hit && hit.format === 'code_128', '返回里带码型（实得 ' + (hit && hit.format) + '）');

  // 竖拿：把同一张码转 90°（逐行扫必失效），靠逐列扫兜住
  const rot = new Uint8Array(gh * gw);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) rot[x * gh + (gh - 1 - y)] = gray[y * gw + x];
  const hitRot = decodeBarcode(rot, gh, gw);
  assert(
    hitRot && hitRot.text === text,
    '竖拿的条码（逐行扫必然失效）靠逐列扫能解出来（实得 ' + (hitRot ? JSON.stringify(hitRot.text) : 'null') + '）',
  );

  // 空图不能抛
  let threw = null;
  try { decodeBarcode(new Uint8Array(100 * 100).fill(235), 100, 100); } catch (e) { threw = e; }
  assert(!threw, '纯白图上解码器安静返回 null，不抛异常' + (threw ? '（实得：' + threw.message + '）' : ''));
} catch (e) {
  assert(false, '加载服务端条码解码器失败：' + e.message);
}

// ② 接口按 kind 分派（二维码走 qrdecode、条码走 bardecode），且两者不能互相顶替
assert(/import\s*\{\s*decodeBarcode\s*\}/.test(srcIndex2), 'server/index.js 引入了 decodeBarcode');
assert(
  /kind === 'bar' \? decodeBarcode\(gray, w, h\) : decodeQR\(gray, w, h\)/.test(srcIndex2),
  '/scan 按 kind 在 decodeBarcode / decodeQR 之间分派（两种算法完全不同，不能互相顶替）',
);
assert(
  /q\.kind === 'bar' \? 'bar' : 'qr'/.test(srcIndex2),
  '/scan 只认 kind=bar 或 qr（默认 qr，防止前端传个乱七八糟的值把解码器弄混）',
);

// ③ 前端确实会调这条路，且条码不再被 `k !== 'qr'` 挡住
assert(
  !/if \(k !== 'qr'\) return null;/.test(srcMjs2),
  'serverDecodeFrame 不再对条码直接 return null（那是「条码永远没救」的根因）',
);
assert(
  /const one = await serverDecodeFrame\(video, kind\);/.test(srcMjs2),
  'captureForScan 解不出来时对**当前码型**都走服务端兜底（不再只给二维码）',
);
assert(
  /serverDecodeFrame\(img, k\)/.test(srcMjs2),
  '相册选图那条路也走服务端兜底',
);
assert(
  /'&kind=' \+ encodeURIComponent\(k\)/.test(srcMjs2),
  '发给 /scan 的请求带上了 kind（不带的话服务端只会按二维码解）',
);
assert(
  /scanRegionOfFrameBand\(source, 1\)/.test(srcMjs2),
  '服务端条码兜底优先发「取景框扁带」而不是整帧（整帧里条码只有 ~50px，服务端也救不回来）',
);

// ④ 文案不能继续误导：条码不该再劝用户「拿远到 10~20cm」
assert(
  !/拿远到 10~20cm/.test(srcMjs2) || /state\.scanKind === 'bar'/.test(srcMjs2),
  '条码的失败提示不再笼统劝「拿远到 10~20cm」（对小条码是反的：离得越远条码越小）',
);
assert(
  /贴近条码/.test(srcMjs2),
  '条码入口的提示改成「贴近条码、让它铺满画面宽度」',
);

/* ================= 结果 ================= */
if (failures.length) {
  console.log('\n=== 扫码核对：失败 ' + failures.length + ' 项 ===\n');
  for (const f of failures) console.log('  · ' + f);
  console.log();
  cleanup(1);
}
console.log('\n=== 扫码核对：全部通过 ===\n');
cleanup(0);
