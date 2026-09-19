/**
 * 业务服务层：组织、分类、设备、统计
 */
import {
  all, get, run, scalar, tx, insert, update, nextAssetNo, deviceLog, allP, getP, scalarP, getSetting, setSetting,
} from './db.js';
import { buildTree, flattenTree, HttpError, bad, notFound, nowISO, uuid, str, normalizeDate, uniq } from './util.js';
import { snCandidates } from './lib/recognize.js';

/* ================================================================== *
 * 组织架构
 * ================================================================== */

export const ORG_TYPES = [
  { id: 'group', label: '集团' },
  { id: 'company', label: '公司' },
  { id: 'department', label: '部门' },
  { id: 'team', label: '小组' },
  { id: 'other', label: '其它' },
];

export function orgList({ tree = false } = {}) {
  const rows = all(`
    SELECT o.*, (SELECT COUNT(*) FROM device d WHERE d.org_id = o.id AND d.deleted_at IS NULL) AS device_count,
           (SELECT COUNT(*) FROM org_unit c WHERE c.parent_id = o.id) AS child_count
    FROM org_unit o
    ORDER BY o.sort_order, o.created_at
  `);
  if (!tree) return rows;
  return buildTree(rows);
}

export function orgFlatWithPath() {
  return flattenTree(orgList({ tree: true }));
}

/** 某组织及其所有下级的 id */
export function orgWithDescendants(orgId) {
  if (!orgId) return [];
  const rows = allP(`
    WITH RECURSIVE sub(id) AS (
      SELECT id FROM org_unit WHERE id = ?
      UNION ALL
      SELECT o.id FROM org_unit o JOIN sub ON o.parent_id = sub.id
    )
    SELECT id FROM sub
  `, [orgId]);
  return rows.map((r) => r.id);
}

export function orgGet(id) {
  const row = get('SELECT * FROM org_unit WHERE id=?', id);
  if (!row) throw notFound('组织不存在');
  return row;
}

export function orgCreate(input) {
  const name = str(input.name, 80);
  if (!name) throw bad('组织名称不能为空');
  const parentId = input.parent_id || null;
  if (parentId) orgGet(parentId);
  if (input.code) {
    const dup = get('SELECT id FROM org_unit WHERE code=?', str(input.code, 40));
    if (dup) throw bad(`组织编码「${input.code}」已存在`);
  }
  const id = uuid();
  insert('org_unit', {
    id,
    parent_id: parentId,
    name,
    code: str(input.code, 40) || null,
    type: input.type || 'department',
    manager: str(input.manager, 40) || null,
    phone: str(input.phone, 30) || null,
    location: str(input.location, 120) || null,
    sort_order: Number(input.sort_order) || 0,
    remark: str(input.remark, 500) || null,
    created_at: nowISO(),
    updated_at: nowISO(),
  });
  return orgGet(id);
}

export function orgUpdate(id, input) {
  const cur = orgGet(id);
  const name = input.name !== undefined ? str(input.name, 80) : cur.name;
  if (!name) throw bad('组织名称不能为空');

  let parentId = input.parent_id !== undefined ? (input.parent_id || null) : cur.parent_id;
  if (parentId === id) throw bad('上级组织不能是自己');
  if (parentId) {
    orgGet(parentId);
    if (orgWithDescendants(id).includes(parentId)) throw bad('上级组织不能是自己的下级，会形成循环');
  }
  if (input.code) {
    const dup = get('SELECT id FROM org_unit WHERE code=? AND id<>?', str(input.code, 40), id);
    if (dup) throw bad(`组织编码「${input.code}」已被「${dup.id === id ? '' : ''}」占用`);
  }

  update('org_unit', id, {
    parent_id: parentId,
    name,
    code: input.code !== undefined ? (str(input.code, 40) || null) : cur.code,
    type: input.type ?? cur.type,
    manager: input.manager !== undefined ? (str(input.manager, 40) || null) : cur.manager,
    phone: input.phone !== undefined ? (str(input.phone, 30) || null) : cur.phone,
    location: input.location !== undefined ? (str(input.location, 120) || null) : cur.location,
    sort_order: input.sort_order !== undefined ? Number(input.sort_order) || 0 : cur.sort_order,
    remark: input.remark !== undefined ? (str(input.remark, 500) || null) : cur.remark,
    updated_at: nowISO(),
  });
  return orgGet(id);
}

export function orgDelete(id, { force = false } = {}) {
  orgGet(id);
  const children = scalar('SELECT COUNT(*) AS c FROM org_unit WHERE parent_id=?', id);
  if (children && !force) throw bad(`该组织下还有 ${children} 个子组织，请先移动或删除它们`);
  const devices = scalar('SELECT COUNT(*) AS c FROM device WHERE org_id=? AND deleted_at IS NULL', id);
  if (devices && !force) throw bad(`该组织下还有 ${devices} 台设备，请先转移设备`);
  return tx(() => {
    if (force) {
      run('UPDATE org_unit SET parent_id=NULL WHERE parent_id=?', id);
      run('UPDATE device SET org_id=NULL WHERE org_id=?', id);
    }
    run('DELETE FROM org_unit WHERE id=?', id);
    return { deleted: 1 };
  });
}

