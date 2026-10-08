/* ================= ITAM 管理端应用 ================= */
/* 识别链路（压缩 / 方向容错 / 灰度拉伸 / 串行队列）与手机端共用同一份实现，
   见 public/assets/ocr-core.js —— 那边修好的坑这边自动就有了，别在这里再抄一份。 */
import { recognizeFile, runSerial, overallScore, usableResult } from './ocr-core.js';

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
  explorer: "<path d='M3 6.6A2.6 2.6 0 0 1 5.6 4h3.2a2 2 0 0 1 1.6.8l1 1.4a2 2 0 0 0 1.6.8h5.4A2.6 2.6 0 0 1 21 9.6v7.8A2.6 2.6 0 0 1 18.4 20H5.6A2.6 2.6 0 0 1 3 17.4z'/><path d='M8 12.5h8M8 16h5'/>",
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
  'folder-open': "<path d='M3 7.6A2.6 2.6 0 0 1 5.6 5h2.9a2 2 0 0 1 1.6.8l1 1.4a2 2 0 0 0 1.6.8h5.7A2.6 2.6 0 0 1 21 10.6v1.4'/><path d='M2.4 12.2h16.4a2 2 0 0 1 2 2.4l-.9 4.2a2 2 0 0 1-2 1.6H4.9a2 2 0 0 1-2-1.6L2 14.6a2 2 0 0 1 .4-2.4z'/>",
  'arrow-left': "<path d='M15 5.5 8.5 12l6.5 6.5'/>",
  'arrow-right': "<path d='M9 5.5 15.5 12 9 18.5'/>",
  'arrow-up': "<path d='M5.5 15 12 8.5l6.5 6.5'/>",
  pencil: "<path d='M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17z'/><path d='M14.5 5.5l4 4'/>",
  'check-small': "<path d='m5 12.5 4.5 4.5L19 7.5'/>",
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
  // 批量识别录入（设备台账页的弹窗）的整批状态；弹窗关掉时置 null
  batchOcr: null,
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
  { id: 'explorer', label: '资源管理器', ico: 'explorer', group: '资产管理', perm: 'device.read' },
  { id: 'devices', label: '设备台账', ico: 'devices', group: '资产管理', perm: 'device.read' },
  { id: 'orgs', label: '组织架构', ico: 'building', group: '资产管理', perm: 'device.read' },
  { id: 'categories', label: '设备分类', ico: 'folder', group: '资产管理', perm: 'device.read' },
  { id: 'agent', label: '自动盘点', ico: 'refresh', group: '资产管理', perm: 'device.read' },
  { id: 'excel', label: 'Excel 表格', ico: 'sheet', group: '数据', perm: 'excel.export' },
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
  document.body.classList.toggle('view-devices', view === 'devices');
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
    explorer: renderExplorer,
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
  <div class="card device-ledger">
    <div class="toolbar">
      <input id="fKeyword" placeholder="搜索 编号/SN/品牌/型号/使用人…" value="${esc(state.devicesQuery.keyword)}" style="width:240px" />
      <details class="device-filter-panel" open>
        <summary>筛选条件 <span>分类、组织、状态、品牌、供应商</span></summary>
        <div class="fbar">
        <select id="fCategory" style="width:150px"><option value="">全部分类</option>${o.categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
        ${/* ⚠️ 筛选栏这几个 id 不能和编辑弹窗里的字段重名：R=同一个页面上 $('#fBrand') 只会返回 DOM 里第一个
             （也就是筛选栏那个），弹窗保存时读到筛选栏的空值 → 品牌被清空、组织变未分配、状态回落成库存。
             弹窗表单的字段统一用 df_ 前缀，筛选栏保持 f 前缀，两边永不重叠。 */''}
        <select id="fOrg" style="width:210px"><option value="">全部组织</option>${orgOpts}</select>
        <select id="fStatus" style="width:130px"><option value="">全部状态</option>${o.statuses.map((s) => `<option value="${s.id}">${s.label}</option>`).join('')}</select>
        <select id="fBrand" style="width:130px"><option value="">全部品牌</option>${brandOpts}</select>
        <select id="fSupplier" style="width:120px"><option value="">全部供应商</option>${supplierOpts}</select>
        </div>
      </details>
      <button class="btn" id="fSearch">${svgIcon('search')} 查询</button>
      <button class="btn ghost" id="fReset">重置</button>
      <span class="grow"></span>
      ${hasPerm('device.write') ? `<button class="btn" id="btnBatchOcr" title="从电脑里一次选多张铭牌照片，识别后核对、一起入库">${svgIcon('camera')} 批量识别录入</button>` : ''}
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
  // 手机上默认收起低频筛选，首屏只留搜索和主要操作；桌面端仍完整展开。
  const filters = $('.device-filter-panel');
  if (filters && window.matchMedia?.('(max-width: 1100px)').matches) filters.removeAttribute?.('open');
  on('#fReset', 'onclick', () => {
    state.devicesQuery = { page: 1, page_size: 20, keyword: '', category_id: '', org_id: '', status: '', brand: '', supplier: '', sort: 'updated_at', order: 'desc' };
    renderDevices();
  });
  on('#btnAdd', 'onclick', () => openDeviceForm());
  on('#btnBatchOcr', 'onclick', () => openBatchOcr());
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
        <td data-label="" class="keep device-select"><input type="checkbox" class="row-check" value="${d.id}"${state.selection.has(String(d.id)) ? ' checked' : ''}></td>
        <td class="mono dev-asset" style="font-weight:600" data-label="资产编号">${esc(d.asset_no)}</td>
        <td class="dev-category" data-label="分类"><span class="chip">${iconOf(d.category_icon)} ${esc(d.category_name || '未分类')}</span></td>
        <td class="dev-model" data-label="品牌 / 型号">${esc(d.brand || '—')} <span class="muted">${esc(d.model || '')}</span></td>
        <td class="mono muted dev-sn" data-label="SN">${esc(d.sn || '—')}</td>
        <td class="muted dev-org${d.org_path || d.org_name ? '' : ' blank'}" data-label="所属组织">${esc(d.org_path || d.org_name || '—')}</td>
        <td class="dev-owner${d.owner_name ? '' : ' blank'}" data-label="使用人">${esc(d.owner_name || '—')}</td>
        <td class="dev-status" data-label="状态">${statusBadge(d.status)}</td>
        <td class="mut dev-warranty" data-label="保修">${d.warranty_expired === true ? '<span class="tag" style="color:var(--red)">已过期</span>' : d.warranty_expired === false ? `<span class="muted">${fmtDate(d.warranty_until)}</span>` : '<span class="muted">—</span>'}</td>
        <td class="muted dev-updated" data-label="更新时间">${esc((d.updated_at || '').replace('T', ' ').slice(0, 16))}</td>
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

/**
 * 电脑端设备表单里**始终显示**的核心字段（少一个就不知道这行是什么设备）。
 *
 * ⚠️ 这里只留 7 个。以前表单里写死了 30 来个字段（使用人工号、电话、采购、保修、
 *    金额、合同号、成色、备注、IP、MAC、系统、CPU、内存、硬盘…），用户的原话是
 *    「设备分类里没有这些字段，为什么还要加在这里」——
 *    现在这些字段统一由「设备分类 → 专属字段」管理：配了就出现在「专属字段」区，
 *    没配就收进表单底部的折叠区「其他字段」（仍在 DOM 里，所以**不会丢已有数据**）。
 */
const DEVICE_FORM_CORE_KEYS = ['asset_no', 'brand', 'model', 'sn', 'category_id', 'org_id', 'status'];

/**
 * 「其他字段」的定义：设备表里有、但分类没点名的那些。
 * 折叠收起，不占地方；但一定要渲染出来 —— 已存的数据得能看能改，
 * 而且表单不渲染的字段虽然服务端会保留原值，用户却再也没法修改它了。
 */
const OPTIONAL_FIELD_DEFS = [
  { key: 'owner_name', label: '使用人', type: 'text' },
  { key: 'owner_employee_no', label: '使用人工号', type: 'text' },
  { key: 'owner_phone', label: '使用人电话', type: 'text' },
  { key: 'location', label: '存放位置', type: 'text' },
  { key: 'ip_address', label: 'IP 地址', type: 'text' },
  { key: 'mac_address', label: 'MAC 地址', type: 'text' },
  { key: 'os_name', label: '操作系统', type: 'text' },
  { key: 'cpu', label: 'CPU', type: 'text' },
  { key: 'memory', label: '内存', type: 'text' },
  { key: 'disk', label: '硬盘', type: 'text' },
  { key: 'screen_size', label: '屏幕尺寸', type: 'text' },
  { key: 'purchase_date', label: '采购日期', type: 'date' },
  { key: 'warranty_until', label: '保修到期', type: 'date' },
  { key: 'purchase_price', label: '采购金额', type: 'number' },
  { key: 'supplier', label: '供应商', type: 'supplier' },
  { key: 'contract_no', label: '合同号', type: 'text' },
  { key: 'condition_grade', label: '成色', type: 'grade' },
  { key: 'remark', label: '备注', type: 'textarea' },
];

/** 该分类该渲染哪些专属字段（剔除表单顶部已有固定输入框的核心字段） */
function formTrackingFields(cat) {
  return (cat?.tracking_fields || []).filter((t) => t && t.key && !DEVICE_FORM_CORE_KEYS.includes(t.key));
}

/** 该分类没点名、因而收进折叠区的「其他字段」 */
function optionalFieldsFor(cat) {
  const configured = new Set((cat?.tracking_fields || []).filter((f) => f && f.key).map((f) => f.key));
  return OPTIONAL_FIELD_DEFS.filter((d) => !configured.has(d.key));
}

/**
 * 专属字段的默认值（管理端在「设备分类 → 专属字段 → 默认值」里配）。
 * 下拉字段只在默认值确实在选项里时才用，否则等于选了个不存在的值。
 */
function fieldDefault(t) {
  const d = t?.default === undefined || t?.default === null ? '' : String(t.default);
  if (!d) return '';
  if (t.type === 'select') return (Array.isArray(t.options) && t.options.includes(d)) ? d : '';
  return d;
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
  const catObj = state.options.categories.find((c) => c.id === cat);
  return `
    <div class="form-grid">
      <div class="field"><label>资产编号 <span class="req">*</span></label>
        <input id="df_asset_no" value="${esc(dev?.asset_no || '')}" placeholder="留空自动生成"></div>
      <div class="field"><label>设备分类 <span class="req">*</span></label>
        <select id="df_cat">${o.categories.map((c) => `<option value="${c.id}" ${c.id === cat ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
      <div class="field"><label>品牌</label><input id="df_brand" list="brandList" value="${esc(dev?.brand || '')}" placeholder="Dell / 联想 / HP…">
        <datalist id="brandList">${o.brands.map((b) => `<option value="${esc(b.v)}">`).join('')}</datalist></div>
      <div class="field"><label>型号</label><input id="df_model" value="${esc(dev?.model || '')}" placeholder="如 U2723QE"></div>
      <div class="field"><label>SN 序列号</label><input id="df_sn" value="${esc(dev?.sn || '')}" placeholder="设备唯一序列号"></div>
      <div class="field"><label>所属组织</label><select id="df_org"><option value="">未分配</option>${o.orgs.map((x) => `<option value="${x.id}" ${dev?.org_id === x.id ? 'selected' : ''}>${esc(x.path || x.name)}</option>`).join('')}</select></div>
      <div class="field"><label>状态</label><select id="df_status">${o.statuses.map((s) => `<option value="${s.id}" ${dev?.status === s.id ? 'selected' : ''}>${s.label}</option>`).join('')}</select></div>

      <div class="full" style="grid-column:1/-1" id="catFieldsSlot">${catFieldsHTML(dev, catObj)}</div>
      <div class="full" style="grid-column:1/-1" id="optFieldsSlot">${optFieldsHTML(dev, catObj)}</div>
    </div>`;
}

/** 「设备分类 → 专属字段」区：这个分类配了什么就渲染什么（顺序也按配置来） */
function catFieldsHTML(dev, catObj) {
  const tracking = formTrackingFields(catObj);
  if (!tracking.length) {
    return `<p class="muted" style="margin:10px 0 0">「${esc(catObj?.name || '该分类')}」没有配置专属字段。
      需要加字段（比如使用人、CPU、屏幕尺寸）就到 <b>设备分类 → 编辑 → 专属字段</b> 里加。</p>`;
  }
  return `<h3 style="margin:10px 0 12px">${esc(catObj?.name || '')} 专属字段</h3>
    <div class="form-grid">${tracking.map((t) => `
      <div class="field"><label>${esc(t.label)}</label>${trackingInputHTML(t, trackingValue(dev, t) || (dev ? '' : fieldDefault(t)))}</div>`).join('')}</div>`;
}

/**
 * 折叠区「其他字段」：分类没点名的设备字段。
 * 仍然是真输入框（只是收起来了），所以：已存的值能看能改，绝不会因为"界面上没有"而被清掉。
 */
function optFieldsHTML(dev, catObj) {
  const list = optionalFieldsFor(catObj);
  if (!list.length) return '';
  return `<details class="field-extra">
    <summary>其他字段（未在「设备分类」里配置，一般不用填）</summary>
    <div class="form-grid" style="margin-top:10px">
      ${list.map((d) => `<div class="field${d.type === 'textarea' ? ' full' : ''}"><label>${esc(d.label)}</label>${optionalFieldInputHTML(d, dev)}</div>`).join('')}
    </div>
  </details>`;
}

/** 折叠区字段的输入控件（供应商 / 成色是下拉，备注是文本域，其余按类型） */
function optionalFieldInputHTML(d, dev) {
  const id = `o_${d.key}`;
  const v = dev?.[d.key];
  const val = v === null || v === undefined ? '' : String(v);
  if (d.type === 'textarea') {
    return `<textarea id="${id}" rows="2">${esc(val)}</textarea>`;
  }
  if (d.type === 'supplier') {
    const opts = [...new Set([...(state.options.suppliers || []), ...(val ? [val] : [])])];
    return `<select id="${id}"><option value="">— 未指定 —</option>
      ${opts.map((s) => `<option value="${esc(s)}" ${val === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>`;
  }
  if (d.type === 'grade') {
    return `<select id="${id}"><option value="">—</option>
      ${['A', 'B', 'C'].map((g) => `<option value="${g}" ${val === g ? 'selected' : ''}>${g}</option>`).join('')}</select>`;
  }
  const type = d.type === 'date' ? 'date' : d.type === 'number' ? 'number' : 'text';
  const step = d.type === 'number' ? ' step="0.01"' : '';
  return `<input id="${id}" type="${type}"${step} value="${esc(val)}">`;
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
  // 换分类：只重建「专属字段区 + 其他字段区」，**不动上面已填好的核心字段**
  // （整表单重绘会把用户刚敲的品牌/SN 抹掉）
  $('#df_cat').onchange = () => {
    const catObj = state.options.categories.find((c) => c.id === $('#df_cat').value);
    const cs = $('#catFieldsSlot');
    if (cs) cs.innerHTML = catFieldsHTML(dev, catObj);
    const os = $('#optFieldsSlot');
    if (os) os.innerHTML = optFieldsHTML(dev, catObj);
  };
  $('#devSave').onclick = async () => {
    const cat = $('#df_cat').value;
    const catObj = state.options.categories.find((c) => c.id === cat);
    const tracking = formTrackingFields(catObj);
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
      asset_no: $('#df_asset_no').value.trim(),
      brand: $('#df_brand').value.trim(), model: $('#df_model').value.trim(), sn: $('#df_sn').value.trim(),
      org_id: $('#df_org').value || null, status: $('#df_status').value,
      ...columnValues,
      extra,
    };
    /*
     * 折叠区「其他字段」：**只有真的渲染出来的才提交**。
     * 没渲染的字段一律不带 key → 服务端 normalizeDeviceInput(input, cur) 会沿用它原来的值，
     * 所以"界面上没有"永远不会变成"把数据清空"。
     */
    for (const d of optionalFieldsFor(catObj)) {
      const el = $(`#o_${d.key}`);
      if (!el) continue;
      const raw = String(el.value ?? '');
      if (d.type === 'number') payload[d.key] = raw === '' ? null : Number(raw);
      else if (d.type === 'date') payload[d.key] = raw || null;
      else payload[d.key] = raw;
    }
    try {
      if (dev) await api('/devices/' + dev.id, { method: 'PUT', body: JSON.stringify(payload) });
      else await api('/devices', { method: 'POST', body: JSON.stringify(payload) });
      toast(dev ? '已保存' : '已新增设备');
      closeModal();
      loadDevices();
    } catch (e) { toast(e.message, 'error'); }
  };
}

/* ==================================================================== *
 * 批量识别录入（设备台账右上角）
 *
 * 手机端「批量识别入库」的电脑版：从资源管理器一次多选铭牌照片，
 * 走**同一条**识别链路（ocr-core.js 的 recognizeFile），结果先进核对表格，
 * 修改、勾选之后再逐条 POST /devices。
 *
 * 与 Excel 导入的分工：
 *   · 手上是**照片** → 用这里（Excel 导入要求先把字段填进表格）；
 *   · 手上是别人填好的**表格** → 走 Excel 导入，别绕照片一圈。
 *
 * ⚠️ 必须**串行**（runSerial）：GLM-4.6V-Flash 这类免费视觉模型限的是并发
 *    （国际站 1、国内站 3），并发上传会被上游直接拒，界面只显示「没读出内容」。
 *
 * ⚠️ 一行里的输入框只是 state 的投影（值写进 item.edit），提交时读 state 不读 DOM。
 *    这样中途重绘表格不会把用户已经改好的内容冲掉。
 * ==================================================================== */

/**
 * 电脑端一次最多几张。比手机端（30）放宽，因为两边的**约束条件根本不同**：
 *   手机：页面得全程亮着不能锁屏，30 张最坏 120 次调用已经接近「一次操作」的上限；
 *   电脑：不会锁屏，窗口可以后台开着，100 张最坏 400 次调用只是「挂一会儿」。
 *
 * 为什么是 100 而不是更大：真正会先撞到的不是服务端（串行一次只发一张，单请求 48MB /
 * 64 段 / 240 次每分钟 / OCR 闸门 6 并发一个都够用），而是**上游免费额度和用户耐心**
 * ——100 张最坏 400 次调用，按十几分钟到半小时量级算，再长就该分批多跑几次了。
 *
 * ⚠️ 超限是 `slice()` **直接丢弃**，不是排队等候。所以 `startBatchOcr()` 里那条提示
 * 必须说清「有几张没进来」，不然用户以为 150 张都在处理。
 */
const ADMIN_BATCH_MAX = 100;

const BATCH_TEXT = {
  pending: '等待识别', processing: '识别中…', ok: '已读出', weak: '没读全，请核对', error: '识别失败', saved: '已入库',
};

function openBatchOcr() {
  if (!hasPerm('device.write')) { toast('没有「新增设备」权限', 'warn'); return; }
  const firstCat = state.options?.categories?.[0]?.id || '';
  state.batchOcr = {
    items: [], total: 0, dropped: 0, running: false, phase: 'pick',
    supplier: '', ctrl: null, firstCat,
  };
  renderBatchOcrModal();
}

/**
 * 关弹窗：把还在飞的识别请求掐掉，别留一个后台队列在跑。
 *
 * ⚠️ 有「已识别、还没入库」的项时**先问一句**。100 张的批次可能已经跑了十几分钟、
 *    烧掉几百次识别调用，手一滑点了关闭就全没了 —— 而且他得回资源管理器重新挑同样的照片。
 *    没东西可丢时不多问（选文件阶段、全部入完库之后都直接关，别让确认框变成噪音）。
 *
 * ⚠️ `confirmBox` 借用的是**同一个 `#modal`**，会把批量弹窗整个顶掉，而且它两个按钮
 *    都会 `closeModal()`。所以「取消」之后必须把批量弹窗重新画回来，否则用户会以为
 *    「点了取消结果还是被关掉了」。
 */
async function closeBatchOcr() {
  const b = state.batchOcr;
  if (b) {
    const unsaved = batchOcrUnsaved(b);
    if (unsaved) {
      const ok = await confirmBox('放弃这批识别', `还有 ${unsaved} 张已经识别好、但没入库。关掉就没了 —— 得重新选一遍照片、再识别一次。确定放弃吗？`);
      // 等用户点确认的这几秒里，批次可能已经被换掉或清掉了，那就别再动手
      if (state.batchOcr !== b) return;
      if (!ok) { renderBatchOcrModal(); return; }
    }
    b.ctrl?.abort();
    state.batchOcr = null;
  }
  closeModal();
  if (state.view === 'devices') loadDevices();   // 入过库就顺手刷新台账
}

/**
 * 「识别好了、还没入库」的项数 —— 离开就会白丢的那些。
 * 只算 ok / weak：error 本来就没结果可丢，pending / processing 还没跑出东西。
 */
function batchOcrUnsaved(b) {
  return (b?.items || []).filter((it) => it.status === 'ok' || it.status === 'weak').length;
}

function renderBatchOcrModal() {
  openModal(batchOcrModalHTML(), { wide: true });
  bindBatchOcrModal();
}

/**
 * 「这次有几张没进来」的常驻提示（只在真的丢过东西时出现）。
 *
 * 和 `startBatchOcr()` 里那条 toast 是**两件事**，别合并：
 *   - toast 负责「当场告诉你」（3.2 秒后自己消失）；
 *   - 这条负责「回头看还在」。用户框选了 150 张，很可能没盯着那 3 秒的提示，
 *     等识别跑完才发现只有 100 张 —— 那时候他需要的是页面上写着「还有 50 张没进来」。
 */
function batchDroppedNote(b) {
  if (!b || !b.dropped) return '';
  return `<div class="batch-drop-note">${svgIcon('alert', 14)}
    <span>还有 <b>${b.dropped}</b> 张没有加进来（一次最多 ${ADMIN_BATCH_MAX} 张）。这批处理完再选一次即可。</span>
  </div>`;
}

/**
 * 弹窗内容（三个阶段共用一个函数）。
 * ⚠️ 三种阶段的元素 id 都写在这一个渲染单元里，check-ids 才只把它们当成一组 ——
 *    拆成三个函数的话，同名的 id 会被判成「同屏会互相抢」。
 */
function batchOcrModalHTML() {
  const b = state.batchOcr;
  const head = `<div class="modal-head"><h2>批量识别录入</h2><button class="modal-close" onclick="closeBatchOcr()">×</button></div>`;

  if (!b || b.phase === 'pick') {
    return `${head}
      <div class="modal-body">
        <p class="hint" style="margin-top:0">
          从电脑里一次多选铭牌照片（按住 <b>Ctrl</b> / <b>Shift</b> 点选，或在文件夹里直接框选）。
          系统会<b>一张一张地</b>识别 —— 上游视觉模型限的是并发，一起传只会被拒。
          识别完在下面核对、修改，再勾选一起入库。
        </p>
        <div class="batch-drop" id="batchOcrDrop">
          <input type="file" id="batchOcrFiles" accept="image/*" multiple>
          <div class="batch-drop-hint">支持 JPG / PNG / WebP。<b>也可以直接把照片从资源管理器拖进来</b>。倒置、横放、拍歪的照片会自动转正后再识别。</div>
        </div>
        <p class="hint">
          这里只识别「品牌 / 型号 / SN」，其余字段在下一屏统一设置。
          使用人、存放位置这类分类专属字段，入库后可以用台账的
          <b>批量操作 → 交接使用人 / 转移到组织</b> 整批补上。
        </p>
      </div>
      <div class="modal-foot">
        <button class="btn" onclick="closeBatchOcr()">关闭</button>
      </div>`;
  }

  if (b.phase === 'run') {
    return `${head}
      <div class="modal-body">
        <div class="batch-bar"><i id="batchOcrBarFill"></i></div>
        <div class="batch-sum" id="batchOcrStat"></div>
        ${batchDroppedNote(b)}
        <div class="batch-list" id="batchOcrList">${adminBatchListHTML(b)}</div>
      </div>
      <div class="modal-foot">
        <span class="muted">识别期间可以关掉这个窗口，已读到的不受影响</span>
        <button class="btn" id="batchOcrCancel">中止识别</button>
      </div>`;
  }

  const n = adminPickCount(b);
  const weak = b.items.filter((it) => it.status === 'weak').length;
  const bad = b.items.filter((it) => it.status === 'error').length;
  const saved = b.items.filter((it) => it.status === 'saved').length;
  const read = b.items.filter((it) => ['ok', 'weak', 'saved'].includes(it.status)).length;
  const allOn = adminSelectable(b).length > 0 && adminSelectable(b).every((it) => it.include);
  return `${head}
    <div class="modal-body">
      <div class="batch-sum">
        共 ${b.total} 张：读到 <b>${read}</b> 张${weak ? `（其中 ${weak} 张没读全）` : ''}${bad ? `，<b style="color:var(--red)">${bad} 张失败</b>` : ''}${saved ? `，已入库 ${saved} 台` : ''}。
        照着每张的照片核对一遍再勾选 —— 识别只是初稿，SN 最容易看错（L/1、O/Q）。
      </div>
      ${batchDroppedNote(b)}
      <div class="batch-tools">
        <label class="sw-inline"><input type="checkbox" id="batchOcrAll" ${allOn ? 'checked' : ''}> 全选可入库的</label>
        <label class="sw-inline">供应商
          <select id="batchOcrSupplier"><option value="">— 未指定 —</option>
            ${(state.options.suppliers || []).map((s) => `<option value="${esc(s)}" ${s === b.supplier ? 'selected' : ''}>${esc(s)}</option>`).join('')}
          </select>
        </label>
        ${bad ? `<button class="btn sm" id="batchOcrRetry">${svgIcon('refresh', 14)} 重试 ${bad} 张</button>` : ''}
        <span class="grow"></span>
        <span class="muted" id="batchOcrPicked">已勾选 ${n} 台</span>
      </div>
      <div class="table-wrap batch-tablewrap">
        <table class="grid batch-grid">
          <thead><tr>
            <th style="width:34px"></th>
            <th style="width:70px">照片</th>
            <th>品牌</th>
            <th>型号</th>
            <th>SN 序列号</th>
            <th style="width:140px">分类</th>
            <th style="width:180px">所属组织</th>
            <th style="width:110px">状态</th>
            <th style="width:150px">识别结果</th>
          </tr></thead>
          <tbody id="batchOcrBody">${adminBatchRowsHTML(b)}</tbody>
        </table>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="closeBatchOcr()">取消</button>
      <button class="btn primary" id="batchOcrCommit" ${n ? '' : 'disabled'}>${svgIcon('save', 15)} 批量入库（${n} 台）</button>
    </div>`;
}

function batchOcrCatOptions(it) {
  return (state.options.categories || []).map((c) => `<option value="${c.id}" ${c.id === it.edit.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
}

/** 核对表格的每一行。失败的没有输入框（填了也提交不出照片），只说明原因。 */
function adminBatchRowsHTML(b) {
  return b.items.map((it) => {
    const r = it.result;
    const bad = it.status === 'error';
    const saved = it.status === 'saved';
    const src = r?.image_path || r?.thumb_path || '';
    if (bad) {
      return `<tr data-bid="${esc(it.id)}" class="batch-bad">
        <td data-label="" class="keep"></td>
        <td data-label="照片" class="keep"></td>
        <td colspan="6" data-label="识别失败"><span style="color:var(--red)">${esc(it.error || '识别失败')}（${esc(it.name)}）</span></td>
        <td data-label="" class="keep"></td>
      </tr>`;
    }
    return `<tr data-bid="${esc(it.id)}" class="${saved ? 'batch-saved' : ''}">
      <td data-label="" class="keep"><input type="checkbox" class="batch-ck" data-bid="${esc(it.id)}" ${it.include && !saved ? 'checked' : ''} ${saved ? 'disabled' : ''}></td>
      <td data-label="照片" class="keep">${src ? `<img class="batch-thumb" src="${esc(src)}" alt="${esc(it.name)}" loading="lazy">` : '<span class="muted">—</span>'}</td>
      <td data-label="品牌"><input class="batch-in" data-f="brand" data-bid="${esc(it.id)}" value="${esc(it.edit.brand)}" placeholder="品牌"></td>
      <td data-label="型号"><input class="batch-in" data-f="model" data-bid="${esc(it.id)}" value="${esc(it.edit.model)}" placeholder="型号"></td>
      <td data-label="SN 序列号"><input class="batch-in mono" data-f="sn" data-bid="${esc(it.id)}" value="${esc(it.edit.sn)}" placeholder="序列号"></td>
      <td data-label="分类"><select class="batch-in" data-f="category_id" data-bid="${esc(it.id)}">${batchOcrCatOptions(it)}</select></td>
      <td data-label="所属组织"><select class="batch-in" data-f="org_id" data-bid="${esc(it.id)}">
        <option value="">未分配</option>
        ${(state.options.orgs || []).map((o) => `<option value="${o.id}" ${o.id === it.edit.org_id ? 'selected' : ''}>${esc(o.path || o.name)}</option>`).join('')}
      </select></td>
      <td data-label="状态"><select class="batch-in" data-f="status" data-bid="${esc(it.id)}">
        ${(state.options.statuses || []).map((s) => `<option value="${s.id}" ${s.id === it.edit.status ? 'selected' : ''}>${s.label}</option>`).join('')}
      </select></td>
      <td data-label="识别结果" class="batch-flags">
        ${saved ? `<span class="tag" style="color:var(--green)">${esc(it.note || '已入库')}</span>` : ''}
        ${it.note && !saved ? `<span class="tag" style="color:var(--red)">${esc(it.note)}</span>` : ''}
        <span class="muted" style="font-variant-numeric:tabular-nums">置信度 ${Math.round(overallScore(r) * 100)}%</span>
        ${it.status === 'weak' ? '<span class="tag" style="color:var(--amber)">没读全</span>' : ''}
        ${r?.duplicate?.exists ? '<span class="tag" style="color:var(--amber)">SN 已存在</span>' : ''}
        ${r?.rotate_angle ? `<span class="tag">已转正 ${r.rotate_angle}°</span>` : ''}
      </td>
    </tr>`;
  }).join('');
}

function adminBatchListHTML(b) {
  return b.items.map((it, i) => `
    <div class="batch-line ${esc(it.status)}">
      <span class="batch-no">${i + 1}</span>
      <span class="batch-line-txt">
        <span class="bn">${esc(it.name)}</span>
        <span class="bs">${esc(it.stage || it.error || BATCH_TEXT[it.status] || '')}</span>
      </span>
    </div>`).join('');
}

function adminFinished(b) {
  return (b?.items || []).filter((it) => it.status !== 'pending' && it.status !== 'processing').length;
}

/** 可勾选的项：识别失败的没照片可挂，已入库的不该再提交一次 */
function adminSelectable(b) {
  return (b?.items || []).filter((it) => it.status !== 'error' && it.status !== 'saved');
}

function adminPickCount(b) {
  return adminSelectable(b).filter((it) => it.include).length;
}

/** 弹窗里所有交互都在这儿挂：整块 innerHTML 换过之后要重新挂一次 */
function bindBatchOcrModal() {
  const b = state.batchOcr;
  if (!b) return;

  const files = $('#batchOcrFiles');
  if (files) {
    files.onchange = () => {
      const all = [...(files.files || [])];
      const imgs = all.filter((f) => !f.type || f.type.startsWith('image/'));
      if (!imgs.length) { toast(all.length ? '这些不是图片文件' : '没有选到图片', 'warn'); return; }
      startBatchOcr(imgs);
    };
  }
  const cancel = $('#batchOcrCancel');
  if (cancel) cancel.onclick = () => closeBatchOcr();
  const retry = $('#batchOcrRetry');
  if (retry) retry.onclick = () => batchOcrRetryFailed();
  const all = $('#batchOcrAll');
  if (all) all.onchange = () => batchOcrToggleAll(all.checked);
  const sup = $('#batchOcrSupplier');
  if (sup) sup.onchange = () => { if (state.batchOcr) state.batchOcr.supplier = sup.value; };
  const commit = $('#batchOcrCommit');
  if (commit) commit.onclick = () => batchOcrSaveAll();

  bindBatchOcrDrop();

  // 行内输入：值是 state 的投影，边敲边写回 item.edit
  $$('#batchOcrBody .batch-in').forEach((el) => {
    const write = () => {
      const cur = state.batchOcr;
      if (!cur) return;
      const it = cur.items.find((x) => x.id === el.dataset.bid);
      if (it) it.edit[el.dataset.f] = String(el.value ?? '');
    };
    el.oninput = write;
    el.onchange = write;
  });
  $$('#batchOcrBody .batch-ck').forEach((el) => {
    el.onchange = () => {
      const cur = state.batchOcr;
      if (!cur) return;
      const it = cur.items.find((x) => x.id === el.dataset.bid);
      if (it) it.include = !!el.checked;
      paintBatchOcrFoot();
    };
  });
}

/**
 * 让它配得上那圈虚线框：资源管理器里把照片**直接拖进来**。
 *
 * 为什么非做不可：虚线框在电脑上就是「拖到这儿」的通用语。用户（尤其这个功能的目标用户
 * ——刚拆箱、手上是相机导出来的一堆图）看到虚线框第一反应就是拖，拖不进就会认为功能坏了。
 * 宁可不画虚线框，也别画了不认。
 *
 * ⚠️ `dragover` 必须 `preventDefault()`：不调的话浏览器**根本不允许放下**（连光标都不会变）。
 * ⚠️ `drop` 也必须 `preventDefault()`：不然浏览器会拿那张图把当前页面顶掉（直接跳转去打开图片）。
 *    这两条一旦漏了，功能是「拖了没反应」或者「页面被图顶掉」，而且都不报错。
 *
 * 拖文件夹不做展开（File System Access / webkitGetAsEntry 各家行为不一致，收益不值这个复杂度）：
 * 文件夹会被当成一个没有类型的条目送进队列，识别时明确报「无法读取该图片」，不会被静默吞掉。
 */
function bindBatchOcrDrop() {
  const box = $('#batchOcrDrop');
  const files = $('#batchOcrFiles');
  if (!box) return;
  const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
  const hint = (on) => box.classList.toggle('over', on);
  const imgsOf = (dt) => [...(dt?.files || [])].filter((f) => !f.type || f.type.startsWith('image/'));

  box.addEventListener('dragenter', (e) => { stop(e); hint(true); });
  box.addEventListener('dragover', (e) => {
    stop(e);
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';   // 光标显示「复制」而不是「禁止」
    hint(true);
  });
  // relatedTarget 挪到框外才撤高亮：不然在框内两个子元素之间移动会闪
  box.addEventListener('dragleave', (e) => { stop(e); if (!box.contains(e.relatedTarget)) hint(false); });
  box.addEventListener('drop', (e) => {
    stop(e);
    hint(false);
    const b = state.batchOcr;
    if (!b || b.running) return;          // 已经在跑了就别再塞一批
    const dropped = [...(e.dataTransfer?.files || [])];
    const imgs = imgsOf(e.dataTransfer);
    if (!imgs.length) { toast(dropped.length ? '拖进来的不是图片文件' : '没有拖进来文件', 'warn'); return; }
    // 顺手同步到文件框：用户能直观看到「这次选了哪几个」
    try { if (files) files.files = e.dataTransfer.files; } catch { /* 个别浏览器不给赋值，不影响识别 */ }
    startBatchOcr(imgs);
  });
}

function paintBatchOcrFoot() {
  const b = state.batchOcr;
  if (!b) return;
  const n = adminPickCount(b);
  const picked = $('#batchOcrPicked');
  if (picked) picked.textContent = `已勾选 ${n} 台`;
  const btn = $('#batchOcrCommit');
  if (btn) { btn.disabled = !n; btn.innerHTML = `${svgIcon('save', 15)} 批量入库（${n} 台）`; }
}

function batchOcrToggleAll(on) {
  const b = state.batchOcr;
  if (!b) return;
  for (const it of adminSelectable(b)) it.include = on;
  $$('#batchOcrBody .batch-ck').forEach((el) => { el.checked = on; });
  paintBatchOcrFoot();
}

/* ---------- 跑识别 ---------- */

function startBatchOcr(files) {
  const b = state.batchOcr;
  if (!b || b.running) return;
  // ⚠️ 超限是直接丢弃不是排队。丢了多少必须**留在 state 上**（不只是弹一条 3 秒的提示）：
  //    提示一闪而过，而用户很可能正是从资源管理器框选了 150 张的人 ——
  //    他不盯着屏幕就只会看到「处理完了」，以为 150 张都进来了。
  const dropped = Math.max(0, files.length - ADMIN_BATCH_MAX);
  const list = files.slice(0, ADMIN_BATCH_MAX);
  const stamp = Date.now();
  b.items = list.map((f, i) => ({
    id: `b${stamp}_${i}`,
    file: f,
    name: (f.name || '').trim() || `照片 ${i + 1}`,
    status: 'pending',
    stage: '',
    error: '',
    result: null,
    include: true,
    note: '',
    edit: { brand: '', model: '', sn: '', category_id: b.firstCat, org_id: '', status: 'in_use' },
  }));
  b.total = list.length;
  b.dropped = dropped;
  b.phase = 'run';
  b.ctrl = new AbortController();
  if (dropped) toast(`一次最多 ${ADMIN_BATCH_MAX} 张：这次只收下前 ${ADMIN_BATCH_MAX} 张，剩下 ${dropped} 张没有进来`, 'warn');
  renderBatchOcrModal();
  runBatchOcrQueue(b.items);
}

async function runBatchOcrQueue(subset) {
  const b = state.batchOcr;
  if (!b || b.running) return;
  const mine = b;
  mine.running = true;
  mine.phase = 'run';
  renderBatchOcrModal();

  const paint = () => {
    const fill = $('#batchOcrBarFill');
    if (fill) fill.style.width = `${Math.round((adminFinished(mine) / Math.max(1, mine.total)) * 100)}%`;
    const stat = $('#batchOcrStat');
    if (stat) stat.textContent = `已识别 ${adminFinished(mine)} / ${mine.total}`;
    const list = $('#batchOcrList');
    if (list) list.innerHTML = adminBatchListHTML(mine);
  };
  paint();

  const operator = state.auth?.display_name || state.auth?.username || 'desktop';
  await runSerial(subset || mine.items, async (it) => {
    it.status = 'processing';
    it.stage = '正在读取图片…';
    it.error = '';
    paint();
    const r = await recognizeFile(it.file, {
      operator,
      loginNext: '/',
      signal: mine.ctrl?.signal,
      onStage: (m) => { it.stage = m; paint(); },
    });
    it.result = r;
    it.status = usableResult(r) ? 'ok' : 'weak';
    it.stage = '';
    // 识别出来的值灌进 edit，之后用户改的是 edit
    it.edit = { ...it.edit, brand: r.brand || '', model: r.model || '', sn: r.sn || '' };
    // 「没读全」的（没有 SN）默认不勾：勾了也提交不了。补上 SN 后自己勾，或点「全选可入库的」。
    it.include = !!String(it.edit.sn).trim();
  }, {
    // 用户把弹窗关了就别再往服务器打请求
    shouldContinue: () => state.batchOcr === mine,
    onDone: (it, i, err) => {
      // 失败要当场落到 error 上：runSerial 只管记 item.error 不管 status，
      // 漏了这一步这一行会永远停在 processing（转圈 + 被算进可勾选）
      if (err) { it.status = 'error'; it.stage = ''; }
      paint();
    },
  });

  if (state.batchOcr !== mine) return;
  mine.running = false;
  mine.phase = 'review';
  renderBatchOcrModal();
}

/** 只重试识别失败的（网络/服务端问题重试有意义；「没读全」的得人工补） */
function batchOcrRetryFailed() {
  const b = state.batchOcr;
  if (!b || b.running) return;
  const failed = b.items.filter((it) => it.status === 'error');
  if (!failed.length) { toast('没有识别失败的项目', 'warn'); return; }
  for (const it of failed) { it.status = 'pending'; it.error = ''; it.stage = ''; }
  runBatchOcrQueue(failed);
}

/* ---------- 提交入库 ---------- */

async function batchOcrSaveAll() {
  const b = state.batchOcr;
  if (!b || b.running) return;
  const picks = adminSelectable(b).filter((it) => it.include);
  if (!picks.length) { toast('还没有勾选任何一台', 'warn'); return; }
  const missing = picks.filter((it) => !String(it.edit.sn || '').trim());
  if (missing.length) { toast(`有 ${missing.length} 台还没填 SN，请先补上`, 'warn'); return; }

  const btn = $('#batchOcrCommit');
  if (btn) btn.disabled = true;
  let ok = 0; let fail = 0; let toasted = false;
  for (let i = 0; i < picks.length; i++) {
    const it = picks[i];
    if (btn) btn.textContent = `入库中 ${i + 1}/${picks.length}…`;
    try {
      const payload = {
        brand: it.edit.brand || '',
        model: it.edit.model || '',
        sn: String(it.edit.sn).trim(),
        category_id: it.edit.category_id || '',
        org_id: it.edit.org_id || null,
        supplier: b.supplier || null,
        status: it.edit.status || 'in_use',
        sn_source: it.result?.mocked ? 'ocr-mock' : 'ocr',
        ocr_confidence: Math.max(it.result?.sn_confidence, it.result?.brand_confidence),
        photo_path: it.result?.image_path || null,
        sn_photo_path: it.result?.image_path || null,
        photo_original_path: it.result?.original_path || it.result?.image_path || null,
        photo_thumb_path: it.result?.thumb_path || null,
        ocr_raw: JSON.stringify({
          provider: it.result?.provider, brand: it.result?.brand, model: it.result?.model,
          sn: it.result?.sn, lines: (it.result?.lines || []).slice(0, 30),
        }),
        operator: state.auth?.display_name || state.auth?.username || 'desktop',
      };
      const dev = await api('/devices', { method: 'POST', body: JSON.stringify(payload) });
      it.status = 'saved';
      it.include = false;
      it.note = `已入库 ${dev.asset_no}`;
      ok++;
    } catch (e) {
      fail++;
      it.note = e.message.includes('已存在') || e.message.includes('409')
        ? 'SN 已存在，没入库'
        : `入库失败：${e.message}`;
      if (!toasted) { toast(it.note, 'error'); toasted = true; }
    }
  }
  if (fail) toast(`已入库 ${ok} 台，${fail} 台没成功`, ok ? 'warn' : 'error');
  else toast(`已全部入库：${ok} 台`);
  renderBatchOcrModal();
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
  // 新建分类时预填两个最常用的字段：它们原来是手机端写死的输入框，
  // 现在归分类管 —— 预填好，不想要的人自己删掉即可。
  const DEFAULT_OWNER_FIELDS = [
    { key: 'owner_name', label: '使用人', type: 'text' },
    { key: 'location', label: '存放位置', type: 'text' },
  ];
  const fields = cur ? (cur.tracking_fields || []) : DEFAULT_OWNER_FIELDS;
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
        <div class="field full"><label>专属字段${help('这个分类特有的属性，在电脑端和手机端录入时都会自动出现。\n留空则那个字段不显示；改名只影响界面显示。\n\n以下 key 会写进设备的正式字段（推荐直接用它们）：\nowner_name 使用人 · location 存放位置 · cpu · memory · disk · os_name · ip_address · mac_address · screen_size · supplier · remark\n其它 key 存进扩展字段，导出 Excel 时同样成列。')}</label>
          <div id="trackFields">${fields.map((f, i) => trackFieldHTML(i, f)).join('')}</div>
          <datalist id="trackKeyList">
            ${['owner_name', 'location', 'cpu', 'memory', 'disk', 'os_name', 'ip_address', 'mac_address',
    'screen_size', 'resolution', 'interface', 'supplier', 'remark', 'imei', 'phone_no',
    'print_type', 'ports', 'rack_no'].map((k) => `<option value="${k}"></option>`).join('')}
          </datalist>
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
      // 默认值：下拉字段只在它确实是选项之一时才存（否则等于选了个不存在的值）
      const dv = ($(`.tf-default`, r)?.value || '').trim();
      if (dv && (type !== 'select' || options.includes(dv))) f.default = dv;
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
    <input class="tf-key" list="trackKeyList" placeholder="字段 key" value="${esc(f.key)}" style="flex:1;min-width:110px" title="数据库字段标识（英文）。下面这些会写进设备的正式字段：owner_name 使用人 / location 存放位置 / cpu / memory / disk / os_name / ip_address / mac_address / screen_size">
    <input class="tf-label" placeholder="显示名" value="${esc(f.label)}" style="flex:1.2;min-width:110px" title="录入界面显示的名称（手机端、电脑端都用它）">
    <select class="tf-type" style="width:104px" onchange="this.parentElement.querySelector('.tf-opts').style.display = (this.value === 'select' ? '' : 'none')">
      <option value="text" ${f.type === 'text' ? 'selected' : ''}>文本</option>
      <option value="number" ${f.type === 'number' ? 'selected' : ''}>数字</option>
      <option value="date" ${f.type === 'date' ? 'selected' : ''}>日期</option>
      <option value="select" ${isSel ? 'selected' : ''}>下拉选项</option>
    </select>
    <input class="tf-opts" placeholder="选项，逗号分隔，如：24寸,27寸" value="${esc((f.options || []).join(', '))}" style="flex:1.8;min-width:150px;${isSel ? '' : 'display:none'}">
    <input class="tf-default" placeholder="默认值" value="${esc(f.default || '')}" style="flex:.9;min-width:92px" title="录入时预先选好/填好的值。下拉字段填的默认值必须是上面选项之一；留空 = 不预设">
    <button class="btn xs ghost" onclick="this.parentElement.remove()">${svgIcon('x', 13)}</button></div>`;
}

async function delCat(id, name) {
  if (await confirmBox('删除分类', `确定删除「${name}」分类吗？`)) {
    try { await api('/categories/' + id, { method: 'DELETE' }); toast('已删除'); renderCategories(); }
    catch (e) { toast(e.message, 'error'); }
  }
}

/* ================= Excel 表格（导出 / 导入 / 自动更新） =================
 * 三个分区，一个分区一件事：**导出 / 导入 / 实时链接**，顺序按使用频率排。
 *
 * 三条精简原则（改这一块时请继续遵守）：
 *   1. **长的步骤说明收进 <details>** —— 原生折叠、不依赖 JS，别让一屏铺几十行字；
 *   2. **同一条提醒只写一遍** —— WPS 不认 CSV、每个分类一个工作表这类话，
 *      两个弹窗都要用就抽成常量（见 WPS_WARN_HTML / MULTI_SHEET_TIP）；
 *   3. **别把同一件事做成两个按钮** —— 导出原来 4 个平级按钮里有两个是重复入口，
 *      现在收成「3 个开关 + 1 个按钮」。
 */

/* ================= Excel 页 =================
 * 用户的原话：「操作逻辑有大问题，普通用户理解不了，改得通俗易懂好上手」。
 *
 * 老页面是按「技术手段」组织的（导出卡片 / 导入卡片 / 实时数据链接卡片），
 * 于是把一堆技术词直接摊给了用户：取数地址、链接格式（网页表格 vs CSV）、
 * 导航器、外部数据属性、多表链接、令牌、Power Query……
 * 用户得先搞懂这些概念，才知道自己该点哪儿。
 *
 * 新页面按「**你要做什么**」组织，三件事一张卡，从上到下就是使用顺序：
 *    ① 导出一份文件    （打印 / 存档 / 发人）
 *    ② 把填好的表传回来（批量新增、批量改）
 *    ③ 让 Excel 自己更新（最省事，配一次以后一直有效）
 * 每张卡里只有「一句人话说明 + 一个大按钮」，技术细节全部收进折叠区或"出问题了"。
 *
 * 术语翻译（老 → 新）：
 *    取数地址            → 这个 Excel 文件会在哪台电脑上用？（三选一，自动选好推荐项）
 *    链接格式 网页表格/CSV → 藏进「出问题了」，主流程默认网页表格（WPS/Excel 都认）
 *    实时数据链接         → 让 Excel 自己跟着更新
 *    导航器 / 外部数据属性 → 「弹出的小窗口里选 Table」「右键 → 属性」
 *    令牌                → 不提；只说"链接自带只读口令，别人拿到只能看、改不了"
 *    多表链接            → 「每个分类各一张工作表」（按结果命名，不按机制命名）
 * ============================================ */

/** 老页面里被测试和别处引用的样式常量，保留 */
const H3_STEP = 'font-size:15px;margin:22px 0 8px';
const TA_LINK = 'width:100%;height:70px;font-family:monospace;font-size:12px';

/** 「出问题了」排查清单 —— 老页面的 WPS_WARN_HTML 改写成人话 */
const XLS_TROUBLE_HTML = `
  <div class="xl-tip warn">
    <b>最常见的一句报错：「无法获取数据」。</b>按顺序做这三件事，基本都能解决：
    <ol>
      <li><b>把链接粘到浏览器地址栏</b>回车。能看到一张表格 → 链接没问题，是取数方式的问题（看第 3 条）；
          打不开 → 是第 2 条的问题。</li>
      <li><b>换一个「这个 Excel 文件会在哪台电脑上用」</b>，重新复制链接再试。这一步选错了，Excel 就连不上服务器。</li>
      <li><b>WPS 必须用「网页表格」格式</b>（我们复制的默认就是它）。WPS 的自网站功能不认 CSV 链接，
          粘 CSV 一定报「无法获取数据」。</li>
    </ol>
  </div>
  <div class="xl-tip">
    <b>什么时候才需要 CSV 格式？</b>Excel（不是 WPS）里希望日期/金额是真正的数字类型时。
    代价是纯数字的 SN 可能被 Excel 显示成科学计数法，需要把那一列改成「文本」。
    <div style="margin-top:8px"><button class="btn sm" onclick="copyLiveLink('all','csv')">复制 CSV 链接（Excel 专用）</button></div>
  </div>`;

/** 照片要不要显示 —— 老页面的 EXPORT_KINDS_HTML 精简版 */
const XL_PHOTO_HTML = `
  <p style="margin-top:0">实时链接过来的「照片链接」列是一串可点的文字，<b>点一下</b>就在浏览器里打开那张照片。</p>
  <p style="margin:0">想让照片直接显示在单元格里：在表格里新增一列，填公式
    <code>=IMAGE(照片链接所在单元格)</code>（Excel 365 / 较新版 WPS 支持），刷新时图片会跟着变。</p>
  <p class="muted" style="margin-bottom:0">想让照片<b>一开始就嵌在文件里</b>（不依赖公式、发给别人也能看），那就用第 ① 张卡的「导出一份 Excel 文件」。</p>`;

/**
 * 导出卡片（第 ① 件）。
 * 三个开关保留原样 —— 它们表达的是两个维度的口径，语义直接对得上，不需要改。
 */
function exportCardHTML() {
  return `
    <div class="card xl-card">
      <div class="xl-task-head"><span class="xl-num">1</span><h3>导出一份 Excel 文件</h3></div>
      <p class="xl-lead">打印、存档、发给别人。<b>照片直接嵌在单元格里</b>，对方打开就能看到。</p>
      <button class="btn primary xl-big" onclick="doExportExcel()">${svgIcon('sheet')} 导出 Excel 文件</button>
      <p class="muted xl-note">导出的是<b>此刻</b>的台账快照，导完就固定了。想让数据一直保持最新，用第 ③ 张卡。</p>

      <details class="xl-more">
        <summary>导出选项</summary>
        <div class="opt-list" style="margin-top:10px">
          <label><input type="checkbox" id="expSplit" checked> 按分类分表<span class="muted">台式主机 / 显示器…各一个工作表，另附数量汇总页</span></label>
          <label><input type="checkbox" id="expPhotos" checked> 含照片<span class="muted">取消后文件小得多（几十台从几 MB 降到几十 KB）</span></label>
          <label><input type="checkbox" id="expHelp" checked> 含说明页<span class="muted">附带「字段说明 / 设备分类 / 组织架构」三张辅助表</span></label>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:10px">
          <button class="btn sm" id="btnBackfill" onclick="backfillThumbs()">${svgIcon('image')} 补缩略图</button>
          ${help('早期录的设备只有 1600px 大图（每张约 150 KB），几十台就是好几 MB。\\n点它在浏览器里批量生成 320px 小图，之后导出的体积能降到十分之一、下载也快得多。只影响导出速度，不删原图。')}
        </div>
      </details>
    </div>`;
}

/**
 * 导入卡片（第 ② 件）。
 * 把「下载模板 → 填 → 上传」写成有编号的两个按钮，减少"我该先干嘛"的犹豫。
 */
function importCardHTML() {
  return `
    <div class="card xl-card">
      <div class="xl-task-head"><span class="xl-num">2</span><h3>把填好的表传回来</h3></div>
      <p class="xl-lead">一次批量新增或修改很多台设备。系统按<b>表头</b>认列、按<b>名称</b>认组织和分类，同一个 SN 自动当成同一台设备去更新。</p>
      <div class="xl-two-btns">
        <button class="btn xl-big" onclick="location.href='/api/excel/template'">${svgIcon('download')} ① 下载模板</button>
        <button class="btn primary xl-big" onclick="$('#importFile').click()">${svgIcon('upload')} ② 上传填好的文件</button>
      </div>
      <input type="file" id="importFile" accept=".xlsx,.xls" hidden>
      <p class="muted xl-note">上传后<b>先给你看结果</b>（会新增几台、更新几台、哪几行有问题），你确认了才真正写入。</p>

      <details class="xl-more">
        <summary>怎么填？（模板里的两张表）</summary>
        <ul class="xl-list">
          <li><b>「填写示例」页</b>：教你每一列该填什么，<b>不会被导入</b>。</li>
          <li><b>「设备台账」页</b>：真正要导入的数据填在这里，<b>从第 3 行</b>开始（第 1 行标题、第 2 行表头别动）。</li>
          <li>不想手填资产编号就留空，系统会按分类自动编号。</li>
          <li>备注里写了「示例」的行会被自动忽略，防止模板示例被当成真设备导进去。</li>
        </ul>
      </details>

      <details class="xl-more">
        <summary>导入选项</summary>
        <div class="opt-list" style="margin-top:10px">
          <label><input type="checkbox" id="impCreate" checked> 表格里的组织 / 分类不存在时，自动新建
            ${help('关掉后，出现台账里没有的组织名或分类名时，该行会被跳过并记进「失败」，不会凭空建出新分类。')}</label>
          <label><input type="checkbox" id="impUpdate" checked> 同一个 SN 已存在时，更新那台设备
            ${help('关掉后，同 SN 的行被当作重复直接忽略（既不新建也不更新）。\\n想只补空字段、不动人工填过的值，保持开启即可。')}</label>
        </div>
      </details>
    </div>`;
}

/** 把服务器给的「取数地址」翻译成普通人能对号入座的说法 */
function xlBaseChoices(bases) {
  return (bases || []).map((b, i) => {
    const base = String(b.base || '');
    const isLoopback = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])/i.test(base);
    const isLan = /^http:\/\/(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(base);
    let scene; let desc;
    if (isLoopback) {
      scene = '就在这台电脑上用';
      desc = 'Excel 和本系统开在同一台电脑上（最快）';
    } else if (isLan) {
      scene = '在办公室其他电脑上用';
      desc = `同一 WiFi / 同一网段的电脑都能用（${base.replace(/^https?:\/\//, '')}）`;
    } else {
      scene = '在外网 / 家里用';
      desc = '需要走公网访问；如果取不到数据，看下面的「出问题了」';
    }
    // 推荐规则：局域网最通用（服务器自己也能访问自己的局域网 IP），
    // 所以有局域网就推局域网，否则退到本机，最后才是公网。
    return { i, base, scene, desc, hw: isLoopback ? 'loopback' : isLan ? 'lan' : 'public', label: b.label, hint: b.hint };
  });
}

/**
 * 第 ③ 件：让 Excel 自己跟着更新。
 * 三步走（哪里用 → 复制链接 → 贴进 Excel），技术细节全在折叠区里。
 */
function liveCardHTML(live) {
  const bases = live.bases || [];
  if (!bases.length) return '';
  const choices = xlBaseChoices(bases);
  const rec = choices.find((c) => c.hw === 'lan') || choices.find((c) => c.hw === 'loopback') || choices[0];
  state.liveRecIdx = rec.i;

  return `
    <div class="card xl-card" style="margin-top:16px;border-color:var(--primary-border)">
      <div class="xl-task-head"><span class="xl-num">3</span><h3>让 Excel 自己跟着更新</h3>
        <span class="badge" style="color:var(--green);margin-left:8px">配一次，以后一直有效</span></div>
      <p class="xl-lead">把台账接进 Excel 当数据源。以后<b>打开文件就是最新数据</b>，不用再反复导出。
        第一次配置大约 1 分钟，三步：</p>

      <section class="xl-step">
        <h4>第 1 步　这个 Excel 文件会在哪台电脑上用？</h4>
        <div class="xl-choice" id="liveBase">
          ${choices.map((c) => `
            <button class="xl-choice-btn${c.i === rec.i ? ' on' : ''}" data-base="${c.i}">
              <span class="xl-choice-t">${esc(c.scene)}${c.i === rec.i ? '<span class="xl-rec">推荐</span>' : ''}</span>
              <span class="xl-choice-d">${esc(c.desc)}</span>
            </button>`).join('')}
        </div>
        <p class="muted xl-note">不确定就选<b>推荐</b>那个。选错了的表现是 Excel 里提示「无法获取数据」，换一个重新复制链接即可。</p>
      </section>

      <section class="xl-step">
        <h4>第 2 步　点一下，链接就复制好了</h4>
        <div class="xl-two-btns">
          <button class="btn primary xl-big" onclick="copyLiveLink('all')">${svgIcon('copy')} 复制链接：全部设备放一张表</button>
          <button class="btn xl-big" onclick="copyLiveLink('workbook')">${svgIcon('copy')} 复制链接：每个分类各一张工作表</button>
        </div>
        <p class="muted xl-note" style="margin-bottom:4px">两个的区别：只想看一张总表 → 选第一个；
          想让「台式主机 / 显示器 / 打印机…」<b>各占一张工作表</b> → 选第二个。</p>
        <p class="muted xl-note">链接里自带只读口令：别人拿到它<b>只能看台账字段</b>，看不到密码、密钥和登录信息，也改不了任何数据。</p>
      </section>

      <section class="xl-step">
        <h4>第 3 步　粘到 Excel / WPS 里</h4>
        <div class="grid grid-2 xl-howto-grid">
          <div class="xl-howto">
            <div class="xl-howto-t">${svgIcon('sheet', 14)} Excel</div>
            <ol class="xl-list">
              <li>菜单 <b>数据</b> → <b>获取数据</b> → <b>自其他源</b> → <b>自网站</b></li>
              <li>粘贴刚才复制的链接 → 确定</li>
              <li>弹出的小窗口里会出现表格，选 <b>Table</b> → 点 <b>加载</b></li>
              <li>想自动刷新：右键生成的数据 → <b>属性</b> → 勾「打开文件时刷新」+「每 30 分钟刷新」</li>
            </ol>
          </div>
          <div class="xl-howto">
            <div class="xl-howto-t">${svgIcon('sheet', 14)} WPS</div>
            <ol class="xl-list">
              <li>菜单 <b>数据</b> → <b>获取数据</b> / <b>自网站</b></li>
              <li>粘贴链接 → 确定</li>
              <li>在表格列表里选要的表格 → <b>导入</b></li>
              <li>想自动刷新：右键数据 → <b>属性</b> → 勾「打开文件时刷新」</li>
            </ol>
            <p class="muted" style="margin:8px 0 0;font-size:12px">WPS 只认网页表格格式（我们复制给你的默认就是），别用 CSV 链接。</p>
          </div>
        </div>
      </section>

      <details class="xl-more">
        <summary>出问题了？（表格提示「无法获取数据」等）</summary>
        <div style="margin-top:10px">${XLS_TROUBLE_HTML}</div>
      </details>

      <details class="xl-more">
        <summary>想让照片也显示出来</summary>
        <div style="margin-top:10px">${XL_PHOTO_HTML}</div>
      </details>

      <details class="xl-more">
        <summary>只想同步某一个分类（或看某个分类有多少台）</summary>
        <p class="muted" style="margin:10px 0 0">下面每个分类是一条单独的链接，用法和第 2 步一样，分别粘到不同的工作表里就行。</p>
        <div id="liveTable" style="margin-top:10px"></div>
      </details>

      <div class="xl-foot">
        <span class="muted">当前选用：<b id="liveBaseLabel">${esc(rec.label)}</b></span>
        <span style="flex:1"></span>
        <button class="btn sm" onclick="xlPreview()">${svgIcon('search')} 预览数据</button>
        <button class="btn sm danger" id="btnResetLive">${svgIcon('refresh')} 重置链接</button>
        ${help('「重置链接」：让所有旧链接立刻失效。\\n什么时候用：换电脑/换网络后发现怎么配都取不到数，或者链接被发到了不该发的地方。\\n重置后已经配好的 Excel 需要换成新链接。')}
      </div>
    </div>`;
}

/** 单个分类的链接列表（收在折叠区里，给"只想同步一个分类"的人） */
function renderLiveTable() {
  const live = state.liveLinks;
  const box = $('#liveTable');
  if (!live || !box) return;
  const b = (live.bases || [])[state.livePick?.idx ?? 0] || (live.bases || [])[0];
  if (!b) { box.innerHTML = '<div class="muted">没有可用的链接</div>'; return; }
  box.innerHTML = `
    <div class="table-wrap"><table class="grid">
      <thead><tr><th>分类</th><th style="width:110px">设备数量</th><th style="width:150px">链接</th></tr></thead>
      <tbody>
        ${(b.sheets || []).map((s, i) => `
        <tr>
          <td data-label="分类">${esc(s.name)}</td>
          <td class="num" data-label="设备数量">${s.count}</td>
          <td data-label="链接"><button class="btn xs" onclick="copyLiveLink(${i})">${svgIcon('copy')} 复制链接</button></td>
        </tr>`).join('')}
      </tbody>
    </table></div>`;
}

/** 在新标签页里打开「当前选用的取数地址 + 全部设备」那张表，让用户先看看通不通 */
function xlPreview() {
  const live = state.liveLinks;
  const idx = state.livePick?.idx ?? 0;
  const b = (live?.bases || [])[idx] || (live?.bases || [])[0];
  const url = b?.all?.html;
  if (!url) { toast('还没有可预览的链接', 'warn'); return; }
  window.open(url, '_blank');
}

/** 切换「在哪台电脑上用」（第 1 步的三个按钮） */
function xlPickBase(idx) {
  const live = state.liveLinks;
  const b = (live?.bases || [])[idx];
  if (!b) return;
  state.livePick = { base: b, fmt: 'html', idx: Number(idx) };
  $$('#liveBase .xl-choice-btn').forEach((el) => {
    el.classList.toggle('on', Number(el.getAttribute('data-base')) === Number(idx));
  });
  const lab = $('#liveBaseLabel');
  if (lab) lab.textContent = b.label;
  renderLiveTable();
}

function copyLiveLink(which, fmt) {
  const live = state.liveLinks;
  if (!live) return;
  const idx = state.livePick?.idx ?? state.liveRecIdx ?? 0;
  const base = (live.bases || [])[idx] || (live.bases || [])[0];
  if (!base) return;
  const as = fmt || state.livePick?.fmt || 'html';
  const size = base.workbook?.tables ?? 0;
  if (which === 'workbook') {
    const url = as === 'csv' ? (base.workbook?.csv || base.workbook?.html) : base.workbook?.html;
    if (url) copyText(url, `「每个分类各一张工作表」的链接（共 ${size} 张表）`);
    return;
  }
  const item = which === 'all' ? base.all : (base.sheets || [])[which];
  if (!item) return;
  const url = as === 'csv' ? item.csv : item.html;
  const name = which === 'all' ? '「全部设备」' : `「${item.name}」`;
  if (url) copyText(url, `${name}的链接${as === 'csv' ? '（CSV）' : ''}`);
}

/** 导入历史 */
function importHistoryHTML(batches) {
  if (!batches.length) {
    return '<div class="card" style="margin-top:16px"><h3>导入历史</h3><div class="muted">还没有导入过文件。</div></div>';
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

/** 页面主体：三件事，从上到下就是使用顺序 */
async function renderExcel() {
  // 两个接口互不依赖，并发拉；任一失败都不该把整页打挂 —— 历史为空就当作「暂无记录」
  const [batches, live] = await Promise.all([
    api('/excel/batches?limit=20').then((d) => d.items).catch(() => []),
    api('/excel/live-links').catch(() => null),
  ]);
  state.liveLinks = live;
  // 默认选推荐地址（局域网优先），并初始化 state.livePick（copyLiveLink 依赖它）
  const choices = xlBaseChoices(live?.bases || []);
  const rec = choices.find((c) => c.hw === 'lan') || choices.find((c) => c.hw === 'loopback') || choices[0];
  state.livePick = rec ? { base: live.bases[rec.i], fmt: 'html', idx: rec.i } : null;

  $('#content').innerHTML = `
    <div class="xl-intro">
      <b>在 Excel 里用设备台账，通常就是下面三件事之一。</b>
      第一次用的话，从上往下看；只想做某一件，直接点那张卡。
    </div>

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

/** renderExcel 之后的所有事件绑定集中一处 */
function bindExcelEvents() {
  const f = $('#importFile');
  if (f) f.onchange = (e) => {
    const file = e.target.files[0];
    e.target.value = '';     // 允许重复选同一个文件（否则第二次选它不触发 change）
    handleImport(file);
  };

  // 第 1 步的三个「在哪台电脑上用」按钮
  $$('#liveBase .xl-choice-btn').forEach((el) => {
    el.onclick = () => xlPickBase(Number(el.getAttribute('data-base')));
  });
  const resetBtn = $('#btnResetLive');
  if (resetBtn) resetBtn.onclick = resetLiveToken;
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

/** 兼容老入口：老页面有「配置步骤 / 多工作表怎么配」两个按钮，现在合并成一页说明 */
function showLiveGuide() { showExcelGuide(); }
function showMultiSheetGuide() { showExcelGuide(); }

function showExcelGuide() {
  const live = state.liveLinks;
  const idx = state.livePick?.idx ?? 0;
  const b = (live?.bases || [])[idx] || (live?.bases || [])[0];
  const url = b?.all?.html || '';
  const sheets = b?.workbook?.tables ?? 0;
  openModal(`
    <div class="modal-head"><h2>让 Excel 自动更新的完整步骤</h2><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <p style="margin-top:0"><b>1.</b> 新建一个空白工作簿</p>
      <p><b>2.</b> Excel：<b>数据</b> → <b>获取数据</b> → <b>自其他源</b> → <b>自网站</b>；
         WPS：<b>数据</b> → <b>获取数据</b> / <b>自网站</b></p>
      <p><b>3.</b> 粘贴链接 → 确定 → 在弹出的小窗口里选 <b>Table</b> → 点「加载」／「导入」</p>
      <p><b>4.</b> 右键生成的数据 → <b>属性</b> → 勾「打开文件时刷新」+「每 30 分钟刷新一次」</p>
      <textarea readonly style="${TA_LINK}">${esc(url)}</textarea>
      <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn sm primary" onclick="copyText('${esc(url)}','链接')">${svgIcon('copy')} 复制链接</button>
        <button class="btn sm" onclick="closeModal();copyLiveLink('workbook')">${svgIcon('copy')} 复制「每个分类一张表」的链接（共 ${sheets} 张）</button>
      </div>
      <div style="margin-top:16px">${XLS_TROUBLE_HTML}</div>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="window.open('${esc(url)}','_blank')">${svgIcon('search')} 浏览器打开看看</button>
      <span style="flex:1"></span>
      <button class="btn primary" onclick="closeModal()">明白了</button>
    </div>`, { wide: true });
}

async function resetLiveToken() {
  if (!await confirmBox('重置链接', '重置后**所有旧链接立刻失效**，已经配好取数的 Excel 需要换成新链接。什么时候需要重置：换电脑/换网络后怎么都取不到数，或链接被发到了不该发的地方。确定要重置吗？')) return;
  try {
    const r = await api('/excel/live-token/reset', { method: 'POST', body: JSON.stringify({}) });
    state.liveLinks = r;
    toast('已重置，请重新复制链接');
    renderExcel();
  } catch (e) { toast(e.message, 'error'); }
}

/**
 * 导入流程：上传 → **先试算** → 看清楚了再确认写入。
 *
 * 老流程的坑：弹窗里默认勾着「仅预览」，按钮却写「开始导入」——
 * 用户点下去什么也没写进库，还得再传一次文件。现在只有一条路：
 * 一定会先给出试算结果（新增/更新/跳过/哪几行有问题），确认按钮写着「确认导入 N 台」。
 */
async function handleImport(file) {
  if (!file) return;
  const create = $('#impCreate')?.checked !== false;
  const update = $('#impUpdate')?.checked !== false;

  const post = (dry) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('create_missing', create ? '1' : '0');
    fd.append('update_existing', update ? '1' : '0');
    fd.append('dry_run', dry ? '1' : '0');
    return api('/excel/import', { method: 'POST', body: fd });
  };

  let t = null;
  let calc = null;
  try {
    t = toast('正在检查这个文件…');
    calc = await post(true);
  } catch (e) {
    t?.remove();
    toast(e.message, 'error');
    return;
  }
  t?.remove();

  const realErrors = (calc.errors || []).filter((e) => e.row > 0);
  const headErrors = (calc.errors || []).filter((e) => !e.row);
  const willWrite = (calc.created || 0) + (calc.updated || 0);

  openModal(`
    <div class="modal-head"><h2>确认导入</h2><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <p style="margin-top:0"><b>${esc(file.name)}</b> 里一共 <b>${calc.total ?? 0}</b> 行数据。下面是导入后会发生的改动：</p>
      <div class="xl-calc">
        <div class="xl-calc-item ok"><b>${calc.created ?? 0}</b><span>台新增</span></div>
        <div class="xl-calc-item"><b>${calc.updated ?? 0}</b><span>台更新</span></div>
        <div class="xl-calc-item"><b>${calc.skipped ?? 0}</b><span>行跳过</span></div>
        <div class="xl-calc-item ${calc.failed ? 'bad' : ''}"><b>${calc.failed ?? 0}</b><span>行失败</span></div>
      </div>
      ${headErrors.length ? `<div class="xl-tip warn" style="margin-top:12px">${esc(headErrors[0].message)}</div>` : ''}
      ${realErrors.length ? `
        <div class="xl-tip warn" style="margin-top:12px">
          <b>有 ${realErrors.length} 行有问题，这些行不会被导入：</b>
          <ul class="xl-list" style="margin:8px 0 0">
            ${realErrors.slice(0, 8).map((e) => `<li>第 ${e.row} 行：${esc(e.message)}</li>`).join('')}
          </ul>
          ${realErrors.length > 8 ? `<div class="muted" style="margin-top:6px">…还有 ${realErrors.length - 8} 行，导入后在「导入历史」里能看到全部。</div>` : ''}
        </div>` : ''}
      ${calc.skipped ? '<p class="muted" style="margin:12px 0 0">「跳过」通常是备注里标了「示例」的行，或者关了「同一个 SN 更新」时的重复行。</p>' : ''}
      ${!willWrite ? '<p class="muted" style="margin:12px 0 0">没有可写入的改动 —— 可能表格是空的，或数据没填在「设备台账」页。</p>' : ''}
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="closeModal()">${willWrite ? '先不导' : '关闭'}</button>
      ${willWrite ? `<button class="btn primary" id="impConfirm">确认导入 ${willWrite} 台</button>` : ''}
    </div>`, { wide: true });

  const btn = $('#impConfirm');
  if (!btn) return;
  btn.onclick = async () => {
    btn.disabled = true; btn.textContent = '正在导入…';
    try {
      const r = await post(false);
      if (r.failed) toast(`导完了：新增 ${r.created}、更新 ${r.updated}、跳过 ${r.skipped}、失败 ${r.failed}`, 'warn');
      else toast(`导完了：新增 ${r.created}、更新 ${r.updated}${r.skipped ? `、跳过 ${r.skipped}` : ''}`);
      closeModal();
      renderExcel();
    } catch (e) {
      toast(e.message, 'error');
      btn.disabled = false;
      btn.textContent = '重试';
    }
  };
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
  const mobile = data.settings.mobile || {};
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
        <h3>${svgIcon('camera')} 手机录入默认值${help('手机端「拍照识别入库」表单里那几个下拉的默认选中项。\n\n现场是一台接一台地录，同一批设备往往同部门、同供应商、同状态 ——\n配好默认值后，大多数情况直接按「保存入库」就行，不用每次点三四个下拉。\n\n设备分类：识别能猜出来时以识别为准，猜不出来才用这里的默认值。')}</h3>
        <p class="muted" style="margin-top:0;font-size:13px">配好后手机端一打开就是这个选项（仍然可以随时改）。</p>
        <div class="field" style="margin-bottom:10px"><label>默认设备分类</label>
          <select id="mdCategory">
            <option value="">（不预设，按列表第一个）</option>
            ${(state.options?.categories || []).map((c) => `<option value="${c.id}" ${mobile?.category_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
          </select></div>
        <div class="field" style="margin-bottom:10px"><label>默认所属组织</label>
          <select id="mdOrg">
            <option value="">（不预设 = 未分配）</option>
            ${(state.options?.orgs || []).map((o) => `<option value="${o.id}" ${mobile?.org_id === o.id ? 'selected' : ''}>${esc(o.path || o.name)}</option>`).join('')}
          </select></div>
        <div class="field" style="margin-bottom:10px"><label>默认供应商</label>
          <select id="mdSupplier">
            <option value="">（不预设 = 未指定）</option>
            ${(state.options?.suppliers || []).map((s) => `<option value="${esc(s)}" ${mobile?.supplier === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}
          </select></div>
        <div class="field"><label>默认状态</label>
          <select id="mdStatus">
            ${(state.options?.statuses || []).map((s) => `<option value="${s.id}" ${(mobile?.status || 'in_use') === s.id ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}
          </select></div>
        <button class="btn primary" id="saveMobile">保存</button>
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
  $('#saveMobile').onclick = async () => {
    try {
      await api('/settings', {
        method: 'PUT',
        body: JSON.stringify({
          mobile: {
            category_id: $('#mdCategory').value || '',
            org_id: $('#mdOrg').value || '',
            supplier: $('#mdSupplier').value || '',
            status: $('#mdStatus').value || 'in_use',
          },
        }),
      });
      // 手机端读的是 /options 里的 mobile_defaults，改完要重新拉一次
      state.options = await api('/options');
      toast('默认值已保存，手机端下次打开就是它');
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
// 便于自动化测试：专属字段的控件渲染 + 默认值解析（纯函数，直接断言产出）
window.trackingInputHTML = trackingInputHTML;
window.fieldDefault = fieldDefault;
window.formTrackingFields = formTrackingFields;
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

/* ================= 资源管理器：按组织架构浏览设备 ================= *
 * 用户的要求是「照搬 Windows 资源管理器的操作方式」，所以这一页不是「树 + 网页表格」，
 * 而是把资源管理器那套**肌肉记忆**原样搬过来：
 *
 *   导航   ← 后退 · → 前进 · ↑ 向上 · ⟳ 刷新 · 地址栏（面包屑，点空白处可编辑路径）
 *   内容区 子文件夹和文件（设备）**混在一起**列出来，文件夹排在前面
 *   选中   单击选中 · Ctrl+单击加选 · Shift+单击连选 · Ctrl+A 全选 · 点空白处取消
 *   打开   双击（或回车）—— 文件夹=进入，设备=打开详情
 *   右键   设备/文件夹/空白处各有一套右键菜单
 *   快捷键 Enter 打开 · F2 重命名 · Delete 删除 · F5 刷新 · Backspace 向上一级 · Alt+←/→ 前进后退 · 方向键移动选择
 *   列头   点一下按该列排序，再点一下反向（▲▼）
 *   状态栏 底部显示「共 N 个项目 / 选中 M 个项目」
 *   视图   详细信息（表格）· 大图标（平铺）
 *   拖放   把设备拖到左边文件夹、或拖到内容区里的子文件夹上 = 改归属组织
 *
 * 相对上一版改掉的地方（上一版是"网页表格"思路，不趁手）：
 *   · 去掉了每行的「打开」按钮和勾选框列 —— 资源管理器靠**选中**（Ctrl / Shift），不是勾选框
 *   · 去掉了底部分页 —— 文件夹里就该是一屏滚到底，翻页是网页才有的东西
 *   · 子文件夹现在会出现在内容区（以前只能在左树里进）
 *   · 补上了后退/前进/向上/刷新、地址栏、右键菜单、列头排序、状态栏、快捷键
 *
 * ⚠️ 一条口径上的讲究保持不变：文件夹上的数字必须和点进去看到的条数一致。
 *    两边共用同一个「包含子文件夹」开关，数字取自同一套统计（直接数 / 含下级总数）。
 * =============================================================== */

const EX_NONE = '__none__';   // 「未分配组织」虚拟文件夹

/** 内容区里的一行：设备或子文件夹统一成同一种结构，选中/排序/键盘才好处理 */
const exRowKey = (kind, id) => `${kind}:${id}`;
const exRowId = (key) => String(key).slice(String(key).indexOf(':') + 1);
const exRowKind = (key) => String(key).slice(0, String(key).indexOf(':'));

state.ex = state.ex || {
  orgId: '',                 // '' = 全部设备；EX_NONE = 未分配；其它 = 组织 id
  includeChildren: false,    // 「包含子文件夹」——默认关，和资源管理器一致（文件夹只显示自己装的）
  keyword: '',
  status: '',
  sort: 'name',              // 资源管理器默认按名称排
  order: 'asc',
  view: 'details',           // details | tiles
  expanded: null,            // Set<orgId>
  sel: new Set(),            // Set<'device:id' | 'org:id'>
  anchor: null,              // Shift 连选的锚点（当前列表里的下标）
  rows: [],                  // 当前内容区渲染出来的行（键盘导航和连选都靠它）
  hist: [''],                // 浏览历史（前进后退）
  histIdx: 0,
  pathEditing: false,        // 地址栏是否处于编辑态
  data: null,                // /api/orgs
  cap: 500,                  // 一屏最多拉多少条（资源管理器不分页，这是保护措施）
};

/* ---------------- 打开 / 重绘 ---------------- */

async function renderExplorer() {
  const data = await api('/orgs');
  state.ex.data = data;
  if (!state.ex.expanded) {
    // 默认展开：根节点，以及当前所在文件夹的所有祖先，一进来就能看到自己在哪
    const open = new Set();
    for (const r of data.tree) open.add(r.id);
    state.ex.expanded = open;
  }
  exEnsureVisible(state.ex.orgId);

  $('#content').innerHTML = `
    <div class="ex">
      <aside class="ex-side">
        <div class="ex-nav-title">${svgIcon('explorer', 14)} 组织架构${help('把右边的设备拖到文件夹上就能改归属组织。\n右键文件夹：新建子文件夹 / 重命名 / 删除。\n快捷键：Enter 打开、F2 重命名、Delete 删除、F5 刷新、Backspace 向上一级、Ctrl+A 全选、方向键选择。')}</div>
        <div class="ex-tree" id="exTree">${exTreeHTML()}</div>
      </aside>
      <section class="ex-main">
        <div class="ex-toolbar">
          <div class="ex-navbtns">
            <button class="ex-tb" id="exBack" title="后退 (Alt+←)">${svgIcon('arrow-left', 16)}</button>
            <button class="ex-tb" id="exFwd" title="前进 (Alt+→)">${svgIcon('arrow-right', 16)}</button>
            <button class="ex-tb" id="exUp" title="向上一级 (Backspace)">${svgIcon('arrow-up', 16)}</button>
            <button class="ex-tb" id="exRefresh" title="刷新 (F5)">${svgIcon('refresh', 15)}</button>
          </div>
          <div class="ex-addr" id="exAddr" title="点一下可以编辑路径"></div>
          <div class="ex-search">
            ${svgIcon('search', 14)}
            <input id="exKw" placeholder="搜索" value="${esc(state.ex.keyword)}" autocomplete="off">
          </div>
          <div class="ex-viewtoggle">
            <button class="ex-vt${state.ex.view === 'details' ? ' on' : ''}" data-view="details" title="详细信息">${svgIcon('list', 14)}</button>
            <button class="ex-vt${state.ex.view === 'tiles' ? ' on' : ''}" data-view="tiles" title="大图标">${svgIcon('devices', 14)}</button>
          </div>
        </div>
        <div class="ex-body" id="exBody"></div>
        <div class="ex-statusbar" id="exStatus"></div>
      </section>
    </div>`;

  exRenderAddr();
  bindExplorerTree();
  bindExplorerToolbar();
  await exLoad();
}

/** 把某个文件夹及其祖先都展开（导航过去时用） */
function exEnsureVisible(orgId) {
  if (!orgId || orgId === EX_NONE || !state.ex.data) return;
  const byId = new Map((state.ex.data.flat || []).map((o) => [o.id, o]));
  let cur = byId.get(orgId);
  while (cur) {
    if (cur.parent_id) state.ex.expanded.add(cur.parent_id);
    cur = cur.parent_id ? byId.get(cur.parent_id) : null;
  }
}

/* ---------------- 左树 ---------------- */

/** 当前「包含子文件夹」口径下，某个组织该显示多少个项目 */
function exCount(node) {
  if (!node) return 0;
  return state.ex.includeChildren ? (node.total ?? node.device_count ?? 0) : (node.device_count ?? 0);
}

function exTreeHTML() {
  const d = state.ex.data;
  if (!d) return '';
  const ex = state.ex;
  const statsById = new Map((d.stats || []).map((s) => [s.id, s]));

  const node = (n) => {
    const kids = n.children || [];
    const open = ex.expanded.has(n.id);
    const isSel = ex.orgId === n.id;
    const st = statsById.get(n.id) || {};
    const cnt = ex.includeChildren ? (st.total ?? n.device_count ?? 0) : (n.device_count ?? 0);
    return `
      <div class="ex-row${isSel ? ' sel' : ''}" data-org="${n.id}" data-drop="1">
        <span class="ex-arrow${kids.length ? '' : ' leaf'}${open ? ' open' : ''}" data-toggle="${n.id}">${svgIcon('chevron', 11)}</span>
        <span class="ex-ico">${svgIcon(open && kids.length ? 'folder-open' : 'folder', 14)}</span>
        <span class="ex-name" title="${esc(n.name)}">${esc(n.name)}</span>
        <span class="ex-cnt${cnt ? '' : ' zero'}">${cnt}</span>
      </div>
      ${kids.length && open ? `<div class="ex-kids">${kids.map(node).join('')}</div>` : ''}`;
  };

  const allStats = (d.stats || []).reduce((s, x) => s + (x.own || 0), 0) + (d.unassigned || 0);
  return `
    <div class="ex-row${ex.orgId === '' ? ' sel' : ''}" data-org="" data-drop="1">
      <span class="ex-arrow leaf"></span>
      <span class="ex-ico ex-ico-root">${svgIcon('devices', 14)}</span>
      <span class="ex-name">全部设备</span>
      <span class="ex-cnt">${allStats}</span>
    </div>
    ${d.tree.map(node).join('')}
    <div class="ex-row ex-none${ex.orgId === EX_NONE ? ' sel' : ''}" data-org="${EX_NONE}" data-drop="1">
      <span class="ex-arrow leaf"></span>
      <span class="ex-ico ex-ico-warn">${svgIcon('alert', 14)}</span>
      <span class="ex-name">未分配组织</span>
      <span class="ex-cnt${d.unassigned ? '' : ' zero'}">${d.unassigned || 0}</span>
    </div>`;
}

function bindExplorerTree() {
  const tree = $('#exTree');
  if (!tree) return;
  $$('#exTree [data-toggle]').forEach((a) => {
    a.onclick = (e) => {
      e.stopPropagation();
      const id = a.getAttribute('data-toggle');
      if (state.ex.expanded.has(id)) state.ex.expanded.delete(id);
      else state.ex.expanded.add(id);
      tree.innerHTML = exTreeHTML();
      bindExplorerTree();
    };
  });
  $$('#exTree .ex-row').forEach((row) => {
    row.onclick = () => exNavigate(row.getAttribute('data-org') || '');
    row.addEventListener('dragover', (e) => { e.preventDefault(); row.classList.add('drop'); });
    row.addEventListener('dragleave', () => row.classList.remove('drop'));
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      row.classList.remove('drop');
      const ids = String(e.dataTransfer?.getData('text/plain') || '').split(',').filter(Boolean);
      if (ids.length) exMoveTo(row.getAttribute('data-org') || '', ids);
    });
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const orgId = row.getAttribute('data-org') || '';
      if (!orgId || orgId === EX_NONE) exMenu(e, exEmptyMenu());
      else exMenu(e, exFolderMenu(orgId));
    });
  });
}

/* ---------------- 地址栏 ---------------- */

function exCrumbs() {
  const d = state.ex.data;
  const id = state.ex.orgId;
  const crumbs = [{ id: '', label: '全部设备' }];
  if (id === EX_NONE) { crumbs.push({ id: EX_NONE, label: '未分配组织' }); return crumbs; }
  if (!id || !d) return crumbs;
  const flat = d.flat || [];
  const row = flat.find((o) => o.id === id);
  if (!row) return crumbs;
  const names = String(row.path || row.name).split(' / ');
  let parentId = '';
  for (const nm of names) {
    const hit = flat.find((o) => o.name === nm && (o.parent_id || '') === parentId);
    if (hit) { crumbs.push({ id: hit.id, label: hit.name }); parentId = hit.id; }
    else crumbs.push({ id: hit ? hit.id : id, label: nm });
  }
  return crumbs;
}

function exRenderAddr() {
  const box = $('#exAddr');
  if (!box) return;
  const ex = state.ex;
  if (ex.pathEditing) {
    const path = exCrumbs().map((c) => c.label).join('\\');
    box.innerHTML = `<input id="exAddrInput" class="ex-addr-input" value="${esc(path)}">`;
    const inp = $('#exAddrInput');
    if (inp) {
      inp.focus();
      inp.select();
      inp.onkeydown = (e) => {
        if (e.key === 'Enter') { ex.pathEditing = false; exGoPath(inp.value); }
        else if (e.key === 'Escape') { ex.pathEditing = false; exRenderAddr(); }
      };
      inp.onblur = () => { if (state.ex.pathEditing) { state.ex.pathEditing = false; exRenderAddr(); } };
    }
    return;
  }
  const crumbs = exCrumbs();
  box.innerHTML = `<span class="ex-addr-ico">${svgIcon('folder', 13)}</span>
    ${crumbs.map((c, i) => {
    const last = i === crumbs.length - 1;
    return `${i ? `<span class="ex-addr-sep">${svgIcon('chevron', 10)}</span>` : ''}
      <a class="ex-addr-part${last ? ' cur' : ''}" data-crumb="${esc(c.id)}" title="${esc(c.label)}">${esc(c.label)}</a>`;
  }).join('')}
    <span class="ex-addr-fill" data-edit="1"></span>`;
  $$('#exAddr [data-crumb]').forEach((a) => {
    a.onclick = (e) => { e.stopPropagation(); exNavigate(a.getAttribute('data-crumb') || ''); };
  });
  const fill = $('#exAddr [data-edit]');
  if (fill) fill.onclick = () => { state.ex.pathEditing = true; exRenderAddr(); };
}

/** 地址栏里手输路径跳转（用 \ 或 / 分隔，末段按名字找） */
function exGoPath(text) {
  const want = String(text || '').split(/[\\/]/).map((s) => s.trim()).filter(Boolean);
  const d = state.ex.data;
  if (!want.length) { exNavigate(''); return; }
  if (want[0] === '全部设备') want.shift();
  if (!want.length) { exNavigate(''); return; }
  if (want[0] === '未分配组织') { exNavigate(EX_NONE); return; }
  let parentId = '';
  for (const nm of want) {
    const hit = (d.flat || []).find((o) => o.name === nm && (o.parent_id || '') === parentId);
    if (!hit) { toast(`找不到「${nm}」这个文件夹`, 'warn'); exRenderAddr(); return; }
    parentId = hit.id;
  }
  exNavigate(parentId);
}

/* ---------------- 导航（含前进后退） ---------------- */

function exNavigate(orgId, { push = true } = {}) {
  const ex = state.ex;
  if (orgId === ex.orgId && !push) return;
  ex.orgId = orgId;
  ex.sel.clear();
  ex.anchor = null;
  ex.keyword = '';
  ex.pathEditing = false;
  if (push) {
    ex.hist = ex.hist.slice(0, ex.histIdx + 1);
    if (ex.hist[ex.histIdx] !== orgId) { ex.hist.push(orgId); ex.histIdx = ex.hist.length - 1; }
  }
  exEnsureVisible(orgId);
  const tree = $('#exTree');
  if (tree) { tree.innerHTML = exTreeHTML(); bindExplorerTree(); }
  exRenderAddr();
  exLoad();
}

function exUp() {
  const id = state.ex.orgId;
  if (!id || id === EX_NONE) return;
  const row = (state.ex.data?.flat || []).find((o) => o.id === id);
  exNavigate(row?.parent_id || '');
}

/* ---------------- 内容区数据 ---------------- */

async function exLoad() {
  const ex = state.ex;
  const body = $('#exBody');
  if (body) body.innerHTML = `<div class="ex-loading"><span class="spin"></span> 正在读取…</div>`;

  const q = new URLSearchParams();
  q.set('page', '1');
  q.set('page_size', String(ex.cap));
  q.set('sort', 'updated_at');
  q.set('order', 'desc');
  // ⚠️ 搜索和「包含子文件夹」都是**在当前文件夹及其子文件夹范围内**找，
  //    和资源管理器的搜索行为一致（搜索不会跑到别的文件夹里去）
  if (ex.keyword) q.set('keyword', ex.keyword);
  if (ex.status) q.set('status', ex.status);
  if (ex.orgId === EX_NONE) q.set('no_org', '1');
  else if (ex.orgId) {
    q.set('org_id', ex.orgId);
    if (!ex.includeChildren && !ex.keyword) q.set('org_direct', '1');
  }

  let data;
  try { data = await api('/devices?' + q.toString()); } catch (e) {
    if (body) body.innerHTML = `<div class="ex-empty">${esc(e.message)}</div>`;
    return;
  }

  // 子文件夹当项目列出来（文件夹排前面）
  const folders = exChildFolders();
  const devices = data.items.slice().sort(exDeviceComparator());
  ex.rows = [
    ...folders.map((f) => ({ kind: 'org', key: exRowKey('org', f.id), org: f })),
    ...devices.map((d) => ({ kind: 'device', key: exRowKey('device', d.id), dev: d })),
  ];
  ex.total = data.total;
  ex.capped = data.total > data.items.length;
  ex.folderCount = folders.length;

  if (body) {
    body.innerHTML = ex.rows.length ? (ex.view === 'details' ? exDetailsHTML() : exTilesHTML())
      : exEmptyHTML();
  }
  bindExplorerBody();
  exRenderStatus();
  exRenderNavButtons();
}

/** 当前文件夹里直接挂着的子组织 */
function exChildFolders() {
  const ex = state.ex;
  const d = ex.data;
  if (!d) return [];
  const statsById = new Map((d.stats || []).map((s) => [s.id, s]));
  let parentId = ex.orgId === EX_NONE ? EX_NONE : ex.orgId;
  if (parentId === EX_NONE) return [];
  // 全部设备（''）时，把所有根组织当子文件夹列出来
  const kids = (d.flat || []).filter((o) => (o.parent_id || '') === parentId);
  return kids
    .map((o) => {
      const st = statsById.get(o.id) || {};
      return {
        ...o,
        own_count: o.device_count || 0,
        total_count: st.total ?? o.device_count ?? 0,
        child_count: (d.flat || []).filter((x) => x.parent_id === o.id).length,
      };
    })
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh-CN'));
}

/** 按当前排序列比较两台设备（资源管理器点列头就是改这个） */
function exDeviceComparator() {
  const { sort, order } = state.ex;
  const dir = order === 'asc' ? 1 : -1;
  const val = (d) => {
    switch (sort) {
      case 'asset_no': return d.asset_no || '';
      case 'sn': return d.sn || '';
      case 'status': return state.options?.statuses?.find((s) => s.id === d.status)?.label || d.status || '';
      case 'owner_name': return d.owner_name || '';
      case 'org': return d.org_path || '';
      case 'updated_at': return d.updated_at || '';
      default: return [d.brand, d.model].filter(Boolean).join(' ') || d.asset_no || '';
    }
  };
  return (a, b) => {
    const x = val(a); const y = val(b);
    if (sort === 'updated_at') return String(x).localeCompare(String(y)) * dir;
    return String(x).localeCompare(String(y), 'zh-CN') * dir;
  };
}

/* ---------------- 详细信息视图 ---------------- */

const EX_COLUMNS = [
  { key: 'name', label: '名称', cls: 'ex-col-name' },
  { key: 'asset_no', label: '资产编号' },
  { key: 'sn', label: '序列号' },
  { key: 'status', label: '状态' },
  { key: 'owner_name', label: '使用人' },
  { key: 'org', label: '所在位置' },
  { key: 'updated_at', label: '修改日期' },
];

function exDetailsHTML() {
  const ex = state.ex;
  const arrow = (k) => (ex.sort === k ? `<span class="ex-sort">${ex.order === 'asc' ? '▲' : '▼'}</span>` : '');
  return `<div class="ex-details">
    <div class="ex-head">
      ${EX_COLUMNS.map((c) => `<div class="ex-th ${c.cls || ''}" data-sort="${c.key}">${esc(c.label)}${arrow(c.key)}</div>`).join('')}
    </div>
    <div class="ex-rows" id="exRows">
      ${ex.rows.map((r, i) => (r.kind === 'org' ? exFolderRowHTML(r.org, i) : exDeviceRowHTML(r.dev, i))).join('')}
    </div>
  </div>`;
}

function exFolderRowHTML(o, i) {
  const ex = state.ex;
  const key = exRowKey('org', o.id);
  const cnt = ex.includeChildren ? o.total_count : o.own_count;
  return `<div class="ex-item folder${ex.sel.has(key) ? ' sel' : ''}" data-key="${key}" data-idx="${i}" data-drop="1">
    <div class="ex-col-name"><span class="ex-ico">${svgIcon('folder', 16)}</span>
      <span class="ex-t">${esc(o.name)}</span>
      ${o.child_count ? `<span class="ex-muted">（${o.child_count} 个子文件夹）</span>` : ''}
    </div>
    <div class="ex-muted mono"></div>
    <div class="ex-muted mono"></div>
    <div class="ex-muted"></div>
    <div class="ex-muted"></div>
    <div class="ex-muted">${esc(o.path || o.name)}</div>
    <div class="ex-muted">${esc((o.updated_at || '').replace('T', ' ').slice(0, 16))}</div>
    <div class="ex-item-badge">${cnt} 项</div>
  </div>`;
}

function exDeviceRowHTML(d, i) {
  const ex = state.ex;
  const key = exRowKey('device', d.id);
  return `<div class="ex-item device${ex.sel.has(key) ? ' sel' : ''}" data-key="${key}" data-idx="${i}" draggable="true">
    <div class="ex-col-name"><span class="ex-ico" style="color:${esc(d.category_color || 'var(--ink-3)')}">${iconOf(d.category_icon, 16)}</span>
      <span class="ex-t">${esc([d.brand, d.model].filter(Boolean).join(' ') || '(未填型号)')}</span>
      <span class="ex-muted">${esc(d.category_name || '未分类')}</span>
    </div>
    <div class="mono">${esc(d.asset_no || '—')}</div>
    <div class="mono">${esc(d.sn || '—')}</div>
    <div>${statusBadge(d.status)}</div>
    <div>${esc(d.owner_name || '')}</div>
    <div class="ex-muted">${esc(d.org_path || '未分配')}</div>
    <div class="ex-muted">${esc((d.updated_at || '').replace('T', ' ').slice(0, 16))}</div>
    <div></div>
  </div>`;
}

/* ---------------- 大图标视图 ---------------- */

function exTilesHTML() {
  const ex = state.ex;
  return `<div class="ex-tiles">
    ${ex.rows.map((r, i) => {
    if (r.kind === 'org') {
      const o = r.org;
      const key = exRowKey('org', o.id);
      return `<div class="ex-tile folder${ex.sel.has(key) ? ' sel' : ''}" data-key="${key}" data-idx="${i}" data-drop="1">
        <div class="ex-tile-ico">${svgIcon('folder', 40)}</div>
        <div class="ex-tile-name">${esc(o.name)}</div>
        <div class="ex-tile-sub">${ex.includeChildren ? o.total_count : o.own_count} 项</div>
      </div>`;
    }
    const d = r.dev;
    const key = exRowKey('device', d.id);
    return `<div class="ex-tile device${ex.sel.has(key) ? ' sel' : ''}" data-key="${key}" data-idx="${i}" draggable="true">
      <div class="ex-tile-ico" style="color:${esc(d.category_color || 'var(--ink-3)')}">${iconOf(d.category_icon, 40)}</div>
      <div class="ex-tile-name" title="${esc([d.brand, d.model].filter(Boolean).join(' '))}">${esc([d.brand, d.model].filter(Boolean).join(' ') || '(未填型号)')}</div>
      <div class="ex-tile-sub mono">${esc(d.asset_no || '')}</div>
      <div class="ex-tile-sub">${statusBadge(d.status)}</div>
      <div class="ex-tile-sub ex-muted">${esc(d.owner_name || '未分配使用人')}</div>
    </div>`;
  }).join('')}
  </div>`;
}

function exEmptyHTML() {
  const ex = state.ex;
  const kw = ex.keyword ? `没有找到匹配「${esc(ex.keyword)}」的项目。` : '这个文件夹是空的。';
  return `<div class="ex-empty">
    <div class="ex-empty-ico">${svgIcon('folder-open', 38)}</div>
    <p>${kw}</p>
    <p class="ex-muted">${ex.keyword ? '换个关键字试试。' : '可以把设备从别处拖进来，或右键新建子文件夹。'}</p>
  </div>`;
}

/* ---------------- 选中 / 打开 / 拖放 / 右键 ---------------- */

function exItems() { return $$('#exBody .ex-item, #exBody .ex-tile'); }

function exSelect(key, { ctrl = false, shift = false, toggle = false } = {}) {
  const ex = state.ex;
  if (shift && ex.anchor != null && ex.rows[ex.anchor]) {
    const to = ex.rows.findIndex((r) => r.key === key);
    if (to >= 0) {
      if (!ctrl) ex.sel.clear();
      const [a, b] = ex.anchor <= to ? [ex.anchor, to] : [to, ex.anchor];
      for (let i = a; i <= b; i++) ex.sel.add(ex.rows[i].key);
    }
  } else if (ctrl || toggle) {
    if (ex.sel.has(key)) ex.sel.delete(key); else ex.sel.add(key);
    ex.anchor = ex.rows.findIndex((r) => r.key === key);
  } else {
    ex.sel.clear();
    ex.sel.add(key);
    ex.anchor = ex.rows.findIndex((r) => r.key === key);
  }
  exPaintSelection();
  exRenderStatus();
}

function exPaintSelection() {
  for (const el of exItems()) {
    const on = state.ex.sel.has(el.getAttribute('data-key'));
    if (el.classList) el.classList.toggle('sel', on);
  }
}

function exSelectedDevices() {
  return [...state.ex.sel].filter((k) => exRowKind(k) === 'device').map(exRowId);
}

function exOpen(key) {
  if (exRowKind(key) === 'org') exNavigate(exRowId(key));
  else openDeviceDetail(exRowId(key));
}

function bindExplorerBody() {
  const ex = state.ex;

  // 列头排序
  $$('#exBody [data-sort]').forEach((th) => {
    th.onclick = () => {
      const k = th.getAttribute('data-sort');
      if (ex.sort === k) ex.order = ex.order === 'asc' ? 'desc' : 'asc';
      else { ex.sort = k; ex.order = 'asc'; }
      exLoad();
    };
  });

  exItems().forEach((el) => {
    const key = el.getAttribute('data-key');
    const kind = exRowKind(key);

    el.onclick = (e) => {
      e.stopPropagation();
      exSelect(key, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey, toggle: e.ctrlKey || e.metaKey });
    };
    el.ondblclick = (e) => { e.stopPropagation(); exOpen(key); };

    // 右键菜单
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!ex.sel.has(key)) exSelect(key);
      exMenu(e, kind === 'org' ? exFolderMenu(exRowId(key)) : exDeviceMenu());
    });

    if (kind === 'device') {
      el.addEventListener('dragstart', (e) => {
        if (!ex.sel.has(key)) exSelect(key);
        e.dataTransfer?.setData('text/plain', exSelectedDevices().join(','));
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
        el.classList.add('dragging');
      });
      el.addEventListener('dragend', () => el.classList.remove('dragging'));
    }
    // 文件夹可以当拖放目标（内容区里的子文件夹）
    if (kind === 'org') {
      el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drop'); });
      el.addEventListener('dragleave', () => el.classList.remove('drop'));
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.remove('drop');
        const ids = String(e.dataTransfer?.getData('text/plain') || '').split(',').filter(Boolean);
        if (ids.length) exMoveTo(exRowId(key), ids);
      });
    }
  });

  // 点空白处取消选择（资源管理器就是这样）
  const host = $('#exBody');
  if (host) {
    host.onclick = (e) => {
      if (e.target === host || e.target.id === 'exRows' || (e.target.classList && e.target.classList.contains('ex-details'))) {
        ex.sel.clear();
        exPaintSelection();
        exRenderStatus();
      }
    };
    host.addEventListener('contextmenu', (e) => {
      if (e.target === host || e.target.id === 'exRows' || (e.target.classList && e.target.classList.contains('ex-details'))) {
        e.preventDefault();
        ex.sel.clear();
        exPaintSelection();
        exRenderStatus();
        exMenu(e, exEmptyMenu());
      }
    });
  }
}

