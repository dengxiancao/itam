/**
 * Excel 对接层
 *  - 导出设备台账（含下拉字典/字段说明/组织/分类等辅助表）
 *  - 生成空白导入模板
 *  - 解析并导入 Excel（按表头智能匹配列、按名称匹配组织与分类、自动建缺失项）
 */
import { buildXlsx, parseXlsx, colLetter } from './lib/xlsx.js';
import {
  all, get, scalar, tx, insert, deviceLog, nextAssetNo, getSetting, setSetting, UPLOAD_DIR,
} from './db.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  deviceList, categoryList, orgFlatWithPath, DEVICE_STATUS, categoryCreate, orgCreate, deviceCreate, deviceUpdate,
} from './services.js';
import { nowISO, uuid, str, normalizeDate, compactAlnum, buildTree } from './util.js';

/* ================================================================== *
 * 1. 列定义
 * ================================================================== */

export const STATUS_LABEL = Object.fromEntries(DEVICE_STATUS.map((s) => [s.id, s.label]));
export const STATUS_ID = Object.fromEntries(DEVICE_STATUS.map((s) => [s.label, s.id]));

/** 基础列（与设备表字段一一对应） */
export const BASE_COLUMNS = [
  { key: 'asset_no', header: '资产编号', width: 16, aliases: ['资产编号', '资产编码', '设备编号', '编号', '资产号', 'assetno', '资产tag'] },
  { key: 'category_name', header: '设备分类', width: 14, aliases: ['设备分类', '分类', '资产类别', '设备类型', '类型', 'category'] },
  { key: 'brand', header: '品牌', width: 12, aliases: ['品牌', '厂商', '生产厂商', 'brand', '制造商'] },
  { key: 'model', header: '型号', width: 22, aliases: ['型号', '规格型号', 'model', '设备型号', '产品型号'] },
  { key: 'sn', header: 'SN 序列号', width: 22, aliases: ['sn序列号', 'sn', '序列号', 'sn号', 'serialnumber', 'servicetag', '机身序列号'] },
  { key: 'org_path', header: '所属组织', width: 24, aliases: ['所属组织', '组织', '部门', '使用部门', '所属部门', 'org', 'organization', '归属部门'] },
  { key: 'status_label', header: '状态', width: 10, aliases: ['状态', '设备状态', '使用状态', 'status'] },
  { key: 'owner_name', header: '使用人', width: 12, aliases: ['使用人', '领用人', '责任人', '负责人', 'owner', '使用者'] },
  { key: 'owner_employee_no', header: '使用人工号', width: 14, aliases: ['使用人工号', '工号', '员工编号', 'employeeno'] },
  { key: 'owner_phone', header: '使用人电话', width: 15, aliases: ['使用人电话', '联系电话', '手机号', '电话', 'phone'] },
  { key: 'location', header: '存放位置', width: 18, aliases: ['存放位置', '位置', '地点', '机房位置', 'location', '物理位置'] },
  { key: 'ip_address', header: 'IP 地址', width: 15, aliases: ['ip地址', 'ip', 'ipaddress', '管理ip'] },
  { key: 'mac_address', header: 'MAC 地址', width: 18, aliases: ['mac地址', 'mac', 'macaddress'] },
  { key: 'os_name', header: '操作系统', width: 16, aliases: ['操作系统', 'os', '系统', 'osname'] },
  { key: 'cpu', header: 'CPU', width: 20, aliases: ['cpu', '处理器', 'cpu型号'] },
  { key: 'memory', header: '内存', width: 12, aliases: ['内存', 'memory', '内存容量'] },
  { key: 'disk', header: '硬盘', width: 16, aliases: ['硬盘', 'disk', '存储', '硬盘容量'] },
  { key: 'screen_size', header: '屏幕尺寸', width: 12, aliases: ['屏幕尺寸', '尺寸', 'screensize', '显示器尺寸'] },
  { key: 'purchase_date', header: '采购日期', width: 14, aliases: ['采购日期', '购买日期', '购入日期', 'purchasedate', '启用日期'], type: 'date' },
  { key: 'warranty_until', header: '保修到期', width: 14, aliases: ['保修到期', '保修截止', '质保到期', 'warranty', '保修期至'], type: 'date' },
  { key: 'purchase_price', header: '采购金额', width: 13, aliases: ['采购金额', '金额', '价格', '单价', 'purchaseprice', '资产原值'], type: 'money' },
  { key: 'supplier', header: '供应商', width: 18, aliases: ['供应商', '供货商', 'supplier', '厂商名称'] },
  { key: 'contract_no', header: '合同号', width: 16, aliases: ['合同号', '合同编号', 'contractno'] },
  { key: 'condition_grade', header: '成色', width: 8, aliases: ['成色', '新旧程度', '等级', 'condition'] },
  { key: 'remark', header: '备注', width: 26, aliases: ['备注', '说明', 'remark', 'note'] },
];

export const STATUS_LABELS_ORDER = DEVICE_STATUS.map((s) => s.label);

const BASE_BY_KEY = new Map(BASE_COLUMNS.map((c) => [c.key, c]));

/**
 * 通用列：任何设备都会有，导出时一律保留。
 * 关键点是**硬件规格列不在这里**——那些由各分类的「专属字段」决定。
 */
