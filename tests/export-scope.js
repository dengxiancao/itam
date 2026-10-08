/**
 * Excel 导出「范围」回归测试。
 *
 *   node tests/export-scope.js        （不需要起服务）
 *
 * 为什么要有它（2026-10-08 的真实故障）：
 *   Excel 页的「导出 Excel 文件」以前**不传 `all`**，于是 `doExport()` 去读
 *   `state.devicesQuery` —— 那是**设备台账页的筛选**。它跨页面存活、在本页面上
 *   完全看不见，所以用户只要在台账里筛过「台式主机」，之后从这里导出就只会得到
 *   台式主机（「按分类分表」只剩一张表），而卡片上还写着「台式主机 / 显示器…
 *   各一个工作表」—— 界面自己打自己的脸，用户连排查方向都没有。
 *
 * 这套断言看住的就是**两类**回归：
 *   1. **又变回「隐式沿用台账筛选」** —— 即使 state 里躺着 category_id，默认也必须导全部；
 *   2. **范围选项消失了 / 台数不显示了** —— 一旦没有可见的线索，故障就又会变成「静默」的。
 *
 * ⚠️ 第 1 类没人看是抓不到的：`doExport()` 少一个 `all: true` 不报错、不冒烟，
 *    只有断言能发现。所以这里**从最终请求 URL 上判**（不是只看代码里有没有那三个字母），
 *    并且专门造一个「台账筛选还在」的 state 去跑。
 *
 * 做法与 tests/ledger-density.js 一致：用 vm 造假 window/document，把真实的 admin.js
 * 整份加载进沙箱 —— 只有这样才看得见模块作用域的 `state` 和那些没挂 window 的函数。
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** admin.js 顶部那行 ES 模块 import 换成桩声明（经典脚本里不许出现 import） */
function esmImportToStub(src) {
  return src.replace(
    /^import\s*\{([\s\S]*?)\}\s*from\s*['"][^'"]*ocr-core\.js['"];?[ \t]*$/m,
    (_all, names) => names.split(',').map((s) => s.trim()).filter(Boolean)
      .map((s) => s.split(/\s+as\s+/).pop().trim())
      .map((n) => (/^[A-Z0-9_]+$/.test(n)
        ? `const ${n} = 1000;`
        : `const ${n} = function ${n}() { throw new Error('${n} 属于识别链路，本套件（导出范围）不调用它'); };`))
      .join('\n'),
  );
}

const JS = esmImportToStub(fs.readFileSync(path.join(ROOT, 'public/assets/admin.js'), 'utf8'));
const CSS = fs.readFileSync(path.join(ROOT, 'public/assets/admin.css'), 'utf8');

let pass = 0;
const fails = [];
const ok = (name, cond, extra) => { if (cond) pass++; else fails.push(name + (extra ? '  → ' + extra : '')); };

/* ================= DOM 桩 =================
 * 与 ledger-density.js 的差别只有一处：**按选择器缓存**。
 * 因为本套件要给 `#expScopeFiltered` 设 checked，每次返回新对象就永远设不上。
 */
class FakeEl {
  constructor(tag) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.children = [];
    this.style = { setProperty() {}, getPropertyValue() { return ''; } };
    this.dataset = {};
    this._attrs = {};
    this._html = '';
    this._text = '';
    this.className = '';
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.hidden = false;
    this._last = null;
    this.classList = {
      _s: new Set(),
      add(...c) { c.forEach((x) => this._s.add(x)); },
      remove(...c) { c.forEach((x) => this._s.delete(x)); },
      toggle(c, f) { const on = f === undefined ? !this._s.has(c) : !!f; on ? this._s.add(c) : this._s.delete(c); return on; },
      contains(c) { return this._s.has(c); },
    };
  }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v); }
  // toast() 会往 lastElementChild 写文字，必须缓存住，否则每次都是新对象、写完就丢
  get lastElementChild() { if (!this._last) this._last = new FakeEl('span'); return this._last; }
  get firstElementChild() { if (!this._first) this._first = new FakeEl('span'); return this._first; }
  setAttribute(k, v) { this._attrs[k] = String(v); }
  getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; }
  removeAttribute(k) { delete this._attrs[k]; }
  appendChild(c) { this.children.push(c); return c; }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); }
  addEventListener() {}
  removeEventListener() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
  closest() { return null; }
  click() {}
  focus() {}
  blur() {}
  remove() {}
  contains() { return false; }
  getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
}