/* ---------------- 右键菜单 ---------------- */

function exMenu(evt, items) {
  exCloseMenu();
  const m = document.createElement('div');
  m.className = 'ex-menu';
  m.id = 'exMenu';
  m.innerHTML = items.map((it) => (it === '-'
    ? '<div class="ex-menu-sep"></div>'
    : `<button class="ex-menu-item${it.disabled ? ' disabled' : ''}${it.danger ? ' danger' : ''}" data-act="${it.act}" ${it.disabled ? 'disabled' : ''}>
         <span class="ex-menu-ico">${it.ico ? svgIcon(it.ico, 14) : ''}</span>${esc(it.label)}${it.hint ? `<span class="ex-menu-hint">${esc(it.hint)}</span>` : ''}
       </button>`)).join('');
  document.body.appendChild(m);
  // 贴边处理：别让菜单跑出屏幕
  const w = m.offsetWidth || 200; const h = m.offsetHeight || 200;
  const x = Math.min(evt.clientX, window.innerWidth - w - 6);
  const y = Math.min(evt.clientY, window.innerHeight - h - 6);
  m.style.left = `${Math.max(4, x)}px`;
  m.style.top = `${Math.max(4, y)}px`;

  m.querySelectorAll('[data-act]').forEach((b) => {
    b.onclick = () => {
      const act = b.getAttribute('data-act');
      exCloseMenu();
      const fn = exMenuActions[act];
      if (fn) fn();
    };
  });
  setTimeout(() => {
    document.addEventListener('mousedown', exCloseMenuOnOutside, true);
  }, 0);
}
function exCloseMenu() {
  const m = $('#exMenu');
  if (m) m.remove();
  document.removeEventListener('mousedown', exCloseMenuOnOutside, true);
}
function exCloseMenuOnOutside(e) {
  const m = $('#exMenu');
  if (m && !m.contains(e.target)) exCloseMenu();
}

