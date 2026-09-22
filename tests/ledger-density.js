/**
 * 窄屏「设备台账」结构与密度回归测试。
 *
 *   node tests/ledger-density.js          （不需要起服务）
 *
 * 为什么要有它：设备台账在窄屏（≤760px）会把表格行折成卡片，一张卡最多 9 行，
 * 而其中「所属组织 / 使用人 / 保修」经常是破折号 —— 用户反馈「留空太多，设备多了很难找」。
 * 修法是在 760 断点里把空值行不渲染（.blank），并把首行（勾选框 + 行内操作）与
 * 资产编号的行底对齐，同时把筛选区从「5 个下拉各占一行」压成两列。
 *
 * 这类改动最容易出的两类事故，都靠这套断言看住：
 *   1. **动了选择器但没动 JS** —— bindDeviceEvents() 全靠 id 绑事件，掉一个就是静默失效；
 *   2. **密度改回去了** —— 光靠人眼看 CSS 是看不住的。
 *
 * 做法：用 vm 造一个假 window/document，把真实的 admin.js 整份加载进去，
 * 然后**在沙箱内部** eval 一段取值表达式（admin.js 是 <script>，state 是模块作用域的
 * let，只有沙箱内才看得见），把 devicesViewHTML() 的产出取成字符串再做断言。
 * 再配一个极简 HTML 标签解析器，把「哪些 td 真的会显示」算出来 ——
 * 直接断言最终行数，而不是只断言 class 名。
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JS = fs.readFileSync(path.join(ROOT, 'public/assets/admin.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'public/assets/admin.css'), 'utf8');

let pass = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; return; }
  fails.push(name + (extra ? '  → ' + extra : ''));
}
function has(str, sub, name) {
  ok(name + '  [' + sub + ']', typeof str === 'string' && str.includes(sub), 'got ' + typeof str);
}
function hasNot(str, sub, name) {
  ok(name + '  不应含 [' + sub + ']', !(typeof str === 'string' && str.includes(sub)), 'got ' + typeof str);
}

/* ================= 1. 加载真实 admin.js ================= */

class FakeEl {
  constructor(tag) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.children = [];
    this.style = { setProperty() {}, getPropertyValue() { return ''; } };
    this.dataset = {};
    this._attrs = {};
    this._html = '';
    this._text = '';
    this.value = '';
    this.disabled = false;
    this.checked = false;
    this.hidden = false;
    this.classList = {
      _s: new Set(),
      add(...c) { c.forEach((x) => this._s.add(x)); },
      remove(...c) { c.forEach((x) => this._s.delete(x)); },
      toggle(c) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); },
      contains(c) { return this._s.has(c); },
    };
  }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v); }
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

const store = { itam_token: 'stub-token' };
const sandbox = {
  console,
  document: makeDocument(),
  localStorage: {
    _d: { ...store },
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
  fetch: async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '', headers: new Map() }),
  setTimeout, clearTimeout, setInterval, clearInterval,
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
// Node 里 globalThis.navigator 是只读 getter，只能 defineProperty 覆盖
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
// boot() 会在文件末尾自动跑，桩里缺节点是正常的，单独看它是不是语法/引用错误
const bootErr = bootErrors[0];
if (bootErr) ok('加载失败原因不是语法错误', bootErr.name !== 'SyntaxError', bootErr.name);

/* ================= 2. 在沙箱内取 devicesViewHTML() ================= */

// 关键：state 是 admin.js 的模块作用域 let，沙箱外看不见，
// 连 devicesViewHTML 都是 async 的（第 720 行有 `await devicesViewHTML()`）。
// 所以把「写 state + 调函数 + 抓返回值」整段塞进沙箱里跑，
// 并把 Promise 挂到沙箱上供外面 await（vm 的返回值不会自动 await）。
vm.runInContext(`
  globalThis.__grab = (async function(){
    try {
      state.options = {
        categories: [{ id: 1, name: '台式主机', icon: 'pc' }, { id: 2, name: '显示器', icon: 'mon' }],
        orgs: [{ id: 1, name: '总部', path: '总部 / 信息中心' }],
        statuses: [{ id: 'in_use', label: '在用' }, { id: 'repair', label: '维修中' }],
        brands: [{ v: '戴尔', c: 3 }],
        suppliers: ['京东自营'],
      };
      state.auth = { username: 't', display_name: '测试', role: 'admin', role_label: '管理员',
        permissions: ['device.write', 'device.delete', 'excel.export', 'device.read'], must_change: false };
      state.devicesQuery = { page: 1, page_size: 20, keyword: '', category_id: '', org_id: '',
        status: '', brand: '', supplier: '', sort: 'updated_at', order: 'desc' };
      var html = await devicesViewHTML();
      return String(html);
    } catch (e) { return '__ERR__' + (e && e.message); }
  })();
`, sandbox, { filename: 'grab.js' });

