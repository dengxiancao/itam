/* ================= ITAM 移动端应用 ================= */
const API = '/api';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
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
  'check-circle': "<circle cx='12' cy='12' r='9'/><path d='m8 12.3 2.7 2.7L16.2 9.5'/>",
  save: "<path d='M19.5 21h-15A1.5 1.5 0 0 1 3 19.5v-15A1.5 1.5 0 0 1 4.5 3h11L21 8.5v11A1.5 1.5 0 0 1 19.5 21z'/><path d='M7.5 3v6h9V3'/><path d='M7.5 21v-6h9v6'/>",
  minus: "<path d='M5 12h14'/>",
  keyboard: "<rect x='2' y='6.5' width='20' height='11' rx='2'/><path d='M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M7.5 13.5h9'/>",
  // 仪表盘专用：KPI 卡图标 + 图表
  'user-plus': "<path d='M15 20.5v-1.6a4.6 4.6 0 0 0-4.6-4.6H5.6A4.6 4.6 0 0 0 1 18.9v1.6'/><circle cx='8' cy='7.5' r='3.8'/><path d='M19 6.5v6M22 9.5h-6'/>",
  tag: "<path d='M3 11.4V5.5A2.5 2.5 0 0 1 5.5 3h5.9a2 2 0 0 1 1.4.6l7.6 7.6a2 2 0 0 1 0 2.8l-5.7 5.7a2 2 0 0 1-2.8 0L3.6 12.8A2 2 0 0 1 3 11.4z'/><path d='M7.8 7.8h.01'/>",
  grid: "<rect x='3.5' y='3.5' width='7' height='7' rx='1.6'/><rect x='13.5' y='3.5' width='7' height='7' rx='1.6'/><rect x='3.5' y='13.5' width='7' height='7' rx='1.6'/><rect x='13.5' y='13.5' width='7' height='7' rx='1.6'/>",
  qr: "<rect x='3' y='3' width='7' height='7' rx='1.5'/><rect x='14' y='3' width='7' height='7' rx='1.5'/><rect x='3' y='14' width='7' height='7' rx='1.5'/><path d='M14 14h3v3h-3z'/><path d='M21 14.5V17M14 21h3M18.5 18.5H21V21'/>",
  barcode: "<path d='M2.5 5h1.6v14H2.5z'/><path d='M6 5h1v14H6z'/><path d='M9.5 5h2.2v14H9.5z'/><path d='M14 5h1.4v14H14z'/><path d='M17.8 5h1v14h-1z'/><path d='M21 5h.5v14H21z'/>",
};
/** 生成一枚内联 SVG 图标；颜色跟随 currentColor */
function svgIcon(name, size = 16) {
  const p = ICON_PATHS[name] || ICON_PATHS.package;
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}
/* ================= 通用小组件 =================
 * 移动端反复要用的三样东西：置信度环、列表骨架屏、一键复制。
 * 抽出来是为了让每个页面保持一致的观感，而不是各处手搓一遍。
 */

/** 置信度圆环：SVG 描边进度，颜色随高低切换（实心色圆看着像占位块，不像一个指标） */
function confRing(ratio, size = 88, stroke = 8) {
  const v = Math.max(0, Math.min(1, Number(ratio) || 0));
  const pct = Math.round(v * 100);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const tone = v >= 0.7 ? 'high' : v >= 0.45 ? 'mid' : 'low';
  const cx = size / 2;
  return `<svg class="ring ${tone}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="综合置信度 ${pct}%">
      <circle class="ring-bg" cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke-width="${stroke}"></circle>
      <circle class="ring-fg" cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke-width="${stroke}" stroke-linecap="round"
              stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - v)).toFixed(2)}"
              transform="rotate(-90 ${cx} ${cx})"></circle>
      <text class="ring-num" x="${cx}" y="${cx}" text-anchor="middle" dominant-baseline="central" font-size="${Math.round(size * 0.27)}">${pct}%</text>
    </svg>`;
}

/** 列表骨架屏：等接口回来之前先把版面撑住，避免内容"跳一下" */
function skRows(n = 4) {
  let out = '<div class="sk-list">';
  for (let i = 0; i < n; i++) {
    out += `<div class="sk-row"><div class="sk-ico"></div>
      <div class="sk-meta"><div class="sk-line w60"></div><div class="sk-line w40"></div></div></div>`;
  }
  return out + '</div>';
}

/** 一键复制：SN 又长又难念，逼用户长按选中再复制是反人类的 */
function copyText(text) {
  const v = String(text ?? '').trim();
  if (!v) { toast('没有可复制的内容', 'warn'); return; }
  const done = () => toast('已复制：' + v);
  try {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(v).then(done, () => fallbackCopy(v, done));
      return;
    }
  } catch { /* 落到下面的兜底 */ }
  fallbackCopy(v, done);
}
function fallbackCopy(v, done) {
  try {
    const ta = document.createElement('textarea');
    ta.value = v;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    if (document.body?.appendChild) {
      document.body.appendChild(ta);
      ta.select?.();
      document.execCommand?.('copy');
      ta.remove?.();
    }
    done();
  } catch { toast('复制失败，请长按手动选择', 'warn'); }
}
/** 供内联 onclick 调用：<button data-copy="SN" onclick="copyFrom(this)"> */
function copyFrom(el) {
  copyText(el?.getAttribute?.('data-copy') || '');
}

/** 底部标签栏开关：识别结果这类「流程页」要把标签栏让位给固定动作条 */
function setTabbar(on) {
  const tb = $('#tabbar');
  if (tb) tb.hidden = !on;
}

/* ---------------- 右上角「更多」菜单 ----------------
 * 「回到电脑端管理后台」「使用手册」这类辅助入口收在这里，
 * 这样两个主页面（仪表盘 / 识别入库）都不用再各摆一遍，重合就消除了。
 */
function toggleMore() {
  const sheet = $('#moreSheet');
  if (!sheet) return;
  openMore(sheet.hidden);
}
function openMore(on) {
  const sheet = $('#moreSheet');
  const mask = $('#moreMask');
  const btn = $('#moreBtn');
  if (!sheet || !mask) return;
  sheet.hidden = !on;
  mask.hidden = !on;
  if (btn) btn.setAttribute('aria-expanded', on ? 'true' : 'false');
}
function closeMore() { openMore(false); }

/**
 * 相册入口必须按当前流程走对分支：
 * 扫码模式下选图是「解条码」，不是「OCR 识别」。
 * 之前两者共用 pickFromGallery()，用户逛过扫码页再回首页选图就会串流程。
 */
function galleryForCapture() { state.cameraPurpose = 'capture'; pickFromGallery(); }
function galleryForScan(kind) { state.cameraPurpose = 'scan'; state.scanKind = scanKindOf(kind).key; pickFromGallery(); }

/** 区块小标题 */
const secLabel = (t) => `<div class="sec-label">${esc(t)}</div>`;

/* 设备类型键 → 图标名（键对应 ICON_PATHS；与后端 CATEGORY_ICONS 一一对应） */
const ICONS = { pc: 'monitor', laptop: 'laptop', monitor: 'monitor', printer: 'printer', network: 'globe', server: 'database', phone: 'smartphone', tablet: 'tablet', box: 'package', cpu: 'cpu', camera: 'camera', ups: 'battery' };

let state = {
  view: 'home',
  operator: localStorage.getItem('itam.operator') || '',
  stream: null,
  facing: 'environment',
  captured: null,        // 兼容旧字段（dataURL）
  capturedBlob: null,    // 压缩后的 JPEG Blob（识别用）
  originalBlob: null,    // 原图 Blob（归档进设备详情）
  thumbBlob: null,       // 缩略图 Blob（导出 Excel 时嵌入）
  previewUrl: null,      // 预览用的 objectURL
  busy: false,           // 防止重复点击
  recognizeResult: null,
  categories: [], orgs: [], statuses: [], suppliers: [], columnTrackingKeys: [],
  scanning: false,
  scanTimer: 0,         // 扫描轮询的定时器（改 setTimeout 后要能取消）
  cameraPurpose: 'idle',  // idle | capture | scan —— 相机这次是拿来干嘛的（别和 scanRole 混）
  scanRole: 'lookup',       // lookup | verify —— 扫到之后是「查设备」还是「核对」
  scanKind: 'qr',           // qr | bar —— 当前入口指定只解哪一种码
  verifyDevice: null,
  shot: { zoom: 1, x: 0, y: 0 },   // 照片放大比对视图的缩放/位移
  recentItems: [],       // 「最近设备」已取回的列表（本地筛选用，不用每敲一个字就打接口）
  recentQuery: '',
  recentStatus: '',      // 「最近设备」的状态筛选片
  recentTotal: 0,        // 服务端上报的总数，用来提示「只显示了前 N 台」
};

async function api(path, opts = {}) {
  const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;
  const headers = { ...(opts.headers || {}) };
  if (!isForm && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const res = await fetch(API + path, { ...opts, headers });
  let body = null;
  try { body = await res.json(); } catch { /* ignore */ }
  if (!res.ok) {
    if (res.status === 401) {
      location.href = '/login?next=' + encodeURIComponent(location.pathname) + '&expired=1';
      throw new Error('登录已过期，正在跳转登录页…');
    }
    throw new Error(body?.error || body?.detail || `请求失败 (${res.status})`);
  }
  return body?.data ?? body;
}

function toast(msg, type = 'ok') {
  const box = $('#mToasts');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'm-toast ' + (type === 'error' ? 'error' : type === 'warn' ? 'warn' : 'ok');
  el.innerHTML = `<span class="toast-ico">${svgIcon(type === 'error' ? 'alert' : type === 'warn' ? 'bell' : 'check-circle')}</span><span class="toast-txt"></span>`;
  el.lastElementChild.textContent = msg;
  box.appendChild(el);
  // 报错信息通常更长，多留一点阅读时间
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity .3s';
    setTimeout(() => el.remove(), 300);
  }, type === 'error' ? 4200 : 3000);
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function statusColor(status) {
  const m = state.statuses.find((s) => s.id === status);
  return m?.color || 'var(--text-3)';
}
function statusLabel(status) {
  const m = state.statuses.find((s) => s.id === status);
  return m?.label || status;
}
function statusBadge(status) {
  return `<span class="badge" style="color:${statusColor(status)}">${esc(statusLabel(status))}</span>`;
}

/* ================= 启动 ================= */
async function boot() {
  $('#operator').value = state.operator;
  $('#operator').oninput = (e) => { state.operator = e.target.value.trim(); localStorage.setItem('itam.operator', state.operator); };
  $$('#tabbar .tab').forEach((t) => t.onclick = () => {
    $$('#tabbar .tab').forEach((x) => x.classList.toggle('active', x === t));
    route(t.dataset.v);
  });

  // 未登录先去登录（登录后回到当前页面）
  try {
    const st = await api('/auth/status');
    if (!st.authenticated) {
      location.href = '/login?next=' + encodeURIComponent('/m' + location.hash);
      return;
    }
  } catch { /* 交给下面统一报错 */ }

  try {
    const o = await api('/options');
    state.categories = o.categories; state.orgs = o.orgs; state.statuses = o.statuses;
    state.suppliers = o.suppliers || [];
    state.columnTrackingKeys = o.column_tracking_keys || [];
  } catch (e) {
    $('#main').innerHTML = `<div class="empty"><div class="em">${svgIcon('alert', 40)}</div>无法连接服务端<br><span class="muted">${esc(e.message)}</span></div>`;
    return;
  }
  // hash 路由（扫码打开 #/device/:id，或手动 #/d/<页签>）
  if (location.hash.startsWith('#/device/')) {
    openDeviceDetail(location.hash.split('/').pop());
    return;
  }
  if (location.hash.startsWith('#/d/')) {
    const v = location.hash.slice(4);
    if (['dashboard', 'home', 'scan', 'recent'].includes(v)) {
      $$('#tabbar .tab').forEach((x) => x.classList.toggle('active', x.dataset.v === v));
      route(v);
      return;
    }
  }
  route('dashboard');
}

function route(view) {
  state.view = view;
  // 切标签一定要把底部导航放回来：识别结果等流程页会临时把它藏起来
  setTabbar(true);
  const fn = { dashboard: renderDashboard, home: renderHome, scan: renderScan, recent: renderRecent }[view] || renderHome;
  fn();
}


function fmtNum(n) {
  const v = Number(n || 0);
  return Number.isFinite(v) ? v.toLocaleString('zh-CN') : String(n ?? '');
}


/* ================= 识别入库（tab: home）—— 「只做事」的一页 =================
 * 这一页的职责**只有一件事**：把设备录进来。所以屏幕上只留四个动作：
 *   拍照识别入库（主）· 从相册选图识别 · 扫码核对查询 · 照片备份开关
 *
 * 明确不放的东西（和「仪表盘」的分工，改之前先读）：
 *   - 不放概览数字  → 那是仪表盘的事，这里放数字会把主按钮挤下首屏；
 *   - 不放「最近设备」→ 底部 tab 有，重复入口没有意义；
 *   - 不放「回管理后台」「使用手册」→ 已收进右上角「更多」菜单，两页共用。
 *
 * 命名历史：route('home') / window.renderHome / 若干 onclick 仍按老名字 renderHome 调，
 * 所以 renderHome 是薄壳，实现叫 renderHomeLegacy —— 两个名字都留着，别改动其中一个。
 */
function renderHome() {
  return renderHomeLegacy();
}

function renderHomeLegacy() {
  setTabbar(true);
  const secure = window.isSecureContext === true;
  const onLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const camOk = secure || onLocalhost;
  $('#main').innerHTML = `
    ${camOk ? '' : `
      <div class="card">
        <h3>${svgIcon('camera', 16)} 摄像头未启用</h3>
        <p class="hint" style="margin-top:0">手机浏览器只在 <b>HTTPS</b>（或 localhost）下才允许调用摄像头。你现在打开的是 HTTP 地址，先切换到 HTTPS：</p>
        <span class="mono code-box" style="display:block;margin:10px 0;padding:9px 11px;background:var(--surface-2);border-radius:8px;font-size:12.5px;word-break:break-all;color:var(--text-2)">${esc(httpsUrl())}</span>
        <button class="btn primary block" onclick="location.href='${httpsUrl()}'">${svgIcon('lock', 16)} 切换到 HTTPS</button>
        <p class="hint">首次打开会提示「连接不是私密连接」→ 点「高级」→「继续访问」即可，之后就能拍照了。</p>
      </div>`}

    <button class="big-btn primary" onclick="openCamera('capture')">
      <span class="em">${svgIcon('camera', 23)}</span>
      <span class="bb-txt">
        <span class="t">拍照识别入库</span>
        <span class="s">对准设备铭牌 / SN 条码，自动识别品牌、型号、序列号</span>
      </span>
      <span class="bb-arrow">${svgIcon('chevron', 18)}</span>
    </button>

    <div class="m-group">
      <button class="m-row" onclick="galleryForCapture()">
        <span class="em">${svgIcon('image', 19)}</span>
        <span class="m-row-txt"><span class="t">从相册选图识别</span><span class="s">没有拍照条件时，上传铭牌照片识别</span></span>
        ${svgIcon('chevron', 16)}
      </button>
      <button class="m-row" onclick="renderScan()">
        <span class="em">${svgIcon('search', 19)}</span>
        <span class="m-row-txt"><span class="t">扫码核对 / 查询</span><span class="s">扫二维码或条码，可直接查设备</span></span>
        ${svgIcon('chevron', 16)}
      </button>
    </div>

    <div class="card">
      <h3>${svgIcon('download', 16)} 照片备份到手机</h3>
      <label class="switch-row">
        <span class="sw-txt">
          <b>识别成功后自动存一份到手机</b>
          <span class="sw-sub">安卓存「下载」，iOS 存「文件」；识别前的预览页也能随时手动保存</span>
        </span>
        <input type="checkbox" id="chkAutosave" ${autosaveOn() ? 'checked' : ''}>
      </label>
    </div>`;
  const chk = $('#chkAutosave');
  if (chk) chk.onchange = () => { setAutosave(chk.checked); toast(chk.checked ? '已开启自动备份' : '已关闭自动备份', chk.checked ? 'ok' : 'warn'); };
}