export const CORE_KEYS = [
  'asset_no', 'category_name', 'brand', 'model', 'sn', 'org_path', 'status_label',
  'owner_name', 'owner_employee_no', 'owner_phone', 'location',
  'purchase_date', 'warranty_until', 'purchase_price', 'supplier', 'contract_no',
  'condition_grade', 'remark',
];

/** 硬件规格列：显示器不该出现 CPU/内存/硬盘，主机不该出现屏幕尺寸——按分类专属字段决定 */
export const CONTEXTUAL_KEYS = ['ip_address', 'mac_address', 'os_name', 'cpu', 'memory', 'disk', 'screen_size'];

function customColumn(f, catName = '') {
  return {
    key: `x_${f.key}`,
    header: f.label || f.key,
    width: 16,
    aliases: [f.label || f.key, catName ? `${catName}${f.label || f.key}` : '', f.key].filter(Boolean),
    extraKey: f.key,
  };
}

function extraColumns() {
  const cols = [];
  const seen = new Set(BASE_COLUMNS.map((c) => c.key));
  for (const cat of categoryList()) {
    for (const f of cat.tracking_fields || []) {
      const key = `x_${f.key}`;
      // 专属字段若指向设备真实列（如 cpu / screen_size），值已由基础列承载，
      // 再生成一列 x_cpu 只会得到一整列空白，所以跳过。
      if (seen.has(key) || BASE_BY_KEY.has(f.key)) continue;
      seen.add(key);
      cols.push(customColumn(f, cat.name));
    }
  }
  return cols;
}

export function allColumns({ withExtra = true } = {}) {
  return withExtra ? [...BASE_COLUMNS, ...extraColumns()] : [...BASE_COLUMNS];
}

/**
 * 某个设备分类该导出哪些列 —— 这是「分类分表」的核心：
 *   通用列（一定有） + 该分类专属字段里映射到真实列的硬件列 + 该分类自己的自定义列。
 * 显示器只配了「屏幕尺寸/分辨率/接口类型」，导出的就只有这几样，
 * 不会把 CPU、内存、硬盘、打印类型、IMEI 这些别的分类的字段一起带出来。
 */
export function categoryColumns(cat) {
  const fields = (cat?.tracking_fields || []).filter((f) => f && f.key);
  const keys = new Set(fields.map((f) => f.key));
  const core = new Set(CORE_KEYS);

  const base = BASE_COLUMNS.filter((c) => core.has(c.key) || keys.has(c.key));
  const custom = fields.filter((f) => !BASE_BY_KEY.has(f.key)).map((f) => customColumn(f, cat?.name || ''));
  return [...base, ...custom];
}

/** 分类名 -> 列集合；查不到分类时退回全列，保证永远能导出 */
export function columnsOfCategory(categoryId) {
  const cat = categoryList().find((c) => c.id === categoryId);
  return cat ? categoryColumns(cat) : allColumns();
}

/**
 * 按分类名取列集合。
 * 命中真实分类 → 用该分类的字段配置；
 * 命中不了（例如「未分类」这种混装页）→ 通用列 + 该页真正有值的扩展列，不再硬塞一堆空列。
 */
export function sheetColumnsFor(categoryName, rows = []) {
  const cat = categoryList().find((c) => c.name === categoryName);
  if (cat) return categoryColumns(cat);

  const core = CORE_KEYS.map((k) => BASE_BY_KEY.get(k)).filter(Boolean);
  const contextual = BASE_COLUMNS.filter((c) => CONTEXTUAL_KEYS.includes(c.key));
  const pool = [...contextual, ...extraColumns()];
  const hasValue = (key) => rows.some((r) => r && r[key] !== '' && r[key] !== null && r[key] !== undefined);
  return [...core, ...pool.filter((c) => hasValue(c.key))];
}

/* ================================================================== *
 * 2. 行 -> 导出对象
 * ================================================================== */

function rowToExport(dev) {
  return {
    asset_no: dev.asset_no,
    category_name: dev.category_name || '',
    brand: dev.brand || '',
    model: dev.model || '',
    sn: dev.sn || '',
    org_path: dev.org_path || '',
    status_label: STATUS_LABEL[dev.status] || dev.status,
    owner_name: dev.owner_name || '',
    owner_employee_no: dev.owner_employee_no || '',
    owner_phone: dev.owner_phone || '',
    location: dev.location || '',
    ip_address: dev.ip_address || '',
    mac_address: dev.mac_address || '',
    os_name: dev.os_name || '',
    cpu: dev.cpu || '',
    memory: dev.memory || '',
    disk: dev.disk || '',
    screen_size: dev.screen_size || '',
    purchase_date: dev.purchase_date || '',
    warranty_until: dev.warranty_until || '',
    purchase_price: dev.purchase_price ?? '',
    supplier: dev.supplier || '',
    contract_no: dev.contract_no || '',
    condition_grade: dev.condition_grade || '',
    remark: dev.remark || '',
    // 照片：三个路径原样带出来，由上层决定是拼成 URL 还是读成图片字节
    photo_path: dev.photo_path || '',
    photo_original_path: dev.photo_original_path || '',
    photo_thumb_path: dev.photo_thumb_path || '',
    ...Object.fromEntries(Object.entries(dev.extra || {}).map(([k, v]) => [`x_${k}`, v ?? ''])),
  };
}