let viewHTML = '';
try {
  viewHTML = String(await sandbox.__grab);
} catch (e) {
  viewHTML = '__THROW__' + e.message;
}
ok('devicesViewHTML() 调用成功', typeof viewHTML === 'string' && !viewHTML.startsWith('__'),
  String(viewHTML).slice(0, 200));

/* ================= 3. 极简 HTML 解析：算出真实可见的 td ================= */

/** 把一段 HTML 解析成 [{tag, attrs, html}] 的扁平序列（本用例只需要 td/tr）。 */
function tags(html, tagName) {
  const out = [];
  const re = new RegExp('<' + tagName + '\\b([^>]*)>', 'gi');
  let m;
  while ((m = re.exec(html))) out.push({ raw: m[0], attrs: m[1], index: m.index });
  return out;
}
function classOf(attrStr) {
  const m = attrStr.match(/class="([^"]*)"/);
  return m ? m[1].split(/\s+/).filter(Boolean) : [];
}

/** 从 devicesViewHTML 的 <thead> 里取列数，确认列没被删 */
function theadCols(html) {
  const a = html.indexOf('<thead');
  const b = html.indexOf('</thead>');
  if (a < 0 || b < 0) return 0;
  return tags(html.slice(a, b), 'th').length;
}

/** 按 admin.css 的 760 断点规则，算一行 tr 最终显示几条 td。 */
function visibleCells(cells) {
  const blanks = cells.filter((c) => c.cls.includes('blank'));
  const nonBlank = cells.length - blanks.length;
  // 有非空格撑场 → 空值格全隐（td.blank { display:none }）
  if (nonBlank > 0) return nonBlank;
  // 全篇皆空（现实中不会发生，因为状态/更新时间永远有值）→ 兜底保留第一条 blank
  return 1;
}

/* ================= 4. 断言：筛选区结构 ================= */

if (viewHTML && !viewHTML.startsWith('__')) {
  has(viewHTML, 'class="toolbar"', '筛选区仍是 .toolbar');
  has(viewHTML, 'class="fbar"', '5 个下拉被 .fbar 包住（窄屏才能排成两列）');

  const fbarOpen = viewHTML.indexOf('<div class="fbar">');
  ok('.fbar 能定位', fbarOpen > 0);
  const fbarClose = fbarOpen > 0 ? viewHTML.indexOf('</div>', fbarOpen) : -1;
  const fbar = fbarOpen > 0 && fbarClose > fbarOpen ? viewHTML.slice(fbarOpen, fbarClose) : '';
  for (const id of ['fCategory', 'fOrg', 'fStatus', 'fBrand', 'fSupplier']) {
    has(fbar, 'id="' + id + '"', id + ' 仍在 .fbar 内');
  }
  hasNot(fbar, 'fKeyword', '.fbar 内不含搜索框（它要独占一行）');
  ok('.fbar 内正好 5 个 select', tags(fbar, 'select').length === 5, '实际 ' + tags(fbar, 'select').length + ' 个');

  has(viewHTML, 'class="grow"', '右推占位改用 .grow 类');
  hasNot(viewHTML, 'style="flex:1"', '不再用内联 style="flex:1"（类才能被媒体查询覆盖）');

  // bindDeviceEvents() 全靠这些 id，掉一个 = 静默失效
  for (const h of ['id="fKeyword"', 'id="fSearch"', 'id="fReset"', 'id="btnAdd"', 'id="btnExport"',
                   'id="btnBulk"', 'id="selAll"', 'id="devicesBody"', 'id="bulkMenu"', 'id="pageInfo"', 'id="pageBtns"']) {
    has(viewHTML, h, '钩子保留 ' + h);
  }
  has(viewHTML, 'table class="grid"', 'table.grid 保留');
  has(viewHTML, 'class="table-wrap"', 'table-wrap 保留');
  has(viewHTML, 'class="pagination"', 'pagination 保留');
  ok('表头仍是 11 列（列没被删）', theadCols(viewHTML) === 11, '实际 ' + theadCols(viewHTML));
  // 行模板也是 11 格，与表头对齐
  const tplProbe = JS.slice(JS.indexOf('body.innerHTML = data.items.map((d) => `'));
  const tplBody = tplProbe.slice(0, tplProbe.indexOf('`).join('));
  ok('行模板也是 11 格（与表头一一对应）', (tplBody.match(/<td\b/g) || []).length === 11,
    '实际 ' + (tplBody.match(/<td\b/g) || []).length + ' 格');
}

/* ================= 5. 断言：行模板与「空值行」语义 ================= */