function exDeviceMenu() {
  const ex = state.ex;
  const n = exSelectedDevices().length;
  const one = n === 1;
  const d = ex.rows.find((r) => r.key === [...ex.sel][0])?.dev;
  return [
    { act: 'open', label: '打开', ico: 'search', disabled: !one },
    { act: 'edit', label: '编辑属性', ico: 'pencil', disabled: !one },
    '-',
    { act: 'move', label: '移动到…', ico: 'folder', hint: n > 1 ? `${n} 台` : '' },
    { act: 'export', label: '导出所选', ico: 'download', disabled: !hasPerm('excel.export') },
    '-',
    { act: 'copy', label: '复制资产编号', disabled: !one },
    { act: 'delete', label: '删除', ico: 'trash', danger: true, hint: n > 1 ? `${n} 台` : '' },
  ].filter(Boolean).map((it) => (it.act === 'copy' && !d ? { ...it, disabled: true } : it));
}

function exFolderMenu(orgId) {
  const o = (state.ex.data?.flat || []).find((x) => x.id === orgId);
  const selOrg = [...state.ex.sel].filter((k) => exRowKind(k) === 'org').length;
  return [
    { act: 'enter', label: '打开', ico: 'folder-open' },
    { act: 'newsub', label: '新建子文件夹', ico: 'plus' },
    '-',
    { act: 'rename', label: '重命名', ico: 'pencil' },
    { act: 'deletebg', label: '删除文件夹', ico: 'trash', danger: true, hint: selOrg > 1 ? `${selOrg} 个` : '' },
    '-',
    { act: 'exportorg', label: '导出这个文件夹的设备', ico: 'download', disabled: !hasPerm('excel.export') },
    { act: 'props', label: `属性：${o?.path || ''}`, disabled: true },
  ];
}

