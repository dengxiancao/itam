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

const NAV_IDS = ['dashboard', 'explorer', 'devices', 'orgs', 'categories', 'agent', 'excel', 'trash', 'users', 'settings'];
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
  // 全局事件监听：页面模块加载时会注册键盘快捷键（资源管理器那套 F2/F5/Delete/方向键）。
  // 假 DOM 里给个记录器，既不会崩，也能顺带断言「有没有注册」。
  _listeners: [],
  addEventListener(type, fn) { this._listeners.push({ type, fn }); },
  removeEventListener(type, fn) {
    this._listeners = this._listeners.filter((l) => !(l.type === type && l.fn === fn));
  },
  body: new FakeEl(),
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
// 浏览器里 window.addEventListener 一定存在（页面模块会给滚动/键盘挂全局监听）。
// 这里 window === globalThis，而 Node 的 globalThis 没有这俩方法，缺了就会在加载阶段直接崩。
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};

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

/* ---------- 0. 元素 id 不能跨渲染单元重名（2026-09 线上故障的看门测试） ----------
 * 故障回顾：台账页筛选栏和编辑弹窗都用了 fBrand / fOrg / fStatus，
 * `$('#id')` 只取 DOM 里第一个 → 弹窗保存时读到筛选栏的空值 →
 * 「编辑保存后品牌被清空、所属组织变未分配、状态回落成库存」。
 * 这里按源码扫描，任何两个渲染单元（函数/模板常量）之间出现同名 id 就报错。
 */
{
  const { findIdCollisions } = await import('../scripts/check-ids.js');
  const adminSrc = fs.readFileSync(path.join(process.cwd(), 'public', 'assets', 'admin.js'), 'utf8');
  const mobileSrc = fs.readFileSync(path.join(process.cwd(), 'public', 'assets', 'm.js'), 'utf8');
  const adminClash = findIdCollisions(adminSrc);
  assert(adminClash.length === 0,
    'admin.js 有 id 冲突：' + adminClash.map((c) => `${c.id}(${c.a} vs ${c.b})`).join('、'));
  // 手机端各页面是互斥的（同一时刻只渲染一个），同名不算冲突；
  // 但「同一个页面里同时存在」的两块仍然要拦，这里只报告不失败，作为提示。
  const mobileClash = findIdCollisions(mobileSrc);
  if (mobileClash.length) {
    console.log('  \x1b[33m⚠\x1b[0m m.js 里同名 id（互斥页面，仅供参考）：' +
      [...new Set(mobileClash.map((c) => c.id))].join('、'));
  }
}

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
  // 手机录入默认值卡片（用户要求：录入表单那几个下拉要能预设默认项）
  assert(set.includes('手机录入默认值'), '系统设置含「手机录入默认值」卡片');
  for (const id of ['mdCategory', 'mdOrg', 'mdSupplier', 'mdStatus', 'saveMobile']) {
    assert(set.includes(`id="${id}"`), `默认值卡片含 #${id}`);
  }
  assert(typeof els.get('#saveMobile').onclick === 'function', '默认值的保存按钮已绑定');
}

/* ---------- 2a. 切到资源管理器（按组织架构浏览设备） ---------- */
let exErr = null;
try {
  const exTab = navItems.find((e) => e.dataset.view === 'explorer');
  assert(!!exTab, '侧边栏含「资源管理器」入口');
  assert(typeof globalThis.renderExplorer === 'function', 'renderExplorer 已暴露');
  await exTab.onclick();
  await wait(900);
} catch (e) { exErr = e; }

