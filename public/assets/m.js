/* ================= ITAM 移动端应用 ================= */
/* 识别链路（压缩 / 方向容错 / 灰度拉伸 / 串行队列）与电脑端共用同一份实现，
   见 public/assets/ocr-core.js —— 那边修好的坑这边自动就有了，别在这里再抄一份。 */
import {
  OCR_MAX_SIDE, ORIGINAL_MAX_SIDE, THUMB_MAX_SIDE,
  downscaleToBlob, loadImageBlob, shootFromImage, enhanceForOcr,
  inkProfileCV, textAxisOf, retryAngles, usableResult, rotateBlob, grayOfBlob,
  overallScore, recognizeOne, recognizeFile, runSerial,
} from './ocr-core.js';

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
  batch: null,           // 批量识别入库的整批状态（见 startBatch），不用时是 null
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
    // 录入表单的默认选中项（管理端「系统设置 → 手机录入默认值」里配）
    state.mobileDefaults = o.mobile_defaults || {};
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
  // 移动端切换主页面时回到内容起点，避免从「最近设备」的滚动位置进入新页面。
  // DOM 桩和部分旧浏览器没有 scrollTo，缺失时不影响正常渲染。
  try { window.scrollTo?.({ top: 0, left: 0, behavior: 'instant' }); } catch { /* ignore */ }
  closeMore();
  // batch 是「批量识别入库」的流程页，不放 tab 里（它有自己的退出按钮）
  const fn = { dashboard: renderDashboard, home: renderHome, scan: renderScan, recent: renderRecent, batch: renderBatch }[view] || renderHome;
  fn();
}


function fmtNum(n) {
  const v = Number(n || 0);
  return Number.isFinite(v) ? v.toLocaleString('zh-CN') : String(n ?? '');
}


/* ================= 识别入库（tab: home）—— 「只做事」的一页 =================
 * 这一页的职责**只有一件事**：把设备录进来。所以屏幕上只留这几个动作：
 *   拍照识别入库（主）· 从相册选图识别 · 批量识别入库（相册多选）·
 *   扫码核对查询 · 照片备份开关
 * 后两个相册入口是一对：选一张走单张流程（当场核对、当场入库），
 * 选多张走批量流程（攒成清单再一起入库）。**别把它们合成一个入口**——
 * 合并后必须靠「选了几张」去猜用户想干什么，猜错的那一半体验会很差。
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
        <span class="m-row-txt"><span class="t">从相册选图识别</span><span class="s">没有拍照条件时，上传一张铭牌照片识别</span></span>
        ${svgIcon('chevron', 16)}
      </button>
      <button class="m-row" onclick="galleryForBatch()">
        <span class="em">${svgIcon('list', 19)}</span>
        <span class="m-row-txt"><span class="t">批量识别入库</span><span class="s">一次选多张相册照片，逐张识别、核对后一起入库</span></span>
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
    if (hint) hint.textContent = '把铭牌放进框内（只保留框里的画面，字要完整入框；倒着 / 斜着也能认）';
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

/* 缩放的三个尺寸上限（OCR_MAX_SIDE / ORIGINAL_MAX_SIDE / THUMB_MAX_SIDE）、
   downscaleToBlob、enhanceForOcr 都在 ocr-core.js：
   一次拍照产出三份图 —— image 最长边 2200px（给识别，铭牌小字要够清楚）、
   original 原始分辨率（归档进设备详情）、thumb 最长边 320px（导出 Excel 嵌单元格）。 */

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

/* shootFromImage（相册选图：不裁，见 ocr-core.js）—— 手机和电脑都走同一条，
   没有取景框就不该按屏幕比例硬裁，否则会把铭牌切掉。 */

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

  // ⚠️ 扫码模式下按快门 = 「拿这一帧去解条码」，绝不能掉进识别入库的流程
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
      // ⚠️ 必须多趟解码，不能直接 detect(video)：不裁剪不放大只解一次，
      //    屏幕上 150px 的二维码换算回帧内只剩几百像素，37 个模块一摊就糊了。
      try { codes = await decodeFrameMultiPass(video) || []; } catch { codes = []; }
    }
    // ⚠️ 两种码都有兜底（服务端 bardecode.js 会解 Code128/Code39），
    //    这里别只给二维码留后路 —— 否则「二维码能扫、条码永远扫不出来」。
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
    // 提示要说清「这次要的是哪种码」+ 动作。小条码别劝「拿远」——离得越远条码越小
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
 * 对当前这一帧按 SCAN_STEPS 轮着解码，任一趟命中就返回。
 * 为什么要多趟：`detect()` 对输入尺寸很敏感，直接喂 <video> 原帧时浏览器会自己先缩放一次，
 * 二维码的小格子就被抹平了；先画到画布上并指定宽高，等于替浏览器把「该缩到多少」定下来。
 */
async function decodeFrameMultiPass(video) {
  const detector = getDetector(state.scanKind);
  if (!detector) return [];
  // ⚠️ 必须按码型取步骤表（SCAN_STEPS 是 {qr,bar} 两个数组，写 .length 会得到 undefined）
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
 * 发灰度而不是 JPEG：服务端解码器要的就是灰度像素，直接发原始字节，
 * 前端少一次编码、后端少一次解码。
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
  // 0.299/0.587/0.114 人眼亮度权重：(r+g+b)/3 会让红底黑字这类标签对比度变差
  for (let i = 0, j = 0; i < gray.length; i++, j += 4) {
    gray[i] = (d[j] * 299 + d[j + 1] * 587 + d[j + 2] * 114) / 1000 | 0;
  }
  return gray;
}

/**
 * 服务端兜底解码：浏览器这一帧解不出来时，把灰度图发上去让服务端解
 * （iPhone/Safari 根本没有 BarcodeDetector；安卓拍屏幕时摩尔纹也会让浏览器整帧失手）。
 * ⚠️ 两种码走**不同**的服务端解码器（`kind` 参数），切法也不同：二维码喂方形最有效；
 *    一维码要逐行扫条空，**喂进去的那条必须窄且长** —— 整帧发上去条码在 900px 里只占 ~50px，
 *    服务端再厉害也救不回来，所以先按取景框切扁带（和前端第一趟同一个矩形）。
 */