function exEmptyMenu() {
  return [
    { act: 'newsub', label: '新建文件夹', ico: 'plus' },
    { act: 'refresh', label: '刷新', ico: 'refresh' },
    '-',
    { act: 'all', label: '全选', ico: 'check-circle' },
    { act: 'view-details', label: '查看：详细信息', ico: 'list', disabled: state.ex.view === 'details' },
    { act: 'view-tiles', label: '查看：大图标', ico: 'devices', disabled: state.ex.view === 'tiles' },
    '-',
    { act: 'toggle-children', label: state.ex.includeChildren ? '只显示本级内容' : '包含子文件夹内容', ico: 'folder-open' },
    { act: 'exportorg', label: '导出当前文件夹设备', ico: 'download', disabled: !hasPerm('excel.export') },
  ];
}

const exMenuActions = {
  open: () => { const k = [...state.ex.sel][0]; if (k) exOpen(k); },
  enter: () => { const k = [...state.ex.sel].find((x) => exRowKind(x) === 'org'); if (k) exNavigate(exRowId(k)); },
  edit: () => { const ids = exSelectedDevices(); if (ids.length === 1) openDeviceForm(ids[0]); },
  move: () => exMoveDialog(exSelectedDevices()),
  export: () => exExportSelected(),
  copy: () => {
    const d = ex.rows.find((r) => r.key === [...state.ex.sel][0])?.dev;
    if (d) copyText(d.asset_no || d.sn || '');
  },
  delete: () => exDeleteSelected(),
  newsub: () => exNewFolder(),
  rename: () => {
    const k = [...state.ex.sel].find((x) => exRowKind(x) === 'org');
    if (k) exRenameFolder(exRowId(k));
  },
  deletebg: () => exDeleteFolders([...state.ex.sel].filter((x) => exRowKind(x) === 'org').map(exRowId)),
  refresh: () => renderExplorer(),
  all: () => { state.ex.rows.forEach((r) => state.ex.sel.add(r.key)); exPaintSelection(); exRenderStatus(); },
  'view-details': () => { state.ex.view = 'details'; exLoad(); },
  'view-tiles': () => { state.ex.view = 'tiles'; exLoad(); },
  'toggle-children': () => exToggleChildren(!state.ex.includeChildren),
  exportorg: () => exExportFolder(),
  props: () => { /* 只读提示项 */ },
};

