/**
 * 图表几何冒烟：环形图「穿模」回归测试
 *
 * 背景：设备状态分布的环曾经用写死的 r=74 + stroke-width=22，而画布是 180。
 * 外描边半径 = 74 + 22/2 = 85 = 画布半宽 90 减 5px —— 环的笔画紧贴甚至压出色框，
 * 外层容器一变成 150px（窄屏媒体查询）就被切掉一圈，也就是用户看到的「穿模」。
 *
 * 这个测试不依赖浏览器，直接调渲染函数并解析它吐出来的 SVG，
 * 按「外沿必须严格小于等于画布半宽」来判定。任何一边越界都算失败。
 *
 * 运行前需先启动服务：node tests/charts.js
 */
const BASE = process.env.BASE || 'http://127.0.0.1:8080';
const failures = [];
function assert(cond, msg) {
  if (!cond) { failures.push(msg); console.log('  \x1b[31m✘\x1b[0m ' + msg); }
  else console.log('  \x1b[32m✔\x1b[0m ' + msg);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- 极简 DOM 桩（与 render-smoke.js 同源，够这两个文件加载即可） ---------- */
class FakeEl {
  constructor() {
    this._innerHTML = ''; this.textContent = ''; this.value = '';
    this.hidden = false; this.style = {}; this.dataset = {}; this.className = '';
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
  get lastElementChild() { if (!this._last) this._last = new FakeEl(); return this._last; }
  get firstElementChild() { if (!this._first) this._first = new FakeEl(); return this._first; }
  get children() { return []; }
  get textContent() { return this._text ?? ''; }
  set textContent(v) { this._text = String(v); }
  querySelector() { return new FakeEl(); }
  querySelectorAll() { return []; }
  _appended = [];
  appendChild(el) { this._appended.push(el); }
  insertBefore(el) { this._appended.push(el); }
  insertAdjacentHTML() {} setAttribute() {} getAttribute() { return null; }
  addEventListener() {} removeEventListener() {} click() {} focus() {} remove() {}
}

const els = new Map();
const qs = (sel) => { if (!els.has(sel)) els.set(sel, new FakeEl()); return els.get(sel); };
globalThis.document = { querySelector: qs, querySelectorAll: () => [], createElement: () => new FakeEl() };
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

/* ---------- 带会话 Cookie 的 fetch ---------- */
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

console.log('\n=== 图表几何冒烟（环形图穿模回归）(' + BASE + ') ===\n');

/* ---------- 解析 SVG ---------- */

/**
 * 从一段 SVG 字符串里抽出所有 circle 的几何参数，并判定是否越界。
 * 判定依据是几何本身，不是像素，所以跟设备/浏览器无关。
 */
function inspectDonut(svg, label) {
  const vb = /viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/.exec(svg);
  assert(!!vb, `${label}：SVG 带 viewBox`);
  if (!vb) return;
  const W = parseFloat(vb[1]);
  const H = parseFloat(vb[2]);

  const circles = [...svg.matchAll(/<circle\b([^>]*)\/?>/g)].map((m) => m[1]);
  assert(circles.length > 0, `${label}：环至少有一段`);
  if (!circles.length) return null;

  const get = (attrs, n) => {
    const m = new RegExp(`\\b${n}="([^"]*)"`).exec(attrs);
    return m ? parseFloat(m[1]) : null;
  };

  // 同一张图里每段的 r / 圆心必须完全一致，否则就是逐段写死的痕迹
  const radii = new Set(circles.map((a) => get(a, 'r')));
  const widths = new Set(circles.map((a) => get(a, 'stroke-width')));
  const cxs = new Set(circles.map((a) => get(a, 'cx')));
  const cys = new Set(circles.map((a) => get(a, 'cy')));
  assert(radii.size === 1, `${label}：所有段共用同一个 r（${radii.size} 种）`);
  assert(widths.size === 1, `${label}：所有段共用同一个 stroke-width（${widths.size} 种）`);
  assert(cxs.size === 1 && cys.size === 1, `${label}：所有段同心`);

  const r = [...radii][0];
  const sw = [...widths][0];
  const cx = [...cxs][0];
  const cy = [...cys][0];
  assert(r !== null && sw !== null && cx !== null && cy !== null, `${label}：r / stroke-width / 圆心都写全了`);
  if (r === null || sw === null || cx === null || cy === null) return null;

  // 半径必须是从画布推出来的：(size - stroke) / 2
  assert(Math.abs(r - (W - sw) / 2) < 0.01,
    `${label}：r = (size - stroke) / 2（${r} vs ${(W - sw) / 2}）`);
  assert(Math.abs(cx - W / 2) < 0.01 && Math.abs(cy - H / 2) < 0.01,
    `${label}：圆心在正中（${cx},${cy}）`);

  // ★ 核心断言：外描边沿 = r + stroke/2 必须落在半宽之内。
  // 旧代码 r=74、stroke=22、画布 180 → 外沿 85，半宽 90，只剩 5px 余量，
  // 容器一缩到 150px 就被切；现在外沿恒等于半宽，且左右上下各留不到 0.5px 的取整误差。
  const outer = r + sw / 2;
  const half = Math.min(W, H) / 2;
  const clearance = half - outer;
  assert(clearance > -0.5,
    `${label}：环外沿不越界（外沿 ${outer.toFixed(2)} / 半宽 ${half} / 余量 ${clearance.toFixed(2)}px）`);
  // 余量也不能太大，否则环会缩在框中间显得没画满
  assert(clearance < 1,
    `${label}：环画满画布（余量 ${clearance.toFixed(2)}px < 1px）`);

  return { W, H, r, sw, clearance, count: circles.length };
}

/* ---------- 1. 管理端 donutSVG ---------- */
let adminErr = null;
try {
  await import('file://' + process.cwd().replace(/\\/g, '/') + '/public/assets/admin.js');
  await wait(600);
  assert(typeof globalThis.donutSVG === 'function', '管理端 donutSVG 已暴露');
} catch (e) { adminErr = e; }
await wait(400);

if (adminErr) {
  console.log('  \x1b[31m✘\x1b[0m admin.js 加载失败：' + adminErr.message);
  failures.push('admin-load');
} else {
  const items = [
    { name: '在用', value: 23, color: '#2563eb' },
    { name: '库存', value: 12, color: '#0ea5e9' },
    { name: '维修中', value: 4, color: '#f59e0b' },
    { name: '已报废', value: 2, color: '#ef4444' },
  ];
  const svg = globalThis.donutSVG(items);
  inspectDonut(svg, '管理端环形图（状态分布）');

  // 默认尺寸必须是 168（跟 .donut 容器一致），不再是「容器 168 / SVG 180」那种错配
  assert(/width="168"\s+height="168"/.test(svg), '管理端环默认 168×168，与容器同尺寸');
  assert(/viewBox="0 0 168 168"/.test(svg), '管理端环 viewBox 与尺寸一致');
  assert(!svg.includes('donut-center'), '圆心数字已改为 SVG <text>，不再用 DOM 浮层');
  assert(/<text class="dn-num"/.test(svg) && /<text class="dn-cap"/.test(svg), '圆心有数字 + 单位两行 text');

  // 数字要落在环的空心里，不能被环压住：数字高度得小于内圈直径
  const inner = 168 - 2 * 20;            // 168 画布 - 两侧 20px 笔画
  assert(inner >= 100, `内圈空心足够放数字（直径 ${inner}px）`);
  assert(svg.includes('>41</text>'), '圆心数字是状态合计 41');
  assert(svg.includes('>台设备</text>'), '圆心带「台设备」说明');

  // 各段加起来正好一圈：dasharray 的实线段之和 ≈ 周长
  const C = 2 * Math.PI * ((168 - 20) / 2);
  const dashes = [...svg.matchAll(/stroke-dasharray="([\d.]+) /g)].map((m) => parseFloat(m[1]));
  const sum = dashes.reduce((a, b) => a + b, 0);
  assert(Math.abs(sum - C) < 1, `各段弧长合计 = 周长（${sum.toFixed(1)} ≈ ${C.toFixed(1)}）`);

  // 空数据不能崩，也不能只留一片空白
  const emptySvg = globalThis.donutSVG([]);
  assert(emptySvg.includes('<circle'), '没有状态数据时仍画出底环');
  assert(emptySvg.includes('>0</text>'), '空数据时中心显示 0');

  // 自定义尺寸也要成立（窄屏会用到 150）
  const small = globalThis.donutSVG(items, { size: 150, stroke: 18 });
  const info = inspectDonut(small, '管理端环形图（150 窄屏）');
  if (info) assert(/width="150"/.test(small), '自定义 size 会写进 SVG 宽度');
}

/* ---------- 2. 手机端 m.js 仍须可加载 ---------- */
/*
 * 注意（2026-09-19 变更）：手机端的环形图**已被有意移除**。
 *
 * 原委：移动端首屏曾经整页照搬管理端仪表盘（6 张 KPI 卡 + 状态分布环
 * + 分类柱状图 + 品牌条），一屏放不下、要翻三屏才到底；而这一页的名字是
 * 「资产录入」，用户打开是为了拍照录设备，撞上一整页报表，反馈「太繁琐」。
 * 精简后首屏只剩「一行概览数字 + 拍照识别入库」，环 / 柱 / 品牌条全部下线。
 *
 * 所以这里**不再断言 donutChart 存在** —— 那个函数已随环一起删掉了，
 * 再断言它存在等于把「已经砍掉的报表又要求装回来」。但 m.js 依然要能加载，
 * 所以保留加载检查（它能抓到语法错、以及删除孤儿代码时漏改的引用）。
 *
 * 环形图的几何约束仍然适用于管理端（上一节）—— 将来若移动端重新引入任何
 * 图形，照 103 行那个 inspectDonut 的「外沿 ≤ 画布半宽」口径加断言即可。
 */
let mobileErr = null;
try {
  await import('file://' + process.cwd().replace(/\\/g, '/') + '/public/assets/m.js');
  await wait(900);
  assert(typeof globalThis.renderDashboard === 'function', '手机端 m.js 可加载且 renderDashboard 已暴露');
} catch (e) { mobileErr = e; }

if (mobileErr) {
  console.log('  \x1b[31m✘\x1b[0m m.js 加载失败：' + mobileErr.message);
  failures.push('mobile-load');
}

/* ---------- 结果 ---------- */
if (failures.length) {
  console.log('\n=== 图表几何：失败 ' + failures.length + ' 项 ===\n');
  process.exit(1);
}
console.log('\n=== 图表几何：全部通过 ===\n');