const tplStart = JS.indexOf('body.innerHTML = data.items.map((d) => `');
ok('行模板可定位', tplStart > 0);
if (tplStart > 0) {
  const tplEnd = JS.indexOf('`).join(', tplStart);
  const rowTpl = JS.slice(tplStart, tplEnd > 0 ? tplEnd : tplStart + 3000);

  has(rowTpl, "' blank'", '空值 td 会带 .blank');
  has(rowTpl, 'data-label="所属组织"', '所属组织 的 data-label 保留');
  has(rowTpl, 'data-label="使用人"', '使用人 的 data-label 保留');
  has(rowTpl, 'data-label="保修"', '保修 的 data-label 保留');
  has(rowTpl, 'data-label="状态"', '状态 的 data-label 保留');
  has(rowTpl, 'type="button"', '行内按钮显式 type=button');

  // 回归守卫：不能把「哪些行是空的」判定写到 .map() 外面。
  // 这里踩过一次真实事故：const blankCount = (d.org_path ...) 写在 data.items.map((d) => ...) 之前，
  // 语法检查过得去（d 是运行时未定义），但一渲染就 ReferenceError: d is not defined，
  // render-smoke 立刻红。所以「每台设备算一次」的东西必须待在 map 回调体内。
  const mapIdx = JS.indexOf('body.innerHTML = data.items.map((d) => `');
  const beforeMap = JS.slice(Math.max(0, mapIdx - 420), mapIdx);
  ok('map 之前没有引用 d 的语句（防 ReferenceError）',
    !/\bd\.\w/.test(beforeMap), 'map 前 420 字里出现了 d.xxx：' + (beforeMap.match(/\bd\.\w+/g) || []).join(','));
  hasNot(JS, 'no-extra', '不需要 JS 侧的全空标记（兜底已交给 CSS 的 :has）');

  // 反例守卫：只有「组织 / 使用人」两列允许 .blank。
  // 保修列有空态（warranty_expired == null）但是它同时是「已过期」告警位，不能整体隐藏；
  // 状态 / 更新时间 永远有值。误加 .blank 会让信息凭空消失。
  const blankOccurrences = (rowTpl.match(/\bblank\b/g) || []).length;
  ok('.blank 只出现在 组织/使用人 两列（出现次数 ≤ 4，含注释）', blankOccurrences <= 4,
    '.blank 出现 ' + blankOccurrences + ' 次');
  const orgLine = rowTpl.split('\n').find((l) => l.includes('data-label="所属组织"')) || '';
  const ownLine = rowTpl.split('\n').find((l) => l.includes('data-label="使用人"')) || '';
  const warLine = rowTpl.split('\n').find((l) => l.includes('data-label="保修"')) || '';
  ok('所属组织 列带 .blank', orgLine.includes('blank'));
  ok('使用人 列带 .blank', ownLine.includes('blank'));
  hasNot(warLine, 'blank', '保修 列不整体隐藏（它是告警位）');
}

/* ================= 6. 断言：760 断点的可见行数（模拟式） ================= */

// 行模板固定 11 格。其中只有「所属组织 / 使用人 / 保修」会带 .blank。
// key 必须唯一 —— 勾选框与操作格都没有 data-label（label 都是空串），
// 用 label 当键会把这两格一起标成 blank，断言就假了。
const CELLS = [
  { key: 'check', cls: [], label: '' },           // 0 勾选框
  { key: 'asset', cls: [], label: '资产编号' },    // 1
  { key: 'cat', cls: [], label: '分类' },          // 2
  { key: 'brand', cls: [], label: '品牌 / 型号' }, // 3
  { key: 'sn', cls: [], label: 'SN' },             // 4
  { key: 'org', cls: [], label: '所属组织' },      // 5 可空
  { key: 'owner', cls: [], label: '使用人' },      // 6 可空
  { key: 'status', cls: [], label: '状态' },       // 7
  { key: 'warranty', cls: [], label: '保修' },     // 8 可空（且是告警位）
  { key: 'updated', cls: [], label: '更新时间' },  // 9
  { key: 'act', cls: [], label: '' },              // 10 行内操作
];
/** 把指定 key 的格子标成空值，得到一张具体的卡片。 */
const card = (...blankKeys) => CELLS.map((c) =>
  blankKeys.includes(c.key) ? { ...c, cls: ['blank'] } : { ...c });

// 用户截图里那台 PC-2026-0060：组织 / 使用人 / 保修 都是破折号
const SAMPLE_TYPICAL = card('org', 'owner', 'warranty');
ok('典型设备卡片行数 11 → ' + visibleCells(SAMPLE_TYPICAL),
  visibleCells(SAMPLE_TYPICAL) === 8, '实际 ' + visibleCells(SAMPLE_TYPICAL));
ok('比改前少 3 行（原来 11 行会折成一屏半）', visibleCells(SAMPLE_TYPICAL) === 11 - 3);