/* ================= 入口 ================= */
function httpsUrl() {
  // 把当前地址切换成 HTTPS + 8443 端口（手机调用摄像头必需）
  const host = location.hostname || 'localhost';
  return `https://${host}:8443/m`;
}

/* ================= 概览（tab: dashboard） =================
 * 这是「录入端」的首页，不是管理端仪表盘。
 *
 * 设计约束（改之前先读）：
 *   - 一屏之内必须能看完。手机是单手竖屏拿的，翻三屏才到底的统计页等于没有。
 *   - 只回答一个问题：「现在库里是什么状况」。所以只有一行概览数字。
 *   - 分类 TOP / 品牌 TOP / 状态分布环这些**报表**一律不放 —— 那是电脑端管理后台的活。
 *   - 主行动必须是「拍照识别入库」，它是这个 App 存在的理由；统计只是背景信息。
 */
/* ================= 概览（tab: dashboard）—— 「只看数」的一页 =================
 * 这一页的职责**只有一件事**：让用户一眼知道「库里现在什么状况」。
 *
 * 关键约束：**这里不放任何操作入口**（不放拍照、不放扫码、不放回后台）。
 * 原因见用户反馈：曾经两页都摆着「拍照识别入库 / 扫码核对 / 回后台 / 使用手册」，
 * 四处重合，看哪个都像首页，主要功能反而不突出。
 * 现在的分工是「仪表盘看数、识别入库做事」，操作入口一律归识别入库页。
 *
 * 也不放分类 TOP / 品牌 TOP / 状态分布环 —— 那些是报表，归电脑端管理后台。
 */
async function renderDashboard() {
  setTabbar(true);
  // 骨架屏按新版结构来：一条概览 + 一张「最近设备」卡
  $('#main').innerHTML = '<div class="card"><div class="sk-line w60"></div><div class="sk-line w40"></div></div>' + skRows(3);
  let d;
  try {
    d = await api('/dashboard');
  } catch (err) {
    $('#main').innerHTML = `<div class="empty"><div class="em">${svgIcon('alert', 40)}</div>加载失败<br><span class="muted">${esc(err.message)}</span></div>`;
    return;
  }
  // 数据可能在 await 期间被顶掉（用户切了 tab），回来要认一下自己还是不是当前视图
  if (state.view !== 'dashboard') return;

  const k = d.kpi || {};
  const n = (v) => fmtNum(v);
  // 概览只留 4 个数，且都是有行动含义的：
  //   总数（规模）· 在用（已部署）· 库存闲置（可调配）· 维修中（待处理）
  const brief = [
    { l: '在用', v: n(k.in_use), tone: 'ok' },
    { l: '库存闲置', v: n(k.in_stock), tone: '' },
    { l: '维修中', v: n(k.repair), tone: Number(k.repair) > 0 ? 'warn' : '' },
  ];
  const recent = (d.recent || []).slice(0, 5);

  $('#main').innerHTML = `
    <div class="ov">
      <div class="ov-hd">
        <span class="ov-num">${n(k.total)}</span>
        <span class="ov-cap">台设备</span>
      </div>
      <div class="ov-row">
        ${brief.map((b) => `<div class="ov-cell ${b.tone}">
          <span class="ov-v">${b.v}</span>
          <span class="ov-l">${b.l}</span>
        </div>`).join('')}
      </div>
    </div>

    <div class="card">
      <h3>${svgIcon('list', 16)} 最近更新的设备</h3>
      ${recent.length ? `
        <div class="rec-list">
          ${recent.map((x) => `<button class="rec-row" onclick="openDeviceDetail('${x.id}')">
            <span class="rec-ico">${svgIcon(ICONS[x.category_icon] || 'package', 16)}</span>
            <span class="rec-txt">
              <span class="rec-t">${esc(x.asset_no || '未编号')}</span>
              <span class="rec-s">${esc([x.brand, x.model, x.sn].filter(Boolean).join(' · ') || '未填写型号')}</span>
            </span>
            <span class="rec-b">${statusBadge(x.status)}</span>
          </button>`).join('')}
        </div>`
      : '<p class="muted" style="margin:0;font-size:13.5px">还没有设备。去「识别入库」拍一张试试。</p>'}
    </div>`;
}


/* ================= 相机 ================= */
function cameraError(e) {
  const name = e?.name || '';
  const insecure = (window.isSecureContext !== true) && !['localhost', '127.0.0.1'].includes(location.hostname);
  if (insecure) {
    return '当前不是 HTTPS，浏览器禁止调用摄像头。请切换到 https://' + location.hostname + ':8443/m 再试。';
  }
  switch (name) {
    case 'NotAllowedError': return '相机权限被拒绝。请点击浏览器地址栏的摄像头/锁图标，把「摄像头」设为允许后重试。';
    case 'NotFoundError': return '未检测到摄像头设备（台式机请确认接有摄像头）。';
    case 'NotReadableError': return '摄像头被其它应用占用，请关闭占用摄像头的应用后重试。';
    case 'OverconstrainedError': return '摄像头不支持该分辨率，重试即可。';
    default: return '无法打开摄像头：' + (e?.message || '未知错误');
  }
}

async function openCamera(mode, kind) {
  state.cameraPurpose = mode;
  state.scanKind = scanKindOf(kind).key;
  const secure = window.isSecureContext === true || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!navigator.mediaDevices?.getUserMedia) {
    toast('当前浏览器不支持摄像头，请改用 Chrome / Edge / Safari，或点「从相册选图」。', 'error');
    return;
  }
  if (!secure) {
    toast('需要 HTTPS 才能调用摄像头，请先切换到 https://' + location.hostname + ':8443/m', 'warn');
    return;
  }
  const overlay = $('#cameraOverlay');
  overlay.hidden = false;
  const hint = $('#camHint');
  const guide = $('#camGuide');
  const scanMode = mode === 'scan';
  const k = scanKindOf(kind);
  // 扫码核对和拍照入库是两条完全不同的路，先把模式顶在取景框上方说清楚
  if (guide) {
    guide.textContent = scanMode ? '扫' + k.label : '拍照识别';
    guide.className = 'cam-guide' + (scanMode ? ' scan' : '');
  }
  if (scanMode) {
    // 二维码偏方、条码偏扁：取景框按码型给个大概形状方便对位。
    // ⚠️ 2026-09-21 起条码不再「解码用整帧、不靠框」—— SCAN_STEPS.bar 的前两趟
    //    就是**拿这个框反推帧内矩形**去切的（见 frameRectOf / scanBandBox）。
    //    换句话说这个框不再只是对位提示，它真的决定了解码裁哪一块；改框的尺寸要一并想清楚。
    // 二维码是正方形，取景框就该是正方形，否则用户照着扁框摆，码容易被推出画面。
    // ⚠️ 正方形必须**用 px 一起算**（不能 width:68% + height:68%）——
    //    百分比高度是按屏幕高算的，竖屏手机屏高远大于宽，68% 会变成一个很高的竖框。
    //    limit 0.68：再宽会顶到上面的 cam-guide 与顶部提示条。
    const box = Math.round(Math.min(window.innerWidth, window.innerHeight) * 0.68);
    const frame = $('#camFrame');
    frame.style.top = '50%';
    if (k.key === 'qr') { frame.style.width = box + 'px'; frame.style.height = box + 'px'; }
    else { frame.style.width = '82%'; frame.style.height = '13%'; }
    if (hint) {
      hint.textContent = k.key === 'qr'
        ? '对准二维码后，按下面的圆钮识别'
        // 不用把手机横过来：条码那一趟会自己把画面转 90° / 270° 再解一遍。
        // 横着拿只是让长条码占满画面宽边（每根条踩到更多像素）→ 更稳更快，但不是必须。
        : '贴近条码、让它铺满画面宽度（别拿远），按下面的圆钮识别';
    }
  } else {
    // 拍照识别入库：铭牌是扁长的，框也跟着扁；同样居中，不再靠 top 百分比手调
    const f2 = $('#camFrame');
    f2.style.top = '50%';
    f2.style.width = '82%';
    f2.style.height = '26%';
    if (hint) hint.textContent = '把铭牌放进框内（只保留框里的画面，请让字完整入框）';
  }
  try {
    // 要最高的分辨率（原图要归档，糊了以后放大看不清铭牌小字），
    // 但**不能写死 3840×2160** —— 那是 16:9 横版，手机竖屏用 object-fit:cover
    // 铺满屏幕后画面横向被裁掉一大半，取景框和实际画面彻底对不上。
    // 改成给一个理想值 + 允许浏览器按设备实际能力回退，并让它按屏幕方向给画面。
    const portrait = (window.innerHeight || 0) >= (window.innerWidth || 0);
    const want = portrait ? { w: 2160, h: 3840 } : { w: 3840, h: 2160 };
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: state.facing,
        width: { ideal: want.w },
        height: { ideal: want.h },
      },
      audio: false,
    });
    const video = $('#cameraVideo');
    video.srcObject = state.stream;
    await video.play();
  } catch (e) {
    overlay.hidden = true;
    toast(cameraError(e), 'error');
  }
}

function closeCamera() {
  stopCamera();
  if (state.scanTimer) { clearTimeout(state.scanTimer); state.scanTimer = 0; }
  $('#cameraOverlay').hidden = true;
  state.scanning = false;
}

function stopCamera() {
  if (state.stream) { state.stream.getTracks().forEach((t) => t.stop()); state.stream = null; }
  const video = $('#cameraVideo');
  if (video) video.srcObject = null;
}

async function flipCamera() {
  state.facing = state.facing === 'environment' ? 'user' : 'environment';
  stopCamera();
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: state.facing, width: { ideal: 3840 }, height: { ideal: 2160 } },
      audio: false,
    });
    const video = $('#cameraVideo');
    video.srcObject = state.stream;
    await video.play();
  } catch (e) { toast(e.message, 'error'); }
}

/**
 * 取景框在「视频像素坐标」里对应的矩形。
 *
 * 视频是 object-fit: cover 铺满屏幕的，所以屏幕上的框不能直接当像素坐标用。
 * 换算关系：
 *   缩放比 s = max(屏幕宽/视频宽, 屏幕高/视频高)      ← cover 是「放大到铺满」
 *   视频在屏幕里的左上角 = ((屏宽 - 视频宽*s)/2, (屏高 - 视频高*s)/2)   ← 居中，通常是负的
 *   视频坐标 = (屏幕坐标 - 左上角) / s
 *
 * 取景框只占屏幕一小条，换算到视频里通常只有全画面的 10~30%，
 * 所以裁掉框外内容能省掉大部分体积。
 */
function frameCropRect(vw, vh, { pad = 0.15 } = {}) {
  const winW = window.innerWidth || vw;
  const winH = window.innerHeight || vh;
  let rect = null;
  try {
    const f = $('#camFrame');
    rect = f && f.getBoundingClientRect ? f.getBoundingClientRect() : null;
  } catch { rect = null; }
  if (!rect || !rect.width || !rect.height) {
    // 拿不到真实框（测试环境等）：按默认位置估一个
    rect = { left: winW * 0.09, top: winH * 0.22, width: winW * 0.82, height: winH * 0.26 };
  }

  const s = Math.max(winW / vw, winH / vh);
  const dx = (winW - vw * s) / 2;
  const dy = (winH - vh * s) / 2;

  // 四周留点余量：用户习惯把铭牌贴着框边放，裁太紧会切掉字符
  const padX = rect.width * pad;
  const padY = rect.height * pad;

  const x = Math.max(0, (rect.left - padX - dx) / s);
  const y = Math.max(0, (rect.top - padY - dy) / s);
  const w = Math.min(vw - x, (rect.width + padX * 2) / s);
  const h = Math.min(vh - y, (rect.height + padY * 2) / s);
  return { x, y, w, h };
}

/**
 * 等比缩放成 JPEG Blob，可只取其中的一块（crop 用视频像素坐标）。
 * 手机原图动辄 4000×3000、好几 MB，直接 toDataURL 会卡死主线程且上传极慢。
 * maxSide 只做「不超过」限制：传 4096 时若源图只有 1920 宽，就保持 1920 原样输出。
 */