/* ---------------- 状态栏 / 导航按钮 ---------------- */

function exRenderStatus() {
  const box = $('#exStatus');
  if (!box) return;
  const ex = state.ex;
  const selDev = exSelectedDevices().length;
  const selFolder = [...ex.sel].filter((k) => exRowKind(k) === 'org').length;
  const bits = [];
  if (selDev || selFolder) {
    bits.push(`选中 ${[selDev ? `${selDev} 台设备` : '', selFolder ? `${selFolder} 个文件夹` : ''].filter(Boolean).join(' + ')}`);
  } else {
    bits.push(`${ex.rows.length} 个项目`);
  }
  if (ex.folderCount) bits.push(`${ex.folderCount} 个文件夹`);
  if (ex.total != null && ex.rows.length - ex.folderCount !== ex.total) bits.push(`${ex.total} 台设备`);
  box.innerHTML = `
    <span class="ex-status-left">${esc(bits.join('　·　'))}${ex.includeChildren ? '　·　<b>包含子文件夹</b>' : ''}${ex.keyword ? `　·　搜索「${esc(ex.keyword)}」` : ''}</span>
    <span class="ex-status-right">
      ${ex.capped ? `<span class="ex-warn">只显示前 ${ex.cap} 台，请用搜索缩小范围</span>` : ''}
      <label class="ex-switch" title="勾上后连子文件夹里的设备一起列出（数字口径也会跟着变）">
        <input type="checkbox" id="exRecur" ${ex.includeChildren ? 'checked' : ''}> 包含子文件夹
      </label>
    </span>`;
  const rc = $('#exRecur');
  if (rc) rc.onchange = () => exToggleChildren(rc.checked);
}

