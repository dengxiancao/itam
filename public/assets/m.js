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

/**
 * 相册入口必须按当前流程走对分支：
 * 扫码模式下选图是「解条码」，不是「OCR 识别」。
 * 之前两者共用 pickFromGallery()，用户逛过扫码页再回首页选图就会串流程。
 */
function galleryForCapture() { state.scanMode = 'capture'; pickFromGallery(); }
function galleryForScan() { state.scanMode = 'scan'; pickFromGallery(); }

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
  scanMode: 'lookup',   // lookup | verify
  verifyDevice: null,
  shot: { zoom: 1, x: 0, y: 0 },   // 照片放大比对视图的缩放/位移
  recentItems: [],       // 「最近设备」已取回的列表（本地筛选用，不用每敲一个字就打接口）
  recentQuery: '',
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
  // hash 路由（扫码打开 #/device/:id）
  if (location.hash.startsWith('#/device/')) {
    openDeviceDetail(location.hash.split('/').pop());
    return;
  }
  route('home');
}

function route(view) {
  state.view = view;
  // 切标签一定要把底部导航放回来：识别结果等流程页会临时把它藏起来
  setTabbar(true);
  const fn = { home: renderHome, scan: renderScan, recent: renderRecent }[view] || renderHome;
  fn();
}

/* ================= 首页 ================= */
function httpsUrl() {
  // 把当前地址切换成 HTTPS + 8443 端口（手机调用摄像头必需）
  const host = location.hostname || '192.168.110.138';
  return `https://${host}:8443/m`;
}