function downscaleToBlob(src, maxSide = 1600, quality = 0.85, crop = null) {
  return new Promise((resolve) => {
    try {
      const sw = src.videoWidth || src.naturalWidth || src.width || 0;
      const sh = src.videoHeight || src.naturalHeight || src.height || 0;
      if (!sw || !sh) { resolve(null); return; }
      const sx = crop ? Math.max(0, Math.min(crop.x, sw - 1)) : 0;
      const sy = crop ? Math.max(0, Math.min(crop.y, sh - 1)) : 0;
      const cw = crop ? Math.max(1, Math.min(crop.w, sw - sx)) : sw;
      const ch = crop ? Math.max(1, Math.min(crop.h, sh - sy)) : sh;

      const scale = Math.min(1, maxSide / Math.max(cw, ch));
      const w = Math.max(1, Math.round(cw * scale));
      const h = Math.max(1, Math.round(ch * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(src, sx, sy, cw, ch, 0, 0, w, h);
      if (typeof canvas.toBlob !== 'function') { resolve(null); return; }
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
    } catch {
      resolve(null);
    }
  });
}

/* 一次拍照产出三份图，全部自动上传，用户不用点任何按钮：
 *   image    最长边 2200px —— 给 OCR 识别用（铭牌小字要够清楚）
 *   original 原始分辨率   —— 原图，归档进设备详情
 *   thumb    最长边 320px  —— 缩略图，导出 Excel 时嵌进单元格
 *
 * 为什么提到 2200：以前是 1600，铭牌上的序列号只占几十个像素，
 * 视觉模型经常把 L 看成 1、O 看成 Q。多给点像素明显更准，
 * 传上去也就两三百 KB，值得。
 */
const OCR_MAX_SIDE = 2200;
const ORIGINAL_MAX_SIDE = 4096;
const THUMB_MAX_SIDE = 320;

/**
 * 拍照结果先做一次「灰度 + 对比度拉伸」，再交给识别。
 *
 * 铭牌大多是白底黑字，但手机拍摄常偏灰、反光、曝光不均；
 * 拉伸一下直方图能让字和底分得更开，对小型文字的识别率提升很明显。
 * 只影响送去 OCR 的那张，归档的原图不动。
 */
function enhanceForOcr(blob) {
  return new Promise((resolve) => {
    if (typeof createImageBitmap !== 'function') { resolve(blob); return; }
    createImageBitmap(blob).then((bmp) => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = bmp.width;
        canvas.height = bmp.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bmp, 0, 0);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = img.data;

        // 先算灰度直方图，取 2% / 98% 分位当黑白点
        const hist = new Uint32Array(256);
        for (let i = 0; i < d.length; i += 4) {
          const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0;
          hist[g]++;
        }
        const total = d.length / 4;
        let lo = 0; let hi = 255; let acc = 0;
        for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= total * 0.02) { lo = v; break; } }
        acc = 0;
        for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= total * 0.02) { hi = v; break; } }
        if (hi - lo < 24) { lo = 0; hi = 255; }   // 本来就没什么对比度，别硬拉
        const span = Math.max(1, hi - lo);

        for (let i = 0; i < d.length; i += 4) {
          let g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
          g = ((g - lo) / span) * 255;
          g = g < 0 ? 0 : g > 255 ? 255 : g;
          d[i] = d[i + 1] = d[i + 2] = g;
        }
        ctx.putImageData(img, 0, 0);
        bmp.close?.();
        if (typeof canvas.toBlob !== 'function') { resolve(blob); return; }
        canvas.toBlob((b) => resolve(b && b.size ? b : blob), 'image/jpeg', 0.92);
      } catch {
        resolve(blob);
      }
    }).catch(() => resolve(blob));
  });
}

/**
 * 从相机视频帧取三份图 —— **都只保留取景框内的画面**。
 *
 * 取景框通常只占整幅画面的 10~30%，裁掉框外的背景能省掉大部分体积：
 * 一张 1920×1080 的帧，存档原图从 ~1.5 MB 降到 ~200 KB，
 * 而且裁出来的像素密度更高，识别反而更准。
 *
 * 预览页看到的就是裁好的这张图，万一裁掉了不该裁的（比如铭牌探出框外），
 * 当场就能看出来并重拍。
 */
async function shootFromVideo(video) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const crop = frameCropRect(vw, vh);
  const [image, original, thumb] = await Promise.all([
    downscaleToBlob(video, OCR_MAX_SIDE, 0.92, crop),
    downscaleToBlob(video, ORIGINAL_MAX_SIDE, 0.92, crop),
    downscaleToBlob(video, THUMB_MAX_SIDE, 0.7, crop),
  ]);
  return { image, original, thumb, crop, source: { vw, vh } };
}

/**
 * 从相册选图：**不裁**。
 * 这里没有取景框，用户选的图本身就是他想要的那张；
 * 按屏幕比例硬裁一条反而会把铭牌切掉。
 */
async function shootFromImage(img, file) {
  const [image, thumb] = await Promise.all([
    downscaleToBlob(img, OCR_MAX_SIDE, 0.92),
    downscaleToBlob(img, THUMB_MAX_SIDE, 0.7),
  ]);
  // 手机相册原图常有十几 MB，超了就用压缩图当原图，避免上传卡死
  const original = file && file.size <= 20 * 1024 * 1024 ? file : image;
  return { image, original, thumb };
}

function setCaptured(shots) {
  const { image, original, thumb } = shots || {};
  state.capturedBlob = image || null;
  state.originalBlob = original || image || null;
  state.thumbBlob = thumb || null;
  state.captured = null;
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.previewUrl = image ? URL.createObjectURL(image) : null;
}

/* ================= 把照片存一份到手机 ================= *
 * 网页无权直接写手机相册，能用的只有两条路：
 *   1) <a download> 下载  → 安卓进「下载/文件」，iOS 进「文件」App
 *   2) Web Share 分享文件 → 系统分享面板里有「存储图像 / 保存到照片」→ 进相册
 * 两条都给，用户按机型自己选。
 * ==================================================== */

const AUTOSAVE_KEY = 'itam.autosave';

function autosaveOn() {
  return localStorage.getItem(AUTOSAVE_KEY) !== '0';   // 默认开启
}

function setAutosave(on) {
  localStorage.setItem(AUTOSAVE_KEY, on ? '1' : '0');
}

/** 文件名：IT资产铭牌_<SN>_20260918-1110.jpg（SN 已知时带上，方便事后翻找） */
function shotFileName(sn) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  const safeSn = String(sn || '').trim().replace(/[^\w\u4e00-\u9fff-]/g, '').slice(0, 30);
  return `IT资产铭牌${safeSn ? '_' + safeSn : ''}_${stamp}.jpg`;
}

/** 走下载：最通用，一定能落盘 */
function downloadShot(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  if (document.body) {
    document.body.appendChild(a);
    a.click();
    a.remove();
  } else {
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 20000);
  return 'download';
}

function canShareFiles(blob, filename) {
  try {
    if (!navigator.canShare || typeof File !== 'function') return false;
    return navigator.canShare({ files: [new File([blob], filename, { type: blob.type || 'image/jpeg' })] });
  } catch { return false; }
}

/**
 * 保存照片到手机
 * @param {Blob} blob
 * @param {string} sn     已识别到的 SN（可空），只用于文件名
 * @param {boolean} viaShare true = 走系统分享面板（可存相册）
 */
async function saveShotToPhone(blob, sn = '', viaShare = false) {
  if (!blob || !blob.size) { toast('没有可保存的照片', 'warn'); return false; }
  const filename = shotFileName(sn);

  if (viaShare && canShareFiles(blob, filename)) {
    try {
      await navigator.share({ files: [new File([blob], filename, { type: blob.type || 'image/jpeg' })], title: '铭牌照片' });
      toast('已交给系统保存', 'ok');
      return true;
    } catch (e) {
      if (e?.name === 'AbortError') return false;   // 用户自己取消，不算失败
      // 分享不可用就退回下载
    }
  }

  try {
    downloadShot(blob, filename);
    toast('已保存：' + filename + '（在「下载 / 文件」里）', 'ok');
    return true;
  } catch (e) {
    toast('保存失败：' + (e?.message || '浏览器不允许自动下载，请长按照片选「存储图像」'), 'error');
    return false;
  }
}

/** 识别成功后的自动保存：拿不到 blob 时回服务端取一份 */
async function autosaveShot(sn, imagePath) {
  if (!autosaveOn()) return;
  let blob = state.capturedBlob;
  if (!blob && imagePath) {
    try {
      const res = await fetch(imagePath);
      if (res.ok) blob = await res.blob();
    } catch { /* 忽略，下面统一提示 */ }
  }
  if (!blob) return;
  try {
    downloadShot(blob, shotFileName(sn));
    toast('已自动存一份到手机（「下载 / 文件」里）', 'ok');
  } catch {
    toast('自动保存被浏览器拦下了，请点照片下方的「下载到手机」', 'warn');
  }
}

function setPreviewInfo(msg, busy = false) {
  const el = $('#previewInfo');
  if (!el) return;
  el.innerHTML = msg ? `${busy ? '<span class="spin"></span> ' : ''}${esc(msg)}` : '';
  el.hidden = !msg;
}

async function capture() {
  if (state.busy) return;
  const video = $('#cameraVideo');
  if (!video || !video.videoWidth) { toast('相机还未就绪，请稍等一下再拍', 'warn'); return; }

  // ⚠️ 扫码核对模式和拍照入库是两件事，不能共用一个出口：
  //    扫码模式下按快门 = 「拿当前这一帧去解条码」，绝不能掉进识别入库的流程。
  if (state.cameraPurpose === 'scan') {
    await captureForScan(video);
    return;
  }

  state.busy = true;
  toast('正在处理照片…');
  const shots = await shootFromVideo(video);
  state.busy = false;
  if (!shots.image) { toast('拍照失败，请重试', 'error'); return; }
  closeCamera();
  setCaptured(shots);
  showPreview();
}

/** 扫码模式下的快门：对准当前入口那一种码解码，绝不进识别入库 */
async function captureForScan(video) {
  const kind = state.scanKind || 'qr';
  const detector = getDetector(kind);
  state.busy = true;
  try {
    let codes = [];
    if (detector) {
      // ⚠️ 这里必须做多趟解码，不能直接 detect(video)：原帧不裁剪不放大、只解一次，
      //    屏幕上 150px 的二维码换算回视频帧只剩几百像素，37 个模块一摊就糊了。
      // 以前是直接 detect(video) —— 原帧不裁剪不放大、只解一次，
      // 屏幕上 150px 的二维码换算回视频帧只剩几百像素，37 个模块一摊就糊了，
      // 表现就是「快门按下去永远提示没识别到，但自动扫描有时反而能认」。
      try { codes = await decodeFrameMultiPass(video) || []; } catch { codes = []; }
    }
    // 浏览器这条路走不通（iPhone 没这个 API、或安卓拍屏幕解不出来）→ 交给服务端解码器。
    // ⚠️ 一维条码现在**也有兜底了**（server/lib/bardecode.js 的 Code128 / Code39），
    //    以前这里写着 `kind === 'qr'`，条码根本没有第二条路 —— 用户反馈的
    //    「二维码能扫、条码永远扫不出来」有一半是这个原因。
    if (!codes.length) {
      const one = await serverDecodeFrame(video, kind);
      if (one) codes = [one];
    }
    if (codes.length) {
      closeCamera();
      handleScannedWithMode(codes[0].rawValue);
      return;
    }
    if (!codes.length && !detector) {
      // 本机完全没有网页扫码能力、服务端也没解出来 → 别让用户对着相机干瞪眼，直接给手动入口
      closeCamera();
      renderManualScan('这一帧没认出' + scanKindOf(kind).label
        + '（本机没有网页扫码能力，已试过服务器解码）。可以直接输入 SN / 资产编号');
      return;
    }
    // 解不出来就明确说清「这次要的是哪一种码」+ 给出**动作**建议（不是「拿远」）
    // 「拿远到 10~20cm」这条提示对小条码是反的：离得越远条码越小。
    toast('没认出' + scanKindOf(state.scanKind).label
      + (state.scanKind === 'bar'
        ? '，贴近条码让它铺满画面宽度、对准再按一次'
        : '，把整个码放进画面、拿远到 10~20cm 再按一次'), 'warn');
  } catch {
    toast('这一帧没解出来，换个角度或距离再试', 'warn');
  } finally {
    state.busy = false;
  }
}

/**
 * 对当前这一帧做多趟解码，复用自动扫描那套「换姿势找」的思路。
 *
 * 为什么要多趟：BarcodeDetector.detect() 对输入尺寸很敏感。
 * 直接把 <video> 原帧喂进去时，浏览器内部会先缩放一次，二维码的小格子就被抹平了。
 * 先画到画布上、自己指定一个足够的宽高，等于替浏览器把「该缩到多少」决定好。
 *
 * 顺序是刻意的：先整帧（条码是长条，只有整帧装得下），再放大、再中心方形
 * （二维码是方的，中心方形让每格占的像素最多）。任一趟命中就立刻返回。
 */
async function decodeFrameMultiPass(video) {
  const detector = getDetector(state.scanKind);
  if (!detector) return [];
  // ⚠️ 必须按当前码型取步骤表 —— SCAN_STEPS 现在是 { qr:[...], bar:[...] }，
  //    直接写 SCAN_STEPS.length 会得到 undefined，循环一次都不跑（什么都扫不出来）。
  const steps = stepsOf(state.scanKind);
  for (let i = 0; i < steps.length; i++) {
    let target = null;
    try {
      target = scanRegion(i, video, state.scanKind);
    } catch { target = null; }
    if (!target) continue;
    try {
      const codes = await detector.detect(target);
      if (codes?.length) return codes;
    } catch { /* 这一趟失败就换下一趟，不中断 */ }
  }
  return [];
}

/**
 * 把画面（<video> 或 <img>）的一块区域画成灰度字节。
 *
 * 为什么发灰度而不是 JPEG：服务端解码器要的就是灰度像素，发图还得在服务端解一次码。
 * 直接发原始字节，前端少一次编码、后端少一次解码，路径最短。
 */
function grabGray(source, box, w, h) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  if (ctx.imageSmoothingQuality) ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, box.x, box.y, box.w, box.h, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const gray = new Uint8Array(w * h);
  // 0.299/0.587/0.114：人眼亮度权重。直接用 (r+g+b)/3 会让红底黑字这类标签的对比度变差
  for (let i = 0, j = 0; i < gray.length; i++, j += 4) {
    gray[i] = (d[j] * 299 + d[j + 1] * 587 + d[j + 2] * 114) / 1000 | 0;
  }
  return gray;
}

/**
 * 服务端兜底解码：浏览器这一帧解不出来时，把灰度图发上去让服务端解。
 *
 * 为什么必须有这条路：
 *   ① iPhone / Safari 根本没有 BarcodeDetector，以前只能劝用户「用系统相机扫」；
 *   ② 安卓对着显示器拍时，摩尔纹 + 视频压缩会让浏览器识别器整帧失手。
 *
 * ⚠️ 两种码走**完全不同**的服务端解码器（`kind` 查询参数），切法也不一样：
 *   二维码：定位图案 + 纠错，喂整块方形最有效 → 中心方形 / 整帧两块都试；
 *   一维码：逐行扫条空，**喂进去的那条必须窄且长**。所以先按取景框切扁带（和前端
 *           第一趟同一个矩形），切不到才退回整帧 —— 直接把整帧发上去，
 *           条码在 900px 宽的图里只占 ~50px，服务端再厉害也救不回来（实测过）。
 */
