/**
 * 批量识别入库回归 —— 手机端「相册多选」与管理端「资源管理器多选」。
 *
 * 这个功能的全部风险都集中在四件事上，所以断言也围着这四件事写：
 *
 *   ① **必须串行**。GLM-4.6V-Flash 这类免费视觉模型限的是并发数（国际站 1、国内站 3），
 *      并发上传会被上游直接拒。而界面上的表现只是「没读出内容」——
 *      不报错、不冒烟，只有「同时在飞的请求数」这个断言抓得到。
 *      这里既正向断言「跑队列时最大并发 = 1」，也**反向**跑一遍故意并发的版本，
 *      证明这个计数器真的会数到 >1（否则那条断言就是空的）。
 *   ② **一趟归档，重试不重复归档**。第一趟带 original/thumb，重试趟必须带 save=0，
 *      否则十张照片每张四个角度会刷出几十份重复图片。
 *   ③ **一件失败不拖垮整批**，但登录过期必须整批停下（不然每一件都在同一个坑里再摔一次）。
 *   ④ **入库存的是 state 不是 DOM**：核对页的输入框只是 edit 的投影，
 *      重绘清单不能把用户改好的内容冲掉。
 *
 * 运行前需先启动服务（用它的会话 Cookie 跑通 boot）：node tests/batch-ocr.js
 * 注意：本套件把 /api/ocr 与 POST /api/devices 全部**桩掉**，所以
 *       既不调第三方识别服务，也不会往库里写任何设备。
 */
const BASE = process.env.BASE || 'http://127.0.0.1:8080';

/* ================= DOM 桩（与 render-smoke.js 同源，够 m.js / admin.js 加载即可） ================= */
class FakeEl {
  constructor() {
    this._innerHTML = '';
    this._text = '';
    this.value = '';
    this.files = null;
    this.hidden = false;
    this.style = {};
    this.dataset = {};
    this.className = '';
    this.onclick = this.onkeydown = this.onchange = this.oninput = null;
    this._classes = new Set();
    this._on = {};          // 记下 addEventListener 注册的处理，桩里才能主动 fire
    this.classList = {
      add: (...c) => c.forEach((x) => this._classes.add(x)),
      remove: (...c) => c.forEach((x) => this._classes.delete(x)),
      toggle: (c, f) => (f ? this._classes.add(c) : this._classes.delete(c)),
      contains: (c) => this._classes.has(c),
    };
  }
  /** 触发已注册的事件（模拟浏览器派发）。返回有多少个处理被调用。 */
  fire(type, ev = {}) {
    const list = this._on[type] || [];
    for (const fn of list) fn(ev);
    return list.length;
  }
  addEventListener(type, fn) { (this._on[type] ||= []).push(fn); }
  removeEventListener(type, fn) {
    this._on[type] = (this._on[type] || []).filter((x) => x !== fn);
  }
  /** 桩里元素没有嵌套关系，所以「谁都不在自己里面」就是正确语义 */
  contains() { return false; }
  set innerHTML(v) { this._innerHTML = String(v); }
  get innerHTML() { return this._innerHTML; }
  get lastElementChild() { if (!this._last) this._last = new FakeEl(); return this._last; }
  get firstElementChild() { if (!this._first) this._first = new FakeEl(); return this._first; }
  get children() { return []; }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v); }
  querySelector() { return new FakeEl(); }
  querySelectorAll() { return []; }
  appendChild() {} insertBefore() {} insertAdjacentHTML() {} removeChild() {}
  setAttribute() {} getAttribute() { return null; } removeAttribute() {}
  click() {} focus() {} remove() {}
}

const NAV_IDS = ['dashboard', 'explorer', 'devices', 'orgs', 'categories', 'agent', 'excel', 'trash', 'users', 'settings'];
let navItems = null;
function navItemsFor(sel) {
  if (!String(sel).includes('nav-item')) return [];
  if (!navItems) navItems = NAV_IDS.map((v) => { const e = new FakeEl(); e.dataset.view = v; return e; });
  return navItems;
}

/**
 * 画布桩。
 * ⚠️ 尺寸与 getImageData 必须**自洽**：返回的像素数组长度对不上 w*h*4 时，
 *    灰度 / 旋转那几段会读到 undefined，算出 NaN 却不抛错 —— 断言就变成空的。
 */