// 资料齐全的设备：一行都不能少
const SAMPLE_FULL = card();
ok('资料齐全的设备仍是 11 行（不该误伤）', visibleCells(SAMPLE_FULL) === 11,
  '实际 ' + visibleCells(SAMPLE_FULL));

// 只空一格的设备
ok('只空「使用人」时 11 → 10', visibleCells(card('owner')) === 10);
ok('只空「保修」时 11 → 10（告警位也不能整体藏）', visibleCells(card('warranty')) === 10);

// 三格全空（用户截图那台的形态）→ 8 行。
// 注意：状态 / 更新时间 永远有值，所以现实中走不到「全篇皆空」的兜底分支。
// 该分支的意义是：万一将来又加了一列也会变成 blank 的字段，卡片也不会空成一张白纸。
ok('三格全空时 11 → 8 行', visibleCells(card('org', 'owner', 'warranty')) === 8,
  '实际可见 ' + visibleCells(card('org', 'owner', 'warranty')));
ok('兜底分支：全篇皆空时仍留 1 条占位（不会变白纸）',
  visibleCells(CELLS.map((c) => ({ ...c, cls: ['blank'] }))) === 1);

// 回归守卫：.blank 只挂在 org / owner 两列上，保修是告警位不能整体隐藏。
// 这条断言直接读 JS，防止有人在模板里给保修也加上 blank。
{
  const tplStart2 = JS.indexOf('body.innerHTML = data.items.map((d) => `');
  const tplEnd2 = JS.indexOf('`).join(', tplStart2);
  const rowTpl2 = JS.slice(tplStart2, tplEnd2 > 0 ? tplEnd2 : tplStart2 + 3000);
  const lines = rowTpl2.split('\n');
  const orgLine = lines.find((l) => l.includes('data-label="所属组织"')) || '';
  const ownLine = lines.find((l) => l.includes('data-label="使用人"')) || '';
  const warLine = lines.find((l) => l.includes('data-label="保修"')) || '';
  const stLine = lines.find((l) => l.includes('data-label="状态"')) || '';
  const upLine = lines.find((l) => l.includes('data-label="更新时间"')) || '';
  ok('所属组织 列带 blank', orgLine.includes('blank'), orgLine.trim().slice(0, 90));
  ok('使用人 列带 blank', ownLine.includes('blank'), ownLine.trim().slice(0, 90));
  ok('保修 列不带 blank（告警位要一直可见）', !warLine.includes('blank'), warLine.trim().slice(0, 90));
  ok('状态 列不带 blank', !stLine.includes('blank'));
  ok('更新时间 列不带 blank', !upLine.includes('blank'));
}

/* ================= 7. 断言：CSS 规则 ================= */

const mq760 = CSS.indexOf('@media (max-width: 760px)');
ok('存在 760 断点', mq760 > 0);
const mq760End = CSS.indexOf('\n}\n', mq760) + 3;
const mq760Block = CSS.slice(mq760, mq760End);

has(mq760Block, 'table.grid td.blank { display: none; }', '760 断点隐藏 .blank');
has(mq760Block, 'tr:has(td.blank) td:not(.blank) ~ td.blank { display: flex; }', '.no-extra 兜底：保留第一条 blank');
has(mq760Block, 'td:not(.blank) ~ td.blank ~ td.blank { display: none; }', '.no-extra 兜底：只保留一条');
has(mq760Block, 'content: attr(data-label)', '760 断点仍用 data-label 做行标签');
has(mq760Block, 'table.grid td.keep', '760 断点有 .keep 首行样式');
has(mq760Block, 'padding: 8px 0', '760 断点行内边距收紧到 8px');
has(mq760Block, 'padding: 10px 14px 4px', '760 断点卡片内边距收紧');

const mq900 = CSS.indexOf('@media (max-width: 900px)');
ok('存在 900 断点', mq900 > 0 && mq900 < mq760);
const mq900Block = CSS.slice(mq900, mq760);

has(mq900Block, '.toolbar .fbar { display: grid; grid-template-columns: 1fr 1fr;', '900 断点 .fbar 两列');
has(mq900Block, '.toolbar > .grow { display: none; }', '900 断点藏掉 .grow');
has(mq900Block, '.toolbar > .dropdown { order: 9', '900 断点把「批量操作」推到行尾');
hasNot(mq900Block, '.toolbar > input, .toolbar > select { width: 100% !important; }',
  'OLD 规则「所有下拉各占一行」已移除');
ok('下拉在两列网格里仍不溢出（有 min-width:0）',
  mq900Block.includes('.toolbar .fbar > select { width: 100% !important; min-width: 0; }'),
  '缺 min-width:0 时 select 的固有宽度会撑破 1fr 1fr');
has(mq900Block, '.toolbar > h3 { flex-basis: 100%;', 'h3 仍整行（其它页面在用）');