async function serverDecodeFrame(source, kind) {
  const k = kind || state.scanKind || 'qr';
  const sw = source?.videoWidth || source?.naturalWidth || 0;
  const sh = source?.videoHeight || source?.naturalHeight || 0;
  if (!sw || !sh) return null;

  /** 发一块灰度图上去，命中返回 { rawValue, format, via:'server' } */
  const post = async (box, maxSide) => {
    // 不放大：解码器要的是真实像素，放大只是把同样的信息铺开。只限制最大边，省流量。
    const scale = Math.min(1, maxSide / Math.max(box.w, box.h));
    const w = Math.max(8, Math.round(box.w * scale));
    const h = Math.max(8, Math.round(box.h * scale));
    let gray = null;
    try { gray = grabGray(source, box, w, h); } catch { gray = null; }
    if (!gray) return null;
    try {
      const res = await fetch(API + '/scan?w=' + w + '&h=' + h + '&kind=' + encodeURIComponent(k), {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: gray,
      });
      if (!res.ok) return null;
      const body = await res.json().catch(() => null);
      const text = body?.data?.text || body?.text || '';
      if (text) return { rawValue: text, format: body?.data?.format || (k === 'bar' ? 'code_128' : 'qr_code'), via: 'server' };
    } catch { /* 网络不通就当这条路不存在，别把扫码整个卡死 */ }
    return null;
  };

  const full = { x: 0, y: 0, w: sw, h: sh };
  if (k === 'bar') {
    // 一维码：扁带优先（窄 → 每根条占更多像素），再退整帧。
    // 取景框那趟用的是**视频帧**的尺寸（不是 <img>），所以只有 <video> 才走得通；
    // 相册选图的 <img> 没有 videoWidth，直接用整图。
    const isVideo = source?.videoWidth > 0;
    if (isVideo) {
      const band = scanRegionOfFrameBand(source, 1);
      if (band) {
        const one = await post(band.rect, 1600);
        if (one) return one;
      }
    }
    return post(full, 1200);
  }

  // 二维码：中心方形（每格占的像素最多）+ 整帧，两块各试一次
  const side = Math.min(sw, sh);
  const square = { x: (sw - side) / 2, y: (sh - side) / 2, w: side, h: side };
  return (await post(square, 900)) || (await post(full, 1100));
}

function pickFromGallery() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;

    // 扫码模式：直接拿图片去做条码识别
    if (state.cameraPurpose === 'scan') {
      scanImage(URL.createObjectURL(file), state.scanKind);
      return;
    }
    if (file.type && !file.type.startsWith('image/')) { toast('请选择图片文件', 'warn'); return; }

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      toast('正在处理图片…');
      const shots = await shootFromImage(img, file);
      URL.revokeObjectURL(url);
      if (!shots.image) { toast('图片处理失败，请换一张', 'error'); return; }
      closeCamera();
      setCaptured(shots);
      showPreview();
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast('无法读取该图片', 'error'); };
    img.src = url;
  };
  input.click();
}

function showPreview() {
  $('#previewImg').src = state.previewUrl || state.captured || '';
  const kb = state.capturedBlob ? Math.round(state.capturedBlob.size / 1024) : 0;
  const okb = state.originalBlob ? Math.round(state.originalBlob.size / 1024) : 0;
  setPreviewInfo(kb
    ? `已拍好：识别用 ${kb} KB${okb > kb ? ` · 原图 ${okb} KB 会一起归档` : ''}，点「识别」开始`
    : '');
  const btn = $('#btnRecognize');
  if (btn) { btn.disabled = false; btn.innerHTML = svgIcon('search') + ' 识别'; }
  $('#previewOverlay').hidden = false;
}

/** 预览页的「💾 保存」：还没识别，文件名里先不带 SN */
function savePreviewShot() {
  saveShotToPhone(state.originalBlob || state.capturedBlob, '', canShareFiles(state.capturedBlob, 'x.jpg'));
}

/** 放大比对页的「💾 存手机」：用当前结果页那张照片 */
async function saveViewerShot() {
  saveShotToPhone(await currentShotBlob(), state.recognizeResult?.sn || '', false);
}

/** 结果页照片对应的 Blob：优先本地原图，其次压缩图，最后回服务端取 */
async function currentShotBlob() {
  if (state.originalBlob) return state.originalBlob;
  if (state.capturedBlob) return state.capturedBlob;
  const src = $('#shotThumb')?.getAttribute('src') || '';
  if (!src || src.startsWith('blob:')) return null;
  try {
    const res = await fetch(src);
    if (res.ok) return await res.blob();
  } catch { /* ignore */ }
  return null;
}

function closePreview() {
  $('#previewOverlay').hidden = true;
  state.recognizeResult = null;
  if (state.previewUrl) { URL.revokeObjectURL(state.previewUrl); state.previewUrl = null; }
  state.capturedBlob = null;
  state.originalBlob = null;
  state.thumbBlob = null;
  state.captured = null;
  setPreviewInfo('');
}

/**
 * 重拍：直接回到相机，不要再让用户点一次「拍照识别入库」。
 * 识别不满意时这是最常用的动作，多一次点击就是纯浪费。
 */
function retakePhoto() {
  closePreview();
  state.recognizeResult = null;
  state.cameraPurpose = 'capture';
  openCamera('capture');
}

/* ================= 识别 ================= */
async function startRecognize() {
  if (state.busy) return;
  if (!state.capturedBlob) { toast('没有可用照片，请重新拍摄', 'error'); return; }

  const btn = $('#btnRecognize');
  state.busy = true;
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span> 识别中…';
  const kb = Math.round(state.capturedBlob.size / 1024);
  const okb = state.originalBlob ? Math.round(state.originalBlob.size / 1024) : 0;
  setPreviewInfo(`正在上传并识别（识别图 ${kb} KB${okb ? ` · 原图 ${okb} KB 同时归档` : ''}）…`, true);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120000);
  try {
    // 送去识别的那张先做灰度 + 对比度拉伸：铭牌小字会清楚很多
    const ocrBlob = await enhanceForOcr(state.capturedBlob);
    if (ocrBlob !== state.capturedBlob) setPreviewInfo('已增强对比度，正在上传识别…', true);

    // 用 multipart 上传，避免把几 MB 图片转成更大的 base64 字符串
    const fd = new FormData();
    fd.append('image', ocrBlob || state.capturedBlob, 'nameplate.jpg');
    // 原图与缩略图一起发走：服务端自动归档，用户不需要任何额外操作
    if (state.originalBlob) fd.append('original', state.originalBlob, 'original.jpg');
    if (state.thumbBlob) fd.append('thumb', state.thumbBlob, 'thumb.jpg');
    if (state.operator) fd.append('operator', state.operator);

    const res = await fetch('/api/ocr', { method: 'POST', body: fd, signal: ctrl.signal });
    if (res.status === 401) {
      location.href = '/login?next=' + encodeURIComponent('/m') + '&expired=1';
      return;
    }
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error || body?.detail || `识别失败（HTTP ${res.status}）`);

    const r = body?.data ?? body;
    state.recognizeResult = r;
    $('#previewOverlay').hidden = true;
    setPreviewInfo('');
    renderRecognizeResult(r);
    // 识别成功的这张照片，顺手在手机里也留一份（可在首页关掉）
    autosaveShot(r.sn || '', r.image_path || null);
  } catch (e) {
    const msg = e.name === 'AbortError'
      ? '识别超时（120 秒）。请检查手机与电脑是否同一 WiFi，或改用「从相册选图」重试。'
      : e.message;
    toast(msg, 'error');
    setPreviewInfo('识别失败，可点「识别」重试');
    btn.disabled = false;
    btn.innerHTML = svgIcon('search') + ' 识别';
  } finally {
    clearTimeout(timer);
    state.busy = false;
  }
}

function confClass(c) {
  const v = Number(c) || 0;
  return v >= 0.7 ? 'high' : v >= 0.45 ? 'mid' : 'low';
}

/* ================= 刚拍的照片：缩略图 + 放大比对 ================= */

/** 优先用服务端存下来的图片地址（刷新后仍在），退回到本地拍照预览 */
function shotSrc(r) {
  return (r && r.image_path) || state.previewUrl || '';
}

/**
 * 结果页顶部的照片预览块。
 * 人工二次比对用：照片在上、识别字段在下，一眼就能看出 OCR 有没有读错。
 */
function shotPreviewHTML(r) {
  const src = shotSrc(r);
  if (!src) return '';
  const canShare = canShareFiles(state.capturedBlob || new Blob(['x'], { type: 'image/jpeg' }), 'x.jpg');
  return `
    <div class="card shot-card">
      <div class="shot-head">
        <span class="shot-title">${svgIcon('camera', 15)} 刚拍的照片</span>
        <span class="shot-hint">点图放大比对</span>
      </div>
      <div class="shot-box" id="shotBox" role="button" tabindex="0" aria-label="放大比对刚拍的照片">
        <img id="shotThumb" src="${esc(src)}" alt="识别用的铭牌照片"
             onerror="this.closest('.shot-box').classList.add('shot-failed')">
        <span class="shot-zoom">${svgIcon('search', 16)}</span>
      </div>
      <div class="shot-actions">
        <button class="btn sm" id="btnShotDownload">${svgIcon('download', 15)} 下载到手机</button>
        ${canShare ? `<button class="btn sm" id="btnShotShare">${svgIcon('upload', 15)} 存到相册</button>` : ''}
        <span class="shot-tip">安卓存「下载」，iOS 存「文件」；「存到相册」会打开系统分享面板</span>
      </div>
    </div>`;
}

/** 绑定缩略图与保存按钮（只在渲染后调用一次） */
function bindShotPreview() {
  const box = $('#shotBox');
  if (box) {
    box.onclick = () => openShotViewer();
    box.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openShotViewer(); } };
  }
  const dl = $('#btnShotDownload');
  if (dl) dl.onclick = async () => { saveShotToPhone(await currentShotBlob(), state.recognizeResult?.sn || '', false); };
  const sh = $('#btnShotShare');
  if (sh) sh.onclick = async () => { saveShotToPhone(await currentShotBlob(), state.recognizeResult?.sn || '', true); };
}

function openShotViewer(src) {
  const resolved = src || $('#shotThumb')?.getAttribute('src') || '';
  if (!resolved) { toast('没有可查看的照片', 'warn'); return; }
  const img = $('#shotViewerImg');
  if (img) img.src = resolved;
  shotReset();
  const box = $('#shotViewer');
  if (box) box.hidden = false;
  if (document.body) document.body.style.overflow = 'hidden';
}

function closeShotViewer() {
  const box = $('#shotViewer');
  if (box) box.hidden = true;
  if (document.body) document.body.style.overflow = '';
}

function shotReset() {
  applyShotTransform(1, 0, 0);
}

function shotZoom(delta) {
  applyShotTransform(state.shot.zoom + delta, state.shot.x, state.shot.y);
}

function applyShotTransform(zoom, x, y) {
  const z = Math.min(6, Math.max(1, Math.round(zoom * 100) / 100));
  // 缩回 1 倍时把位移一并归零，避免图片被拖出可视区
  const nx = z === 1 ? 0 : x;
  const ny = z === 1 ? 0 : y;
  state.shot = { zoom: z, x: nx, y: ny };
  const img = $('#shotViewerImg');
  if (img) img.style.transform = `translate(${nx}px, ${ny}px) scale(${z})`;
  const info = $('#shotViewerInfo');
  if (info) info.textContent = z === 1 ? '铭牌照片 · 双指缩放 / 拖动查看' : `铭牌照片 · 放大 ${z.toFixed(1)}×`;
}

/** 单指拖动 + 双指捏合（页面禁用了浏览器缩放，这里自己实现） */
function initShotGestures() {
  const stage = $('#shotStage');
  if (!stage) return;
  let startDist = 0;
  let startZoom = 1;
  let start = null;

  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

  stage.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      startDist = dist(e.touches);
      startZoom = state.shot.zoom;
    } else if (e.touches.length === 1) {
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY, ox: state.shot.x, oy: state.shot.y };
    }
  }, { passive: true });

  stage.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && startDist) {
      e.preventDefault();
      applyShotTransform(startZoom * (dist(e.touches) / startDist), state.shot.x, state.shot.y);
    } else if (e.touches.length === 1 && start && state.shot.zoom > 1) {
      e.preventDefault();
      applyShotTransform(
        state.shot.zoom,
        start.ox + (e.touches[0].clientX - start.x),
        start.oy + (e.touches[0].clientY - start.y),
      );
    }
  }, { passive: false });

  stage.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) startDist = 0;
    if (e.touches.length === 0) start = null;
  }, { passive: true });

  // 桌面端滚轮缩放，方便在电脑上调试
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    applyShotTransform(state.shot.zoom + (e.deltaY < 0 ? 0.5 : -0.5), state.shot.x, state.shot.y);
  }, { passive: false });

  // 双击复位（原来的「复位」按钮腾给了「存手机」）
  let lastTap = 0;
  stage.addEventListener('touchend', (e) => {
    if (e.touches.length || e.changedTouches?.length > 1) return;
    const now = Date.now();
    if (now - lastTap < 320) { shotReset(); lastTap = 0; return; }
    lastTap = now;
  }, { passive: true });
}