function makeCanvas() {
  const el = new FakeEl();
  el.width = 0;
  el.height = 0;
  el.getContext = () => ({
    drawImage() {}, putImageData() {}, translate() {}, rotate() {}, save() {}, restore() {}, setTransform() {},
    getImageData(x, y, w, h) {
      const n = Math.max(1, Math.round(w) * Math.round(h));
      return { data: new Uint8ClampedArray(n * 4), width: Math.round(w), height: Math.round(h) };
    },
  });
  el.toBlob = (cb) => cb(new Blob([new Uint8Array(64)], { type: 'image/jpeg' }));
  return el;
}

const els = new Map();
const qs = (sel) => {
  if (!els.has(sel)) els.set(sel, new FakeEl());
  return els.get(sel);
};

/**
 * 把**刚渲染出来的 HTML** 里的表单默认值灌回桩。
 *
 * DOM 桩不解析 HTML，而 m.js / admin.js 读表单统一走 `$('#batchCat').value`。
 * 不灌的话这些读到的永远是空串，「分类来自本批统一设置」这条断言就变成
 * 「两边都是空串」的恒真命题。灌完之后断言里再反过来验证取到的确实是 state 里那一份。
 */
function hydrateForm(html) {
  for (const m of String(html).matchAll(/<select\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
    const opts = [...m[2].matchAll(/<option\b[^>]*\bvalue="([^"]*)"[^>]*>/g)];
    const sel = opts.find((o) => /\bselected\b/.test(o[0]));
    qs('#' + m[1]).value = (sel || opts[0])?.[1] ?? '';
  }
  for (const m of String(html).matchAll(/<input\b[^>]*\bid="([^"]+)"[^>]*>/g)) {
    const v = m[0].match(/\bvalue="([^"]*)"/);
    if (v) qs('#' + m[1]).value = v[1];
  }
}

globalThis.document = {
  querySelector: qs,
  querySelectorAll: (sel) => navItemsFor(sel),
  createElement: (t) => (t === 'canvas' ? makeCanvas() : new FakeEl()),
  getElementById: (id) => qs('#' + id),
  _listeners: [],
  addEventListener(type, fn) { this._listeners.push({ type, fn }); },
  removeEventListener() {},
  body: new FakeEl(),
  head: new FakeEl(),
  documentElement: new FakeEl(),
};
globalThis.location = {
  href: '/', pathname: '/', search: '', hash: '',
  origin: BASE, hostname: '127.0.0.1', protocol: 'http:', replace() {}, assign() {},
};
globalThis.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] ?? null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; },
};
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.innerWidth = 390;
globalThis.innerHeight = 844;
globalThis.isSecureContext = true;
globalThis.URL.createObjectURL = () => 'blob:stub';
globalThis.URL.revokeObjectURL = () => {};
// 图片解码桩：只要能报出宽高，压缩 / 灰度 / 旋转三处就都能走通
globalThis.createImageBitmap = async () => ({ width: 120, height: 90, close() {} });
/**
 * Image 桩 —— 缺了它整批「0 趟识别」。
 *
 * 相册 / 资源管理器选进来的文件走的是 `recognizeFile → loadImageBlob`（new Image +
 * objectURL），**不是** createImageBitmap。loadImageBlob 见不到 Image 就直接返回 null，
 * recognizeFile 抛「无法读取该图片」，runSerial 把三张都记成 error ——
 * 而「进入待确认阶段」在**全部失败**时也会成立，所以那一条断言照样绿。
 * 于是症状看着像「队列没跑」，其实是一张都没送到 fetch。
 */
globalThis.Image = class {
  constructor() { this.onload = null; this.onerror = null; }
  get naturalWidth() { return 120; }
  get naturalHeight() { return 90; }
  get width() { return 120; }
  get height() { return 90; }
  set src(v) { this._src = v; setTimeout(() => this.onload?.(), 0); }
  get src() { return this._src; }
};

/* ================= 断言 ================= */
const failures = [];
let passed = 0;
function assert(cond, msg) {
  if (cond) passed++; else failures.push(msg);
  console.log((cond ? '  \x1b[32m✔\x1b[0m ' : '  \x1b[31m✘\x1b[0m ') + msg);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(cond, ms = 10000, step = 30) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (cond()) return true; await wait(step); }
  return false;
}
function section(t) { console.log(`\n── ${t} ──`); }