/** 组织维度的设备统计（含下级汇总） */
export function orgDeviceStats() {
  const rows = all(`
    SELECT o.id, o.name, o.parent_id,
      (SELECT COUNT(*) FROM device d WHERE d.org_id=o.id AND d.deleted_at IS NULL) AS own,
      (SELECT COUNT(*) FROM device d WHERE d.deleted_at IS NULL AND d.status='in_use'
         AND d.org_id IN (WITH RECURSIVE s(id) AS (SELECT o.id UNION ALL SELECT x.id FROM org_unit x JOIN s ON x.parent_id=s.id) SELECT id FROM s)) AS in_use
    FROM org_unit o
  `);
  const totals = all(`SELECT org_id, COUNT(*) AS c FROM device WHERE deleted_at IS NULL GROUP BY org_id`);
  const countMap = new Map(totals.map((t) => [t.org_id, t.c]));
  const childrenMap = new Map();
  for (const r of rows) {
    if (!childrenMap.has(r.parent_id)) childrenMap.set(r.parent_id, []);
    childrenMap.get(r.parent_id).push(r.id);
  }
  const withTotal = (id) => {
    let n = countMap.get(id) || 0;
    for (const c of childrenMap.get(id) || []) n += withTotal(c);
    return n;
  };
  return rows.map((r) => ({ ...r, total: withTotal(r.id) })).sort((a, b) => b.total - a.total);
}

/* ================================================================== *
 * 设备分类
 * ================================================================== */

export const CATEGORY_ICONS = [
  'pc', 'laptop', 'monitor', 'printer', 'network', 'server', 'phone', 'tablet', 'box', 'cpu', 'camera', 'ups',
];

export function categoryList() {
  return all(`
    SELECT c.*, (SELECT COUNT(*) FROM device d WHERE d.category_id=c.id AND d.deleted_at IS NULL) AS device_count
    FROM device_category c ORDER BY c.sort_order, c.name
  `).map((c) => ({ ...c, tracking_fields: safeJson(c.tracking_fields, []) }));
}

export function categoryGet(id) {
  const row = get('SELECT * FROM device_category WHERE id=?', id);
  if (!row) throw notFound('设备分类不存在');
  return { ...row, tracking_fields: safeJson(row.tracking_fields, []) };
}

export function categoryCreate(input) {
  const name = str(input.name, 60);
  if (!name) throw bad('分类名称不能为空');
  if (get('SELECT id FROM device_category WHERE name=?', name)) throw bad(`分类「${name}」已存在`);
  const id = uuid();
  insert('device_category', {
    id,
    name,
    code: str(input.code, 30) || null,
    icon: input.icon || 'box',
    color: input.color || '#4f8cff',
    code_prefix: str(input.code_prefix || input.code, 20) || null,
    has_sn: input.has_sn === false || input.has_sn === 0 ? 0 : 1,
    tracking_fields: JSON.stringify(normalizeFields(input.tracking_fields)),
    sort_order: Number(input.sort_order) || 0,
    remark: str(input.remark, 500) || null,
    created_at: nowISO(),
    updated_at: nowISO(),
  });
  return categoryGet(id);
}

export function categoryUpdate(id, input) {
  const cur = categoryGet(id);
  if (input.name && input.name !== cur.name) {
    if (get('SELECT id FROM device_category WHERE name=? AND id<>?', str(input.name, 60), id)) {
      throw bad(`分类「${input.name}」已存在`);
    }
  }
  update('device_category', id, {
    name: input.name !== undefined ? str(input.name, 60) : cur.name,
    code: input.code !== undefined ? (str(input.code, 30) || null) : cur.code,
    icon: input.icon ?? cur.icon,
    color: input.color ?? cur.color,
    code_prefix: input.code_prefix !== undefined ? (str(input.code_prefix, 20) || null) : cur.code_prefix,
    has_sn: input.has_sn !== undefined ? (input.has_sn === false || input.has_sn === 0 ? 0 : 1) : cur.has_sn,
    tracking_fields: input.tracking_fields !== undefined
      ? JSON.stringify(normalizeFields(input.tracking_fields))
      : JSON.stringify(cur.tracking_fields),
    sort_order: input.sort_order !== undefined ? Number(input.sort_order) || 0 : cur.sort_order,
    remark: input.remark !== undefined ? (str(input.remark, 500) || null) : cur.remark,
    updated_at: nowISO(),
  });
  return categoryGet(id);
}

export function categoryDelete(id, { force = false } = {}) {
  categoryGet(id);
  const n = scalar('SELECT COUNT(*) AS c FROM device WHERE category_id=? AND deleted_at IS NULL', id);
  if (n && !force) throw bad(`该分类下还有 ${n} 台设备，请先处理后再删除`);
  tx(() => {
    if (force) run('UPDATE device SET category_id=NULL WHERE category_id=?', id);
    run('DELETE FROM device_category WHERE id=?', id);
  });
  return { deleted: 1 };
}

function normalizeFields(fields) {
  if (!fields) return [];
  let arr = fields;
  if (typeof fields === 'string') arr = safeJson(fields, []);
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((f) => f && f.key)
    .map((f) => ({
      key: String(f.key).slice(0, 40),
      label: String(f.label || f.key).slice(0, 40),
      type: ['text', 'number', 'date', 'select'].includes(f.type) ? f.type : 'text',
      options: Array.isArray(f.options) ? f.options.map((o) => String(o).slice(0, 40)) : undefined,
    }));
}