function renderRecognizeResult(r) {
  const catHint = r.category_hint;
  const suggestedCat = state.categories.find((c) => c.code === catHint)?.id || '';
  const dup = r.duplicate?.exists;
  const conf = overallConf(r);
  // 这里底部要留给「保存入库」，标签栏先让位
  setTabbar(false);
  $('#main').innerHTML = `
    ${shotPreviewHTML(r)}

    <div class="card">
      <div class="result-hero">
        <div class="conf-ring">${confRing(conf)}</div>
        <div class="hero-cap">综合置信度${conf >= 0.7 ? '' : ' · 建议逐项核对'}</div>
      </div>
      ${r.mocked ? '<div class="notice" style="margin-top:12px">当前为模拟识别结果，请在管理端「系统设置」配置真实 OCR 服务</div>' : ''}
      ${r.note ? `<div class="notice" style="margin-top:10px">${esc(r.note)}</div>` : ''}
      ${dup ? `<div class="notice danger" style="margin-top:10px">SN「${esc(r.sn)}」已存在，保存时会提示冲突</div>` : ''}
    </div>

    <div class="card">
      <h3>识别字段</h3>
      <div class="field-item">
        <div class="fl"><span>品牌</span><span class="conf ${confClass(r.brand_confidence)}">${Math.round(r.brand_confidence * 100)}%</span></div>
        <input id="rBrand" value="${esc(r.brand || '')}" placeholder="手动输入品牌" ${r.brand_source === 'sn-rule' ? 'style="color:var(--amber)"' : ''}>
        ${r.brand_source === 'sn-rule' ? '<div class="field-warn">由 SN 前缀推断，请核对</div>' : ''}
      </div>
      <div class="field-item">
        <div class="fl"><span>型号</span><span class="conf ${confClass(r.model_confidence)}">${Math.round(r.model_confidence * 100)}%</span></div>
        <input id="rModel" value="${esc(r.model || '')}" placeholder="手动输入型号">
      </div>
      <div class="field-item key">
        <div class="fl"><span>SN 序列号</span><span class="conf ${confClass(r.sn_confidence)}">${Math.round(r.sn_confidence * 100)}%</span></div>
        <input id="rSN" value="${esc(r.sn || '')}" placeholder="手动输入 SN" class="mono" style="letter-spacing:.5px">
      </div>
      ${snFixHTML(r)}
      ${snCandidatesHTML(r)}
      <p class="hint">识别结果只是初稿，保存前请对照上面的照片确认一遍。</p>
    </div>

    <div class="card">
      <h3>补充信息</h3>
      <div class="field"><label>设备分类</label><select id="rCat">${state.categories.map((c) => `<option value="${c.id}" ${c.id === suggestedCat ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
      <div id="rTracking"></div>
      <div class="field"><label>所属组织</label><select id="rOrg"><option value="">未分配</option>${state.orgs.map((o) => `<option value="${o.id}">${esc(o.path || o.name)}</option>`).join('')}</select></div>
      <div class="field"><label>使用人</label><input id="rOwner" placeholder="姓名"></div>
      <div class="field"><label>存放位置</label><input id="rLocation" placeholder="如 3 楼机房"></div>
      <div class="field"><label>供应商</label><select id="rSupplier"><option value="">— 未指定 —</option>${state.suppliers.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}</select></div>
      <div class="field"><label>状态</label><select id="rStatus">${state.statuses.map((s) => `<option value="${s.id}" ${s.id === 'in_stock' ? 'selected' : ''}>${s.label}</option>`).join('')}</select></div>
    </div>

    <div class="m-actionbar">
      <button class="btn ghost icon" onclick="route('home')" aria-label="取消">${svgIcon('x', 18)}</button>
      <button class="btn ghost" onclick="retakePhoto()">${svgIcon('camera', 16)} 重拍</button>
      <button class="btn primary" id="btnSave">${svgIcon('save', 16)} 保存入库</button>
    </div>`;
  $('#btnSave').onclick = saveRecognized;
  bindShotPreview();
  bindSnChips();
  // 分类的「专属字段」随分类切换（例如显示器 → 屏幕尺寸 24寸/27寸）
  const catSel = $('#rCat');
  if (catSel) catSel.onchange = renderMobileTracking;
  renderMobileTracking();
}

/** 自动纠正过 SN 时给一句说明，别让用户以为系统乱改 */
function snFixHTML(r) {
  const f = r.sn_fix;
  if (!f) return '';
  return `<div class="field-warn" style="margin-bottom:8px">
    ${svgIcon('alert', 13)} 已自动去掉标签：
    <span class="mono" style="text-decoration:line-through;opacity:.7">${esc(f.from)}</span>
    →
    <span class="mono"><b>${esc(f.to)}</b></span>
  </div>`;
}

/**
 * SN 候选：视觉模型最容易把 L/1、O/Q、H/K 看错。
 * 这里用「同品牌已归档的编号规律」算出几个更可能的写法，点一下就换，
 * 不用一个字一个字改——这是录入效率的关键。
 */
function snCandidatesHTML(r) {
  const list = Array.isArray(r.sn_candidates) ? r.sn_candidates.filter((c) => c && c.sn) : [];
  if (!list.length) return '';
  return `<div class="sn-cands">
    <div class="sn-cands-cap">${svgIcon('info', 12)} 同型号编号规律推断，可能是（点一下替换）：</div>
    <div class="sn-cands-row">
      ${list.map((c) => `<button type="button" class="sn-chip" data-sn="${esc(c.sn)}" title="${esc(c.reason || '')}">${esc(c.sn)}</button>`).join('')}
    </div>
  </div>`;
}

function bindSnChips() {
  $$('.sn-chip').forEach((b) => {
    b.onclick = () => {
      const input = $('#rSN');
      if (!input) return;
      input.value = b.getAttribute('data-sn') || '';
      $$('.sn-chip').forEach((x) => x.classList.toggle('on', x === b));
      toast('已替换 SN，请再核对一眼');
    };
  });
}

/** 渲染当前分类的专属字段（手机端） */
function renderMobileTracking() {
  const box = $('#rTracking');
  if (!box) return;
  const cat = state.categories.find((c) => c.id === ($('#rCat')?.value || ''));
  const fields = cat?.tracking_fields || [];
  if (!fields.length) { box.innerHTML = ''; return; }
  box.innerHTML = `
    <div class="sub-group">
      <div class="sub-group-hd">${esc(cat.name)} · 专属字段</div>
      ${fields.map((t) => `<div class="field"><label>${esc(t.label)}</label>${mobileTrackingInput(t)}</div>`).join('')}
    </div>`;
}

function mobileTrackingInput(t) {
  const id = `mt_${t.key}`;
  if (t.type === 'select' && Array.isArray(t.options) && t.options.length) {
    return `<select id="${id}">
      <option value="">— 未指定 —</option>
      ${t.options.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}
    </select>`;
  }
  const type = t.type === 'number' ? 'number' : t.type === 'date' ? 'date' : 'text';
  return `<input id="${id}" type="${type}">`;
}

function ringColor(r) {
  const c = overallConf(r);
  return c >= 0.7 ? 'var(--green)' : c >= 0.45 ? 'var(--amber)' : 'var(--red)';
}
function overallConf(r) {
  const vals = [r.brand_confidence, r.sn_confidence].map(Number).filter((v) => v > 0);
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

async function saveRecognized() {
  const r = state.recognizeResult;
  const sn = $('#rSN').value.trim();
  if (!sn) { toast('请填写 SN 序列号', 'warn'); return; }

  // 分类专属字段：映射到设备列的写列，其余写 extra
  const cat = state.categories.find((c) => c.id === $('#rCat').value);
  const extra = {};
  const columnValues = {};
  for (const t of (cat?.tracking_fields || [])) {
    const el = $(`#mt_${t.key}`);
    if (!el) continue;
    const raw = String(el.value ?? '');
    const v = raw === '' ? null : (t.type === 'number' ? Number(raw) : raw);
    if (state.columnTrackingKeys.includes(t.key)) columnValues[t.key] = v;
    else if (v !== null) extra[t.key] = v;
  }

  const payload = {
    brand: $('#rBrand').value.trim(),
    model: $('#rModel').value.trim(),
    sn,
    category_id: $('#rCat').value,
    org_id: $('#rOrg').value || null,
    owner_name: $('#rOwner').value.trim(),
    location: $('#rLocation').value.trim(),
    supplier: $('#rSupplier')?.value || null,
    status: $('#rStatus').value,
    sn_source: r.mocked ? 'ocr-mock' : 'ocr',
    ocr_confidence: Math.max(r.sn_confidence, r.brand_confidence),
    photo_path: r.image_path || null,
    sn_photo_path: r.image_path || null,
    // 原图与缩略图在识别时就已自动上传并存好，这里只是把路径挂到设备上
    photo_original_path: r.original_path || r.image_path || null,
    photo_thumb_path: r.thumb_path || null,
    ocr_raw: JSON.stringify({ provider: r.provider, brand: r.brand, model: r.model, sn: r.sn, lines: (r.lines || []).slice(0, 30) }),
    operator: state.operator || 'mobile',
    ...columnValues,
    extra,
  };
  const btn = $('#btnSave');
  btn.disabled = true; btn.textContent = '保存中…';
  try {
    const dev = await api('/devices', { method: 'POST', body: JSON.stringify(payload) });
    toast(`已入库：${dev.asset_no}`);
    renderHome();
  } catch (e) {
    btn.disabled = false; btn.innerHTML = svgIcon('save') + ' 保存入库';
    if (e.message.includes('已存在') || e.message.includes('409')) {
      toast('该 SN 已存在，可在「扫码核对」中查询', 'warn');
    } else {
      toast(e.message, 'error');
    }
  }
}

/* ================= 扫码 ================= */

/**
 * 扫码核对：两种码型**分开**，各用各自的入口与识别器。
 *
 * 为什么必须分开（这是准确率的根因，不只是界面整理）：
 * `BarcodeDetector` 的 `formats` 是**白名单过滤器**。以前为了「一个入口啥都能扫」，
 * 把 qr_code 连同七八种一维条码一起塞进去，识别器每一帧都要在画面里找全部类型的候选 ——
 * 候选空间一大，就会**又慢又张冠李戴**：把条码的条纹误判成别的格式、把二维码直接漏掉。
 * 用户反馈的「自动识别很不准确」正是这个。
 *
 * 现在进哪个入口就只认那一类：
 *   扫二维码 → formats 只剩 qr_code
 *   扫条码   → formats 只剩 code_128 / code_39 / ... 那一族
 * 候选少了一个数量级，准确率和速度都明显变好。
 */

/** 两个入口各自的配置。formats 必须先用 getSupportedFormats() 求交集，绝不能直接传。 */
const SCAN_KINDS = {
  qr: {
    key: 'qr',
    label: '二维码',
    desc: '方形黑白格子',
    icon: 'qr',
    tip: '对准后按下面的圆钮识别',
    formats: ['qr_code'],
  },
  bar: {
    key: 'bar',
    label: '条码',
    desc: '长条黑白竖线',
    icon: 'barcode',
    tip: '贴近条码，让它铺满画面宽度；横竖都能扫',
    formats: [
      'code_128', 'code_39', 'code_93', 'itf', 'codabar',
      'ean_13', 'ean_8', 'upc_a', 'upc_e',
    ],
  },
};

/** 取不到 / 传错时的兜底=二维码（系统生成的资产码就是二维码） */
const scanKindOf = (k) => SCAN_KINDS[k] || SCAN_KINDS.qr;

/** 「不挑食」清单，只在构造兜底实例时用 */
const WANT_ALL = [
  'qr_code',
  'code_128', 'code_39', 'code_93', 'itf', 'codabar',
  'ean_13', 'ean_8', 'upc_a', 'upc_e',
];

/* ---- 每种入口各缓存一个实例，互不污染 ---- */
const barcodeDetectorByKind = new Map();   // kind -> BarcodeDetector
const detectorFormatsByKind = new Map();   // kind -> 实际生效的 formats
const detectorTriedKinds = new Set();

/**
 * 拿到识别器。**必须带 kind** —— 扫二维码和扫条码用不同的实例。
 *
 * 顺序很关键（和浏览器行为对着來的）：
 *   ① 先同步建一个「不限格式」的顶着 —— 不传 formats 就是「浏览器支持的全都要」，
 *      这一步几乎不会失败，保证调用方**永远拿得到能用的识别器**
 *   ② 再异步问浏览器支持哪些格式，与该入口要的格式求交集后收窄（更准更快）
 *   ③ 交集为空就保持「不限格式」—— 一样能扫，只是没那么快
 */
function getDetector(kind) {
  if ('BarcodeDetector' in window === false) return null;
  const key = String(kind || 'any');
  if (barcodeDetectorByKind.has(key)) return barcodeDetectorByKind.get(key);
  if (detectorTriedKinds.has(key)) return barcodeDetectorByKind.get(key) || null;

  const tryCreate = (opts) => {
    try { return opts ? new BarcodeDetector(opts) : new BarcodeDetector(); }
    catch { return null; }
  };

  detectorTriedKinds.add(key);
  let det = tryCreate(null);
  // 连无参构造都失败：极老实现只认写死清单，试最后一把
  if (!det) det = tryCreate({ formats: WANT_ALL.slice(0, 3) });
  if (!det) return null;
  barcodeDetectorByKind.set(key, det);

  // 异步收窄：只保留「浏览器真的支持」且「这个入口要」的成员。
  // 只要清单里有一个成员不被支持，某些实现会直接抛 TypeError —— 所以交集这一步不能省。
  try {
    if (typeof BarcodeDetector.getSupportedFormats === 'function') {
      Promise.resolve(BarcodeDetector.getSupportedFormats())
        .then((fmt) => {
          if (!Array.isArray(fmt)) return;
          const want = key === 'any' ? WANT_ALL : scanKindOf(key).formats;
          const inter = want.filter((f) => fmt.includes(f));
          if (!inter.length) return;                 // 一个都不交集 → 保持全开
          const d = tryCreate({ formats: inter });
          if (d) {
            barcodeDetectorByKind.set(key, d);
            detectorFormatsByKind.set(key, inter);
          }
        })
        .catch(() => { /* 保持「不限格式」的实例 */ });
    }
  } catch { /* 同步抛错就当拿不到支持清单 */ }

  return det;
}

/** 识别器采用的实际格式（用于页面显示与排障） */
function detectorFormatLabel(kind) {
  const f = detectorFormatsByKind.get(String(kind || 'any'));
  if (!f || !f.length) return '全部支持的格式';
  return f.join(' / ');
}

/**
 * 丢掉缓存的识别器，下次 getDetector() 重新协商。
 * 正常流程用不到；真机上换了权限/摄像头，或自动化测试换桩时需要。
 */
function resetDetector() {
  barcodeDetectorByKind.clear();
  detectorFormatsByKind.clear();
  detectorTriedKinds.clear();
}

/**
 * 取景框 → 视频帧的几何反推。
 *
 * 为什么需要这一组函数：`<video>` 是 `object-fit: cover`，竖屏时画面横向被裁掉一大半
 * （实测 1920 宽的帧在 540 CSS px 的竖屏里只显示约 28% 的宽度）。
 * 用户把条码对着取景框摆得整整齐齐，程序却必须知道**框里的东西在帧的哪个位置**，
 * 否则只能猜 —— 旧版就是猜的（整帧 / 正中方形），两条都猜不中贴纸上的小条码。
 */

/**
 * 从取景框（屏幕 CSS 矩形）反推它在视频帧里的源矩形。
 *
 * cover 的映射关系（统一到一个缩放系数 k，取两个方向里大的那个，短边被裁）：
 *   k        = max(dispW / vw, dispH / vh)
 *   vw_vis   = dispW / k      // 屏幕上能看到的那部分源宽度
 *   vh_vis   = dispH / k
 * 源矩形居中，所以可见区左上角 = ((vw - vw_vis)/2, (vh - vh_vis)/2)。
 *
 * ⚠️ 返回的一定是**帧内**的矩形：取景框可能超出可视区（框比视频还宽），
 *    夹边界这一步不能省，否则 drawImage 会取到帧外的空白。
 */
function frameRectOf(boxCSS, dispW, dispH, vw, vh) {
  const bw = Number(boxCSS?.w) || 0;
  const bh = Number(boxCSS?.h) || 0;
  if (!(bw > 0) || !(bh > 0) || !(dispW > 0) || !(dispH > 0) || !(vw > 0) || !(vh > 0)) return null;
  const k = Math.max(dispW / vw, dispH / vh);
  const vwVis = dispW / k;
  const vhVis = dispH / k;
  const visX = (vw - vwVis) / 2;
  const visY = (vh - vhVis) / 2;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const x0 = clamp(visX + (boxCSS.x / k), 0, vw);
  const y0 = clamp(visY + (boxCSS.y / k), 0, vh);
  const x1 = clamp(visX + ((boxCSS.x + bw) / k), 0, vw);
  const y1 = clamp(visY + ((boxCSS.y + bh) / k), 0, vh);
  if (!(x1 - x0 > 1) || !(y1 - y0 > 1)) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, k };
}