/* ================= 登录（拿会话 Cookie，boot 才拿得到 /api/options） ================= */
let cookie = '';
const realFetch = globalThis.fetch;
const withCookie = async (url, opts = {}) => {
  const headers = { ...(opts.headers || {}) };
  if (cookie) headers.Cookie = cookie;
  const res = await realFetch(String(url).startsWith('http') ? url : BASE + url, { ...opts, headers });
  const setC = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  if (setC.length) cookie = setC.map((c) => c.split(';')[0]).join('; ');
  return res;
};

{
  const pass = process.env.ITAM_PASS || process.env.ITAM_ADMIN_PASSWORD || '';
  const r = await withCookie('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: process.env.ITAM_USER || 'admin', password: pass }),
  });
  if (!r.ok) {
    console.log(`\n  \x1b[31m✘\x1b[0m 登录失败 HTTP ${r.status}（需要 ITAM_PASS / ITAM_ADMIN_PASSWORD）`);
    process.exit(1);
  }
  console.log('  已登录（会话 Cookie 就绪）');
}

/* ================= 拦 /api/ocr 与 POST /api/devices =================
 * script 是「按顺序消费」的固定应答表：队列是串行的，顺序确定，
 * 所以哪一趟读得出、哪一趟读不出可以精确写死。
 */
let ocrScript = [];
let ocrCalls = [];
let devicePosts = [];
let inFlight = 0;
let maxInFlight = 0;

function ocrPayload(over = {}) {
  return {
    brand: 'DELL', brand_confidence: 0.9, brand_source: 'text',
    model: 'U2723QE', model_confidence: 0.8,
    sn: null, sn_confidence: 0,
    sn_fix: null, sn_candidates: [], duplicate: { exists: false, items: [] },
    mocked: false, note: null, category_hint: 'MON',
    image_path: null, original_path: null, thumb_path: null,
    lines: [], text: '',
    ...over,
  };
}

/**
 * 「这一趟没读出内容」的应答。
 * ⚠️ 默认的 ocrPayload() 是**能用的**（品牌 + 型号都在，usableResult 认它），
 *    拿它当「空读」会让重试阶梯在第一趟就停住，重试相关的断言全部落空。
 * 另外服务端**归档发生在第一趟**，跟读没读出来无关 —— 所以空读也会带回图片地址。
 */