function exToggleChildren(on) {
  state.ex.includeChildren = !!on;
  const tree = $('#exTree');
  if (tree) { tree.innerHTML = exTreeHTML(); bindExplorerTree(); }
  exLoad();
}

function exRenderNavButtons() {
  const ex = state.ex;
  const back = $('#exBack'); const fwd = $('#exFwd'); const up = $('#exUp');
  if (back) { back.disabled = ex.histIdx <= 0; back.classList.toggle('off', back.disabled); }
  if (fwd) { fwd.disabled = ex.histIdx >= ex.hist.length - 1; fwd.classList.toggle('off', fwd.disabled); }
  if (up) {
    const canUp = !!ex.orgId && ex.orgId !== EX_NONE;
    up.disabled = !canUp;
    up.classList.toggle('off', !canUp);
  }
}

function exGoBack() {
  const ex = state.ex;
  if (ex.histIdx <= 0) return;
  ex.histIdx -= 1;
  exNavigate(ex.hist[ex.histIdx], { push: false });
}
function exGoFwd() {
  const ex = state.ex;
  if (ex.histIdx >= ex.hist.length - 1) return;
  ex.histIdx += 1;
  exNavigate(ex.hist[ex.histIdx], { push: false });
}

function bindExplorerToolbar() {
  const ex = state.ex;
  const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
  on('#exBack', exGoBack);
  on('#exFwd', exGoFwd);
  on('#exUp', exUp);
  on('#exRefresh', () => renderExplorer());

  const kw = $('#exKw');
  if (kw) {
    // 资源管理器是"打字即搜"，不需要按回车
    let timer = null;
    kw.oninput = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { state.ex.keyword = kw.value.trim(); exLoad(); }, 260);
    };
    kw.onkeydown = (e) => {
      if (e.key === 'Enter') { state.ex.keyword = kw.value.trim(); exLoad(); }
      if (e.key === 'Escape') { kw.value = ''; state.ex.keyword = ''; exLoad(); }
      e.stopPropagation();
    };
  }
  $$('.ex-vt').forEach((b) => {
    b.onclick = () => { state.ex.view = b.getAttribute('data-view'); exLoad(); };
  });
}