/* ================================================================== *
 * 设备
 * ================================================================== */

export const DEVICE_STATUS = [
  { id: 'in_use', label: '在用', color: '#2bd67b' },
  { id: 'in_stock', label: '库存', color: '#4f8cff' },
  { id: 'idle', label: '闲置', color: '#8a94a6' },
  { id: 'lent', label: '借出', color: '#a06bff' },
  { id: 'repair', label: '维修中', color: '#ff9f43' },
  { id: 'scrapped', label: '已报废', color: '#ff5c8a' },
  { id: 'lost', label: '丢失', color: '#e5484d' },
];

const DEVICE_FIELDS = [
  'asset_no', 'sn', 'brand', 'model', 'category_id', 'org_id', 'status', 'condition_grade',
  'owner_name', 'owner_employee_no', 'owner_phone', 'location', 'ip_address', 'mac_address',
  'os_name', 'cpu', 'memory', 'disk', 'screen_size', 'purchase_date', 'warranty_until',
  'purchase_price', 'supplier', 'contract_no', 'department_code', 'remark',
  'photo_path', 'sn_photo_path', 'photo_original_path', 'photo_thumb_path',
  'sn_source', 'ocr_confidence', 'ocr_raw',
];

/** 分类「专属字段」里如果用的是这些 key，就写进设备表的真实列，而不是 extra */
export const COLUMN_TRACKING_KEYS = [
  'ip_address', 'mac_address', 'os_name', 'cpu', 'memory', 'disk', 'screen_size',
  'location', 'owner_name', 'owner_employee_no', 'owner_phone', 'supplier', 'remark',
];

/** 把 API 输入规范化成数据库字段 */
function normalizeDeviceInput(input, cur = null) {
  const out = {};
  const set = (k, v) => { out[k] = v === undefined ? (cur ? cur[k] : null) : v; };

  if (input.asset_no !== undefined) out.asset_no = str(input.asset_no, 60);
  if (input.sn !== undefined) out.sn = str(input.sn, 80).replace(/\s+/g, '') || null;
  if (input.brand !== undefined) out.brand = str(input.brand, 60) || null;
  if (input.model !== undefined) out.model = str(input.model, 120) || null;
  if (input.category_id !== undefined) out.category_id = input.category_id || null;
  if (input.org_id !== undefined) out.org_id = input.org_id || null;
  if (input.status !== undefined) {
    const s = String(input.status || '').trim();
    if (s && !DEVICE_STATUS.some((x) => x.id === s)) throw bad(`未知的设备状态：${s}`);
    out.status = s || 'in_stock';
  }
  if (input.condition_grade !== undefined) out.condition_grade = str(input.condition_grade, 10) || null;
  if (input.owner_name !== undefined) out.owner_name = str(input.owner_name, 40) || null;
  if (input.owner_employee_no !== undefined) out.owner_employee_no = str(input.owner_employee_no, 40) || null;
  if (input.owner_phone !== undefined) out.owner_phone = str(input.owner_phone, 30) || null;
  if (input.location !== undefined) out.location = str(input.location, 120) || null;
  if (input.ip_address !== undefined) out.ip_address = str(input.ip_address, 45) || null;
  if (input.mac_address !== undefined) out.mac_address = str(input.mac_address, 40) || null;
  if (input.os_name !== undefined) out.os_name = str(input.os_name, 80) || null;
  if (input.cpu !== undefined) out.cpu = str(input.cpu, 80) || null;
  if (input.memory !== undefined) out.memory = str(input.memory, 60) || null;
  if (input.disk !== undefined) out.disk = str(input.disk, 80) || null;
  if (input.screen_size !== undefined) out.screen_size = str(input.screen_size, 40) || null;
  if (input.purchase_date !== undefined) out.purchase_date = normalizeDate(input.purchase_date);
  if (input.warranty_until !== undefined) out.warranty_until = normalizeDate(input.warranty_until);
  if (input.purchase_price !== undefined) {
    const p = input.purchase_price;
    out.purchase_price = p === '' || p === null || p === undefined ? null : (Number(p) || 0);
  }
  if (input.supplier !== undefined) out.supplier = str(input.supplier, 120) || null;
  if (input.contract_no !== undefined) out.contract_no = str(input.contract_no, 80) || null;
  if (input.department_code !== undefined) out.department_code = str(input.department_code, 60) || null;
  if (input.remark !== undefined) out.remark = str(input.remark, 1000) || null;
  if (input.photo_path !== undefined) out.photo_path = str(input.photo_path, 300) || null;
  if (input.sn_photo_path !== undefined) out.sn_photo_path = str(input.sn_photo_path, 300) || null;
  if (input.photo_original_path !== undefined) out.photo_original_path = str(input.photo_original_path, 300) || null;
  if (input.photo_thumb_path !== undefined) out.photo_thumb_path = str(input.photo_thumb_path, 300) || null;
  if (input.sn_source !== undefined) out.sn_source = str(input.sn_source, 20) || null;
  if (input.ocr_confidence !== undefined) out.ocr_confidence = input.ocr_confidence == null ? null : Number(input.ocr_confidence);
  if (input.ocr_raw !== undefined) out.ocr_raw = input.ocr_raw == null ? null : String(input.ocr_raw).slice(0, 20000);
  return out;
}

