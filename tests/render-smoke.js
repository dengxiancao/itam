/**
 * 无浏览器前端渲染冒烟测试
 * 用极简 DOM 桩 + 真实 fetch 跑通 admin.js 的 boot -> 仪表盘 -> 系统设置 -> 视觉模型预设，
 * 用来在没有浏览器的环境里发现前端运行时错误（引用/undefined/模板拼接错误）。
 *
 * 运行前需先启动服务：node tests/render-smoke.js
 */
const BASE = process.env.BASE || 'http://127.0.0.1:8080';

/* ---------- DOM 桩 ---------- */
class FakeEl {
  constructor() {
    this._innerHTML = '';
    this.textContent = '';
    this.value = '';
    this.hidden = false;
    this.style = {};
    this.dataset = {};
    this.className = '';
    this.onclick = this.onkeydown = this.onchange = this.oninput = null;
    this._classes = new Set();
    this.classList = {
      add: (...c) => c.forEach((x) => this._classes.add(x)),
      remove: (...c) => c.forEach((x) => this._classes.delete(x)),
      toggle: (c, f) => {
        const on = f === undefined ? !this._classes.has(c) : !!f;
        if (on) this._classes.add(c); else this._classes.delete(c);
        return on;
      },
      contains: (c) => this._classes.has(c),
    };
  }
  set innerHTML(v) { this._innerHTML = String(v); }
  get innerHTML() { return this._innerHTML; }
  // 缓存住，别每次返回新对象：toast 之类的代码会往里写 textContent
  get lastElementChild() { if (!this._last) this._last = new FakeEl(); return this._last; }
  get firstElementChild() { if (!this._first) this._first = new FakeEl(); return this._first; }
  get children() { return []; }
  get textContent() { return this._text ?? ''; }
  set textContent(v) { this._text = String(v); }
  querySelector() { return new FakeEl(); }
  querySelectorAll(sel) { return navItemsFor(sel, this); }
  _appended = [];
  appendChild(el) { this._appended.push(el); }
  insertBefore(el) { this._appended.push(el); }
  insertAdjacentHTML() {}
  setAttribute() {}
  getAttribute() { return null; }
  addEventListener() {}
  removeEventListener() {}
  click() { this._clicked = (this._clicked || 0) + 1; }
  focus() {}
  remove() {}
}

const NAV_IDS = ['dashboard', 'devices', 'orgs', 'categories', 'excel', 'trash', 'users', 'settings'];
let navItems = null;
function navItemsFor(sel) {
  if (!String(sel).includes('nav-item')) return [];
  if (!navItems) {
    navItems = NAV_IDS.map((v) => { const e = new FakeEl(); e.dataset.view = v; return e; });
  }
  return navItems;
}

const els = new Map();
const qs = (sel) => {
  if (!els.has(sel)) els.set(sel, new FakeEl());
  return els.get(sel);
};

globalThis.document = {
  querySelector: qs,
  querySelectorAll: (sel) => navItemsFor(sel),
  createElement: () => new FakeEl(),
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

/* ---------- 带会话 Cookie 的 fetch 代理 ---------- */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ADMIN_USER = process.env.ITAM_USER || 'admin';
let ADMIN_PASS = process.env.ITAM_PASS || '';
if (!ADMIN_PASS) {
  const f = path.join(__dirname, '..', 'data', 'admin-password.txt');
  if (fs.existsSync(f)) {
    const m = fs.readFileSync(f, 'utf8').match(/初始密码:\s*(\S+)/);
    if (m) ADMIN_PASS = m[1];
  }
}

let cookie = '';
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const headers = { ...(opts.headers || {}) };
  if (cookie) headers.Cookie = cookie;
  const res = await realFetch(String(url).startsWith('http') ? url : BASE + url, { ...opts, headers });
  const setC = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  if (setC.length) cookie = setC.map((c) => c.split(';')[0]).join('; ');
  return res;
};

/* ---------- 断言 ---------- */
const failures = [];
function assert(cond, msg) {
  if (!cond) { failures.push(msg); console.log('  \x1b[31m✘\x1b[0m ' + msg); }
  else console.log('  \x1b[32m✔\x1b[0m ' + msg);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('\n=== 前端渲染冒烟测试 (' + BASE + ') ===\n');

/* ---------- 先登录（服务已开启认证） ---------- */
if (!ADMIN_PASS) {
  console.log('  \x1b[31m✘\x1b[0m 未找到管理员密码：请设置 ITAM_PASS，或查看 data/admin-password.txt');
  process.exit(1);
}
{
  const r = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  });
  if (!r.ok) {
    console.log(`  \x1b[31m✘\x1b[0m 登录失败 HTTP ${r.status}: ${(await r.text()).slice(0, 160)}`);
    process.exit(1);
  }
  console.log('  \x1b[32m✔\x1b[0m 已登录（会话 Cookie 已就绪）');
}