/**
 * 把一条扁带在**纵向上撑到够高**。
 *
 * 为什么需要：裁太扁会切坏码。Code128 的长宽比约 10:1，而扁框换算回竖版帧内可能只有
 * 3.4:1 —— 条码的上下会被切掉一截，切进编码区就认不出来了。
 * 一维条码解码只要**一行**穿过所有条就够了，但那一行必须穿过**完整的条高**，
 * 所以宁可多带一点上下背景，也不让它贴边。
 *
 * 撑到多少：至少 `0.25 × 帧宽`（够装下一整条码），最多不超过帧高。
 * 只在**不改变横向裁法**的前提下撑高 —— 横向精度（每根条多少像素）一分不损失。
 */
function growBandTall(box, vw, vh) {
  const minH = Math.min(vh, Math.max(box.h, vw * 0.25));
  if (minH <= box.h) return box;
  const midY = box.y + box.h / 2;
  const y = Math.max(0, Math.min(vh - minH, midY - minH / 2));
  return { x: box.x, y, w: box.w, h: minH, k: box.k };
}

/**
 * 取当前取景框在屏幕上的矩形（相对可视区左上角）。
 *
 * 取到就顺带收窄一点：框的**边框有 3px**、外面还有一圈半透明遮罩，
 * 用户是照着框内沿摆的，所以往里收 8%（编码区的留白本来就靠这个补）。
 * 取不到（测试桩没有 offsetWidth）就退回「屏幕短边 82% × 13%」的默认扁框，
 * 别因为量不到框就把解码整趟跳过。
 */
function scanBandBox() {
  const W = window.innerWidth || 0;
  const H = window.innerHeight || 0;
  const fallbackW = Math.max(120, Math.round(Math.min(W || 320, H || 480) * 0.82));
  const fallbackH = Math.max(44, Math.round((H || 480) * 0.13));
  const el = $('#camFrame');
  const bw0 = Number(el?.offsetWidth) || 0;
  const bh0 = Number(el?.offsetHeight) || 0;
  const shrink = 0.92;
  const bw = (bw0 > 0 ? bw0 : fallbackW) * shrink;
  const bh = (bh0 > 0 ? bh0 : fallbackH) * shrink;
  // 取景框是 left:50% + top:50% + translate(-50%,-50%) → 永远居中，中心就是屏幕中心
  const cx = (W || 320) / 2;
  const cy = (H || 480) / 2;
  return { x: Math.max(0, cx - bw / 2), y: Math.max(0, cy - bh / 2), w: bw, h: bh };
}

/**
 * 给「取景框那一扁带」算输出尺寸。单独抽出来是为了能直接测（不必造 canvas 桩）。
 *
 * 一维条码的判定阀值是**每根条多少像素**，不是「整幅多大」：
 * 条码标签一般是 8~12 密尔，一根条按 2 倍安全系数折算约占码宽的 1.2%。
 * 所以码在画面里占 barPx 像素时，一根条 ≈ barPx × 0.012，要到 2px 以上才稳。
 * → **解码器输入里条码至少要有 ~170px、理想 250px。**
 * 这正是「扁带放大」那趟 upscale 拉到 8 的依据（实测把这个数从 50px 抬到 780px）。
 */
function bandScoreOf(box, upscale) {
  const up = Number(upscale) || 1;
  // 不放大：只保证至少送到 BASE_OUT_W 这一档（和别的切法一致）；
  // 放大档（upscale>1）才把它拉到 BAR_TARGET_W。
  const scale = up > 1 ? Math.min(BAR_MAX_SCALE, (BAR_TARGET_W / box.w) * up) : BASE_OUT_W / box.w;
  const outW = Math.max(1, Math.round(box.w * scale));
  const outH = Math.max(1, Math.round(box.h * scale));
  // 上限制在 BAR_MAX_OUT_W 以内：再大只会拖慢解码，不会变准
  if (outW > BAR_MAX_OUT_W * 1.05) return null;
  // ⚠️ 服务端兜底那条路要 POST 整张灰度图，`/api/scan` 有 4MB 上限（MAX_SCAN_BYTES）。
  //    撑高之后 1500×750 这种尺寸就贴着线了，再大一点会被服务端拒掉 ——
  //    表现是「服务端明明有解码器却一直没命中」。这里自己先卡住，别把球踢给服务端。
  if (outW * outH > BAND_PAYLOAD_MAX) return null;
  return { scale, outW, outH };
}

/** 把当前取景框翻译成「视频帧里的源矩形」，并给解码器算好输出尺寸 */
function scanRegionOfFrameBand(video, upscale) {
  if (!video?.videoWidth) return null;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const raw = frameRectOf(
    scanBandBox(),
    window.innerWidth || 0, window.innerHeight || 0,
    vw, vh,
  );
  if (!raw) return null;
  // 纵向撑高再算输出：裁太扁会切坏码（见 growBandTall）
  const rect = growBandTall(raw, vw, vh);
  const score = bandScoreOf(rect, upscale);
  return score ? { rect, scale: score.scale, outW: score.outW, outH: score.outH } : null;
}

/**
 * 解码的「切法」轮转表，按码型分。
 *
 * ⚠️ 旧实现按取景框去裁，是个真 bug：相机给的是横版画面，手机竖屏用 object-fit:cover
 *    铺满屏幕后横向被裁掉一大半，把取景框的屏幕坐标换算回视频坐标只剩「宽 21% × 高 18%」——
 *    用户对着框把码放得整整齐齐，程序解的却是画面正中很小一块，当然「老是报错」。
 *
 * 现在不猜用户把码放在哪，而是按码型挑最占便宜的切法轮着试：
 *   二维码是方的 → 先中心正方形（同样分辨率下每格占的像素最多）
 *   一维条码扁而长 → **先贴着取景框切那一扁带**（用户已经把码摆进框里了，这是最省像素的裁法）
 *
 * ⚠️⚠️ 条码那张表 2026-09-21 整体重做过。旧表 =
 *    整帧 → 转90 → 转270 → 翻180 → 整帧放大 → 中心方形放大。
 *    对「贴纸上的一条小条码」是**结构性失效**，不是参数没调好。逐趟算账
 *    （实测截图：1080×2340 物理 / DPR2 / 取景框 200×60 CSS / 条码 115 CSS px = 屏宽 21.3%）：
 *      ① 竖屏 + cover 把帧横向裁到只剩 ~28% → 条码映射回原生帧只有 ~106px = **帧宽的 5.5%**；
 *      ② 第 1 趟「整帧」把 1920 压到 900（×0.469）→ 条码只剩 **50px**。
 *         Code128 一根条 1~2px，50px 里挤 20+ 根条 → 必挂；
 *      ③ 第 2~4 趟「转 90/270/180」是换姿势，但整帧旋转**必须重采样**，
 *         双线性插值把黑白台阶抹成灰阶过渡 → 一维解码器要的「陡沿」没了；
 *      ④ 第 5 趟「整帧放大」不能恢复已丢失的信息，只是把糊的东西铺开；
 *      ⑤ 第 6 趟「中心方形放大」思路对（切小块放大），但**方形 + 正中**：
 *         条码是扁长的，方形框横向上只覆盖画面中段，条码不在正中就整条被切掉。
 *    新表把「贴着取景框切扁带 + 放大」提到第一、二趟，整帧降级为兜底，
 *    旋转挪到最后且**关掉插值**。实测扁带这趟给条码 479~1239px（旧表 50px）。
 */
const SCAN_STEPS = {
  qr: [
    { label: '中心方形', mode: 'square', upscale: 1 },
    { label: '中心方形放大', mode: 'square', upscale: 1.6 },
    { label: '整帧', mode: 'full', upscale: 1 },
    { label: '整帧放大', mode: 'full', upscale: 2 },
    // 兜底两趟：浏览器在个别设备上对「横版帧」的二维码有水土不服的
    // （相机本身给的就是横版画面），补上两个旋转再试，失败面更小。
    { label: '整帧转 90°', mode: 'full', upscale: 1, rot: 90 },
    { label: '整帧转 270°', mode: 'full', upscale: 1, rot: 270 },
  ],
  // 一维条码**必须**多试几个角度：用户可能横握也可能竖握，
  // 画面里的条码可能是躺着的、立着的、甚至倒着的。
  // 与其劝用户「把手机横过来」，不如让程序把画面转正 —— 这是「扫条码要横握吗」的
  // 工程答案：**不用横握**，横握只是让长条码占满画面宽边（每根条踩到更多像素），
  // 更稳更快，但不是扫得出来的前提。
  //
  // 顺序 = 取景框扁带 → 取景框扁带放大 → 整帧 → 整帧放大 → 转 90° / 270° / 翻 180°。
  // 前两趟就是为「贴纸上的小条码」准备的：只切用户对好的那一条，像素利用率最高。
  bar: [
    { label: '取景框扁带', mode: 'band', upscale: 1 },
    { label: '取景框扁带放大', mode: 'band', upscale: 8 },
    { label: '整帧', mode: 'full', upscale: 1, rot: 0 },
    { label: '整帧放大', mode: 'full', upscale: 2, rot: 0 },
    // 旋转趟一律 smooth:false：1~2px 的条经双线性插值直接没了，
    // 最近邻至少保住「黑是黑、白是白」，一维解码器对硬边缘的容忍度高得多。
    { label: '整帧转 90°', mode: 'full', upscale: 1, rot: 90, smooth: false },
    { label: '整帧转 270°', mode: 'full', upscale: 1, rot: 270, smooth: false },
    { label: '整帧翻 180°', mode: 'full', upscale: 1, rot: 180, smooth: false },
  ],
};

const stepsOf = (kind) => SCAN_STEPS[SCAN_KINDS[kind] ? kind : 'qr'];

/** 送进识别器的基准宽度。太小解不出码，太大又拖慢每一次解码。 */
const BASE_OUT_W = 900;

/**
 * 一维条码专用：解码器输入里条码的**目标宽度**与上限。
 *
 * 判定阀值是「每根条多少像素」而非整幅大小：标签一般是 8~12 密尔，
 * 一根条按 2 倍安全系数折算约占码宽的 1.2% → 码要 ~170px、理想 250px 才稳。
 * 上限 3000 是「再大只费时间」的分界（Code128 解码逐行扫描，成本随宽度线性涨）。
 */
const BAR_TARGET_W = 2500;
const BAR_MAX_SCALE = 8;
const BAR_MAX_OUT_W = 3000;

/**
 * 扁带这趟能送出去的最大像素数。服务端 `/api/scan` 的 MAX_SCAN_BYTES 是 4MB，
 * 灰度图 1 字节/像素 → 4M 像素就是硬上限，这里按 95% 留点余量自己先卡住。
 */
const BAND_PAYLOAD_MAX = 3800000;

/** 当前走到第几步（给界面显示用） */
function scanStepLabel(attempt, kind) {
  const steps = stepsOf(kind);
  return steps[attempt % steps.length].label;
}

function scanRegion(attempt, videoEl, kind) {
  // 允许调用方直接把手上的 <video> 传进来：快门那条路径拿到的就是它，
  // 再回 DOM 里找一次既多余、在测试桩里也容易拿到 null。
  const video = videoEl || $('#cameraVideo');
  if (!video || !video.videoWidth) return null;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const steps = stepsOf(kind || state.scanKind || 'qr');
  const step = steps[attempt % steps.length];
  try {
    // square：中心最大正方形（二维码是方的，方框里每一格占的像素最多）
    // band  ：取景框扁带（一维条码扁而长，贴着用户对好的那个框切最省像素）
    // full  ：整帧（长条码被推出取景框时的兜底）
    let box;
    let outW = 0;
    let outH = 0;
    // 这一趟的放大倍数。**扁带趟失败退回整帧时必须把它抹掉**：
    // 「扁带」的 upscale 是按「扁带只有一两百像素宽」定的（要拉到 BAR_TARGET_W）。
    // 一旦退回整帧（1920 宽），同一个 8 倍会把画布顶到 7200×12800 ≈ 9200 万像素 ——
    // 实测测试桩里就是这么炸的（一个 9000 万像素的 canvas，浏览器直接卡死/内存爆掉）。
    // 所以 fallback 走整帧时 upscale 归 1，交给下面 scale 公式按 BASE_OUT_W 自己算。
    let effUpscale = step.upscale;
    if (step.mode === 'square') {
      const side = Math.min(vw, vh);
      box = { x: (vw - side) / 2, y: (vh - side) / 2, w: side, h: side };
    } else if (step.mode === 'band') {
      // ⚠️ 扁带这条路必须走「取景框 → 帧」的逆映射（见 frameRectOf）。
      //    拿不到（测试桩没有 offsetWidth、或帧尺寸异常、或尺寸超预算）
      //    就退回整帧，别让整趟失败 —— 但必须同时把 upscale 归 1（见上）。
      const band = scanRegionOfFrameBand(video, step.upscale);
      if (band) {
        box = band.rect;
        outW = band.outW;
        outH = band.outH;
      } else {
        box = { x: 0, y: 0, w: vw, h: vh };
        effUpscale = 1;
      }
    } else {
      box = { x: 0, y: 0, w: vw, h: vh };
    }

    const scale = (BASE_OUT_W / box.w) * effUpscale;
    // ⚠️ 兜底硬上限：任何组合都不许造出巨幅画布。
    //    这套公式里 scale 是浮动的，只要「箱小 + 倍数大」两项凑到一起（比如扁带拿不到
    //    退回整帧却还带着 8 倍），就会算出 7200×12800 这种 9000 万像素的 canvas ——
    //    浏览器直接卡死甚至 OOM。上限取 4000×4000（比服务端 4000 的上限对齐），
    //    超出就等比缩回来。宁可少放大一点，也不能把用户的浏览器搞崩。
    const MAX_CANVAS_SIDE = 4000;
    const rawW = box.w * scale;
    const rawH = box.h * scale;
    const cap = Math.min(1, MAX_CANVAS_SIDE / Math.max(rawW, rawH, 1));
    const scaleCapped = scale * cap;
    // rot：把裁出来的这块画面转正之后再送进识别器。
    // 90° / 270° 会让长宽互换（原本 1080×1920 的竖画面旋转后变成 1920×1080 的横画面）。
    const rot = step.rot || 0;
    const swap = rot === 90 || rot === 270;
    // smooth:false 是一维条码的命根子：重采样插值会把 1~2px 的条抹成灰阶过渡，
    // 最近邻缩放虽然「硬」，但保住了黑白两个值，解码器反而认得出来。
    const smooth = step.smooth !== false;

    if (!rot) {
      // 不用旋转的趟走快路径，行为与旧版一致（只有 outW/outH 可能是前面算好的）
      const ow = outW ? Math.min(outW, MAX_CANVAS_SIDE) : Math.max(1, Math.round(box.w * scaleCapped));
      const oh = outH ? Math.min(outH, MAX_CANVAS_SIDE) : Math.max(1, Math.round(box.h * scaleCapped));
      const canvas = document.createElement('canvas');
      canvas.width = ow;
      canvas.height = oh;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = smooth;
      if (smooth && ctx.imageSmoothingQuality) ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(video, box.x, box.y, box.w, box.h, 0, 0, ow, oh);
      return canvas;
    }

    // ⚠️ drawImage 的目标宽高必须用**未旋转**的 dw / dh —— 旋转是在 ctx 上做的，
    //    写成互换后的尺寸等于再做一次不等比缩放，条码会被拉成变形长条（直接毁码）。
    //    画布本身才要用互换后的 outW / outH，否则旋转后的画面四角会被裁掉。
    const dw = box.w * scaleCapped;
    const dh = box.h * scaleCapped;
    const ow = Math.max(1, Math.round(swap ? dh : dw));
    const oh = Math.max(1, Math.round(swap ? dw : dh));
    const canvas = document.createElement('canvas');
    canvas.width = ow;
    canvas.height = oh;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = smooth;
    if (smooth && ctx.imageSmoothingQuality) ctx.imageSmoothingQuality = 'high';

    // ⚠️⚠️ 这四行是整套旋转逻辑的**全部作用点**，少一行上面所有尺寸计算都是白算：
    //   画布尺寸换好了、注释写满了，但忘了在 ctx 上真的设置变换 ——
    //   结果是「画布是横的、画面还是原样躺着的」，人眼看设置像做完了，码却依然立着。
    //   2026-09-20 真栽过一次：`ctx.save/setTransform/translate/rotate/restore` 五行
    //   被一次「整行替换」补丁连窝端掉，测试却全绿（当时只断言了尺寸没断言变换）。
    //   → 现在测试同时钉**尺寸**与**变换**，缺一即红。
    try { ctx.save(); } catch { /* 老实现没有 save 就跳过，不影响正事 */ }
    try { ctx.setTransform(1, 0, 0, 1, 0, 0); } catch { /* 同上 */ }
    ctx.translate(ow / 2, oh / 2);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.drawImage(video, box.x, box.y, box.w, box.h, -dw / 2, -dh / 2, dw, dh);
    try { ctx.restore(); } catch { /* 同上 */ }
    return canvas;
  } catch {
    return null;
  }
}