/* ================================================================== *
 * 2.5 照片：URL 拼接与读取
 * ================================================================== */

/**
 * 照片要能被子表格软件打开，必须带实时数据 token（图片默认要登录）。
 * 所以导出的照片链接都是 `${base}${path}?token=${token}`。
 */
export function photoUrl(baseUrl, photoPath) {
  if (!photoPath) return '';
  const token = liveToken();
  return `${baseUrl}${photoPath}${photoPath.includes('?') ? '&' : '?'}token=${token}`;
}

/** 把 /uploads/xxx 还原成磁盘路径；挡掉目录穿越 */
function photoAbs(photoPath) {
  const rel = String(photoPath || '').replace(/^\/uploads\//, '').replace(/\\/g, '/');
  if (!rel || rel.includes('..')) return null;
  const abs = path.join(UPLOAD_DIR, rel);
  if (!abs.startsWith(UPLOAD_DIR)) return null;
  return abs;
}

/**
 * 读一张用于嵌进 Excel 的图片。
 * 优先用缩略图（几百 KB 的文件里塞几十张原图会爆），
 * 没有缩略图时退回压缩图，但超过 maxBytes 就不嵌了——宁可不放图，也别把表格撑到几十兆。
 */
export function readPhotoBytes(photoPath, thumbPath, maxBytes = 400 * 1024) {
  for (const p of [thumbPath, photoPath]) {
    const abs = photoAbs(p);
    if (!abs || !fs.existsSync(abs)) continue;
    try {
      const stat = fs.statSync(abs);
      if (!stat.isFile() || stat.size > maxBytes) continue;
      return fs.readFileSync(abs);
    } catch { /* 换下一个 */ }
  }
  return null;
}

/**
 * 导出的照片相关列（追加在最后，避免打乱用户已经配好的实时表格列顺序）。
 *
 * 只有真的有「独立原图」时才给「原图链接」列 —— 否则它会和「照片链接」一模一样，
 * 看上去就像坏了两列（早期录入的设备只有一张压缩图，就是这种情况）。
 */
export function photoColumns({ embed = false, hasOriginal = false } = {}) {
  const cols = [];
  if (embed) {
    cols.push({ header: '照片', key: 'photo_bytes', width: 15, type: 'image', imageWidth: 88, imageHeight: 62 });
  }
  cols.push({ header: '照片链接', key: 'photo_url', width: 22, link: true });
  if (hasOriginal) cols.push({ header: '原图链接', key: 'original_url', width: 22, link: true });
  return cols;
}

/** 给一批导出行走加上照片列的值 */
export function attachPhotoUrls(rows, baseUrl, { embed = false } = {}) {
  const settings = photoSettingsSafe();
  return rows.map((r) => {
    // 只有当原图确实与识别图不是同一个文件时，才单独给一条「原图链接」
    const distinctOriginal = r.photo_original_path && r.photo_original_path !== r.photo_path
      ? r.photo_original_path
      : '';
    const out = {
      ...r,
      photo_url: photoUrl(baseUrl, r.photo_path || r.photo_original_path),
      original_url: distinctOriginal ? photoUrl(baseUrl, distinctOriginal) : '',
    };
    if (embed && settings.embed_in_excel) {
      out.photo_bytes = readPhotoBytes(r.photo_path, r.photo_thumb_path);
    }
    return out;
  });
}

/** 这批数据里有没有人真的存了独立原图（决定要不要出「原图链接」列） */
export function hasDistinctOriginal(rows) {
  return rows.some((r) => r.original_url);
}

/** 避免 excel.js 与 services.js 循环依赖，这里直接读设置表 */
function photoSettingsSafe() {
  const s = getSetting('photo', {}) || {};
  return { embed_in_excel: s.embed_in_excel !== false };
}

/* ================================================================== *
 * 3. 导出
 * ================================================================== */

/** 分批取回所有满足条件的设备行（导出与实时接口共用） */
export function collectRows(query = {}, limit = 50000) {
  const data = [];
  let page = 1;
  const pageSize = 1000;
  for (;;) {
    const res = deviceList({ ...query, page, page_size: pageSize, sort: query.sort || 'asset_no', order: query.order || 'asc' });
    data.push(...res.items.map(rowToExport));
    if (page >= res.pages || data.length >= limit) break;
    page++;
  }
  return data;
}

/** Excel 工作表名限制：31 字符、不能含 []:*?/\ ，且不能重名 */
function safeSheetNames(names) {
  const used = new Set();
  return names.map((raw) => {
    let n = String(raw || '未分类').replace(/[\[\]:*?/\\]/g, '_').slice(0, 31) || '未分类';
    let candidate = n;
    let i = 2;
    while (used.has(candidate.toLowerCase())) {
      const suffix = `(${i++})`;
      candidate = n.slice(0, 31 - suffix.length) + suffix;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

/**
 * 导出设备台账
 * @param {object} query  与设备列表相同的筛选条件
 * @param {object} opts
 *   withHelp  是否附「字段说明/分类/组织」等辅助页
 *   split     true = 按设备分类拆成多个工作表；false = 全部放一张「设备台账」
 *   limit     最多导出多少行
 *   baseUrl   拼接照片链接用的地址前缀（不传则链接留空）
 *   embedPhotos 是否把缩略图嵌进 Excel（默认 true，可在系统设置里关）
 */
export function exportDevices(query = {}, {
  withHelp = true, limit = 50000, split = false, baseUrl = '', embedPhotos = true,
} = {}) {
  const raw = collectRows(query, limit);
  const embed = embedPhotos && photoSettingsSafe().embed_in_excel;
  const data = baseUrl ? attachPhotoUrls(raw, baseUrl, { embed }) : raw;

  const toCols = (columns) => columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width || 16,
    type: c.type || (c.key === 'purchase_price' ? 'money' : 'text'),
    ...(c.imageWidth ? { imageWidth: c.imageWidth, imageHeight: c.imageHeight } : {}),
  }));

  // 照片列固定追加在最后，用户已配好的实时表格列顺序不受影响
  const anyOriginal = hasDistinctOriginal(data);
  const photoCols = baseUrl ? photoColumns({ embed, hasOriginal: anyOriginal }) : [];
  const withPhotoCols = (list) => (photoCols.length ? [...list, ...toCols(photoCols)] : list);
  const cols = withPhotoCols(toCols(allColumns()));

  const stamp = new Date().toLocaleString('zh-CN');
  let sheets;

  if (split) {
    // ---- 按设备分类拆表：每个工作表只带本分类自己的字段 ----
    const byCat = new Map();
    for (const r of data) {
      const k = r.category_name || '未分类';
      if (!byCat.has(k)) byCat.set(k, []);
      byCat.get(k).push(r);
    }
    // 分类顺序按系统里的排序，其次按数量
    const order = categoryList().map((c) => c.name);
    const names = [...byCat.keys()].sort((a, b) => {
      const ia = order.indexOf(a); const ib = order.indexOf(b);
      if (ia !== ib) return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
      return byCat.get(b).length - byCat.get(a).length;
    });
    const safe = safeSheetNames(['汇总', ...names]);

    sheets = [{
      name: safe[0],
      title: `各分类设备数量 · 共 ${data.length} 台 · 导出时间 ${stamp}`,
      columns: [
        { header: '设备分类', key: 'name', width: 18 },
        { header: '设备数量', key: 'count', width: 12, type: 'int' },
        { header: '占比', key: 'ratio', width: 10 },
        { header: '资产总值', key: 'amount', width: 16, type: 'money' },
        { header: '本表包含字段', key: 'fields', width: 46 },
        { header: '对应工作表', key: 'sheet', width: 20 },
      ],
      rows: names.map((n, i) => {
        const rows = byCat.get(n);
        const amount = rows.reduce((s, r) => s + (Number(r.purchase_price) || 0), 0);
        return {
          name: n,
          count: rows.length,
          ratio: data.length ? `${(rows.length / data.length * 100).toFixed(1)}%` : '0%',
          amount,
          fields: sheetColumnsFor(n, rows).map((c) => c.header).join('、'),
          sheet: safe[i + 1],
        };
      }),
    }];

    names.forEach((n, i) => {
      const rows = byCat.get(n);
      sheets.push({
        name: safe[i + 1],
        title: `${n} · 共 ${rows.length} 台 · 导出时间 ${stamp}`,
        columns: withPhotoCols(toCols(sheetColumnsFor(n, rows))),
        rows,
      });
    });
  } else {
    sheets = [{
      name: '设备台账',
      title: `IT 资产设备台账  ·  共 ${data.length} 台  ·  导出时间 ${stamp}`,
      columns: cols,
      rows: data,
    }];
  }

  if (withHelp) sheets.push(...helpSheets());

  const suffix = split ? '（分类分表）' : '';
  return {
    buffer: buildXlsx({ sheets, title: 'IT 资产设备台账' }),
    filename: `IT资产台账${suffix}_${new Date().toISOString().slice(0, 10)}.xlsx`,
    count: data.length,
    sheets: sheets.length,
    photos: data.filter((r) => r.photo_url).length,
  };
}

/* ================================================================== *
 * 3.5 实时数据接口（Excel 用「数据 → 获取数据 → 自网站」拉取后自动刷新）
 * ================================================================== */

export function liveToken() {
  let t = getSetting('live_token', null);
  if (!t || typeof t !== 'string') {
    t = crypto.randomBytes(16).toString('hex');
    setSetting('live_token', t);
  }
  return t;
}

export function resetLiveToken() {
  const t = crypto.randomBytes(16).toString('hex');
  setSetting('live_token', t);
  return t;
}

export function checkLiveToken(t) {
  const cur = getSetting('live_token', null);
  if (!cur || typeof t !== 'string' || t.length !== cur.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(t), Buffer.from(cur));
  } catch {
    return false;
  }
}

/** 转成 Excel 友好的 CSV：UTF-8 BOM + CRLF + 标准转义 */
export function toCSV(rows, columns = allColumns()) {
  const cell = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => cell(c.header)).join(',')];
  for (const r of rows) lines.push(columns.map((c) => cell(r[c.key])).join(','));
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