let loadError = null;
try {
  await import('file://' + process.cwd().replace(/\\/g, '/') + '/public/assets/admin.js');
} catch (e) {
  loadError = e;
}
await wait(1500);

if (loadError) {
  console.log('  \x1b[31m✘\x1b[0m admin.js 加载/执行失败：' + loadError.message);
  console.log(loadError.stack);
  process.exit(1);
}

assert(true, 'admin.js 模块加载并执行');

/* ---------- 1. 仪表盘 ---------- */
const dash = els.get('#content')?._innerHTML || '';
assert(dash.length > 200, '仪表盘内容已渲染（长度 ' + dash.length + '）');
assert(dash.includes('设备总数'), '包含 KPI「设备总数」');
assert(dash.includes('设备状态分布'), '包含「设备状态分布」图');
assert(dash.includes('保修预警'), '包含「保修预警」');

/* ---------- 2. 切到系统设置 ---------- */
let settingsErr = null;
try {
  const settingsTab = navItems.find((e) => e.dataset.view === 'settings');
  assert(!!settingsTab && typeof settingsTab.onclick === 'function', '侧边栏导航已绑定点击事件');
  await settingsTab.onclick();
  await wait(800);
} catch (e) { settingsErr = e; }

if (settingsErr) {
  console.log('  \x1b[31m✘\x1b[0m 系统设置渲染抛错：' + settingsErr.message);
  console.log(settingsErr.stack);
  failures.push('settings');
} else {
  const set = els.get('#content')?._innerHTML || '';
  assert(set.includes('识别服务'), '系统设置页包含「识别服务」');
  assert(set.includes('ocrProvider'), '包含识别服务下拉框');
  assert(set.includes('saveOcr'), '包含保存识别配置按钮');
}

/* ---------- 2b. 切到回收站 ---------- */
let trashErr = null;
try {
  const trashTab = navItems.find((e) => e.dataset.view === 'trash');
  assert(!!trashTab && typeof trashTab.onclick === 'function', '侧边栏含「回收站」入口');
  await trashTab.onclick();
  await wait(800);
} catch (e) { trashErr = e; }

if (trashErr) {
  console.log('  \x1b[31m✘\x1b[0m 回收站渲染抛错：' + trashErr.message);
  console.log(trashErr.stack);
  failures.push('trash');
} else {
  const t = els.get('#content')?._innerHTML || '';
  assert(t.includes('回收站'), '回收站页面已渲染');
  assert(t.includes('trashRestoreAll') || t.includes('回收站是空的'), '含批量恢复或空态提示');
}

/* ---------- 2c. 设备表单里的供应商下拉 ---------- */
let formErr = null;
try {
  const devTab = navItems.find((e) => e.dataset.view === 'devices');
  await devTab.onclick();
  await wait(600);
  await globalThis.openDeviceForm();
  await wait(300);
} catch (e) { formErr = e; }

if (formErr) {
  console.log('  \x1b[31m✘\x1b[0m 新增设备表单抛错：' + formErr.message);
  console.log(formErr.stack);
  failures.push('device-form');
} else {
  const m = els.get('#modal')?._innerHTML || '';
  assert(m.includes('供应商'), '新增设备表单含「供应商」字段');
  assert(m.includes('易点云') && m.includes('小熊'), '供应商为下拉且含「易点云 / 小熊」');
  assert(m.includes('id="fSupplier"') && m.includes('<select'), '供应商渲染成下拉框');
}

/* ---------- 2d. 用户管理页 ---------- */
let usersErr = null;
try {
  const usersTab = navItems.find((e) => e.dataset.view === 'users');
  assert(!!usersTab && typeof usersTab.onclick === 'function', '侧边栏含「用户管理」入口');
  await usersTab.onclick();
  await wait(800);
} catch (e) { usersErr = e; }

if (usersErr) {
  console.log('  \x1b[31m✘\x1b[0m 用户管理页渲染抛错：' + usersErr.message);
  console.log(usersErr.stack);
  failures.push('users');
} else {
  const u = els.get('#content')?._innerHTML || '';
  assert(u.includes('用户账号'), '用户管理页已渲染');
  assert(u.includes('btnAddUser'), '含「新建用户」按钮');
  assert(u.includes('系统管理员') && u.includes('资产管理员') && u.includes('录入员') && u.includes('只读'), '含 4 种角色说明');
  assert(u.includes('btnLoginLog'), '含「登录日志」入口');
}