/**
 * 扫码核对首页。**两个专用入口**：一个专门扫二维码，一个专门扫条码。
 *
 * 以前是一个按钮「扫码核对」进去自动识别所有类型 —— 用户反馈「很不准确」。
 * 原因不是相机，是 `BarcodeDetector` 同时开七八种格式时在画面里到处找候选，
 * 候选越多越容易张冠李戴。拆开之后每个入口只开一种，准确率显著提升。
 * 识别也不是「自动连续扫」，而是**对准后按圆钮才解码**（用户明确要求）。
 */
function renderScan() {
  setTabbar(true);
  const secure = window.isSecureContext === true || location.hostname === 'localhost';
  // ⚠️ 两个都要问，不能写成 getDetector('qr') || getDetector('bar') ——
  //    短路会让后面那个永远不被构造，万一某台机器只支持一维条码，
  //    这里就会误判成「完全不能扫码」，把明明能用的入口也藏掉。
  // ⚠️ 二维码入口是**永远可用**的：浏览器没有 BarcodeDetector（iPhone）时，
  //    这一帧会发给服务端解码器兜底，不依赖浏览器能力。
  const canQr = true;
  const canBar = !!getDetector('bar');
  const canScan = canQr || canBar;
  const serverQr = !getDetector('qr');   // 本机没识别器 → 二维码全靠服务端兜底，界面要说清楚

  /** 一个入口按钮。kind: 'qr' | 'bar' */
  const kindRow = (kind) => {
    const k = scanKindOf(kind);
    return `
      <button class="big-btn ${k.key === 'qr' ? 'primary' : ''}" onclick="openCamera('scan','${k.key}')">
        <span class="em">${svgIcon(k.icon, 23)}</span>
        <span class="bb-txt">
          <span class="t">扫${k.label}</span>
          <span class="s">${k.desc}；${k.tip}</span>
        </span>
        <span class="bb-arrow">${svgIcon('chevron', 18)}</span>
      </button>`;
  };

  $('#main').innerHTML = `
    ${kindRow('qr')}
    ${canBar ? kindRow('bar') : `
      <div class="card">
        <h3>这个浏览器不能网页内扫条码</h3>
        <p class="hint" style="margin-top:0">iPhone / Safari 及部分手机浏览器没有开放「网页扫条码」的能力（不是系统坏了）。<b>二维码不受影响，上面那个入口照样能用</b>（识别在服务端完成）。条码可以：</p>
        <ol class="steps">
          <li>直接<b>手动输入</b>铭牌上的 SN / 资产编号（下面那张卡片）</li>
          <li>用<b>安卓 Chrome / Edge</b> 打开本页，可以网页内扫条码</li>
        </ol>
      </div>`}
    <p class="hint" style="margin:10px 2px 0">
      系统给设备生成的资产码是<b>二维码</b>；设备铭牌上的是<b>条码</b>。
      分开扫比一个入口「自动识别所有类型」准得多。
      ${serverQr ? '<br>本机没有网页识别能力，二维码会<b>发给服务器解码</b>，按一下稍等一下即可。' : ''}
      <br><b>扫条码不用横握手机</b>：识别时会自己把画面转 90° / 270° 再解一遍，
      横着拿只是让长条码占满画面宽边、每根条踩到更多像素（更稳更快），不是扫得出来的前提。
    </p>

    <div class="card">
      <h3>${svgIcon('keyboard', 16)} 手动输入 SN / 资产编号</h3>
      <div class="field">
        <label>SN / 资产编号</label>
        <input id="manualSN" class="mono" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="如 3TLF263">
      </div>
      <button class="btn primary block" onclick="manualLookup()">查询</button>
      <p class="hint">也可以<b>用手机自带相机</b>扫设备上的资产二维码，会直接打开这台设备的详情页。</p>
    </div>

    <div class="card">
      <h3>${svgIcon('image', 16)} 从相册选图</h3>
      <p class="hint">已经有拍好的铭牌或标签照片时，直接从相册选，不用再举着手机对。</p>
      <div style="display:flex;gap:10px;margin-top:10px">
        <button class="btn block" onclick="galleryForScan('qr')">${svgIcon('qr', 15)} 选二维码图</button>
        ${canBar ? `<button class="btn ghost block" onclick="galleryForScan('bar')">${svgIcon('barcode', 15)} 选条码图</button>` : ''}
      </div>
    </div>

    <div class="card">
      <h3>${svgIcon('check-circle', 16)} 本次识别只认这一种</h3>
      <div class="kv-list">
        ${kv('扫二维码', serverQr ? '服务端解码（本机无识别器）' : '只解 ' + detectorFormatLabel('qr'))}
        ${canBar ? kv('扫条码', '只解 ' + detectorFormatLabel('bar')) : ''}
      </div>
      <p class="hint">识别器只对当前入口这一种码开，候选少了才准。
        扫不出来时：把手机<b>拿远到 10~20cm</b>、让整个码完整落在画面里，比贴得很近更好认。</p>
    </div>
    ${!secure ? '<div class="notice">摄像头需要 HTTPS 才能调用。</div>' : ''}`;

  const el = $('#manualSN');
  if (el) el.onkeydown = (e) => { if (e.key === 'Enter') manualLookup(); };
}

function renderManualScan(reason = '') {
  setTabbar(true);
  // 二维码永远有「返回扫码」的退路：本机没识别器时也是服务端解码
  const canScan = true;
  $('#main').innerHTML = `
    ${reason ? `<div class="notice">${esc(reason)}</div>` : ''}
    <div class="card">
      <h3>${svgIcon('keyboard', 16)} 手动输入 SN / 资产编号</h3>
      <div class="field">
        <label>SN / 资产编号</label>
        <input id="manualSN" class="mono" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="如 3TLF263">
      </div>
      <button class="btn primary block" onclick="manualLookup()">查询</button>
      ${canScan ? `<button class="btn block ghost" style="margin-top:10px" onclick="renderScan()">返回扫码</button>` : ''}
      <p class="hint">也可以<b>用手机自带相机</b>扫设备上的资产二维码，会直接打开这台设备的详情页。</p>
    </div>`;
  const el = $('#manualSN');
  if (el) { el.focus(); el.onkeydown = (e) => { if (e.key === 'Enter') manualLookup(); }; }
}

function manualLookup() {
  const sn = $('#manualSN').value.trim();
  if (!sn) { toast('请输入 SN', 'warn'); return; }
  handleScanned(sn);
}

/**
 * 扫到内容后的分流。三种码都要认：
 *   ① 网址码   http://x.x.x.x/m/#/device/<uuid>   → 直接开设备详情（离线也能跳）
 *   ② 资产编号码（系统「资产二维码」里放的，最常见）→ 本地匹配 → 命中就直接开
 *   ③ SN 条码                                       → 本地匹配 → 没命中再问服务端
 *
 * 本地能匹配就绝不多打一次接口：手机上少一次等服务器的往返，
 * 体验差别是「立刻打开」和「转圈两秒」。
 */
async function handleScanned(value) {
  let raw = String(value || '').trim();
  if (!raw) return;

  // ① 网址码：认出 #/device/<uuid> 就直接跳，不用问服务端
  const idMatch = raw.match(/#\/device\/([0-9a-fA-F-]{6,})/);
  if (idMatch) { openDeviceDetail(idMatch[1]); return; }

  // 去掉条码常见的包装：SN: 前缀、SW/PN 之类的类目标签
  const code = raw
    .replace(/^SN[:：\s]*/i, '')
    .replace(/\s+/g, '')
    .trim();
  if (!code) { toast('扫到的内容为空', 'warn'); return; }

  // ②③ 先在本地队列里找（最近设备那一份），命中就直接打开，零等待
  const local = (state.recentItems || []).find((d) =>
    String(d.asset_no || '').toUpperCase() === code.toUpperCase() ||
    String(d.sn || '').toUpperCase() === code.toUpperCase());
  if (local) { openDeviceDetail(local.id); return; }

  toast(`正在查询：${code}`);
  try {
    const r = await api('/devices/lookup?sn=' + encodeURIComponent(code));
    if (!r.found || !r.items.length) {
      $('#main').innerHTML = `<div class="card center">
        <div class="empty" style="padding:16px 0 4px"><div class="em">${svgIcon('search', 38)}</div>没找到「${esc(code)}」<div class="hint" style="margin-top:6px">这个编号不在台账里，或者扫到的是别的条码</div></div>
        <button class="btn ghost block" onclick="renderScan()">返回扫码</button></div>`;
      return;
    }
    if (r.items.length === 1) { openDeviceDetail(r.items[0].id); return; }
    // 多条结果
    $('#main').innerHTML = `<div class="sec-label">查询结果 · 共 ${r.items.length} 台</div>
      <div class="list">${r.items.map(deviceItemHTML).join('')}</div>
      <button class="btn ghost block" onclick="renderScan()">返回扫码</button>`;
  } catch (e) { toast(e.message, 'error'); }
}

async function scanImage(dataURL, kind) {
  const k = kind || state.scanKind;
  const detector = getDetector(k);
  const img = new Image();
  img.onload = async () => {
    // 有浏览器识别器就先让识别器试（快），一张图多切几种方式，别只解一次就放弃
    if (detector) {
      const tries = [
        { label: '原图', box: null },
        { label: '放大', box: null, upscale: 2 },
        { label: '中心方形', square: true },
        { label: '中心方形放大', square: true, upscale: 2 },
      ];
      for (const t of tries) {
        try {
          const target = (() => {
            const w = img.naturalWidth || img.width;
            const h = img.naturalHeight || img.height;
            if (!t.box && !t.square && !t.upscale) return img;   // 第一轮直接解原图
            let box = t.box;
            if (t.square) {
              const side = Math.min(w, h);
              box = { x: (w - side) / 2, y: (h - side) / 2, w: side, h: side };
            } else if (!box) {
              box = { x: 0, y: 0, w, h };
            }
            const up = t.upscale || 1;
            const scale = Math.min(3, (BASE_OUT_W / box.w) * up);   // 别无限放大，超过 3 倍只费时间
            const cv = document.createElement('canvas');
            cv.width = Math.max(1, Math.round(box.w * scale));
            cv.height = Math.max(1, Math.round(box.h * scale));
            const ctx = cv.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            if (ctx.imageSmoothingQuality) ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, box.x, box.y, box.w, box.h, 0, 0, cv.width, cv.height);
            return cv;
          })();

          const codes = await detector.detect(target);
          if (codes?.length) { handleScannedWithMode(codes[0].rawValue); return; }
        } catch { /* 换下一种切法 */ }
      }
    }
    // 识别器没有 / 没解出来 → 服务端兜底（相册里翻拍屏幕的照片尤其吃这一手）。
    // 一维条码也有兜底了（见 serverDecodeFrame 的注释）。
    const one = await serverDecodeFrame(img, k);
    if (one) { handleScannedWithMode(one.rawValue); return; }
    toast('未在图片中识别到' + scanKindOf(k).label
      + '，换一张更清楚、' + (k === 'bar' ? '条码占画面更宽' : '码占画面更大') + '的试试', 'warn');
  };
  img.onerror = () => toast('图片读不出来', 'error');
  img.src = dataURL;
}

/* ================= 最近设备 ================= */
async function renderRecent() {
  setTabbar(true);
  $('#main').innerHTML = `
    <div class="search-box">
      <span class="sb-ico">${svgIcon('search', 16)}</span>
      <input id="recentSearch" type="search" autocomplete="off" placeholder="搜资产编号 / SN / 品牌 / 使用人">
    </div>
    <div class="fchips" id="recentChips"></div>
    <div class="sec-label" id="recentCap"></div>
    <div class="list" id="recentList">${skRows(5)}</div>`;
  const input = $('#recentSearch');
  if (input) {
    input.value = state.recentQuery || '';
    input.oninput = () => { state.recentQuery = input.value.trim(); paintRecentList(); };
  }
  try {
    // page_size 拉满 200：搜的是 SN / 品牌 / 使用人，属于模糊匹配，
    // 只取 50 条会漏掉排在第 51 位之后的目标设备，而本地过滤是零成本的。
    const data = await api('/devices?sort=updated_at&order=desc&page_size=200');
    state.recentItems = data.items || [];
    state.recentTotal = data.total ?? (data.items || []).length;
    paintRecentList();
  } catch (e) {
    $('#recentList').innerHTML = `<div class="empty"><div class="em">${svgIcon('alert', 38)}</div>${esc(e.message)}</div>`;
  }
}

/** 本地筛选：50 条已经在手上了，没必要每敲一个字都去打一次接口 */
function paintRecentList() {
  const box = $('#recentList');
  if (!box) return;
  const q = (state.recentQuery || '').toLowerCase();
  const hit = (v) => String(v || '').toLowerCase().includes(q);
  const rows = state.recentItems.filter((d) => (!q ||
    hit(d.asset_no) || hit(d.sn) || hit(d.brand) || hit(d.model) || hit(d.owner_name) || hit(d.org_name))
    && (!state.recentStatus || d.status === state.recentStatus));
  const chip = $('#recentChips');
  if (chip) chip.innerHTML = statusChipsHTML(state.recentItems);
  const cap = $('#recentCap');
  if (cap) cap.textContent = (q || state.recentStatus)
    ? `筛选出 ${rows.length} 台`
    : `全部 ${state.recentItems.length} 台`;
  if (!rows.length) {
    box.innerHTML = `<div class="empty"><div class="em">${svgIcon(state.recentItems.length ? 'search' : 'inbox', 38)}</div>
      ${state.recentItems.length ? '没有匹配的设备' : '暂无设备记录'}</div>`;
    return;
  }
  box.innerHTML = rows.map(deviceItemHTML).join('');
}