/**
 * 转成带 <table> 的 HTML —— WPS 表格的「自网站」只认网页里的表格，
 * 喂 CSV 会报「无法获取数据」，所以同时提供这个格式。
 *
 * 照片列（link: true）会渲染成短文字的 <a>，Excel/WPS 导入后是**可点击的超链接**，
 * 比铺一屏几十个字符的长网址好看得多，也不会把列撑得特别宽。
 */
export function toHTMLTable(rows, columns = allColumns(), title = 'IT 资产台账') {
  const esc = (v) => String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const cellHTML = (c, v) => {
    const s = String(v ?? '');
    if (c.link && /^https?:\/\//.test(s)) {
      const label = c.key === 'original_url' ? '打开原图' : '打开照片';
      return `<a href="${esc(s)}" title="${esc(s)}">${label}</a>`;
    }
    return esc(s);
  };
  const thead = `<tr>${columns.map((c) => `<th>${esc(c.header)}</th>`).join('')}</tr>`;
  const tbody = rows.map((r) => `<tr>${columns.map((c) => `<td>${cellHTML(c, r[c.key])}</td>`).join('')}</tr>`).join('\n');
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
</head>
<body>
<h3>${esc(title)}</h3>
<table id="itam-devices" border="1" cellspacing="0" cellpadding="4">
<thead>
${thead}
</thead>
<tbody>
${tbody}
</tbody>
</table>
<p>共 ${rows.length} 行 · 生成于 ${new Date().toLocaleString('zh-CN')}</p>
</body>
</html>`;
}

/** HTML 里用到的 id 不能有空格/特殊符号 */
function htmlId(s) {
  return 'tbl-' + String(s).replace(/[^\w\u4e00-\u9fff-]/g, '_');
}

/**
 * 一个页面里放「每个分类一张表」——
 * WPS/Excel 的「自网站」在导航器里能一次勾选多个表格，
 * 分别加载到不同工作表，就不必一个分类建一次查询了。
 */
export function toHTMLWorkbook(sheetsData = []) {
  const esc = (v) => String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const blocks = sheetsData.map((s) => {
    // 每张表按自己的分类取列：显示器页不会出现 CPU/内存/硬盘/IMEI
    const cols = s.columns || sheetColumnsFor(s.name, s.rows);
    const thead = `<tr>${cols.map((c) => `<th>${esc(c.header)}</th>`).join('')}</tr>`;
    const tbody = s.rows.map((r) => `<tr>${cols.map((c) => {
      const v = String(r[c.key] ?? '');
      if (c.link && /^https?:\/\//.test(v)) {
        const label = c.key === 'original_url' ? '打开原图' : '打开照片';
        return `<td><a href="${esc(v)}" title="${esc(v)}">${label}</a></td>`;
      }
      return `<td>${esc(v)}</td>`;
    }).join('')}</tr>`).join('\n');
    return `
<h2>${esc(s.name)}</h2>
<table id="${htmlId(s.name)}" summary="${esc(s.name)}" border="1" cellspacing="0" cellpadding="4">
<caption>${esc(s.name)}（${s.rows.length} 台）</caption>
<thead>
${thead}
</thead>
<tbody>
${tbody}
</tbody>
</table>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="robots" content="noindex, nofollow">
<title>IT 资产台账 · 按分类分表</title>
</head>
<body>
<h1>IT 资产台账 · 按设备分类分表</h1>
<p>本页共 ${sheetsData.length} 张表格，每张对应一个设备分类。导入时请把表格全部勾选。生成于 ${new Date().toLocaleString('zh-CN')}</p>
${blocks}
</body>
</html>`;
}

/** 纯文本清单，方便脚本/宏读取：每行「表名|条数|链接」 */
export function liveManifestText(baseUrl) {
  const m = liveManifest(baseUrl, {});
  const lines = m.sheets.map((s) => `${s.name}|${s.count}|${s.html}`);
  lines.unshift(`全部设备|${m.all.count}|${m.all.html}`);
  return lines.join('\n') + '\n';
}

/** 实时数据源的清单：每个分类一个 CSV，另附一份全部设备 */
export function liveManifest(baseUrl, query = {}) {
  const token = liveToken();
  const cats = categoryList();
  const counts = new Map(
    all(`SELECT COALESCE(c.name,'未分类') AS name, COUNT(*) AS n FROM device d
         LEFT JOIN device_category c ON c.id = d.category_id
         WHERE d.deleted_at IS NULL GROUP BY c.name`).map((r) => [r.name, r.n]),
  );
  const total = all('SELECT COUNT(*) AS c FROM device d WHERE d.deleted_at IS NULL')[0]?.c || 0;
  const qs = (extra, ext) => {
    const p = new URLSearchParams({ token, ...extra });
    return `${baseUrl}/api/live/devices.${ext}?${p.toString()}`;
  };
  const link = (extra) => ({
    csv: qs(extra, 'csv'),
    html: qs(extra, 'html'),
  });

  const sheets = [];
  for (const c of cats) {
    const n = counts.get(c.name) || 0;
    if (!n) continue;
    sheets.push({
      name: c.name,
      icon: c.icon,
      color: c.color,
      count: n,
      ...link({ category_id: c.id }),
    });
  }
  if (counts.get('未分类')) {
    sheets.push({ name: '未分类', count: counts.get('未分类'), ...link({ uncategorized: '1' }) });
  }

  return {
    generated_at: new Date().toISOString(),
    total,
    base: baseUrl,
    all: { count: total, ...link({ all: '1' }) },
    sheets,
    manifest: `${baseUrl}/api/live/manifest.json?token=${token}`,
    manifest_text: `${baseUrl}/api/live/manifest.txt?token=${token}`,
    // 一个页面里包含所有分类的表格：导入时一次勾选，分别落到不同工作表
    workbook: { tables: sheets.length + (counts.get('未分类') ? 1 : 0), html: `${baseUrl}/api/live/workbook.html?token=${token}` },
  };
}

/** 生成导入模板（含下拉、字段说明、字典页） */
export function buildTemplate() {
  const columns = allColumns();

  // 主表不放任何示例数据行，避免被误当成真实数据导入（示例统一放到「填写示例」页）
  const cols = columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width || 16,
    type: c.type || (c.key === 'purchase_price' ? 'money' : 'text'),
  }));

  // 动态计算下拉校验所在列，避免以后调整列顺序时失效
  const letterOf = (key) => {
    const i = columns.findIndex((c) => c.key === key);
    return i >= 0 ? colLetter(i) : null;
  };
  const dv = [];
  const statusL = letterOf('status_label');
  if (statusL) dv.push({ sqref: `${statusL}3:${statusL}1000`, values: STATUS_LABELS_ORDER.join(',') });
  const catL = letterOf('category_name');
  if (catL) dv.push({ sqref: `${catL}3:${catL}1000`, values: categoryList().map((c) => c.name).join(',') });
  const supL = letterOf('supplier');
  const supplierList = getSetting('system', {})?.suppliers || [];
  if (supL && supplierList.length) {
    dv.push({ sqref: `${supL}3:${supL}1000`, values: supplierList.join(',') });
  }

  const mainSheet = {
    name: '设备台账',
    title: `IT 资产批量导入模板 —— 请从第 3 行开始填写（表头请勿修改）· 生成时间 ${new Date().toLocaleString('zh-CN')}`,
    columns: cols,
    rows: [],   // 主表保持干净，不放任何示例数据
    dv,
  };

  const sheets = [mainSheet, sampleSheet(cols), ...helpSheets()];

  return {
    buffer: buildXlsx({ sheets, title: 'IT 资产导入模板' }),
    filename: `IT资产导入模板_${new Date().toISOString().slice(0, 10)}.xlsx`,
  };
}

/** 填写示例单独放一页，避免主表里的示例行被误导入成真实资产 */
function sampleSheet(cols) {
  const make = (o) => ({ asset_no: '', ...o });
  return {
    name: '填写示例',
    title: '填写示例（仅供参考格式）—— 本页不会被导入，实际数据请填在「设备台账」页',
    columns: cols,
    rows: [
      make({
        category_name: '显示器', brand: 'Dell', model: 'U2723QE', sn: 'CN0M2K7P1234',
        org_path: '总公司 / 信息技术部', status_label: '在用', owner_name: '张三',
        owner_employee_no: 'E1001', owner_phone: '13800000000', location: '3 楼办公区',
        purchase_date: '2024-03-15', warranty_until: '2027-03-14', purchase_price: 1899,
        supplier: '易点云', remark: '示例行（示例页不会被导入）',
      }),
      make({
        category_name: '台式主机', brand: '联想', model: 'ThinkCentre M920t', sn: 'M70GPLX0',
        org_path: '总公司 / 财务部', status_label: '在用', owner_name: '李四',
        owner_employee_no: 'E1002', location: '2 楼财务室',
        purchase_date: '2024-06-01', warranty_until: '2027-05-31', purchase_price: 4500,
        supplier: '小熊', remark: '示例行（示例页不会被导入）',
      }),
    ],
  };
}

function helpSheets() {
  const cats = categoryList();
  const orgs = orgFlatWithPath();

  return [
    {
      name: '字段说明',
      title: '字段填写说明',
      columns: [
        { header: '列名', key: 'col', width: 16 },
        { header: '是否必填', key: 'required', width: 10 },
        { header: '填写说明', key: 'note', width: 62 },
      ],
      rows: [
        { col: '资产编号', required: '否', note: '留空则按「分类前缀-年份-流水号」自动生成，如 MON-2025-0001；填写时必须全局唯一' },
        { col: '设备分类', required: '是', note: '填写分类名称，不存在时会自动创建。常见：台式主机 / 笔记本电脑 / 显示器 / 打印机 / 网络设备 / 服务器' },
        { col: '品牌', required: '否', note: '如 Dell、联想、HP、H3C、华为' },
        { col: '型号', required: '否', note: '如 U2723QE、ThinkPad X1 Carbon' },
        { col: 'SN 序列号', required: '否', note: '设备唯一序列号，建议填写；重复时会报错并跳过该行' },
        { col: '所属组织', required: '否', note: '支持「总公司 / 信息技术部」这样的路径写法，也支持只写部门名。不存在时会自动创建在根节点下' },
        { col: '状态', required: '否', note: `可选：${STATUS_LABELS_ORDER.join(' / ')}；留空默认「库存」` },
        { col: '采购日期 / 保修到期', required: '否', note: '支持 2024-03-15、2024/3/15、2024年3月15日，Excel 日期格式也可直接识别' },
        { col: '采购金额', required: '否', note: '纯数字，不要带货币符号' },
        { col: '供应商', required: '否', note: '从下拉列表选择（可在「系统设置 → 企业信息」里维护供应商选项）' },
        { col: '成色', required: '否', note: '建议 A / B / C' },
        { col: '硬件规格列', required: '否', note: 'IP 地址 / MAC 地址 / 操作系统 / CPU / 内存 / 硬盘 / 屏幕尺寸 这 7 列只在「按分类分表」里出现，且仅当该分类的「专属字段」配置了它——显示器不会有 CPU，主机不会有屏幕尺寸' },
        { col: '分类自定义列', required: '否', note: '分辨率 / 接口类型 / 打印类型 / 端口数 / 机柜位 / IMEI 等，由各分类的「专属字段」决定，同样按分类分表导出' },
      ],
    },
    {
      name: '设备分类',
      title: '系统内已有设备分类（导入时会自动匹配）',
      columns: [
        { header: '分类名称', key: 'name', width: 18 },
        { header: '编码', key: 'code', width: 12 },
        { header: '编号前缀', key: 'prefix', width: 12 },
        { header: '已有设备数', key: 'count', width: 12 },
      ],
      rows: cats.map((c) => ({ name: c.name, code: c.code || '', prefix: c.code_prefix || '', count: c.device_count })),
    },
    {
      name: '组织架构',
      title: '系统内已有组织（导入时按名称或路径自动匹配）',
      columns: [
        { header: '组织全路径', key: 'path', width: 40 },
        { header: '组织名称', key: 'name', width: 20 },
        { header: '编码', key: 'code', width: 16 },
        { header: '已有设备数', key: 'count', width: 12 },
      ],
      rows: orgs.map((o) => ({ path: o.path, name: o.name, code: o.code || '', count: o.device_count || 0 })),
    },
  ];
}

/* ================================================================== *
 * 4. 导入
 * ================================================================== */

function normHeader(h) {
  return String(h ?? '')
    .replace(/[\s　]/g, '')
    .replace(/[()（）*:：、,，.。/\\-]/g, '')
    .toLowerCase();
}

function headerMap() {
  const map = new Map();
  for (const c of allColumns()) {
    map.set(normHeader(c.header), c);
    map.set(normHeader(c.key), c);
    for (const a of c.aliases || []) map.set(normHeader(a), c);
  }
  // 少量特殊别名
  map.set('sn序列号sn', map.get(normHeader('SN 序列号')));
  return map;
}

export function previewImport(buffer, { sheet, maxRows = 20 } = {}) {
  const parsed = parseXlsx(buffer, { sheet, maxRows: 50000 });
  const hm = headerMap();
  const matched = [];
  const unmatched = [];
  for (const h of parsed.headers) {
    const col = hm.get(normHeader(h));
    if (col) matched.push({ header: h, key: col.key, label: col.header });
    else unmatched.push(h);
  }
  return {
    sheets: parsed.sheets,
    sheetName: parsed.sheetName,
    total: parsed.data.length,
    headers: parsed.headers,
    matched,
    unmatched,
    sample: parsed.data.slice(0, maxRows),
    rows: parsed.data,
  };
}

/**
 * 执行导入
 * @param {Buffer} buffer
 * @param {object} opts { sheet, updateExisting, createMissing, operator, dryRun }
 */
export function importDevices(buffer, opts = {}) {
  const {
    sheet, updateExisting = true, createMissing = true, operator = 'excel-import', dryRun = false,
  } = opts;

  const parsed = parseXlsx(buffer, { sheet });
  if (!parsed.data.length) {
    return {
      total: 0, created: 0, updated: 0, skipped: 0, failed: 0,
      errors: [{ row: 0, message: '表格里没有数据行。如果你用的是系统模板，请把数据填在「设备台账」页的第 3 行开始（「填写示例」页不会被导入）' }],
      preview: [],
    };
  }

  const hm = headerMap();
  const colByHeader = new Map();
  for (const h of parsed.headers) {
    const col = hm.get(normHeader(h));
    if (col) colByHeader.set(h, col);
  }
  if (!colByHeader.size) {
    return {
      total: parsed.data.length, created: 0, updated: 0, skipped: 0, failed: parsed.data.length,
      errors: [{ row: 0, message: `表头无法识别，请使用系统提供的导入模板。当前表头：${parsed.headers.join(' | ')}` }],
      preview: [],
    };
  }

  const stats = { total: parsed.data.length, created: 0, updated: 0, skipped: 0, failed: 0, errors: [], preview: [] };
  const batchId = uuid();
  const orgCache = new Map();
  const catCache = new Map();

  // 预载缓存
  for (const c of categoryList()) catCache.set(normHeader(c.name), c);
  for (const o of orgFlatWithPath()) {
    orgCache.set(normHeader(o.name), o);
    orgCache.set(normHeader(o.path), o);
  }

  const findOrCreateCategory = (name) => {
    const key = normHeader(name);
    if (!name) return null;
    if (catCache.has(key)) return catCache.get(key);
    if (!createMissing || dryRun) {
      const byCode = categoryList().find((c) => normHeader(c.code) === key);
      if (byCode) { catCache.set(key, byCode); return byCode; }
      return null;
    }
    const created = categoryCreate({ name: str(name, 60), code_prefix: str(name, 6), icon: 'box' });
    catCache.set(key, created);
    return created;
  };

  const findOrCreateOrg = (nameOrPath) => {
    const rawName = String(nameOrPath ?? '').trim();
    if (!rawName) return null;
    const key = normHeader(rawName);
    if (orgCache.has(key)) return orgCache.get(key);

    const parts = rawName.split(/\s*[/>＞\\|]\s*|\s*>\s*/).map((s) => s.trim()).filter(Boolean);
    if (parts.length > 1) {
      let parent = null;
      for (const p of parts) {
        const pk = normHeader(p);
        let node = orgCache.get(pk);
        if (!node) {
          if (!createMissing || dryRun) return parent;
          node = orgCreate({ name: str(p, 80), parent_id: parent?.id || null, type: parent ? 'department' : 'company' });
          orgCache.set(pk, node);
        }
        parent = node;
      }
      orgCache.set(key, parent);
      return parent;
    }
    if (!createMissing || dryRun) return null;
    const created = orgCreate({ name: str(rawName, 80), type: 'department' });
    orgCache.set(key, created);
    return created;
  };

  const statusFromLabel = (v) => {
    const s = String(v ?? '').trim();
    if (!s) return null;
    if (DEVICE_STATUS.some((x) => x.id === s)) return s;
    return STATUS_ID[s] || null;
  };

  const runImport = () => {
    let rowNo = 1; // 表头是第 2 行，数据从第 3 行起
    for (const row of parsed.data) {
      rowNo++;
      stats.preview.push(stats.preview.length < 8 ? row : undefined);
      stats.preview = stats.preview.filter(Boolean);
      try {
        const flat = {};
        for (const [h, col] of colByHeader) {
          const v = row[h];
          if (v === undefined || v === null || v === '') continue;
          if (col.extraKey) {
            flat.extra = flat.extra || {};
            flat.extra[col.extraKey] = v;
          } else {
            flat[col.key] = v;
          }
        }

        // SN / 资产编号清洗
        if (flat.sn !== undefined) flat.sn = String(flat.sn).replace(/\s+/g, '');
        if (flat.asset_no !== undefined) {
          const a = String(flat.asset_no).trim();
          if (/^[（(]/.test(a) || a.includes('留空') || a.includes('自动生成')) delete flat.asset_no;
          else flat.asset_no = a;
        }

        // 安全网：备注里标了「示例」的行自动忽略，避免模板示例被误当成真实资产
        if (flat.remark && /示例行|示例数据|示例（|sample\s*row|请勿导入|不要导入/i.test(String(flat.remark))) {
          stats.skipped++;
          continue;
        }

        // 日期归一化
        for (const k of ['purchase_date', 'warranty_until']) {
          if (flat[k] !== undefined) {
            const d = normalizeDate(flat[k]);
            if (!d) { delete flat[k]; }
            else flat[k] = d;
          }
        }
        // 金额
        if (flat.purchase_price !== undefined) {
          const n = Number(String(flat.purchase_price).replace(/[^0-9.\-]/g, ''));
          flat.purchase_price = isFinite(n) ? n : null;
        }
        // 状态
        if (flat.status_label !== undefined) {
          const s = statusFromLabel(flat.status_label);
          if (!s) throw new Error(`状态「${flat.status_label}」无法识别，可选：${STATUS_LABELS_ORDER.join('/')}`);
          flat.status = s;
        }

        // 分类
        if (flat.category_name) {
          const cat = findOrCreateCategory(flat.category_name);
          if (!cat) throw new Error(`分类「${flat.category_name}」不存在（可勾选「自动创建缺失的分类」）`);
          flat.category_id = cat.id;
        }
        delete flat.category_name;

        // 组织
        if (flat.org_path) {
          const org = findOrCreateOrg(flat.org_path);
          if (org) flat.org_id = org.id;
          else if (!createMissing) flat.org_id = null;
        }
        delete flat.org_path;

        // 查重：SN 优先，其次资产编号
        let existing = null;
        if (flat.sn) existing = get('SELECT * FROM device WHERE sn=? COLLATE NOCASE AND deleted_at IS NULL', flat.sn);
        if (!existing && flat.asset_no) existing = get('SELECT * FROM device WHERE asset_no=? AND deleted_at IS NULL', flat.asset_no);

        if (existing) {
          if (!updateExisting) { stats.skipped++; continue; }
          if (dryRun) { stats.updated++; continue; }
          const patch = { ...flat };
          delete patch.asset_no; // 不覆盖已有资产编号
          deviceUpdate(existing.id, patch, operator);
          stats.updated++;
        } else {
          if (dryRun) { stats.created++; continue; }
          deviceCreate(flat, operator);
          stats.created++;
        }
      } catch (e) {
        stats.failed++;
        if (stats.errors.length < 200) {
          stats.errors.push({ row: rowNo + 1, sn: row['SN 序列号'] ?? row.sn ?? '', message: e.message });
        }
      }
    }
  };

  if (dryRun) runImport();
  else tx(runImport);

  if (!dryRun) {
    insert('import_batch', {
      id: batchId,
      filename: opts.filename || '',
      total: stats.total,
      success: stats.created + stats.updated,
      failed: stats.failed,
      errors: JSON.stringify(stats.errors.slice(0, 50)),
      operator,
      created_at: nowISO(),
    });
  }

  return stats;
}

export function importBatches(limit = 20) {
  return all('SELECT * FROM import_batch ORDER BY created_at DESC LIMIT ?', Number(limit) || 20)
    .map((b) => ({ ...b, errors: safeJson(b.errors, []) }));
}

function safeJson(s, d) {
  try { return JSON.parse(s); } catch { return d; }
}