async function serverDecodeFrame(source, kind) {
  const k = kind || state.scanKind || 'qr';
  const sw = source?.videoWidth || source?.naturalWidth || 0;
  const sh = source?.videoHeight || source?.naturalHeight || 0;
  if (!sw || !sh) return null;

  /** 发一块灰度图上去，命中返回 { rawValue, format, via:'server' } */
  const post = async (box, maxSide) => {
    // 不放大：解码器要真实像素，放大只是把同样的信息铺开。只压最大边省流量
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
    // 扁带用的是**视频帧**尺寸，所以只有 <video> 走得通；相册来的 <img> 直接用整图。
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

/* ============ 方向容错与发趟逻辑：全部在 ocr-core.js ============ *
 * 判文字走向（inkProfileCV / textAxisOf）→ 0/90/180/270 轮着试（retryAngles /
 * rotateBlob / grayOfBlob）→ 读到就停（usableResult）→ recognizeOne 一趟包办。
 * 抽出去是因为手机端和电脑端走的是同一条链路，抄成两份迟早会分叉，
 * 而且分叉出来的毛病是静默的（照片躺了却不重试，界面只显示「没读到」）。
 * ============================================================== */

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

  try {
    const r = await recognizeOne(state.capturedBlob, {
      original: state.originalBlob,
      thumb: state.thumbBlob,
      operator: state.operator,
      loginNext: '/m',
      onStage: (m) => setPreviewInfo(m, true),
    });
    state.recognizeResult = r;
    $('#previewOverlay').hidden = true;
    setPreviewInfo('');
    renderRecognizeResult(r);
    // 识别成功的这张照片，顺手在手机里也留一份（可在首页关掉）
    autosaveShot(r.sn || '', r.image_path || null);
  } catch (e) {
    if (e.redirected) return;
    const msg = e.name === 'AbortError'
      ? '识别超时（120 秒）。请检查手机与电脑是否同一 WiFi，或改用「从相册选图」重试。'
      : e.message;
    toast(msg, 'error');
    setPreviewInfo('识别失败，可点「识别」重试');
    btn.disabled = false;
    btn.innerHTML = svgIcon('search') + ' 识别';
  } finally {
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
  const dflt = state.mobileDefaults || {};
  const last = mobileMemory();
  /*
   * 「补充信息」的取值优先级（从上到下，谁先有值用谁）：
   *
   *   设备分类： 识别提示  >  上次填的  >  系统设置的默认分类  >  列表第一个
   *   其它下拉： 上次填的  >  系统设置的默认值  >  空
   *   分类字段： 上次填的  >  该字段配置的默认值  >  空
   *
   * 为什么「设备分类」把识别排在最前：识别提示来自铭牌上的文字（认出"显示器"），
   * 是关于**这一台**设备的证据；而"上次填的"只是上一台的记忆。
   * 其余字段没有这种逐台的证据，所以记忆优先 —— 这正是用户要的
   * 「上次输入的信息自动填充」。
   */
  const suggestedCat = state.categories.find((c) => c.code === catHint)?.id
    || (state.categories.some((c) => c.id === last.category_id) ? last.category_id : '')
    || (state.categories.some((c) => c.id === dflt.category_id) ? dflt.category_id : '');
  const defOrg = pickValid([last.org_id, dflt.org_id], state.orgs.map((o) => o.id));
  const defSupplier = pickValid([last.supplier, dflt.supplier], state.suppliers);
  const defStatus = pickValid([last.status, dflt.status, 'in_use'], state.statuses.map((s) => s.id)) || 'in_use';
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
      <div class="card-head">
        <h3>补充信息</h3>
        ${mobileMemory().category_id || Object.keys(mobileMemory().fields || {}).length
    ? `<button type="button" class="btn xs ghost" id="memClearBtn" onclick="clearMobileMemoryConfirm()">${svgIcon('refresh', 13)} 清除记忆</button>` : ''}
      </div>
      ${mobileMemory().category_id || Object.keys(mobileMemory().fields || {}).length
    ? '<p class="hint" style="margin:0 0 10px">已按<b>上次录入</b>的内容填好，直接改需要变的即可。想从空白开始点右上角「清除记忆」。</p>' : ''}
      <div class="field"><label>设备分类</label><select id="rCat">${state.categories.map((c) => `<option value="${c.id}" ${c.id === suggestedCat ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
      <div class="field"><label>所属组织</label><select id="rOrg"><option value="">未分配</option>${state.orgs.map((o) => `<option value="${o.id}" ${o.id === defOrg ? 'selected' : ''}>${esc(o.path || o.name)}</option>`).join('')}</select></div>
      ${/* 使用人 / 存放位置 等，现在都由「设备分类」的专属字段决定，见 renderMobileTracking() */''}
      <div id="rTracking"></div>
      <div class="field"><label>供应商</label><select id="rSupplier"><option value="">— 未指定 —</option>${state.suppliers.map((s) => `<option value="${esc(s)}" ${s === defSupplier ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></div>
      <div class="field"><label>状态</label><select id="rStatus">${state.statuses.map((s) => `<option value="${s.id}" ${s.id === defStatus ? 'selected' : ''}>${s.label}</option>`).join('')}</select></div>
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

/**
 * 手机端表单里已经有固定输入框的 key。
 * ⚠️ 分类专属字段里若出现这些 key，必须**过滤掉**：否则同一个东西会渲染出两个输入框，
 *    保存时后写的那个还会把先写的值覆盖掉（管理端设备表单以前就踩过这个坑）。
 */
const MOBILE_FIXED_KEYS = ['asset_no', 'brand', 'model', 'sn', 'category_id', 'org_id', 'supplier', 'status'];

/** 这个分类在手机端该显示哪些字段（使用人 / 存放位置 就在其中，由分类配置决定） */
function mobileTrackingFields(cat) {
  return (cat?.tracking_fields || []).filter((t) => t && t.key && !MOBILE_FIXED_KEYS.includes(t.key));
}

/** 分类专属字段区的 HTML（前缀区分「单张结果页」与「批量待确认页」） */
function trackingFieldsHTML(cat, prefix = 'mt_') {
  const fields = mobileTrackingFields(cat);
  if (!cat || !fields.length) return '';
  return `
    <div class="sub-group">
      <div class="sub-group-hd">${esc(cat.name)}</div>
      ${fields.map((t) => `<div class="field"><label>${esc(t.label)}</label>${mobileTrackingInput(t, mobileFieldValue(t), prefix)}</div>`).join('')}
    </div>`;
}

/**
 * 渲染当前分类的专属字段（手机端单张结果页）。
 * ⚠️ 签名必须保持**无参**：它被当成 onchange 处理器直接挂上去（`catSel.onchange = renderMobileTracking`），
 *    浏览器会把事件对象当第一个实参传进来。多加了形参，`$()` 收到 Event 会当场抛错。
 */
function renderMobileTracking() {
  const box = $('#rTracking');
  if (!box) return;
  const cat = state.categories.find((c) => c.id === ($('#rCat')?.value || ''));
  box.innerHTML = trackingFieldsHTML(cat, 'mt_');
}

/**
 * 分类字段的**默认值**（管理端在「设备分类 → 专属字段 → 默认值」里配）。
 *
 * 下拉字段只在「默认值确实还在选项里」时才用：选项被删过的话，
 * 选一个不存在的值等于空选，还不如老老实实留空，让人工去选。
 */
function mobileFieldDefault(t) {
  const d = t?.default === undefined || t?.default === null ? '' : String(t.default);
  if (!d) return '';
  if (t.type === 'select') return (Array.isArray(t.options) && t.options.includes(d)) ? d : '';
  return d;
}

/* ==================================================================== *
 * 「补充信息」的记忆功能
 *
 * 用户的原话：「做一记忆功能，上次输入的信息自动填充在里面」。
 * 现场是一台接一台地录，同一批设备常常同部门、同供应商、同状态，
 * 连使用人也经常连着好几台是同一个人（一个人配主机 + 显示器）。
 * 每次都从空白开始填，纯属重复劳动。
 *
 * 存在**手机本地**（localStorage），不上传服务器：
 *   · 每台手机记自己的，多人共用同一账号时不会互相干扰
 *   · 不占服务端存储，也不需要额外的接口和权限
 *   · 换手机 / 清了浏览器数据就没了 —— 此时自动回落到管理端配的默认值
 *
 * ⚠️ 存进去的值下次渲染前必须**再校验一遍**：组织可能被删、供应商可能改名、
 *    下拉选项可能调整。用不存在的值填下拉 = 看着像没填，保存时还会写空值。
 * ==================================================================== */

const MOBILE_MEMORY_KEY = 'itam.mobile.lastFill';

/** 读取上次填的内容（坏了/没有都当空对象，绝不让它把页面搞崩） */
function mobileMemory() {
  try {
    const raw = localStorage.getItem(MOBILE_MEMORY_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object') return {};
    return {
      category_id: o.category_id || '',
      org_id: o.org_id || '',
      supplier: o.supplier || '',
      status: o.status || '',
      fields: (o.fields && typeof o.fields === 'object') ? o.fields : {},
    };
  } catch { return {}; }
}

/**
 * 记住这次填的内容（保存成功后调用）。
 * 入参形状：{ category_id, org_id, supplier, status, fields: {字段key: 值} }
 * ⚠️ fields 是**嵌套对象**，别把它当成一个普通字段塞进去（会被 String() 成 "[object Object]"）。
 */
function rememberMobileFill(payload = {}) {
  try {
    const fields = {};
    // 只记非空的：用户把某个字段清空，说明这次就是不填，下次也不该又冒出来
    for (const [k, v] of Object.entries(payload.fields || {})) {
      if (v === null || v === undefined || v === '') continue;
      fields[k] = String(v);
    }
    localStorage.setItem(MOBILE_MEMORY_KEY, JSON.stringify({
      category_id: payload.category_id || '',
      org_id: payload.org_id || '',
      supplier: payload.supplier || '',
      status: payload.status || '',
      fields,
      at: new Date().toISOString(),
    }));
  } catch { /* 存不进去（隐私模式/配额）不影响入库 */ }
}

/** 清掉记忆（界面上给了「清除记忆」按钮，换批次/换部门时用） */
function clearMobileMemory() {
  try { localStorage.removeItem(MOBILE_MEMORY_KEY); } catch { /* ignore */ }
}

/**
 * 界面上的「清除记忆」。
 *
 * m.js 里没有通用确认弹窗（那是管理端的组件），为这一个动作引入一整套弹窗不划算。
 * 手机端更顺手的做法是**两段式确认**：第一次点变成「再点一次确认清除」，4 秒不点就复原。
 * 既防误触，又不用弹窗、不用第二套对话框样式。
 */
let memClearArmed = false;
let memClearTimer = null;
function clearMobileMemoryConfirm() {
  const btn = $('#memClearBtn');   // 用项目自己的 $()，不要用 document.getElementById
  if (!memClearArmed) {
    memClearArmed = true;
    if (btn) {
      btn.dataset.orig = btn.innerHTML;
      btn.textContent = '再点一次确认清除';
      btn.classList.add('danger');
    }
    toast('再点一次就清除记忆', 'warn');
    clearTimeout(memClearTimer);
    memClearTimer = setTimeout(() => {
      memClearArmed = false;
      const b = $('#memClearBtn');
      if (b && b.dataset.orig) { b.innerHTML = b.dataset.orig; b.classList.remove('danger'); }
    }, 4000);
    return;
  }
  clearTimeout(memClearTimer);
  memClearArmed = false;
  clearMobileMemory();
  toast('已清除，下次从空白开始填');
  const r = state.recognizeResult;
  if (r) renderRecognizeResult(r);
}

/** 从候选里挑第一个「确实存在于允许值里」的；都没有就返回空串 */
function pickValid(candidates, allowed) {
  const set = new Set(allowed || []);
  for (const c of candidates) {
    if (c && set.has(c)) return c;
  }
  return '';
}

/** 分类字段的取值：上次填的 > 字段默认值（下拉还要再校验一次选项还在不在） */
function mobileFieldValue(t) {
  const last = mobileMemory().fields || {};
  const remembered = last[t.key] === undefined || last[t.key] === null ? '' : String(last[t.key]);
  const dflt = mobileFieldDefault(t);          // 默认值本身已经过选项校验
  if (t.type === 'select' && Array.isArray(t.options) && t.options.length) {
    if (remembered && t.options.includes(remembered)) return remembered;
    return dflt;
  }
  return remembered || dflt;                   // 文本/数字/日期：记忆优先，其次默认值
}

/**
 * 分类专属字段的输入控件。
 * ⚠️ `prefix` 不是装饰：单张识别结果页用 mt_，批量待确认页用 bt_。
 *    两页虽然不同时出现，但同一个函数被两处调用时就该把「谁的元素」说清楚 ——
 *    一旦哪天真同屏，重名 id 会让 `$('#id')` 只拿到第一个，另一个静默读不到值。
 */
function mobileTrackingInput(t, value, prefix = 'mt_') {
  const id = `${prefix}${t.key}`;
  const v = value === undefined || value === null ? '' : String(value);
  if (t.type === 'select' && Array.isArray(t.options) && t.options.length) {
    return `<select id="${id}">
      <option value="">— 未指定 —</option>
      ${t.options.map((o) => `<option value="${esc(o)}" ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}
    </select>`;
  }
  const type = t.type === 'number' ? 'number' : t.type === 'date' ? 'date' : 'text';
  return `<input id="${id}" type="${type}" value="${esc(v)}">`;
}

function ringColor(r) {
  const c = overallConf(r);
  return c >= 0.7 ? 'var(--green)' : c >= 0.45 ? 'var(--amber)' : 'var(--red)';
}
/** 综合置信度（品牌 + SN 的均值）—— 实现在 ocr-core.js，电脑端算的是同一个数 */
const overallConf = overallScore;

/**
 * 读分类专属字段的值，拆成「设备表的真实列」与「extra」两包。
 * ⚠️ 「使用人 / 存放位置」也走这条路（key 是 owner_name / location，在服务端的
 *    COLUMN_TRACKING_KEYS 里 → 会写进设备表的真实列）；其余进 extra。
 * 单张结果页用 mt_ 前缀，批量待确认页用 bt_，靠 prefix 区分。
 */
function collectTrackingValues(prefix, cat) {
  const extra = {};
  const columnValues = {};
  for (const t of mobileTrackingFields(cat)) {
    const el = $(`#${prefix}${t.key}`);
    if (!el) continue;
    const raw = String(el.value ?? '');
    const v = raw === '' ? null : (t.type === 'number' ? Number(raw) : raw);
    if (state.columnTrackingKeys.includes(t.key)) columnValues[t.key] = v;
    else if (v !== null) extra[t.key] = v;
  }
  return { columnValues, extra };
}

/**
 * 入库载荷。单张和批量共用 —— 图片路径、OCR 原始文本、置信度这些字段的写法
 * 一旦分叉，批量录进去的设备就和手机单张录出来的不是同一种数据，事后很难查。
 */
function buildDevicePayload(fields, r, shared, tracking) {
  const extra = tracking?.extra || {};
  const columnValues = tracking?.columnValues || {};
  return {
    brand: fields.brand || '',
    model: fields.model || '',
    sn: fields.sn || '',
    category_id: shared.category_id || '',
    org_id: shared.org_id || null,
    supplier: shared.supplier || null,
    status: shared.status || 'in_use',
    sn_source: r?.mocked ? 'ocr-mock' : 'ocr',
    ocr_confidence: Math.max(r?.sn_confidence, r?.brand_confidence),
    photo_path: r?.image_path || null,
    sn_photo_path: r?.image_path || null,
    // 原图与缩略图在识别时就已自动上传并存好，这里只是把路径挂到设备上
    photo_original_path: r?.original_path || r?.image_path || null,
    photo_thumb_path: r?.thumb_path || null,
    ocr_raw: JSON.stringify({ provider: r?.provider, brand: r?.brand, model: r?.model, sn: r?.sn, lines: (r?.lines || []).slice(0, 30) }),
    operator: state.operator || 'mobile',
    ...columnValues,
    extra,
  };
}

async function saveRecognized() {
  const r = state.recognizeResult;
  const sn = $('#rSN').value.trim();
  if (!sn) { toast('请填写 SN 序列号', 'warn'); return; }

  const cat = state.categories.find((c) => c.id === $('#rCat').value);
  const tracking = collectTrackingValues('mt_', cat);
  const shared = {
    category_id: $('#rCat').value,
    org_id: $('#rOrg').value || null,
    supplier: $('#rSupplier')?.value || null,
    status: $('#rStatus').value,
  };
  const payload = buildDevicePayload(
    { brand: $('#rBrand').value.trim(), model: $('#rModel').value.trim(), sn },
    r, shared, tracking,
  );
  const btn = $('#btnSave');
  btn.disabled = true; btn.textContent = '保存中…';
  try {
    const dev = await api('/devices', { method: 'POST', body: JSON.stringify(payload) });
    // 保存成功才记：失败的记录进记忆里，下次会把错的内容又填回来
    rememberMobileFill({ ...shared, fields: tracking.columnValues });
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

/* ==================================================================== *
 * 批量识别入库（相册一次选多张）
 *
 * 与「单张」的关系：识别链路完全一样（ocr-core.js 的 recognizeFile），
 * 区别只在于**结果先不直接入库**，而是攒成一张待确认清单，用户核对、修改、
 * 勾选之后再一起提交。理由：
 *   · 一次选十张，逐张确认「照片 ↔ 字段」才是这个功能的全部价值；
 *     直接入库等于把识别错误一次性写进十条台账，事后要一台台找回来。
 *   · 单张失败不该让整批白等，所以每项各自记状态，最后能只重试失败的那几张。
 *
 * ⚠️ 必须**串行**（runSerial 一件一件地跑）：智谱 GLM-4.6V-Flash 这类免费
 *    视觉模型限制的是并发数（国际站 1、国内站 3），并发上传会被上游直接拒，
 *    界面上只会显示「没读出内容」，根本查不出是并发撞的。
 * ==================================================================== */

/**
 * 一次最多几张。
 * 定 30 的依据：单张最坏要跑 4 趟识别（四个角度），30 张就是 120 次调用；
 * 而手机页面得全程开着不能锁屏。再多就不是「一次操作」而是「挂着跑一上午」了。
 */
const BATCH_MAX = 30;

/** 批量待确认页的「本批统一设置」默认值：沿用单张那套记忆（上次填的 > 管理端默认） */
function defaultBatchShared() {
  const last = mobileMemory();
  const dflt = state.mobileDefaults || {};
  const catIds = state.categories.map((c) => c.id);
  return {
    category_id: pickValid([last.category_id, dflt.category_id], catIds) || state.categories[0]?.id || '',
    org_id: pickValid([last.org_id, dflt.org_id], state.orgs.map((o) => o.id)),
    supplier: pickValid([last.supplier, dflt.supplier], state.suppliers),
    status: pickValid([last.status, dflt.status, 'in_use'], state.statuses.map((s) => s.id)) || 'in_use',
  };
}

/** 从相册一次选多张。不做「单张走老路」的分支：走哪个流程由用户点哪个入口决定，别猜。 */
function galleryForBatch() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.onchange = () => {
    const all = [...(input.files || [])];
    const files = all.filter((f) => !f.type || f.type.startsWith('image/'));
    if (!files.length) { toast(all.length ? '这些不是图片文件' : '没有选到图片', 'warn'); return; }
    startBatch(files);
  };
  input.click();
}

/**
 * 开一批。
 * 每项自带 `edit`（品牌/型号/SN 的当前值）：**页面上的输入框只是它的投影**，
 * 提交时读的是 edit 而不是 DOM。这样重绘清单（比如刚才那批入库了要刷新状态）
 * 不会把用户已经改好的内容抹掉。
 */
function startBatch(files) {
  if (files.length > BATCH_MAX) toast(`一次最多 ${BATCH_MAX} 张，先处理前 ${BATCH_MAX} 张`, 'warn');
  const list = files.slice(0, BATCH_MAX);
  const stamp = Date.now();
  state.batch = {
    items: list.map((f, i) => ({
      id: `b${stamp}_${i}`,
      file: f,
      name: (f.name || '').trim() || `照片 ${i + 1}`,
      status: 'pending',   // pending | processing | ok（读到了）| weak（没读全）| error | saved
      stage: '',
      error: '',
      result: null,
      include: true,
      edit: { brand: '', model: '', sn: '' },
    })),
    total: list.length,
    running: false,
    phase: 'recognize',   // recognize | review
    shared: defaultBatchShared(),
    ctrl: new AbortController(),
  };
  route('batch');
  runBatchQueue();
}

/** 离开批量页：把还在飞的请求掐掉、objectURL 释放掉，别留一堆没用的内存 */
function exitBatch() {
  const b = state.batch;
  if (b) b.ctrl?.abort();
  state.batch = null;
  route('home');   // route 会把 state.view 改成 home，正在跑的队列下一次检查就自己停了
}

function finishedCount(b) {
  return (b?.items || []).filter((it) => it.status !== 'pending' && it.status !== 'processing').length;
}

/**
 * 一件一件地跑。`subset` 用来「只重试失败的那几张」——
 * 传进来的每一项会被重置成 pending，其余项不动。
 */
async function runBatchQueue(subset) {
  const b = state.batch;
  if (!b || b.running) return;
  const mine = b;
  const queue = subset || mine.items;
  mine.running = true;
  mine.phase = 'recognize';
  renderBatch();

  await runSerial(queue, async (it) => {
    it.status = 'processing';
    it.stage = '正在读取图片…';
    paintBatchList();
    const r = await recognizeFile(it.file, {
      operator: state.operator,
      loginNext: '/m',
      signal: mine.ctrl?.signal,
      onStage: (m) => { it.stage = m; paintBatchList(); },
    });
    it.result = r;
    it.status = usableResult(r) ? 'ok' : 'weak';
    it.stage = '';
    // 识别出来的值先灌进 edit，用户再改就是改 edit
    it.edit = { brand: r.brand || '', model: r.model || '', sn: r.sn || '' };
    // 「没读全」的（没有 SN）默认不勾：勾了也提交不了，还会让用户以为点一下就完事。
    // 补上 SN 后他自己勾，或者直接点「全选」。
    it.include = !!String(it.edit.sn).trim();
  }, {
    // 用户退出了这个页面就别再往服务器打请求了
    shouldContinue: () => state.batch === mine && state.view === 'batch',
    onDone: (it, i, err) => {
      // ⚠️ 失败必须当场落到 error 上：runSerial 只负责记 item.error，
      //    不管 status。漏了这一步，这一项会永远停在 processing ——
      //    界面显示「正在读取图片…」一直转圈，而且 status!=='error' 还会
      //    把它算进「可勾选」，用户勾上再被「还没填 SN」挡回来，莫名其妙。
      if (err) { it.status = 'error'; it.stage = ''; }
      paintBatchList();
    },
  });

  if (state.batch !== mine) return;
  mine.running = false;
  mine.phase = 'review';
  renderBatch();
}

/** 只重试识别失败的那几张（网络/服务端问题重试有意义；「没读全」的得人工补） */
function batchRetryFailed() {
  const b = state.batch;
  if (!b || b.running) return;
  const failed = b.items.filter((it) => it.status === 'error');
  if (!failed.length) { toast('没有识别失败的项目', 'warn'); return; }
  for (const it of failed) { it.status = 'pending'; it.error = ''; it.stage = ''; }
  renderBatch();
  runBatchQueue(failed);
}

/* ---------- 输入框 → state（页面只是 state 的投影） ---------- */

/** 待确认清单里改品牌/型号/SN：直接写回该项的 edit */
function batchEditField(el) {
  const b = state.batch;
  if (!b || !el) return;
  const it = b.items.find((x) => x.id === el.dataset.bid);
  if (!it) return;
  it.edit[el.dataset.f] = String(el.value ?? '');
}

/** 勾选 / 取消一台 */
function batchToggleItem(el) {
  const b = state.batch;
  if (!b || !el) return;
  const it = b.items.find((x) => x.id === el.dataset.bid);
  if (!it) return;
  it.include = !!el.checked;
  paintBatchFoot();
}

/** 全选 / 全不选（识别失败的那几张永远不可选） */
function batchToggleAll() {
  const b = state.batch;
  if (!b) return;
  const selectable = b.items.filter((it) => it.status !== 'error' && it.status !== 'saved');
  const allOn = selectable.length > 0 && selectable.every((it) => it.include);
  for (const it of selectable) it.include = !allOn;
  renderBatch();
}

function batchPickCount(b) {
  return (b?.items || []).filter((it) => it.include && it.status !== 'error' && it.status !== 'saved').length;
}

/** 「批量入库」：逐条 POST /devices，一台失败不影响其余 */
async function batchSaveAll() {
  const b = state.batch;
  if (!b || b.running) return;
  const picks = b.items.filter((it) => it.include && it.status !== 'error' && it.status !== 'saved');
  if (!picks.length) { toast('还没有勾选任何一台', 'warn'); return; }
  const missing = picks.filter((it) => !String(it.edit.sn || '').trim());
  if (missing.length) { toast(`有 ${missing.length} 台还没填 SN，请先补上（照片上方那张卡里）`, 'warn'); return; }

  const cat = state.categories.find((c) => c.id === ($('#batchCat')?.value || ''));
  const tracking = collectTrackingValues('bt_', cat);
  const shared = {
    category_id: $('#batchCat')?.value || '',
    org_id: $('#batchOrg')?.value || null,
    supplier: $('#batchSupplier')?.value || null,
    status: $('#batchStatus')?.value || 'in_use',
  };
  const btn = $('#btnBatchSave');
  if (btn) { btn.disabled = true; btn.textContent = '入库中…'; }

  let ok = 0; let fail = 0; let toastedErr = false;
  for (let i = 0; i < picks.length; i++) {
    const it = picks[i];
    // 进度只写在按钮上：这一页有用户正在编辑的输入框，中途重绘会把改动冲掉
    if (btn) btn.textContent = `入库中 ${i + 1}/${picks.length}…`;
    try {
      const payload = buildDevicePayload(it.edit, it.result, shared, tracking);
      const dev = await api('/devices', { method: 'POST', body: JSON.stringify(payload) });
      it.status = 'saved';
      it.include = false;
      it.note = `已入库 ${dev.asset_no}`;
      ok++;
    } catch (e) {
      fail++;
      it.note = (e.message.includes('已存在') || e.message.includes('409'))
        ? '该 SN 已存在，没入库'
        : `入库失败：${e.message}`;
      if (!toastedErr) { toast(it.note, 'error'); toastedErr = true; }
    }
  }

  // 保存成功才记：失败的记录进记忆里，下次会把错的内容又填回来
  if (ok) rememberMobileFill({ ...shared, fields: tracking.columnValues });
  if (fail) toast(`已入库 ${ok} 台，${fail} 台没成功`, ok ? 'warn' : 'error');
  else toast(`已全部入库：${ok} 台`);

  // 收工条件：已经没有「待入库、也不是识别失败」的项了。
  // ⚠️ 不能只看「这一轮提交全都成功」—— 用户**故意没勾**的「没读全」那几张会被
  //    连同照片一起丢掉，他还得重新回相册里从头挑一遍。留在这一页他就能接着补。
  //    识别失败的也留着（页面底部有「重试 N 张」）。想走就点左上角的 ×。
  const left = b.items.filter((it) => it.status !== 'saved' && it.status !== 'error');
  if (!left.length) {
    state.batch = null;
    route('home');
    return;
  }
  renderBatch();
}

/* ---------- 视图 ---------- */

const BATCH_STATUS_TEXT = {
  pending: '等待识别', processing: '识别中…', ok: '已读出', weak: '没读全，请核对', error: '识别失败', saved: '已入库',
};

function renderBatch() {
  const b = state.batch;
  setTabbar(false);
  if (!b) { renderHome(); return; }
  if (b.phase === 'review') { renderBatchReview(b); return; }
  $('#main').innerHTML = `
    <div class="card">
      <div class="card-head"><h3>批量识别入库</h3></div>
      <p class="hint" style="margin-top:0">共 ${b.total} 张，一张一张地识别（上游识别服务限并发，一起传只会被拒）。中途可以退出，已读到的不受影响。</p>
      <div class="batch-bar"><i id="batchBarFill"></i></div>
      <div class="batch-stat" id="batchStat"></div>
      <div class="batch-list" id="batchList">${batchListHTML(b)}</div>
    </div>
    <div class="m-actionbar">
      <button class="btn ghost wide" onclick="exitBatch()">${svgIcon('x', 16)} 退出批量识别</button>
    </div>`;
  paintBatchList();
}

function batchListHTML(b) {
  return b.items.map((it, i) => `
    <div class="batch-line ${esc(it.status)}" data-bid="${esc(it.id)}">
      <span class="batch-no">${i + 1}</span>
      <span class="batch-line-txt">
        <span class="bn">${esc(it.name)}</span>
        <span class="bs">${esc(it.stage || it.error || BATCH_STATUS_TEXT[it.status] || '')}</span>
      </span>
      <span class="batch-line-ico">${it.status === 'processing' ? '<span class="spin"></span>'
    : it.status === 'error' ? svgIcon('alert', 15)
      : it.status === 'ok' || it.status === 'saved' ? svgIcon('check-circle', 15)
        : it.status === 'weak' ? svgIcon('info', 15) : ''}</span>
    </div>`).join('');
}

/** 只重画清单本身：整个 #main 重绘会把滚动位置和用户正在敲的输入框一起冲掉 */
function paintBatchList() {
  const b = state.batch;
  if (!b || b.phase !== 'recognize') return;
  const box = $('#batchList');
  if (box) box.innerHTML = batchListHTML(b);
  const fill = $('#batchBarFill');
  if (fill) fill.style.width = `${Math.round((finishedCount(b) / Math.max(1, b.total)) * 100)}%`;
  const stat = $('#batchStat');
  if (stat) stat.textContent = `已识别 ${finishedCount(b)} / ${b.total}`;
}

function renderBatchReview(b) {
  const cat = state.categories.find((c) => c.id === b.shared.category_id) || state.categories[0];
  const n = batchPickCount(b);
  const weak = b.items.filter((it) => it.status === 'weak').length;
  const bad = b.items.filter((it) => it.status === 'error').length;
  $('#main').innerHTML = `
    <div class="card">
      <div class="card-head">
        <h3>核对后一起入库</h3>
        <button type="button" class="btn xs ghost" onclick="batchToggleAll()">全选 / 全不选</button>
      </div>
      <p class="hint" style="margin:0 0 12px">
        共 ${b.total} 张：读到 ${b.items.filter((it) => it.status === 'ok' || it.status === 'weak' || it.status === 'saved').length} 张${weak ? `（其中 ${weak} 张没读全）` : ''}${bad ? ` · ${bad} 张失败` : ''}。
        照着每张上面的照片核对一遍再勾选 —— 识别只是初稿，SN 最容易看错（L/1、O/Q）。
      </p>
      <div class="batch-list" id="batchReviewList">${batchReviewListHTML(b)}</div>
    </div>

    <div class="card">
      <div class="card-head"><h3>本批统一设置</h3></div>
      <p class="hint" style="margin:0 0 10px">这一批先按同一套分类 / 组织 / 状态入库；个别不一样的，入库后在设备详情里改，或者用电脑端「批量操作 → 转移到组织 / 交接使用人」整批调整。</p>
      <div class="field"><label>设备分类</label><select id="batchCat">${state.categories.map((c) => `<option value="${c.id}" ${c.id === b.shared.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
      <div class="field"><label>所属组织</label><select id="batchOrg"><option value="">未分配</option>${state.orgs.map((o) => `<option value="${o.id}" ${o.id === b.shared.org_id ? 'selected' : ''}>${esc(o.path || o.name)}</option>`).join('')}</select></div>
      <div id="batchTracking">${trackingFieldsHTML(cat, 'bt_')}</div>
      <div class="field"><label>供应商</label><select id="batchSupplier"><option value="">— 未指定 —</option>${state.suppliers.map((s) => `<option value="${esc(s)}" ${s === b.shared.supplier ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></div>
      <div class="field"><label>状态</label><select id="batchStatus">${state.statuses.map((s) => `<option value="${s.id}" ${s.id === b.shared.status ? 'selected' : ''}>${s.label}</option>`).join('')}</select></div>
    </div>

    <div class="m-actionbar">
      <button class="btn ghost icon" onclick="exitBatch()" aria-label="放弃本批">${svgIcon('x', 18)}</button>
      ${bad ? `<button class="btn ghost" onclick="batchRetryFailed()">${svgIcon('refresh', 15)} 重试 ${bad} 张</button>` : ''}
      <button class="btn primary" id="btnBatchSave" onclick="batchSaveAll()" ${n ? '' : 'disabled'}>${svgIcon('save', 16)} <span id="batchSaveTxt">批量入库（${n} 台）</span></button>
    </div>`;
  // 换分类要重画这一批的专属字段（使用人 / 存放位置 …）
  const catSel = $('#batchCat');
  if (catSel) {
    catSel.onchange = () => {
      b.shared.category_id = catSel.value;
      const box = $('#batchTracking');
      const next = state.categories.find((c) => c.id === catSel.value);
      if (box) box.innerHTML = trackingFieldsHTML(next, 'bt_');
    };
  }
}

function batchReviewListHTML(b) {
  return b.items.map((it) => {
    const r = it.result;
    const bad = it.status === 'error';
    const saved = it.status === 'saved';
    const src = r?.image_path || r?.thumb_path || '';
    return `
    <div class="batch-item${bad ? ' bad' : ''}${saved ? ' saved' : ''}" data-bid="${esc(it.id)}">
      <label class="batch-pick">
        <input type="checkbox" class="batch-ck" data-bid="${esc(it.id)}" ${it.include && !bad && !saved ? 'checked' : ''} ${bad || saved ? 'disabled' : ''} onchange="batchToggleItem(this)">
      </label>
      <div class="batch-thumb">${src ? `<img src="${esc(src)}" alt="${esc(it.name)} 的照片" loading="lazy">` : ''}</div>
      <div class="batch-body">
        <div class="batch-name" title="${esc(it.name)}">${esc(it.name)}</div>
        ${bad ? `<div class="batch-note error">${svgIcon('alert', 13)} ${esc(it.error || '识别失败')}</div>` : `
          <div class="batch-f"><span class="bl">品牌</span><input data-f="brand" data-bid="${esc(it.id)}" value="${esc(it.edit.brand)}" placeholder="品牌" oninput="batchEditField(this)"></div>
          <div class="batch-f"><span class="bl">型号</span><input data-f="model" data-bid="${esc(it.id)}" value="${esc(it.edit.model)}" placeholder="型号" oninput="batchEditField(this)"></div>
          <div class="batch-f"><span class="bl">SN</span><input data-f="sn" data-bid="${esc(it.id)}" class="mono" value="${esc(it.edit.sn)}" placeholder="序列号" oninput="batchEditField(this)"></div>
          <div class="batch-flags">
            <span class="conf ${confClass(r?.sn_confidence)}">SN ${Math.round((Number(r?.sn_confidence) || 0) * 100)}%</span>
            ${it.status === 'weak' ? '<span class="batch-tag warn">没读全</span>' : ''}
            ${r?.duplicate?.exists ? '<span class="batch-tag warn">SN 已存在</span>' : ''}
            ${r?.rotate_angle ? `<span class="batch-tag">已转正 ${r.rotate_angle}°</span>` : ''}
            ${saved ? '<span class="batch-tag ok">已入库</span>' : ''}
          </div>
          ${it.note ? `<div class="batch-note ${saved ? 'ok' : 'error'}">${esc(it.note)}</div>` : ''}`}
      </div>
    </div>`;
  }).join('');
}

/** 勾选数变了只改按钮文案，不重绘整页（否则用户刚敲的 SN 会被冲掉） */
function paintBatchFoot() {
  const b = state.batch;
  const txt = $('#batchSaveTxt');
  const btn = $('#btnBatchSave');
  if (!b) return;
  const n = batchPickCount(b);
  if (txt) txt.textContent = `批量入库（${n} 台）`;
  if (btn) btn.disabled = !n;
}

/* ================= 扫码 ================= */

/* 扫码核对：两种码型分开，各用各自的入口与识别器。
   `formats` 是白名单**过滤器**不是候选表：一维条码和二维码混着解，候选暴增、又慢又张冠李戴。 */

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
 * 拿到识别器。**必须带 kind**：两个入口各一个实例。
 * 先同步建「不限格式」的顶着（不传 formats 就是全都要，几乎不会失败），
 * 再异步求交集收窄；交集为空就维持全开。顺序不能反，否则会拿不到识别器。
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

/** 丢掉缓存的识别器，下次 getDetector() 重新协商（换摄像头/换权限/自动化测试换桩时用） */
function resetDetector() {
  barcodeDetectorByKind.clear();
  detectorFormatsByKind.clear();
  detectorTriedKinds.clear();
}

/* 取景框 → 视频帧的几何反推。
   `<video>` 是 object-fit:cover，竖屏时画面横向被裁掉大半（1920 宽的帧只显示约 28%），
   所以屏幕上那个框不能直接当像素坐标用，必须先换算回帧内矩形。 */

/**
 * 从取景框（屏幕 CSS 矩形）反推它在视频帧里的源矩形。
 * cover：k = max(dispW / vw, dispH / vh)，可见区居中，左上角 = ((vw - vw_vis)/2, (vh - vh_vis)/2)。
 * ⚠️ 返回值必须夹在帧内（框可能比视频还宽），否则 drawImage 会取到帧外的空白。
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
 * 把一条扁带在**纵向上撑到够高**：裁太扁会切坏码（Code128 长宽比约 10:1，
 * 而扁框换算回帧内可能只有 3.4:1）。解码只要一行穿过所有条，但那一行要穿过完整条高。
 * 撑到至少 0.25×帧宽；只撑高、不改横向裁法，每根条占多少像素一分不损失。
 */
function growBandTall(box, vw, vh) {
  const minH = Math.min(vh, Math.max(box.h, vw * 0.25));
  if (minH <= box.h) return box;
  const midY = box.y + box.h / 2;
  const y = Math.max(0, Math.min(vh - minH, midY - minH / 2));
  return { x: box.x, y, w: box.w, h: minH, k: box.k };
}

/**
 * 取当前取景框在屏幕上的矩形（相对可视区左上角；框永远居中）。
 * 往里收 8%：框本身有 3px 边框、外面还有一圈遮罩，用户照着框内沿摆，收一点正好当编码区留白。
 * 量不到框（测试桩没有 offsetWidth）就退回「屏幕短边 82% × 13%」的默认扁框 ——
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
 * 判定阀值是**每根条多少像素**而不是整幅多大：8~12 密尔的标签，一根条约占码宽 1.2%，
 * 要到 2px 以上才稳 → 解码器输入里条码至少 ~170px、理想 250px。
 * 这就是「扁带放大」那趟 upscale 取 8 的依据。
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
  // ⚠️ 服务端兜底要 POST 整张灰度图，`/api/scan` 有 4MB 上限 —— 自己先卡住，
  //    否则表现是「服务端明明有解码器却一直没命中」。
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
 * 解码的「切法」轮转表，按码型分。不猜用户把码放在哪，按码型挑最省像素的切法轮着试：
 *   二维码是方的 → 先中心正方形（同分辨率下每格占的像素最多）
 *   一维条码扁而长 → 先贴着取景框切那一扁带（用户已经把码摆进框里了）
 * ⚠️ 这个顺序是实测调出来的，别随手挪：整帧那趟会把 1920 压到 900，贴纸上的小条码
 *    只剩 50px（Code128 一根条 1~2px，必挂）；扁带那趟能给它 479~1239px。
 *    旋转趟一律排最后且关插值 —— 双线性插值会把黑白台阶抹成灰阶，一维解码器要的陡沿就没了。
 */
const SCAN_STEPS = {
  qr: [
    { label: '中心方形', mode: 'square', upscale: 1 },
    { label: '中心方形放大', mode: 'square', upscale: 1.6 },
    { label: '整帧', mode: 'full', upscale: 1 },
    { label: '整帧放大', mode: 'full', upscale: 2 },
    // 兜底两趟：个别设备对「横版帧」的二维码水土不服，多两个旋转失败面更小
    { label: '整帧转 90°', mode: 'full', upscale: 1, rot: 90 },
    { label: '整帧转 270°', mode: 'full', upscale: 1, rot: 270 },
  ],
  // 条码可能躺着、立着、甚至倒着（用户不用把手机横过来，转正是程序的事），
  // 所以多试几个角度：扁带 → 扁带放大 → 整帧 → 整帧放大 → 转 90/270 → 翻 180。
  bar: [
    { label: '取景框扁带', mode: 'band', upscale: 1 },
    { label: '取景框扁带放大', mode: 'band', upscale: 8 },
    { label: '整帧', mode: 'full', upscale: 1, rot: 0 },
    { label: '整帧放大', mode: 'full', upscale: 2, rot: 0 },
    // 旋转趟一律 smooth:false：最近邻至少保住「黑是黑、白是白」，插值会把 1~2px 的条抹平
    { label: '整帧转 90°', mode: 'full', upscale: 1, rot: 90, smooth: false },
    { label: '整帧转 270°', mode: 'full', upscale: 1, rot: 270, smooth: false },
    { label: '整帧翻 180°', mode: 'full', upscale: 1, rot: 180, smooth: false },
  ],
};

const stepsOf = (kind) => SCAN_STEPS[SCAN_KINDS[kind] ? kind : 'qr'];

/** 送进识别器的基准宽度。太小解不出码，太大又拖慢每一次解码。 */
const BASE_OUT_W = 900;

/** 一维条码专用：目标宽度、放大上限、输出上限。
 *  判据是「每根条多少像素」（一根条约占码宽 1.2%，要 ≥2px → 码 ≥170px、理想 250px）。
 *  上限 3000 是「再大只费时间」的分界（Code128 逐行扫描，成本随宽度线性涨）。 */
const BAR_TARGET_W = 2500;
const BAR_MAX_SCALE = 8;
const BAR_MAX_OUT_W = 3000;

/** 扁带这趟送出去的最大像素数。服务端 `/api/scan` 上限 4MB，灰度 1 字节/像素 → 按 95% 卡住 */
const BAND_PAYLOAD_MAX = 3800000;

/** 当前走到第几步（给界面显示用） */
function scanStepLabel(attempt, kind) {
  const steps = stepsOf(kind);
  return steps[attempt % steps.length].label;
}

function scanRegion(attempt, videoEl, kind) {
  // 允许直接传 <video>：快门那条路径手上就有，再回 DOM 找一次在测试桩里容易拿到 null
  const video = videoEl || $('#cameraVideo');
  if (!video || !video.videoWidth) return null;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const steps = stepsOf(kind || state.scanKind || 'qr');
  const step = steps[attempt % steps.length];
  try {
    // square：中心最大正方形（二维码） band：取景框扁带（条码） full：整帧（兜底）
    let box;
    let outW = 0;
    let outH = 0;
    // ⚠️ 扁带退回整帧时**必须**把 upscale 抹掉：8 倍是按「扁带只有一两百像素宽」定的，
    //    套到 1920 宽的整帧上会造出 9000 万像素的 canvas，浏览器直接卡死/OOM。
    let effUpscale = step.upscale;
    if (step.mode === 'square') {
      const side = Math.min(vw, vh);
      box = { x: (vw - side) / 2, y: (vh - side) / 2, w: side, h: side };
    } else if (step.mode === 'band') {
      // 走「取景框 → 帧」的逆映射（见 frameRectOf）；拿不到就退回整帧但 upscale 归 1
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
    // ⚠️ 兜底硬上限（对齐服务端 4000）：scale 是浮动的，「箱小 + 倍数大」一凑就是 9000 万像素，
    //    宁可少放大一点，也不能把用户的浏览器搞崩。
    const MAX_CANVAS_SIDE = 4000;
    const rawW = box.w * scale;
    const rawH = box.h * scale;
    const cap = Math.min(1, MAX_CANVAS_SIDE / Math.max(rawW, rawH, 1));
    const scaleCapped = scale * cap;
    // rot：把裁出来的这块转正再送识别器。90/270 会让长宽互换。
    const rot = step.rot || 0;
    const swap = rot === 90 || rot === 270;
    // smooth:false 是一维条码的命根子：插值会把 1~2px 的条抹成灰阶过渡，最近邻反而认得出来
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

    // ⚠️ drawImage 的目标宽高用**未旋转**的 dw/dh（旋转是在 ctx 上做的，写成互换后
    //    的尺寸等于再做一次不等比缩放，条码被拉成长条直接毁码）；**画布**才用互换后的尺寸。
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

    // ⚠️⚠️ 这四行是整套旋转逻辑的**全部作用点**：忘了在 ctx 上真的设置变换，
    //    结果就是「画布是横的、画面还躺着」——只断言尺寸的测试照样全绿，所以测试同时钉尺寸与变换。
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
 * 扫码核对首页 —— 两个专用入口（一个只扫二维码、一个只扫条码），
 * 对准后**按圆钮才解码**，不做「自动连续扫」。
 */
function renderScan() {
  setTabbar(true);
  const secure = window.isSecureContext === true || location.hostname === 'localhost';
  // ⚠️ 两个都要问，不能写成 getDetector('qr') || getDetector('bar')：短路会让后者永远不被
  //    构造，只支持一维条码的机器会被误判成「完全不能扫码」，把能用的入口也藏掉。
  //    二维码入口永远可用（本机没识别器就走服务端解码）。
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
 * 扫到内容后的分流：网址码 → 直接开设备详情；资产编号 / SN → 先在本地最近设备里匹配，
 * 命中就打开，没命中才问服务端（少一次往返 = 「立刻打开」和「转圈两秒」的差别）。
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
    // 识别器没有 / 没解出来 → 服务端兜底（相册里翻拍屏幕的照片尤其吃这一手）
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
window.textAxisOf = textAxisOf;
window.retryAngles = retryAngles;
window.usableResult = usableResult;
window.rotateBlob = rotateBlob;
window.grayOfBlob = grayOfBlob;
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
// 便于自动化测试：「补充信息」的记忆功能（纯逻辑，直接断言读写）
window.mobileMemory = mobileMemory;
window.rememberMobileFill = rememberMobileFill;
window.clearMobileMemory = clearMobileMemory;
window.clearMobileMemoryConfirm = clearMobileMemoryConfirm;
window.mobileFieldValue = mobileFieldValue;
window.mobileFieldDefault = mobileFieldDefault;
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
/* 批量识别入库 —— 这些函数在 HTML 里以 onclick / oninput 出现，
   不挂到 window 上就是「点了没反应、控制台还干净」的那种静默失效。 */
window.galleryForBatch = galleryForBatch;
window.startBatch = startBatch;
window.exitBatch = exitBatch;
window.renderBatch = renderBatch;
window.batchToggleAll = batchToggleAll;
window.batchRetryFailed = batchRetryFailed;
window.batchEditField = batchEditField;
window.batchToggleItem = batchToggleItem;
window.batchSaveAll = batchSaveAll;
window.defaultBatchShared = defaultBatchShared;
window.buildDevicePayload = buildDevicePayload;
window.collectTrackingValues = collectTrackingValues;
window.trackingFieldsHTML = trackingFieldsHTML;
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