/** 状态筛选片。计数用全量算，否则一筛就看不到别的状态还剩几台。 */
function statusChipsHTML(items) {
  const count = (id) => items.filter((d) => d.status === id).length;
  const chips = [
    { id: '', label: '全部', n: items.length },
    ...(state.statuses || []).map((s) => ({ id: s.id, label: s.label, n: count(s.id) })),
  ];
  return chips.map((c) => `<button class="fchip${(state.recentStatus || '') === c.id ? ' on' : ''}"
    onclick="setRecentStatus('${c.id}')">${esc(c.label)}<span class="n">${c.n}</span></button>`).join('');
}

function setRecentStatus(id) {
  state.recentStatus = String(id || '');
  paintRecentList();
}

function deviceItemHTML(d) {
  const color = d.category_color || 'var(--primary)';
  return `<div class="item" onclick="openDeviceDetail('${d.id}')">
    <div class="ico" style="background:color-mix(in srgb, ${color} 14%, transparent);color:${color}">${iconOf(d.category_icon)}</div>
    <div class="meta">
      <div class="t">${esc(d.asset_no)}</div>
      <div class="s">${esc(d.brand || '')} ${esc(d.model || '')} · ${esc(d.org_name || '未分配')}</div>
      <div class="s mono">${esc(d.sn || '无 SN')}</div>
    </div>
    ${statusBadge(d.status)}
    <span class="chev">${svgIcon('chevron', 16)}</span>
  </div>`;
}

const iconOf = (n, size = 20) => svgIcon(ICONS[n] || 'package', size);

/* ================= 设备详情 ================= */
async function openDeviceDetail(id) {
  try {
    const d = await api('/devices/' + id);
    setTabbar(true);
    const accent = d.category_color || 'var(--primary)';
    // 两码并给（见下方 qr-card 注释）：主码放资产编号（21×21 模块，最好扫），
    // 备用码放网址（手机自带相机用）。兜底到设备 id，保证任何一个码都不为空。
    const qrShort = String(d.asset_no || d.sn || d.id || '').trim();
    const qrShortUrl = `/api/qrcode?text=${encodeURIComponent(qrShort)}&ec=M`;
    const qrLongUrl = `/api/qrcode?text=${encodeURIComponent(`${location.origin}/m/#/device/${d.id}`)}&ec=L`;
    $('#main').innerHTML = `
      <div class="card">
        <div class="dev-hero">
          <span class="em" style="background:color-mix(in srgb, ${accent} 14%, transparent);color:${accent}">${iconOf(d.category?.icon, 25)}</span>
          <span class="hd">
            <span class="t">${esc(d.asset_no)}</span>
            <span class="s">${esc(d.category?.name || '未分类')}${d.brand ? ' · ' + esc(d.brand) : ''}${d.model ? ' ' + esc(d.model) : ''}</span>
          </span>
          ${statusBadge(d.status)}
        </div>
        <div class="hero-sn">
          <span class="mono">${esc(d.sn || '无 SN')}</span>
          ${d.sn ? `<button type="button" class="mini-btn" data-copy="${esc(d.sn)}" onclick="copyFrom(this)">${svgIcon('copy', 14)} 复制</button>` : ''}
        </div>
      </div>

      ${mobilePhotoCard(d)}

      <div class="card">
        <h3>归属与采购</h3>
        <div class="kv-list">
          ${kv('所属组织', esc(d.org_path || '—'))}
          ${kv('使用人', esc(d.owner_name || '—'))}
          ${kv('存放位置', esc(d.location || '—'))}
          ${kv('供应商', esc(d.supplier || '—'))}
          ${kv('采购日期', esc(d.purchase_date || '—'))}
          ${kv('保修到期', `${esc(d.warranty_until || '—')}${d.warranty_expired === true ? '<span class="warn-flag">已过期</span>' : ''}`)}
        </div>
      </div>

      <div class="card">
        <h3>硬件与网络</h3>
        <div class="kv-list">
          ${kv('IP 地址', esc(d.ip_address || '—'))}
          ${kv('MAC 地址', esc(d.mac_address || '—'))}
          ${kv('操作系统', esc(d.os_name || '—'))}
          ${kv('CPU / 内存', `${esc(d.cpu || '—')} / ${esc(d.memory || '—')}`)}
          ${kv('屏幕尺寸', esc(d.screen_size || '—'))}
          ${kv('备注', esc(d.remark || '—'))}
        </div>
      </div>

      <!--
        二维码块：两种码都给是刻意的 ——
          主码放**资产编号**：13 字节 → 版本 1 / 21×21 模块，240px 下每格 8.9px，
          对着屏幕拍也稳。这也是管理端「打开二维码」弹窗里的那张大码，两端口径一致。
          备用码放网址（/m/#/device/&lt;id&gt;）：72 字节 → 版本 5 / 37×37 模块，密得多，
          只有手机**自带相机**扫它才有意义（直接在浏览器里打开设备页，不需要登录）。
          如果照旧只给网址码，App 内「扫码核对」对着屏幕拍 37×37 就很容易糊 ——
          这就是「设备详情只有二维码、根本扫不了」的由来。
      -->
      <div class="card qr-card">
        <div class="qr-item">
          <img src="${qrShortUrl}" width="240" height="240" alt="资产编号二维码" class="qr-img lg">
          <div class="qr-cap">${esc(qrShort)}<br><span class="muted">App 里「扫码核对」扫这个，最好扫</span></div>
        </div>
        <div class="qr-item sm">
          <img src="${qrLongUrl}" width="150" height="150" alt="设备网址二维码" class="qr-img">
          <div class="qr-cap muted">手机<b>自带相机</b>扫这个，直接打开设备页</div>
        </div>
      </div>

      <button class="btn primary block" onclick="verifyDevice('${d.id}','${esc(d.sn || '')}')">${svgIcon('check-circle', 16)} 核对这台设备</button>
      <button class="btn ghost block" onclick="renderHome()">返回首页</button>`;
    bindMobilePhotoCard(d);
  } catch (e) {
    setTabbar(true);
    $('#main').innerHTML = `<div class="empty"><div class="em">${svgIcon('alert', 38)}</div>${esc(e.message)}</div>`;
  }
}

/** 设备详情里照片卡的事件绑定 */
function bindMobilePhotoCard(d) {
  const box = $('#devShotBox');
  const thumb = $('#devShotThumb');
  if (box && thumb) {
    const open = () => openShotViewer(thumb.getAttribute('data-original') || thumb.getAttribute('src'));
    box.onclick = open;
  }
  const btnOpen = $('#devShotOpen');
  if (btnOpen) btnOpen.onclick = () => { const t = $('#devShotThumb'); if (t) openShotViewer(t.getAttribute('data-original') || t.getAttribute('src')); };
  const btnSave = $('#devShotSave');
  if (btnSave) {
    btnSave.onclick = async () => {
      const t = $('#devShotThumb');
      const src = t?.getAttribute('data-original') || t?.getAttribute('src') || '';
      btnSave.disabled = true;
      try {
        const res = await fetch(src);
        if (!res.ok) throw new Error('照片取不回来');
        await saveShotToPhone(await res.blob(), d.sn || '', false);
      } catch (e) {
        toast(e.message || '保存失败', 'error');
      } finally { btnSave.disabled = false; }
    };
  }
}

function kv(k, v) {
  return `<div class="kv-row"><span class="k">${esc(k)}</span><span class="v">${v}</span></div>`;
}

/** 手机端设备详情的照片卡：显示压缩图，可点开原图、也可存到手机 */
function mobilePhotoCard(d) {
  const preview = d.photo_path || d.photo_original_path || '';
  const original = d.photo_original_path || d.photo_path || '';
  if (!preview) return '';
  return `
    <div class="card shot-card">
      <div class="shot-head"><span class="shot-title">${svgIcon('camera', 15)} 设备照片</span><span class="shot-hint">点图放大</span></div>
      <div class="shot-box" id="devShotBox">
        <img id="devShotThumb" src="${esc(preview)}" data-original="${esc(original)}" alt="设备照片">
        <span class="shot-zoom">${svgIcon('search', 16)}</span>
      </div>
      <div class="shot-actions">
        <button class="btn sm" id="devShotSave">${svgIcon('download', 15)} 存到手机</button>
        <button class="btn sm" id="devShotOpen">原图</button>
        <span class="shot-tip">导出 Excel 时这张照片会自动带上</span>
      </div>
    </div>`;
}

function verifyDevice(id, expectedSN) {
  state.verifyDevice = { id, expectedSN };
  state.scanRole = 'verify';
  openCamera('scan', 'qr');
  // 在扫码循环里重写处理逻辑
  window.__verifyHandler = (raw) => {
    const expected = String(expectedSN || '').replace(/\s+/g, '').toUpperCase();
    // 扫的可能是网址码（#/device/<自己的 id>）→ 就是这台设备，直接算一致；
    // 否则按「去前缀 + 去空白 + 大写」比对编号。两种都比，避免明明扫对了还报不一致。
    const rawStr = String(raw || '');
    const idHit = rawStr.match(/#\/device\/([0-9a-fA-F-]{6,})/);
    const scannedSelf = !!idHit && String(idHit[1]).toLowerCase() === String(id || '').toLowerCase();
    const scanned = rawStr.replace(/^SN[:：\s]*/i, '').replace(/\s+/g, '').toUpperCase();
    const match = scannedSelf || (!!scanned && !!expected && scanned === expected);
    api(`/devices/${id}/verify`, { method: 'POST', body: JSON.stringify({ sn: raw, operator: state.operator || 'mobile' }) })
      .then(() => {
        $('#main').innerHTML = `<div class="card center">
          <div class="empty" style="padding:12px 0 4px">
            <div class="em" style="color:${match ? 'var(--green)' : 'var(--red)'}">${match ? svgIcon('check-circle', 38) : svgIcon('ban', 38)}</div>
            <b style="font-size:17px;color:var(--text)">${match ? '核对一致' : '核对不一致'}</b>
          </div>
          <div class="kv-list" style="text-align:left;margin-bottom:14px">
            ${kv('扫描到的', esc(raw))}
            ${kv('台账登记的', esc(expectedSN || '—'))}
          </div>
          <button class="btn primary block" onclick="openDeviceDetail('${id}')">返回设备</button></div>`;
      }).catch((e) => toast(e.message, 'error'));
  };
}

// 覆盖扫码处理：verify 模式优先
function handleScannedWithMode(raw) {
  if (state.scanRole === 'verify' && window.__verifyHandler) {
    const h = window.__verifyHandler;
    window.__verifyHandler = null;
    h(raw);
    return;
  }
  handleScanned(raw);
}

/* 暴露全局 */
window.openCamera = openCamera;
window.closeCamera = closeCamera;
window.capture = capture;
window.flipCamera = flipCamera;
window.pickFromGallery = pickFromGallery;
window.closePreview = closePreview;
window.retakePhoto = retakePhoto;
window.enhanceForOcr = enhanceForOcr;
window.snCandidatesHTML = snCandidatesHTML;
window.frameCropRect = frameCropRect;
window.shootFromVideo = shootFromVideo;
window.startRecognize = startRecognize;
window.renderHome = renderHome;
window.renderScan = renderScan;
window.manualLookup = manualLookup;
window.openDeviceDetail = openDeviceDetail;
window.verifyDevice = verifyDevice;
window.route = route;
window.handleScannedWithMode = handleScannedWithMode;
window.openShotViewer = openShotViewer;
window.closeShotViewer = closeShotViewer;
window.shotZoom = shotZoom;
window.shotReset = shotReset;
window.savePreviewShot = savePreviewShot;
window.saveViewerShot = saveViewerShot;
window.saveShotToPhone = saveShotToPhone;
window.autosaveOn = autosaveOn;
window.setAutosave = setAutosave;
// 便于自动化测试与调试
window.scanRegion = scanRegion;
window.getDetector = getDetector;
window.resetDetector = resetDetector;
window.handleScanned = handleScanned;
window.renderRecognizeResult = renderRecognizeResult;
window.renderMobileTracking = renderMobileTracking;
window.shotPreviewHTML = shotPreviewHTML;
window.mobilePhotoCard = mobilePhotoCard;
window.shootFromImage = shootFromImage;
window.shotFileName = shotFileName;
window.captureForScan = captureForScan;
window.decodeFrameMultiPass = decodeFrameMultiPass;
window.renderManualScan = renderManualScan;
window.mobileState = state;
window.copyFrom = copyFrom;
window.copyText = copyText;
window.galleryForCapture = galleryForCapture;
window.galleryForScan = galleryForScan;
window.SCAN_KINDS = SCAN_KINDS;
window.scanKindOf = scanKindOf;
window.detectorFormatLabel = detectorFormatLabel;
window.stepsOf = stepsOf;
// 取景框 → 视频帧的几何（改扫码区域必看）：自动化测试要能直接验算这组映射，
// 不然「扁带裁到帧的哪一块」只能靠读代码判断。
window.frameRectOf = frameRectOf;
window.growBandTall = growBandTall;
window.scanBandBox = scanBandBox;
window.bandScoreOf = bandScoreOf;
window.scanRegionOfFrameBand = scanRegionOfFrameBand;
window.paintRecentList = paintRecentList;
window.confRing = confRing;
window.skRows = skRows;
window.setTabbar = setTabbar;
window.toggleMore = toggleMore;
window.closeMore = closeMore;
// 扫码排障：手机上打开控制台敲 __scanInfo() 就能看到这台机器认不认二维码
window.__scanInfo = () => ({
  hasBarcodeDetector: 'BarcodeDetector' in window,
  // 两个入口各自的生效清单 —— 分开看才知道「扫二维码」和「扫条码」各认什么
  qr: detectorFormatLabel('qr'),
  bar: detectorFormatLabel('bar'),
  formats: detectorFormatLabel('qr') + ' | ' + detectorFormatLabel('bar'),
  scanKind: state.scanKind,
  secure: window.isSecureContext === true,
  videoSize: (() => { const v = $('#cameraVideo'); return v ? `${v.videoWidth}x${v.videoHeight}` : 'no video'; })(),
});
window.renderHomeLegacy = renderHomeLegacy;
window.renderDashboard = renderDashboard;
window.renderRecent = renderRecent;
window.statusChipsHTML = statusChipsHTML;
window.setRecentStatus = setRecentStatus;


initShotGestures();
boot();