// 桌面端不能被波及
const desktopGrow = CSS.slice(CSS.indexOf('.toolbar .grow'), CSS.indexOf('.toolbar h3 {'));
has(desktopGrow, 'flex: 1', '桌面端 .grow 与旧内联 style="flex:1" 等价');
ok('桌面 .toolbar 仍是 flex 行', CSS.includes('.toolbar { display: flex; flex-wrap: wrap;'));
ok('桌面端没有把 .fbar 设成 grid（保持一行铺开）',
  !CSS.slice(0, mq900).includes('.fbar { display: grid'), '桌面上 .fbar 不该改布局');

/* ================= 8. 本轮不该动的还完好 ================= */

// 上一轮的环形图「穿模」修复：半径由 JS 依 size/stroke 算，外沿贴框。
// 这个断言是防回归的哨兵 —— 只要有人把 .donut svg 整体旋转或把容器写死尺寸，它就会响。
has(CSS, '.donut svg > circle', '环形图只转环本身（不转整个 svg）');
has(CSS, 'transform: rotate(-90deg)', '环形图起笔角度仍在');
has(CSS, '#2563eb', 'v3 强调色仍在');
// 这个仓库的移动端安全区写法（CSS 变量 --safe-b 属于 public/assets/m.css，管理端用 env()）
has(CSS, 'env(safe-area-inset-bottom)', '管理端安全区内边距仍在');
has(JS, 'ICON_PATHS', '图标系统仍在');
has(JS, 'devicesViewHTML', 'devicesViewHTML 仍在');
has(JS, 'bindDeviceEvents', 'bindDeviceEvents 仍在');
// 管理端没有 renderHome（那是移动端 m.js 的），这里改成看移动端两个文件还在不在
ok('public/assets/m.js 仍存在（移动端未被误删）',
  fs.existsSync(path.join(ROOT, 'public/assets/m.js')));
ok('public/assets/m.css 仍存在', fs.existsSync(path.join(ROOT, 'public/assets/m.css')));
const MJS = fs.readFileSync(path.join(ROOT, 'public/assets/m.js'), 'utf8');
has(MJS, 'function renderHome()', '移动端 renderHome 兼容壳仍在');
has(MJS, 'window.renderHome', '移动端 window.renderHome 导出仍在');
has(MJS, 'renderHomeLegacy', '移动端 renderHomeLegacy 仍在');

