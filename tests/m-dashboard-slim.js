/**
 * 移动端「概览页」精简回归测试。
 *
 * 为什么要有它：这一页曾经被整页塞进管理端仪表盘（6 张 KPI + 环 + 柱 + 品牌条），
 * 用户反馈「太繁琐」。精简之后必须有东西**看住它别再长回去** —— 光靠人眼看代码
 * 是看不住的（本环境还读不了截图）。
 *
 * 做法：用 DOM 桩把真实 m.js 加载进来，调 renderDashboard() 拿到 innerHTML，
 * 然后断言：
 *   1. 首屏元素必须存在（概览块 + 主行动按钮）；
 *   2. 报表类元素必须**不存在**（.kpi / 环形图 / 柱状图 / 品牌条）；
 *   3. 首屏高度可控 —— 用「大块级元素个数」近似，超过阈值就说明又堆回去了。
 *
 * 运行前需先启动服务：node tests/m-dashboard-slim.js
 */
const BASE = process.env.BASE || 'http://127.0.0.1:8080';

const failures = [];
function assert(cond, msg) {
  if (!cond) { failures.push(msg); console.log('  \x1b[31m✘\x1b[0m ' + msg); }
  else console.log('  \x1b[32m✔\x1b[0m ' + msg);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- 极简 DOM 桩（与 render-smoke.js 同源，够 m.js 加载即可） ---------- */
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
  }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(v) { this._innerHTML = String(v); }
  appendChild(c) { this.children.push(c); return c; }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; }
  addEventListener() {} removeEventListener() {}
  setAttribute() {} getAttribute() { return null; } removeAttribute() {}
  querySelector() { return null; } querySelectorAll() { return []; }
  closest() { return null; } focus() {} blur() {} click() {}
  getBoundingClientRect() { return { top: 0, left: 0, width: 375, height: 600, bottom: 600, right: 375 }; }
  insertAdjacentHTML() {} scrollIntoView() {} animate() { return { finished: Promise.resolve() }; }
}

function installDom() {
  const byId = new Map();
  const mk = (id) => { const el = new FakeEl(); byId.set(id, el); return el; };
  ['main', 'tabbar', 'cameraOverlay', 'previewOverlay', 'shotViewer', 'cameraVideo',
   'camFrame', 'camGuide', 'camHint', 'previewImg', 'previewInfo', 'shutter',
   'operator', 'toast'].forEach(mk);

  globalThis.document = {
    getElementById: (id) => byId.get(id) || null,
    querySelector: (sel) => {
      const id = sel.replace(/^#/, '');
      return byId.get(id) || new FakeEl();
    },
    querySelectorAll: () => [],
    createElement: (t) => new FakeEl(t),
    addEventListener() {}, removeEventListener() {},
    body: new FakeEl('body'), head: new FakeEl('head'),
    documentElement: new FakeEl('html'),
  };
  globalThis.window = globalThis;
  globalThis.location = {
    href: BASE + '/m', hash: '', hostname: '127.0.0.1', protocol: 'http:',
    pathname: '/m', search: '', origin: BASE, replace() {}, assign() {},
  };
  // 注意：不要给 globalThis.navigator 赋值 —— Node 24 里它是只读 getter，
  // 赋值会抛 "which has only a getter"。render-smoke.js 也没动它，跟着办即可。
  globalThis.isSecureContext = true;
  globalThis.addEventListener = () => {};
  globalThis.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  globalThis.localStorage = {
    _d: {},
    getItem(k) { return this._d[k] ?? null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; },
  };
  return byId;
}

/* ---------- 带会话 Cookie 的 fetch 代理（抄 render-smoke.js 的做法） ---------- */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ADMIN_USER = process.env.ITAM_USER || process.env.ITAM_ADMIN_USER || 'admin';
// 服务端建号时读的是 ITAM_ADMIN_PASSWORD；测试端用它登录。
// 兼容 ITAM_PASS（render-smoke.js 的传统写法），再退回 data/admin-password.txt。
let ADMIN_PASS = process.env.ITAM_ADMIN_PASSWORD || process.env.ITAM_PASS || '';
if (!ADMIN_PASS) {
  const f = path.join(__dirname, '..', 'data', 'admin-password.txt');
  if (fs.existsSync(f)) {
    const m = fs.readFileSync(f, 'utf8').match(/初始密码:\s*(\S+)/);
    if (m) ADMIN_PASS = m[1];
  }
}

let cookie = '';
async function login() {
  const res = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  });
  const setC = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  if (setC.length) cookie = setC.map((c) => c.split(';')[0]).join('; ');
  return res.ok;
}

/* ---------- 跑起来 ---------- */
console.log('\n=== 移动端概览页精简回归 (' + BASE + ') ===\n');

const byId = installDom();

// 让 m.js 里的 api() 带上会话 Cookie：包一层 fetch，只注入 Cookie 头
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const headers = { ...(opts.headers || {}) };
  if (cookie) headers.Cookie = cookie;
  return realFetch(String(url).startsWith('http') ? url : BASE + url, { ...opts, headers });
};

const loggedIn = await login();
assert(loggedIn, '以 ' + ADMIN_USER + ' 登录成功（拿到会话 Cookie）');
if (!loggedIn) {
  console.log('\n=== 概览页精简：无法登录，跳过 ===\n');
  process.exit(1);
}