const elCache = new Map();
function elFor(sel) {
  if (!elCache.has(sel)) elCache.set(sel, new FakeEl('div'));
  return elCache.get(sel);
}

function makeDocument() {
  return {
    getElementById(id) { return elFor('#' + id); },
    querySelector(sel) { return elFor(sel); },
    querySelectorAll() { return []; },
    createElement(t) { return new FakeEl(t); },
    createDocumentFragment() { return new FakeEl('fragment'); },
    addEventListener() {},
    removeEventListener() {},
    body: new FakeEl('body'),
    documentElement: new FakeEl('html'),
    head: new FakeEl('head'),
    title: '',
    cookie: '',
    readyState: 'complete',
    hidden: false,
    visibilityState: 'visible',
  };
}

/* ================= 请求桩 =================
 * 记下每一次请求的 URL —— **判据取的是最终 URL，不是源码文本**。
 * 这样「doExportExcel 里到底传没传 all」这件事是按真实行为判的，
 * 而不是按「代码里有没有出现 all 这三个字母」判的（后者一改写法就误判）。
 */
const calls = [];
const DECOY_CAT = 'cat-tabletop';   // 假装台账正筛着「台式主机」
const jsonRes = (obj) => ({
  ok: true, status: 200,
  json: async () => obj,
  text: async () => JSON.stringify(obj),
  blob: async () => ({ size: 4096 }),
  headers: { get: () => '' },
});

const sandbox = {
  console,
  __ok: ok,
  __calls: calls,
  document: makeDocument(),
  localStorage: {
    _d: { itam_token: 'stub-token' },
    getItem(k) { return k in this._d ? this._d[k] : null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; },
  },
  sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  location: {
    href: 'http://127.0.0.1/', hash: '', pathname: '/', search: '',
    protocol: 'http:', host: '127.0.0.1', origin: 'http://127.0.0.1',
    assign() {}, replace() {}, reload() {},
  },
  fetch: async (url) => {
    const u = String(url);
    calls.push(u);
    // boot() 走到这里就直接收摊（未登录 → 跳登录页），免得后面的仪表盘渲染干扰本套件
    if (u.includes('/auth/status')) return jsonRes({ authenticated: false });
    if (u.includes('/excel/batches')) return jsonRes({ items: [] });
    if (u.includes('/excel/live-links')) return jsonRes({ bases: [] });
    if (u.includes('/excel/export')) return jsonRes({});
    if (u.includes('/devices')) {
      const qs = new URLSearchParams(u.split('?')[1] || '');
      // 带筛选 → 660 台（就是那批台式主机）；不带 → 1687 台
      return jsonRes({ items: [], total: qs.has('category_id') ? 660 : 1687, page: 1, pages: 1 });
    }
    return jsonRes({});
  },
  // ⚠️ 必须 unref：doExport 成功后会挂一个 60 秒的「回收 blob URL」定时器，
  //    不 unref 的话本套件跑完还要干等一分钟才退出（看起来像卡住）。
  setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); t.unref?.(); return t; },
  clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: (f) => setTimeout(f, 0),
  cancelAnimationFrame: () => {},
  addEventListener() {}, removeEventListener() {},
  alert() {}, confirm: () => true, prompt: () => null,
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
  URLSearchParams, URL, TextEncoder, TextDecoder, Date, Math, JSON,
  Blob: class {}, FormData: class {}, File: class {}, FileReader: class {},
  Event: class {}, CustomEvent: class {}, MouseEvent: class {},
  SVGElement: class {}, HTMLElement: class {}, Node: class {}, Element: class {},
  crypto: { randomUUID: () => 'uuid-' + Math.random().toString(16).slice(2) },
  getComputedStyle: () => ({ getPropertyValue: () => '' }),
  scrollTo() {}, open() {}, print() {},
  Image: class {},
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
Object.defineProperty(sandbox, 'navigator', {
  value: { userAgent: 'node-test', language: 'zh-CN', clipboard: { writeText: async () => {} }, onLine: true },
  configurable: true, writable: true, enumerable: true,
});

