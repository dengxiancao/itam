/* ================= ITAM 管理端应用 ================= */
const API = '/api';
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
/* ================= 图标 =================
 * 全站统一的内联 SVG 图标集：24×24 视窗，stroke 取 currentColor。
 * 于是图标自动跟随所在文字的颜色 —— 导航选中时一起变蓝、危险按钮里一起变红。
 * 不用 emoji 的原因：跨系统渲染不一致、光学大小参差，而且无法跟随主题色，
 * 选中态会变成「标签变蓝、图标还是花的」。
 */
const ICON_PATHS = {
  dashboard: "<path d='M3 20h18'/><path d='M6.5 20v-5'/><path d='M12 20V8'/><path d='M17.5 20v-8'/>",
  devices: "<rect x='2.5' y='4' width='19' height='12.5' rx='2'/><path d='M2 20.5h20'/>",
  monitor: "<rect x='2.5' y='4' width='19' height='12.5' rx='2'/><path d='M8.5 20.5h7'/><path d='M12 16.5v4'/>",
  laptop: "<rect x='4' y='5' width='16' height='11' rx='1.6'/><path d='M2 19h20'/>",
  printer: "<path d='M7 8V3.5h10V8'/><rect x='3' y='8' width='18' height='8' rx='2'/><path d='M7 13.5h10V21H7z'/>",
  globe: "<circle cx='12' cy='12' r='9'/><path d='M3 12h18'/><path d='M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18z'/>",
  database: "<ellipse cx='12' cy='5.5' rx='8' ry='3'/><path d='M4 5.5v13c0 1.66 3.58 3 8 3s8-1.34 8-3v-13'/><path d='M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3'/>",
  smartphone: "<rect x='6' y='2.5' width='12' height='19' rx='2.5'/><path d='M12 18.6h.01'/>",
  tablet: "<rect x='4.5' y='2.5' width='15' height='19' rx='2.5'/><path d='M12 18.6h.01'/>",
  package: "<path d='M20.5 7.4v9.1a1.6 1.6 0 0 1-.8 1.4l-7 4a1.6 1.6 0 0 1-1.4 0l-7-4a1.6 1.6 0 0 1-.8-1.4V7.4a1.6 1.6 0 0 1 .8-1.4l7-4a1.6 1.6 0 0 1 1.4 0l7 4a1.6 1.6 0 0 1 .8 1.4z'/><path d='m3.8 6.7 8.2 4.7 8.2-4.7'/><path d='M12 21v-9.6'/>",
  cpu: "<rect x='5.5' y='5.5' width='13' height='13' rx='2.2'/><rect x='9.5' y='9.5' width='5' height='5' rx='1'/><path d='M9.5 2v3.5M14.5 2v3.5M9.5 18.5V22M14.5 18.5V22M2 9.5h3.5M2 14.5h3.5M18.5 9.5H22M18.5 14.5H22'/>",
  camera: "<path d='M3 8.6A2.6 2.6 0 0 1 5.6 6h1.6l1.2-2h7.2l1.2 2h1.6A2.6 2.6 0 0 1 21 8.6v7.8A2.6 2.6 0 0 1 18.4 19H5.6A2.6 2.6 0 0 1 3 16.4z'/><circle cx='12' cy='12.4' r='3.4'/>",
  battery: "<rect x='2' y='7' width='16' height='10' rx='2.6'/><path d='M21 10.5v3'/><path d='M6 12h6'/>",
  building: "<path d='M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16'/><path d='M16 9.5h2.5a2 2 0 0 1 2 2V21'/><path d='M2.5 21h19'/><path d='M8 7h.01M12 7h.01M8 11h.01M12 11h.01M8 15h.01M12 15h.01'/>",
  folder: "<path d='M3 7.6A2.6 2.6 0 0 1 5.6 5h2.9a2 2 0 0 1 1.6.8l1 1.4a2 2 0 0 0 1.6.8h5.7A2.6 2.6 0 0 1 21 10.6v6A2.6 2.6 0 0 1 18.4 19H5.6A2.6 2.6 0 0 1 3 16.4z'/>",
  sheet: "<path d='M14 2.5H7A2 2 0 0 0 5 4.5v15a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-11z'/><path d='M14 2.5v6h5'/><path d='m9.5 13.5 5 5M14.5 13.5l-5 5'/>",
  trash: "<path d='M4 6.5h16'/><path d='M9.5 6.5V4.8A1.3 1.3 0 0 1 10.8 3.5h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7'/><path d='m6.5 6.5.9 12.6a2 2 0 0 0 2 1.9h5.2a2 2 0 0 0 2-1.9l.9-12.6'/>",
  users: "<path d='M16 20.5v-1.8a3.7 3.7 0 0 0-3.7-3.7H6.7A3.7 3.7 0 0 0 3 18.7v1.8'/><circle cx='9.5' cy='7.5' r='3.7'/><path d='M21 20.5v-1.8a3.7 3.7 0 0 0-2.8-3.6'/><path d='M15.5 4a3.7 3.7 0 0 1 0 7'/>",
  user: "<circle cx='12' cy='7.5' r='3.8'/><path d='M4.5 20.5v-1.6a4.6 4.6 0 0 1 4.6-4.6h5.8a4.6 4.6 0 0 1 4.6 4.6v1.6'/>",
  settings: "<path d='M4 20v-6M4 10V4M12 20v-8M12 8V4M20 20v-4M20 12V4'/><path d='M1.6 14h4.8M9.6 8h4.8M17.6 16h4.8'/>",
  book: "<path d='M4 18.5A2.5 2.5 0 0 1 6.5 16H20'/><path d='M6.5 3H20v18H6.5A2.5 2.5 0 0 1 4 18.5v-13A2.5 2.5 0 0 1 6.5 3z'/>",
  search: "<circle cx='11' cy='11' r='7'/><path d='m20 20-3.6-3.6'/>",
  download: "<path d='M20.5 15.5V19a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 19v-3.5'/><path d='m7.5 11 4.5 4.5 4.5-4.5'/><path d='M12 15.5V3'/>",
  upload: "<path d='M20.5 15.5V19a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 19v-3.5'/><path d='m7.5 7.5 4.5-4.5 4.5 4.5'/><path d='M12 3v12.5'/>",
  refresh: "<path d='M20.5 11.5A8.5 8.5 0 0 0 6.1 6.3L3.5 8.6'/><path d='M3.5 4v4.6H8'/><path d='M3.5 12.5A8.5 8.5 0 0 0 17.9 17.7l2.6-2.3'/><path d='M20.5 20v-4.6H16'/>",
  restore: "<path d='M3.5 6.5v5h5'/><path d='M4.4 14.2a8.5 8.5 0 1 0 1.4-7.9L3.5 8.4'/>",
  copy: "<rect x='8.5' y='8.5' width='12' height='12' rx='2.2'/><path d='M15.5 8.5V6.3a2.2 2.2 0 0 0-2.2-2.2H5.7a2.2 2.2 0 0 0-2.2 2.2v7.6a2.2 2.2 0 0 0 2.2 2.2h2'/>",
  list: "<path d='M8.5 6.5h12M8.5 12h12M8.5 17.5h12'/><path d='M3.8 6.5h.01M3.8 12h.01M3.8 17.5h.01'/>",
  key: "<circle cx='7.5' cy='15.5' r='3.5'/><path d='m10.2 12.8 8.3-8.3'/><path d='m16.2 6.8 2.5 2.5'/><path d='m13.6 9.4 2.5 2.5'/>",
  lock: "<rect x='4.5' y='10.5' width='15' height='10.5' rx='2.4'/><path d='M8 10.5V7.5a4 4 0 0 1 8 0v3'/>",
  info: "<circle cx='12' cy='12' r='9'/><path d='M12 11.2V16.8'/><path d='M12 7.8h.01'/>",
  alert: "<path d='M10.3 3.9 2.1 18a2 2 0 0 0 1.7 3h16.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z'/><path d='M12 9v4.4'/><path d='M12 17.3h.01'/>",
  bell: "<path d='M18 8.5a6 6 0 0 0-12 0c0 6.5-2.5 8.5-2.5 8.5h17S18 15 18 8.5'/><path d='M13.7 20.5a2 2 0 0 1-3.4 0'/>",
  'check-circle': "<circle cx='12' cy='12' r='9'/><path d='m8.3 12.3 2.6 2.6 5.1-5.3'/>",
  inbox: "<path d='M20.5 12.5h-4.4l-1.3 2.4H9.2l-1.3-2.4H3.5'/><path d='M5.6 4.8h12.8l2.1 7.7v4.9a2.4 2.4 0 0 1-2.4 2.4H5.9a2.4 2.4 0 0 1-2.4-2.4v-4.9z'/>",
  image: "<rect x='3' y='4' width='18' height='16' rx='2.4'/><circle cx='8.8' cy='9.5' r='1.7'/><path d='m3.6 17.2 4.7-4.6a2 2 0 0 1 2.8 0l5.1 5'/><path d='m14.5 14.5 1.7-1.7a2 2 0 0 1 2.8 0l1.4 1.4'/>",
  beaker: "<path d='M6.5 3h11'/><path d='M9 3v5.3a2 2 0 0 1-.3 1L5.1 15.5A3 3 0 0 0 7.6 20h8.8a3 3 0 0 0 2.5-4.5l-3.6-6.2a2 2 0 0 1-.3-1V3'/><path d='M7.6 14.5h8.8'/>",
  wrench: "<path d='M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z'/>",
  banknote: "<rect x='2.5' y='6' width='19' height='12' rx='2.4'/><circle cx='12' cy='12' r='2.6'/><path d='M6.5 12h.01M17.5 12h.01'/>",
  clock: "<circle cx='12' cy='12' r='9'/><path d='M12 7.2V12l3.2 2'/>",
  plus: "<path d='M12 5v14M5 12h14'/>",
  x: "<path d='M6.5 6.5l11 11M17.5 6.5l-11 11'/>",
  ban: "<circle cx='12' cy='12' r='9'/><path d='m5.6 5.6 12.8 12.8'/>",
  menu: "<path d='M3.5 7h17M3.5 12h17M3.5 17h17'/>",
  chevron: "<path d='m9.5 5 7 7-7 7'/>",
  qr: "<rect x='3' y='3' width='7' height='7' rx='1.5'/><rect x='14' y='3' width='7' height='7' rx='1.5'/><rect x='3' y='14' width='7' height='7' rx='1.5'/><path d='M14 14h3v3h-3z'/><path d='M21 14.5V17M14 21h3M18.5 18.5H21V21'/>",
};
/** 生成一枚内联 SVG 图标；颜色跟随 currentColor */
function svgIcon(name, size = 16) {
  const p = ICON_PATHS[name] || ICON_PATHS.package;
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}

/* 设备类型键 → 图标名（键对应 ICON_PATHS；与后端 CATEGORY_ICONS 一一对应） */
const ICONS = {
  pc: 'monitor', laptop: 'laptop', monitor: 'monitor', printer: 'printer',
  network: 'globe', server: 'database', phone: 'smartphone', tablet: 'tablet',
  box: 'package', cpu: 'cpu', camera: 'camera', ups: 'battery',
};
const iconOf = (name, size = 15) => svgIcon(ICONS[name] || 'package', size);

const STATUS_META = {};

let state = {
  options: null,
  view: 'dashboard',
  auth: { username: null, display_name: null, role: null, role_label: null, permissions: [], must_change: false },
  userBoxRendered: false,
  companyName: '',
  usersData: null,
  usersMeta: null,
  liveLinks: null,
  devicesQuery: { page: 1, page_size: 20, keyword: '', category_id: '', org_id: '', status: '', brand: '', supplier: '', sort: 'updated_at', order: 'desc' },
  // ⚠️ 勾选状态必须**独立于 DOM 存活**：
  //    以前 refreshSelection() 是「读当前页 DOM 里勾了几个」，于是翻页就把上一页的勾选全丢了，
  //    用户只能操作当前页那 20 个。这里改成「Set 是唯一真相，DOM 只负责显示」。
  selection: new Set(),
  // 「选中当前筛选下的全部 N 台」模式：勾了它就不逐个存 id，而是交给后端按筛选条件跑。
  // 值 = 该筛选下的总台数（0 表示没开这个模式）。
  selectAllMatching: 0,
};

/* ================= API ================= */
function redirectToLogin(expired = true) {
  const next = encodeURIComponent(location.pathname + location.search);
  location.href = `/login?next=${next}${expired ? '&expired=1' : ''}`;
}

async function api(path, opts = {}) {
  const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;
  const headers = { ...(opts.headers || {}) };
  if (!isForm && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const res = await fetch(API + path, { ...opts, headers });
  let body = null;
  try { body = await res.json(); } catch { /* 非 JSON */ }
  if (!res.ok) {
    const err = new Error(body?.error || body?.detail || `请求失败 (${res.status})`);
    err.status = res.status;
    if (res.status === 401) {
      redirectToLogin(true);
      err.message = '登录已过期，正在跳转登录页…';
    }
    throw err;
  }
  return body?.data ?? body;
}

/* ================= 通用 UI ================= */
function toast(msg, type = 'ok') {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast ${type === 'error' ? 'error' : type === 'warn' ? 'warn' : ''}`;
  el.innerHTML = `<span class="toast-ico">${svgIcon(type === 'error' ? 'alert' : type === 'warn' ? 'bell' : 'check-circle')}</span><span></span>`;
  el.lastElementChild.textContent = msg;
  box.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 3200);
  return el;   // 调用方可以提前移除（例如「正在生成…」提示）
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ================= 「?」帮助点 =================
 * 长说明不写在按钮/标签上（一行挤七八个字，界面很吵），
 * 收进一个小圆点里，鼠标悬停或点一下才弹出来。
 *
 * ⚠️ 只能放在标题、<label> 或按钮的**旁边**，绝不能塞进 <button> 内部
 *    （HTML 不允许 button 嵌套 button，浏览器会把结构拆坏）。
 * 用法：`<h3>导出到 Excel${help('导出的是快照…')}</h3>`
 * ============================================ */
function help(text, label = '说明') {
  return `<span class="help" role="button" tabindex="0" data-tip="${esc(text)}" aria-label="${esc(label)}">?</span>`;
}

let helpTipEl = null;
let helpTipOwner = null;

function showHelpTip(btn) {
  const text = btn.getAttribute('data-tip') || '';
  if (!text || typeof document.body === 'undefined' || typeof btn.getBoundingClientRect !== 'function') return;
  if (!helpTipEl) {
    helpTipEl = document.createElement('div');
    helpTipEl.className = 'help-tip';
    document.body.appendChild(helpTipEl);
  }
  helpTipEl.textContent = text;
  helpTipEl.classList.add('on');
  const r = btn.getBoundingClientRect();
  const w = helpTipEl.offsetWidth || 260;
  const h = helpTipEl.offsetHeight || 60;
  const vw = window.innerWidth || 1280;
  // 贴着按钮居中，左右各留 8px，防止贴边被截掉
  let left = r.left + r.width / 2 - w / 2;
  left = Math.max(8, Math.min(left, vw - w - 8));
  // 上方放不下就翻到下方
  let top = r.top - h - 8;
  if (top < 8) top = r.bottom + 8;
  helpTipEl.style.left = `${Math.round(left)}px`;
  helpTipEl.style.top = `${Math.round(top)}px`;
  if (helpTipOwner && helpTipOwner !== btn) helpTipOwner.classList.remove('on');
  helpTipOwner = btn;
  btn.classList.add('on');
}

function hideHelpTip(btn) {
  if (btn && helpTipOwner !== btn) return;
  if (helpTipEl) helpTipEl.classList.remove('on');
  if (helpTipOwner) helpTipOwner.classList.remove('on');
  helpTipOwner = null;
}

/**
 * 事件委托：以后新加的 .help 不用重新绑定。
 * 点击必须用**捕获阶段**：否则「?」放在 <label> 里时，
 * 点击会先把外面的复选框/按钮激活一遍，再轮到这里。
 */
function initHelpTips() {
  if (typeof document.addEventListener !== 'function') return;
  const pick = (e) => (e.target && typeof e.target.closest === 'function' ? e.target.closest('.help') : null);

  document.addEventListener('mouseover', (e) => { const b = pick(e); if (b) showHelpTip(b); });
  document.addEventListener('mouseout', (e) => { const b = pick(e); if (b) hideHelpTip(b); });
  document.addEventListener('click', (e) => {
    const b = pick(e);
    if (!b) { hideHelpTip(); return; }
    e.preventDefault();      // 别让 label 里的 ? 顺手把复选框勾上
    e.stopPropagation();     // 别让旁边的按钮跟着触发
    if (helpTipOwner === b) hideHelpTip(b); else showHelpTip(b);
  }, true);
  document.addEventListener('keydown', (e) => {
    const b = pick(e);
    if (!b || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    e.stopPropagation();
    if (helpTipOwner === b) hideHelpTip(b); else showHelpTip(b);
  }, true);
  window.addEventListener('scroll', () => hideHelpTip(), true);
  window.addEventListener('resize', () => hideHelpTip());
}

function fmtMoney(n) {
  if (n === null || n === undefined || n === '') return '—';
  const num = Number(n);
  return isFinite(num) ? '¥' + num.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : String(n);
}
function fmtDate(s) { return s ? String(s).slice(0, 10) : '—'; }

function statusBadge(status) {
  const meta = state.options?.statuses?.find((s) => s.id === status);
  const color = meta?.color || 'var(--text-3)';
  const label = meta?.label || status;
  return `<span class="badge" style="color:${color}">${esc(label)}</span>`;
}

function confirmBox(title, message, { danger = true } = {}) {
  return new Promise((resolve) => {
    openModal(`
      <div class="modal-head"><h2>${esc(title)}</h2><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body"><p style="margin:0">${esc(message)}</p></div>
      <div class="modal-foot">
        <button class="btn" onclick="closeModal();window.__confirmResolve(false)">取消</button>
        <button class="btn ${danger ? 'danger' : 'primary'}" style="${danger ? 'background:var(--red);color:#fff;border-color:var(--red)' : ''}" onclick="closeModal();window.__confirmResolve(true)">确定</button>
      </div>
    `);
    window.__confirmResolve = resolve;
  });
}

function openModal(html, { wide = false, slim = false } = {}) {
  const mask = $('#modalMask');
  const modal = $('#modal');
  modal.className = 'modal' + (wide ? ' wide' : '') + (slim ? ' slim' : '');
  modal.innerHTML = html;
  mask.hidden = false;
  return modal;
}
function closeModal() {
  $('#modalMask').hidden = true;
  $('#modal').innerHTML = '';
}

/* ================= 路由 ================= */
const NAV = [
  { id: 'dashboard', label: '仪表盘', ico: 'dashboard', group: '概览', perm: 'device.read' },
  { id: 'devices', label: '设备台账', ico: 'devices', group: '资产管理', perm: 'device.read' },
  { id: 'orgs', label: '组织架构', ico: 'building', group: '资产管理', perm: 'device.read' },
  { id: 'categories', label: '设备分类', ico: 'folder', group: '资产管理', perm: 'device.read' },
  { id: 'agent', label: '自动盘点', ico: 'refresh', group: '资产管理', perm: 'device.read' },
  { id: 'excel', label: 'Excel 对接', ico: 'sheet', group: '数据', perm: 'excel.export' },
  { id: 'trash', label: '回收站', ico: 'trash', group: '系统', perm: 'trash.manage' },
  { id: 'users', label: '用户管理', ico: 'users', group: '系统', perm: 'user.manage' },
  { id: 'settings', label: '系统设置', ico: 'settings', group: '系统', perm: 'settings.read' },
];

/** 当前登录用户是否拥有某权限 */
function hasPerm(perm) {
  const p = state.auth?.permissions || [];
  return p.includes('*') || p.includes(perm);
}

function renderNav() {
  const items = NAV.filter((n) => hasPerm(n.perm));
  // 按 group 分簇；某一簇整个没权限时，连标题一起不显示
  const groups = [];
  for (const n of items) {
    let g = groups.find((x) => x.name === n.group);
    if (!g) { g = { name: n.group, items: [] }; groups.push(g); }
    g.items.push(n);
  }
  $('#nav').innerHTML = groups.map((g) => `
    <div class="nav-group">
      <div class="nav-group-label">${esc(g.name)}</div>
      ${g.items.map((n) => `
      <div class="nav-item ${state.view === n.id ? 'active' : ''}" data-view="${n.id}">
        <span class="ico">${svgIcon(n.ico)}</span>${esc(n.label)}
      </div>`).join('')}
    </div>`).join('');
  $$('.nav-item', $('#nav')).forEach((el) => el.onclick = () => switchView(el.dataset.view));
}

const TITLES = Object.fromEntries(NAV.map((n) => [n.id, n.label]));

function switchView(view) {
  // 离开设备台账时清空勾选：selection 现在活在 state 里（跨页存活），
  // 不清就会带着上一批勾选跑去做别的事 —— 最坏情况是用户切到别的页再回来，
  // 看到「批量操作 (37)」却完全不记得自己选过什么。
  if (state.view === 'devices' && view !== 'devices') {
    state.selection.clear();
    state.selectAllMatching = 0;
  }
  state.view = view;
  $('#pageTitle').textContent = TITLES[view];
  $('#globalSearch').value = '';
  renderNav();
  closeModal();
  closeSidebar();          // 手机端：选了菜单就把抽屉收起来
  const c = $('#content');
  c.innerHTML = `<div class="empty"><div class="big">${svgIcon('refresh', 24)}</div>加载中…</div>`;
  const fn = {
    dashboard: renderDashboard, devices: renderDevices, orgs: renderOrgs,
    categories: renderCategories, excel: renderExcel, trash: renderTrash,
    users: renderUsers, settings: renderSettings, agent: renderAgent,
  }[view];
  fn();
}

/* ================= 用户管理 ================= */
const ROLE_BADGE = { admin: 'var(--red)', manager: 'var(--violet)', operator: 'var(--primary)', viewer: 'var(--text-3)' };
const STATUS_BADGE = { active: 'var(--green)', pending: 'var(--amber)', disabled: 'var(--text-3)' };

async function renderUsers() {
  const data = await api('/users?page_size=200');
  const meta = await api('/users/meta');
  state.usersData = data;
  state.usersMeta = meta;
  const pending = data.items.filter((u) => u.status === 'pending');

  $('#content').innerHTML = `
    ${pending.length ? `
    <div class="card" style="border-color:var(--warn-border);background:var(--warn-bg);margin-bottom:16px">
      <h3 style="margin:0 0 8px">${svgIcon('clock')} 有 ${pending.length} 个账号等待审核</h3>
      <div style="display:flex;flex-wrap:wrap;gap:10px">
        ${pending.map((u) => `<div class="chip" style="background:#fff;border:1px solid var(--warn-border);padding:6px 12px">
          <b>${esc(u.username)}</b> ${u.display_name ? esc(u.display_name) : ''}
          <button class="btn xs primary" style="margin-left:6px" onclick="approveUser('${u.id}')">通过</button>
          <button class="btn xs ghost" onclick="editUser('${u.id}')">改角色</button>
        </div>`).join('')}
      </div>
    </div>` : ''}

    <div class="card">
      <div class="toolbar">
        <h3 style="margin:0">${svgIcon('users')} 用户账号（${data.total}）</h3>
        <input id="uKeyword" placeholder="搜索用户名 / 姓名 / 邮箱" style="width:220px" value="">
        <select id="uRole" style="width:140px"><option value="">全部角色</option>
          ${meta.roles.map((r) => `<option value="${r.id}">${r.label}</option>`).join('')}</select>
        <select id="uStatus" style="width:120px"><option value="">全部状态</option>
          ${meta.statuses.map((s) => `<option value="${s.id}">${s.label}</option>`).join('')}</select>
        <button class="btn" id="uSearch">${svgIcon('search')} 查询</button>
        <button class="btn ghost" id="uReset">重置</button>
        <span style="flex:1"></span>
        <button class="btn" id="btnLoginLog">${svgIcon('list')} 登录日志</button>
        <button class="btn primary" id="btnAddUser">＋ 新建用户</button>
      </div>
      <div class="table-wrap"><table class="grid">
        <thead><tr>
          <th>用户名</th><th>姓名</th><th>角色</th><th>状态</th><th>最后登录</th><th>登录次数</th><th>创建时间</th><th style="width:230px">操作</th>
        </tr></thead>
        <tbody>${data.items.map((u) => `
          <tr>
            <td data-label="用户名"><b class="mono">${esc(u.username)}</b>${u.id === meta.current_user_id ? ' <span class="tag">我自己</span>' : ''}</td>
            <td data-label="姓名">${esc(u.display_name || '—')}</td>
            <td data-label="角色"><span class="badge" style="color:${ROLE_BADGE[u.role] || 'var(--text-3)'}">${esc(u.role_label)}</span></td>
            <td data-label="状态"><span class="badge" style="color:${STATUS_BADGE[u.status] || 'var(--text-3)'}">${esc(u.status_label)}</span>
              ${u.locked_until && new Date(u.locked_until) > new Date() ? '<span class="tag" style="color:var(--red);margin-left:4px">已锁定</span>' : ''}</td>
            <td class="muted" data-label="最后登录">${u.last_login_at ? esc(u.last_login_at.replace('T', ' ').slice(0, 16)) : '—'}</td>
            <td class="num" data-label="登录次数">${u.login_count || 0}</td>
            <td class="muted" data-label="创建时间">${esc((u.created_at || '').slice(0, 10))}</td>
            <td data-label=""><div class="row-actions">
              <button class="btn xs" onclick="editUser('${u.id}')">编辑</button>
              <button class="btn xs" onclick="resetUserPw('${u.id}','${esc(u.username)}')">重置密码</button>
              ${u.locked_until && new Date(u.locked_until) > new Date() ? `<button class="btn xs" onclick="unlockUser('${u.id}')">解锁</button>` : ''}
              ${u.id === meta.current_user_id ? '' : `<button class="btn xs ghost" onclick="delUser('${u.id}','${esc(u.username)}')">删除</button>`}
            </div></td>
          </tr>`).join('')}</tbody>
      </table></div>
    </div>

    <div class="card" style="margin-top:16px">
      <h3>${svgIcon('key')} 角色与权限说明</h3>
      <div class="table-wrap"><table class="grid">
        <thead><tr><th>角色</th><th>说明</th><th>可用功能</th></tr></thead>
        <tbody>
          <tr><td><span class="badge" style="color:${ROLE_BADGE.admin}">系统管理员</span></td><td>全部权限</td><td>所有功能，含用户管理、系统设置、回收站</td></tr>
          <tr><td><span class="badge" style="color:${ROLE_BADGE.manager}">资产管理员</span></td><td>设备与数据管理</td><td>设备增删改、组织/分类、Excel 导入导出、回收站、审计日志</td></tr>
          <tr><td><span class="badge" style="color:${ROLE_BADGE.operator}">录入员</span></td><td>日常录入</td><td>查看 + 新增/编辑设备（含手机拍照录入）、Excel 导出</td></tr>
          <tr><td><span class="badge" style="color:${ROLE_BADGE.viewer}">只读</span></td><td>只能查看</td><td>查看仪表盘、台账、组织、分类</td></tr>
        </tbody>
      </table></div>
    </div>`;

  $('#uSearch').onclick = () => loadUsers();
  $('#uKeyword').onkeydown = (e) => { if (e.key === 'Enter') loadUsers(); };
  $('#uRole').onchange = () => loadUsers();
  $('#uStatus').onchange = () => loadUsers();
  $('#uReset').onclick = () => renderUsers();
  $('#btnAddUser').onclick = () => openUserForm();
  $('#btnLoginLog').onclick = openLoginLog;
}

async function loadUsers() {
  const params = new URLSearchParams({ page_size: 200 });
  const kw = $('#uKeyword')?.value.trim();
  const role = $('#uRole')?.value;
  const status = $('#uStatus')?.value;
  if (kw) params.set('keyword', kw);
  if (role) params.set('role', role);
  if (status) params.set('status', status);
  const data = await api('/users?' + params.toString());
  state.usersData = data;
  renderUsers();
}

function openUserForm(id) {
  const cur = id ? state.usersData.items.find((u) => u.id === id) : null;
  const roles = state.usersMeta.roles;
  const isSelf = cur && cur.id === state.usersMeta.current_user_id;

  openModal(`
    <div class="modal-head"><h2>${cur ? '编辑用户：' + esc(cur.username) : '新建用户'}</h2><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="field"><label>用户名 <span class="req">*</span></label>
          <input id="nuName" value="${esc(cur?.username || '')}" placeholder="登录名，3~40 位" ${cur ? '' : ''}>
          <div class="hint">字母、数字、下划线、点、@、短横线</div></div>
        <div class="field"><label>姓名</label><input id="nuDisplay" value="${esc(cur?.display_name || '')}" placeholder="真实姓名"></div>
        <div class="field"><label>角色 <span class="req">*</span></label>
          <select id="nuRole">${roles.map((r) => `<option value="${r.id}" ${cur?.role === r.id ? 'selected' : ''}>${r.label} —— ${esc(r.desc)}</option>`).join('')}</select></div>
        <div class="field"><label>状态</label>
          <select id="nuStatus">${state.usersMeta.statuses.map((s) => `<option value="${s.id}" ${cur?.status === s.id ? 'selected' : ''}>${s.label}</option>`).join('')}</select></div>
        <div class="field"><label>邮箱</label><input id="nuEmail" value="${esc(cur?.email || '')}"></div>
        <div class="field"><label>电话</label><input id="nuPhone" value="${esc(cur?.phone || '')}"></div>
        <div class="field full"><label>${cur ? '新密码（留空则不修改）' : '初始密码 <span class="req">*</span>'}</label>
          <input type="password" id="nuPass" placeholder="至少 8 位，不能是纯数字/纯字母" autocomplete="new-password">
          ${cur ? '' : '<div class="hint">也可以点「生成随机密码」自动生成</div>'}
          <div style="margin-top:8px"><button class="btn sm" id="nuGen">${svgIcon('refresh')} 生成随机密码</button></div></div>
        <div class="field full"><label>备注</label><input id="nuRemark" value="${esc(cur?.remark || '')}"></div>
        <div class="field full">
          <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="nuMustChange" ${cur?.must_change ? 'checked' : ''}> 下次登录须改密码</label>
        </div>
      </div>
      ${isSelf ? '<div class="hint" style="color:var(--amber)">这是你自己的账号：不能把自己降级或停用（系统会阻止最后一个管理员被降级）。</div>' : ''}
    </div>
    <div class="modal-foot"><button class="btn" onclick="closeModal()">取消</button><button class="btn primary" id="nuSave">保存</button></div>`, { wide: true });

  $('#nuGen').onclick = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    let s = '';
    for (let i = 0; i < 12; i++) s += chars[Math.floor(Math.random() * chars.length)];
    const pw = `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
    $('#nuPass').value = pw;
    toast('已生成随机密码，记得复制保存');
  };

  $('#nuSave').onclick = async () => {
    const payload = {
      username: $('#nuName').value.trim(),
      display_name: $('#nuDisplay').value.trim(),
      role: $('#nuRole').value,
      status: $('#nuStatus').value,
      email: $('#nuEmail').value.trim(),
      phone: $('#nuPhone').value.trim(),
      remark: $('#nuRemark').value.trim(),
      must_change: $('#nuMustChange').checked,
    };
    const pw = $('#nuPass').value;
    if (pw) payload.password = pw;
    if (!cur && !pw) { toast('新建用户必须设置密码', 'warn'); return; }
    try {
      if (cur) await api('/users/' + cur.id, { method: 'PUT', body: JSON.stringify(payload) });
      else await api('/users', { method: 'POST', body: JSON.stringify(payload) });
      toast(cur ? '已保存' : '已创建用户');
      closeModal();
      renderUsers();
    } catch (e) { toast(e.message, 'error'); }
  };
}