export function deviceGet(id) {
  const row = getP(`SELECT * FROM device WHERE id=? AND deleted_at IS NULL`, [id]);
  if (!row) throw notFound('设备不存在');
  return hydrate(row);
}

export function deviceGetBySN(sn) {
  if (!sn) return null;
  const rows = allP(
    `SELECT * FROM device WHERE deleted_at IS NULL AND (sn=? COLLATE NOCASE OR asset_no=? COLLATE NOCASE) LIMIT 2`,
    [String(sn).trim(), String(sn).trim()],
  );
  return rows.map(hydrate);
}

/**
 * 手机识别完 SN 之后，用「同品牌已归档的编号规律」猜几个更可能的写法。
 *
 * 为什么有用：实测视觉模型经常把 S/N 标签一起读进去（SN1YLX22196），
 * 或者把 L 看成 1、O 看成 Q。同型号机器的编号长得非常像
 * （联想 ThinkCentre 全是 YLX 开头 + 8 位），拿档案一比就能纠回来。
 *
 * @param {string} sn      OCR 识别到的 SN
 * @param {string} brand   识别到的品牌（用来挑对照的档案）
 */
export function snNeighbors(sn, brand = null, limit = 5) {
  const key = String(brand || '').trim();
  const pick = (sql, args) => allP(sql, args).map((r) => r.sn).filter(Boolean);

  let known = [];
  if (key) {
    known = pick(
      `SELECT sn FROM device WHERE deleted_at IS NULL AND sn IS NOT NULL AND brand = ?
       ORDER BY created_at DESC LIMIT 300`,
      [key],
    );
  }
  // 同品牌样本太少就不敢乱推断，宁可只给原值
  if (known.length < 5) return snCandidates(sn, [], { limit: 1 });

  return snCandidates(sn, known, { limit });
}

function hydrate(row) {
  const org = row.org_id
    ? getP('SELECT id,name,parent_id,type,code FROM org_unit WHERE id=?', [row.org_id])
    : null;
  const cat = row.category_id
    ? getP('SELECT id,name,code,icon,color,code_prefix,tracking_fields FROM device_category WHERE id=?', [row.category_id])
    : null;
  return {
    ...row,
    extra: safeJson(row.extra, {}),
    org,
    category: cat ? { ...cat, tracking_fields: safeJson(cat.tracking_fields, []) } : null,
    org_path: org ? orgPath(org.id) : '',
    warranty_expired: row.warranty_until ? row.warranty_until < new Date().toISOString().slice(0, 10) : null,
  };
}

export function orgPath(id) {
  const names = [];
  let cur = getP('SELECT id,name,parent_id FROM org_unit WHERE id=?', [id]);
  let guard = 0;
  while (cur && guard++ < 20) {
    names.unshift(cur.name);
    cur = cur.parent_id ? getP('SELECT id,name,parent_id FROM org_unit WHERE id=?', [cur.parent_id]) : null;
  }
  return names.join(' / ');
}

/**
 * 设备列表（分页 + 多条件筛选）
 */