/* ---------- 2e. 分类专属字段：屏幕尺寸下拉 ---------- */let trackErr = null;
try {
  const devTab = navItems.find((e) => e.dataset.view === 'devices');
  await devTab.onclick();
  await wait(600);
  await globalThis.openDeviceForm();
  await wait(300);

  // 把分类切到「显示器」，专属字段区应重建并出现 24寸/27寸
  const optRes = await fetch('/api/options');
  const optBody = await optRes.json();
  const options = optBody.data ?? optBody;
  const monitor = (options.categories || []).find((c) => c.code === 'MON');
  assert(!!monitor, '选项里能找到「显示器」分类');
  assert(!!monitor?.tracking_fields?.find((t) => t.key === 'screen_size' && t.type === 'select'),
    '显示器分类的「屏幕尺寸」是下拉类型');

  const catSel = els.get('#fCat');
  catSel.value = monitor.id;
  await catSel.onchange();
  await wait(200);

  const box = els.get('.modal-body');
  const appended = box?._appended || [];
  const last = appended[appended.length - 1];
  const html = last?.innerHTML || '';
  assert(html.includes('屏幕尺寸'), '管理端：选显示器后出现「屏幕尺寸」');
  assert(html.includes('24寸') && html.includes('27寸'), '管理端：屏幕尺寸选项含 24寸 / 27寸');
  assert(html.includes('id="x_screen_size"') && html.includes('<select'), '管理端：屏幕尺寸渲染成下拉框');
} catch (e) { trackErr = e; }

if (trackErr) {
  console.log('  \x1b[31m✘\x1b[0m 管理端专属字段渲染失败：' + trackErr.message);
  console.log(trackErr.stack);
  failures.push('tracking-admin');
}