if (exErr) {
  console.log('  \x1b[31m✘\x1b[0m 资源管理器渲染抛错：' + exErr.message);
  console.log(exErr.stack);
  failures.push('explorer');
} else {
  const ex = els.get('#content')?._innerHTML || '';
  assert(ex.length > 300, '资源管理器有内容（长度 ' + ex.length + '）');
  // 骨架：左树 + 工具条（导航按钮/地址栏/搜索/视图）+ 内容区 + 状态栏
  assert(ex.includes('ex-side') && ex.includes('ex-tree') && ex.includes('ex-main'), '左右两栏骨架都在');
  assert(ex.includes('ex-toolbar'), '有资源管理器式工具条');
  assert(ex.includes('exBack') && ex.includes('exFwd') && ex.includes('exUp') && ex.includes('exRefresh'),
    '工具条有 后退/前进/向上一级/刷新 四个按钮');
  assert(ex.includes('ex-addr'), '有地址栏（面包屑）');
  assert(ex.includes('ex-search'), '有搜索框');
  assert(ex.includes('ex-viewtoggle') && ex.includes('data-view="details"') && ex.includes('data-view="tiles"'),
    '有 详细信息 / 大图标 两种视图切换');
  assert(ex.includes('组织架构'), '左栏标题是组织架构');
  assert(ex.includes('全部设备'), '树里有「全部设备」根节点');
  assert(ex.includes('未分配组织'), '树里有「未分配组织」虚拟文件夹');
  // 文件夹名就是组织机构名（数据来自 /api/orgs，默认组织里有「总公司」）
  assert(ex.includes('总公司'), '树的文件夹名就是组织名称（找「总公司」）');

  // 内容区里的两种行：子文件夹行、设备行（假 DOM 看不到 innerHTML 新建的元素，直接调渲染函数）
  const folderRow = globalThis.exFolderRowHTML({
    id: 'org-1', name: '运维组', path: '总公司 / 信息技术部 / 运维组',
    device_count: 3, total_count: 9, child_count: 2, updated_at: '2026-09-20T10:00:00.000Z',
  }, 0);
  assert(folderRow.includes('运维组'), '文件夹行显示组织名');
  assert(folderRow.includes('2 个子文件夹'), '文件夹行显示子文件夹个数');
  assert(folderRow.includes('ex-item folder'), '文件夹行有 folders 专属样式');
  assert(folderRow.includes('data-drop="1"'), '文件夹行是拖放目标（可以往里拖设备）');

  const deviceRow = globalThis.exDeviceRowHTML({
    id: 'dev-1', asset_no: 'PC-2026-0017', sn: 'YLX2K4K1', brand: '联想', model: 'ThinkCentre M720',
    status: 'in_use', owner_name: '李娜', org_path: '总公司 / 信息技术部 / 运维组',
    category_name: '台式主机', category_icon: 'pc', category_color: '#2563eb',
    updated_at: '2026-09-20T10:00:00.000Z',
  }, 1);
  assert(deviceRow.includes('PC-2026-0017'), '设备行显示资产编号');
  assert(deviceRow.includes('YLX2K4K1'), '设备行显示序列号');
  assert(deviceRow.includes('ThinkCentre M720'), '设备行显示品牌型号');
  assert(deviceRow.includes('李娜'), '设备行显示使用人');
  assert(deviceRow.includes('总公司 / 信息技术部'), '设备行显示所在位置');
  assert(deviceRow.includes('draggable="true"'), '设备行可拖动（拖到文件夹=改归属）');
  assert(/badge/.test(deviceRow), '设备行显示状态徽标');
  // ⚠️ 上一版每行都有「打开」按钮和勾选框，那是网页表格的做法。
  //    资源管理器靠单击/Ctrl/Shift 选中，这里必须**没有**这些东西。
  assert(!/data-open/.test(deviceRow), '设备行不再有「打开」按钮（双击打开）');
  assert(!/type="checkbox"/.test(deviceRow), '设备行不再有勾选框（用 Ctrl/Shift 多选）');
  assert(globalThis.exEmptyHTML().includes('拖进来'), '空文件夹提示可以拖设备进来');

  // 右键菜单（三套：设备 / 文件夹 / 空白处）
  const devMenu = globalThis.exDeviceMenu().filter((x) => x !== '-').map((x) => x.label).join('/');
  assert(devMenu.includes('打开') && devMenu.includes('编辑属性') && devMenu.includes('移动到'),
    '设备右键菜单有 打开/编辑/移动到：' + devMenu);
  assert(devMenu.includes('删除'), '设备右键菜单有删除');
  const folderMenu = globalThis.exFolderMenu('org-1').filter((x) => x !== '-').map((x) => x.label).join('/');
  assert(folderMenu.includes('打开') && folderMenu.includes('新建子文件夹') && folderMenu.includes('重命名'),
    '文件夹右键菜单有 打开/新建子文件夹/重命名：' + folderMenu);
  const emptyMenu = globalThis.exEmptyMenu().filter((x) => x !== '-').map((x) => x.label).join('/');
  assert(emptyMenu.includes('新建文件夹') && emptyMenu.includes('刷新') && emptyMenu.includes('全选'),
    '空白处右键菜单有 新建文件夹/刷新/全选：' + emptyMenu);

  // 全局键盘快捷键已注册（Enter/F2/Delete/F5/Backspace/方向键/Alt+左右）
  const kd = (els.get('#content'), null);
  const listeners = globalThis.document._listeners || [];
  assert(listeners.some((l) => l.type === 'keydown'), '已注册全局键盘监听（资源管理器快捷键）');
  assert(typeof globalThis.exKeyHandler === 'function', 'exKeyHandler 已暴露（便于将来单独测按键）');
}

/* ---------- 2b0. 切到自动盘点（GLPI Agent） ---------- */
let agentErr = null;
try {
  const agentTab = navItems.find((e) => e.dataset.view === 'agent');
  assert(!!agentTab, '侧边栏含「自动盘点」入口');
  await agentTab.onclick();
  await wait(900);
} catch (e) { agentErr = e; }