/* ================= 汇总 ================= */
console.log('');
if (bootErrors.length) {
  console.log('加载异常：', bootErrors[0].stack ? bootErrors[0].stack.split('\n').slice(0, 5).join('\n') : bootErrors[0]);
}
// __CONCURRENT_GUARD__ ===== 并行改动者新增样式的守护断言 =====
// 这一段守护的不是我写的规则，而是「别人加的样式别把我的规则冲掉」。
// 仓库有并行改动者（见 .workbuddy/memory/MEMORY.md 铁律 #4），
// 2026-09-20 02:19 出现过 admin.css 在我交付后被追加 264 字节的情况。
{
  const cssPath = path.join(ROOT, 'public/assets/admin.css');
  const CSS = fs.readFileSync(cssPath, 'utf8');

  // ⚠️ 取 @media 块必须用**花括号配平**，不能用 /@media ... \{([\s\S]*?)\n\}/ 这种非贪婪匹配。
  //    非贪婪版会在**第一个行首 `}`** 处收手，所以只要文件里在目标块**之前**出现
  //    另一个同断点的 @media 块，抓到的就是那一个 —— 断言全红，代码其实没坏。
  //    2026-09-20 Round 7 就是这样：给二维码弹窗加了一个 900px 块，本套件立刻误报
  //    「.fbar 两列栅格被改掉了 / grow 隐藏丢了」。
  //    教训：**测试里解析 CSS 的锚点必须配平括号**，否则测试会随无关改动飘。
  const mediaBlock = (css, px) => {
    const head = `@media (max-width: ${px}px) {`;
    const start = css.indexOf(head);
    if (start < 0) return null;
    let i = start + head.length;
    let depth = 1;
    while (i < css.length && depth > 0) {
      const ch = css[i];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      i++;
    }
    return { body: css.slice(start + head.length, i - 1), full: css.slice(start, i) };
  };

  // 1) 760px 块必须仍然只包含卡片密度规则，不能被后来的样式混进去
  const m760 = mediaBlock(CSS, 760);
  ok('760px 媒体查询块存在', !!m760, '没找到 @media (max-width: 760px)');
  if (m760) {
    const body760 = m760.body;
    ok('760px 块内仍是卡片密度规则', body760.includes('table.grid tr'), '块内找不到 table.grid tr');
    ok('760px 块内没混入帮助点样式（.help / .help-tip）',
      !/\.help(-tip)?\b/.test(body760), '帮助点样式跑进 760px 块了，会跟着卡片一起被改');
    ok('760px 块内没混入 .sw-inline', !body760.includes('.sw-inline'), '.sw-inline 跑进 760px 块了');
    // .blank 的三条规则必须都还在（卡片密度全靠它们）
    ok('760px 块保留 td.blank 隐藏', body760.includes('table.grid td.blank { display: none; }'), 'td.blank 规则丢了');
    ok('760px 块保留「全空兜底」第一条可见',
      /tr:has\(td\.blank\) td:not\(\.blank\) ~ td\.blank \{ display: flex; \}/.test(body760),
      '全空兜底规则丢了，三条都空的卡片会只剩编号');
    ok('760px 块保留「第二条起不显示」',
      /~ td\.blank ~ td\.blank \{ display: none; \}/.test(body760),
      '第二条兜底规则丢了');
  }

  // 2) 900px 块里的筛选栏改造仍是「下拉两列」而不是「每个 100% 一行」
  //    文件里可能有**多个** 900px 块（例如二维码弹窗那个），所以要按内容挑
  //    「含 .toolbar 的那一块」—— 不能闭眼取第一个。
  const all900 = [];
  {
    let from = 0;
    for (;;) {
      const at = CSS.indexOf('@media (max-width: 900px) {', from);
      if (at < 0) break;
      const b = mediaBlock(CSS.slice(at), 900);
      all900.push(b.body);
      from = at + 1;
    }
  }
  const m900 = all900.length ? { body: all900.find((b) => b.includes('.toolbar')) || all900[0] } : null;
  ok('900px 媒体查询块存在', !!m900, '没找到 @media (max-width: 900px)');
  if (m900) {
    const body900 = m900.body;
    ok('900px 块保留 .fbar 两列栅格',
      body900.includes('grid-template-columns: 1fr 1fr'), '.fbar 的两列栅格被改掉了');
    ok('900px 块内没有「所有控件拉满宽」的老写法',
      !/\.toolbar > (input,\s*)?select \{[^}]*width: 100% !important/.test(body900),
      '老写法回来了：每个下拉会各占一整行，筛选区又要吃掉 460px');
    ok('900px 块保留 .toolbar > .grow 隐藏', body900.includes('.toolbar > .grow { display: none; }'), 'grow 隐藏丢了');
  }

  // 3) 帮助点样式用到的令牌都有定义（否则会渲染成透明/继承色，看起来像坏掉）
  for (const tok of ['--ink', '--ink-4', '--primary', '--radius-md', '--ease']) {
    ok('令牌 ' + tok + ' 有定义', new RegExp('\\' + tok + '\\s*:').test(CSS), tok + ' 未定义，帮助点会掉色');
  }

  // 4) 我这轮新增的两个桌面规则别被删（窄屏靠它们收窄）
  ok('桌面保留 .toolbar .grow 撑开规则', CSS.includes('.toolbar .grow { flex: 1; }'), '.toolbar .grow 丢了');
  ok('桌面保留 .toolbar flex-wrap', /\.toolbar \{[^}]*flex-wrap: wrap/.test(CSS), '.toolbar 不再换行');

  // 5) 花括号配平（并行改动最容易漏一个 }，CSS 从漏点之后整段失效）
  const open = (CSS.match(/\{/g) || []).length;
  const close = (CSS.match(/\}/g) || []).length;
  ok('admin.css 花括号配平', open === close, `{ 有 ${open} 个，} 有 ${close} 个`);
}