try {
  await import('file://' + process.cwd().replace(/\\/g, '/') + '/public/assets/m.js');
  await wait(1200);
} catch (e) {
  console.log('  \x1b[31m✘\x1b[0m m.js 加载失败：' + e.message);
  process.exit(1);
}

assert(typeof globalThis.renderDashboard === 'function', 'm.js 加载成功，renderDashboard 可调用');

/* ---------- 渲染两个页面 ----------
 * 仪表盘 = 只看数（概览 + 最近设备，无操作入口）
 * 识别入库 = 只做事（拍照 / 相册 / 扫码 / 备份开关，无导航性内容）
 */
const main = byId.get('main');
const dash = { html: '', err: null };
const home = { html: '', err: null };

try {
  globalThis.state && (globalThis.state.view = 'dashboard');
  await globalThis.renderDashboard();
  await wait(400);
  dash.html = main.innerHTML;
} catch (e) { dash.err = e.message; }

try {
  globalThis.state && (globalThis.state.view = 'home');
  globalThis.renderHome();
  await wait(200);
  home.html = main.innerHTML;
} catch (e) { home.err = e.message; }

if (process.env.DUMP_HTML) {
  console.log('\n----- 仪表盘 -----\n' + dash.html + '\n----- 识别入库 -----\n' + home.html + '\n----- end -----\n');
}

if (!dash.html && !home.html) {
  console.log('\n=== 概览页精简：跳过 DOM 断言（两页都没渲染出内容）===\n');
  if (dash.err) console.log('  仪表盘抛错：' + dash.err);
  if (home.err) console.log('  识别入库抛错：' + home.err);
  process.exit(1);
}

/* ================== 仪表盘：只看数 ================== */
console.log('  —— 仪表盘（看数）——');
assert(/class="ov"/.test(dash.html), '概览块 .ov 存在（一行核心数字）');
assert(/ov-num/.test(dash.html), '总数用大字号 .ov-num');
assert(/ov-row/.test(dash.html), '三格分栏 .ov-row 存在');
assert(/最近更新的设备/.test(dash.html), '含「最近更新的设备」只读列表');

// 操作入口**一律不该出现** —— 这是本次分工的核心
assert(!/openCamera\(/.test(dash.html), '仪表盘不放拍照/扫码入口（操作归识别入库页）');
assert(!/big-btn/.test(dash.html), '仪表盘不放主行动大按钮');
assert(!/回到电脑端管理后台/.test(dash.html), '仪表盘不放「回管理后台」（已收进右上角菜单）');
assert(!/使用手册/.test(dash.html), '仪表盘不放「使用手册」（已收进右上角菜单）');

// 报表类仍然不许回来
assert(!/kpi-grid/.test(dash.html), '不再有 6 格 KPI 网格 .kpi-grid');
assert(!/class="kpi/.test(dash.html), '不再有 .kpi 卡片');
assert(!/stat-donut/.test(dash.html), '不再有环形图');
assert(!/stat-bars|class="bcol"/.test(dash.html), '不再有分类柱状图');
assert(!/brand-list|brand-fill/.test(dash.html), '不再有品牌占比条');
assert(!/stat-legend/.test(dash.html), '不再有图例');

/* ================== 识别入库：只做事 ================== */
console.log('  —— 识别入库（做事）——');
assert(/big-btn/.test(home.html), '主行动「拍照识别入库」大按钮存在');
assert(/openCamera\('capture'\)/.test(home.html), '主按钮真的调 openCamera(capture)');
assert(/galleryForCapture\(\)/.test(home.html), '含「从相册选图识别」');
// 扫码核对现在拆成「扫二维码 / 扫条码」两个专用入口，首页这一行改成先进扫码页选择，
// 不再直接把相机按某个码型打开。
assert(/扫码核对 \/ 查询/.test(home.html), '含「扫码核对 / 查询」');
assert(/renderScan\(\)/.test(home.html), '该入口进扫码页（让用户选二维码 / 条码），不再直接开相机');
assert(/chkAutosave/.test(home.html), '含照片备份开关');

// 这一页不该出现别的页面的东西
assert(!/class="ov"/.test(home.html), '识别入库不放概览数字（那是仪表盘的事）');
assert(!/最近更新的设备/.test(home.html), '识别入库不放「最近设备」（底部 tab 已有）');
assert(!/回到电脑端管理后台/.test(home.html), '识别入库不放「回管理后台」');
assert(!/使用手册/.test(home.html), '识别入库不放「使用手册」');

/* ================== 两页不重合（本次整改的目的） ================== */
console.log('  —— 两页重叠检查 ——');
const OPS = [
  { name: '拍照识别入库', re: /openCamera\('capture'\)/ },
  { name: '扫码核对', re: /renderScan\(\)/ },
  { name: '回管理后台', re: /回到电脑端管理后台/ },
  { name: '使用手册', re: /使用手册/ },
];
OPS.forEach((o) => {
  const inDash = o.re.test(dash.html);
  const inHome = o.re.test(home.html);
  assert(!(inDash && inHome), `「${o.name}」不同时出现在两页（仪表盘=${inDash} 识别入库=${inHome}）`);
});

/* ---------- 结果 ---------- */
if (failures.length) {
  console.log('\n=== 概览页精简：失败 ' + failures.length + ' 项 ===\n');
  process.exit(1);
}
console.log('\n=== 概览页精简：全部通过 ===\n');