/* ---------------- 键盘：照搬资源管理器 ---------------- */

function exKeyHandler(e) {
  if (state.view !== 'explorer') return;
  const tag = (e.target?.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
  const ex = state.ex;
  const keys = ex.rows.map((r) => r.key);

  const move = (delta) => {
    if (!keys.length) return;
    let idx = keys.findIndex((k) => ex.sel.has(k));
    if (idx < 0) idx = delta > 0 ? -1 : keys.length;
    const next = Math.max(0, Math.min(keys.length - 1, idx + delta));
    ex.sel.clear();
    ex.sel.add(keys[next]);
    ex.anchor = next;
    exPaintSelection();
    exRenderStatus();
    const el = exItems().find((x) => x.getAttribute('data-key') === keys[next]);
    el?.scrollIntoView?.({ block: 'nearest' });
  };

  if (e.key === 'Enter') {
    const k = [...ex.sel][0];
    if (k) { e.preventDefault(); exOpen(k); }
  } else if (e.key === 'F2') {
    e.preventDefault();
    const k = [...ex.sel][0];
    if (!k) return;
    if (exRowKind(k) === 'org') exRenameFolder(exRowId(k));
    else openDeviceForm(exRowId(k));
  } else if (e.key === 'Delete') {
    e.preventDefault();
    const orgs = [...ex.sel].filter((k) => exRowKind(k) === 'org');
    if (orgs.length) exDeleteFolders(orgs.map(exRowId));
    else exDeleteSelected();
  } else if (e.key === 'F5') {
    e.preventDefault();
    renderExplorer();
  } else if (e.key === 'Backspace') {
    e.preventDefault();
    exUp();
  } else if (e.key === 'ArrowDown') { e.preventDefault(); move(1); } else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); } else if (e.key === 'Home') { e.preventDefault(); move(-keys.length); } else if (e.key === 'End') { e.preventDefault(); move(keys.length); } else if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
    e.preventDefault();
    keys.forEach((k) => ex.sel.add(k));
    exPaintSelection();
    exRenderStatus();
  } else if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); exGoBack(); } else if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); exGoFwd(); } else if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); exUp(); }
}
// 全局键盘快捷键（照搬资源管理器：Enter/F2/Delete/F5/Backspace/方向键/Alt+左右）。
// 挂之前先探一下，别在缺 addEventListener 的极简环境里直接把模块打死。
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('keydown', exKeyHandler);
}