function ocrBlank(over = {}) {
  return ocrPayload({ brand: '', brand_confidence: 0, model: '', model_confidence: 0, category_hint: null, ...over });
}

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const path = u.startsWith('http') ? new URL(u).pathname : u;

  if (path === '/api/ocr') {
    const fields = {};
    if (opts.body && typeof opts.body.entries === 'function') {
      for (const [k, v] of opts.body.entries()) fields[k] = typeof v === 'string' ? v : (v?.name || 'file');
    }
    const n = ocrCalls.length;
    ocrCalls.push(fields);
    inFlight++;
    if (inFlight > maxInFlight) maxInFlight = inFlight;
    // 模拟一点网络等待：并发跑的话，这个 await 期间就会有第二个请求进来
    await wait(12);
    inFlight--;
    const res = ocrScript.length ? ocrScript.shift() : ocrPayload();
    if (res && res.__status) {
      return new Response(JSON.stringify({ error: res.error || 'boom' }), {
        status: res.__status, headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify(res), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (path === '/api/devices' && String(opts.method || '').toUpperCase() === 'POST') {
    devicePosts.push(JSON.parse(String(opts.body || '{}')));
    return new Response(JSON.stringify({ ok: true, data: { id: 'dev-' + devicePosts.length, asset_no: 'BATCH-2026-' + String(devicePosts.length).padStart(4, '0') } }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }

  return withCookie(u, opts);
};

/* ================= ① runSerial：串行 / 顺序 / 隔离 / 中止 ================= */
section('runSerial —— 串行是硬要求，不是优化');

const { runSerial } = await import('file://' + process.cwd().replace(/\\/g, '/') + '/public/assets/ocr-core.js');

{
  const trace = [];
  let live = 0; let peak = 0;
  const items = [1, 2, 3, 4, 5].map((n) => ({ n }));
  const r = await runSerial(items, async (it) => {
    live++; if (live > peak) peak = live;
    trace.push('start' + it.n);
    await wait(10);
    trace.push('end' + it.n);
    live--;
  });
  assert(peak === 1, `跑队列时同时在飞的请求数一直是 1（实测峰值 ${peak}）—— 并发上传会被上游直接拒`);
  assert(trace.join(',') === 'start1,end1,start2,end2,start3,end3,start4,end4,start5,end5', '严格按顺序一件一件跑完，不交叉');
  assert(r.total === 5 && r.ok === 5 && r.failed === 0 && !r.stopped, '返回值统计正确（5 全成）');
}

{
  // 反向验证：故意用 Promise.all 并发跑同一批，计数必须 >1。
  // 没有这一条，上面那条「峰值 = 1」到底是真断言还是恒真就说不清了。
  let live = 0; let peak = 0;
  await Promise.all([1, 2, 3].map(async () => {
    live++; if (live > peak) peak = live;
    await wait(10); live--;
  }));
  assert(peak > 1, `同一个计数器放到并发写法上确实会数到 >1（实测 ${peak}）—— 说明上一条断言不是恒真的`);
}

{
  const items = [{ n: 1 }, { n: 2, boom: true }, { n: 3 }];
  const r = await runSerial(items, async (it) => {
    if (it.boom) throw new Error('这张坏了');
    it.done = true;
  });
  assert(items[0].done === true && items[2].done === true, '单件失败**不中断整批**（前后两件照跑，用户不用为一张重来）');
  assert(items[1].error === '这张坏了', '失败项自带错误信息（核对页要把它显示出来）');
  assert(r.ok === 2 && r.failed === 1 && !r.stopped, '统计如实：2 成 1 败，且不是「被中止」');
}

{
  const items = [{ n: 1 }, { n: 2 }, { n: 3 }];
  const seen = [];
  const r = await runSerial(items, async (it) => { seen.push(it.n); }, {
    shouldContinue: () => seen.length < 1,
  });
  assert(seen.length === 1 && r.stopped && !r.aborted, 'shouldContinue 返回 false 后立刻收工（用户关了页面就不再打请求）');
}

{
  const items = [{ n: 1 }, { n: 2 }, { n: 3 }];
  const seen = [];
  const r = await runSerial(items, async (it) => {
    seen.push(it.n);
    if (it.n === 1) { const e = new Error('登录已过期'); e.redirected = true; throw e; }
  });
  assert(seen.length === 1 && r.aborted, '登录过期时整批**立即停下**（不重定向就别再摔第二遍）');
}

/* ================= ② 手机端：批量识别入库 ================= */
section('手机端 m.js —— 相册多选 → 串行识别 → 核对 → 批量入库');

await import('file://' + process.cwd().replace(/\\/g, '/') + '/public/assets/m.js');
await wait(900);

const mState = globalThis.mobileState;
assert(!!mState && Array.isArray(mState.categories) && mState.categories.length > 0, `移动端已加载分类（${mState?.categories?.length || 0} 个）`);

{
  globalThis.route('home');
  const home = els.get('#main').innerHTML;
  assert(home.includes('galleryForBatch()'), '首页有「批量识别入库」入口，且挂在 window 上（onclick 才找得到）');
  assert(home.includes('批量识别入库'), '入口文案写明是批量');
  assert(home.includes('galleryForCapture()'), '单张「从相册选图识别」入口原样保留（不动原功能）');
  assert(home.includes("openCamera('capture')"), '主行动「拍照识别入库」没被挤掉');
  assert(typeof globalThis.galleryForBatch === 'function', 'galleryForBatch 已导出');
  assert(typeof globalThis.batchSaveAll === 'function' && typeof globalThis.batchEditField === 'function', '批量页的内联处理器都已导出');
}

{
  // —— 三张照片，各自第一趟就读到 ——
  ocrScript = [
    ocrPayload({ sn: 'SN-A0001', image_path: '/uploads/a.jpg', original_path: '/uploads/ao.jpg', thumb_path: '/uploads/at.jpg' }),
    ocrPayload({ sn: 'SN-B0002', image_path: '/uploads/b.jpg', original_path: '/uploads/bo.jpg', thumb_path: '/uploads/bt.jpg' }),
    ocrPayload({ sn: 'SN-C0003', image_path: '/uploads/c.jpg', original_path: '/uploads/co.jpg', thumb_path: '/uploads/ct.jpg' }),
  ];
  ocrCalls = []; devicePosts = []; maxInFlight = 0;
  mState.operator = '张三';

  const files = ['a.jpg', 'b.jpg', 'c.jpg'].map((n) => new File([new Uint8Array(256)], n, { type: 'image/jpeg' }));
  globalThis.startBatch(files);
  const done = await waitFor(() => mState.batch && mState.batch.phase === 'review');
  assert(done, '三张照片识别完并进入待确认阶段');
  assert(ocrCalls.length === 3, `每张只发一趟识别（共 ${ocrCalls.length} 趟）—— 能读到就不许再试角度`);
  assert(maxInFlight === 1, `识别全程最大并发 = 1（实测 ${maxInFlight}）`);
  assert(ocrCalls[0]?.original && ocrCalls[0]?.thumb, '第一趟带上了原图与缩略图（要归档）');
  assert(!ocrCalls[0]?.save, '第一趟不带 save=0（那会让服务端跳过归档）');
  const mStat = mState.batch.items.map((it) => it.status + (it.error ? `(${it.error})` : '')).join(' | ');
  assert(mState.batch.items.every((it) => it.status === 'ok'), `三张的识别状态都是「已读出」（实测 ${mStat}）`);
  assert(mState.batch.items.map((it) => it.edit.sn).join(',') === 'SN-A0001,SN-B0002,SN-C0003', '识别出的 SN 已自动灌进各自的可编辑字段');
  assert(mState.batch.items[0].result?.image_path === '/uploads/a.jpg', '照片地址是识别时归档的那张');

  // —— 核对页是 state 的投影，改字段改的是 state ——
  // 分类要**显式挑**，别用默认选中那个：本套件和其它套件共用同一个临时库，
  // 前面的套件可能往库里塞过分类（或把某个分类的专属字段清空），
  // 于是 categories[0] 未必是有专属字段的那个 —— 靠默认值断言就会时红时绿。
  // 同时挑一个「不是第一个」的，顺带证明入库取的是 state 里的分类，
  // 而不是「反正都取到第一个」这种恒真命题。
  const FIXED_KEYS = ['asset_no', 'brand', 'model', 'sn', 'category_id', 'org_id', 'supplier', 'status'];
  const hasFields = (c) => (c.tracking_fields || []).some((t) => t && t.key && !FIXED_KEYS.includes(t.key));
  const cats = mState.categories;
  const sharedCat = (cats.slice(1).find(hasFields) || cats.find(hasFields) || cats[0]).id;
  mState.batch.shared.category_id = sharedCat;
  globalThis.renderBatch();                  // 等价于用户在下拉里换了分类
  hydrateForm(els.get('#main').innerHTML);   // 渲染出来的下拉默认值 → DOM 桩

  const reviewHTML = els.get('#main').innerHTML;
  assert(reviewHTML.includes('id="batchReviewList"'), '待确认清单已渲染');
  assert(/data-f="sn"/.test(reviewHTML) && /data-bid="/.test(reviewHTML), '每一项都有可编辑的 SN 输入框（带 data-bid 定位）');
  assert(reviewHTML.includes('oninput="batchEditField(this)"'), '输入框改值会写回 state 而不是只留在 DOM');
  assert(reviewHTML.includes('id="batchCat"') && reviewHTML.includes('id="batchStatus"'), '「本批统一设置」有分类与状态下拉');
  assert(reviewHTML.includes(`value="${sharedCat}" selected`), '下拉里选中的正是 state 里那一份（改 state 后重绘不会挑回第一个）');
  assert(reviewHTML.includes('id="bt_'), '批量页的分类专属字段用 bt_ 前缀（和单张页的 mt_ 分开，不会互相抢 id）');
  assert(!reviewHTML.includes('id="mt_'), '批量页里没有 mt_ 前缀的字段（两边同屏也不会抢 id）');

  // 模拟用户改了第二台的 SN（等价于在输入框里敲）
  mState.batch.items[1].edit.sn = 'SN-B0002-FIXED';

  // —— 批量入库 ——
  globalThis.batchSaveAll();
  const posted = await waitFor(() => devicePosts.length === 3);
  assert(posted, '三台都提交了入库请求');
  assert(devicePosts.map((p) => p.sn).join(',') === 'SN-A0001,SN-B0002-FIXED,SN-C0003', '入库用的是**用户改过之后**的 SN（DOM 覆盖不丢）');
  assert(!!sharedCat && devicePosts.every((p) => p.category_id === sharedCat), `分类来自「本批统一设置」且跟着 state 走（三台都是 ${sharedCat}）`);
  assert(devicePosts[0].photo_path === '/uploads/a.jpg' && devicePosts[0].photo_original_path === '/uploads/ao.jpg' && devicePosts[0].photo_thumb_path === '/uploads/at.jpg', '三份图路径都挂到了设备上');
  assert(devicePosts[0].sn_source === 'ocr' && devicePosts[0].operator === '张三', '录入了 sn_source 与录入人（审计要用）');
  assert(devicePosts[0].ocr_raw && JSON.parse(devicePosts[0].ocr_raw).sn === 'SN-A0001', 'ocr_raw 留下识别原文，事后可追溯');
  await waitFor(() => mState.batch === null, 3000);
  assert(mState.batch === null && mState.view === 'home', '全部成功后退回首页，批次状态清空（不占内存）');
}

{
  // —— 有的要重试：第 2 张第一趟读不出，第 3 张根本没读到 ——
  ocrScript = [
    // 第 1 张：0° 就读到
    ocrPayload({ sn: 'SN-R1', image_path: '/uploads/r1.jpg', original_path: '/uploads/r1o.jpg', thumb_path: '/uploads/r1t.jpg' }),
    // 第 2 张：0° 没读出内容（图已归档），180° 才读到；第二趟带 save=0，所以没有图片地址
    ocrBlank({ image_path: '/uploads/r2.jpg', original_path: '/uploads/r2o.jpg', thumb_path: '/uploads/r2t.jpg' }),
    ocrPayload({ sn: 'SN-R2' }),
    // 第 3 张：四个角度全都读不出
    ocrBlank({ image_path: '/uploads/r3.jpg' }), ocrBlank(), ocrBlank(), ocrBlank(),
  ];
  ocrCalls = []; devicePosts = [];
  const files = ['r1.jpg', 'r2.jpg', 'r3.jpg'].map((n) => new File([new Uint8Array(256)], n, { type: 'image/jpeg' }));
  globalThis.startBatch(files);
  await waitFor(() => mState.batch && mState.batch.phase === 'review');
  hydrateForm(els.get('#main').innerHTML);   // 「本批统一设置」的下拉默认值 → DOM 桩

  const [i0, i1, i2] = mState.batch.items;
  assert(i0.status === 'ok' && i0.result.image_path === '/uploads/r1.jpg', '第一趟就读到的那张直接进「已读出」，图地址是归档那张');
  assert(ocrCalls.length === 1 + 2 + 4, `重试趟数正确：1 趟 + 2 趟 + 4 趟 = 7（实测 ${ocrCalls.length}）`);
  assert(ocrCalls[2]?.save === '0', '重试那几趟带 save=0 —— 否则每换个角度就多归档三份重复图');
  assert(!ocrCalls[2]?.original, '重试那几趟不再重复上传原图 / 缩略图');
  assert(i1.result.image_path === '/uploads/r2.jpg', '转正后识别成功，但照片地址用的仍是**第一趟**那张（那才是用户真正拍下的）');
  assert(i1.result.rotate_angle === 180, `结果里记下实际转正的角度（实测 ${i1.result.rotate_angle}°）`);
  assert(!!i1.result.note && String(i1.result.note).includes('转'), '界面会说明「照片是转正后识别的」，不让人以为系统乱认');
  assert(i2.status === 'weak' && !i2.edit.sn, '四个角度都没读到 → 标成「没读全」而不是失败（字段还能人工补）');
  assert(i2.include === false, '「没读全」的那张默认**不勾选**（勾了也提交不了，别让人以为点一下就完事）');

  globalThis.batchSaveAll();
  await waitFor(() => devicePosts.length === 2, 6000);
  assert(devicePosts.length === 2, '「没读全」的那张没有入库（SN 空着，库里不许出现无 SN 的设备）');
  assert(devicePosts.map((p) => p.sn).join(',') === 'SN-R1,SN-R2', '两张入库的 SN 正确');
  assert(mState.batch !== null, '有没读全的项时留在核对页，让用户补完再入库');
}

{
  // —— 服务端出错：一件失败不拖垮整批 ——
  ocrScript = [
    ocrPayload({ sn: 'SN-E1', image_path: '/uploads/e1.jpg' }),
    { __status: 500, error: '服务端炸了' },
    ocrPayload({ sn: 'SN-E3', image_path: '/uploads/e3.jpg' }),
  ];
  ocrCalls = []; devicePosts = [];
  const files = ['e1.jpg', 'e2.jpg', 'e3.jpg'].map((n) => new File([new Uint8Array(256)], n, { type: 'image/jpeg' }));
  globalThis.startBatch(files);
  await waitFor(() => mState.batch && mState.batch.phase === 'review');
  hydrateForm(els.get('#main').innerHTML);
  const st = mState.batch.items.map((it) => it.status).join(',');
  assert(st === 'ok,error,ok', `一张 500 不影响其余两张（实测 ${st}，phase=${mState.batch.phase}）`);
  assert(/批量入库（2 台）/.test(els.get('#main').innerHTML), '失败那张不算进「可入库」的计数（否则用户勾上也会被 SN 校验挡回来，还不知道为什么）');
  const errId = mState.batch.items[1].id;
  const review3 = els.get('#main').innerHTML;
  assert(review3.includes(`data-bid="${errId}"`) && !review3.includes(`data-f="sn" data-bid="${errId}"`), '失败那一条只渲染原因、不渲染输入框（免得填了半天才发现提交不了）');
  assert(String(mState.batch.items[1].error).includes('服务端炸了'), '失败原因原样显示给用户，不是笼统的「识别失败」');
  assert(mState.batch.items[1].edit.sn === '', '失败项没有可编辑字段（填了也没有照片可挂）');

  // 登录过期：整批立停
  ocrScript = [{ __status: 401, error: '登录已过期' }];
  ocrCalls = [];
  globalThis.exitBatch();
  const files2 = ['x1.jpg', 'x2.jpg', 'x3.jpg'].map((n) => new File([new Uint8Array(256)], n, { type: 'image/jpeg' }));
  globalThis.startBatch(files2);
  await waitFor(() => !mState.batch || mState.batch.phase === 'review', 4000);
  assert(ocrCalls.length === 1, `登录过期时只发了 1 趟就整批停下（实测 ${ocrCalls.length} 趟）—— 不在同一个坑里连摔三次`);
  globalThis.exitBatch();
}

/* ================= ③ 电脑端：批量识别录入 ================= */
section('电脑端 admin.js —— 资源管理器多选 → 串行识别 → 核对表格 → 批量入库');

await import('file://' + process.cwd().replace(/\\/g, '/') + '/public/assets/admin.js');
await wait(900);

{
  const src = (await import('node:fs')).readFileSync(
    (await import('node:path')).join(process.cwd(), 'public/assets/admin.js'), 'utf8',
  );
  assert(/id="btnBatchOcr"/.test(src), '设备台账工具栏有「批量识别录入」按钮');
  assert(/hasPerm\('device\.write'\)[\s\S]{0,80}btnBatchOcr/.test(src), '该按钮按 device.write 权限显示（没权限的人看不到）');
  assert(/window\.openBatchOcr\s*=/.test(src) && /window\.closeBatchOcr\s*=/.test(src), '弹窗的内联处理器都挂了 window');
}

const aState = globalThis.adminState;
assert(!!aState && !!aState.options, '管理端已加载选项（分类 / 组织 / 状态）');

{
  globalThis.openBatchOcr();
  assert(aState.batchOcr && aState.batchOcr.phase === 'pick', '打开弹窗后进入「选文件」阶段');
  const pick = els.get('#modal').innerHTML;
  assert(pick.includes('id="batchOcrFiles"'), '弹窗里有文件选择框');
  assert(/type="file"[^>]*multiple/.test(pick) || /multiple[^>]*type="file"/.test(pick), '文件框支持多选（资源管理器里可以框选一批）');
  const input = els.get('#batchOcrFiles');
  assert(typeof input.onchange === 'function', '文件选择框已绑定 onchange（没绑就是点了没反应）');
  assert(pick.includes('id="batchOcrDrop"'), '选文件区有 id，拖放事件才有地方挂');

  // —— 走真实的绑定路径：塞文件 → 触发 onchange ——
  ocrScript = [
    ocrPayload({ sn: 'D-1', image_path: '/uploads/d1.jpg' }),
    ocrPayload({ sn: 'D-2', image_path: '/uploads/d2.jpg' }),
  ];
  ocrCalls = []; devicePosts = []; maxInFlight = 0;
  input.files = ['d1.jpg', 'd2.jpg'].map((n) => new File([new Uint8Array(256)], n, { type: 'image/jpeg' }));
  input.onchange();
  const done = await waitFor(() => aState.batchOcr && aState.batchOcr.phase === 'review');
  assert(done, '两张照片识别完并进入核对阶段');
  assert(ocrCalls.length === 2 && maxInFlight === 1, `每张一趟、全程串行（趟数 ${ocrCalls.length}，峰值并发 ${maxInFlight}）`);

  const review = els.get('#modal').innerHTML;
  assert(review.includes('id="batchOcrBody"'), '核对表格已渲染');
  assert(review.includes('data-f="sn"') && review.includes('data-f="category_id"'), '每行可改 SN、分类');
  assert(review.includes('data-f="org_id"') && review.includes('data-f="status"'), '每行可改组织、状态（电脑端有地方，就允许逐台不同）');
  assert(review.includes('data-label="SN 序列号"'), '窄屏折成卡片时有列名（data-label 缺了会变成一列无名值）');

  // —— 提交 ——
  const commit = els.get('#batchOcrCommit');
  assert(typeof commit.onclick === 'function', '「批量入库」按钮已绑定');
  commit.onclick();
  await waitFor(() => devicePosts.length === 2, 6000);
  assert(devicePosts.length === 2, '两台都提交了');
  assert(devicePosts.map((p) => p.sn).join(',') === 'D-1,D-2', 'SN 正确');
  assert(devicePosts[0].photo_path === '/uploads/d1.jpg', '照片路径已挂到设备上');
  assert(devicePosts[0].status === 'in_use', '默认状态是「在用」（和手机端同一口径）');
  assert(aState.batchOcr.items.every((it) => it.status === 'saved'), '入库成功后逐项标成已入库');

  globalThis.closeBatchOcr();
  assert(aState.batchOcr === null, '关掉弹窗会把批次状态清空并中止还在跑的识别');
  assert(els.get('#modalMask').hidden === true, '弹窗已关闭');
}

{
  // —— 从资源管理器**直接拖进来**：虚线框承诺了「拖到这儿」，就得真认 ——
  globalThis.openBatchOcr();
  const drop = els.get('#batchOcrDrop');
  // ⚠️ 用 >=1 而不是 ===1：桩里 innerHTML 换字符串，元素对象不重建，
  //    于是重开弹窗会重复挂载。真实浏览器里 innerHTML 换掉旧节点，监听随之销毁。
  assert((drop._on.drop || []).length >= 1, '虚线框上挂了 drop 处理（画了虚线框不认拖放，用户会以为功能坏了）');
  assert((drop._on.dragover || []).length >= 1, 'dragover 也挂了 —— 不 preventDefault 浏览器根本不允许放下');

  ocrScript = [ocrPayload({ sn: 'D-9', image_path: '/uploads/d9.jpg' })];
  ocrCalls = []; devicePosts = [];
  let prevented = 0;
  const ev = (files) => ({
    preventDefault: () => { prevented++; },
    stopPropagation: () => {},
    dataTransfer: files ? { files } : {},
  });
  drop.fire('dragover', ev(null));
  assert(drop.classList.contains('over'), '拖到框上时给出落点高亮（不然用户不知道能不能放）');
  drop.fire('drop', ev([new File([new Uint8Array(256)], 'd9.jpg', { type: 'image/jpeg' })]));

  const queued = await waitFor(() => aState.batchOcr && aState.batchOcr.items.length === 1, 4000);
  assert(queued && aState.batchOcr.items[0].name === 'd9.jpg', '拖进来的照片真的进了识别队列（不是只有样式变一下）');
  assert(prevented >= 2, `dragover / drop 都调了 preventDefault（实测 ${prevented} 次）—— 漏了的话浏览器会把那张图直接打开、把页面顶掉`);
  assert(drop.classList.contains('over') === false, '放下之后把高亮撤掉');

  // 非图片被拖进来时不能静默什么都不做
  globalThis.closeBatchOcr();
  globalThis.openBatchOcr();
  const drop2 = els.get('#batchOcrDrop');
  drop2.fire('drop', ev([new File([new Uint8Array(8)], 'bom.xlsx', { type: 'application/vnd.ms-excel' })]));
  assert(!aState.batchOcr || aState.batchOcr.items.length === 0, '拖进来的不是图片 → 不入队（Excel 该走「Excel 表格」那一页，别在这里当照片认）');
  globalThis.closeBatchOcr();
}

/* ================= 汇总 ================= */
console.log('');
if (failures.length) {
  console.log(`=== 批量识别入库：失败 ${failures.length} 项（通过 ${passed}）===\n`);
  for (const f of failures) console.log('  · ' + f);
  console.log();
  process.exit(1);
}
console.log(`=== 批量识别入库：全部通过（${passed} 项断言）===\n`);