export function deviceList(q = {}) {
  const where = ['d.deleted_at IS NULL'];
  const params = [];
  const kw = str(q.keyword || q.q, 100);
  if (kw) {
    where.push(`(d.asset_no LIKE ? OR d.sn LIKE ? OR d.brand LIKE ? OR d.model LIKE ?
      OR d.owner_name LIKE ? OR d.owner_employee_no LIKE ? OR d.ip_address LIKE ?
      OR d.mac_address LIKE ? OR d.location LIKE ? OR d.contract_no LIKE ? OR d.remark LIKE ?)`);
    const like = `%${kw}%`;
    for (let i = 0; i < 11; i++) params.push(like);
  }
  if (q.category_id) { where.push('d.category_id = ?'); params.push(q.category_id); }
  if (q.uncategorized === '1' || q.uncategorized === true) where.push('d.category_id IS NULL');
  if (q.ids?.length) {
    // 只查指定的一批设备（「导出所选」用）
    where.push(`d.id IN (${q.ids.map(() => '?').join(',')})`);
    params.push(...q.ids);
  }
  if (q.category_ids?.length) {
    where.push(`d.category_id IN (${q.category_ids.map(() => '?').join(',')})`);
    params.push(...q.category_ids);
  }
  if (q.org_id) {
    const ids = orgWithDescendants(q.org_id);
    if (ids.length) {
      where.push(`d.org_id IN (${ids.map(() => '?').join(',')})`);
      params.push(...ids);
    }
  }
  if (q.status) {
    const list = Array.isArray(q.status) ? q.status : String(q.status).split(',').filter(Boolean);
    if (list.length) {
      where.push(`d.status IN (${list.map(() => '?').join(',')})`);
      params.push(...list);
    }
  }
  if (q.brand) { where.push('d.brand = ?'); params.push(q.brand); }
  if (q.supplier) { where.push('d.supplier = ?'); params.push(q.supplier); }
  if (q.sn) { where.push('d.sn LIKE ?'); params.push(`%${str(q.sn, 80)}%`); }
  if (q.owner) { where.push('(d.owner_name LIKE ? OR d.owner_employee_no LIKE ?)'); params.push(`%${q.owner}%`, `%${q.owner}%`); }
  if (q.date_from) { where.push('d.created_at >= ?'); params.push(q.date_from); }
  if (q.date_to) { where.push('d.created_at <= ?'); params.push(`${q.date_to}T23:59:59.999Z`); }
  if (q.warranty === 'expired') where.push(`d.warranty_until IS NOT NULL AND d.warranty_until < '${new Date().toISOString().slice(0, 10)}'`);
  if (q.warranty === 'valid') where.push(`d.warranty_until IS NOT NULL AND d.warranty_until >= '${new Date().toISOString().slice(0, 10)}'`);

  const whereSql = `WHERE ${where.join(' AND ')}`;

  const sortMap = {
    updated_at: 'd.updated_at', created_at: 'd.created_at', asset_no: 'd.asset_no',
    brand: 'd.brand', sn: 'd.sn', status: 'd.status', purchase_date: 'd.purchase_date',
  };
  const sortCol = sortMap[q.sort] || 'd.updated_at';
  const sortDir = String(q.order || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const page = Math.max(1, Number(q.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(q.page_size || q.pageSize) || 20));
  const total = scalarP(`SELECT COUNT(*) AS c FROM device d ${whereSql}`, params);

  const rows = allP(`
    SELECT d.*, o.name AS org_name, c.name AS category_name, c.icon AS category_icon, c.color AS category_color
    FROM device d
    LEFT JOIN org_unit o ON o.id = d.org_id
    LEFT JOIN device_category c ON c.id = d.category_id
    ${whereSql}
    ORDER BY ${sortCol} ${sortDir}
    LIMIT ? OFFSET ?
  `, [...params, pageSize, (page - 1) * pageSize]);

  return {
    total,
    page,
    page_size: pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
    items: rows.map((r) => ({
      ...r,
      extra: safeJson(r.extra, {}),
      org_path: r.org_id ? orgPath(r.org_id) : '',
    })),
    // 前端设置页需要更多行时，一次性返回全部匹配 id 便于「全选」
    all_ids: total <= 5000
      ? allP(`SELECT d.id FROM device d ${whereSql}`, params).map((r) => r.id)
      : [],
  };
}

export function deviceCreate(input, operator = '') {
  const data = normalizeDeviceInput(input);

  if (!data.category_id) throw bad('请选择设备分类');
  categoryGet(data.category_id);
  if (data.org_id) orgGet(data.org_id);

  if (!data.asset_no) data.asset_no = nextAssetNo(data.category_id);
  const dupAsset = get('SELECT id FROM device WHERE asset_no=? AND deleted_at IS NULL', data.asset_no);
  if (dupAsset) throw bad(`资产编号「${data.asset_no}」已存在`);
  if (data.sn) {
    const dupSN = get('SELECT id,asset_no FROM device WHERE sn=? COLLATE NOCASE AND deleted_at IS NULL', data.sn);
    if (dupSN) throw new HttpError(409, `SN「${data.sn}」已存在于资产 ${dupSN.asset_no}`, { conflict_device_id: dupSN.id });
  }

  const id = uuid();
  const now = nowISO();
  insert('device', {
    id,
    asset_no: data.asset_no,
    sn: data.sn ?? null,
    brand: data.brand ?? null,
    model: data.model ?? null,
    category_id: data.category_id,
    org_id: data.org_id ?? null,
    status: data.status || 'in_stock',
    condition_grade: data.condition_grade ?? null,
    owner_name: data.owner_name ?? null,
    owner_employee_no: data.owner_employee_no ?? null,
    owner_phone: data.owner_phone ?? null,
    location: data.location ?? null,
    ip_address: data.ip_address ?? null,
    mac_address: data.mac_address ?? null,
    os_name: data.os_name ?? null,
    cpu: data.cpu ?? null,
    memory: data.memory ?? null,
    disk: data.disk ?? null,
    screen_size: data.screen_size ?? null,
    purchase_date: data.purchase_date ?? null,
    warranty_until: data.warranty_until ?? null,
    purchase_price: data.purchase_price ?? null,
    supplier: data.supplier ?? null,
    contract_no: data.contract_no ?? null,
    department_code: data.department_code ?? null,
    remark: data.remark ?? null,
    extra: JSON.stringify(input.extra && typeof input.extra === 'object' ? input.extra : {}),
    photo_path: data.photo_path ?? null,
    sn_photo_path: data.sn_photo_path ?? null,
    photo_original_path: data.photo_original_path ?? null,
    photo_thumb_path: data.photo_thumb_path ?? null,
    sn_source: data.sn_source ?? 'manual',
    ocr_confidence: data.ocr_confidence ?? null,
    ocr_raw: data.ocr_raw ?? null,
    created_by: operator || 'system',
    created_at: now,
    updated_at: now,
  });
  deviceLog(id, 'create', [], operator, `新建设备 ${data.asset_no}`);
  return deviceGet(id);
}

export function deviceUpdate(id, input, operator = '') {
  const cur = get('SELECT * FROM device WHERE id=? AND deleted_at IS NULL', id);
  if (!cur) throw notFound('设备不存在');

  if (input.asset_no !== undefined && input.asset_no !== cur.asset_no) {
    const v = str(input.asset_no, 60);
    if (!v) throw bad('资产编号不能为空');
    if (get('SELECT id FROM device WHERE asset_no=? AND id<>? AND deleted_at IS NULL', v, id)) {
      throw bad(`资产编号「${v}」已存在`);
    }
  }
  if (input.sn !== undefined) {
    const v = str(input.sn, 80).replace(/\s+/g, '');
    if (v && v.toLowerCase() !== String(cur.sn || '').toLowerCase()) {
      const dup = get('SELECT id,asset_no FROM device WHERE sn=? COLLATE NOCASE AND id<>? AND deleted_at IS NULL', v, id);
      if (dup) throw new HttpError(409, `SN「${v}」已存在于资产 ${dup.asset_no}`, { conflict_device_id: dup.id });
    }
  }
  if (input.category_id) categoryGet(input.category_id);
  if (input.org_id) orgGet(input.org_id);

  const data = normalizeDeviceInput(input, cur);
  const changes = [];
  for (const f of DEVICE_FIELDS) {
    if (input[f] === undefined) continue;
    const oldV = cur[f];
    const newV = data[f];
    if (String(oldV ?? '') !== String(newV ?? '')) {
      changes.push({ field: f, old: oldV, next: newV });
    }
  }

  const extra = input.extra !== undefined
    ? JSON.stringify(input.extra && typeof input.extra === 'object' ? input.extra : {})
    : cur.extra;

  const patch = { updated_at: nowISO(), extra };
  for (const f of DEVICE_FIELDS) {
    patch[f] = data[f] === undefined ? cur[f] : data[f];
  }
  update('device', id, patch);

  if (changes.length) {
    deviceLog(id, 'update', changes, operator, '');
  }
  return deviceGet(id);
}

export function deviceDelete(id, operator = '') {
  const cur = get('SELECT * FROM device WHERE id=? AND deleted_at IS NULL', id);
  if (!cur) throw notFound('设备不存在');
  update('device', id, { deleted_at: nowISO(), updated_at: nowISO() });
  deviceLog(id, 'delete', [], operator, `删除设备 ${cur.asset_no}`);
  return { deleted: 1 };
}

export function deviceRestore(id) {
  const cur = get('SELECT * FROM device WHERE id=?', id);
  if (!cur) throw notFound('设备不存在');
  // 恢复前检查资产编号/SN 是否与现有未删除设备冲突
  const dupAsset = get('SELECT id,asset_no FROM device WHERE asset_no=? AND id<>? AND deleted_at IS NULL', cur.asset_no, id);
  if (dupAsset) throw bad(`恢复失败：资产编号「${cur.asset_no}」已被其它设备占用`);
  if (cur.sn) {
    const dupSN = get('SELECT id,asset_no FROM device WHERE sn=? COLLATE NOCASE AND id<>? AND deleted_at IS NULL', cur.sn, id);
    if (dupSN) throw new HttpError(409, `恢复失败：SN「${cur.sn}」已被资产 ${dupSN.asset_no} 占用`, { conflict_device_id: dupSN.id });
  }
  update('device', id, { deleted_at: null, updated_at: nowISO() });
  deviceLog(id, 'restore', [], 'web', `从回收站恢复 ${cur.asset_no}`);
  return deviceGet(id);
}

/** 回收站：列出已软删除的设备 */
export function deletedDeviceList(q = {}) {
  const where = ['d.deleted_at IS NOT NULL'];
  const params = [];
  const kw = str(q.keyword, 100);
  if (kw) {
    where.push('(d.asset_no LIKE ? OR d.sn LIKE ? OR d.brand LIKE ? OR d.model LIKE ? OR d.owner_name LIKE ?)');
    for (let i = 0; i < 5; i++) params.push(`%${kw}%`);
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;
  const page = Math.max(1, Number(q.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(q.page_size || q.pageSize) || 20));
  const total = scalarP(`SELECT COUNT(*) AS c FROM device d ${whereSql}`, params);
  const rows = allP(`
    SELECT d.id, d.asset_no, d.sn, d.brand, d.model, d.status, d.owner_name, d.supplier,
           d.deleted_at, d.updated_at, d.created_at, d.category_id,
           o.name AS org_name, c.name AS category_name, c.icon AS category_icon, c.color AS category_color
    FROM device d
    LEFT JOIN org_unit o ON o.id = d.org_id
    LEFT JOIN device_category c ON c.id = d.category_id
    ${whereSql}
    ORDER BY d.deleted_at DESC
    LIMIT ? OFFSET ?
  `, [...params, pageSize, (page - 1) * pageSize]);
  return {
    total,
    page,
    page_size: pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
    items: rows,
    all_ids: total <= 2000 ? allP(`SELECT d.id FROM device d ${whereSql}`, params).map((r) => r.id) : [],
  };
}

/** 批量恢复 */
export function deviceRestoreMany(ids = []) {
  if (!Array.isArray(ids) || !ids.length) throw bad('请选择要恢复的设备');
  const result = { ok: 0, failed: 0, errors: [] };
  for (const id of ids) {
    try { deviceRestore(id); result.ok++; }
    catch (e) { result.failed++; if (result.errors.length < 50) result.errors.push({ id, message: e.message }); }
  }
  return result;
}

/** 彻底删除（不可恢复） */
export function devicePurge(id) {
  const cur = get('SELECT * FROM device WHERE id=?', id);
  if (!cur) throw notFound('设备不存在');
  tx(() => {
    run('DELETE FROM device_log WHERE device_id=?', id);
    run('DELETE FROM device WHERE id=?', id);
  });
  return { purged: 1, asset_no: cur.asset_no };
}

/** 清空回收站 */
export function devicePurgeAll(ids = []) {
  const list = Array.isArray(ids) && ids.length
    ? ids
    : all('SELECT id FROM device WHERE deleted_at IS NOT NULL').map((r) => r.id);
  let n = 0;
  tx(() => {
    for (const id of list) {
      run('DELETE FROM device_log WHERE device_id=?', id);
      n += run('DELETE FROM device WHERE id=?', id).changes || 0;
    }
  });
  return { purged: n };
}

export function deviceBulk(ids, action, payload = {}, operator = '') {
  if (!Array.isArray(ids) || !ids.length) throw bad('请选择要操作的设备');
  if (ids.length > 1000) throw bad('单次批量操作不能超过 1000 条');
  const result = { ok: 0, failed: 0, errors: [] };
  tx(() => {
    for (const id of ids) {
      try {
        switch (action) {
          case 'delete': deviceDelete(id, operator); break;
          case 'status': deviceUpdate(id, { status: payload.status }, operator); break;
          case 'move': deviceUpdate(id, { org_id: payload.org_id }, operator); break;
          case 'handover':
            deviceUpdate(id, {
              owner_name: payload.owner_name,
              owner_employee_no: payload.owner_employee_no,
              owner_phone: payload.owner_phone,
              org_id: payload.org_id,
              status: payload.status || 'in_use',
            }, operator);
            deviceLog(id, 'handover', [], operator, `交接给 ${payload.owner_name || ''}`);
            break;
          default: throw bad(`不支持的批量操作：${action}`);
        }
        result.ok++;
      } catch (e) {
        result.failed++;
        result.errors.push({ id, message: e.message });
      }
    }
  });
  return result;
}

export function deviceHistory(id) {
  deviceGet(id);
  return allP('SELECT * FROM device_log WHERE device_id=? ORDER BY created_at DESC LIMIT 200', [id]);
}

export function deviceLogAdd(id, action, note, operator, changes = []) {
  deviceLog(id, action, changes, operator, note);
}

/* ================================================================== *
 * 品牌 / 选项
 * ================================================================== */

export function brandOptions() {
  const rows = all(`
    SELECT brand AS v, COUNT(*) AS c FROM device
    WHERE deleted_at IS NULL AND brand IS NOT NULL AND brand <> ''
    GROUP BY brand ORDER BY c DESC, brand
  `);
  return rows;
}

export function deviceOptions() {
  const sys = getSetting('system', {}) || {};
  const configured = Array.isArray(sys.suppliers) ? sys.suppliers.filter(Boolean) : [];
  // 把库里已用到但不在配置里的供应商也带出来，避免历史数据在筛选时丢失
  const used = all(`
    SELECT supplier AS v FROM device
    WHERE deleted_at IS NULL AND supplier IS NOT NULL AND supplier <> ''
    GROUP BY supplier ORDER BY supplier
  `).map((r) => r.v);
  const suppliers = uniq([...configured, ...used]);

  return {
    statuses: DEVICE_STATUS,
    org_types: ORG_TYPES,
    categories: categoryList(),
    orgs: orgFlatWithPath().map(({ children, ...o }) => o),
    brands: brandOptions(),
    suppliers,
    suppliers_configured: configured,
    icons: CATEGORY_ICONS,
    // 前端用它判断分类专属字段该写进设备列还是 extra
    column_tracking_keys: COLUMN_TRACKING_KEYS,
  };
}

/* ================================================================== *
 * 照片归档设置（默认开启，无需人工干预）
 * ================================================================== */

/**
 * 手机拍照入库时，系统默认会把三份图都存下来：
 *   压缩图 → 识别与界面预览
 *   原图   → 设备详情的归档原件
 *   缩略图 → 导出 Excel 时嵌进单元格
 * 这些都不需要用户点任何按钮，这里只提供「要不要留原图 / 最多留多大」的兜底配置。
 */
export function photoSettings() {
  const s = getSetting('photo', {}) || {};
  return {
    keep_original: s.keep_original !== false,                    // 默认 true
    keep_thumb: s.keep_thumb !== false,                          // 默认 true
    max_original_mb: Number(s.max_original_mb) > 0 ? Number(s.max_original_mb) : 15,
    embed_in_excel: s.embed_in_excel !== false,                  // 默认 true
  };
}

export function savePhotoSettings(patch = {}) {
  const cur = photoSettings();
  const next = {
    keep_original: patch.keep_original === undefined ? cur.keep_original : !!patch.keep_original,
    keep_thumb: patch.keep_thumb === undefined ? cur.keep_thumb : !!patch.keep_thumb,
    max_original_mb: patch.max_original_mb === undefined ? cur.max_original_mb : Number(patch.max_original_mb) || cur.max_original_mb,
    embed_in_excel: patch.embed_in_excel === undefined ? cur.embed_in_excel : !!patch.embed_in_excel,
  };
  setSetting('photo', next);
  return next;
}

/* ================================================================== *
 * 统计看板
 * ================================================================== */

export function dashboard() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

  const kpi = {
    total: scalar('SELECT COUNT(*) AS c FROM device WHERE deleted_at IS NULL'),
    in_use: scalar(`SELECT COUNT(*) AS c FROM device WHERE deleted_at IS NULL AND status='in_use'`),
    in_stock: scalar(`SELECT COUNT(*) AS c FROM device WHERE deleted_at IS NULL AND status IN ('in_stock','idle')`),
    repair: scalar(`SELECT COUNT(*) AS c FROM device WHERE deleted_at IS NULL AND status='repair'`),
    scrapped: scalar(`SELECT COUNT(*) AS c FROM device WHERE deleted_at IS NULL AND status='scrapped'`),
    value: scalar('SELECT ROUND(SUM(COALESCE(purchase_price,0)),2) AS c FROM device WHERE deleted_at IS NULL') || 0,
    orgs: scalar('SELECT COUNT(*) AS c FROM org_unit'),
    categories: scalar('SELECT COUNT(*) AS c FROM device_category'),
    warranty_expiring: scalarP(
      'SELECT COUNT(*) AS c FROM device WHERE deleted_at IS NULL AND warranty_until IS NOT NULL AND warranty_until >= ? AND warranty_until <= ?',
      [todayStr, soon],
    ),
    warranty_expired: scalarP(
      'SELECT COUNT(*) AS c FROM device WHERE deleted_at IS NULL AND warranty_until IS NOT NULL AND warranty_until < ?',
      [todayStr],
    ),
    added_this_month: scalarP(`SELECT COUNT(*) AS c FROM device WHERE deleted_at IS NULL AND created_at >= ?`, [`${todayStr.slice(0, 7)}-01`]),
    added_today: scalarP(`SELECT COUNT(*) AS c FROM device WHERE deleted_at IS NULL AND created_at >= ?`, [`${todayStr}T00:00:00.000Z`]),
  };

  const byCategory = all(`
    SELECT COALESCE(c.name,'未分类') AS name, COALESCE(c.color,'#8a94a6') AS color, COUNT(*) AS value,
           ROUND(SUM(COALESCE(d.purchase_price,0)),2) AS amount
    FROM device d LEFT JOIN device_category c ON c.id=d.category_id
    WHERE d.deleted_at IS NULL GROUP BY c.id ORDER BY value DESC
  `);

  const byStatus = all(`
    SELECT status AS id, COUNT(*) AS value FROM device WHERE deleted_at IS NULL GROUP BY status
  `).map((r) => ({
    ...r,
    name: DEVICE_STATUS.find((s) => s.id === r.id)?.label || r.id,
    color: DEVICE_STATUS.find((s) => s.id === r.id)?.color || '#8a94a6',
  }));

  const byBrand = all(`
    SELECT COALESCE(brand,'未知') AS name, COUNT(*) AS value
    FROM device WHERE deleted_at IS NULL GROUP BY brand ORDER BY value DESC LIMIT 10
  `);

  const byOrg = orgDeviceStats()
    .filter((o) => o.own > 0)
    .slice(0, 12)
    .map((o) => ({ id: o.id, name: o.name, own: o.own, total: o.total, in_use: o.in_use }));

  const recent = all(`
    SELECT d.id, d.asset_no, d.brand, d.model, d.sn, d.status, d.owner_name, d.updated_at,
           c.name AS category_name, c.icon AS category_icon, o.name AS org_name
    FROM device d
    LEFT JOIN device_category c ON c.id=d.category_id
    LEFT JOIN org_unit o ON o.id=d.org_id
    WHERE d.deleted_at IS NULL ORDER BY d.updated_at DESC LIMIT 10
  `);

  const recentLogs = all(`
    SELECT l.*, d.asset_no, d.brand, d.model
    FROM device_log l LEFT JOIN device d ON d.id=l.device_id
    ORDER BY l.created_at DESC LIMIT 12
  `);

  const expiring = allP(`
    SELECT d.id, d.asset_no, d.brand, d.model, d.warranty_until, d.owner_name
    FROM device d
    WHERE d.deleted_at IS NULL AND d.warranty_until IS NOT NULL AND d.warranty_until <= ?
    ORDER BY d.warranty_until ASC LIMIT 10
  `, [soon]);

  const trend = all(`
    SELECT substr(created_at,1,7) AS month, COUNT(*) AS value
    FROM device WHERE deleted_at IS NULL AND created_at >= ?
    GROUP BY month ORDER BY month
  `, [`${new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 7)}-01`]);

  return { kpi, byCategory, byStatus, byBrand, byOrg, recent, recentLogs, expiring, trend, generated_at: nowISO() };
}

export function auditList({ limit = 100, offset = 0 } = {}) {
  return allP('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ? OFFSET ?', [Number(limit) || 100, Number(offset) || 0]);
}

function safeJson(s, fallback) {
  if (s === null || s === undefined) return fallback;
  if (typeof s === 'object') return s;
  try { return JSON.parse(s); } catch { return fallback; }
}