function renderHome() {
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
      <button class="m-row" onclick="openCamera('scan')">
        <span class="em">${svgIcon('search', 19)}</span>
        <span class="m-row-txt"><span class="t">扫码核对 / 查询</span><span class="s">扫资产二维码或 SN 条码，直接打开设备</span></span>
        ${svgIcon('chevron', 16)}
      </button>
      <button class="m-row" onclick="galleryForCapture()">
        <span class="em">${svgIcon('image', 19)}</span>
        <span class="m-row-txt"><span class="t">从相册选图识别</span><span class="s">没有拍照条件时，上传铭牌照片识别</span></span>
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
    </div>

    <div class="m-group">
      <a class="m-row" href="/" style="text-decoration:none;color:inherit">
        <span class="em">${svgIcon('monitor', 19)}</span>
        <span class="m-row-txt">
          <span class="t">回到电脑端管理后台</span>
          <span class="s">改数据、看报表、导 Excel、管账号都在电脑端</span>
        </span>
        ${svgIcon('chevron', 16)}
      </a>
      <a class="m-row" href="/manual" target="_blank" rel="noopener" style="text-decoration:none;color:inherit">
        <span class="em">${svgIcon('book', 19)}</span>
        <span class="m-row-txt">
          <span class="t">使用手册</span>
          <span class="s">拍照入库、扫码核对、Excel 对接怎么用</span>
        </span>
        ${svgIcon('chevron', 16)}
      </a>
    </div>`;
  const chk = $('#chkAutosave');
  if (chk) chk.onchange = () => { setAutosave(chk.checked); toast(chk.checked ? '已开启自动备份' : '已关闭自动备份', chk.checked ? 'ok' : 'warn'); };
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

async function openCamera(mode) {
  state.scanMode = mode;
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
  // 扫码核对和拍照入库是两条完全不同的路，先把模式顶在取景框上方说清楚
  if (guide) {
    guide.textContent = scanMode ? '扫码核对' : '拍照识别';
    guide.className = 'cam-guide' + (scanMode ? ' scan' : '');
  }
  if (scanMode) {
    $('#camFrame').style.height = '18%';
    $('#camFrame').style.top = '38%';
    if (hint) hint.textContent = '对准资产二维码 / SN 条码，会自动识别（点快门 = 再识别一次）';
  } else {
    $('#camFrame').style.height = '26%';
    $('#camFrame').style.top = '22%';
    if (hint) hint.textContent = '把铭牌放进框内（只保留框里的画面，请让字完整入框）';
  }
  try {
    // 尽量要最高的分辨率：原图要归档，糊了以后放大看不清铭牌小字
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: state.facing,
        width: { ideal: 3840 },
        height: { ideal: 2160 },
      },
      audio: false,
    });
    const video = $('#cameraVideo');
    video.srcObject = state.stream;
    await video.play();
    if (mode === 'scan') startScanLoop();
  } catch (e) {
    overlay.hidden = true;
    toast(cameraError(e), 'error');
  }
}

function closeCamera() {
  stopCamera();
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
    if (state.scanMode === 'scan') startScanLoop();
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
  if (state.scanMode === 'scan') {
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

/** 扫码模式下的快门：只解条码，绝不进识别入库 */
async function captureForScan(video) {
  state.scanning = false;                 // 先停掉自动扫描循环，避免重复触发
  const detector = getDetector();
  if (!detector) {
    closeCamera();
    renderManualScan('这个浏览器不支持网页内扫码');
    return;
  }
  state.busy = true;
  try {
    const codes = await detector.detect(video);
    if (codes?.length) {
      closeCamera();
      handleScannedWithMode(codes[0].rawValue);
      return;
    }
    // 没解出来：多半是没对准或糊了，继续自动扫描，别把用户卡住
    toast('没识别到条码，把码放进取景框再试…', 'warn');
    state.scanning = true;
    startScanLoop();
  } catch {
    state.scanning = true;
    startScanLoop();
  } finally {
    state.busy = false;
  }
}

function pickFromGallery() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;

    // 扫码模式：直接拿图片去做条码识别
    if (state.scanMode === 'scan') {
      scanImage(URL.createObjectURL(file));
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
  state.scanMode = 'capture';
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
      <button class="btn ghost icon" onclick="renderHome();route('home')" aria-label="取消">${svgIcon('x', 18)}</button>
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
let barcodeDetector = null;
function getDetector() {
  if ('BarcodeDetector' in window) {
    try {
      barcodeDetector = new BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'itf', 'upc_a', 'upc_e', 'codabar', 'data_matrix'] });
      return barcodeDetector;
    } catch { return null; }
  }
  return null;
}

let scanRaf = 0;

/**
 * 从视频帧里截出取景框那块、放大到 640px 再交给识别器。
 *
 * 为什么要多这一步：整帧 1920×1080 直接丢给 BarcodeDetector，取景框里的码只占几百像素；
 * 先裁再放大，码在识别器眼里变大好几倍，密集的二维码才解得出来（一维条码本来就好认）。
 * 裁剪失败就退回整帧，不影响原来的行为。
 */
function scanRegion(attempt) {
  const video = $('#cameraVideo');
  if (!video || !video.videoWidth) return null;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  try {
    // 前两次试取景框区域，之后试整帧，兼顾「码在框里」和「码有点偏」
    const box = attempt % 3 === 2
      ? { x: 0, y: 0, w: vw, h: vh }
      : frameCropRect(vw, vh, { pad: 0 });

    const outW = 640;
    const outH = Math.max(1, Math.round((box.h / box.w) * outW));
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    if (ctx.imageSmoothingQuality) ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(video, box.x, box.y, box.w, box.h, 0, 0, outW, outH);
    return canvas;
  } catch {
    return null;
  }
}

async function startScanLoop() {
  if (state.scanning) return;
  state.scanning = true;
  const detector = getDetector();
  if (!detector) {
    toast('当前浏览器不支持条码扫描，请手动输入 SN 或从相册选图', 'warn');
    closeCamera();
    renderManualScan();
    return;
  }
  const video = $('#cameraVideo');
  let attempt = 0;
  const tick = async () => {
    if (!state.scanning || !video.srcObject) return;
    try {
      // 先认放大后的取景框区域，认不到再认整帧
      const region = scanRegion(attempt);
      let codes = region ? await detector.detect(region) : [];
      if (!codes?.length) codes = await detector.detect(video);
      if (codes?.length) {
        state.scanning = false;
        closeCamera();
        handleScannedWithMode(codes[0].rawValue);
        return;
      }
    } catch { /* ignore */ }
    attempt++;
    scanRaf = requestAnimationFrame(tick);
  };
  tick();
}

function renderScan() {
  setTabbar(true);
  const secure = window.isSecureContext === true || location.hostname === 'localhost';
  const canScan = !!getDetector();
  $('#main').innerHTML = `
    ${canScan ? `
      <button class="big-btn primary" onclick="openCamera('scan')">
        <span class="em">${svgIcon('search', 23)}</span>
        <span class="bb-txt">
          <span class="t">扫描资产二维码 / SN 条码</span>
          <span class="s">对准设备上的二维码或 SN 条码，自动识别后直接打开设备</span>
        </span>
        <span class="bb-arrow">${svgIcon('chevron', 18)}</span>
      </button>` : `
      <div class="card">
        <h3>这个浏览器不能网页内扫码</h3>
        <p class="hint" style="margin-top:0">iPhone / Safari 及部分手机浏览器没有开放「网页扫条码」的能力（不是系统坏了）。下面两种办法一样能扫码核对：</p>
        <ol class="steps">
          <li><b>用手机自带相机</b>扫设备上的资产二维码，会直接打开这台设备的详情页</li>
          <li>用<b>安卓 Chrome / Edge</b> 打开本页，可以直接在网页内扫码</li>
        </ol>
      </div>`}
    <div class="card">
      <h3>${svgIcon('keyboard', 16)} 手动输入 SN / 资产编号</h3>
      <div class="field">
        <label>SN / 资产编号</label>
        <input id="manualSN" class="mono" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="如 3TLF263">
      </div>
      <button class="btn primary block" onclick="manualLookup()">查询</button>
      <p class="hint">也可以<b>用手机自带相机</b>扫设备上的资产二维码，会直接打开这台设备的详情页。</p>
    </div>
    ${!secure ? '<div class="notice">摄像头需要 HTTPS 才能调用。</div>' : ''}
    ${canScan ? `<button class="btn block ghost" onclick="galleryForScan()">${svgIcon('image', 16)} 从相册选图</button>` : ''}`;
  const el = $('#manualSN');
  if (el) el.onkeydown = (e) => { if (e.key === 'Enter') manualLookup(); };
}

function renderManualScan(reason = '') {
  setTabbar(true);
  const canScan = !!getDetector();
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

async function handleScanned(value) {
  let raw = String(value || '').trim();
  if (!raw) return;
  // 从资产二维码 URL 中提取 device id
  const idMatch = raw.match(/#\/device\/([0-9a-fA-F-]+)/);
  if (idMatch) { openDeviceDetail(idMatch[1]); return; }
  // 条码里若带 "SN:" 前缀则去掉
  raw = raw.replace(/^SN[:：\s]*/i, '').replace(/\s+/g, '');
  toast(`正在查询：${raw}`);
  try {
    const r = await api('/devices/lookup?sn=' + encodeURIComponent(raw));
    if (!r.found || !r.items.length) {
      $('#main').innerHTML = `<div class="card center">
        <div class="empty" style="padding:16px 0 4px"><div class="em">${svgIcon('search', 38)}</div>未找到 SN「${esc(raw)}」对应的设备</div>
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

async function scanImage(dataURL) {
  const detector = getDetector();
  if (!detector) { toast('浏览器不支持图片条码识别', 'warn'); return; }
  const img = new Image();
  img.onload = async () => {
    try {
      const codes = await detector.detect(img);
      if (codes?.length) { handleScannedWithMode(codes[0].rawValue); }
      else toast('未在图片中识别到条码', 'warn');
    } catch { toast('条码识别失败', 'error'); }
  };
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
    <div class="list" id="recentList">${skRows(5)}</div>`;
  const input = $('#recentSearch');
  if (input) {
    input.value = state.recentQuery || '';
    input.oninput = () => { state.recentQuery = input.value.trim(); paintRecentList(); };
  }
  try {
    const data = await api('/devices?sort=updated_at&order=desc&page_size=50');
    state.recentItems = data.items || [];
    document.title = 'IT 资产录入';
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
  const rows = state.recentItems.filter((d) => !q ||
    hit(d.asset_no) || hit(d.sn) || hit(d.brand) || hit(d.model) || hit(d.owner_name) || hit(d.org_name));
  if (!rows.length) {
    box.innerHTML = `<div class="empty"><div class="em">${svgIcon(state.recentItems.length ? 'search' : 'inbox', 38)}</div>
      ${state.recentItems.length ? '没有匹配的设备' : '暂无设备记录'}</div>`;
    return;
  }
  box.innerHTML = rows.map(deviceItemHTML).join('');
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
    const qrUrl = `/api/qrcode?text=${encodeURIComponent(`${location.origin}/m/#/device/${d.id}`)}`;
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

      <div class="card qr-card">
        <img src="${qrUrl}" width="150" height="150" alt="设备二维码" class="qr-img">
        <p class="hint">用手机自带相机扫这张码，可直接打开本设备。</p>
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
  state.scanMode = 'verify';
  openCamera('scan');
  // 在扫码循环里重写处理逻辑
  window.__verifyHandler = (raw) => {
    const scanned = String(raw || '').replace(/^SN[:：\s]*/i, '').replace(/\s+/g, '').toUpperCase();
    const expected = String(expectedSN || '').replace(/\s+/g, '').toUpperCase();
    const match = !!scanned && !!expected && scanned === expected;
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
  if (state.scanMode === 'verify' && window.__verifyHandler) {
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
window.renderRecognizeResult = renderRecognizeResult;
window.renderMobileTracking = renderMobileTracking;
window.shotPreviewHTML = shotPreviewHTML;
window.mobilePhotoCard = mobilePhotoCard;
window.shootFromImage = shootFromImage;
window.shotFileName = shotFileName;
window.captureForScan = captureForScan;
window.renderManualScan = renderManualScan;
window.mobileState = state;
window.copyFrom = copyFrom;
window.copyText = copyText;
window.galleryForCapture = galleryForCapture;
window.galleryForScan = galleryForScan;
window.paintRecentList = paintRecentList;
window.confRing = confRing;
window.skRows = skRows;
window.setTabbar = setTabbar;

initShotGestures();
boot();