if (agentErr) {
  console.log('  \x1b[31m✘\x1b[0m 自动盘点页渲染抛错：' + agentErr.message);
  console.log(agentErr.stack);
  failures.push('agent');
} else {
  const a = els.get('#content')?._innerHTML || '';
  assert(a.length > 300, '自动盘点页有内容（长度 ' + a.length + '）');
  // 四张数字卡 + 五个页签
  assert(a.includes('已盘点机器') && a.includes('待认领机器'), '顶部有数字卡');
  for (const tab of ['待认领机器', '显示器', '上报令牌', '上报历史', '安装指引']) {
    assert(a.includes(tab), `页签「${tab}」存在`);
  }
  // 待认领区（新库里没有机器，应该给空态 + 去安装指引的路，而不是一片空白）
  assert(a.includes('待认领') , '待认领区域已渲染');
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
  // 2026-09 改版：表单只固定显示 7 个核心字段，其余字段由「设备分类 → 专属字段」决定；
  // 分类没点名的收进底部折叠区「其他字段」（仍在 DOM 里，所以数据能看能改）。
  for (const core of ['df_asset_no', 'df_cat', 'df_brand', 'df_model', 'df_sn', 'df_org', 'df_status']) {
    assert(m.includes(`id="${core}"`), `核心字段 #${core} 必须始终显示`);
  }
  /*
   * ⚠️ 弹窗字段必须用 df_ 前缀：台账页的筛选栏已经占了 fOrg / fStatus / fBrand 这几个 id，
   *    而 $('#id') 只返回 DOM 里第一个匹配的元素 —— 一旦重名，保存时读到的是筛选栏的空值，
   *    表现就是「编辑保存后品牌被清空、组织变未分配、状态回落成库存」（2026-09 线上真实故障）。
   */
  for (const clash of ['fOrg', 'fStatus', 'fBrand', 'fKeyword', 'fCategory', 'fSupplier']) {
    assert(!m.includes(`id="${clash}"`), `弹窗里不许再用页面级 id「${clash}」（会和筛选栏抢）`);
  }
  assert(!m.includes('id="fOwner"') && !m.includes('id="fCPU"') && !m.includes('id="fGrade"'),
    '以前那批写死的字段（使用人/CPU/成色…）不再直接铺在表单上');
  assert(m.includes('field-extra') && m.includes('其他字段'), '没被分类点名的字段收进折叠区「其他字段」');
  assert(m.includes('id="optFieldsSlot"') && m.includes('id="catFieldsSlot"'), '专属字段区 / 其他字段区两个插槽都在');
  // 折叠区里仍然真的渲染了输入控件（否则已存数据没法改）
  assert(m.includes('id="o_supplier"'), '供应商在折叠区里仍渲染成输入控件');
  assert(m.includes('易点云') && m.includes('小熊'), '供应商下拉含「易点云 / 小熊」');
  assert(/id="o_supplier"[\s\S]{0,300}<option/.test(m) || m.includes('<select id="o_supplier"'), '供应商是下拉而不是纯文本');
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

  const catSel = els.get('#df_cat');
  catSel.value = monitor.id;
  await catSel.onchange();
  await wait(200);

  // 2026-09 改版：换分类不再往弹窗尾部追加一个 div，而是**重建专属字段插槽的内容**
  // （这样上面已经填好的品牌/SN 不会被整表单重绘抹掉）
  const html = els.get('#catFieldsSlot')?.innerHTML || '';
  assert(html.includes('屏幕尺寸'), '管理端：选显示器后出现「屏幕尺寸」');
  assert(html.includes('24寸') && html.includes('27寸'), '管理端：屏幕尺寸选项含 24寸 / 27寸');
  assert(html.includes('id="x_screen_size"') && html.includes('<select'), '管理端：屏幕尺寸渲染成下拉框');
  // 换分类时「其他字段」也要跟着重算：显示器配了 screen_size，就不该在折叠区再出现一次
  const optAfter = els.get('#optFieldsSlot')?.innerHTML || '';
  assert(!optAfter.includes('id="o_screen_size"'), '分类已配置的字段不该在「其他字段」里重复出现');
  assert(optAfter.includes('id="o_purchase_date"'), '分类没配置的字段仍留在「其他字段」里（数据能看能改）');

  // 专属字段的「默认值」：新建设备时应按默认值预填/预选（管理端也要跟上，不然手机端配了默认值、
  // 电脑端却没有，两边行为不一致会让人以为配置没生效）
  const withDefault = options.categories.map((c) => c);
  const target = withDefault.find((c) => c.code === 'MON');
  if (target) {
    // 临时给这个分类加一个带默认值的字段，直接调渲染函数看产出
    const html2 = globalThis.trackingInputHTML({ key: 'screen_size', label: '屏幕尺寸', type: 'select', options: ['24寸', '27寸'], default: '27寸' }, globalThis.fieldDefault({ key: 'screen_size', type: 'select', options: ['24寸', '27寸'], default: '27寸' }));
    assert(html2.includes('value="27寸" selected'), '默认值直接作用到专属字段控件上');
    assert(globalThis.fieldDefault({ key: 'x', type: 'select', options: ['a'], default: 'z' }) === '',
      '下拉默认值不在选项里时返回空（不能选一个不存在的值）');
    assert(globalThis.fieldDefault({ key: 'y', type: 'text', default: 'abc' }) === 'abc', '文本字段默认值直接可用');
  }
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

  /* —— 识别结果页的「补充信息」：使用人 / 存放位置 由分类字段驱动，状态默认「在用」 ——
   * 2026-09 用户要求：① 把使用人、存放位置改成设备分类里可编辑的字段（能改名/删掉）；
   *                  ② 状态默认从「库存」改成「在用」。
   */
  assert(!mainHTML.includes('id="rOwner"'), '手机端不再写死「使用人」输入框');
  assert(!mainHTML.includes('id="rLocation"'), '手机端不再写死「存放位置」输入框');
  assert(mainHTML.includes('id="rTracking"'), '改为由分类专属字段区渲染');
  // 状态默认必须是「在用」（in_use），不能是「库存」
  assert(mainHTML.includes('id="rStatus"'), '状态选择框在');
  assert(!/id="rStatus"[\s\S]{0,400}?value="in_stock" selected/.test(mainHTML), '状态默认不该是「库存」');
  assert(/id="rStatus"[\s\S]{0,400}?value="in_use" selected/.test(mainHTML), '状态默认应该是「在用」');
  // 专属字段区里应该有使用人 / 存放位置（键名来自分类配置）
  const pcCat = (globalThis.mobileState?.categories || []).find((c) => c.code === 'PC');
  assert(!!pcCat, '手机端已加载「台式主机」分类');
  assert(pcCat.tracking_fields.some((f) => f.key === 'owner_name')
    && pcCat.tracking_fields.some((f) => f.key === 'location'),
    '台式主机分类的专属字段里带「使用人 / 存放位置」');
  // 指定分类后重渲染专属字段（假 DOM 里 #rCat 的 value 要手动给）
  els.get('#rCat').value = pcCat.id;
  globalThis.renderMobileTracking();
  await wait(120);
  const trackHTML = els.get('#rTracking')?.innerHTML || '';
  assert(trackHTML.includes('id="mt_owner_name"'), '「使用人」由分类字段渲染出输入框');
  assert(trackHTML.includes('id="mt_location"'), '「存放位置」由分类字段渲染出输入框');
  assert(trackHTML.includes('台式主机'), '专属字段区标了当前分类名');
  // 显示器分类没有 cpu，但同样有使用人 / 存放位置
  const monCat = (globalThis.mobileState?.categories || []).find((c) => c.code === 'MON');
  if (monCat) {
    els.get('#rCat').value = monCat.id;
    globalThis.renderMobileTracking();
    await wait(80);
    const monTrack = els.get('#rTracking')?.innerHTML || '';
    assert(monTrack.includes('id="mt_screen_size"'), '显示器分类显示出「屏幕尺寸」');
    assert(monTrack.includes('id="mt_owner_name"'), '显示器分类也有「使用人」');
  }

  /* —— 录入表单的「默认选中项」：管理端配了默认值，手机上打开就该是它 ——
   * 用户要求（2026-09）：这些下拉每次都要手点，太费时间，要能预设默认项。
   */
  const orgForTest = (globalThis.mobileState?.orgs || [])[0];
  const supForTest = (globalThis.mobileState?.suppliers || [])[0];
  const statusesForTest = globalThis.mobileState?.statuses || [];
  const idleForTest = statusesForTest.find((s) => s.id === 'idle') || statusesForTest[0];
  globalThis.mobileState.mobileDefaults = {
    category_id: pcCat.id,
    org_id: orgForTest?.id || null,
    supplier: supForTest || null,
    status: idleForTest?.id || 'in_use',
  };
  globalThis.renderRecognizeResult({
    brand: 'Dell', model: 'XPS 13', sn: 'DEFAULTTEST01',
    brand_confidence: 0.9, sn_confidence: 0.9, lines: [], duplicate: { exists: false },
    image_path: '/uploads/2026-09-18/smoke-shot.jpg', provider: 'mock',
  });
  await wait(250);
  const dfltHTML = els.get('#main')?._innerHTML || '';
  assert(dfltHTML.includes(`value="${pcCat.id}" selected`), '设备分类默认选中了配置的分类');
  if (orgForTest) assert(dfltHTML.includes(`value="${orgForTest.id}" selected`), '所属组织默认选中了配置的组织');
  if (supForTest) assert(dfltHTML.includes(`value="${supForTest}" selected`), '供应商默认选中了配置的供应商');
  if (idleForTest) assert(dfltHTML.includes(`value="${idleForTest.id}" selected`), '状态默认选中了配置的状态');

  // 分类专属字段的默认值（下拉只在「默认值确实在选项里」时生效）
  if (monCat) {
    monCat.tracking_fields = [
      { key: 'screen_size', label: '屏幕尺寸', type: 'select', options: ['24寸', '27寸'], default: '27寸' },
      { key: 'resolution', label: '分辨率', type: 'text', default: '1920x1080' },
    ];
    els.get('#rCat').value = monCat.id;
    globalThis.renderMobileTracking();
    await wait(120);
    const withDefault = els.get('#rTracking')?.innerHTML || '';
    assert(withDefault.includes('value="27寸" selected'), '下拉字段按默认值预选（屏幕尺寸 27寸）');
    assert(withDefault.includes('value="1920x1080"'), '文本字段按默认值预填');

    // 默认值不在选项里 → 必须忽略，不能选一个不存在的值
    monCat.tracking_fields = [
      { key: 'screen_size', label: '屏幕尺寸', type: 'select', options: ['24寸', '27寸'], default: '32寸' },
    ];
    globalThis.renderMobileTracking();
    await wait(120);
    const badDefault = els.get('#rTracking')?.innerHTML || '';
    assert(!badDefault.includes('value="32寸" selected'), '不在选项里的默认值必须被忽略');
    assert(!/32寸/.test(badDefault), '连选项里都不该冒出这个值');
  }

  /* —— 「补充信息」的记忆功能 ——
   * 用户要求（2026-09）：上次录入的内容下次自动填回来。
   * 存手机本地（localStorage），并且**记忆优先于管理端配的默认值**（记忆更新、更贴近当下）。
   */
  // 先造一段"上次填过的内容"，再渲染，看是不是都填回来了
  const memOrg = (globalThis.mobileState?.orgs || [])[1] || orgForTest;
  const memSup = (globalThis.mobileState?.suppliers || [])[1] || supForTest;
  const memStatus = statusesForTest.find((s) => s.id === 'repair') || idleForTest;
  globalThis.rememberMobileFill({
    category_id: pcCat.id,
    org_id: memOrg?.id || '',
    supplier: memSup || '',
    status: memStatus?.id || '',
    fields: { owner_name: '上次的那个人', location: '7楼懂车帝' },
  });
  const mem = globalThis.mobileMemory();
  assert(mem.category_id === pcCat.id, '记忆里存住了分类');
  assert(mem.fields.owner_name === '上次的那个人', '记忆里存住了分类字段的值');
  assert(!('sn' in mem.fields) || mem.fields.sn === undefined, '识别出来的字段不该混进记忆');

  globalThis.renderRecognizeResult({
    brand: 'Dell', model: 'XPS 13', sn: 'MEMTEST01',
    brand_confidence: 0.9, sn_confidence: 0.9, lines: [], duplicate: { exists: false },
    image_path: '/uploads/2026-09-18/smoke-shot.jpg', provider: 'mock',
  });
  await wait(250);
  const memHTML = els.get('#main')?._innerHTML || '';
  // 记忆优先于管理端默认值：这里默认值是 idle/第一个组织，记忆里是 repair/第二个组织
  if (memOrg) assert(memHTML.includes(`value="${memOrg.id}" selected`), '所属组织按「上次填的」回填');
  if (memSup) assert(memHTML.includes(`value="${memSup}" selected`), '供应商按「上次填的」回填');
  if (memStatus) assert(memHTML.includes(`value="${memStatus.id}" selected`), '状态按「上次填的」回填');
  assert(memHTML.includes('上次录入') || memHTML.includes('清除记忆'), '界面提示了"已按上次录入填好"并给了清除入口');
  // 分类字段也要按记忆回填
  els.get('#rCat').value = pcCat.id;
  globalThis.renderMobileTracking();
  await wait(120);
  const memTrack = els.get('#rTracking')?.innerHTML || '';
  assert(memTrack.includes('value="上次的那个人"'), '「使用人」按上次填的回填');
  assert(memTrack.includes('value="7楼懂车帝"'), '「存放位置」按上次填的回填');

  // ⚠️ 记忆里的值如果已经失效（组织被删、供应商改名），必须忽略，不能填一个不存在的值
  globalThis.rememberMobileFill({
    category_id: pcCat.id, org_id: 'no-such-org', supplier: '不存在的供应商', status: 'no-such-status',
    fields: { screen_size: '99寸' },
  });
  globalThis.renderRecognizeResult({
    brand: 'Dell', model: 'XPS 13', sn: 'MEMTEST02',
    brand_confidence: 0.9, sn_confidence: 0.9, lines: [], duplicate: { exists: false },
    image_path: '/uploads/2026-09-18/smoke-shot.jpg', provider: 'mock',
  });
  await wait(220);
  const deadHTML = els.get('#main')?._innerHTML || '';
  assert(!deadHTML.includes('value="no-such-org" selected'), '失效的组织记忆必须被忽略');
  assert(!deadHTML.includes('value="不存在的供应商" selected'), '失效的供应商记忆必须被忽略');
  assert(!deadHTML.includes('value="no-such-status" selected'), '失效的状态记忆必须被忽略');
  // 失效时应该回落到管理端默认值（这里默认 status 是 idle）
  if (idleForTest) assert(deadHTML.includes(`value="${idleForTest.id}" selected`), '记忆失效后回落到管理端默认值');

  // 清除记忆：两段式确认（第一次点只是"预备"，第二次才真清）
  globalThis.clearMobileMemoryConfirm();
  assert(globalThis.mobileMemory().category_id === pcCat.id, '第一次点「清除记忆」不该真的清掉（防误触）');
  globalThis.clearMobileMemoryConfirm();
  assert(!globalThis.mobileMemory().category_id, '第二次点才真的清掉');
  assert(Object.keys(globalThis.mobileMemory().fields || {}).length === 0, '分类字段的记忆也一起清掉');

  // 扫码核对 ≠ 识别入库：这是两条完全不同的流程
  globalThis.mobileState.scanMode = 'scan';
  globalThis.renderScan();
  await wait(120);
  const scanHTML = els.get('#main')?._innerHTML || '';
  assert(scanHTML.includes('扫二维码') || scanHTML.includes('扫码核对') || scanHTML.includes('扫描资产二维码'),
    '扫码页渲染出来了');
  // 本测试环境没有 BarcodeDetector。**二维码入口必须照样给**（点它会走服务端解码，
  // 这是 iPhone / Safari 唯一能在网页里扫码的路），不能因为本机没 API 就把入口藏掉 ——
  // 这条正是「iPhone 上点扫码直接被告知不能扫」那个老毛病的看门断言。
  assert(/openCamera\('scan','qr'\)/.test(scanHTML), '本机没有扫码 API 时，二维码入口依然保留（走服务端解码）');
  assert(scanHTML.includes('服务端'), '界面说清了二维码是交给服务器解的');
  // 一维条码没有服务端兜底，本机没 API 时要老实说明并给手动输入的路
  assert(scanHTML.includes('不能网页内扫条码'), '本机没有扫码 API 时，条码入口明确说明不可用');
  assert(scanHTML.includes('manualSN'), '扫码页始终保留手动输入 SN');
  assert(scanHTML.includes('手机自带相机'), '没有扫码 API 时提示改用手机自带相机');

  // 扫码模式下按快门，绝不能掉进「识别入库」的预览流程。
  // 本机没识别器、服务端也没解出这一帧 → 应该落到手动输入页，而不是卡在相机里报错。
  els.get('#main').innerHTML = '';
  await globalThis.captureForScan({ videoWidth: 640, videoHeight: 480 });
  await wait(120);
  const afterShutter = els.get('#main')?._innerHTML || '';
  assert(!afterShutter.includes('id="btnSave"'), '扫码模式按快门不会进「保存入库」页');
  assert(!afterShutter.includes('综合置信度'), '扫码模式按快门不会进识别结果页');
  assert(afterShutter.includes('手动输入'), '本机无扫码能力 + 服务端没解出时落到手动输入页');
  globalThis.mobileState.scanMode = 'lookup';

  // 移动端 ⇄ 管理端 必须能双向走：管理端有「打开移动端录入」，反过来也得能回去。
  // 注意（第六轮改版）：回管理端 / 使用手册 **不再摆在首页正文里**，已收进顶栏右上角「更多」菜单，
  // 两个主页面共用一份。所以这里不再查 renderHome() 的产出，改查 m/index.html 里的菜单结构
  // —— 页面上的「该不该出现」由 tests/m-dashboard-slim.js 专门看住。
  globalThis.renderHome();
  await wait(150);
  const homeHTML = els.get('#main')?._innerHTML || '';
  assert(homeHTML.length > 0, '移动端识别入库页渲染出了内容');
  assert(!/回到电脑端管理后台/.test(homeHTML), '识别入库页正文不再重复摆「回管理后台」（已收进右上角菜单）');
  assert(!/使用手册/.test(homeHTML), '识别入库页正文不再重复摆「使用手册」（已收进右上角菜单）');

  // 顶栏那个「更多」按钮和菜单是写在 HTML 里的（JS 不重建顶栏），所以直接查源文件
  const mIndexHtml = fs.readFileSync(path.join(process.cwd(), 'public', 'm', 'index.html'), 'utf8');
  assert(mIndexHtml.includes('id="moreBtn"'), '移动端顶栏有「更多」菜单按钮');
  assert(/id="moreBtn"[\s\S]{0,400}aria-label="更多"/.test(mIndexHtml), '「更多」按钮带无障碍文案');
  assert(mIndexHtml.includes('id="moreSheet"'), '「更多」菜单面板已渲染进 HTML');
  assert(/id="moreSheet"[\s\S]{0,600}href="\/"/.test(mIndexHtml), '菜单里有回管理端的链接（href="/"）');
  assert(/id="moreSheet"[\s\S]{0,900}href="\/manual"/.test(mIndexHtml), '菜单里有使用手册入口（href="/manual"）');
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

  // 设备详情里的二维码必须是「短码」（资产编号）：21×21 模块，150px 下每格 5.6px，
  // 比网址码（33×33 模块）容错余量大得多，也不依赖手机能否访问那个地址。
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

    // 「打开二维码」弹窗要同时给两种码：短码（资产编号）+ 网址码（带设备号）。
    // 移动端「扫码核对」两种都必须认 —— 系统生成的就是这两种，扫不了等于功能不可用。
    await globalThis.openQRModal(anyDev.id);
    await wait(400);
    const qrModal = els.get('#modal')?._innerHTML || '';
    assert(qrModal.includes('资产二维码'), '二维码弹窗已渲染');
    const texts = [...qrModal.matchAll(/qrcode\?text=([^"&]+)/g)].map((x) => decodeURIComponent(x[1]));
    assert(texts.length >= 2, '二维码弹窗给出两种码（实得 ' + texts.length + ' 个）');
    assert(texts.some((t) => /#\/device\//.test(t)), '其中有网址码（含 #/device/<uuid>）');
    // 移动端 handleScanned 靠这个正则从网址码里抠设备号，抠不到就会去查 SN 而失败
    const urlPayload = texts.find((t) => /#\/device\//.test(t)) || '';
    assert(/#\/device\/[0-9a-fA-F-]{6,}/.test(urlPayload),
      '网址码里的设备号能被扫码正则认出来：' + urlPayload.slice(0, 60));
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

/* ---------- 2h. Excel 页（按「你要做什么」组织的三张任务卡） ---------- */
let excelErr = null;
try {
  const excelTab = navItems.find((e) => e.dataset.view === 'excel');
  assert(!!excelTab && typeof excelTab.onclick === 'function', '侧边栏含 Excel 入口');
  await excelTab.onclick();
  await wait(900);

  const x = els.get('#content')?._innerHTML || '';

  // ① 这一页必须按"做什么"组织，而不是按技术手段组织
  assert(x.includes('导出一份 Excel 文件'), '任务①：导出（说人话的标题）');
  assert(x.includes('把填好的表传回来'), '任务②：导入（说人话的标题）');
  assert(x.includes('让 Excel 自己跟着更新'), '任务③：自动更新（说人话的标题）');
  const iE = x.indexOf('导出一份 Excel 文件');
  const iI = x.indexOf('把填好的表传回来');
  const iL = x.indexOf('让 Excel 自己跟着更新');
  assert(iE >= 0 && iE < iI && iI < iL, '三件事按使用顺序排列：导出 → 导入 → 自动更新');

  // ② 技术词必须从主流程里消失（这才是"通俗易懂"的判据）
  for (const jargon of ['取数地址', '链接格式', '实时数据链接', '导航器', '外部数据属性', '多表链接', 'Power Query']) {
    assert(!x.includes(jargon), `主界面不再出现技术词「${jargon}」`);
  }

  // ③ 导出选项仍在（功能没丢），且收进折叠区
  assert(x.includes('id="expSplit"') && x.includes('id="expPhotos"') && x.includes('id="expHelp"'),
    '导出卡片仍有 3 个开关：分表 / 照片 / 说明页');
  assert(x.includes('btnBackfill'), '仍能「补缩略图」');
  assert(typeof globalThis.doExportExcel === 'function', 'doExportExcel 已暴露');
  assert(!x.includes('onclick="doExport('), '导出按钮走 doExportExcel，不直接调 doExport');

  // ④ 导入：三步说清楚 + 会先给试算结果（老页面那个"默认勾着仅预览"的坑）
  assert(x.includes('下载模板') && x.includes('上传填好的文件'), '导入卡片有「下载模板 / 上传」两个动作');
  assert(x.includes('先给你看结果'), '导入前说明了会先给结果确认');
  assert(x.includes('id="importFile"'), '文件选择框在');
  assert(x.includes('id="impCreate"') && x.includes('id="impUpdate"'), '导入选项两个开关仍在');

  // ⑤ 自动更新：三步 + 三选一地址 + 两个按"结果"命名的复制按钮
  assert(x.includes('第 1 步') && x.includes('第 2 步') && x.includes('第 3 步'), '自动更新是清楚的三步');
  assert(x.includes('这个 Excel 文件会在哪台电脑上用'), '第 1 步问的是人话（在哪台电脑上用）');
  assert(x.includes('id="liveBase"'), '地址选项容器在');
  assert(x.includes('xl-choice-btn'), '地址是三个可点的选项（不再是下拉框）');
  assert(x.includes('推荐'), '给了一个推荐项');
  assert(x.includes('全部设备放一张表') && x.includes('每个分类各一张工作表'),
    '复制按钮按"结果"命名（一张表 / 每类一张）');
  assert(x.includes('copyLiveLink'), '复制链接按钮在');
  assert(x.includes('只读口令'), '用"只读口令"解释权限，不再提"令牌"');

  // ⑥ 排查与进阶都收进折叠区，且 WPS 的坑仍写着
  assert((x.match(/<details/g) || []).length >= 4, '长说明收进 <details> 折叠（至少 4 处）');
  assert(x.includes('无法获取数据'), '保留了 WPS「无法获取数据」的排查入口');
  assert(x.includes('=IMAGE('), '说明了让照片显示出来的办法');

  // ⑦ 交互绑定：地址按钮、重置、帮助点
  // ⚠️ 假 DOM 的 querySelectorAll 只认导航项，看不到 innerHTML 里的按钮，
  //    所以这里对 HTML 字符串断言；真正的点击行为用下面 ⑪ 调函数来验。
  const baseBtnCount = (x.match(/xl-choice-btn/g) || []).length;
  assert(baseBtnCount >= 1, '地址选项按钮已渲染（' + baseBtnCount + ' 处）');
  assert(x.includes('data-base="0"'), '地址按钮带 data-base 索引');
  assert(typeof els.get('#btnResetLive').onclick === 'function', '「重置链接」已绑定');
  assert((x.match(/class="help"/g) || []).length >= 3, 'Excel 页至少放了 3 个帮助点');
  assert(typeof globalThis.help === 'function', 'help 组件已暴露');
  const h = globalThis.help('这是一段比较长的说明文字，不该出现在按钮上');
  assert(h.includes('class="help"') && h.includes('role="button"'), 'help 渲染成可点的圆点');
  assert(/data-tip="[^"]{15,}"/.test(h), '说明文字放进了 data-tip');
  assert(!/<button/i.test(h), 'help 不能是 <button>（HTML 不允许按钮套按钮）');
  assert(typeof globalThis.showHelpTip === 'function' && typeof globalThis.hideHelpTip === 'function', '浮层的显示/隐藏方法已暴露');

  // ⑧ 老按钮上的长文案不许回来
  for (const long of ['按分类分表导出（带照片）', '导出全部（单表）', '不带照片', '为老照片补缩略图',
    '先看看页面里有几张表', '先在浏览器里试一下', '多工作表怎么配']) {
    assert(!x.includes(long), `按钮文案已精简：不再出现「${long}」`);
  }

  // ⑨ 分类明细列表（收在折叠区里）与两个兼容入口
  const liveBox = els.get('#liveTable');
  const lh = liveBox?.innerHTML || '';
  assert(lh.includes('copyLiveLink') || lh.includes('复制链接'), '分类明细里含复制链接按钮');
  assert(typeof globalThis.showLiveGuide === 'function' || typeof globalThis.showExcelGuide === 'function',
    '配置说明入口存在');
  assert(typeof globalThis.showMultiSheetGuide === 'function', '「多工作表」老入口仍兼容（合并到同一个说明页）');
  assert(typeof globalThis.xlPreview === 'function', '预览数据按钮有独立函数（不再写内联表达式）');

  // ⑩ 帮助点的样式必须在 CSS 里（否则点了没反应）
  const adminCss = fs.readFileSync(path.join(process.cwd(), 'public', 'assets', 'admin.css'), 'utf8');
  for (const sel of ['.help {', '.help-tip {', '.help-tip.on', '.xl-choice-btn', '.xl-step', '.xl-calc']) {
    assert(adminCss.includes(sel), `CSS 里有 ${sel}`);
  }

  // ⑪ 切换「在哪台电脑上用」：选第一个（本机）后，「当前选用」标签必须跟着变。
  //    假 DOM 里 #liveBaseLabel 是个可读可写的替身元素 —— xlPickBase 会往它写 textContent，
  //    写进去的必须是服务器给的那个地址的 label（本机那个 label 里带「本机」两个字）。
  assert(x.includes('id="liveBaseLabel"'), '「当前选用」标签已渲染');
  globalThis.xlPickBase(0);
  await wait(150);
  const after = els.get('#liveBaseLabel')?.textContent || '';
  assert(after.includes('本机'), `选「就在这台电脑上用」后标签应变成本机地址，实得「${after}」`);
  const lh2 = els.get('#liveTable')?.innerHTML || '';
  assert(lh2.includes('copyLiveLink'), '切地址后分类明细列表也重新渲染了');

  // ⑫ 配置说明弹窗：合并成一个，内容里要有 Excel / WPS / 排查
  globalThis.showExcelGuide();
  await wait(200);
  const modal = els.get('#modal')?._innerHTML || '';
  assert(modal.includes('Excel') && modal.includes('WPS'), '配置说明同时讲了 Excel 和 WPS');
  assert(modal.includes('无法获取数据'), '配置说明里带着排查段落');
  closeModal();
} catch (e) { excelErr = e; }

if (excelErr) {
  console.log('  \x1b[31m✘\x1b[0m Excel 页渲染失败：' + excelErr.message);
  console.log(excelErr.stack);
  failures.push('excel-page');
}

/* ---------- 2h-1b. 内联 onclick 的目标必须挂在 window 上（静默失效的经典坑） ----------
 * 页面里写 onclick="foo()" 时，浏览器只在**全局作用域**里找 foo。
 * admin.js 是 ES module，顶层函数默认**不是**全局的 —— 忘了 window.foo = foo，
 * 按钮就是「点了没反应」：不抛错、控制台干净、node --check 也全绿。
 * 2026-09-21 实测漏过两个：doExportExcel、goMobileScan。这里对整个文件做一次全量核对。 */
try {
  const src = fs.readFileSync(path.join(process.cwd(), 'public', 'assets', 'admin.js'), 'utf8');
  // 抓 onclick="name(" / onchange="name(" 这类内联处理器
  const names = new Set();
  for (const m of src.matchAll(/on(?:click|change|input|keydown)="([A-Za-z_$][\w$]*)\s*\(/g)) names.add(m[1]);
  // 这些是浏览器/全局内建的，不需要导出
  const builtins = new Set(['location', 'window', 'document', 'alert', 'confirm', 'print', '$']);
  const missing = [...names].filter((n) => !builtins.has(n) && !new RegExp(`window\\.${n}\\s*=`).test(src));
  assert(missing.length === 0,
    `内联处理器全都挂了 window（检查 ${names.size} 个；未挂：${missing.join(', ') || '无'}）`);
} catch (e) { console.log('  \x1b[31m✘\x1b[0m 内联处理器核对失败：' + e.message); failures.push('inline-handlers'); }

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
