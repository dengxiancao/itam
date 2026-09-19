/**
 * 通用工具函数 —— 零依赖实现
 */

/* ------------------------------------------------------------------ *
 * 字符串 / 编码
 * ------------------------------------------------------------------ */

export function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function nowISO() {
  return new Date().toISOString();
}

export function toHalfWidth(s) {
  if (s == null) return '';
  return String(s)
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, ' ');
}

export function normalizeText(s) {
  return toHalfWidth(s)
    .replace(/\s+/g, '')
    .replace(/[：:]/g, '')
    .trim();
}

/** 去掉非字母数字，并统一大写（用于 SN / 型号比对） */
export function compactAlnum(s) {
  return toHalfWidth(s)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/** 去掉非字母数字，但保留原始大小写（用于 SN 存储） */
export function compactSN(s) {
  return toHalfWidth(s)
    .replace(/\s+/g, '')
    .replace(/^[：:]+/, '')
    .trim();
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

/* ------------------------------------------------------------------ *
 * 校验
 * ------------------------------------------------------------------ */

export class HttpError extends Error {
  constructor(status, message, detail) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

export const bad = (msg, detail) => new HttpError(400, msg, detail);
export const notFound = (msg = '资源不存在') => new HttpError(404, msg);

export function isBlank(v) {
  return v === undefined || v === null || String(v).trim() === '';
}

export function str(v, max = 500) {
  if (v === undefined || v === null) return '';
  return String(v).trim().slice(0, max);
}

/** 日期归一化：支持 2024/1/5、2024-01-05、2024年1月5日、Excel 序列号 */
export function normalizeDate(v) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'number' && isFinite(v)) {
    // Excel 日期序列号（1900 系统）
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (!isNaN(d)) return d.toISOString().slice(0, 10);
    return null;
  }
  let s = toHalfWidth(String(v)).trim();
  if (!s) return null;
  const cn = s.match(/^(\d{4})\s*[年\-/.]\s*(\d{1,2})\s*[月\-/.]\s*(\d{1,2})\s*日?$/);
  if (cn) {
    return `${cn[1]}-${pad2(cn[2])}-${pad2(cn[3])}`;
  }
  const ymd = s.match(/^(\d{4})\s*[年\-/.]\s*(\d{1,2})\s*月?$/);
  if (ymd) return `${ymd[1]}-${pad2(ymd[2])}-01`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    // 防止 "2024" 被解析成 2001 年
    if (/^\d{4}$/.test(s)) return `${s}-01-01`;
    return d.toISOString().slice(0, 10);
  }
  return null;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ *
 * 数组 / 对象
 * ------------------------------------------------------------------ */

export function uniq(arr) {
  return [...new Set(arr)];
}

export function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** 扁平列表 -> 树 */
export function buildTree(rows, idKey = 'id', parentKey = 'parent_id', childrenKey = 'children') {
  const map = new Map();
  const roots = [];
  for (const r of rows) map.set(r[idKey], { ...r, [childrenKey]: [] });
  for (const r of rows) {
    const node = map.get(r[idKey]);
    const pid = r[parentKey];
    if (pid && map.has(pid) && pid !== r[idKey]) {
      map.get(pid)[childrenKey].push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

/** 树 -> 扁平（带 depth / path） */
export function flattenTree(nodes, childrenKey = 'children', depth = 0, parents = []) {
  const out = [];
  for (const n of nodes) {
    const path = [...parents, n.name];
    out.push({ ...n, depth, path: path.join(' / '), [childrenKey]: undefined });
    if (n[childrenKey]?.length) {
      out.push(...flattenTree(n[childrenKey], childrenKey, depth + 1, path));
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * SQL 辅助
 * ------------------------------------------------------------------ */

/**
 * 构建动态 WHERE 子句
 * @returns {{sql:string, params:any[]}}
 */
export function buildWhere(conditions) {
  const parts = [];
  const params = [];
  for (const c of conditions) {
    if (!c) continue;
    if (typeof c === 'string') { parts.push(c); continue; }
    const [expr, ...vals] = c;
    parts.push(expr);
    params.push(...vals);
  }
  return {
    sql: parts.length ? `WHERE ${parts.join(' AND ')}` : '',
    params,
  };
}

export function pickAllowed(obj, allowed) {
  const out = {};
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 日志
 * ------------------------------------------------------------------ */

const LEVEL_COLOR = { info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m', ok: '\x1b[32m' };

export function log(level, ...args) {
  const c = LEVEL_COLOR[level] || '';
  const ts = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  console.log(`${c}[${ts}] ${level.toUpperCase().padEnd(5)}\x1b[0m`, ...args);
}

export const logger = {
  info: (...a) => log('info', ...a),
  warn: (...a) => log('warn', ...a),
  error: (...a) => log('error', ...a),
  ok: (...a) => log('ok', ...a),
};

/* ------------------------------------------------------------------ *
 * 其它
 * ------------------------------------------------------------------ */

export function formatBytes(n) {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