async function resetUserPw(id, username) {
  if (!await confirmBox('重置密码', `将为「${username}」生成一个新的随机密码，该用户所有已登录设备会被强制退出。继续吗？`, { danger: false })) return;
  try {
    const r = await api(`/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify({}) });
    openModal(`
      <div class="modal-head"><h2>新密码已生成</h2><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">
        <p>请把下面的密码交给 <b>${esc(r.username)}</b>，并提示他登录后立即修改：</p>
        <div class="mono" style="font-size:20px;text-align:center;background:var(--surface-2);padding:16px;border-radius:10px;user-select:all">${esc(r.password)}</div>
        <div class="hint" style="margin-top:12px">该用户下次登录后会被要求修改密码。此密码只显示这一次。</div>
      </div>
      <div class="modal-foot"><button class="btn primary" onclick="closeModal()">我已记下</button></div>`, { slim: true });
  } catch (e) { toast(e.message, 'error'); }
}

async function unlockUser(id) {
  try { await api(`/users/${id}/unlock`, { method: 'POST', body: JSON.stringify({}) }); toast('已解锁'); renderUsers(); }
  catch (e) { toast(e.message, 'error'); }
}

async function approveUser(id) {
  try { await api(`/users/${id}/approve`, { method: 'POST', body: JSON.stringify({}) }); toast('已通过审核'); renderUsers(); }
  catch (e) { toast(e.message, 'error'); }
}

async function delUser(id, username) {
  if (!await confirmBox('删除用户', `确定删除账号「${username}」吗？该操作不可撤销（该用户录入的设备记录会保留）。`)) return;
  try { await api('/users/' + id, { method: 'DELETE' }); toast('已删除'); renderUsers(); }
  catch (e) { toast(e.message, 'error'); }
}

async function openLoginLog() {
  const r = await api('/users/login-log?limit=100');
  openModal(`
    <div class="modal-head"><h2>${svgIcon('list')} 登录日志（最近 100 条）</h2><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body"><div class="table-wrap"><table class="grid">
      <thead><tr><th>时间</th><th>用户</th><th>动作</th><th>IP</th><th>说明</th></tr></thead>
      <tbody>${r.items.map((l) => `<tr>
        <td class="muted">${esc((l.created_at || '').replace('T', ' ').slice(0, 19))}</td>
        <td class="mono">${esc(l.username || '—')}</td>
        <td>${esc({ login: '登录成功', logout: '退出', login_failed: '登录失败', lockout: '账号锁定', register: '注册' }[l.action] || l.action)}</td>
        <td class="muted">${esc(l.ip || '')}</td>
        <td class="muted">${esc(l.note || '')}</td></tr>`).join('')}</tbody>
    </table></div></div>
    <div class="modal-foot"><button class="btn primary" onclick="closeModal()">关闭</button></div>`, { wide: true });
}

/* ================= 回收站 ================= */
async function renderTrash() {
  const data = await api('/devices/trash?page_size=100');
  state.trashData = data;
  $('#content').innerHTML = `
    <div class="card">
      <div class="toolbar">
        <h3 style="margin:0">${svgIcon('trash')} 回收站</h3>
        <span class="muted" style="font-size:13px">删除的设备会先放进这里，可随时恢复；「彻底删除」后不可找回</span>
        <span style="flex:1"></span>
        <button class="btn" id="trashRestoreAll" ${data.items.length ? '' : 'disabled'}>${svgIcon('restore')} 全部恢复</button>
        <button class="btn danger" id="trashEmpty" ${data.items.length ? '' : 'disabled'}>${svgIcon('trash')} 清空回收站</button>
      </div>
      ${data.items.length ? `
      <div class="table-wrap"><table class="grid">
        <thead><tr>
          <th>资产编号</th><th>分类</th><th>品牌 / 型号</th><th>SN</th><th>使用人</th><th>供应商</th><th>删除时间</th><th style="width:150px">操作</th>
        </tr></thead>
        <tbody>${data.items.map((d) => `
          <tr>
            <td class="mono" style="font-weight:600" data-label="资产编号">${esc(d.asset_no)}</td>
            <td data-label="分类"><span class="chip">${iconOf(d.category_icon)} ${esc(d.category_name || '未分类')}</span></td>
            <td data-label="品牌 / 型号">${esc(d.brand || '—')} <span class="muted">${esc(d.model || '')}</span></td>
            <td class="mono muted" data-label="SN">${esc(d.sn || '—')}</td>
            <td data-label="使用人">${esc(d.owner_name || '—')}</td>
            <td data-label="供应商">${esc(d.supplier || '—')}</td>
            <td class="muted" data-label="删除时间">${esc((d.deleted_at || '').replace('T', ' ').slice(0, 16))}</td>
            <td data-label=""><div class="row-actions">
              <button class="btn xs" onclick="restoreDevice('${d.id}')">恢复</button>
              <button class="btn xs danger" onclick="purgeDevice('${d.id}','${esc(d.asset_no)}')">彻底删除</button>
            </div></td>
          </tr>`).join('')}</tbody>
      </table></div>` : `<div class="empty"><div class="big">${svgIcon('inbox', 24)}</div>回收站是空的</div>`}
    </div>`;

  $('#trashRestoreAll').onclick = async () => {
    if (!await confirmBox('全部恢复', `确定把 ${data.items.length} 台设备全部恢复到台账吗？`, { danger: false })) return;
    const r = await api('/devices/trash/restore', { method: 'POST', body: JSON.stringify({ ids: data.items.map((d) => d.id) }) });
    toast(`已恢复 ${r.ok} 台${r.failed ? `，失败 ${r.failed} 台` : ''}`, r.failed ? 'warn' : 'ok');
    renderTrash();
  };
  $('#trashEmpty').onclick = async () => {
    if (!await confirmBox('清空回收站', '这将永久删除回收站里的所有设备，无法找回。确定继续吗？')) return;
    const r = await api('/devices/trash/empty', { method: 'POST', body: JSON.stringify({}) });
    toast(`已永久删除 ${r.purged} 台设备`);
    renderTrash();
  };
}

async function restoreDevice(id) {
  try {
    await api('/devices/trash/restore', { method: 'POST', body: JSON.stringify({ ids: [id] }) });
    toast('已恢复');
    renderTrash();
  } catch (e) { toast(e.message, 'error'); }
}

async function purgeDevice(id, assetNo) {
  if (!await confirmBox('彻底删除', `将永久删除「${assetNo}」，无法找回。确定吗？`)) return;
  try {
    await api('/devices/' + id + '/permanent', { method: 'DELETE' });
    toast('已彻底删除');
    renderTrash();
  } catch (e) { toast(e.message, 'error'); }
}

/* ================= 仪表盘 ================= */
async function renderDashboard() {
  const d = await api('/dashboard');
  const kpi = d.kpi;
  const cards = [
    { l: '设备总数', v: kpi.total, i: 'devices', h: `本月新增 ${kpi.added_this_month} 台` },
    { l: '在用设备', v: kpi.in_use, i: 'check-circle', h: `今日新增 ${kpi.added_today} 台` },
    { l: '库存/闲置', v: kpi.in_stock, i: 'package', h: '可调配资源' },
    { l: '维修中', v: kpi.repair, i: 'wrench', h: '待处理维修' },
    { l: '资产总值', v: fmtMoney(kpi.value), i: 'banknote', h: `${kpi.categories} 个分类` },
    { l: '保修即将到期', v: kpi.warranty_expiring, i: 'clock', h: `已过期 ${kpi.warranty_expired} 台`, warn: kpi.warranty_expiring > 0 },
  ];

  const donutData = d.byStatus.length ? d.byStatus : [{ name: '暂无', value: 1, color: 'var(--surface-3)' }];
  const catBars = d.byCategory.slice(0, 8);
  const maxCat = Math.max(1, ...catBars.map((c) => c.value));

  $('#content').innerHTML = `
    <div class="grid kpi-grid">${cards.map((c) => `
      <div class="card kpi${c.warn ? ' warn' : ''}">
        <div class="kpi-ico">${svgIcon(c.i)}</div>
        <div class="kpi-label">${c.l}</div>
        <div class="kpi-value" style="${c.warn ? 'color:var(--amber)' : ''}">${c.v}</div>
        <div class="kpi-hint">${c.h}</div>
      </div>`).join('')}
    </div>

    <div class="grid grid-2-1" style="margin-top:16px;">
      <div class="card">
        <h3>设备状态分布</h3>
        <div class="chart-wrap">${donutSVG(donutData)}${legendHTML(d.byStatus.map((s) => ({ name: s.name, value: s.value, color: s.color })))}</div>
      </div>
      <div class="card">
        <h3>分类 TOP 设备数</h3>
        <div class="bars">${catBars.map((c) => `
          <div class="bar-col" title="${esc(c.name)}：${c.value} 台">
            <span class="bv">${c.value}</span>
            <div class="bar" style="height:${Math.round(c.value / maxCat * 100)}%"></div>
            <span class="bl">${esc(c.name)}</span>
          </div>`).join('')}</div>
      </div>
    </div>

    <div class="grid grid-2" style="margin-top:16px;">
      <div class="card">
        <h3>品牌 TOP10</h3>
        <div class="legend">${d.byBrand.map((b, i) => `
          <div class="legend-item"><span class="sw" style="background:${palette(i)}"></span>
            <span class="nm">${esc(b.name)}</span><span class="vl">${b.value}</span></div>`).join('') || '<div class="muted">暂无数据</div>'}
        </div>
      </div>
      <div class="card">
        <h3>最近更新</h3>
        <div class="table-wrap"><table class="grid">
          <thead><tr><th>资产编号</th><th>设备</th><th>使用人</th><th>状态</th></tr></thead>
          <tbody>${d.recent.map((r) => `
            <tr style="cursor:pointer" onclick="openDeviceDetail('${r.id}')">
              <td class="mono">${esc(r.asset_no)}</td>
              <td>${esc(r.brand || '')} ${esc(r.model || '')}</td>
              <td>${esc(r.owner_name || '—')}</td>
              <td>${statusBadge(r.status)}</td>
            </tr>`).join('')}</tbody>
        </table></div>
      </div>
    </div>

    <div class="grid grid-2" style="margin-top:16px;">
      <div class="card">
        <h3>${svgIcon('clock')} 保修预警（90 天内到期 / 已过期）</h3>
        ${d.expiring.length ? `<div class="table-wrap"><table class="grid">
          <thead><tr><th>资产</th><th>设备</th><th>保修到期</th><th>状态</th></tr></thead>
          <tbody>${d.expiring.map((e) => `
            <tr onclick="openDeviceDetail('${e.id}')" style="cursor:pointer">
              <td class="mono">${esc(e.asset_no)}</td>
              <td>${esc(e.brand || '')} ${esc(e.model || '')}</td>
              <td>${fmtDate(e.warranty_until)}</td>
              <td>${e.warranty_until < new Date().toISOString().slice(0, 10) ? '<span class="badge" style="color:var(--red)">已过期</span>' : '<span class="badge" style="color:var(--amber)">即将到期</span>'}</td>
            </tr>`).join('')}</tbody>
        </table></div>` : '<div class="muted">暂无保修预警</div>'}
      </div>
      <div class="card">
        <h3>最近操作记录</h3>
        <div class="table-wrap"><table class="grid">
          <thead><tr><th>时间</th><th>设备</th><th>操作</th><th>说明</th></tr></thead>
          <tbody>${d.recentLogs.map((l) => `
            <tr><td class="muted">${esc((l.created_at || '').replace('T', ' ').slice(5, 16))}</td>
            <td class="mono">${esc(l.asset_no || '—')}</td>
            <td>${esc(actionLabel(l.action))}</td>
            <td class="muted">${esc(l.note || l.field || '')}</td></tr>`).join('')}</tbody>
        </table></div>
      </div>
    </div>`;
}

const palette = (i) => ['#2563eb', '#0ea5e9', '#14b8a6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#64748b', '#0f172a'][i % 10];

/* 环形图。
 * 几何硬约束：外描边必须刚好贴住画布内沿，否则环会「穿模」出框。
 *   r = (size - stroke) / 2   →   r + stroke/2 = size/2
 * 半径绝不能再写死：以前 r=74 + stroke 22 的外沿是 85，而 180 画布的半宽是 90，
 * 只剩 5px 余量，一旦外层容器换成 150px（窄屏媒体查询）就被切掉一圈。
 * 圆心数字也改成 SVG <text>：DOM 浮层要跟 SVG 各自对尺寸，两边一改就错位。 */
function donutSVG(items, opts = {}) {
  const size = opts.size || 168;
  const stroke = opts.stroke || 20;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const C = 2 * Math.PI * r;
  const total = items.reduce((s, x) => s + (x.value || 0), 0);
  let offset = 0;
  const segs = total > 0
    ? items.map((x) => {
        const dash = (x.value || 0) / total * C;
        const s = `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${x.color || 'var(--line)'}"
          stroke-width="${stroke}" stroke-dasharray="${dash.toFixed(2)} ${(C - dash).toFixed(2)}"
          stroke-dashoffset="${(-offset).toFixed(2)}"></circle>`;
        offset += dash;
        return s;
      }).join('')
    : `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="${stroke}"></circle>`;
  return `<div class="donut" style="width:${size}px;height:${size}px">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img"
      aria-label="设备状态分布，共 ${total} 台">${segs}
      <text class="dn-num" x="${cx}" y="${cx - 3}" text-anchor="middle" dominant-baseline="middle">${total}</text>
      <text class="dn-cap" x="${cx}" y="${cx + 17}" text-anchor="middle" dominant-baseline="middle">台设备</text>
    </svg></div>`;
}
function legendHTML(items) {
  const total = items.reduce((s, x) => s + (x.value || 0), 0) || 1;
  return `<div class="legend">${items.map((x) => `
    <div class="legend-item"><span class="sw" style="background:${x.color}"></span>
      <span class="nm">${esc(x.name)}</span>
      <span class="vl">${x.value} <span class="muted">(${Math.round(x.value / total * 100)}%)</span></span></div>`).join('')}</div>`;
}
function actionLabel(a) {
  return { create: '新建', update: '更新', delete: '删除', move: '转移', handover: '交接', repair: '维修', scrap: '报废', import: '导入', ocr: '识别', verify: '核对' }[a] || a;
}

/* ================= 设备台账 ================= */
async function renderDevices() {
  $('#content').innerHTML = await devicesViewHTML();
  bindDeviceEvents();
  await loadDevices();
}

async function devicesViewHTML() {
  const o = state.options;
  const orgOpts = o.orgs.map((x) => `<option value="${x.id}">${esc(x.path || x.name)}</option>`).join('');
  const brandOpts = o.brands.map((b) => `<option value="${esc(b.v)}">${esc(b.v)} (${b.c})</option>`).join('');
  const supplierOpts = (o.suppliers || []).map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
  return `
  <div class="card">
    <div class="toolbar">
      <input id="fKeyword" placeholder="搜索 编号/SN/品牌/型号/使用人…" value="${esc(state.devicesQuery.keyword)}" style="width:240px" />
      <div class="fbar">
        <select id="fCategory" style="width:150px"><option value="">全部分类</option>${o.categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
        <select id="fOrg" style="width:210px"><option value="">全部组织</option>${orgOpts}</select>
        <select id="fStatus" style="width:130px"><option value="">全部状态</option>${o.statuses.map((s) => `<option value="${s.id}">${s.label}</option>`).join('')}</select>
        <select id="fBrand" style="width:130px"><option value="">全部品牌</option>${brandOpts}</select>
        <select id="fSupplier" style="width:120px"><option value="">全部供应商</option>${supplierOpts}</select>
      </div>
      <button class="btn" id="fSearch">${svgIcon('search')} 查询</button>
      <button class="btn ghost" id="fReset">重置</button>
      <span class="grow"></span>
      ${hasPerm('device.write') ? '<button class="btn primary" id="btnAdd">＋ 新增设备</button>' : ''}
      ${hasPerm('excel.export') ? `<button class="btn" id="btnExport" title="导出全部设备，不受上方筛选影响">${svgIcon('download')} 全部导出</button>` : ''}
      ${(hasPerm('device.write') || hasPerm('device.delete') || hasPerm('excel.export')) ? `
      <div class="dropdown" id="bulkMenu">
        <button class="btn" id="btnBulk" disabled>批量操作 ▾</button>
        <div class="dropdown-menu">
          ${hasPerm('device.write') ? '<button data-act="status">变更状态</button><button data-act="move">转移到组织</button><button data-act="handover">交接使用人</button>' : ''}
          ${hasPerm('excel.export') ? `<button data-act="export">${svgIcon('download')} 导出所选</button>` : ''}
          ${hasPerm('device.delete') ? '<button data-act="delete" style="color:var(--red)">删除所选</button>' : ''}
        </div>
      </div>` : ''}
    </div>
    <div class="table-wrap" id="deviceTableWrap">
      <table class="grid">
        <thead><tr>
          <th style="width:34px"><input type="checkbox" id="selAll" title="全选本页"></th>
          <th>资产编号</th><th>分类</th><th>品牌/型号</th><th>SN</th><th>所属组织</th><th>使用人</th><th>状态</th><th>保修</th><th>更新时间</th><th style="width:120px">操作</th>
        </tr></thead>
        <tbody id="devicesBody"></tbody>
      </table>
    </div>
    <div class="pagination">
      <div class="info" id="pageInfo"></div>
      <div class="page-btns" id="pageBtns"></div>
    </div>
  </div>`;
}

function bindDeviceEvents() {
  const on = (sel, ev, fn) => { const el = $(sel); if (el) el[ev] = fn; };
  on('#fSearch', 'onclick', () => { state.devicesQuery.page = 1; state.devicesQuery.keyword = $('#fKeyword').value.trim(); loadDevices(); });
  on('#fKeyword', 'onkeydown', (e) => { if (e.key === 'Enter') $('#fSearch').click(); });
  on('#fCategory', 'onchange', (e) => { state.devicesQuery.page = 1; state.devicesQuery.category_id = e.target.value; loadDevices(); });
  on('#fOrg', 'onchange', (e) => { state.devicesQuery.page = 1; state.devicesQuery.org_id = e.target.value; loadDevices(); });
  on('#fStatus', 'onchange', (e) => { state.devicesQuery.page = 1; state.devicesQuery.status = e.target.value; loadDevices(); });
  on('#fBrand', 'onchange', (e) => { state.devicesQuery.page = 1; state.devicesQuery.brand = e.target.value; loadDevices(); });
  on('#fSupplier', 'onchange', (e) => { state.devicesQuery.page = 1; state.devicesQuery.supplier = e.target.value; loadDevices(); });
  on('#fReset', 'onclick', () => {
    state.devicesQuery = { page: 1, page_size: 20, keyword: '', category_id: '', org_id: '', status: '', brand: '', supplier: '', sort: 'updated_at', order: 'desc' };
    renderDevices();
  });
  on('#btnAdd', 'onclick', () => openDeviceForm());
  // 右上角这个按钮 = 全部导出（不受上方筛选影响），只导出勾选的走「批量操作 → 导出所选」
  on('#btnExport', 'onclick', () => doExport({ all: true }));
  on('#btnBulk', 'onclick', (e) => { e.stopPropagation(); const m = $('#bulkMenu'); if (m) m.classList.toggle('open'); });
  $$('#bulkMenu .dropdown-menu button').forEach((b) => b.onclick = () => { const m = $('#bulkMenu'); if (m) m.classList.remove('open'); bulkAction(b.dataset.act); });
  on('#selAll', 'onchange', (e) => {
    // 表头框只管**本页**这 20 行（跨页的一次性勾选走「选中全部 N 台」那条）。
    $$('#devicesBody input.row-check').forEach((c) => { c.checked = e.target.checked; });
    // 整页取消时顺手退出「全选匹配」模式 —— 用户点掉勾就是想重选，留着标记会让人误以为还是全选状态。
    if (!e.target.checked) state.selectAllMatching = 0;
    refreshSelection();
  });
}

async function loadDevices() {
  const q = state.devicesQuery;
  const params = new URLSearchParams({ page: q.page, page_size: q.page_size, sort: q.sort, order: q.order });
  if (q.keyword) params.set('keyword', q.keyword);
  if (q.category_id) params.set('category_id', q.category_id);
  if (q.org_id) params.set('org_id', q.org_id);
  if (q.status) params.set('status', q.status);
  if (q.brand) params.set('brand', q.brand);
  if (q.supplier) params.set('supplier', q.supplier);
  const data = await api('/devices?' + params.toString());
  state.devicesData = data;
  const body = $('#devicesBody');
  if (!data.items.length) {
    body.innerHTML = `<tr><td colspan="11"><div class="empty"><div class="big">${svgIcon('inbox', 24)}</div>暂无设备，点击右上角「新增设备」或使用 Excel 批量导入</div></td></tr>`;
  } else {
    // 卡片在窄屏会被折成很多行，其中「所属组织 / 使用人 / 保修」最常是空值（破折号）。
    // 空的加 .blank，CSS 在 760px 以下不渲染；有值的照常显示。
    // 「三条都空」的兜底也交给 CSS（tr:has(td.blank) 那条），这里不需要额外标记 —— 
    // 一旦把判定挪到 map 外面，d 就不在作用域里了（这里踩过：ReferenceError: d is not defined）。
    body.innerHTML = data.items.map((d) => `
      <tr data-id="${d.id}">
        <td data-label="" class="keep"><input type="checkbox" class="row-check" value="${d.id}"${state.selection.has(String(d.id)) ? ' checked' : ''}></td>
        <td class="mono" style="font-weight:600" data-label="资产编号">${esc(d.asset_no)}</td>
        <td data-label="分类"><span class="chip">${iconOf(d.category_icon)} ${esc(d.category_name || '未分类')}</span></td>
        <td data-label="品牌 / 型号">${esc(d.brand || '—')} <span class="muted">${esc(d.model || '')}</span></td>
        <td class="mono muted" data-label="SN">${esc(d.sn || '—')}</td>
        <td class="muted${d.org_path || d.org_name ? '' : ' blank'}" data-label="所属组织">${esc(d.org_path || d.org_name || '—')}</td>
        <td class="${d.owner_name ? '' : 'blank'}" data-label="使用人">${esc(d.owner_name || '—')}</td>
        <td data-label="状态">${statusBadge(d.status)}</td>
        <td class="mut" data-label="保修">${d.warranty_expired === true ? '<span class="tag" style="color:var(--red)">已过期</span>' : d.warranty_expired === false ? `<span class="muted">${fmtDate(d.warranty_until)}</span>` : '<span class="muted">—</span>'}</td>
        <td class="muted" data-label="更新时间">${esc((d.updated_at || '').replace('T', ' ').slice(0, 16))}</td>
        <td data-label="" class="keep"><div class="row-actions">
          <button type="button" class="btn xs" onclick="openDeviceDetail('${d.id}')">查看</button>
          ${hasPerm('device.write') ? `<button type="button" class="btn xs" onclick="openDeviceForm('${d.id}')">编辑</button>` : ''}
          <button type="button" class="btn xs ghost" title="二维码" onclick="openQRModal('${d.id}')">${svgIcon('qr', 14)}</button>
        </div></td>
      </tr>`).join('');
    // 「选中本页 20 台」之外，再给一条「选中全部 N 台」的出路 ——
    // 20 台一页时逐个翻页勾选很反人类，尤其是想对「筛选出来的这批」整体操作时。
    if (data.total > data.items.length) {
      body.insertAdjacentHTML('beforeend', `<tr class="sel-all-row"><td colspan="11">
        <button type="button" class="link-btn" id="selAllMatching">选中当前筛选下的全部 ${data.total} 台</button>
      </td></tr>`);
      const sam = $('#selAllMatching');
      if (sam) sam.onclick = () => { enterSelectAllMatching(data.total); };
    }
  }
  $('#pageInfo').innerHTML = `共 <b>${data.total}</b> 台设备 · 第 ${data.page}/${data.pages} 页`;
  $('#pageBtns').innerHTML = pagerHTML(data.page, data.pages);
  $$('#pageBtns .btn').forEach((b) => b.onclick = () => { state.devicesQuery.page = Number(b.dataset.p); loadDevices(); });
  $$('#devicesBody input.row-check').forEach((c) => c.onchange = refreshSelection);
  refreshSelection();
}

function pagerHTML(page, pages) {
  let html = `<button class="btn sm" data-p="${Math.max(1, page - 1)}" ${page <= 1 ? 'disabled' : ''}>‹</button>`;
  const start = Math.max(1, page - 2), end = Math.min(pages, page + 2);
  for (let i = start; i <= end; i++) html += `<button class="btn sm ${i === page ? 'primary' : ''}" data-p="${i}">${i}</button>`;
  html += `<button class="btn sm" data-p="${Math.min(pages, page + 1)}" ${page >= pages ? 'disabled' : ''}>›</button>`;
  return html;
}

/**
 * 逐行勾选变化 → **增量**合并进 state.selection。
 *
 * ⚠️ 方向很重要：**state 是真相，DOM 只是视图**。
 *    2026-09-21 之前这里是反的 —— `state.selection = new Set($$('#devicesBody input.row-check:checked')...)`
 *    拿「当前页 DOM 里勾了几个」整体覆盖 state，于是翻页就丢掉上一页的勾选。
 *    用户看到的现象是「批量操作最多只能操作 20 个，就是当前这一页」：
 *    20 既是页面尺寸、也是真实操作上限，因为它们共用同一个来源。
 *    修法 = 这一份函数只做「本页这几行的增/删」，绝不整体重建；
 *    loadDevices() 渲染新页时再按 state 把该勾的勾上（见那边 `state.selection.has(...)`）。
 */
function refreshSelection() {
  // 逐行勾选变化 → 增量更新 state（不再整体覆盖）
  $$('#devicesBody input.row-check').forEach((c) => {
    if (c.checked) state.selection.add(c.value);
    else state.selection.delete(c.value);
  });
  syncSelectionUI();
}

/** 只负责「把 state.selection 反映到界面上」：按钮数字、全选框三态、菜单文案 */
function syncSelectionUI() {
  const n = state.selectAllMatching || state.selection.size;
  const btn = $('#btnBulk');
  if (btn) {
    btn.disabled = n === 0;
    btn.textContent = n ? `批量操作 (${n}) ▾` : '批量操作 ▾';
  }
  // 菜单里的「导出所选」跟着选中数量走，一眼知道会导出几台
  const exp = $('#bulkMenu .dropdown-menu button[data-act="export"]');
  if (exp) exp.innerHTML = svgIcon('download') + (n ? ` 导出所选 (${n})` : ' 导出所选');

  // 表头全选框三态：本页全勾 = 勾上，勾了一部分 = 半选
  const selAll = $('#selAll');
  const boxes = $$('#devicesBody input.row-check');
  if (selAll && boxes.length) {
    const onPage = boxes.filter((c) => c.checked).length;
    selAll.checked = onPage === boxes.length;
    selAll.indeterminate = onPage > 0 && onPage < boxes.length;
  }

  renderSelectionBar();
}

/**
 * 选中数量 > 0 时，表格上方浮出一条「已选 N 台 · 清除」的提示条。
 *
 * 为什么必须有：跨页勾选之后，用户看不见自己到底选了多少、
 * 也找不到「取消」的地方（勾选分散在好几页里，没法逐个点回来）。
 */
function renderSelectionBar() {
  // 锚点只认 #deviceTableWrap（台账页独有的 id）。
  // 拿不到就说明当前根本不在台账页 —— 直接不渲染，别 fallback 到 .table-wrap 之类的类选择器，
  // 那会把提示条插到回收站/导入历史的表格上。
  const host = $('#deviceTableWrap');
  if (!host || !host.parentNode) return;
  let bar = $('#selBar');
  const n = state.selectAllMatching || state.selection.size;
  if (!n) { if (bar) bar.remove(); return; }
  const allMode = state.selectAllMatching > 0;
  const text = allMode
    ? `已选中当前筛选下的<b>全部 ${n} 台</b>（跨页生效）`
    : `已选中 <b>${n}</b> 台${n > (state.devicesData?.items?.length || 0) ? '（含其他页）' : ''}`;
  const html = `<div class="sel-bar-inner">
      <span class="sel-bar-text">${text}</span>
      <button type="button" class="btn xs ghost" id="selBarClear">清除选择</button>
    </div>`;
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'selBar';
    bar.className = 'sel-bar';
    // 插在筛选条下方、表格上方（host 已经是 #deviceTableWrap，上面挡过 null）
    host.parentNode.insertBefore(bar, host);
  }
  bar.innerHTML = html;
  const clear = $('#selBarClear');
  if (clear) clear.onclick = () => { clearSelection(); };
}

/** 清空所有勾选（state + DOM + 全选框） */
function clearSelection() {
  state.selection.clear();
  state.selectAllMatching = 0;
  $$('#devicesBody input.row-check').forEach((c) => { c.checked = false; });
  const selAll = $('#selAll');
  if (selAll) { selAll.checked = false; selAll.indeterminate = false; }
  // 「选中全部 N 台」那条行也要撤掉，否则界面上还留着入口
  $$('#devicesBody .sel-all-row').forEach((r) => r.remove());
  syncSelectionUI();
}

/**
 * 进入「选中当前筛选下的全部 N 台」模式。
 *
 * 为什么不让前端把 N 个 id 全存下来：设备上万台时，一个 Set 里塞几万个 uuid、
 * 每次渲染都要遍历比对，纯属浪费；而且「全选匹配」的语义本来就是
 * 「按这个筛选条件操作」，交给后端一条 SQL 更准（中途有人改了数据也不会漏/多）。
 * 所以这里只记一个**标记 + 数量**，真正执行时把筛选条件发给后端。
 *
 * ⚠️ 函数名刻意叫 enterSelectAllMatching 而**不是** selectAllMatching：
 *    state 里那个字段就叫 selectAllMatching，同名函数会让人（和静态检查）分不清
 *    `selectAllMatching(20)` 到底是在调函数还是漏了 state. 前缀。名字撞车是自找的。
 */
function enterSelectAllMatching(total) {
  state.selectAllMatching = Number(total) || 0;
  // 本页的全勾上，视觉上呼应「全都选了」
  $$('#devicesBody input.row-check').forEach((c) => { c.checked = true; });
  const selAll = $('#selAll');
  if (selAll) { selAll.checked = true; selAll.indeterminate = false; }
  toast(`已选中当前筛选下的全部 ${state.selectAllMatching} 台`, 'ok');
  syncSelectionUI();
}

/**
 * 收集要操作的 id 列表。
 * 开了「全选匹配」就返回 null，并把筛选条件带上 —— 让后端自己去查，避免前端存几十万个 id。
 */
function bulkSelectionPayload() {
  if (state.selectAllMatching > 0) return { all_matching: true, query: devicesFilterQuery() };
  return { ids: [...state.selection] };
}

/** 把当前筛选条件抽出来（不含分页），供「全选匹配」和服务端查询复用 */
function devicesFilterQuery() {
  const q = state.devicesQuery;
  const out = {};
  if (q.keyword) out.keyword = q.keyword;
  if (q.category_id) out.category_id = q.category_id;
  if (q.org_id) out.org_id = q.org_id;
  if (q.status) out.status = q.status;
  if (q.brand) out.brand = q.brand;
  if (q.supplier) out.supplier = q.supplier;
  return out;
}

async function bulkAction(action) {
  // 数量口径统一走 state：全选匹配模式下是「筛选结果总数」，否则是勾选集合大小。
  // ⚠️ 以前这里写的是 `const ids = [...state.selection]`，而 state.selection 当年由当前页 DOM 重建，
  //    于是「一页 20 个」既是显示上限也是真实上限。现在 ids 只作一种载荷形态，跨页勾选不会丢。
  const count = state.selectAllMatching || state.selection.size;
  if (!count) return;
  if (action === 'export') {
    // 只导出勾选的这几台（全选匹配模式则由后端按筛选条件出）
    doExport(bulkSelectionPayload());
    return;
  }
  if (action === 'delete') {
    const ok = await confirmBox('删除设备', `确定删除选中的 ${count} 台设备吗？此操作可恢复。`);
    if (!ok) return;
  }
  if (action === 'status' || action === 'move' || action === 'handover') {
    const form = {
      status: `<div class="field"><label>目标状态</label><select id="bulkStatus">${state.options.statuses.map((s) => `<option value="${s.id}">${s.label}</option>`).join('')}</select></div>`,
      move: `<div class="field"><label>目标组织</label><select id="bulkOrg">${state.options.orgs.map((o) => `<option value="${o.id}">${esc(o.path || o.name)}</option>`).join('')}</select></div>`,
      handover: `<div class="field"><label>新使用人</label><input id="bulkOwner" placeholder="姓名"></div>
        <div class="field"><label>工号</label><input id="bulkEmp" placeholder="员工编号"></div>
        <div class="field"><label>电话</label><input id="bulkPhone" placeholder="联系电话"></div>
        <div class="field"><label>目标组织</label><select id="bulkOrg">${state.options.orgs.map((o) => `<option value="${o.id}">${esc(o.path || o.name)}</option>`).join('')}</select></div>`,
    }[action];
    openModal(`<div class="modal-head"><h2>批量操作</h2><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body"><p class="hint">将对 <b>${count}</b> 台设备执行此操作${state.selectAllMatching ? '（当前筛选下的全部）' : ''}。</p>${form}</div>
      <div class="modal-foot"><button class="btn" onclick="closeModal()">取消</button><button class="btn primary" id="bulkDo">确定</button></div>`, { slim: true });
    $('#bulkDo').onclick = async () => {
      const payload = {
        status: () => ({ status: $('#bulkStatus').value }),
        move: () => ({ org_id: $('#bulkOrg').value }),
        handover: () => ({ owner_name: $('#bulkOwner').value, owner_employee_no: $('#bulkEmp').value, owner_phone: $('#bulkPhone').value, org_id: $('#bulkOrg').value, status: 'in_use' }),
      }[action]();
      try {
        const r = await api('/devices/bulk', { method: 'POST', body: JSON.stringify({ ...bulkSelectionPayload(), action, payload }) });
        toast(`完成：成功 ${r.ok} 条，失败 ${r.failed} 条`, r.failed ? 'warn' : 'ok');
        closeModal();
        clearSelection();
        loadDevices();
      } catch (e) { toast(e.message, 'error'); }
    };
    return;
  }
  try {
    const r = await api('/devices/bulk', { method: 'POST', body: JSON.stringify({ ...bulkSelectionPayload(), action }) });
    toast(`完成：成功 ${r.ok} 条，失败 ${r.failed} 条`, r.failed ? 'warn' : 'ok');
    clearSelection();
    loadDevices();
  } catch (e) { toast(e.message, 'error'); }
}

/* ---------- 设备表单 ---------- */
/* ---------- 分类专属字段：渲染与取值 ---------- */
/** 该专属字段是否映射到设备表的真实列（如 screen_size / cpu / ip_address） */
function isColumnTracking(key) {
  return (state.options?.column_tracking_keys || []).includes(key);
}

/** 专属字段的当前值：映射到列就读列，否则读 extra */
function trackingValue(dev, t) {
  if (!dev) return '';
  return isColumnTracking(t.key) ? (dev[t.key] ?? '') : (dev.extra?.[t.key] ?? '');
}

/** 专属字段输入控件：select 类型渲染成下拉；历史值不在选项里时也保留，避免误清空 */
function trackingInputHTML(t, value) {
  const id = `x_${t.key}`;
  const v = value === null || value === undefined ? '' : String(value);
  if (t.type === 'select' && Array.isArray(t.options) && t.options.length) {
    const opts = [...t.options];
    if (v && !opts.includes(v)) opts.unshift(v);
    return `<select id="${id}">
      <option value="">— 未指定 —</option>
      ${opts.map((o) => `<option value="${esc(o)}" ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}
    </select>`;
  }
  const type = t.type === 'number' ? 'number' : t.type === 'date' ? 'date' : 'text';
  return `<input id="${id}" type="${type}" value="${esc(v)}">`;
}

function deviceFormHTML(dev) {
  const o = state.options;
  const cat = dev?.category_id || state.options.categories[0]?.id || '';
  const tracking = state.options.categories.find((c) => c.id === cat)?.tracking_fields || [];
  const extra = dev?.extra || {};
  return `
    <div class="form-grid">
      <div class="field"><label>资产编号 <span class="req">*</span></label>
        <input id="fAssetNo" value="${esc(dev?.asset_no || '')}" placeholder="留空自动生成"></div>
      <div class="field"><label>设备分类 <span class="req">*</span></label>
        <select id="fCat">${o.categories.map((c) => `<option value="${c.id}" ${c.id === cat ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
      <div class="field"><label>品牌</label><input id="fBrand" list="brandList" value="${esc(dev?.brand || '')}" placeholder="Dell / 联想 / HP…">
        <datalist id="brandList">${o.brands.map((b) => `<option value="${esc(b.v)}">`).join('')}</datalist></div>
      <div class="field"><label>型号</label><input id="fModel" value="${esc(dev?.model || '')}" placeholder="如 U2723QE"></div>
      <div class="field"><label>SN 序列号</label><input id="fSN" value="${esc(dev?.sn || '')}" placeholder="设备唯一序列号"></div>
      <div class="field"><label>所属组织</label><select id="fOrg"><option value="">未分配</option>${o.orgs.map((x) => `<option value="${x.id}" ${dev?.org_id === x.id ? 'selected' : ''}>${esc(x.path || x.name)}</option>`).join('')}</select></div>
      <div class="field"><label>状态</label><select id="fStatus">${o.statuses.map((s) => `<option value="${s.id}" ${dev?.status === s.id ? 'selected' : ''}>${s.label}</option>`).join('')}</select></div>
      <div class="field"><label>成色</label><select id="fGrade"><option value="">—</option>${['A', 'B', 'C'].map((g) => `<option ${dev?.condition_grade === g ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
      <div class="field"><label>使用人</label><input id="fOwner" value="${esc(dev?.owner_name || '')}"></div>
      <div class="field"><label>使用人工号</label><input id="fEmp" value="${esc(dev?.owner_employee_no || '')}"></div>
      <div class="field"><label>使用人电话</label><input id="fPhone" value="${esc(dev?.owner_phone || '')}"></div>
      <div class="field"><label>存放位置</label><input id="fLocation" value="${esc(dev?.location || '')}"></div>
      <div class="field"><label>IP 地址</label><input id="fIP" value="${esc(dev?.ip_address || '')}"></div>
      <div class="field"><label>MAC 地址</label><input id="fMAC" value="${esc(dev?.mac_address || '')}"></div>
      <div class="field"><label>操作系统</label><input id="fOS" value="${esc(dev?.os_name || '')}"></div>
      <div class="field"><label>CPU</label><input id="fCPU" value="${esc(dev?.cpu || '')}"></div>
      <div class="field"><label>内存</label><input id="fMem" value="${esc(dev?.memory || '')}"></div>
      <div class="field"><label>硬盘</label><input id="fDisk" value="${esc(dev?.disk || '')}"></div>
      <div class="field"><label>采购日期</label><input type="date" id="fBuy" value="${dev?.purchase_date || ''}"></div>
      <div class="field"><label>保修到期</label><input type="date" id="fWarranty" value="${dev?.warranty_until || ''}"></div>
      <div class="field"><label>采购金额</label><input type="number" step="0.01" id="fPrice" value="${dev?.purchase_price ?? ''}"></div>
      <div class="field"><label>供应商</label>
        <select id="fSupplier">
          <option value="">— 未指定 —</option>
          ${[...new Set([...(o.suppliers || []), ...(dev?.supplier ? [dev.supplier] : [])])]
            .map((s) => `<option value="${esc(s)}" ${dev?.supplier === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}
        </select></div>
      <div class="field"><label>合同号</label><input id="fContract" value="${esc(dev?.contract_no || '')}"></div>
      <div class="field full"><label>备注</label><textarea id="fRemark">${esc(dev?.remark || '')}</textarea></div>
      ${tracking.length ? `<div class="full" style="grid-column:1/-1"><h3 style="margin:10px 0 12px">${esc(state.options.categories.find((c) => c.id === cat)?.name || '')} 专属字段</h3><div class="form-grid">${tracking.map((t) => `
        <div class="field"><label>${esc(t.label)}</label>${trackingInputHTML(t, trackingValue(dev, t))}</div>`).join('')}</div></div>` : ''}
    </div>`;
}

function openDeviceForm(id) {
  if (!id) {
    openModal(`<div class="modal-head"><h2>新增设备</h2><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">${deviceFormHTML(null)}</div>
      <div class="modal-foot"><button class="btn" onclick="closeModal()">取消</button><button class="btn primary" id="devSave">保存</button></div>`, { wide: true });
    bindDeviceForm(null);
    return;
  }
  api('/devices/' + id).then((dev) => {
    openModal(`<div class="modal-head"><h2>编辑设备 ${esc(dev.asset_no)}</h2><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">${deviceFormHTML(dev)}</div>
      <div class="modal-foot"><button class="btn" onclick="closeModal()">取消</button><button class="btn primary" id="devSave">保存</button></div>`, { wide: true });
    bindDeviceForm(dev);
  }).catch((e) => toast(e.message, 'error'));
}

function bindDeviceForm(dev) {
  $('#fCat').onchange = () => {
    const cat = $('#fCat').value;
    const tracking = state.options.categories.find((c) => c.id === cat)?.tracking_fields || [];
    const box = $('.modal-body');
    const existing = box.querySelector('[data-tracking]');
    if (existing) existing.remove();
    if (tracking.length) {
      const div = document.createElement('div');
      div.setAttribute('data-tracking', '');
      div.className = 'full';
      div.style.gridColumn = '1/-1';
      div.innerHTML = `<h3 style="margin:10px 0 12px">${esc(state.options.categories.find((c) => c.id === cat)?.name || '')} 专属字段</h3>
        <div class="form-grid">${tracking.map((t) => `<div class="field"><label>${esc(t.label)}</label>${trackingInputHTML(t, '')}</div>`).join('')}</div>`;
      box.appendChild(div);
    }
  };
  $('#devSave').onclick = async () => {
    const cat = $('#fCat').value;
    const tracking = state.options.categories.find((c) => c.id === cat)?.tracking_fields || [];
    // 专属字段：映射到设备列的写列，其余写 extra
    const extra = { ...(dev?.extra || {}) };
    const columnValues = {};
    tracking.forEach((t) => {
      const el = $(`#x_${t.key}`);
      if (!el) return;
      const raw = String(el.value ?? '');
      const v = raw === '' ? null : (t.type === 'number' ? Number(raw) : raw);
      if (isColumnTracking(t.key)) columnValues[t.key] = v;
      else if (v !== null) extra[t.key] = v;
      else delete extra[t.key];
    });
    const payload = {
      category_id: cat,
      asset_no: $('#fAssetNo').value.trim(),
      brand: $('#fBrand').value.trim(), model: $('#fModel').value.trim(), sn: $('#fSN').value.trim(),
      org_id: $('#fOrg').value || null, status: $('#fStatus').value, condition_grade: $('#fGrade').value || null,
      owner_name: $('#fOwner').value.trim(), owner_employee_no: $('#fEmp').value.trim(), owner_phone: $('#fPhone').value.trim(),
      location: $('#fLocation').value.trim(), ip_address: $('#fIP').value.trim(), mac_address: $('#fMAC').value.trim(),
      os_name: $('#fOS').value.trim(), cpu: $('#fCPU').value.trim(), memory: $('#fMem').value.trim(), disk: $('#fDisk').value.trim(),
      purchase_date: $('#fBuy').value || null, warranty_until: $('#fWarranty').value || null,
      purchase_price: $('#fPrice').value === '' ? null : Number($('#fPrice').value),
      supplier: $('#fSupplier').value.trim(), contract_no: $('#fContract').value.trim(), remark: $('#fRemark').value.trim(),
      ...columnValues,
      extra,
    };
    try {
      if (dev) await api('/devices/' + dev.id, { method: 'PUT', body: JSON.stringify(payload) });
      else await api('/devices', { method: 'POST', body: JSON.stringify(payload) });
      toast(dev ? '已保存' : '已新增设备');
      closeModal();
      loadDevices();
    } catch (e) { toast(e.message, 'error'); }
  };
}

/* ---------- 设备详情 ---------- */

/**
 * 设备「小码」里放的内容。
 *
 * **放什么直接决定好不好扫**（2026-09-19 实测各码型模块数，别凭印象写）：
 *   资产编号（如 MON-2026-0010，13 字节）→ 版本 1，21×21 模块；150px 下每格 5.6px，240px 下 8.9px
 *   网址（`http://ip:8080/m/#/device/<uuid>`，72 字节）→ **版本 5，37×37 模块**（接口默认 ec=M）；
 *     同样是网址，显式传 ec=L 才会降到版本 4 / 33×33。150px 下每格只有 3.8px，很吃相机
 * 两者在各自展示尺寸下都够手机扫。小码优先用**资产编号**：模块少、容错余量大、
 * 而且不依赖「手机能不能访问那个地址」，贴标签印出来也不容易糊。
 *
 * 移动端扫到资产编号后走 `/devices/lookup?sn=`（该接口同时匹配 asset_no 与 sn）。
 */
function qrShortCode(d) {
  return String((d && (d.asset_no || d.sn)) || '').trim();
}

/**
 * 设备详情里的照片区。
 * 手机拍照入库时会自动归档三份：原图 / 压缩图 / 缩略图，
 * 这里默认显示压缩图（加载快），点开看原图。
 */
function photoPanelHTML(d) {
  const preview = d.photo_path || d.photo_original_path || '';
  const original = d.photo_original_path || d.photo_path || '';
  const hasBoth = !!(d.photo_path && d.photo_original_path && d.photo_path !== d.photo_original_path);

  if (!preview) {
    return `<div style="font-size:12px;color:var(--text-3);margin-bottom:8px">设备照片</div>
      <div class="muted" style="font-size:12.5px;padding:18px 10px;border:1px dashed var(--border);border-radius:10px">
        还没有照片<br><span style="font-size:11.5px">用手机「拍照识别入库」会自动带一张</span>
      </div>`;
  }
  return `
    <div style="font-size:12px;color:var(--text-3);margin-bottom:8px">设备照片${hasBoth ? '（点图看原图）' : ''}</div>
    <img src="${esc(preview)}" alt="设备照片" title="点击查看原图"
         style="max-width:100%;width:210px;max-height:190px;object-fit:contain;background:var(--photo-bg);border:1px solid var(--border);border-radius:10px;cursor:zoom-in"
         onclick="window.open('${esc(original)}','_blank')">
    <div style="margin-top:8px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
      <button class="btn sm" onclick="window.open('${esc(original)}','_blank')">查看原图</button>
      <a class="btn sm" href="${esc(original)}" download>下载原图</a>
    </div>
    <div class="muted" style="font-size:11.5px;margin-top:6px">${hasBoth ? '已存原图，导出 Excel 会带上缩略图' : '当前原图与预览为同一张'}</div>`;
}

async function openDeviceDetail(id) {
  try {
    const d = await api('/devices/' + id);
    const hist = await api(`/devices/${id}/history`);
    // 详情里这个小码放**资产编号**而不是网址：资产编号是 21×21 模块，150px 下每格 5.6px，
    // 容错余量大、也不依赖「手机能不能访问那个地址」。要网址码点「打开二维码」。
    const qrCode = qrShortCode(d);
    // 21 模块 + 两侧各 3 格留白 = 27 格；≥220px 才有 8px/格，
    // 原来 150px 只有 5.6px/格 —— 对着屏幕拍偏紧，放大到 240px 是 8.9px/格。
    // ⚠️ 这个尺寸是「手机对着一块屏幕拍照」的硬指标，不是排版偏好。
    //    实测（2026-09-20 第三张截图）：弹窗里实际只渲染出 ~159px，21×21+quiet=27 格
    //    → 5.9 px/格，低于「≥6 才稳」的判定阈，扫不出来是真扫不出来。
    //    余量要按「手机镜头到屏幕 15~20cm + 摩尔纹」留，280 起步。
    const vw = window.innerWidth || 1024;
    const qrShortSide = vw < 380 ? 250 : vw < 520 ? 280 : 320;
    // ⚠️ 这个常量在 openDeviceDetail（详情卡内联码）和 openQRModal（弹窗主码）**各自定义一份**，
    //    因为它们不在同一个作用域里 —— 拆 shared 常量时要两边都改，别只改一处。
    const qrUrl = `/api/qrcode?text=${encodeURIComponent(qrCode)}&ec=M`;
    openModal(`
      <div class="modal-head"><h2>设备详情 · ${esc(d.asset_no)}</h2><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">
        <div class="tabs"><span class="tab active" data-t="info">基本信息</span><span class="tab" data-t="hist">流转记录 (${hist.length})</span></div>
        <div id="dInfo">
          <div class="split">
            <div><dl class="kv">
              <dt>资产编号</dt><dd class="mono">${esc(d.asset_no)}</dd>
              <dt>分类</dt><dd>${iconOf(d.category?.icon)} ${esc(d.category?.name || '未分类')}</dd>
              <dt>品牌</dt><dd>${esc(d.brand || '—')}</dd>
              <dt>型号</dt><dd>${esc(d.model || '—')}</dd>
              <dt>SN 序列号</dt><dd class="mono">${esc(d.sn || '—')}</dd>
              <dt>状态</dt><dd>${statusBadge(d.status)}</dd>
              <dt>成色</dt><dd>${esc(d.condition_grade || '—')}</dd>
              <dt>所属组织</dt><dd>${esc(d.org_path || '—')}</dd>
              <dt>存放位置</dt><dd>${esc(d.location || '—')}</dd>
            </dl></div>
            <div><dl class="kv">
              <dt>使用人</dt><dd>${esc(d.owner_name || '—')} ${d.owner_employee_no ? `<span class="muted">(${esc(d.owner_employee_no)})</span>` : ''}</dd>
              <dt>联系电话</dt><dd>${esc(d.owner_phone || '—')}</dd>
              <dt>IP 地址</dt><dd class="mono">${esc(d.ip_address || '—')}</dd>
              <dt>MAC 地址</dt><dd class="mono">${esc(d.mac_address || '—')}</dd>
              <dt>操作系统</dt><dd>${esc(d.os_name || '—')}</dd>
              <dt>CPU / 内存</dt><dd>${esc(d.cpu || '—')} / ${esc(d.memory || '—')}</dd>
              <dt>硬盘</dt><dd>${esc(d.disk || '—')}</dd>
              <dt>屏幕尺寸</dt><dd>${esc(d.screen_size || '—')}</dd>
            </dl></div>
          </div>
          <div class="split" style="margin-top:14px">
            <div><dl class="kv">
              <dt>采购日期</dt><dd>${fmtDate(d.purchase_date)}</dd>
              <dt>保修到期</dt><dd>${fmtDate(d.warranty_until)} ${d.warranty_expired === true ? '<span class="badge" style="color:var(--red)">已过期</span>' : ''}</dd>
              <dt>采购金额</dt><dd>${fmtMoney(d.purchase_price)}</dd>
              <dt>供应商</dt><dd>${esc(d.supplier || '—')}</dd>
              <dt>合同号</dt><dd class="mono">${esc(d.contract_no || '—')}</dd>
              <dt>录入来源</dt><dd>${esc(d.sn_source || '—')} ${d.ocr_confidence ? `<span class="muted">(置信度 ${Math.round(d.ocr_confidence * 100)}%)</span>` : ''}</dd>
              <dt>备注</dt><dd>${esc(d.remark || '—')}</dd>
            </dl></div>
            <div style="text-align:center">
              ${photoPanelHTML(d)}
              <div style="font-size:12px;color:var(--text-3);margin:14px 0 8px">资产二维码（手机端扫码核对）</div>
              <img src="${qrUrl}" width="${qrShortSide}" height="${qrShortSide}" alt="二维码" style="border:1px solid var(--border);border-radius:10px;background:#fff">
              <div class="muted mono" style="font-size:11.5px;margin-top:6px">${esc(qrCode)}</div>
              <div style="margin-top:8px">
                <button class="btn sm" onclick="openQRModal('${d.id}')">打开二维码</button>
                <!-- 手机上别在这条路上扫码：这个页面（电脑端）在手机浏览器里调不起摄像头取景，
                     而且屏幕上的码会被页面缩放带走。直接把人送去手机版。 -->
                <button class="btn sm ghost qr-go-mobile" onclick="goMobileScan()">用手机版扫码核对</button>
              </div>
            </div>
          </div>
        </div>
        <div id="dHist" hidden><div class="table-wrap"><table class="grid">
          <thead><tr><th>时间</th><th>操作</th><th>字段</th><th>旧值</th><th>新值</th><th>操作人</th><th>说明</th></tr></thead>
          <tbody>${hist.map((h) => `<tr>
            <td class="muted">${esc((h.created_at || '').replace('T', ' ').slice(0, 19))}</td>
            <td>${esc(actionLabel(h.action))}</td><td class="muted">${esc(h.field || '')}</td>
            <td class="muted">${esc(h.old_value || '')}</td><td>${esc(h.new_value || '')}</td>
            <td>${esc(h.operator || '')}</td><td class="muted">${esc(h.note || '')}</td></tr>`).join('')}</tbody>
        </table></div></div>
      </div>
      <div class="modal-foot">
        <button class="btn danger" id="devDel">删除</button>
        <span style="flex:1"></span>
        <button class="btn" onclick="openDeviceForm('${d.id}')">编辑</button>
        <button class="btn" onclick="closeModal()">关闭</button>
      </div>`, { wide: true });
    $$('.tab').forEach((t) => t.onclick = () => {
      $$('.tab').forEach((x) => x.classList.toggle('active', x === t));
      $('#dInfo').hidden = t.dataset.t !== 'info';
      $('#dHist').hidden = t.dataset.t !== 'hist';
    });
    $('#devDel').onclick = async () => {
      if (await confirmBox('删除设备', `确定删除 ${d.asset_no} 吗？`)) {
        await api('/devices/' + d.id, { method: 'DELETE' });
        toast('已删除');
        closeModal();
        loadDevices();
      }
    };
  } catch (e) { toast(e.message, 'error'); }
}

/**
 * 资产二维码。
 *
 * 关键点：**码里放什么直接决定好不好扫**。
 * 放网址 → **版本 5（37×37 模块）**，150px 下每格才 3.8 像素，手机对着显示器拍基本靠运气；
 * 放资产编号 → 版本 1（21×21 模块），240px 下每格 8.9 像素，容错余量大得多，同样距离一眼就过。
 *
 * 所以这里两个码都给：
 *   大码 = 资产编号（手机 App 里「扫码核对」用，最准）
 *   小码 = 网址（手机自带相机用，扫了直接打开设备页）
 */
async function openQRModal(id) {
  const d = await api('/devices/' + id);
  const code = qrShortCode(d);
  const bases = await qrBases();
  const url = `${bases[0].base}/m/#/device/${d.id}`;
  const shortQR = `/api/qrcode?text=${encodeURIComponent(code)}&ec=M`;
  const urlQR = (base) => `/api/qrcode?text=${encodeURIComponent(`${base}/m/#/device/${d.id}`)}&ec=L`;

  // ⚠️ 这个常量必须在本函数里**自己定义一份**：openDeviceDetail 里那个同名的
  //    是另一个函数作用域里的局部变量，这里拿不到（曾因此报 qrShortSide is not defined，
  //    被 render-smoke 的「管理端照片区渲染」抓到）。改尺寸时两处都要改。
  //    尺寸依据见 admin.css 里 .qr-pair 那段注释（对着屏幕拍要 ≥6px/格，留余量取 250+）。
  const vw = window.innerWidth || 1024;
  const qrShortSide = vw < 380 ? 250 : vw < 520 ? 280 : 320;

  openModal(`<div class="modal-head"><h2>资产二维码</h2><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div id="qrMobileTip" class="qr-mobile-tip" hidden>
        <b>你正在用手机浏览电脑端页面。</b>
        这个页面本身不能调摄像头扫码 —— 请用<b>手机自带相机</b>扫下面任意一个码，
        会直接打开这台设备的详情页；或者点下面的按钮切到手机版扫码核对页。
      </div>
      <div class="qr-pair">
        <div class="qr-main">
          <img src="${shortQR}" width="${qrShortSide}" height="${qrShortSide}"
               alt="资产编号二维码" class="qr-main-img"
               style="width:${qrShortSide}px;height:${qrShortSide}px;border-radius:12px;border:1px solid var(--border);background:#fff">
          <div class="qr-main-code">${esc(code)}</div>
          <div class="hint" style="margin-top:4px">
            <b>扫这张</b>（21×21 模块，全系统最好扫）<br>
            手机自带相机扫 → 直接打开设备页；手机版 App 内「扫二维码」也认它
          </div>
        </div>
        <div class="qr-alt">
          <img id="qrImg" src="${urlQR(bases[0].base)}" width="150" height="150"
               alt="设备网址二维码" class="qr-alt-img"
               style="width:150px;height:150px;border-radius:10px;border:1px solid var(--border);background:#fff">
          <div class="hint" style="margin-top:6px">
            <b>备用：网址码</b>（37×37 模块，密得多）<br>
            <b>只用手机自带相机扫</b>。别用 App 内的「扫二维码」对着屏幕拍它 ——
            模块太密，10~20cm 也很难对上焦。
          </div>
        </div>
      </div>

      <div class="field" style="margin-top:16px">
        <label>二维码地址${help('手机要能访问这个地址。同 WiFi 选「局域网」，手机在外面选公网地址。')}</label>
        <select id="qrBase">${bases.map((b, i) => `<option value="${esc(b.base)}" ${i === 0 ? 'selected' : ''}>${esc(b.label)}</option>`).join('')}</select>
        <div class="mono" id="qrUrlText" style="font-size:11.5px;color:var(--text-3);word-break:break-all;margin-top:6px">${esc(url)}</div>
      </div>

      <div class="hint" style="margin-top:12px">
        左边的码比右边小得多（21×21 vs 37×37 模块），所以<b>好扫得多</b>。
        贴在设备上的标签也建议印左边这个 + 把资产编号印成文字。<br>
        两个码手机端「扫码核对」都认：左码走资产编号查询，右码直接带设备号跳转。<br>
        手机连同一个 WiFi 就选「局域网」，手机在外面就选公网地址。
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn ghost" onclick="goMobileScan()">用手机版扫码核对</button>
      <button class="btn ghost" onclick="printQRSheet('${d.id}')">打印标签</button>
      <button class="btn primary" onclick="closeModal()">关闭</button>
    </div>`, { wide: true });

  // 手机浏览器打开电脑端页面时，直接把「这里扫不了码」说清楚，
  // 省得用户对着这个页面反复按快门、以为是自己没对准。
  const tip = $('#qrMobileTip');
  if (tip) tip.hidden = !(window.innerWidth <= 900);

  $('#qrBase').onchange = (e) => {
    const u = `${e.target.value}/m/#/device/${d.id}`;
    $('#qrImg').src = urlQR(e.target.value);
    $('#qrUrlText').textContent = u;
  };
}

/** 从电脑端页面切到手机版「扫码核对」—— 手机浏览器上这个页面调不了摄像头 */
function goMobileScan() {
  location.href = '/m#/scan';
}
// ⚠️ 必须挂 window：详情卡与二维码弹窗里都是内联 onclick="goMobileScan()"，
//    漏掉就是两个按钮都点了没反应（不报错、控制台干净）。见 MEMORY.md 铁律 10。
window.goMobileScan = goMobileScan;

/**
 * 打印「设备标签」用的独立页面。
 * 存在的理由：管理端页面在手机上不能调摄像头，那就把码**印出来贴到设备上**，
 * 之后用手机版「扫码核对」对着实体标签扫 —— 这条链路才是稳的。
 * 标签里同时印二维码和资产编号文字（码糊了还能手输）。
 */
window.printQRSheet = async (id) => {
  const d = await api('/devices/' + id);
  const code = qrShortCode(d);
  const short = `/api/qrcode?text=${encodeURIComponent(code)}&ec=M`;
  const w = window.open('', '_blank');
  if (!w) { toast('浏览器拦截了弹窗，请允许后重试', 'warn'); return; }
  w.document.write(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
    <title>设备标签 ${esc(code)}</title>
    <style>
      body{font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;margin:0;padding:24px}
      .sheet{display:flex;gap:20px;align-items:center;border:1px solid #ddd;border-radius:12px;padding:18px;max-width:520px}
      img{width:180px;height:180px}
      .t{font-size:13px;color:#555;line-height:1.7}
      .code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:20px;font-weight:600;color:#111}
      @media print{ .noprint{display:none} }
    </style></head><body>
    <div class="sheet">
      <img src="${short}" alt="二维码">
      <div class="t">
        <div class="code">${esc(code)}</div>
        <div>${esc(d.brand || '')} ${esc(d.model || '')}</div>
        <div>SN：${esc(d.sn || '—')}</div>
        <div>使用人：${esc(d.owner_name || '—')}</div>
        <div>用「IT 资产」手机版扫码核对，或手机自带相机扫码</div>
      </div>
    </div>
    <p class="noprint" style="margin-top:16px"><button onclick="window.print()">打印</button></p>
    </body></html>`);
  w.document.close();
};

let qrBaseCache = null;

/** 二维码里可以用的地址：当前访问地址优先，其次局域网（手机同 WiFi 能开） */
async function qrBases() {
  if (qrBaseCache) return qrBaseCache;
  const out = [];
  const push = (label, base) => {
    const b = String(base || '').replace(/\/+$/, '');
    if (!b || out.some((x) => x.base === b)) return;
    out.push({ label: `${label} · ${b}`, base: b });
  };
  const origin = location.origin;
  const isLoopback = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(origin);
  if (!isLoopback) push('当前访问地址', origin);
  // 服务端知道自己的局域网 IP，借实时链接接口拿一份
  try {
    const live = state.liveLinks || await api('/excel/live-links');
    state.liveLinks = live;
    for (const b of (live.bases || [])) {
      if (/局域网/.test(b.label)) push('局域网', b.base);
    }
  } catch { /* 没有权限或离线，退回到当前地址 */ }
  if (isLoopback) push('当前访问地址', origin);
  if (!out.length) push('当前访问地址', origin);
  qrBaseCache = out;
  return out;
}

/* ---------- 导出 ---------- */
let exporting = false;

/**
 * 老设备的照片是在「缩略图」功能之前拍/传的，只有一张 1600px 的压缩图（约 150 KB）。
 * 导出时只能拿它当嵌图，几十台就是好几 MB，又大又慢。
 * 这里在浏览器里把它们批量缩成 320px 的小图回传，导出体积能降到十分之一。
 */
async function backfillThumbs() {
  const btn = $('#btnBackfill');
  let items = [];
  try {
    const page = await api('/devices?page_size=200&sort=asset_no&order=asc');
    items = (page.items || []).filter((d) => d.photo_path && !d.photo_thumb_path);
  } catch (e) { toast('读取设备失败：' + e.message, 'error'); return; }

  if (!items.length) { toast('所有有照片的设备都已经有缩略图了', 'warn'); return; }
  if (!(await confirmBox('生成缩略图', `有 ${items.length} 台设备还没有缩略图。\n现在为它们生成 320px 小图？\n\n生成后导出的 Excel 会小很多、下载也快。`))) return;

  if (btn) { btn.disabled = true; btn.textContent = `生成中 0/${items.length}…`; }
  let ok = 0; let fail = 0;
  for (let i = 0; i < items.length; i++) {
    const d = items[i];
    try {
      const blob = await fetch(d.photo_path, { credentials: 'same-origin' }).then((r) => {
        if (!r.ok) throw new Error('照片取不回来 HTTP ' + r.status);
        return r.blob();
      });
      const img = await new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error('图片解码失败'));
        im.src = URL.createObjectURL(blob);
      });
      const thumb = await downscaleBlob(img, 320, 0.7);
      URL.revokeObjectURL(img.src);
      if (!thumb) throw new Error('缩放失败');

      const fd = new FormData();
      fd.append('file', thumb, `thumb-${d.asset_no}.jpg`);
      fd.append('dir', 'thumbs');
      const up = await api('/upload', { method: 'POST', body: fd });
      await api('/devices/' + d.id, { method: 'PUT', body: JSON.stringify({ photo_thumb_path: up.path }) });
      ok++;
    } catch (e) {
      fail++;
      console.warn('缩略图失败', d.asset_no, e.message);
    }
    if (btn) btn.textContent = `生成中 ${i + 1}/${items.length}…`;
  }
  if (btn) { btn.disabled = false; btn.innerHTML = svgIcon('image') + ' 为老照片补缩略图'; }
  toast(`缩略图完成：成功 ${ok} 台${fail ? `，失败 ${fail} 台` : ''}`);
  renderExcel();
}

/** 等比缩放到最长边 maxSide 的 JPEG Blob（浏览器端，不依赖服务端图像库） */
function downscaleBlob(img, maxSide, quality) {
  return new Promise((resolve) => {
    try {
      const sw = img.naturalWidth || img.width;
      const sh = img.naturalHeight || img.height;
      if (!sw || !sh) { resolve(null); return; }
      const scale = Math.min(1, maxSide / Math.max(sw, sh));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(sw * scale));
      canvas.height = Math.max(1, Math.round(sh * scale));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
    } catch { resolve(null); }
  });
}

/**
 * 导出 Excel
 *   doExport({ all: true })   全部导出（忽略当前筛选）
 *   doExport({ ids: [...] })  只导出勾选的这几台
 *   doExport()                按当前筛选条件导出（Excel 对接页用）
 */
async function doExport(opts = {}) {
  if (exporting) { toast('上一份还在生成，稍等一下…', 'warn'); return; }
  // 三种来源：{ all:true } 全部 / { ids:[...] } 勾选的若干台 / 啥都不传 = 当前筛选结果。
  // ⚠️ 「全选匹配」模式下传进来的是 { all_matching:true, query:{...} } —— 语义上就是
  //    「当前筛选结果」，所以这里必须**忽略 all_matching 的 query 而用页面上最新的 state.devicesQuery**，
  //    否则用户在勾选之后又改了筛选（例如换了搜索词）导出的还是旧条件。
  const hasIds = Array.isArray(opts.ids) && opts.ids.length > 0;
  const q = opts.all || hasIds ? {} : (state.devicesQuery || {});
  const params = new URLSearchParams();
  if (hasIds) {
    params.set('ids', opts.ids.join(','));
  } else {
    if (q.keyword) params.set('keyword', q.keyword);
    if (q.category_id) params.set('category_id', q.category_id);
    if (q.org_id) params.set('org_id', q.org_id);
    if (q.status) params.set('status', q.status);
    if (q.brand) params.set('brand', q.brand);
    if (q.supplier) params.set('supplier', q.supplier);
  }
  if (opts.split) params.set('split', '1');
  if (opts.photos === false) params.set('photos', '0');
  // Excel 对接页把「不含说明页」收成了开关；这里必须转成查询参数，
  // 否则开关是死的（服务端按 q.help !== '0' 判断）。
  if (opts.help === false) params.set('help', '0');

  const url = `/api/excel/export?${params.toString()}`;
  const withPhotos = opts.photos !== false;
  const withHelp = opts.help !== false;
  const scope = hasIds ? `所选 ${opts.ids.length} 台` : (opts.all ? '全部设备' : '当前筛选结果');
  exporting = true;
  const t = toast(`正在导出${scope}${withPhotos ? '（含照片，可能要几秒）' : ''}${withHelp ? '' : '（不含说明页）'}…`);

  // 先自己拉一次：能拿到字节就说明服务端没问题，
  // 再用 Blob 触发下载。这样即使中途出问题也能给出明确提示，
  // 而不是浏览器里一个含糊的「网络问题」。
  try {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) {
      let msg = `导出失败（HTTP ${res.status}）`;
      try { const j = await res.json(); msg = j.error || msg; } catch { /* ignore */ }
      throw new Error(msg);
    }
    const blob = await res.blob();
    if (!blob.size) throw new Error('服务端返回了空文件');

    // 文件名优先用服务端给的，拿不到就自己拼一个（一定要带 .xlsx 后缀）
    const cd = res.headers.get('content-disposition') || '';
    const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
    const plain = /filename="([^"]+)"/i.exec(cd);
    let name = star ? decodeURIComponent(star[1]) : (plain ? decodeURIComponent(plain[1]) : '');
    if (!name) {
      const tag = hasIds ? '（所选）' : (opts.split ? '（分类分表）' : '');
      name = `IT资产台账${tag}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    }

    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = name;
    a.rel = 'noopener';
    a.style.display = 'none';
    // 必须挂进文档，否则某些浏览器会中途放弃下载
    if (document.body) {
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { a.remove(); URL.revokeObjectURL(objUrl); }, 60000);
    } else {
      a.click();
      setTimeout(() => URL.revokeObjectURL(objUrl), 60000);
    }

    toast(`已开始下载 ${name}（${(blob.size / 1024 / 1024).toFixed(1)} MB）`);
    return { name, size: blob.size };
  } catch (e) {
    toast(e.message || '导出失败', 'error');
    return null;
  } finally {
    exporting = false;
    if (t && t.remove) setTimeout(() => t.remove(), 500);
  }
}

/* ================= 组织架构 ================= */
async function renderOrgs() {
  const data = await api('/orgs');
  state.orgsData = data;
  const flat = data.flat;
  $('#content').innerHTML = `
    <div class="card">
      <div class="toolbar">
        <h3 style="margin:0;flex:1">组织架构树</h3>
        <button class="btn primary" onclick="openOrgForm()">＋ 新增组织</button>
      </div>
      <div class="split">
        <div><ul class="tree" id="orgTree">${treeHTML(data.tree)}</ul></div>
        <div>
          <div class="table-wrap"><table class="grid">
            <thead><tr><th>组织</th><th>类型</th><th>编码</th><th>负责人</th><th>设备数</th><th>操作</th></tr></thead>
            <tbody>${flat.map((o) => `
              <tr><td style="padding-left:${o.depth * 18 + 13}px">${esc(o.name)}</td>
              <td>${esc(typeLabel(o.type))}</td><td class="mono">${esc(o.code || '—')}</td>
              <td>${esc(o.manager || '—')}</td>
              <td><b>${o.device_count ?? 0}</b></td>
              <td><div class="row-actions">
                <button class="btn xs" onclick="openOrgForm('${o.id}')">编辑</button>
                <button class="btn xs ghost" onclick="delOrg('${o.id}','${esc(o.name)}')">删除</button>
              </div></td></tr>`).join('')}</tbody>
          </table></div>
        </div>
      </div>
    </div>`;
  $$('#orgTree .tree-node').forEach((n) => n.onclick = (e) => {
    e.stopPropagation();
    const li = n.parentElement;
    const ul = li.querySelector('ul');
    if (ul) { ul.hidden = !ul.hidden; n.querySelector('.arrow').classList.toggle('open', !ul.hidden); }
  });
}

const typeLabel = (t) => ({ group: '集团', company: '公司', department: '部门', team: '小组', other: '其它' }[t] || t);

function treeHTML(nodes) {
  return nodes.map((n) => `
    <li><div class="tree-node">
      <span class="arrow ${n.children?.length ? 'open' : ''}">${svgIcon('chevron', 13)}</span>
      <span class="nm">${esc(n.name)}</span>
      <span class="cnt">${n.device_count ?? 0} 台</span>
    </div>${n.children?.length ? `<ul>${treeHTML(n.children)}</ul>` : ''}</li>`).join('');
}

function openOrgForm(id) {
  const cur = id ? state.orgsData.flat.find((o) => o.id === id) : null;
  const types = state.options.org_types;
  const parentOpts = `<option value="">（无，作为根组织）</option>` + state.orgsData.flat
    .filter((o) => o.id !== id).map((o) => `<option value="${o.id}" ${cur?.parent_id === o.id ? 'selected' : ''}>${esc(o.path)}</option>`).join('');
  openModal(`<div class="modal-head"><h2>${cur ? '编辑组织' : '新增组织'}</h2><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="field"><label>组织名称 <span class="req">*</span></label><input id="oName" value="${esc(cur?.name || '')}" placeholder="如 信息技术部"></div>
      <div class="field"><label>上级组织</label><select id="oParent">${parentOpts}</select></div>
      <div class="form-grid">
        <div class="field"><label>类型</label><select id="oType">${types.map((t) => `<option value="${t.id}" ${cur?.type === t.id ? 'selected' : ''}>${t.label}</option>`).join('')}</select></div>
        <div class="field"><label>编码</label><input id="oCode" value="${esc(cur?.code || '')}"></div>
        <div class="field"><label>负责人</label><input id="oManager" value="${esc(cur?.manager || '')}"></div>
        <div class="field"><label>电话</label><input id="oPhone" value="${esc(cur?.phone || '')}"></div>
        <div class="field full"><label>位置</label><input id="oLocation" value="${esc(cur?.location || '')}"></div>
        <div class="field full"><label>备注</label><textarea id="oRemark">${esc(cur?.remark || '')}</textarea></div>
      </div>
    </div>
    <div class="modal-foot"><button class="btn" onclick="closeModal()">取消</button><button class="btn primary" id="orgSave">保存</button></div>`, { slim: true });
  $('#orgSave').onclick = async () => {
    const payload = {
      name: $('#oName').value.trim(), parent_id: $('#oParent').value || null, type: $('#oType').value,
      code: $('#oCode').value.trim(), manager: $('#oManager').value.trim(), phone: $('#oPhone').value.trim(),
      location: $('#oLocation').value.trim(), remark: $('#oRemark').value.trim(),
    };
    try {
      if (cur) await api('/orgs/' + cur.id, { method: 'PUT', body: JSON.stringify(payload) });
      else await api('/orgs', { method: 'POST', body: JSON.stringify(payload) });
      toast('已保存');
      closeModal();
      renderOrgs();
    } catch (e) { toast(e.message, 'error'); }
  };
}

async function delOrg(id, name) {
  if (await confirmBox('删除组织', `确定删除「${name}」吗？`)) {
    try {
      await api('/orgs/' + id, { method: 'DELETE' });
      toast('已删除');
      renderOrgs();
    } catch (e) { toast(e.message, 'error'); }
  }
}

/* ================= 设备分类 ================= */
async function renderCategories() {
  const data = await api('/categories');
  state.catsData = data;
  $('#content').innerHTML = `
    <div class="card">
      <div class="toolbar"><h3 style="margin:0;flex:1">设备分类（${data.items.length}）</h3>
        <button class="btn primary" onclick="openCatForm()">${svgIcon('plus')} 新增分类</button></div>
      <div class="grid grid-cards">
        ${data.items.map((c) => `
          <div class="card" style="border-left:3px solid ${c.color}">
            <div style="display:flex;align-items:center;gap:12px">
              <div class="cat-ico">${iconOf(c.icon, 22)}</div>
              <div style="flex:1">
                <div style="font-weight:700;font-size:15px">${esc(c.name)}</div>
                <div class="muted" style="font-size:12px">编号前缀 <span class="mono">${esc(c.code_prefix || '—')}</span> · ${c.device_count} 台</div>
              </div>
            </div>
            <div class="muted" style="font-size:12px;margin:10px 0 0">专属字段：${(c.tracking_fields || []).map((t) => t.label).join('、') || '无'}</div>
            <div style="display:flex;gap:8px;margin-top:12px">
              <button class="btn sm" onclick="openCatForm('${c.id}')">编辑</button>
              <button class="btn sm ghost" onclick="delCat('${c.id}','${esc(c.name)}')">删除</button>
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

function openCatForm(id) {
  const cur = id ? state.catsData.items.find((c) => c.id === id) : null;
  const icons = state.options.icons;
  const fields = cur?.tracking_fields || [];
  openModal(`<div class="modal-head"><h2>${cur ? '编辑分类' : '新增分类'}</h2><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="field"><label>名称 <span class="req">*</span></label><input id="cName" value="${esc(cur?.name || '')}" placeholder="如 显示器"></div>
        <div class="field"><label>编码</label><input id="cCode" value="${esc(cur?.code || '')}" placeholder="MON"></div>
        <div class="field"><label>资产编号前缀</label><input id="cPrefix" value="${esc(cur?.code_prefix || '')}" placeholder="MON"></div>
        <div class="field full"><label>图标</label>
          <input type="hidden" id="cIcon" value="${esc(cur?.icon || '')}">
          <div class="icon-grid" id="cIconGrid">
            ${icons.map((i) => `<button type="button" data-icon="${i}" title="${i}">${iconOf(i, 19)}</button>`).join('')}
          </div></div>
        <div class="field full"><label>主题色</label><input type="text" id="cColor" value="${cur?.color || 'var(--primary)'}">
          <input type="color" id="cColorPick" value="${cur?.color || 'var(--primary)'}" style="width:44px;height:36px;padding:2px;margin-left:8px;cursor:pointer"></div>
        <div class="field full"><label>专属字段${help('这个分类特有的属性，在电脑端和手机端录入时都会自动出现。')}</label>
          <div id="trackFields">${fields.map((f, i) => trackFieldHTML(i, f)).join('')}</div>
          <button class="btn sm" id="addTrack" style="margin-top:8px">＋ 添加字段</button></div>
      </div>
    </div>
    <div class="modal-foot"><button class="btn" onclick="closeModal()">取消</button><button class="btn primary" id="catSave">保存</button></div>`, { wide: true });
  $('#cColorPick').oninput = (e) => $('#cColor').value = e.target.value;
  $('#cColor').oninput = (e) => $('#cColorPick').value = e.target.value;
  $('#addTrack').onclick = () => { $('#trackFields').insertAdjacentHTML('beforeend', trackFieldHTML(Date.now(), { key: '', label: '', type: 'text' })); };
  // 图标选择器：点一下即选中，值写进隐藏 input（原生 <option> 放不了 SVG）
  const iconBtns = $$('#cIconGrid button');
  const syncIconSel = () => iconBtns.forEach((b) => b.classList.toggle('on', b.dataset.icon === $('#cIcon').value));
  iconBtns.forEach((b) => b.onclick = () => { $('#cIcon').value = b.dataset.icon; syncIconSel(); });
  syncIconSel();
  $('#catSave').onclick = async () => {
    const fields = $$('#trackFields .track-row').map((r) => {
      const type = $(`.tf-type`, r).value;
      const optsRaw = $(`.tf-opts`, r)?.value || '';
      const options = optsRaw.split(/[,，、;；\n]+/).map((s) => s.trim()).filter(Boolean);
      const f = {
        key: $(`.tf-key`, r).value.trim(),
        label: $(`.tf-label`, r).value.trim(),
        type,
      };
      if (type === 'select' && options.length) f.options = options;
      return f;
    }).filter((f) => f.key);
    const payload = { name: $('#cName').value.trim(), code: $('#cCode').value.trim(), code_prefix: $('#cPrefix').value.trim(), icon: $('#cIcon').value, color: $('#cColor').value, tracking_fields: fields };
    try {
      if (cur) await api('/categories/' + cur.id, { method: 'PUT', body: JSON.stringify(payload) });
      else await api('/categories', { method: 'POST', body: JSON.stringify(payload) });
      toast('已保存');
      closeModal();
      renderCategories();
    } catch (e) { toast(e.message, 'error'); }
  };
}

function trackFieldHTML(i, f) {
  const isSel = f.type === 'select';
  return `<div class="track-row" style="display:flex;gap:8px;margin-bottom:8px;align-items:center;flex-wrap:wrap">
    <input class="tf-key" placeholder="字段 key" value="${esc(f.key)}" style="flex:1;min-width:110px" title="数据库字段标识（英文）">
    <input class="tf-label" placeholder="显示名" value="${esc(f.label)}" style="flex:1.2;min-width:110px" title="录入界面显示的名称">
    <select class="tf-type" style="width:104px" onchange="this.parentElement.querySelector('.tf-opts').style.display = (this.value === 'select' ? '' : 'none')">
      <option value="text" ${f.type === 'text' ? 'selected' : ''}>文本</option>
      <option value="number" ${f.type === 'number' ? 'selected' : ''}>数字</option>
      <option value="date" ${f.type === 'date' ? 'selected' : ''}>日期</option>
      <option value="select" ${isSel ? 'selected' : ''}>下拉选项</option>
    </select>
    <input class="tf-opts" placeholder="选项，逗号分隔，如：24寸,27寸" value="${esc((f.options || []).join(', '))}" style="flex:1.8;min-width:150px;${isSel ? '' : 'display:none'}">
    <button class="btn xs ghost" onclick="this.parentElement.remove()">${svgIcon('x', 13)}</button></div>`;
}

async function delCat(id, name) {
  if (await confirmBox('删除分类', `确定删除「${name}」分类吗？`)) {
    try { await api('/categories/' + id, { method: 'DELETE' }); toast('已删除'); renderCategories(); }
    catch (e) { toast(e.message, 'error'); }
  }
}

/* ================= Excel 对接 =================
 * 三个分区，一个分区一件事：**导出 / 导入 / 实时链接**，顺序按使用频率排。
 *
 * 三条精简原则（改这一块时请继续遵守）：
 *   1. **长的步骤说明收进 <details>** —— 原生折叠、不依赖 JS，别让一屏铺几十行字；
 *   2. **同一条提醒只写一遍** —— WPS 不认 CSV、每个分类一个工作表这类话，
 *      两个弹窗都要用就抽成常量（见 WPS_WARN_HTML / MULTI_SHEET_TIP）；
 *   3. **别把同一件事做成两个按钮** —— 导出原来 4 个平级按钮里有两个是重复入口，
 *      现在收成「3 个开关 + 1 个按钮」。
 */

/** 「实时链接」相关的两条通用提醒 —— showLiveGuide / showMultiSheetGuide 共用，别再各写一遍 */
const WPS_WARN_HTML = '<div class="hint" style="background:var(--warn-bg);border:1px solid var(--warn-border);color:var(--warn-text);padding:11px 13px;border-radius:10px">' +
  'WPS 的「自网站」<b>只认网页里的表格，不认 CSV</b>，粘 CSV 链接会报「<b>无法获取数据</b>」。<br>' +
  '请把「链接格式」保持为 <b>网页表格 · WPS / Excel 通用</b> 再复制链接。<br>' +
  '若仍失败：把链接<b>先粘到浏览器地址栏回车</b> —— 能看到表格页说明链接没问题（是 WPS 取数方式的问题）；' +
  '打不开则说明地址选错了，把「取数地址」换成 <b>本机</b> 或 <b>局域网</b> 那个。</div>';

/** 弹窗里的小节标题样式 —— 原来 `font-size:15px;margin:22px 0 8px` 在弹窗里抄了 6 遍 */
const H3_STEP = 'font-size:15px;margin:22px 0 8px';

/** 弹窗里只读链接框的样式 —— showLiveGuide / showMultiSheetGuide 共用 */
const TA_LINK = 'width:100%;height:70px;font-family:monospace;font-size:12px';

/** 导出方式两种口径的对照 —— 只在导出卡片里出现一次 */
const EXPORT_KINDS_HTML =
  '<div class="table-wrap"><table class="grid">' +
  '<thead><tr><th>做法</th><th>Excel 里的样子</th><th>数据会自动更新吗</th></tr></thead><tbody>' +
  '<tr><td><b>快照导出</b><br><span class="muted" style="font-size:12px">本卡片的按钮</span></td>' +
  '<td><b>照片直接嵌在单元格里</b>，打开就看到图，另带两个可点链接</td>' +
  '<td>不会（导完就固定，要新的再导一次）</td></tr>' +
  '<tr><td><b>实时数据链接</b><br><span class="muted" style="font-size:12px">本页第 3 个分区</span></td>' +
  '<td>文字列「照片链接」= 点一下就打开浏览器看图</td>' +
  '<td><b>会</b>（按 F5 / 打开文件自动拉最新）</td></tr>' +
  '</tbody></table></div>' +
  '<div class="hint" style="margin-top:10px"><b>既想自动更新又想看图</b>？用实时链接导入后，' +
  '在表格里<b>自己加一列</b>填 <code>=IMAGE(照片链接所在单元格)</code> 即可' +
  '（Excel 365 / 较新版 WPS 支持），刷新时图片会跟着变。</div>';

/**
 * 导出卡片。三个开关 + 一个按钮，取代原来 4 个平级按钮：
 *   原来用户在「按分类分表 / 单表导出 / 不含照片 / 不含说明页」之间要自己组合，
 *   而这四者其实是**两个维度**（是否分表、是否带照片、是否带说明页），
 *   写成开关后语义直接对上，也不会再出现"导出了两次才发现点错"。
 */
function exportCardHTML() {
  return `
    <div class="card">
      <h3>${svgIcon('upload')} 导出到 Excel${help('导出的是当前台账的快照，文件自带照片（图片直接嵌在单元格里）。适合打印、存档、发给别人。想让数据自动更新，用下面的「实时数据链接」。')}</h3>

      <div class="opt-list" style="margin-bottom:12px">
        <label><input type="checkbox" id="expSplit" checked> 按分类分表<span class="muted">台式主机 / 显示器…各一个工作表，另附数量汇总页</span></label>
        <label><input type="checkbox" id="expPhotos" checked> 含照片<span class="muted">取消后文件小得多（几十台从几 MB 降到几十 KB）</span></label>
        <label><input type="checkbox" id="expHelp" checked> 含说明页<span class="muted">附带「字段说明 / 设备分类 / 组织架构」三张辅助表</span></label>
      </div>

      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <button class="btn primary" onclick="doExportExcel()">${svgIcon('sheet')} 导出</button>
        <button class="btn" id="btnBackfill" onclick="backfillThumbs()">${svgIcon('image')} 补缩略图</button>
        ${help('「补缩略图」：早期录的设备只有 1600px 大图（每张约 150 KB），几十台就是好几 MB。\n点它在浏览器里批量生成 320px 小图，之后导出的体积能降到十分之一、下载也快得多。')}
      </div>

      <details style="margin-top:14px">
        <summary style="cursor:pointer;font-size:13px;color:var(--text-2);font-weight:600">照片的两种给法有什么区别？</summary>
        <div style="margin-top:10px">${EXPORT_KINDS_HTML}</div>
      </details>
    </div>`;
}

/** 导入卡片 */
function importCardHTML() {
  return `
    <div class="card">
      <h3>${svgIcon('download')} 从 Excel 导入</h3>
      <p class="muted" style="margin-top:0">
        下载模板填写后上传；系统按<b>表头</b>智能匹配列、按<b>名称</b>匹配组织与分类，同 SN 自动去重（走更新）。
        模板主表本身不含数据（避免示例被误导入），填写格式参考「<b>填写示例</b>」页，数据填在「<b>设备台账</b>」页第 3 行起。
      </p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <button class="btn" onclick="location.href='/api/excel/template'">${svgIcon('download')} 下载导入模板</button>
        <button class="btn primary" onclick="$('#importFile').click()">${svgIcon('upload')} 选择文件导入</button>
        <input type="file" id="importFile" accept=".xlsx,.xls" hidden>
      </div>
      <div class="opt-list" style="margin-top:12px">
        <label><input type="checkbox" id="impCreate" checked> 自动创建缺失的组织 / 分类
          ${help('关掉后，表格里出现台账里没有的组织名或分类名时，该行会被跳过并记进「失败」，不会凭空建出新分类。')}</label>
        <label><input type="checkbox" id="impUpdate" checked> 遇到同 SN 时更新已有设备
          ${help('关掉后，同 SN 的行被当作重复直接忽略（既不新建也不更新）。\n想只补空字段、不动人工填过的值，保持开启即可。')}</label>
      </div>
    </div>`;
}

/** 导入历史（无记录时给一句空态，不再在 renderExcel 里写三元表达式） */
function importHistoryHTML(batches) {
  if (!batches.length) {
    return '<div class="card" style="margin-top:16px"><h3>导入历史</h3><div class="muted">暂无导入记录</div></div>';
  }
  const rows = batches.map((b) => `<tr>
    <td class="muted" data-label="时间">${esc((b.created_at || '').replace('T', ' ').slice(0, 16))}</td>
    <td data-label="文件">${esc(b.filename || '—')}</td>
    <td class="num" data-label="总数">${b.total}</td>
    <td class="num" data-label="成功" style="color:var(--green)">${b.success}</td>
    <td class="num" data-label="失败" style="color:${b.failed ? 'var(--red)' : 'var(--text-3)'}">${b.failed}</td>
    <td class="muted" data-label="错误摘要">${esc((b.errors || []).slice(0, 2).map((e) => `第${e.row}行: ${e.message}`).join('；'))}</td>
  </tr>`).join('');
  return `<div class="card" style="margin-top:16px">
    <h3>导入历史</h3>
    <div class="table-wrap"><table class="grid">
      <thead><tr><th>时间</th><th>文件</th><th>总数</th><th>成功</th><th>失败</th><th>错误摘要</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </div>`;
}

async function renderExcel() {
  // 两个接口互不依赖，并发拉；任一失败都不该把整页打挂 —— 历史为空就当作「暂无记录」
  const [batches, live] = await Promise.all([
    api('/excel/batches?limit=20').then((d) => d.items).catch(() => []),
    api('/excel/live-links').catch(() => null),
  ]);
  state.liveLinks = live;

  $('#content').innerHTML = `
    <div class="grid grid-2">
      ${exportCardHTML()}
      ${importCardHTML()}
    </div>

    ${live ? liveCardHTML(live) : ''}

    ${importHistoryHTML(batches)}`;

  bindExcelEvents();
  renderLiveTable();
}

/** 导出卡片上三个开关 → doExport 的选项。**不改 doExport 签名**（它在设备列表页也被调用）。 */
function doExportExcel() {
  return doExport({
    split: $('#expSplit')?.checked !== false,
    photos: $('#expPhotos')?.checked !== false,
    help: $('#expHelp')?.checked !== false,
  });
}

/** renderExcel 之后的所有事件绑定集中一处（原来散在函数末尾） */
function bindExcelEvents() {
  const f = $('#importFile');
  if (f) f.onchange = (e) => handleImport(e.target.files[0]);

  const baseSel = $('#liveBase');
  const fmtSel = $('#liveFmt');
  if (baseSel) baseSel.onchange = renderLiveTable;
  if (fmtSel) fmtSel.onchange = renderLiveTable;
  const guideBtn = $('#btnLiveGuide');
  if (guideBtn) guideBtn.onclick = showLiveGuide;
  const resetBtn = $('#btnResetLive');
  if (resetBtn) resetBtn.onclick = resetLiveToken;
}

/** 实时数据链接卡片（地址可选 + 格式可选） */
function liveCardHTML(live) {
  const bases = live.bases || [];
  if (!bases.length) return '';
  return `
    <div class="card" style="margin-top:16px;border-color:var(--primary-border)">
      <h3>${svgIcon('refresh')} Excel / WPS 实时数据链接
        ${help('链接里带一个只读令牌，拿到链接的人就能读到设备台账字段（不含密码、密钥、登录信息）。\n换电脑、换网络环境用不了，或者链接被发到了不该发的地方，点「重置链接」即可让所有旧链接立刻失效。')}</h3>
      <p class="muted" style="margin-top:0">
        把下面的链接接成数据源，之后<b>每次刷新就能拉到最新台账</b>（可设置「打开文件时刷新」）。
        只读、只暴露设备台账字段，不含任何密钥。
      </p>
      <div class="toolbar" style="margin-bottom:12px">
        <label style="font-size:13px;color:var(--text-2);font-weight:600">取数地址${help('Excel 装在另一台电脑时，必须选一个对方访问得到的地址（局域网 IP 或公网域名）。\n选错了的表现是表格里报「无法获取数据」——把链接粘到浏览器地址栏试试就知道是不是这个问题。')}</label>
        <select id="liveBase" style="width:330px">
          ${bases.map((b, i) => `<option value="${i}">${esc(b.label)}</option>`).join('')}
        </select>
        <label style="font-size:13px;color:var(--text-2);font-weight:600;margin-left:8px">链接格式</label>
        <select id="liveFmt" style="width:230px">
          <option value="html">网页表格 · WPS / Excel 通用（推荐）</option>
          <option value="csv">CSV · Excel 用（WPS 可能不认）</option>
        </select>
        <span style="flex:1"></span>
        <button class="btn" id="btnLiveGuide">${svgIcon('book')} 配置步骤</button>
        <button class="btn danger" id="btnResetLive">${svgIcon('refresh')} 重置链接</button>
      </div>

      <div style="background:var(--info-bg);border:1px solid var(--info-border);border-radius:10px;padding:13px 15px;margin-bottom:14px">
        <div style="font-weight:600;color:var(--info-text);margin-bottom:4px">想让每个设备分类落在不同的工作表？</div>
        <div style="font-size:13px;color:var(--info-text);line-height:1.7">
          用下面这条「<b>全部分类（多表）</b>」链接 —— 它是一张含<b>多个表格</b>的页面。
          导入时在表格列表里<b>把表格全部勾选</b>，就能一次生成多张工作表（每个分类一张），
          不用一个分类建一次查询。
        </div>
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <button class="btn sm primary" onclick="copyLiveLink('workbook')">${svgIcon('copy')} 复制多表链接</button>
          <button class="btn sm" onclick="showMultiSheetGuide()">${svgIcon('book')} 怎么配？</button>
          <span class="muted" style="font-size:12px">当前共 ${bases[0]?.workbook?.tables ?? 0} 张表格</span>
        </div>
      </div>

      <div id="liveTable"></div>
    </div>`;
}

function renderLiveTable() {
  const live = state.liveLinks;
  const box = $('#liveTable');
  if (!live || !box) return;
  const bases = live.bases || [];
  const bi = Number($('#liveBase')?.value || 0);
  const fmt = $('#liveFmt')?.value || 'html';
  const b = bases[bi] || bases[0];
  if (!b) { box.innerHTML = '<div class="muted">没有可用的链接</div>'; return; }
  state.livePick = { base: b, fmt };

  box.innerHTML = `
    <div class="table-wrap"><table class="grid">
      <thead><tr><th>工作表名</th><th style="width:110px">设备数量</th><th style="width:180px">实时链接</th></tr></thead>
      <tbody>
        <tr>
          <td data-label="工作表名"><b>全部设备</b></td>
          <td class="num" data-label="设备数量">${b.all?.count ?? 0}</td>
          <td data-label="实时链接"><button class="btn xs primary" onclick="copyLiveLink('all')">${svgIcon('copy')} 复制链接</button></td>
        </tr>
        ${(b.sheets || []).map((s, i) => `
        <tr>
          <td data-label="工作表名">${esc(s.name)}</td>
          <td class="num" data-label="设备数量">${s.count}</td>
          <td data-label="实时链接"><button class="btn xs" onclick="copyLiveLink(${i})">${svgIcon('copy')} 复制链接</button></td>
        </tr>`).join('')}
      </tbody>
    </table></div>
    <div class="hint" style="margin-top:10px">
      链接来源：<span class="mono">${esc(b.base)}</span>${b.hint ? ` · <span class="muted">${esc(b.hint)}</span>` : ''}
    </div>`;
}

function copyLiveLink(which) {
  const pick = state.livePick;
  if (!pick) return;
  if (which === 'workbook') {
    const url = pick.base.workbook?.html;
    if (url) copyText(url, '「全部分类（多表）」链接');
    return;
  }
  const item = which === 'all' ? pick.base.all : pick.base.sheets?.[which];
  if (!item) return;
  const url = pick.fmt === 'html' ? item.html : item.csv;
  copyText(url, which === 'all' ? '「全部设备」链接' : `「${item.name}」链接`);
}

/** 多工作表配置说明（用户最关心的：每个分类一个 sheet） */
function showMultiSheetGuide() {
  const pick = state.livePick;
  const url = pick?.base?.workbook?.html || '';
  const n = pick?.base?.workbook?.tables ?? 0;

  openModal(`
    <div class="modal-head"><h2>让每个分类落在不同工作表</h2><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="hint" style="margin:0 0 14px;background:var(--primary-soft);border-left:3px solid var(--primary);padding:10px 12px;border-radius:0 8px 8px 0;color:var(--text-2)">
        当前选用地址：<b>${esc(pick?.base?.label || '—')}</b> · 共 <b>${n}</b> 张表格
      </div>

      <p style="margin-top:0">这条链接打开的页面里，<b>每个设备分类是一张独立的表格</b>。
      导入时把表格<b>全部勾选</b>，分别落到不同工作表即可。</p>

      <div class="hint" style="margin:0 0 14px;background:var(--green-soft);border-left:3px solid var(--green);padding:10px 12px;border-radius:0 8px 8px 0;color:var(--text-2)">
        每张表的<b>列也不一样</b>：按该分类在「设备分类 → 专属字段」里的配置来。
        所以<b>显示器那张表只有屏幕尺寸 / 分辨率 / 接口类型</b>，不会冒出 CPU、内存、硬盘、IMEI。
      </div>

      <textarea readonly style="${TA_LINK}">${esc(url)}</textarea>
      <div style="margin-top:8px"><button class="btn sm primary" onclick="copyText('${esc(url)}','多表链接')">${svgIcon('copy')} 复制多表链接</button></div>

      <h3 style="${H3_STEP}">Excel 做法</h3>
      <ol style="margin:0;padding-left:22px;line-height:2">
        <li>新建空白工作簿</li>
        <li><b>数据</b> → <b>获取数据</b> → <b>自其他源</b> → <b>自网站</b> → 粘贴上面的链接</li>
        <li>弹出的导航器里会列出多个表格 → <b>勾选全部</b>（按住 Ctrl 多选，或点表头全选）</li>
        <li>点 <b>加载</b> → 选「<b>每个表放入新工作表</b>」（或先「转换数据」逐个调整）</li>
      </ol>

      <h3 style="${H3_STEP}">WPS 做法</h3>
      <ol style="margin:0;padding-left:22px;line-height:2">
        <li>新建空白工作簿</li>
        <li><b>数据</b> → <b>获取数据 / 自网站</b> → 粘贴上面的链接 → 确定</li>
        <li>在表格列表里<b>全选</b> → 导入</li>
        <li>如果 WPS 把多张表都塞进了一个工作表，改用下面的「<b>逐个导入</b>」方式</li>
      </ol>

      <details style="margin-top:22px">
        <summary style="cursor:pointer;font-size:15px;font-weight:600;color:var(--text-1)">逐个导入（最稳，一定能成）</summary>
        <p style="margin:6px 0">回到实时链接列表，为<b>每个分类各建一次查询</b>，分别加载到不同工作表：</p>
        <ol style="margin:0;padding-left:22px;line-height:2">
        <li>在列表里点「台式主机」的 <b>复制链接</b></li>
        <li>数据 → 自网站 → 粘贴 → 加载 → 放到 <b>Sheet1</b>，并把 Sheet1 重命名为「台式主机」</li>
        <li>换成「显示器」的链接，重复一次，放到 <b>Sheet2</b>，重命名为「显示器」</li>
          <li>以后按 <b>数据 → 全部刷新</b>，所有工作表一起更新</li>
        </ol>
      </details>

      <div style="margin-top:16px">${WPS_WARN_HTML}</div>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="window.open('${esc(url)}','_blank')">${svgIcon('search')} 预览表格</button>
      <span style="flex:1"></span>
      <button class="btn primary" onclick="closeModal()">明白了</button>
    </div>`, { wide: true });
}
async function copyText(text, label = '内容') {
  try {
    if (navigator?.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else if (document.body) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    } else {
      throw new Error('无法访问剪贴板');
    }
    toast(`已复制${label}`);
  } catch (e) {
    openModal(`<div class="modal-head"><h2>手动复制</h2><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body"><p class="muted" style="margin-top:0">浏览器不允许自动复制，请手动全选复制：</p>
      <textarea readonly style="width:100%;height:110px;font-family:monospace;font-size:12px">${esc(text)}</textarea></div>
      <div class="modal-foot"><button class="btn primary" onclick="closeModal()">知道了</button></div>`, { slim: true });
  }
}

/** 在 Excel 里配置实时刷新的步骤说明 */
function showLiveGuide() {
  const pick = state.livePick;
  const item = pick?.base?.all;
  const url = pick?.fmt === 'csv' ? item?.csv : item?.html;
  const isWps = pick?.fmt !== 'csv';
  const link = url || '';

  openModal(`
    <div class="modal-head"><h2>在 Excel / WPS 里配置「自动刷新」</h2><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="hint" style="margin:0 0 14px;background:var(--primary-soft);border-left:3px solid var(--primary);padding:10px 12px;border-radius:0 8px 8px 0;color:var(--text-2)">
        当前选用：<b>${esc(pick?.base?.label || '—')}</b> ·
        <b>${isWps ? '网页表格格式（WPS/Excel 通用）' : 'CSV 格式（Excel 用）'}</b>
      </div>

      <h3 style="font-size:15px;margin:0 0 8px">通用配置步骤</h3>
      <p style="margin-top:0"><b>1.</b> 新建一个空白工作簿</p>
      <p><b>2.</b> Excel：菜单 <b>数据</b> → <b>获取数据</b> → <b>自其他源</b> → <b>自网站</b><br>
         WPS：菜单 <b>数据</b> → <b>获取数据</b> / <b>自网站</b></p>
      <p><b>3.</b> 粘贴下面链接 → 确定 → 在导航器里选 <b>Table</b> → 点「加载」／「导入」</p>
      <textarea readonly style="${TA_LINK}">${esc(link)}</textarea>
      <div style="margin-top:8px"><button class="btn sm" onclick="copyText('${esc(link)}','链接')">${svgIcon('copy')} 复制链接</button></div>

      <h3 style="${H3_STEP}">让它自动刷新</h3>
      <p style="margin:0 0 6px">在生成的数据表上右键 → <b>表格</b> → <b>外部数据属性</b>（或「数据范围属性」）→ 勾选：</p>
      <ul style="margin:0;padding-left:22px;line-height:2">
        <li>打开文件时刷新数据</li>
        <li>每 <b>30</b> 分钟刷新一次（按需调整）</li>
      </ul>

      <details style="margin-top:22px">
        <summary style="cursor:pointer;font-size:15px;font-weight:600;color:var(--text-1)">WPS 用户必看 / 每个分类一个工作表</summary>
        <div style="margin-top:10px">
          ${WPS_WARN_HTML}
          <h3 style="${H3_STEP}">每个分类一个工作表</h3>
          <p style="margin:0">把链接换成对应分类的链接（在列表里点「复制」），每个分类重复一次第 2~3 步，然后分别设置刷新即可。</p>
          <div class="hint" style="margin-top:16px">
            选 <b>CSV 格式</b> 时 Excel 的数字/日期会更规整，但纯数字 SN 可能被识别成科学计数法
            （遇到就在 Power Query 里把那列类型改成「文本」）。网页表格格式不会有这个问题，但所有列都会是文本。
          </div>
        </div>
      </details>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="window.open('${esc(link)}','_blank')">${svgIcon('search')} 浏览器打开</button>
      <span style="flex:1"></span>
      <button class="btn primary" onclick="closeModal()">明白了</button>
    </div>`, { wide: true });
}

async function resetLiveToken() {
  if (!await confirmBox('重置实时链接', '重置后<b>所有旧的实时链接立即失效</b>，已经配置好的 Excel 需要换成新链接。确定吗？')) return;
  try {
    const r = await api('/excel/live-token/reset', { method: 'POST', body: JSON.stringify({}) });
    state.liveLinks = r;
    toast('已重置，请复制新链接');
    renderExcel();
  } catch (e) { toast(e.message, 'error'); }
}

async function handleImport(file) {
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);
  const create = $('#impCreate').checked;
  const update = $('#impUpdate').checked;
  try {
    toast('正在解析文件…');
    const preview = await api('/excel/preview', { method: 'POST', body: fd });
    const total = preview.total;
    const unmatched = preview.unmatched;
    openModal(`<div class="modal-head"><h2>导入预览</h2><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">
        <p><b>${esc(file.name)}</b> · 识别到 <b>${total}</b> 行数据 · 匹配到 ${preview.matched.length} 列
        ${unmatched.length ? `<br><span style="color:var(--amber)">未匹配列：${esc(unmatched.join('、'))}（将被忽略）</span>` : ''}</p>
        ${preview.sample.length ? `<div class="table-wrap"><table class="grid"><thead><tr>${preview.headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
          <tbody>${preview.sample.map((r) => `<tr>${preview.headers.map((h) => `<td>${esc(r[h] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''}
        <label style="display:flex;gap:8px;margin-top:14px;font-size:13px;color:var(--text-2)">
          <input type="checkbox" checked id="impDry"> 仅预览（不写入数据库，先看结果）
        </label>
      </div>
      <div class="modal-foot">
        <button class="btn" onclick="closeModal()">取消</button>
        <button class="btn primary" id="impConfirm">开始导入</button>
      </div>`, { wide: true });
    $('#impConfirm').onclick = async () => {
      const dry = $('#impDry').checked;
      const fd2 = new FormData();
      fd2.append('file', file);
      fd2.append('create_missing', create ? '1' : '0');
      fd2.append('update_existing', update ? '1' : '0');
      fd2.append('dry_run', dry ? '1' : '0');
      const btn = $('#impConfirm');
      btn.disabled = true; btn.textContent = '导入中…';
      try {
        const r = await api('/excel/import', { method: 'POST', body: fd2 });
        if (r.failed) {
          toast(`导入完成：新增 ${r.created}、更新 ${r.updated}、跳过 ${r.skipped}、失败 ${r.failed}`, 'warn');
        } else {
          toast(`导入完成：新增 ${r.created}、更新 ${r.updated}${dry ? '（仅预览，未写入）' : ''}`);
        }
        if (r.errors?.length) {
          const errText = r.errors.slice(0, 10).map((e) => `第${e.row}行：${e.message}`).join('\n');
          console.warn('导入错误：', r.errors);
          openModal(`<div class="modal-head"><h2>导入结果</h2><button class="modal-close" onclick="closeModal()">×</button></div>
            <div class="modal-body"><pre style="white-space:pre-wrap;font-size:12.5px;background:var(--surface-2);padding:14px;border-radius:10px">${esc(errText)}</pre></div>
            <div class="modal-foot"><button class="btn primary" onclick="closeModal()">知道了</button></div>`);
        }
        closeModal();
        renderExcel();
      } catch (e) { toast(e.message, 'error'); btn.disabled = false; btn.textContent = '开始导入'; }
    };
  } catch (e) { toast(e.message, 'error'); }
}

/* ================= 系统设置 ================= */
async function renderSettings() {
  const data = await api('/settings');
  state.settingsData = data;
  const sys = data.settings.system || {};
  const ocr = data.settings.ocr || {};
  const os = data.ocr_status;
  const providers = os.providers;
  const p = ocr.provider || 'mock';
  const cfg = data.settings[`ocr_${p}`] || ocr.credentials || {};
  const photo = data.settings.photo || {};
  $('#content').innerHTML = `
    <div class="grid grid-2">
      <div class="card">
        <h3>${svgIcon('building')} 企业信息</h3>
        <div class="field"><label>企业名称</label><input id="sCompany" value="${esc(sys.company_name || '')}"></div>
        <div class="field"><label>资产编号格式${help('可用变量：{PREFIX} 分类前缀 · {YYYY} 年份 · {SEQ:4} 四位流水号\n例：{PREFIX}-{YYYY}-{SEQ:4} → MON-2026-0010')}</label>
          <input id="sPattern" value="${esc(sys.asset_no_pattern || '{PREFIX}-{YYYY}-{SEQ:4}')}"></div>
        <div class="field"><label>货币符号</label><input id="sCurrency" value="${esc(sys.currency || 'CNY')}"></div>
        <div class="field"><label>供应商选项${help('多个用逗号分隔。会同步到设备表单下拉、列表筛选、手机端和 Excel 导入模板。')}</label>
          <input id="sSuppliers" value="${esc((sys.suppliers || []).join(', '))}" placeholder="易点云, 小熊"></div>
        <div class="field"><label>外部访问地址${help('导出的 Excel 可能拿到别的电脑上打开，里面的照片链接要用一个大家都访问得到的地址。\n例：http://192.168.1.100:8080（办公室）或 https://itam.example.com:12345（公网）\n留空 = 自动，系统会把 127.0.0.1 换成局域网 IP。')}</label>
          <input id="sLinkBase" value="${esc(sys.link_base_url || '')}" placeholder="留空 = 自动"></div>
        <div class="field"><label>自助注册${help('内网自用建议保持关闭。\n开放时建议开启「需审核」，并把默认角色设为「只读」或「录入员」。')}</label>
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:2px">
            <label style="display:flex;align-items:center;gap:8px;font-weight:500;color:var(--text)">
              <input type="checkbox" id="sAllowReg" ${sys.allow_register ? 'checked' : ''}> 允许访客注册
            </label>
            <label style="display:flex;align-items:center;gap:8px;font-weight:500;color:var(--text)">
              <input type="checkbox" id="sRegApproval" ${sys.register_need_approval !== false ? 'checked' : ''}> 注册后需审核
            </label>
            <div style="display:flex;align-items:center;gap:8px">
              <span class="muted" style="font-size:13px">默认角色</span>
              <select id="sRegRole" style="width:150px">
                ${(state.usersMeta?.roles || [
                  { id: 'viewer', label: '只读' }, { id: 'operator', label: '录入员' },
                  { id: 'manager', label: '资产管理员' },
                ]).filter((r) => r.id !== 'admin').map((r) => `<option value="${r.id}" ${sys.register_default_role === r.id ? 'selected' : ''}>${r.label}</option>`).join('')}
              </select>
            </div>
          </div></div>
        <button class="btn primary" id="saveSystem">保存</button>
      </div>
      <div class="card">
        <h3>${svgIcon('camera')} 照片归档</h3>
        <p class="muted" style="margin-top:0;font-size:13px">手机拍照入库时，系统<b>默认自动</b>把原图、识别图、缩略图一起归档，无需人工操作。这里只做兜底设置。</p>
        <label class="sw-inline"><input type="checkbox" id="phKeepOriginal" ${photo.keep_original !== false ? 'checked' : ''}> 保存原图${help('手机拍到多清楚就存多清楚（最高 4K）。设备详情里能放大看铭牌小字。')}</label>
        <label class="sw-inline"><input type="checkbox" id="phKeepThumb" ${photo.keep_thumb !== false ? 'checked' : ''}> 保存缩略图${help('320px 小图，导出 Excel 时嵌进单元格用的就是它。')}</label>
        <label class="sw-inline"><input type="checkbox" id="phEmbed" ${photo.embed_in_excel !== false ? 'checked' : ''}> 导出带照片${help('关掉后导出的 Excel 只有数据、没有图片，文件会小很多。')}</label>
        <div class="field"><label>原图上限 (MB)${help('单张原图超过这个大小就不单独存原图了（退回用识别图），免得手机流量和磁盘被吃掉。')}</label>
          <input type="number" min="1" max="50" id="phMaxMb" value="${Number(photo.max_original_mb) || 15}"></div>
        <button class="btn primary" id="savePhoto">保存</button>
      </div>
      <div class="card">
        <h3>${svgIcon('search')} 识别服务${help('手机拍照识别品牌与 SN 用的服务商。选好服务商后填 API Key 即可。')}</h3>
        <div class="field"><label>服务提供商</label>
          <select id="ocrProvider">${providers.map((x) => `<option value="${x.id}" ${p === x.id ? 'selected' : ''}>${x.label}</option>`).join('')}</select>
          <div class="hint" id="ocrHint">${esc(providers.find((x) => x.id === p)?.hint || '')}</div></div>
        <div id="ocrFields"></div>
        <div class="field"><label>置信度阈值${help('低于该置信度的字段，在手机端会高亮提示人工确认。')}</label>
          <input type="number" step="0.05" min="0" max="1" id="ocrThreshold" value="${ocr.confidence_threshold ?? 0.55}"></div>
        <label class="sw-inline"><input type="checkbox" id="ocrAutoFill" ${ocr.auto_fill !== false ? 'checked' : ''}> 识别后自动填充${help('识别到品牌/型号/SN 后自动填进表单，仍可手动改。')}</label>
        <div style="display:flex;gap:10px">
          <button class="btn primary" id="saveOcr">保存</button>
          <button class="btn" id="testOcr">${svgIcon('beaker')} 测试识别</button>
        </div>
        <div class="hint" style="margin-top:10px" id="ocrStatus"></div>
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <h3>${svgIcon('lock')} 我的账号</h3>
      <dl class="kv">
        <dt>当前账号</dt><dd>${esc(state.auth?.display_name || state.auth?.username || '—')} <span class="tag">${esc(state.auth?.role_label || '')}</span></dd>
        <dt>用户名</dt><dd class="mono">${esc(state.auth?.username || '—')}</dd>
        <dt>会话有效期</dt><dd>7 天（勾选「记住我」为 30 天）</dd>
        <dt>密码存储</dt><dd class="muted">scrypt 加盐哈希，数据库中不存明文</dd>
      </dl>
      <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap">
        <button class="btn primary" onclick="openProfile()">修改密码</button>
        <button class="btn" onclick="showMyLogins()">我的登录记录</button>
        ${hasPerm('user.manage') ? '<button class="btn" onclick="switchView(\'users\')">用户管理</button>' : ''}
        <button class="btn" onclick="doLogout()">退出登录</button>
      </div>
      <div class="hint" style="margin-top:10px">忘记密码时，可在服务器上运行 <code>node server/reset-password.js</code> 重置，或让管理员在「用户管理」里重置。</div>
    </div>
    <div class="card" style="margin-top:16px">
      <h3>${svgIcon('info')} 系统信息</h3>
      <dl class="kv">
        <dt>当前识别服务</dt><dd>${esc(p)} ${os.configured?.[p] === false ? '<span class="badge" style="color:var(--amber)">未配置密钥</span>' : '<span class="badge" style="color:var(--green)">已就绪</span>'}</dd>
        <dt>环境变量注入</dt><dd>${os.env_locked?.length ? esc(os.env_locked.join(', ')) : '无'}</dd>
        <dt>说明</dt><dd class="muted">密钥可在此页填写，也可通过环境变量注入（如 BAIDU_OCR_API_KEY / VISION_API_KEY）。mock 模式无需密钥，返回示例铭牌用于演示。</dd>
      </dl>
    </div>`;

  renderOcrFields(p, cfg);
  $('#ocrProvider').onchange = (e) => {
    $('#ocrHint').textContent = providers.find((x) => x.id === e.target.value)?.hint || '';
    renderOcrFields(e.target.value, data.settings[`ocr_${e.target.value}`] || {});
  };
  $('#saveSystem').onclick = async () => {
    const suppliers = $('#sSuppliers').value.split(/[,，、;；\s]+/).map((s) => s.trim()).filter(Boolean);
    try {
      await api('/settings', {
        method: 'PUT',
        body: JSON.stringify({
          system: {
            company_name: $('#sCompany').value.trim(),
            asset_no_pattern: $('#sPattern').value.trim(),
            currency: $('#sCurrency').value.trim(),
            suppliers,
            link_base_url: $('#sLinkBase').value.trim().replace(/\/+$/, ''),
            allow_register: $('#sAllowReg').checked,
            register_need_approval: $('#sRegApproval').checked,
            register_default_role: $('#sRegRole').value,
          },
        }),
      });
      // 供应商变化要立刻反映到设备表单/筛选，重新拉一次选项
      state.options = await api('/options');
      toast('已保存');
      loadCompany();
    } catch (e) { toast(e.message, 'error'); }
  };
  $('#savePhoto').onclick = async () => {
    try {
      await api('/settings', {
        method: 'PUT',
        body: JSON.stringify({
          photo: {
            keep_original: $('#phKeepOriginal').checked,
            keep_thumb: $('#phKeepThumb').checked,
            embed_in_excel: $('#phEmbed').checked,
            max_original_mb: Number($('#phMaxMb').value) || 15,
          },
        }),
      });
      toast('照片设置已保存');
      renderSettings();
    } catch (e) { toast(e.message, 'error'); }
  };
  $('#saveOcr').onclick = async () => {
    const provider = $('#ocrProvider').value;
    const creds = {};
    // 同时收集 input 与 select（如 image_format、region 等下拉字段）
    $$('#ocrFields input, #ocrFields select').forEach((el) => {
      if (!el.id || !el.id.startsWith('ocr_')) return;
      creds[el.id.replace('ocr_', '')] = String(el.value).trim();
    });
    // 密钥字段为空时不覆盖已保存的值（避免误清空）
    for (const [k, v] of Object.entries(creds)) {
      if (v === '' && k !== 'image_format' && k !== 'region') delete creds[k];
    }
    const payload = {
      ocr: { provider, confidence_threshold: Number($('#ocrThreshold').value) || 0.55, auto_fill: $('#ocrAutoFill').checked },
      [`ocr_${provider}`]: creds,
    };
    try {
      await api('/settings', { method: 'PUT', body: JSON.stringify(payload) });
      toast('识别配置已保存');
      $('#ocrStatus').innerHTML = '<span style="color:var(--green)">已保存，可在手机上拍照测试</span>';
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  $('#testOcr').onclick = async () => {
    const btn = $('#testOcr');
    btn.disabled = true; btn.innerHTML = '<span class="spin"></span> 识别中…';
    try {
      const r = await api('/ocr/test', { method: 'POST', body: JSON.stringify({}) });
      $('#ocrStatus').innerHTML = r.mocked
        ? `<span style="color:var(--amber)">当前是 ${r.provider}（模拟），返回 ${r.lines} 行示例文字</span>`
        : `<span style="color:var(--green)">${r.provider} 通道正常，返回 ${r.lines} 行</span>`;
    } catch (e) {
      $('#ocrStatus').innerHTML = `<span style="color:var(--red)">${esc(e.message)}</span>`;
    } finally { btn.disabled = false; btn.innerHTML = svgIcon('beaker') + ' 测试识别'; }
  };
}

/* 视觉大模型（OpenAI 兼容）常见服务商预设：选一下自动填 Base URL + 模型名 */
const VISION_PRESETS = [
  { id: 'zhipu', label: '智谱 GLM-4.6V-Flash（完全免费 · 128K · 国内直连）', base_url: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4.6v-flash', image_format: 'base64', note: '填完 Key 即可用，无需充值。限流时可换成 glm-4.1v-thinking-flash 或 glm-4v-flash。' },
  { id: 'zhipu-zai', label: '智谱 GLM-4.6V-Flash（国际站 z.ai）', base_url: 'https://api.z.ai/api/paas/v4', model: 'glm-4.6v-flash', image_format: 'base64', note: '海外网络可用；国内建议用上面的 open.bigmodel.cn。' },
  { id: 'siliconflow', label: '硅基流动 SiliconFlow（含免费模型 · 国内直连）', base_url: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen2.5-VL-7B-Instruct' },
  { id: 'modelscope', label: '魔搭 ModelScope（免费推理额度 · 国内直连）', base_url: 'https://api-inference.modelscope.cn/v1', model: 'Qwen/Qwen2.5-VL-7B-Instruct' },
  { id: 'dashscope', label: '阿里百炼 通义千问 qwen-vl（新用户免费额度）', base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-vl-plus' },
  { id: 'ark', label: '火山方舟 豆包视觉（新用户免费额度）', base_url: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-1.5-vision-pro-32k' },
  { id: 'hunyuan', label: '腾讯混元 hunyuan-vision', base_url: 'https://api.hunyuan.cloud.tencent.com/v1', model: 'hunyuan-vision' },
  { id: 'moonshot', label: 'Kimi 视觉 moonshot-v1-8k-vision-preview', base_url: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k-vision-preview' },
  { id: 'openrouter', label: 'OpenRouter（含 :free 免费模型）', base_url: 'https://openrouter.ai/api/v1', model: 'qwen/qwen2.5-vl-72b-instruct:free' },
  { id: 'openai', label: 'OpenAI GPT-4o / GPT-4o-mini', base_url: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
];

function renderOcrFields(provider, cfg) {
  const defs = {
    baidu: [['api_key', 'API Key', 'text'], ['secret_key', 'Secret Key', 'password']],
    tencent: [['secret_id', 'SecretId', 'text'], ['secret_key', 'SecretKey', 'password'], ['region', '地域', 'text', 'ap-guangzhou']],
    aliyun: [['app_code', 'AppCode', 'text'], ['url', '接口 URL', 'url']],
    vision: [['api_key', 'API Key', 'password'], ['base_url', 'Base URL', 'url', 'https://open.bigmodel.cn/api/paas/v4'], ['model', '模型名', 'text', 'glm-4.6v-flash']],
    custom: [['url', '接口 URL', 'url'], ['api_key', '密钥（可选）', 'text'], ['headers', '自定义 Header (JSON)', 'text'], ['body_template', '请求体模板', 'text'], ['text_path', '返回文本路径', 'text']],
    mock: [],
  }[provider] || [];

  let presetHTML = '';
  let matched = '';
  if (provider === 'vision') {
    const curBase = String(cfg?.base_url || '').trim();
    matched = VISION_PRESETS.find((p) => p.base_url === curBase)?.id || '';
    presetHTML = `
      <div class="field"><label>服务商预设${help('选一家就自动填好 Base URL 和模型名，省得手抄。')}</label>
        <select id="visionPreset">
          <option value="">— 自定义 / 手动填写 —</option>
          ${VISION_PRESETS.map((p) => `<option value="${p.id}" ${matched === p.id ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}
        </select>
        <div class="hint" id="visionPresetNote">这里不限于 OpenAI：任何「OpenAI 兼容」的视觉模型都能用，国产免费的见上面列表。</div>
      </div>`;
  }

  const fmtField = provider === 'vision' ? `
    <div class="field"><label>图片编码方式</label>
      <select id="ocr_image_format">
        <option value="auto" ${(cfg?.image_format || 'auto') === 'auto' ? 'selected' : ''}>自动（先标准，失败自动退回另一种）</option>
        <option value="data_url" ${cfg?.image_format === 'data_url' ? 'selected' : ''}>data:image/jpeg;base64,...（OpenAI 标准）</option>
        <option value="base64" ${cfg?.image_format === 'base64' ? 'selected' : ''}>裸 base64（智谱 GLM-4V 系列官方写法）</option>
      </select>
      <div class="hint">选了「智谱」预设会自动设为「裸 base64」；选「自动」通常最省心。</div>
    </div>` : '';

  const hint = provider === 'mock'
    ? '<div class="hint">模拟模式无需任何配置，直接可用（适合演示与联调）。</div>'
    : provider === 'vision'
      ? '<div class="hint">只需 3 项：Base URL、模型名、API Key。配置保存在本地数据库，不会上传到第三方。<br>完全免费推荐：<b>智谱 GLM-4.6V-Flash</b>（128K、无需充值）；备选 <code>glm-4.1v-thinking-flash</code> / <code>glm-4v-flash</code>，限流时换一个即可。</div>'
      : defs.length ? '<div class="hint">配置将保存到本地数据库，不会上传到第三方。</div>' : '';

  $('#ocrFields').innerHTML = presetHTML
    + defs.map(([key, label, type, ph]) => `
      <div class="field"><label>${esc(label)}</label>
        <input id="ocr_${key}" type="${type === 'password' ? 'password' : 'text'}" value="${esc(cfg?.[key] || '')}" placeholder="${esc(ph || '')}"></div>`).join('')
    + fmtField
    + hint;

  if (provider === 'vision') {
    const sel = $('#visionPreset');
    if (sel) {
      sel.onchange = () => {
        const p = VISION_PRESETS.find((x) => x.id === sel.value);
        if (!p) return;
        $('#ocr_base_url').value = p.base_url;
        $('#ocr_model').value = p.model;
        const fmtSel = $('#ocr_image_format');
        if (fmtSel) fmtSel.value = p.image_format || 'auto';
        const note = $('#visionPresetNote');
        if (note) note.innerHTML = p.note ? esc(p.note) : '这里不限于 OpenAI：任何「OpenAI 兼容」的视觉模型都能用。';
        toast('已填入「' + p.label + '」，只需再粘贴该平台的 API Key');
      };
      // 回显当前预设说明
      const note = $('#visionPresetNote');
      if (note && matched) {
        const p = VISION_PRESETS.find((x) => x.id === matched);
        if (p?.note) note.innerHTML = esc(p.note);
      }
    }
  }
}

async function loadCompany() {
  try {
    const d = await api('/settings');
    const name = d.settings.system?.company_name;
    state.companyName = name || 'IT 资产管理';
    const el = $('#companyName');
    if (el) el.textContent = state.companyName;
  } catch { /* ignore */ }
}

/* ================= 全局搜索 ================= */
function bindGlobalSearch() {
  const el = $('#globalSearch');
  el.onkeydown = (e) => {
    if (e.key !== 'Enter') return;
    const kw = el.value.trim();
    if (!kw) return;
    state.devicesQuery.keyword = kw;
    state.devicesQuery.page = 1;
    if (state.view !== 'devices') switchView('devices');
    else loadDevices();
  };
}

/* ================= 启动 ================= */
async function boot() {
  renderNav();
  initSidebar();
  bindGlobalSearch();

  // 先确认登录状态，未登录直接跳登录页
  try {
    const st = await api('/auth/status');
    if (!st.authenticated) { redirectToLogin(false); return; }
    state.auth = st;
  } catch (e) {
    $('#content').innerHTML = `<div class="empty"><div class="big">${svgIcon('lock', 24)}</div>无法确认登录状态：${esc(e.message)}</div>`;
    return;
  }

  renderUserBox();
  if (state.auth.must_change) showPasswordBanner();

  try {
    state.options = await api('/options');
  } catch (e) {
    if (e.status !== 401) $('#content').innerHTML = `<div class="empty"><div class="big">${svgIcon('alert', 24)}</div>无法连接服务端：${esc(e.message)}</div>`;
    return;
  }
  loadCompany();
  initHelpTips();
  api('/health').then(() => { const d = $('#healthDot'); if (d) d.style.background = 'var(--green)'; }).catch(() => {});
  switchView('dashboard');
}

/* ================= 侧边栏（手机端为抽屉） ================= */
const isNarrow = () => (typeof window !== 'undefined' && window.innerWidth ? window.innerWidth <= 900 : false);

/**
 * 桌面：☰ 收起/展开侧边栏（.collapsed）
 * 手机：☰ 把侧边栏作为抽屉滑出（.open），并显示遮罩
 */
function toggleSidebar(force) {
  const sb = $('#sidebar');
  const mask = $('#sidebarMask');
  if (!sb) return;
  if (isNarrow()) {
    const open = force === undefined ? !sb.classList.contains('open') : !!force;
    sb.classList.toggle('open', open);
    sb.classList.remove('collapsed');
    if (mask) mask.hidden = !open;
    if (document.body) document.body.style.overflow = open ? 'hidden' : '';
  } else {
    if (mask) mask.hidden = true;
    sb.classList.remove('open');
    sb.classList.toggle('collapsed');
    if (document.body) document.body.style.overflow = '';
  }
}

function closeSidebar() {
  const sb = $('#sidebar');
  const mask = $('#sidebarMask');
  if (sb) { sb.classList.remove('open'); }
  if (mask) mask.hidden = true;
  if (document.body) document.body.style.overflow = '';
}

function initSidebar() {
  const btn = $('#menuToggle');
  if (btn) btn.onclick = (e) => { e.stopPropagation(); toggleSidebar(); };
  const mask = $('#sidebarMask');
  if (mask) mask.onclick = closeSidebar;
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSidebar(); });
    window.addEventListener('resize', () => { if (!isNarrow()) closeSidebar(); });
  }
}

/* ================= 登录用户相关 ================= */
function renderUserBox() {
  if (state.userBoxRendered) return;
  state.userBoxRendered = true;
  const box = $('.topbar-right');
  if (!box) return;
  const a = state.auth || {};
  const el = document.createElement('div');
  el.className = 'user-box';
  el.id = 'userBox';
  el.innerHTML = `<span class="user-name" title="当前登录账号">
      ${svgIcon('user')} ${esc(a.display_name || a.username || '')}
      <span class="user-role">${esc(a.role_label || a.role || '')}</span>
    </span>
    <button class="btn sm" id="btnProfile" title="我的账号">账号</button>
    <button class="btn sm" id="btnLogout" title="退出登录">退出</button>`;
  box.appendChild(el);
  const p = $('#btnProfile');
  if (p) p.onclick = openProfile;
  const btn = $('#btnLogout');
  if (btn) btn.onclick = doLogout;
  const c = $('#companyName');
  if (c && state.companyName) c.textContent = state.companyName;
}

async function doLogout() {
  if (!await confirmBox('退出登录', '确定要退出登录吗？', { danger: false })) return;
  try { await api('/auth/logout', { method: 'POST', body: JSON.stringify({}) }); } catch { /* ignore */ }
  location.href = '/login';
}

function showPasswordBanner() {
  const main = $('#content');
  if (!main || typeof main.insertAdjacentHTML !== 'function') return;
  main.insertAdjacentHTML('afterbegin', `
    <div class="card" style="border-color:var(--warn-border);background:var(--warn-bg);margin-bottom:16px">
      <h3 style="margin:0 0 6px">${svgIcon('lock')} 安全提示：请修改初始密码</h3>
      <div class="muted" style="font-size:13px">当前使用的是系统自动生成的初始密码。如果要暴露到公网，请务必先改成你自己的强密码。</div>
      <div style="margin-top:12px"><button class="btn primary" onclick="switchView('settings')">去修改密码</button></div>
    </div>`);
}

/* ================= 我的账号 ================= */
function openProfile() {
  const a = state.auth || {};
  openModal(`
    <div class="modal-head"><h2>我的账号</h2><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <dl class="kv" style="margin-bottom:18px">
        <dt>用户名</dt><dd class="mono">${esc(a.username || '')}</dd>
        <dt>姓名</dt><dd>${esc(a.display_name || '—')}</dd>
        <dt>角色</dt><dd><span class="badge" style="color:${ROLE_BADGE[a.role] || 'var(--text-3)'}">${esc(a.role_label || a.role || '')}</span></dd>
        <dt>权限</dt><dd class="muted">${(a.permissions || []).includes('*') ? '全部权限' : (a.permissions || []).length + ' 项'}</dd>
      </dl>
      <h3 style="font-size:14px;margin:0 0 12px">修改资料与密码</h3>
      <div class="field"><label>姓名</label><input id="pfDisplay" value="${esc(a.display_name || '')}"></div>
      <div class="field"><label>当前密码 <span class="req">*</span></label><input type="password" id="pfOld" autocomplete="current-password"></div>
      <div class="field"><label>新密码 <span class="req">*</span></label><input type="password" id="pfNew" placeholder="至少 8 位" autocomplete="new-password"></div>
      <div class="field"><label>确认新密码 <span class="req">*</span></label><input type="password" id="pfNew2" autocomplete="new-password"></div>
      <div class="hint">修改密码后，你在其它设备上的登录会全部失效，需要用新密码重新登录。</div>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="showMyLogins()">我的登录记录</button>
      <span style="flex:1"></span>
      <button class="btn" onclick="closeModal()">取消</button>
      <button class="btn primary" id="pfSave">保存</button>
    </div>`, { slim: true });

  $('#pfSave').onclick = async () => {
    const oldp = $('#pfOld').value;
    const np = $('#pfNew').value;
    const np2 = $('#pfNew2').value;
    if (!oldp) { toast('请输入当前密码', 'warn'); return; }
    if (np.length < 8) { toast('新密码至少 8 位', 'warn'); return; }
    if (np !== np2) { toast('两次输入的新密码不一致', 'warn'); return; }
    try {
      const r = await api('/profile', {
        method: 'POST',
        body: JSON.stringify({ old_password: oldp, new_password: np, display_name: $('#pfDisplay').value.trim() }),
      });
      toast('已保存，请用新密码重新登录');
      closeModal();
      setTimeout(() => { location.href = '/login'; }, 1200);
    } catch (e) { toast(e.message, 'error'); }
  };
}

async function showMyLogins() {
  const r = await api('/profile/logins');
  openModal(`
    <div class="modal-head"><h2>我的登录记录</h2><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body"><div class="table-wrap"><table class="grid">
      <thead><tr><th>时间</th><th>动作</th><th>IP</th><th>客户端</th></tr></thead>
      <tbody>${r.items.map((l) => `<tr>
        <td class="muted">${esc((l.created_at || '').replace('T', ' ').slice(0, 19))}</td>
        <td>${esc({ login: '登录成功', logout: '退出', login_failed: '登录失败', lockout: '账号锁定', register: '注册' }[l.action] || l.action)}</td>
        <td class="muted">${esc(l.ip || '')}</td>
        <td class="muted" style="max-width:280px;overflow:hidden;text-overflow:ellipsis">${esc(l.user_agent || '')}</td>
      </tr>`).join('')}</tbody>
    </table></div></div>
    <div class="modal-foot"><button class="btn primary" onclick="closeModal()">关闭</button></div>`, { wide: true });
}

/* ================= 自动盘点（GLPI Agent） ================= *
 * 这一页解决的是「56 台机器不想一台台举着手机拍」。
 * 页面结构：顶部四张数字卡 + 四个页签（待认领机器 / 显示器 / 上报令牌 / 上报历史）+ 安装指引。
 *
 * ⚠️ 一条设计原则贯穿全页：**agent 报上来的东西一律先「待认领」，绝不自动进台账**。
 *    agent 只知道机器序列号（如 640HP72），不知道企业的资产编号（PC-2026-0017）；
 *    自动入库只会把台账搞成一锅粥。所以这里全是「人点一下才生效」。
 * ========================================================= */

state.agentTab = 'machines';
state.agentOverview = null;

/** 认领弹窗：先给推荐（按 SN 命中），再给「新建设备」和「在台账里搜一台」 */
async function openAgentClaim(machineId, kind = 'machine') {
  const isMon = kind === 'monitor';
  const detail = isMon ? null : await api(`/agent/machines/${machineId}`);
  const m = detail?.machine;
  const cands = isMon ? await api(`/agent/monitors/${machineId}/candidates`) : (detail?.candidates || []);
  const title = isMon ? '认领这台显示器' : `认领「${m?.hostname || m?.deviceid || ''}」`;

  const candHTML = cands.length ? cands.map((c) => `
    <button class="agent-cand" onclick="doAgentClaim('${machineId}','${c.id}','${kind}')">
      <span class="ac-main"><b>${esc(c.asset_no)}</b> ${esc(c.sn || '无 SN')}</span>
      <span class="ac-sub">${esc([c.brand, c.model].filter(Boolean).join(' ') || '—')} · ${esc(c.reason)}</span>
      <span class="ac-go">认领</span>
    </button>`).join('') : '<p class="muted" style="margin:0">台账里没有明显对得上的设备（按序列号没找到）。可以新建一台。</p>';

  openModal(`
    <div class="modal-head"><h2>${esc(title)}</h2><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      ${m ? `<div class="agent-summary">
        <div><span class="k">主机名</span><span class="v">${esc(m.hostname || '—')}</span></div>
        <div><span class="k">序列号</span><span class="v mono">${esc(m.sn || m.sn_alt || '—')}</span></div>
        <div><span class="k">品牌型号</span><span class="v">${esc([m.manufacturer, m.model].filter(Boolean).join(' ') || '—')}</span></div>
        <div><span class="k">机型</span><span class="v">${esc(agentKindLabel(m))}</span></div>
        <div><span class="k">系统</span><span class="v">${esc(m.os_name || '—')}</span></div>
        <div><span class="k">CPU / 内存</span><span class="v">${esc(m.cpu || '—')}${m.ram_mb ? ' · ' + Math.round(m.ram_mb / 1024) + 'GB' : ''}</span></div>
        <div><span class="k">MAC / IP</span><span class="v mono">${esc(m.mac_primary || '—')} ${esc(m.ip_primary || '')}</span></div>
        <div><span class="k">最后上报</span><span class="v">${esc(agentTime(m.last_seen_at))}</span></div>
      </div>` : ''}

      <h3 style="margin:16px 0 8px;font-size:14px">① 认领到台账里已有的设备${help('按机器序列号自动找的。认领后只补空字段，人工填过的值不会被覆盖。')}</h3>
      <div class="agent-cands">${candHTML}</div>

      <h3 style="margin:18px 0 8px;font-size:14px">② 或者用盘点结果新建一台</h3>
      ${isMon
        ? `<p class="muted" style="margin:0 0 10px">会新建到「显示器」分类，序列号、品牌、尺寸都按 EDID 填好。</p>
           <button class="btn primary" onclick="doAgentClaim('${machineId}','', 'monitor', true)">新建设备并认领</button>`
        : `<p class="muted" style="margin:0 0 10px">分类按机箱类型自动选（Laptop→笔记本、Desktop→台式主机、Server→服务器）。</p>
           <button class="btn primary" onclick="doAgentClaim('${machineId}','', 'machine', true)">新建设备并认领</button>`}
    </div>
    <div class="modal-foot"><button class="btn" onclick="closeModal()">取消</button></div>
  `, { wide: true });
}

async function doAgentClaim(id, deviceId, kind, create = false) {
  const path = kind === 'monitor' ? `/agent/monitors/${id}/claim` : `/agent/machines/${id}/claim`;
  try {
    const r = await api(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(deviceId ? { device_id: deviceId } : { create: {} }),
    });
    closeModal();
    toast(`已认领到 ${r.device.asset_no}`);
    renderAgent();
  } catch (e) {
    // SN 冲突是最常见的：台账里已经有这台机器了，引导去认领那一台
    if (e.status === 409) toast(e.message, 'warn');
    else toast(e.message, 'error');
  }
}

async function doAgentUnclaim(id, kind) {
  const ok = await confirmBox('解除认领', kind === 'monitor'
    ? '只断开这台显示器与自动盘点记录的绑定，台账里的设备不会被删除。'
    : '只断开绑定关系，台账里的设备会原样保留。之后它继续上报也不会再自动同步。');
  if (!ok) return;
  try {
    await api(kind === 'monitor' ? `/agent/monitors/${id}/unclaim` : `/agent/machines/${id}/unclaim`, { method: 'POST' });
    toast('已解除认领');
    renderAgent();
  } catch (e) { toast(e.message, 'error'); }
}

async function doAgentDelete(id) {
  const ok = await confirmBox('删除自动盘点记录', '只是把这个上报副本删掉，之后它再上报会重新出现。台账设备不受影响。');
  if (!ok) return;
  try {
    await api(`/agent/machines/${id}/delete`, { method: 'POST' });
    toast('已删除');
    renderAgent();
  } catch (e) { toast(e.message, 'error'); }
}

async function doAgentSync(id) {
  try {
    const r = await api(`/agent/machines/${id}/sync`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    toast(r.changes ? `已同步 ${r.changes} 个字段` : '没有需要更新的字段');
  } catch (e) { toast(e.message, 'error'); }
}

async function toggleAgentAutoSync(id, on) {
  try {
    await api(`/agent/machines/${id}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auto_sync: on }),
    });
    toast(on ? '已开启自动同步' : '已关闭自动同步');
  } catch (e) { toast(e.message, 'error'); }
}

function agentKindLabel(m) {
  const k = m.machine_kind;
  const base = { pc: '台式主机', nb: '笔记本', srv: '服务器', vm: '虚拟机', other: m.chassis_type || '未知' }[k] || (m.chassis_type || '未知');
  return !m.is_physical ? `${base}（${m.vmsystem || '虚拟'}）` : base;
}

function agentTime(s) {
  if (!s) return '—';
  const d = new Date(s);
  const diff = (Date.now() - d.getTime()) / 1000;
  const rel = diff < 60 ? '刚刚' : diff < 3600 ? `${Math.floor(diff / 60)} 分钟前`
    : diff < 86400 ? `${Math.floor(diff / 3600)} 小时前` : `${Math.floor(diff / 86400)} 天前`;
  return `${String(s).replace('T', ' ').slice(0, 16)}（${rel}）`;
}

async function renderAgent() {
  const ov = await api('/agent/overview');
  state.agentOverview = ov;
  const s = ov.stats;
  const tab = state.agentTab;

  const stat = (label, value, hint, cls = '') => `
    <div class="agent-stat ${cls}">
      <div class="as-v">${value}</div>
      <div class="as-l">${esc(label)}</div>
      ${hint ? `<div class="as-h">${esc(hint)}</div>` : ''}
    </div>`;

  $('#content').innerHTML = `
    <div class="agent-stats">
      ${stat('已盘点机器', s.machines, s.last_report_at ? '最近上报 ' + agentTime(s.last_report_at).split('（')[1]?.replace('）', '') : '还没有机器上报过')}
      ${stat('待认领机器', s.unclaimed, s.unclaimed ? '需要你确认后才能进台账' : '都处理完了', s.unclaimed ? 'warn' : 'ok')}
      ${stat('识别的显示器', s.monitors, s.monitors_unclaimed ? `${s.monitors_unclaimed} 台待认领` : '全部已认领')}
      ${stat('上报次数', s.reports, `启用中的令牌 ${s.tokens} 个`)}
    </div>

    <div class="tabs">
      ${[['machines', `待认领机器${s.unclaimed ? ` <span class="tab-num">${s.unclaimed}</span>` : ''}`],
    ['monitors', `显示器${s.monitors_unclaimed ? ` <span class="tab-num">${s.monitors_unclaimed}</span>` : ''}`],
    ['tokens', '上报令牌'], ['reports', '上报历史'], ['guide', '安装指引']]
    .map(([id, label]) => `<button class="tab ${tab === id ? 'active' : ''}" onclick="switchAgentTab('${id}')">${label}</button>`).join('')}
    </div>

    <div id="agentPane"></div>`;
  renderAgentPane();
}

function switchAgentTab(id) {
  state.agentTab = id;
  renderAgent();
}

async function renderAgentPane() {
  const pane = $('#agentPane');
  if (!pane) return;
  const tab = state.agentTab;
  try {
    if (tab === 'machines') pane.innerHTML = await agentMachinesHTML();
    else if (tab === 'monitors') pane.innerHTML = await agentMonitorsHTML();
    else if (tab === 'tokens') pane.innerHTML = agentTokensHTML();
    else if (tab === 'reports') pane.innerHTML = await agentReportsHTML();
    else pane.innerHTML = agentGuideHTML();
    bindAgentPane();
  } catch (e) {
    pane.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

async function agentMachinesHTML() {
  const q = state.agentQuery || { only: 'unclaimed', q: '' };
  const data = await api(`/agent/machines?only=${encodeURIComponent(q.only)}&q=${encodeURIComponent(q.q)}&page_size=200`);
  if (!data.items.length) {
    return `<div class="card"><h3>${svgIcon('check-circle')} 没有待认领的机器</h3>
      <p class="muted" style="margin:0">${q.q || q.only !== 'unclaimed' ? '换个筛选条件看看。' : 'agent 装好并上报之后，新机器会出现在这里，人工确认一下就能进台账。'}</p>
      ${agentInstallHintHTML()}</div>`;
  }
  return `
    <div class="card">
      <div class="card-head">
        <h3 style="margin:0">自动盘点到的机器${help('这些机器还没进台账。认领之后才会成为正式资产，之后上报会自动同步 MAC/IP/系统等机器信息。')}</h3>
        <div class="agent-filters">
          <select id="agentOnly" class="mini">
            <option value="unclaimed" ${q.only === 'unclaimed' ? 'selected' : ''}>待认领</option>
            <option value="claimed" ${q.only === 'claimed' ? 'selected' : ''}>已认领</option>
            <option value="" ${q.only === '' ? 'selected' : ''}>全部</option>
            <option value="physical" ${q.only === 'physical' ? 'selected' : ''}>只看实体机</option>
          </select>
          <input id="agentQ" class="mini" placeholder="搜主机名 / SN / 型号 / 使用人" value="${esc(q.q)}">
          <button class="btn sm" id="agentSearch">搜索</button>
        </div>
      </div>
      <div class="table-wrap"><table class="grid">
        <thead><tr>
          <th>主机名</th><th>序列号</th><th>品牌 / 型号</th><th>机型</th><th>系统</th>
          <th>使用人</th><th>MAC / IP</th><th>最后上报</th><th style="width:190px">操作</th>
        </tr></thead>
        <tbody>${data.items.map((m) => `
          <tr>
            <td><b>${esc(m.hostname || '(无主机名)')}</b>${m.tag ? `<span class="muted"> · ${esc(m.tag)}</span>` : ''}</td>
            <td class="mono">${esc(m.sn || m.sn_alt || '—')}${m.sn && m.sn_alt && m.sn !== m.sn_alt ? help('主板序列号：' + m.sn_alt) : ''}</td>
            <td>${esc([m.manufacturer, m.model].filter(Boolean).join(' ') || '—')}</td>
            <td>${esc(agentKindLabel(m))}</td>
            <td class="muted">${esc(m.os_name || '—')}</td>
            <td>${esc(m.last_user || '—')}</td>
            <td class="mono muted">${esc(m.mac_primary || '—')}<br>${esc(m.ip_primary || '')}</td>
            <td class="muted">${esc(agentTime(m.last_seen_at))}
              ${m.partial_count ? `<br><span class="muted">部分上报 ${m.partial_count} 次</span>` : ''}</td>
            <td>
              ${m.claimed ? `
                <span class="badge" style="color:var(--green)">已认领</span>
                <button class="btn sm ghost" onclick="doAgentSync('${m.id}')">同步</button>
                <button class="btn sm ghost" onclick="doAgentUnclaim('${m.id}','machine')">解除</button>
              ` : `
                <button class="btn sm primary" onclick="openAgentClaim('${m.id}')">认领</button>
                <button class="btn sm ghost" onclick="doAgentDelete('${m.id}')">忽略</button>
              `}
            </td>
          </tr>`).join('')}</tbody>
      </table></div>
      <p class="muted" style="margin:10px 0 0">共 ${data.total} 台${data.total > data.items.length ? '（只显示前 200 台）' : ''}</p>
    </div>`;
}

async function agentMonitorsHTML() {
  const only = state.agentMonOnly === undefined ? 'unclaimed' : state.agentMonOnly;
  const items = await api(`/agent/monitors?only=${encodeURIComponent(only)}`);
  if (!items.length) {
    return `<div class="card"><h3>${svgIcon('check-circle')} 没有待认领的显示器</h3>
      <p class="muted" style="margin:0">agent 会把主机上接着的显示器连同 <b>EDID 里的序列号、尺寸、生产年份</b>一起报上来。
      这是最省事的一项——不用再拍显示器背面的标签了。</p></div>`;
  }
  return `
    <div class="card">
      <div class="card-head">
        <h3 style="margin:0">自动识别到的显示器${help('序列号来自显示器 EDID。个别显示器厂商不写序列号，或者走 DDC/CI 读不出来，那种情况这里会是空的，仍需人工录一次。')}</h3>
        <div class="agent-filters">
          <select id="agentMonOnly" class="mini">
            <option value="unclaimed" ${only === 'unclaimed' ? 'selected' : ''}>待认领</option>
            <option value="claimed" ${only === 'claimed' ? 'selected' : ''}>已认领</option>
            <option value="" ${only === '' ? 'selected' : ''}>全部</option>
          </select>
        </div>
      </div>
      <div class="table-wrap"><table class="grid">
        <thead><tr><th>序列号</th><th>型号</th><th>厂商</th><th>尺寸</th><th>生产年份</th><th>接在哪台机器上</th><th>最后上报</th><th style="width:170px">操作</th></tr></thead>
        <tbody>${items.map((m) => `
          <tr>
            <td class="mono">${m.serial ? esc(m.serial) : '<span class="muted">EDID 未提供</span>'}</td>
            <td>${esc(m.caption || m.name || '—')}</td>
            <td>${esc(m.manufacturer || '—')}</td>
            <td>${m.size_inch ? m.size_inch + ' 英寸' : '—'}</td>
            <td>${m.made_year || '—'}</td>
            <td>${esc(m.hostname || '—')}${m.machine_sn ? ` <span class="muted mono">${esc(m.machine_sn)}</span>` : ''}</td>
            <td class="muted">${esc(agentTime(m.last_seen_at))}</td>
            <td>
              ${m.claimed ? `
                <span class="badge" style="color:var(--green)">已认领</span>
                <button class="btn sm ghost" onclick="doAgentUnclaim('${m.id}','monitor')">解除</button>
              ` : `<button class="btn sm primary" onclick="openAgentClaim('${m.id}','monitor')">认领</button>`}
            </td>
          </tr>`).join('')}</tbody>
      </table></div>
    </div>`;
}

function agentTokensHTML() {
  const tokens = state.agentOverview?.tokens || [];
  return `
    <div class="card">
      <div class="card-head">
        <h3 style="margin:0">上报令牌${help('agent 那边把它当 HTTP Basic 的用户名和密码填。令牌只在生成时显示一次，库里只存哈希，忘了就重新生成一个。')}</h3>
        ${hasPerm('settings.write') ? `<button class="btn sm primary" onclick="openAgentTokenForm()">${svgIcon('plus', 14)} 生成令牌</button>` : ''}
      </div>
      ${tokens.length ? `<div class="table-wrap"><table class="grid">
        <thead><tr><th>名称</th><th>令牌前缀</th><th>状态</th><th>用过</th><th>最近使用</th><th>来源 IP</th><th>创建</th><th style="width:150px">操作</th></tr></thead>
        <tbody>${tokens.map((t) => `
          <tr>
            <td><b>${esc(t.name)}</b>${t.note ? `<br><span class="muted">${esc(t.note)}</span>` : ''}</td>
            <td class="mono">${esc(t.prefix || '')}…</td>
            <td>${t.enabled ? '<span class="badge" style="color:var(--green)">启用</span>' : '<span class="badge" style="color:var(--text-3)">已停用</span>'}</td>
            <td>${t.use_count || 0} 次</td>
            <td class="muted">${esc(agentTime(t.last_used_at))}</td>
            <td class="mono muted">${esc(t.last_ip || '—')}</td>
            <td class="muted">${esc(fmtDate(t.created_at))}</td>
            <td>${hasPerm('settings.write') ? `
              <button class="btn sm ghost" onclick="toggleAgentToken('${t.id}',${t.enabled ? 'false' : 'true'})">${t.enabled ? '停用' : '启用'}</button>
              <button class="btn sm ghost" onclick="delAgentToken('${t.id}')">删除</button>` : '—'}
            </td>
          </tr>`).join('')}</tbody>
      </table></div>` : `<p class="muted" style="margin:0">还没有令牌。要先有一个令牌，agent 才能上报。</p>`}
    </div>`;
}

function openAgentTokenForm() {
  openModal(`
    <div class="modal-head"><h2>生成上报令牌</h2><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="field"><label>名称（用来辨认是给谁的）</label>
        <input id="tkName" placeholder="如：办公区电脑批量安装"></div>
      <div class="field"><label>备注（可选）</label>
        <input id="tkNote" placeholder="如：2026-09 新装 30 台"></div>
      <p class="muted" style="margin:0">建议给不同批次/区域用不同令牌，这样以后要停用某一批，直接停那一个就行。</p>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="closeModal()">取消</button>
      <button class="btn primary" onclick="createAgentToken()">生成</button>
    </div>`);
}

async function createAgentToken() {
  const name = $('#tkName')?.value.trim() || '未命名';
  const note = $('#tkNote')?.value.trim() || '';
  try {
    const r = await api('/agent/tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, note }),
    });
    // ⚠️ 明文只出现这一次，弹窗里给足复制和醒目提示
    openModal(`
      <div class="modal-head"><h2>令牌已生成（只显示这一次）</h2><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">
        <div class="notice warn">这串令牌<b>关掉窗口就再也看不到了</b>（库里只存哈希）。现在复制走，或者直接用下面的安装命令。</div>
        <div class="copy-box" id="tkPlain">${esc(r.token)}</div>
        <div style="display:flex;gap:8px;margin-top:10px">
          <button class="btn" onclick="copyText('${esc(r.token)}')">复制令牌</button>
          <button class="btn" onclick="copyText(agentInstallCmd('${esc(r.token)}'))">复制安装命令</button>
        </div>
        <p class="muted" style="margin:14px 0 0">装的时候要填：<span class="mono">user</span> 和 <span class="mono">password</span> 都填这串令牌。</p>
      </div>
      <div class="modal-foot"><button class="btn primary" onclick="closeModal();renderAgent()">我记下了</button></div>`);
  } catch (e) { toast(e.message, 'error'); }
}

async function toggleAgentToken(id, on) {
  try {
    await api(`/agent/tokens/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: on }) });
    toast(on ? '已启用' : '已停用（该令牌的 agent 会立刻上报失败）');
    renderAgent();
  } catch (e) { toast(e.message, 'error'); }
}

async function delAgentToken(id) {
  const ok = await confirmBox('删除令牌', '用这个令牌的 agent 会立刻上报失败（401）。如果只是想临时停一下，用「停用」更合适。');
  if (!ok) return;
  try {
    await api(`/agent/tokens/${id}`, { method: 'DELETE' });
    toast('已删除');
    renderAgent();
  } catch (e) { toast(e.message, 'error'); }
}

async function agentReportsHTML() {
  const onlyErr = state.agentRepErr ? '&only=error' : '';
  const data = await api(`/agent/reports?page_size=100${onlyErr}`);
  if (!data.items.length) return `<div class="card"><p class="muted" style="margin:0">还没有上报记录。</p></div>`;
  return `
    <div class="card">
      <div class="card-head">
        <h3 style="margin:0">上报历史${help('每次 agent 联系服务器都会记一条：打招呼（CONTACT）、交盘点（INVENTORY）、注册、以及被拒绝的请求。')}</h3>
        <label class="sw-inline"><input type="checkbox" id="agentRepErr" ${state.agentRepErr ? 'checked' : ''}> 只看失败</label>
      </div>
      <div class="table-wrap"><table class="grid">
        <thead><tr><th>时间</th><th>机器</th><th>动作</th><th>内容</th><th>大小</th><th>令牌</th><th>来源 IP</th><th>结果</th></tr></thead>
        <tbody>${data.items.map((r) => `
          <tr>
            <td class="muted">${esc(String(r.created_at || '').replace('T', ' ').slice(0, 19))}</td>
            <td class="mono">${esc(r.deviceid || '—')}</td>
            <td>${esc({ contact: '打招呼', inventory: '交盘点', register: '注册', prolog: '老式打招呼', auth: '鉴权', parse: '解析', delete: '人工删除' }[r.action] || r.action || '—')}</td>
            <td class="muted">${r.partial ? '<span class="badge" style="color:var(--amber)">部分</span> ' : ''}${esc((r.sections || []).join(', ') || r.message || '—')}</td>
            <td class="muted">${r.bytes ? (r.bytes / 1024).toFixed(1) + ' KB' : '—'}</td>
            <td class="muted">${esc(r.token_name || '—')}</td>
            <td class="mono muted">${esc(r.ip || '—')}</td>
            <td>${r.result === 'ok' ? '<span class="badge" style="color:var(--green)">成功</span>' : `<span class="badge" style="color:var(--red)">失败</span> <span class="muted">${esc(r.message || '')}</span>`}</td>
          </tr>`).join('')}</tbody>
      </table></div>
      <p class="muted" style="margin:10px 0 0">共 ${data.total} 条${data.total > data.items.length ? '（只显示最近 100 条）' : ''}</p>
    </div>`;
}

function agentInstallHintHTML() {
  return `<div style="margin-top:12px"><button class="btn ghost sm" onclick="switchAgentTab('guide')">${svgIcon('book', 14)} 看安装指引</button></div>`;
}

/** 生成给某个令牌的安装命令（页面上「复制安装命令」用它） */
function agentInstallCmd(token) {
  const url = state.agentOverview?.endpoint_lan || state.agentOverview?.endpoint || '';
  return `powershell -ExecutionPolicy Bypass -File install-glpi-agent.ps1 -Server "${url}" -Token "${token}"`;
}

function agentGuideHTML() {
  const ov = state.agentOverview || {};
  const token = (ov.tokens || []).find((t) => t.enabled);
  const shown = token ? `${token.prefix}…（生成时复制的那串完整令牌）` : '<span style="color:var(--amber)">还没有启用中的令牌，先去「上报令牌」生成一个</span>';
  const lanUrl = ov.endpoint_lan || `${location.origin}/api/agent`;
  // 公网入口来自后端（读「外部访问地址」设置）。没配就留空，下面的模板会提示去配置，
  // 不再写死某个域名——否则用户换了域名，这里还显示旧地址。
  const pubUrl = ov.endpoint_public || '';
  const pubCell = pubUrl
    ? `<span class="mono">${esc(pubUrl)}</span>`
    : '<span style="color:var(--amber)">未配置 —— 去「系统设置 → 企业信息 → 外部访问地址」填公网地址</span>';
  return `
    <div class="card">
      <h3>① 先有个令牌</h3>
      <p class="muted" style="margin:0 0 8px">到「上报令牌」页签生成。当前：<span class="mono">${shown}</span></p>

      <h3 style="margin-top:18px">② 在每台电脑上装 GLPI Agent</h3>
      <p class="muted" style="margin:0 0 8px">把项目里的 <span class="mono">scripts\\install-glpi-agent.ps1</span> 拷到目标机器（或用共享目录），
      用管理员 PowerShell 跑：</p>
      <div class="copy-box">${esc(`powershell -ExecutionPolicy Bypass -File install-glpi-agent.ps1 \`
  -Server "${lanUrl}" \`
  -Token "你的令牌"`)}</div>
      <p class="muted" style="margin:8px 0 0">脚本会自动下载安装 MSI、写好服务器地址与令牌、启动服务，并<b>立刻做一次盘点</b>，不用等定时任务。</p>

      <h3 style="margin-top:18px">③ 选哪个地址？${help('agent 只能填一个地址。填两个会导致同一份盘点执行两次、重复上报。')}</h3>
      <div class="table-wrap"><table class="grid">
        <thead><tr><th>机器在哪</th><th>用哪个地址</th><th>要额外配什么</th></tr></thead>
        <tbody>
          <tr><td>公司局域网内（绝大多数）</td><td class="mono">${esc(lanUrl)}</td><td>不用，走 HTTP 不碰证书</td></tr>
          <tr><td>要带回家的笔记本</td><td>${pubCell}</td><td>装脚本时带上 <span class="mono">-UsePublic</span>，它会配好 CA 证书</td></tr>
        </tbody>
      </table></div>
      <p class="muted" style="margin:8px 0 0">
        ⚠️ 内网机器<b>不要</b>填公网地址：数据要绕到外网再回来，白占穿透流量还慢。穿透只服务你在外网打开网页。
      </p>

      <h3 style="margin-top:18px">④ 然后回来这里认领</h3>
      <p class="muted" style="margin:0">机器上报后会出现在「待认领机器」里。点「认领」→ 按序列号自动匹配台账里的设备，
      匹配不到就用盘点结果新建一台。认领之后，以后每次上报都会自动刷新 MAC / IP / 系统 / CPU / 内存 / 硬盘。</p>

      <h3 style="margin-top:18px">出错怎么查</h3>
      <ul class="steps">
        <li>agent 侧看日志：<span class="mono">C:\\Program Files\\GLPI-Agent\\var\\log\\glpi-agent.log</span>，或运行 <span class="mono">glpi-agent --debug --force</span></li>
        <li>本页「上报历史」里「只看失败」，能看到是<b>鉴权失败</b>（令牌不对/被停用）还是<b>格式不对</b></li>
        <li>手工验证通道：<span class="mono">curl -u user:令牌 ${esc(lanUrl).replace('/api/agent', '/api/health')}</span> 能通说明网络没问题</li>
        <li>手边没有 agent 也能测：<span class="mono">glpi-agent --local - --json</span> 会直接把盘点打到屏幕上，可拿来存成文件后导入排查</li>
      </ul>

      <h3 style="margin-top:18px">这台服务器的对接信息</h3>
      <dl class="kv">
        <dt>上报入口</dt><dd class="mono">${esc(ov.endpoint || '')}</dd>
        <dt>局域网入口</dt><dd class="mono">${esc(lanUrl)}</dd>
        <dt>公网入口</dt><dd>${pubCell}</dd>
        <dt>CA 证书指纹</dt><dd class="mono" style="font-size:11px;word-break:break-all">${esc(ov.ca_fingerprint || '—')}</dd>
        <dt>单次上限</dt><dd>${ov.max_bytes ? `${(ov.max_bytes / 1024 / 1024).toFixed(0)} MB` : '—'}</dd>
      </dl>
    </div>`;
}

function bindAgentPane() {
  const only = $('#agentOnly');
  if (only) only.onchange = () => { state.agentQuery = { ...(state.agentQuery || {}), only: only.value }; renderAgentPane(); };
  const q = $('#agentQ');
  const go = () => { state.agentQuery = { only: $('#agentOnly')?.value ?? 'unclaimed', q: $('#agentQ')?.value.trim() || '' }; renderAgentPane(); };
  if (q) q.onkeydown = (e) => { if (e.key === 'Enter') go(); };
  const sb = $('#agentSearch');
  if (sb) sb.onclick = go;
  const monOnly = $('#agentMonOnly');
  if (monOnly) monOnly.onchange = () => { state.agentMonOnly = monOnly.value; renderAgentPane(); };
  const repErr = $('#agentRepErr');
  if (repErr) repErr.onchange = () => { state.agentRepErr = repErr.checked; renderAgentPane(); };
}

window.renderAgent = renderAgent;
window.switchAgentTab = switchAgentTab;
window.openAgentClaim = openAgentClaim;
window.doAgentClaim = doAgentClaim;
window.doAgentUnclaim = doAgentUnclaim;
window.doAgentDelete = doAgentDelete;
window.doAgentSync = doAgentSync;
window.toggleAgentAutoSync = toggleAgentAutoSync;
window.openAgentTokenForm = openAgentTokenForm;
window.createAgentToken = createAgentToken;
window.toggleAgentToken = toggleAgentToken;
window.delAgentToken = delAgentToken;
window.agentInstallCmd = agentInstallCmd;

// 暴露给内联 onclick
window.openDeviceDetail = openDeviceDetail;
// m.js 也用了 openDeviceDetail 这个名字（移动端页面），自动化测试同时加载两个脚本时会被覆盖，
// 所以再挂一个不会撞名的别名给测试用。
window.DeviceDetailAdmin = openDeviceDetail;
window.qrShortCode = qrShortCode;
window.help = help;
window.showHelpTip = showHelpTip;
window.hideHelpTip = hideHelpTip;
window.openDeviceForm = openDeviceForm;
window.openOrgForm = openOrgForm;
window.openCatForm = openCatForm;
window.openQRModal = openQRModal;
window.delOrg = delOrg;
window.delCat = delCat;
window.restoreDevice = restoreDevice;
window.purgeDevice = purgeDevice;
window.openProfile = openProfile;
window.showMyLogins = showMyLogins;
window.editUser = openUserForm;
window.resetUserPw = resetUserPw;
window.unlockUser = unlockUser;
window.approveUser = approveUser;
window.delUser = delUser;
window.openLoginLog = openLoginLog;
window.copyText = copyText;
window.showLiveGuide = showLiveGuide;
window.showMultiSheetGuide = showMultiSheetGuide;
window.copyLiveLink = copyLiveLink;
window.resetLiveToken = resetLiveToken;
window.doLogout = doLogout;
window.switchView = switchView;
window.doExport = doExport;
// 导出卡片上的按钮走 doExportExcel（读 3 个开关 → 转交 doExport）。
// ⚠️ 必须挂在 window 上：内联 onclick="doExportExcel()" 只看全局作用域，
//    漏掉就是「按钮点了没反应」——不报错、控制台也干净。
window.doExportExcel = doExportExcel;
window.backfillThumbs = backfillThumbs;
window.closeModal = closeModal;
// 便于自动化测试
window.renderExcel = renderExcel;
window.bindExcelEvents = bindExcelEvents;
window.photoPanelHTML = photoPanelHTML;
window.donutSVG = donutSVG;
window.legendHTML = legendHTML;

boot();