/* ================= 跨页批量选择（2026-09-21） =================
 *
 * 用户报障：「批量操作最多只能操作 20 个，就是一页只有 20 个」。
 *
 * 病根不在后端（/devices/bulk 一直收任意 id 列表），而在前端的一行：
 *     refreshSelection() { state.selection = new Set($$('#devicesBody input.row-check:checked').map(...)) }
 * —— 把 state 从**当前页的 DOM** 重建。于是翻页 = 新 DOM = 上一页的勾选被静默丢掉。
 * 「20」既是页面尺寸也是真实上限，因为它们共用同一个来源。
 *
 * 这类 bug 的特点是**不报错、不冒烟、界面看起来完全正常**：
 * 数字跟着走、按钮能点、请求能通，只是操作范围永远被悄悄砍到一页。
 * 所以必须把「state 独立于 DOM 存活」这件事钉成断言，光看代码是看不出来的。
 */
{
  // 让沙箱里的 document.querySelectorAll('#devicesBody input.row-check') 返回一撮可控的假勾选框，
  // 这样才能**真的调用** refreshSelection() / syncSelectionUI()，而不是在断言里手抄一遍逻辑 ——
  // 手抄的逻辑永远会通过，被测的代码坏了也照绿（这是本套件最容易犯的错）。
  const sel = await (async () => {
    vm.runInContext(`
      globalThis.__sel = (async function(){
        const out = {};
        let rowChecks = [];                       // 当前页 DOM 里的勾选框
        const qsa = document.querySelectorAll;
        document.querySelectorAll = function (s) {
          if (String(s).includes('row-check')) return rowChecks;
          return qsa ? qsa.apply(document, arguments) : [];
        };
        // 模拟 loadDevices() 渲染完一页：行勾选框按 state 预勾选，并挂上 onchange
        const renderPage = (ids) => {
          rowChecks = ids.map((id) => ({
            value: String(id),
            checked: state.selection.has(String(id)),
            onchange: null,
          }));
          rowChecks.forEach((c) => { c.onchange = refreshSelection; });
          refreshSelection();
          return rowChecks;
        };
        const checkedNow = () => rowChecks.filter((c) => c.checked).map((c) => c.value);

        state.selection = new Set();
        state.selectAllMatching = 0;

        // ---- 第 1 页：用户点了 101、102 ----
        renderPage([101, 102, 103]);
        rowChecks[0].checked = true;
        rowChecks[1].checked = true;
        refreshSelection();
        out.afterPage1 = [...state.selection].sort();

        // ---- 翻到第 2 页：DOM 换成新一批（101/102 不在其中） ----
        renderPage([201, 202, 203]);
        out.page2Prefilled = checkedNow();
        rowChecks[0].checked = true;              // 用户在第 2 页勾了 201
        refreshSelection();
        out.afterPage2 = [...state.selection].sort();

        // ---- 翻回第 1 页：state 里应该还留着 101/102 ----
        renderPage([101, 102, 103]);
        out.page1Revisited = checkedNow();

        // ---- 载荷形态 ----
        state.selectAllMatching = 0;
        state.selection = new Set(['a', 'b', 'c']);
        out.payloadIds = JSON.stringify(bulkSelectionPayload());
        state.selectAllMatching = 437;
        state.devicesQuery = { page: 2, page_size: 20, keyword: '显示器', category_id: '9',
          org_id: '', status: 'in_use', brand: '', supplier: '', sort: 'updated_at', order: 'desc' };
        out.payloadAll = JSON.stringify(bulkSelectionPayload());
        out.filterQuery = JSON.stringify(devicesFilterQuery());
        // ⚠️ 分页/排序绝不能混进筛选条件 —— 混进去「全选匹配」就只作用于第 2 页了
        out.queryHasNoPage = !/page|sort|order/.test(out.filterQuery);

        // ---- 计数口径（走真实函数算出来的按钮文案） ----
        state.selectAllMatching = 0;
        state.selection = new Set(['a', 'b']);
        syncSelectionUI();
        out.btnIds = document.getElementById('btnBulk').textContent;
        state.selectAllMatching = 55;
        syncSelectionUI();
        out.btnAll = document.getElementById('btnBulk').textContent;

        // ---- 清除 ----
        clearSelection();
        out.afterClear = state.selection.size + '|' + state.selectAllMatching;

        document.querySelectorAll = qsa;
        return JSON.stringify(out);
      })();
    `, sandbox, { filename: 'sel.js' });
    try { return JSON.parse(String(await sandbox.__sel)); } catch (e) { return { __err: e.message }; }
  })();

  if (sel.__err) {
    ok('跨页选择沙箱执行', false, sel.__err);
  } else {
    ok('跨页选择沙箱执行', true);
    ok('第 1 页勾选后 state 里有 2 台',
      JSON.stringify(sel.afterPage1) === '["101","102"]', '实际 ' + JSON.stringify(sel.afterPage1));
    // 第 2 页本来就没有 101/102，所以本页预填为空是**正确**的；关键看翻回来那一条。
    ok('第 2 页上新行的预填只反映本页成员',
      Array.isArray(sel.page2Prefilled) && sel.page2Prefilled.length === 0,
      '实际 ' + JSON.stringify(sel.page2Prefilled));
    ok('第 2 页勾一台后 state 累计 3 台（跨页累加，不是覆盖）',
      JSON.stringify(sel.afterPage2) === '["101","102","201"]',
      '实际 ' + JSON.stringify(sel.afterPage2) + ' —— 说明翻页时 state 被新页覆盖了');
    ok('翻回第 1 页时 101/102 仍是勾上的（state 独立于 DOM 存活）',
      JSON.stringify(sel.page1Revisited) === '["101","102"]',
      '实际 ' + JSON.stringify(sel.page1Revisited) + ' —— 翻页把勾选丢了，就是「只能操作 20 个」的病根');

    ok('未开全选匹配时载荷是 { ids:[...] }',
      sel.payloadIds === '{"ids":["a","b","c"]}', '实际 ' + sel.payloadIds);
    ok('开全选匹配后载荷是 { all_matching:true, query }',
      /^\{"all_matching":true,"query":\{/.test(sel.payloadAll), '实际 ' + sel.payloadAll);
    ok('全选匹配的 query 不含分页/排序字段', sel.queryHasNoPage === true,
      '实际 query = ' + sel.filterQuery);
    ok('全选匹配的 query 保留了真实筛选（keyword + category_id + status）',
      sel.filterQuery.includes('"keyword":"显示器"') && sel.filterQuery.includes('"category_id":"9"') && sel.filterQuery.includes('"status":"in_use"'),
      '实际 query = ' + sel.filterQuery);

    ok('按钮文案：逐台勾选时为「批量操作 (2) ▾」',
      sel.btnIds === '批量操作 (2) ▾', '实际 ' + JSON.stringify(sel.btnIds));
    ok('按钮文案：全选匹配时为「批量操作 (55) ▾」而非集合大小',
      sel.btnAll === '批量操作 (55) ▾', '实际 ' + JSON.stringify(sel.btnAll));

    ok('clearSelection() 同时清空集合与全选标记', sel.afterClear === '0|0', '实际 ' + sel.afterClear);
  }

  // 函数名不能和 state 字段撞车：同名会让「少写 state. 前缀」变成静默调到自己
  ok('进入全选匹配的函数不叫 selectAllMatching（避免与 state 字段同名）',
    !/function selectAllMatching\s*\(/.test(JS), '函数名和 state.selectAllMatching 撞车了');
  ok('存在 enterSelectAllMatching 函数', /function enterSelectAllMatching\s*\(/.test(JS), '找不到 enterSelectAllMatching');

  // 来源级守护：refreshSelection 不许再出现「从 DOM 重建整个 Set」的写法。
  // ⚠️ 必须**只看函数的代码体**，不能全文搜 —— 上面那段 JSDoc 为了讲清病根，
  //    原文引用了旧写法 `state.selection = new Set($$('#devicesBody ...`，
  //    全文搜会把这段注释本身当成违规（2026-09-21 实际踩到：127 通过 / 1 失败，红的是注释）。
  //    这类「注释里引用了被禁止的代码」的误报很常见，判据要落在代码而不是文本上。
  {
    const fnStart = JS.indexOf('function refreshSelection()');
    // 取函数体：从函数头到下一个顶层 `}` 后第一个空行
    let body = '';
    if (fnStart >= 0) {
      let depth = 0, i = JS.indexOf('{', fnStart);
      const from = i;
      for (; i < JS.length; i++) {
        if (JS[i] === '{') depth++;
        else if (JS[i] === '}') { depth--; if (depth === 0) { i++; break; } }
      }
      body = JS.slice(from, i);
    }
    const bodyNoStr = body;   // 函数体里没有注释再引用旧写法，直接用
    ok('能找到 refreshSelection 函数体', body.length > 0, '定位不到，守护失效');
    ok('refreshSelection 不再整体覆盖 state.selection',
      !/state\.selection\s*=\s*new Set\s*\(/.test(bodyNoStr),
      '函数体里又出现「整体重建 Set」了，翻页会丢勾选');
    ok('refreshSelection 是增量合并（add/delete）',
      /state\.selection\.add\(/.test(bodyNoStr) && /state\.selection\.delete\(/.test(bodyNoStr),
      '找不到 add/delete，说明不是增量合并');
  }
  ok('loadDevices 用 state 预勾选新页的行',
    /state\.selection\.has\(String\(d\.id\)\)/.test(JS),
    '行勾选框没按 state 预勾选，翻页回来会显示成未勾选');
  ok('有「选中当前筛选下的全部 N 台」入口',
    /selAllMatching/.test(JS) && /选中当前筛选下的全部/.test(JS),
    '找不到「全选匹配」按钮');
  ok('batch 动作执行后清空选择',
    /clearSelection\(\);\s*\n\s*loadDevices\(\)/.test(JS),
    '批量执行后没清选择，按钮会一直挂着旧数字');
  ok('切换视图时清空设备勾选',
    /state\.view === 'devices' && view !== 'devices'/.test(JS),
    '离开台账不清选择，切来切去会带着一批看不见的勾选');
}

// 选择提示条 / 「全选匹配」行 / 文字链接的样式必须存在，
// 否则那条提示条会以裸 <div> 出现（无底色无边框），用户根本不会注意到「已选 N 台」。
{
  for (const cls of ['.sel-bar', '.sel-bar-inner', '.sel-bar-text', 'tr.sel-all-row', '.link-btn']) {
    ok('admin.css 有 ' + cls + ' 样式', CSS.includes(cls + ' ') || CSS.includes(cls + '{') || CSS.includes(cls + ','),
      cls + ' 没有样式定义');
  }
}

for (const f of fails) console.log('  ✗ ' + f);
console.log(`\n窄屏设备台账回归：${pass} 通过 / ${fails.length} 失败\n`);
process.exit(fails.length ? 1 : 0);