/* ---------- 2f. 手机端：识别结果页的屏幕尺寸下拉 ---------- */let mobileErr = null;
try {
  await import('file://' + process.cwd().replace(/\\/g, '/') + '/public/assets/m.js');
  await wait(800);

  assert(typeof globalThis.renderRecognizeResult === 'function', '手机端模块已加载');

  globalThis.renderRecognizeResult({
    brand: 'Dell', model: 'U2723QE', sn: 'CN0M2K7P1234',
    brand_confidence: 0.99, sn_confidence: 0.99, model_confidence: 0.8,
    lines: [{ text: 'DELL', score: 0.9 }], duplicate: { exists: false },
    image_path: '/uploads/2026-09-18/smoke-shot.jpg', provider: 'mock', elapsed: 10,
  });
  await wait(300);

  const monitor2 = (globalThis.mobileState?.categories || []).find((c) => c.code === 'MON');
  assert(!!monitor2, '手机端已加载分类列表');

  // 顶部应有「刚拍的照片」预览图，方便人工二次比对
  const mainHTML = els.get('#main')?._innerHTML || '';
  assert(mainHTML.includes('id="shotThumb"'), '结果页顶部有刚拍照片的预览图');
  assert(mainHTML.includes('/uploads/2026-09-18/smoke-shot.jpg'), '预览图指向识别时保存的照片');
  assert(mainHTML.indexOf('id="shotThumb"') < mainHTML.indexOf('id="rSN"'), '预览图排在识别字段上方');
  assert(mainHTML.includes('id="shotBox"'), '预览图可点击放大');
  assert(typeof globalThis.openShotViewer === 'function', '放大比对入口已暴露');
  assert(typeof globalThis.shotZoom === 'function' && typeof globalThis.closeShotViewer === 'function', '放大 / 关闭方法已暴露');

  // 设备详情里的照片卡（手机端）
  const photoDevice = {
    id: 'x', asset_no: 'MON-1', sn: 'SN1',
    photo_path: '/uploads/a/thumb.jpg',
    photo_original_path: '/uploads/a/orig.jpg',
  };
  const mPhoto = globalThis.mobilePhotoCard(photoDevice);
  assert(mPhoto.includes('devShotThumb') && mPhoto.includes('/uploads/a/thumb.jpg'), '手机端设备详情显示照片');
  assert(mPhoto.includes('data-original="/uploads/a/orig.jpg"'), '手机端详情可切到原图');
  assert(mPhoto.includes('devShotSave'), '手机端详情可把照片存到手机');
  assert(globalThis.mobilePhotoCard({ id: 'y', asset_no: 'N' }) === '', '没有照片时不渲染照片卡');

  // 扫码核对 ≠ 识别入库：这是两条完全不同的流程
  globalThis.mobileState.scanMode = 'scan';
  globalThis.renderScan();
  await wait(120);
  const scanHTML = els.get('#main')?._innerHTML || '';
  assert(scanHTML.includes('扫码核对') || scanHTML.includes('扫描资产二维码') || scanHTML.includes('不能网页内扫码'),
    '扫码页渲染出来了');
  // 本测试环境没有 BarcodeDetector，应给出「用手机自带相机」的兜底说明，而不是死路
  assert(scanHTML.includes('手机自带相机'), '没有扫码 API 时提示改用手机自带相机');
  assert(scanHTML.includes('manualSN'), '扫码页始终保留手动输入 SN');

  // 扫码模式下按快门，绝不能掉进「识别入库」的预览流程
  els.get('#main').innerHTML = '';
  await globalThis.captureForScan({ videoWidth: 640, videoHeight: 480 });
  await wait(120);
  const afterShutter = els.get('#main')?._innerHTML || '';
  assert(!afterShutter.includes('id="btnSave"'), '扫码模式按快门不会进「保存入库」页');
  assert(!afterShutter.includes('综合置信度'), '扫码模式按快门不会进识别结果页');
  assert(afterShutter.includes('手动输入'), '没有扫码能力时落到手动输入页');
  globalThis.mobileState.scanMode = 'lookup';

  // 移动端 ⇄ 管理端 必须能双向走：管理端有「打开移动端录入」，反过来也得能回去
  globalThis.renderHome();
  await wait(150);
  const homeHTML = els.get('#main')?._innerHTML || '';
  assert(/href="\/"/.test(homeHTML), '移动端首页有「回到电脑端管理后台」的链接');
  assert(homeHTML.includes('回到电脑端管理后台'), '移动端首页的入口有文字说明');
  assert(/href="\/manual"/.test(homeHTML), '移动端首页有使用手册入口');

  // 顶栏那个小按钮是写在 HTML 里的（JS 不重建顶栏），所以直接查源文件
  const mIndexHtml = fs.readFileSync(path.join(process.cwd(), 'public', 'm', 'index.html'), 'utf8');
  assert(/class="m-icon-btn"\s+href="\/"/.test(mIndexHtml), '移动端顶栏有回管理端的图标按钮');
  assert(mIndexHtml.includes('返回电脑端管理后台'), '顶栏按钮带无障碍/悬浮文案');
  assert(mIndexHtml.includes('m-head-act'), '顶栏右侧容器存在（图标按钮才不会被挤掉）');

  // 反方向：管理端侧边栏要有去移动端的入口
  const adminIndexHtml = fs.readFileSync(path.join(process.cwd(), 'public', 'index.html'), 'utf8');
  assert(/href="\/m"/.test(adminIndexHtml), '管理端侧边栏有「打开移动端录入」');

  // ── 重拍要一步回相机（用户明确反馈：识别不满意时多点一次很浪费时间）──
  assert(typeof globalThis.retakePhoto === 'function', '重拍方法已暴露');
  const overlayHtml = fs.readFileSync(path.join(process.cwd(), 'public', 'm', 'index.html'), 'utf8');
  assert(/onclick="retakePhoto\(\)"/.test(overlayHtml), '预览页「重拍」直接调 retakePhoto');
  assert(!/onclick="closePreview\(\)">重拍/.test(overlayHtml), '「重拍」不再只是关掉预览');
  const resultHTML = globalThis.mobileState?.recognizeResult ? (els.get('#main')?._innerHTML || '') : '';
  assert(/retakePhoto\(\)/.test(resultHTML || mainHTML), '识别结果页也有「重拍」，且直连相机');

  // ── SN 候选：一点替换，不用逐字改 ──
  const candHTML = globalThis.snCandidatesHTML({
    sn: 'YLX2K4H1',
    sn_candidates: [
      { sn: 'YLX2K4K1', score: 11.5, reason: '第 7 位「H」可能看成了「K」' },
      { sn: 'YLX2H4H1', score: 10.4, reason: '第 5 位「K」可能看成了「H」' },
    ],
  });
  assert(candHTML.includes('sn-chip') && candHTML.includes('data-sn="YLX2K4K1"'), 'SN 候选渲染成可点按钮');
  assert(candHTML.includes('同型号编号规律'), '候选有说明来源');
  assert(globalThis.snCandidatesHTML({ sn: 'X', sn_candidates: [] }) === '', '没有候选时不渲染空块');
  assert(typeof globalThis.enhanceForOcr === 'function', 'OCR 图像增强已暴露');

  // ── 只保留取景框内的画面（省空间 + 提高像素密度）──
  assert(typeof globalThis.frameCropRect === 'function', '取景框裁剪已暴露');
  const crop = globalThis.frameCropRect(1080, 1920);
  assert(crop.w > 0 && crop.h > 0, '裁剪区域有效：' + JSON.stringify(crop));
  assert(crop.x >= 0 && crop.y >= 0 && crop.x + crop.w <= 1080.01 && crop.y + crop.h <= 1920.01,
    '裁剪不能越界：' + JSON.stringify(crop));
  const kept = (crop.w * crop.h) / (1080 * 1920);
  assert(kept < 0.5, `框内画面应远小于整帧，实际保留 ${(kept * 100).toFixed(0)}%`);
  assert(crop.w > crop.h, '铭牌框是横条，裁出来也该是横条');
  // 4K 竖屏也要正常
  const crop4k = globalThis.frameCropRect(2160, 3840);
  assert(crop4k.w <= 2160 && crop4k.h <= 3840 && crop4k.w > 0 && crop4k.h > 0, '4K 分辨率下裁剪仍然有效');
  assert((crop4k.w * crop4k.h) / (2160 * 3840) < 0.5, '4K 下也应省掉一半以上');
  assert(typeof globalThis.shootFromVideo === 'function', '拍照取图函数已暴露');
  assert(typeof globalThis.saveShotToPhone === 'function', '存手机方法已暴露');
  assert(typeof globalThis.savePreviewShot === 'function' && typeof globalThis.saveViewerShot === 'function', '预览页 / 放大页的保存入口已暴露');
  assert(typeof globalThis.autosaveOn === 'function' && typeof globalThis.setAutosave === 'function', '自动备份开关已暴露');

  const fn = globalThis.shotFileName('3TLF263');
  assert(/^IT资产铭牌_3TLF263_\d{8}-\d{4}\.jpg$/.test(fn), '文件名带 SN 与时间戳：' + fn);
  assert(!globalThis.shotFileName('A/B:C*D?').includes('/'), '文件名会过滤掉非法字符');
  assert(globalThis.autosaveOn() === true, '自动备份默认开启');
  globalThis.setAutosave(false);
  assert(globalThis.autosaveOn() === false, '开关可以关掉');
  globalThis.setAutosave(true);

  // 真正跑一次保存：应触发一次 <a download>，并弹出成功提示
  const before = els.get('#mToasts')?._appended?.length || 0;
  const ok = await globalThis.saveShotToPhone(new Blob(['x'], { type: 'image/jpeg' }), 'SMOKE123', false);
  await wait(80);
  assert(ok === true, '保存照片返回成功');
  const toasts = els.get('#mToasts')?._appended || [];
  assert(toasts.length > before, '保存后有提示');
  // 提示条结构是 <span class="toast-ico">svg</span><span>文案</span>；
  // FakeEl 的 textContent 不会拼接子节点，所以取承载文案的那个 span。
  const lastToast = toasts[toasts.length - 1];
  const lastToastText = String(lastToast?.lastElementChild?.textContent || lastToast?.textContent || '');
  assert(lastToastText.includes('IT资产铭牌_SMOKE123_'), '提示里带保存的文件名');

  const empty = await globalThis.saveShotToPhone(null, '', false);
  assert(empty === false, '没有照片时不会假装保存成功');

  // 没有照片时不应出现空白的预览块
  globalThis.renderRecognizeResult({
    brand: 'Dell', sn: 'X', brand_confidence: 0.5, sn_confidence: 0.5,
    lines: [], duplicate: { exists: false }, image_path: null,
  });
  await wait(120);
  assert(!(els.get('#main')?._innerHTML || '').includes('id="shotThumb"'), '没有照片时不渲染预览块');

  // 恢复到有照片的渲染，供后续断言使用
  globalThis.renderRecognizeResult({
    brand: 'Dell', model: 'U2723QE', sn: 'CN0M2K7P1234',
    brand_confidence: 0.99, sn_confidence: 0.99, model_confidence: 0.8,
    lines: [{ text: 'DELL', score: 0.9 }], duplicate: { exists: false },
    image_path: '/uploads/2026-09-18/smoke-shot.jpg', provider: 'mock', elapsed: 10,
  });
  await wait(120);

  const mCat = els.get('#rCat');
  mCat.value = monitor2.id;
  await mCat.onchange();
  await wait(200);

  const box2 = els.get('#rTracking');
  const h2 = box2?.innerHTML || '';
  assert(h2.includes('屏幕尺寸'), '手机端：选显示器后出现「屏幕尺寸」');
  assert(h2.includes('24寸') && h2.includes('27寸'), '手机端：屏幕尺寸选项含 24寸 / 27寸');
  assert(h2.includes('id="mt_screen_size"') && h2.includes('<select'), '手机端：屏幕尺寸渲染成下拉框');
} catch (e) { mobileErr = e; }