/* ---------------- 操作实现 ---------------- */

async function exMoveTo(orgId, ids) {
  if (!ids?.length) return;
  if (!orgId) { toast('请拖到具体的文件夹上', 'warn'); return; }
  const target = orgId === EX_NONE ? null : orgId;
  const label = orgId === EX_NONE ? '未分配组织'
    : (state.ex.data?.flat.find((o) => o.id === orgId)?.path || '该组织');
  const ok = await confirmBox(`移动 ${ids.length} 个项目`, `要把 ${ids.length} 台设备移动到「${label}」吗？`);
  if (!ok) return;
  try {
    const r = await api('/devices/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, action: 'move', payload: { org_id: target } }),
    });
    toast(`已移动 ${r.ok ?? ids.length} 台设备`);
    state.ex.sel.clear();
    await renderExplorer();
  } catch (e) { toast(e.message, 'error'); }
}

function exMoveDialog(ids) {
  if (!ids.length) { toast('先选中要移动的设备', 'warn'); return; }
  const flat = state.ex.data?.flat || [];
  const opts = [
    ...flat.map((o) => `<option value="${o.id}" ${o.id === state.ex.orgId ? 'selected' : ''}>${esc(o.path)}</option>`),
    `<option value="${EX_NONE}">未分配组织（清空归属）</option>`,
  ].join('');
  openModal(`
    <div class="modal-head"><h2>移动 ${ids.length} 个项目</h2><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="field"><label>目标文件夹</label><select id="exMoveOrg">${opts}</select></div>
      <p class="muted" style="margin:0">移动会写进每台设备的流转记录，可追溯。</p>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="closeModal()">取消</button>
      <button class="btn primary" onclick="closeModal();exMoveTo(document.getElementById('exMoveOrg').value, ${JSON.stringify(ids)})">移动</button>
    </div>`, { slim: true });
}

async function exDeleteSelected() {
  const ids = exSelectedDevices();
  if (!ids.length) { toast('先选中要删除的设备', 'warn'); return; }
  const ok = await confirmBox(`删除 ${ids.length} 台设备`, '删除后可以在「回收站」里恢复。');
  if (!ok) return;
  try {
    const r = await api('/devices/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, action: 'delete' }),
    });
    toast(`已删除 ${r.ok ?? ids.length} 台设备（可在回收站恢复）`);
    state.ex.sel.clear();
    await renderExplorer();
  } catch (e) { toast(e.message, 'error'); }
}

async function exDeleteFolders(orgIds) {
  if (!orgIds.length) return;
  const names = orgIds.map((id) => state.ex.data?.flat.find((o) => o.id === id)?.name || id);
  const ok = await confirmBox(
    `删除 ${orgIds.length} 个文件夹`,
    `将删除：${names.join('、')}。文件夹里还有子文件夹或设备时删不掉（会提示），需要先清空或移动走。`,
  );
  if (!ok) return;
  let done = 0; const errs = [];
  for (const id of orgIds) {
    try { await api('/orgs/' + id, { method: 'DELETE' }); done++; }
    catch (e) { errs.push(`${state.ex.data?.flat.find((o) => o.id === id)?.name || id}：${e.message}`); }
  }
  // 删掉的如果是当前所在文件夹，退到上级
  if (orgIds.includes(state.ex.orgId)) state.ex.orgId = '';
  toast(done ? `已删除 ${done} 个文件夹${errs.length ? `，${errs.length} 个失败` : ''}` : '删除失败', errs.length ? 'warn' : 'ok');
  if (errs.length) console.warn('删除文件夹失败：', errs);
  await renderExplorer();
}

async function exRenameFolder(orgId) {
  const o = (state.ex.data?.flat || []).find((x) => x.id === orgId);
  if (!o) return;
  openModal(`
    <div class="modal-head"><h2>重命名文件夹</h2><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="field"><label>组织名称</label><input id="exRnName" value="${esc(o.name)}"></div>
      <p class="muted" style="margin:0">只改组织名称，里面的设备不受影响。</p>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="closeModal()">取消</button>
      <button class="btn primary" id="exRnSave">保存</button>
    </div>`, { slim: true });
  const btn = $('#exRnSave');
  if (btn) btn.onclick = async () => {
    const name = $('#exRnName').value.trim();
    if (!name) { toast('名称不能为空', 'warn'); return; }
    try {
      await api('/orgs/' + orgId, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      closeModal();
      toast('已重命名');
      await renderExplorer();
    } catch (e) { toast(e.message, 'error'); }
  };
}

function exNewFolder() {
  const id = state.ex.orgId;
  const parent = (!id || id === EX_NONE) ? null : id;
  const parentName = parent ? (state.ex.data?.flat.find((o) => o.id === parent)?.path || '') : '（根，作为顶级组织）';
  openModal(`
    <div class="modal-head"><h2>新建文件夹</h2><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="field"><label>上级文件夹</label><input id="exNfParent" value="${esc(parentName)}" disabled></div>
      <div class="field"><label>名称 <span class="req">*</span></label><input id="exNfName" placeholder="如 运维组"></div>
      <div class="field"><label>类型</label><select id="exNfType">
        ${(state.options?.org_types || [{ id: 'department', label: '部门' }]).map((t) => `<option value="${t.id}" ${t.id === (parent ? 'team' : 'department') ? 'selected' : ''}>${t.label}</option>`).join('')}
      </select></div>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="closeModal()">取消</button>
      <button class="btn primary" id="exNfSave">创建</button>
    </div>`, { slim: true });
  const btn = $('#exNfSave');
  const inp = $('#exNfName');
  if (inp) inp.onkeydown = (e) => { if (e.key === 'Enter') btn?.click(); };
  if (btn) btn.onclick = async () => {
    const name = $('#exNfName').value.trim();
    if (!name) { toast('名称不能为空', 'warn'); return; }
    try {
      const r = await api('/orgs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, parent_id: parent, type: $('#exNfType').value }),
      });
      closeModal();
      toast(`已创建「${name}」`);
      exNavigate(r.id);
    } catch (e) { toast(e.message, 'error'); }
  };
}

/** 导出当前文件夹（或选中）的设备 */
async function exExportFolder() {
  if (!hasPerm('excel.export')) { toast('没有导出权限', 'warn'); return; }
  const q = {};
  if (state.ex.orgId === EX_NONE) q.no_org = '1';
  else if (state.ex.orgId) { q.org_id = state.ex.orgId; if (!state.ex.includeChildren) q.org_direct = '1'; }
  if (state.ex.keyword) q.keyword = state.ex.keyword;
  if (state.ex.status) q.status = state.ex.status;
  try {
    const ids = await api('/devices/ids?' + new URLSearchParams(q).toString());
    if (!ids.ids?.length) { toast('这个文件夹里没有可导出的设备', 'warn'); return; }
    await doExport({ ids: ids.ids, split: true });
  } catch (e) { toast(e.message, 'error'); }
}

function exExportSelected() {
  const ids = exSelectedDevices();
  if (!ids.length) { toast('先选中要导出的设备', 'warn'); return; }
  if (!hasPerm('excel.export')) { toast('没有导出权限', 'warn'); return; }
  doExport({ ids, split: true }).catch((e) => toast(e.message, 'error'));
}

window.renderExplorer = renderExplorer;
window.exNavigate = exNavigate;
window.exMoveTo = exMoveTo;
window.exGoBack = exGoBack;
window.exGoFwd = exGoFwd;
window.exUp = exUp;
// 便于自动化测试：渲染冒烟用的假 DOM 看不到 innerHTML 里新建的元素，
// 所以把渲染函数直接暴露出来断言产出（和 photoPanelHTML 同样的路子）。
window.exDetailsHTML = exDetailsHTML;
window.exFolderRowHTML = exFolderRowHTML;
window.exDeviceRowHTML = exDeviceRowHTML;
window.exTilesHTML = exTilesHTML;
window.exEmptyHTML = exEmptyHTML;
window.exCrumbs = exCrumbs;
window.exDeviceMenu = exDeviceMenu;
window.exFolderMenu = exFolderMenu;
window.exEmptyMenu = exEmptyMenu;
window.exMenuActions = exMenuActions;
window.exKeyHandler = exKeyHandler;

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
/* 批量识别录入：弹窗标题栏的 × 和底部「取消」都是内联 onclick，
   不挂 window 就是「点了没反应、控制台还干净」的那种静默失效。
   其余的控件在 bindBatchOcrModal() 里按 id 挂，不需要导出。 */
window.openBatchOcr = openBatchOcr;
window.closeBatchOcr = closeBatchOcr;
/* 内部状态也挂出来：和移动端的 window.mobileState 对称。
   测试夹具靠它读批次状态（不暴露的话只能靠猜 DOM，断言就会变成「抄一遍实现」）。 */
window.adminState = state;
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
window.showExcelGuide = showExcelGuide;
window.xlPreview = xlPreview;
window.xlPickBase = xlPickBase;
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