vm.createContext(sandbox);

const bootErrors = [];
try {
  vm.runInContext(JS, sandbox, { filename: 'admin.js' });
} catch (e) {
  bootErrors.push(e);
}
ok('admin.js 能在 DOM 桩里加载（无顶层异常）', bootErrors.length === 0, bootErrors[0] && bootErrors[0].message);
if (bootErrors[0]) ok('加载失败原因不是语法错误（那是夹具写错了，不是回归）',
  bootErrors[0].name !== 'SyntaxError', bootErrors[0].name);

/* ================= 沙箱内的断言 =================
 * 用 fn.toString() 把这段函数源码送进沙箱执行 ——
 * 只有这样才看得见模块作用域的 `state` 和没挂 window 的 exportCardHTML /
 * devicesFilterSummary / doExportExcel。自由变量（state、__ok、__calls…）
 * 在沙箱里按全局名解析。
 */
async function inSandbox() {
  const truthy = (v) => !!v;
  const box = (s) => String(s == null ? '' : s);

  /* ---- 0. 前置：让「设备台账正筛着台式主机」这个状态真的存在 ---- */
  state.options = {
    categories: [{ id: 'c-pc', name: '台式主机' }, { id: 'c-mon', name: '显示器' }],
    orgs: [{ id: 'o-1', name: '总部' }],
    statuses: [{ id: 'in_use', label: '在用' }, { id: 'stock', label: '库存' }],
  };
  state.devicesQuery = {
    page: 1, page_size: 20,
    keyword: '', category_id: 'c-pc', org_id: '', status: '', brand: '', supplier: '',
    sort: 'updated_at', order: 'desc',
  };

  __ok('前置：设备台账当前筛着「台式主机」',
    JSON.stringify(devicesFilterQuery()) === JSON.stringify({ category_id: 'c-pc' }),
    '实测 ' + JSON.stringify(devicesFilterQuery()));

  /* ---- 1. 筛选条件要能翻成人话（不然界面上给不出线索） ---- */
  __ok('筛选条件翻成人话：分类＝台式主机', box(devicesFilterSummary()).includes('分类＝台式主机'),
    '实测「' + devicesFilterSummary() + '」');

  /* ---- 2. 导出卡片：把范围摆出来，且默认「全部设备」 ---- */
  const htmlFiltered = exportCardHTML({ allTotal: 1687, filteredTotal: 660, filterText: '分类＝台式主机' });
  __ok('导出卡片有「全部设备」这一项，且默认勾选', /id="expScopeAll"[^>]*checked/.test(htmlFiltered),
    '找不到默认勾选的 expScopeAll');
  __ok('导出卡片有「只导出设备台账当前的筛选结果」这一项', htmlFiltered.includes('id="expScopeFiltered"'),
    '找不到 expScopeFiltered');
  __ok('「只导出筛选结果」默认**不勾**（勾了就等于悄悄回到老行为）',
    !/id="expScopeFiltered"[^>]*checked/.test(htmlFiltered), 'expScopeFiltered 竟然默认是勾上的');
  __ok('卡片上写明两个范围各多少台', htmlFiltered.includes('（1687 台）') && htmlFiltered.includes('（660 台）'),
    '实测台数文案缺失');
  __ok('卡片上写清筛的是什么（用户才有的对）', htmlFiltered.includes('分类＝台式主机'), '没把筛选条件显示出来');

  const htmlPlain = exportCardHTML({ allTotal: 1687, filteredTotal: null, filterText: '' });
  __ok('台账没有筛选时，不给「只导筛选结果」这个等价选项', !htmlPlain.includes('id="expScopeFiltered"'),
    '没有筛选还给出「按筛选导出」，等于一个永远等价于「全部」的假选项');
  __ok('台账没有筛选时，明说一句没有筛选', htmlPlain.includes('设备台账当前没有筛选条件'), '缺少「没有筛选」的说明');
  __ok('台数拿不到时不渲染 null', !htmlPlain.includes('null'), '把 null 渲染到界面上了');

  /* ---- 3. 核心回归：台账筛着台式主机，默认导出必须仍然是「全部」 ---- */
  // 导出选项里那三个勾选在真实页面上默认就是开的（HTML 里带 checked），
  // 而桩里 createElement 出来的元素默认 checked=false。这里显式打开，
  // 好让 URL 里能看到 split/photos/help —— 否则这组断言会被夹具的默认值带偏。
  $('#expSplit').checked = true;
  $('#expPhotos').checked = true;
  $('#expHelp').checked = true;

  __ok('前置：此刻导出的范围是默认（全部）', exportScopeWanted() === 'all',
    '实测 ' + exportScopeWanted());

  __calls.length = 0;
  await doExportExcel();
  const urlAll = __calls.filter((u) => u.includes('/excel/export')).pop() || '';
  __ok('默认导出真的发出了请求', !!urlAll, '没发出 /excel/export 请求');
  __ok('★ 默认导出**不带**设备台账的 category_id（这就是那个 bug 的判据）',
    urlAll && !urlAll.includes('category_id='), '实测 URL：' + urlAll);
  __ok('默认导出也不带 keyword / org_id / status / brand / supplier',
    urlAll && !/keyword=|org_id=|status=|brand=|supplier=/.test(urlAll), '实测 URL：' + urlAll);
  __ok('默认导出仍然按分类分表（split）', urlAll.includes('split=1'), '实测 URL：' + urlAll);

  /* ---- 4. 主动选「只导出当前筛选结果」时，筛选要**真的**带上 ---- */
  $('#expScopeFiltered').checked = true;
  __ok('勾上之后范围变成 filtered', exportScopeWanted() === 'filtered', '实测 ' + exportScopeWanted());

  __calls.length = 0;
  await doExportExcel();
  const urlFiltered = __calls.filter((u) => u.includes('/excel/export')).pop() || '';
  __ok('★ 选了「只导出筛选结果」就真的带上 category_id（否则这个选项是假的）',
    urlFiltered.includes('category_id=c-pc'), '实测 URL：' + urlFiltered);
  $('#expScopeFiltered').checked = false;

  /* ---- 5. 页面接线：renderExcel 必须把 scope 传进卡片 ---- */
  __calls.length = 0;
  await renderExcel();
  const page = box($('#content').innerHTML);
  __ok('Excel 页面把「范围」渲染出来了（renderExcel 忘了传 scope 就会没有）',
    page.includes('id="expScopeFiltered"'), '页面里找不到范围选项');
  __ok('页面上显示了当前的筛选条件', page.includes('分类＝台式主机'), '页面没显示筛选条件');
  __ok('页面上显示了两个台数', page.includes('（1687 台）') && page.includes('（660 台）'),
    '页面没显示台数');
  __ok('页面确实向 /devices 查了台数', __calls.some((u) => u.includes('/devices?')), '没查台数');

  /* ---- 6. 分类被删掉之后不能崩（显示成「分类已删除」） ---- */
  state.devicesQuery.category_id = 'c-gone';
  let boom = '';
  let summary = '';
  try { summary = devicesFilterSummary(); } catch (e) { boom = e.message; }
  __ok('分类 id 指向已删除的分类时，摘要不抛异常', !boom, boom);
  __ok('分类 id 指向已删除的分类时，摘要写出「分类已删除」', summary.includes('（分类已删除）'),
    '实测「' + summary + '」');

  /* ---- 7. 清空筛选后要回到「只显示全部」 ---- */
  state.devicesQuery.category_id = '';
  __ok('清空筛选后摘要为空', devicesFilterSummary() === '', '实测「' + devicesFilterSummary() + '」');
  __ok('清空筛选后范围退回 all', exportScopeWanted() === 'all', '实测 ' + exportScopeWanted());
}