if (mobileErr) {
  console.log('  \x1b[31m✘\x1b[0m 手机端专属字段渲染失败：' + mobileErr.message);
  console.log(mobileErr.stack);
  failures.push('tracking-mobile');
}

/* ---------- 2f-2. 管理端设备详情的照片区 ---------- */
let photoPanelErr = null;
try {
  assert(typeof globalThis.photoPanelHTML === 'function', '管理端照片面板已暴露');
  const withPhoto = globalThis.photoPanelHTML({
    photo_path: '/uploads/a/preview.jpg',
    photo_original_path: '/uploads/a/original.jpg',
  });
  assert(withPhoto.includes('/uploads/a/preview.jpg'), '管理端详情显示压缩图');
  assert(withPhoto.includes('/uploads/a/original.jpg'), '管理端详情指向原图');
  assert(withPhoto.includes('查看原图') && withPhoto.includes('下载原图'), '管理端可查看 / 下载原图');

  const same = globalThis.photoPanelHTML({ photo_path: '/uploads/a/only.jpg' });
  assert(same.includes('同一张'), '只有一张图时应说明原图与预览相同');

  const empty = globalThis.photoPanelHTML({});
  assert(empty.includes('还没有照片'), '没有照片时给出空态提示');
  assert(!empty.includes('<img'), '空态不应输出 img 标签');

  // 设备详情里的二维码必须是「短码」（资产编号），网址码 37×37 模块缩到 150px 根本扫不出
  assert(globalThis.qrShortCode({ asset_no: 'MON-2026-0010', sn: 'XXX' }) === 'MON-2026-0010',
    '小码内容取资产编号');
  assert(globalThis.qrShortCode({ sn: 'SNONLY' }) === 'SNONLY', '没有资产编号时退回用 SN');

  const devList = await (await fetch('/api/devices?page_size=1')).json();
  const anyDev = (devList.data ?? devList).items?.[0];
  if (anyDev) {
    // 注意：m.js 也导出了 openDeviceDetail（移动端版本），这里要用管理端的别名
    await globalThis.DeviceDetailAdmin(anyDev.id);
    await wait(400);
    const modal = els.get('#modal')?._innerHTML || '';
    assert(modal.includes('设备详情'), '管理端设备详情已渲染');
    assert(modal.includes('openQRModal'), '设备详情里有「打开二维码」按钮');
    const m = /qrcode\?text=([^"&]+)/.exec(modal);
    assert(!!m, '详情里的二维码有 text 参数');
    if (m) {
      const payload = decodeURIComponent(m[1]);
      assert(!/^https?:/.test(payload), '详情二维码放的是短码而不是网址：' + payload);
      assert(payload.length <= 24, '短码要够短才好扫（≤24 字符）：' + payload);
    }
    globalThis.closeModal();
  }
} catch (e) { photoPanelErr = e; }

if (photoPanelErr) {
  console.log('  \x1b[31m✘\x1b[0m 管理端照片区渲染失败：' + photoPanelErr.message);
  console.log(photoPanelErr.stack);
  failures.push('photo-panel');
}

/* ---------- 2g. 侧边栏：手机抽屉 / 桌面收起 ---------- */
let sideErr = null;
try {
  const sb = els.get('#sidebar');
  const mask = els.get('#sidebarMask');
  const btn = els.get('#menuToggle');
  assert(typeof btn.onclick === 'function', '☰ 按钮已绑定点击事件');

  const evt = { stopPropagation() {} };

  // 手机宽度 → 抽屉
  globalThis.window.innerWidth = 390;
  btn.onclick(evt);
  assert(sb.classList.contains('open'), '手机端：点 ☰ → 侧边栏 class 含 open');
  assert(mask.hidden === false, '手机端：点 ☰ → 遮罩显示');

  mask.onclick();
  assert(!sb.classList.contains('open'), '手机端：点遮罩 → 侧边栏关闭');
  assert(mask.hidden === true, '手机端：点遮罩 → 遮罩隐藏');

  // 选中菜单后自动收起
  btn.onclick(evt);
  assert(sb.classList.contains('open'), '手机端：再点 ☰ 可重新打开');
  const devTab2 = navItems.find((e) => e.dataset.view === 'devices');
  await devTab2.onclick();
  await wait(400);
  assert(!sb.classList.contains('open'), '手机端：选中菜单后抽屉自动关闭');

  // 桌面宽度 → 收起
  globalThis.window.innerWidth = 1400;
  btn.onclick(evt);
  assert(sb.classList.contains('collapsed'), '桌面端：点 ☰ → 侧边栏收起（collapsed）');
  btn.onclick(evt);
  assert(!sb.classList.contains('collapsed'), '桌面端：再点 ☰ → 侧边栏展开');

  // 恢复手机宽度，避免影响后续用例
  globalThis.window.innerWidth = 390;
} catch (e) { sideErr = e; }

if (sideErr) {
  console.log('  \x1b[31m✘\x1b[0m 侧边栏交互失败：' + sideErr.message);
  console.log(sideErr.stack);
  failures.push('sidebar');
}

/* ---------- 2h. Excel 对接页（含实时链接卡片） ---------- */
let excelErr = null;
try {
  const excelTab = navItems.find((e) => e.dataset.view === 'excel');
  assert(!!excelTab && typeof excelTab.onclick === 'function', '侧边栏含「Excel 对接」入口');
  await excelTab.onclick();
  await wait(900);

  const x = els.get('#content')?._innerHTML || '';
  assert(x.includes('按分类分表'), 'Excel 页含「按分类分表」按钮');
  assert(x.includes('实时数据链接'), 'Excel 页含「实时数据链接」卡片');
  assert(x.includes('id="liveBase"'), '含取数地址下拉');
  assert(x.includes('id="liveFmt"'), '含链接格式下拉');
  assert(x.includes('全部分类（多表）'), 'Excel 页含「全部分类（多表）」入口');
  assert(x.includes('落在不同的工作表'), '有「每个分类落在不同工作表」的说明');
  assert(typeof globalThis.showMultiSheetGuide === 'function', '多工作表引导函数已暴露');

  // 按钮/标签文案精简：长说明收进「?」里，不再堆在按钮上
  assert(typeof globalThis.help === 'function', 'help 组件已暴露');
  const h = globalThis.help('这是一段比较长的说明文字，不该出现在按钮上');
  assert(h.includes('class="help"') && h.includes('role="button"'), 'help 渲染成可点的圆点');
  assert(/data-tip="[^"]{15,}"/.test(h), '说明文字放进了 data-tip');
  assert(!/<button/i.test(h), 'help 不能是 <button>（HTML 不允许按钮套按钮）');
  assert(typeof globalThis.showHelpTip === 'function' && typeof globalThis.hideHelpTip === 'function', '浮层的显示/隐藏方法已暴露');

  for (const long of ['按分类分表导出（带照片）', '导出全部（单表）', '不带照片', '为老照片补缩略图',
    '先看看页面里有几张表', '先在浏览器里试一下', '修改资料 / 密码', '多工作表怎么配']) {
    assert(!x.includes(long), `按钮文案已精简：不再出现「${long}」`);
  }
  assert(x.includes('按分类分表') && x.includes('单表导出'), '精简后按钮仍然看得懂');
  assert((x.match(/class="help"/g) || []).length >= 3, 'Excel 页至少放了 3 个帮助点');

  // 帮助点的样式必须在 CSS 里（否则点了没反应）
  const adminCss = fs.readFileSync(path.join(process.cwd(), 'public', 'assets', 'admin.css'), 'utf8');
  for (const sel of ['.help {', '.help-tip {', '.help-tip.on']) {
    assert(adminCss.includes(sel), `CSS 里有 ${sel}`);
  }

  const liveBox = els.get('#liveTable');
  const lh = liveBox?.innerHTML || '';
  assert(lh.includes('全部设备'), '实时链接表格已渲染「全部设备」行');
  assert(lh.includes('copyLiveLink'), '含复制链接按钮');

  const baseSel = els.get('#liveBase');
  assert(typeof baseSel.onchange === 'function', '取数地址下拉已绑定 onchange');
  assert(typeof els.get('#liveFmt').onchange === 'function', '链接格式下拉已绑定 onchange');
  assert(typeof els.get('#btnLiveGuide').onclick === 'function', '「配置步骤」按钮已绑定');
  assert(typeof els.get('#btnResetLive').onclick === 'function', '「重置链接」按钮已绑定');

  // 切到 CSV 再切回网页表格，应都能渲染
  els.get('#liveFmt').value = 'csv';
  await els.get('#liveFmt').onchange();
  await wait(150);
  assert((els.get('#liveTable').innerHTML || '').includes('全部设备'), '切到 CSV 格式后表格仍正常');

  // 打开配置引导，内容里要有 WPS 说明
  els.get('#btnLiveGuide').onclick();
  await wait(200);
  const modal = els.get('#modal')?._innerHTML || '';
  assert(modal.includes('WPS'), '配置引导弹窗包含 WPS 说明');
  assert(modal.includes('网页表格'), '配置引导弹窗说明网页表格格式');
  closeModal();

  // 多工作表引导
  globalThis.showMultiSheetGuide();
  await wait(200);
  const m2 = els.get('#modal')?._innerHTML || '';
  assert(m2.includes('每个分类落在不同工作表'), '多工作表引导弹窗已打开');
  assert(m2.includes('逐个导入'), '多工作表引导含「逐个导入」兜底方案');
  assert(m2.includes('多表链接') || m2.includes('复制'), '多工作表引导含复制按钮');
  closeModal();
} catch (e) { excelErr = e; }

if (excelErr) {
  console.log('  \x1b[31m✘\x1b[0m Excel 对接页渲染失败：' + excelErr.message);
  console.log(excelErr.stack);
  failures.push('excel-page');
}

/* ---------- 2h-2. 导出下载：必须自己拿到字节再触发下载，文件名要带 .xlsx ---------- */
let dlErr = null;
try {
  const excelHTML = els.get('#content')?._innerHTML || '';
  assert(excelHTML.includes('btnBackfill'), 'Excel 页含「为老照片补缩略图」按钮');
  assert(excelHTML.includes('=IMAGE('), 'Excel 页说明了 =IMAGE() 的用法');

  // 设备台账页：右上角是「全部导出」，勾选后走「批量操作 → 导出所选」
  const devTab2 = navItems.find((e) => e.dataset.view === 'devices');
  await devTab2.onclick();
  await wait(600);
  const devHTML = els.get('#content')?._innerHTML || '';
  // 按钮文案 = 内联 SVG 图标 + 文本（v3 起去掉了 ⬇ emoji），按语义断言
  assert(/id="btnExport"/.test(devHTML) && devHTML.includes('全部导出'), '设备台账右上角按钮是「全部导出」');
  assert(/<svg[^>]*class="ic"/.test(devHTML), '按钮图标用内联 SVG（已去除 emoji）');
  assert(!/<button[^>]*>(?:\s*<svg[\s\S]*?<\/svg>)?\s*导出\s*<\/button>/.test(devHTML), '不再有一个含糊的「导出」按钮');
  assert(devHTML.includes('data-act="export"'), '批量操作菜单里有「导出所选」');
  assert(/title="[^"]*不受上方筛选影响/.test(devHTML), '「全部导出」有说明它不受筛选影响');

  assert(typeof globalThis.doExport === 'function', 'doExport 已暴露');
  const before = (els.get('#toasts')?._appended || []).length;
  const r = await globalThis.doExport({ split: true });
  assert(!!r && r.size > 1000, '导出返回了实际文件（' + (r?.size || 0) + ' 字节）');
  assert(/\.xlsx$/.test(r.name || ''), '下载文件名以 .xlsx 结尾：' + r.name);
  assert(!/^\s*export\s*$/.test(r.name || ''), '文件名不能是「export」这种从 URL 猜出来的名字');

  const toasts = els.get('#toasts')?._appended || [];
  assert(toasts.length > before, '导出后有提示');
  const last = String(toasts[toasts.length - 1]?.lastElementChild?.textContent || '');
  assert(last.includes('.xlsx'), '提示里带下载的文件名：' + last);

  // 不带照片时文件应该小得多
  const small = await globalThis.doExport({ split: true, photos: false });
  assert(!!small && small.size > 0, '不带照片也能导出');
  assert(small.size < r.size, `不带照片应更小（${small.size} < ${r.size}）`);
} catch (e) { dlErr = e; }

if (dlErr) {
  console.log('  \x1b[31m✘\x1b[0m 导出下载失败：' + dlErr.message);
  console.log(dlErr.stack);
  failures.push('export-download');
}

/* ---------- 3. 视觉大模型预设 ---------- */
let presetErr = null;
try {
  const provSel = els.get('#ocrProvider');
  assert(!!provSel && typeof provSel.onchange === 'function', '服务商下拉已绑定 onchange');
  provSel.value = 'vision';
  await provSel.onchange({ target: provSel });
  await wait(200);

  const fields = els.get('#ocrFields')?._innerHTML || '';
  assert(fields.includes('服务商预设'), '视觉模型显示「服务商预设」下拉');
  assert(fields.includes('glm-4.6v-flash'), '预设里包含免费的智谱 GLM-4.6V-Flash');
  assert(fields.includes('国际站'), '预设里包含智谱国际站 z.ai');
  assert(fields.includes('魔搭'), '预设里包含魔搭 ModelScope');
  assert(fields.includes('阿里百炼'), '预设里包含阿里百炼');
  assert(fields.includes('硅基流动'), '预设里包含硅基流动');
  assert(fields.includes('豆包'), '预设里包含火山方舟豆包');
  assert(fields.includes('ocr_image_format'), '包含「图片编码方式」下拉');

  // 选择「智谱 GLM-4.6V-Flash」预设，应自动填好 base_url + model + 图片格式
  const presetSel = els.get('#visionPreset');
  assert(!!presetSel && typeof presetSel.onchange === 'function', '预设下拉已绑定 onchange');
  presetSel.value = 'zhipu';
  await presetSel.onchange();
  await wait(100);
  assert(els.get('#ocr_base_url').value === 'https://open.bigmodel.cn/api/paas/v4', '选智谱后自动填入 Base URL');
  assert(els.get('#ocr_model').value === 'glm-4.6v-flash', '选智谱后自动填入模型名 glm-4.6v-flash');
  assert(els.get('#ocr_image_format').value === 'base64', '选智谱后自动把图片格式设为裸 base64');

  presetSel.value = 'modelscope';
  await presetSel.onchange();
  await wait(100);
  assert(els.get('#ocr_base_url').value === 'https://api-inference.modelscope.cn/v1', '选魔搭后自动填入 Base URL');
  assert(els.get('#ocr_model').value === 'Qwen/Qwen2.5-VL-7B-Instruct', '选魔搭后自动填入模型名');
  assert(els.get('#ocr_image_format').value === 'auto', '选魔搭后图片格式回到自动');
} catch (e) { presetErr = e; }

if (presetErr) {
  console.log('  \x1b[31m✘\x1b[0m 视觉模型预设交互抛错：' + presetErr.message);
  console.log(presetErr.stack);
  failures.push('vision-preset');
}

/* ---------- 结果 ---------- */
if (failures.length) {
  console.log('\n=== 渲染冒烟：失败 ' + failures.length + ' 项 ===\n');
  process.exit(1);
}
console.log('\n=== 渲染冒烟：全部通过 ===\n');