const grabbed = vm.runInContext('(' + inSandbox.toString() + ')()', sandbox);
try {
  await grabbed;
} catch (e) {
  ok('沙箱内的断言跑完不抛异常', false, e && (e.stack || e.message));
}

/* ================= 8. 样式：范围块不能是裸 div =================
 * 没有样式的话它只是几行普通文字，用户照样看不出「默认导全部」这件事，
 * 故障就重新变成静默的。
 */
for (const cls of ['.xl-scope {', '.xl-scope-t {', '.xl-scope-row {', '.xl-scope-hint {']) {
  ok('admin.css 有 ' + cls.replace(' {', '') + ' 样式',
    CSS.includes(cls) || CSS.includes(cls.replace(' {', '{')),
    cls + ' 没有样式定义，范围选择会以裸文字出现');
}

/* ================= 9. 反例自检：判据本身能不能抓到那个 bug =================
 * 只看“现在全绿”是不够的 —— 得证明**这条判据真的会红**。
 * 做法是在内存里把 `all: true` 抹掉（复现老代码），看第 3 组断言是否被触发。
 */
{
  const broken = JS.replace(/\.\.\.\(all \? \{ all: true \} : \{\}\)/, '...(all ? {} : {})');
  ok('反例自检：能构造出「不传 all」的坏版本', broken !== JS,
    '找不到那行代码，本项自检失效（源码写法变了就回来更新正则）');

  if (broken !== JS) {
    // 需要一个**全新**的沙箱：不能污染主沙箱里已经跑出来的 state。
    // 逐键拷贝、再把 window/globalThis/self 指回自己 —— 直接 { ...sandbox } 会让
    // 这三个键仍指向**旧**沙箱，源码里 `window.xxx` 就取到别处去了。
    const sb2 = {};
    for (const k of Object.keys(sandbox)) sb2[k] = sandbox[k];
    sb2.__calls = [];
    sb2.__ok = () => {};
    sb2.window = sb2; sb2.globalThis = sb2; sb2.self = sb2;
    vm.createContext(sb2);
    vm.runInContext(broken, sb2, { filename: 'admin.js.broken' });
    const u = await vm.runInContext(`(async () => {
      state.options = { categories: [{ id: 'c-pc', name: '台式主机' }], orgs: [], statuses: [] };
      state.devicesQuery = { page: 1, page_size: 20, keyword: '', category_id: 'c-pc',
        org_id: '', status: '', brand: '', supplier: '', sort: 'updated_at', order: 'desc' };
      await doExportExcel();
      return __calls.filter((x) => x.includes('/excel/export')).pop() || '';
    })()`, sb2);
    ok('★ 反例自检：抹掉 all:true 后，导出 URL 里**会**出现 category_id（证明第 3 组判据有效）',
      String(u).includes('category_id='), '实测坏版本 URL：' + u);
  }
}

/* ================= 汇报 ================= */
for (const f of fails) console.log('  ✗ ' + f);
console.log(`\nExcel 导出范围回归：${pass} 通过 / ${fails.length} 失败\n`);
process.exit(fails.length ? 1 : 0);
