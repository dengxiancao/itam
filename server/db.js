/**
 * 数据库层 —— 使用 Node.js 内置 node:sqlite（无需任何 npm 依赖）
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nowISO, uuid, logger } from './util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const EXPORT_DIR = path.join(DATA_DIR, 'exports');
export const BACKUP_DIR = path.join(DATA_DIR, 'backups');

for (const dir of [DATA_DIR, UPLOAD_DIR, EXPORT_DIR, BACKUP_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

// 允许用 ITAM_DB 指定数据库文件（测试时可指向独立临时库，避免污染真实数据）
const DB_FILE = process.env.ITAM_DB || path.join(DATA_DIR, 'itam.db');

export const db = new DatabaseSync(DB_FILE);

/* ------------------------------------------------------------------ *
 * PRAGMA —— 三条都是「不设就迟早出事」的
 *
 * 1) journal_mode = WAL
 *    默认的 rollback journal 每次写都要拿排他锁 + fsync，读写互斥。
 *    这个服务是「多个手机端 + 电脑端」并发写的场景，改 WAL 后读不阻塞写、
 *    写不阻塞读，是并发下最划算的一行。WAL 是持久化设置（写进库文件），
 *    设一次以后一直有效，但重复执行无害。
 *
 * 2) busy_timeout = 5000
 *    并发写撞锁时，SQLite 默认立刻抛 SQLITE_BUSY。给 5 秒重试窗口，
 *    避免「两个手机同时提交」这种正常操作直接报错。
 *
 * 3) foreign_keys = ON
 *    ⚠️ SQLite 的默认值是 **OFF**（出于向后兼容），也就是说 schema.sql 里
 *    写的 ON DELETE RESTRICT / SET NULL / CASCADE 之前**实际都没生效**。
 *    打开后：
 *      - device_log.device_id  ON DELETE CASCADE  → 删设备自动清历史
 *      - org_unit.parent_id    ON DELETE RESTRICT → 挡住「删掉还有子节点的组织」
 *      - device.org_id / category_id  SET NULL    → 删组织/分类自动置空引用
 *    现有业务代码（services.js 的 orgDelete / categoryDelete / devicePurge）
 *    本来就在手动做 SET NULL 和先删子表，与声明是**一致**的，所以打开它
 *    不会破坏成功路径，只是把「代码写漏了」的情况兜住。
 *    已用真实库副本实测：foreign_key_check 无违规，CASCADE / RESTRICT /
 *    SET NULL 三条行为都符合预期。
 *
 * 注意：foreign_keys 是「每个连接」的设置，进程重启要重新打开。
 * ------------------------------------------------------------------ */
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA busy_timeout = 5000');
db.exec('PRAGMA foreign_keys = ON');

/* ------------------------------------------------------------------ *
 * 迁移
 * ------------------------------------------------------------------ */
export function migrate() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(sql);
  ensureColumns('device', {
    photo_original_path: 'TEXT',   // 原图
    photo_thumb_path: 'TEXT',      // 缩略图（导出 Excel 嵌入用）
  });
  upgradeSeedColors();
  logger.info(`数据库就绪: ${DB_FILE}`);
}

/**
 * 把「出厂配色」从老的 iOS 系统色换成 v3 企业色阶。
 *
 * 分类色是种子里写进 device_category 的，老库不会因为改了 DEFAULT_CATEGORIES 而自动更新，
 * 结果就是一个库上跑着两套调色板（新装的库是 v3，老库还是 #4f8cff 那套），图表看着很不统一。
 *
 * 只改「颜色还等于某个老色值」的行 —— 用户自己调过的颜色（不管是改成别的还是又改回老色值）
 * 一律不动，避免覆盖人家的设置。幂等，跑多少次都一样。
 */
const LEGACY_SEED_COLORS = [
  { code: 'PC', from: '#4f8cff', to: '#2563eb' },   // 台式主机
  { code: 'NB', from: '#22c4a0', to: '#0ea5e9' },   // 笔记本电脑
  { code: 'MON', from: '#a06bff', to: '#8b5cf6' },  // 显示器
  { code: 'PRT', from: '#ff9f43', to: '#f59e0b' },  // 打印机
  { code: 'NET', from: '#00b8d9', to: '#14b8a6' },  // 网络设备
  { code: 'SRV', from: '#ff5c8a', to: '#ef4444' },  // 服务器
  { code: 'MB', from: '#2bd67b', to: '#ec4899' },   // 手机/平板
  { code: 'ACC', from: '#8a94a6', to: '#64748b' },  // 外设配件
];

function upgradeSeedColors() {
  // 逐条「按 code + 老色值」精确匹配：只有当这个分类还挂着出厂色时才改。
  // 用 code 收窄是为了不误伤用户自建分类；用老色值收窄是为了不覆盖用户手动调过的颜色。
  const stmt = db.prepare('UPDATE device_category SET color = ? WHERE code = ? AND color = ?');
  let changed = 0;
  for (const { code, from, to } of LEGACY_SEED_COLORS) {
    changed += Number(stmt.run(to, code, from).changes || 0);
  }
  if (changed) logger.info(`数据库升级：${changed} 个默认分类的颜色已更新为 v3 企业色阶`);
}

/**
 * 给已存在的表补列（老库升级用）。
 * SQLite 没有 ADD COLUMN IF NOT EXISTS，所以先查 PRAGMA 再决定。
 */
export function ensureColumns(table, columns) {
  const existing = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
  for (const [name, type] of Object.entries(columns)) {
    if (existing.has(name)) continue;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
    logger.info(`数据库升级：${table} 增加列 ${name}`);
  }
}

/* ------------------------------------------------------------------ *
 * 查询助手
 * ------------------------------------------------------------------ */

/** 查询多行：all(sql, a, b) 或 allParams(sql, [a, b]) */
export function all(sql, ...params) {
  return db.prepare(sql).all(...flattenParams(params));
}

/** 查询单行 */
export function get(sql, ...params) {
  return db.prepare(sql).get(...flattenParams(params)) ?? null;
}

/** 执行写入，返回 { changes, lastInsertRowid } */
export function run(sql, ...params) {
  return db.prepare(sql).run(...flattenParams(params));
}

/** 查询单值 */
export function scalar(sql, ...params) {
  const row = get(sql, ...params);
  if (!row) return null;
  return Object.values(row)[0] ?? null;
}

/** 数组参数版本（避免参数被当作数组展开） */
export function allP(sql, params = []) {
  return db.prepare(sql).all(...flattenParams([params]));
}
export function getP(sql, params = []) {
  return db.prepare(sql).get(...flattenParams([params])) ?? null;
}
export function runP(sql, params = []) {
  return db.prepare(sql).run(...flattenParams([params]));
}
export function scalarP(sql, params = []) {
  const row = getP(sql, params);
  if (!row) return null;
  return Object.values(row)[0] ?? null;
}

function flattenParams(params) {
  // 允许 run(sql, [a, b]) 与 run(sql, a, b) 两种写法
  const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
  return flat.map((p) => {
    if (p === undefined) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    if (p !== null && typeof p === 'object') return JSON.stringify(p);
    return p;
  });
}

/** 事务包装 */
export function tx(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    throw e;
  }
}

/** 插入一行的辅助函数 */
export function insert(table, obj) {
  const keys = Object.keys(obj);
  const sql = `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`;
  return run(sql, keys.map((k) => obj[k]));
}

/** 更新一行的辅助函数 */
export function update(table, id, obj) {
  const keys = Object.keys(obj);
  if (!keys.length) return { changes: 0 };
  const sql = `UPDATE ${table} SET ${keys.map((k) => `${k}=?`).join(',')} WHERE id=?`;
  return run(sql, [...keys.map((k) => obj[k]), id]);
}

/* ------------------------------------------------------------------ *
 * 设置项
 * ------------------------------------------------------------------ */
export function getSetting(key, fallback = null) {
  const row = get('SELECT value FROM app_setting WHERE key=?', key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return row.value; }
}

export function setSetting(key, value) {
  const v = typeof value === 'string' ? value : JSON.stringify(value);
  run(
    `INSERT INTO app_setting (key,value,updated_at) VALUES (?,?,?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
    key, v, nowISO(),
  );
}

export function allSettings() {
  const out = {};
  for (const row of all('SELECT key,value FROM app_setting')) {
    try { out[row.key] = JSON.parse(row.value); } catch { out[row.key] = row.value; }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 审计
 * ------------------------------------------------------------------ */
export function audit({ actor, ip, method, path: p, action, detail, status }) {
  try {
    insert('audit_log', {
      id: uuid(),
      actor: actor || 'anonymous',
      ip: ip || '',
      method: method || '',
      path: p || '',
      action: action || '',
      detail: typeof detail === 'string' ? detail : JSON.stringify(detail ?? null),
      status: status ?? 200,
      created_at: nowISO(),
    });
  } catch (e) {
    logger.warn('审计写入失败', e.message);
  }
}

/** 设备变更日志 */
export function deviceLog(deviceId, action, changes = [], operator = '', note = '') {
  if (!changes.length) {
    insert('device_log', {
      id: uuid(), device_id: deviceId, action, field: null,
      old_value: null, new_value: null, operator, note, created_at: nowISO(),
    });
    return;
  }
  for (const c of changes) {
    insert('device_log', {
      id: uuid(),
      device_id: deviceId,
      action,
      field: c.field,
      old_value: c.old === undefined || c.old === null ? null : String(c.old),
      new_value: c.next === undefined || c.next === null ? null : String(c.next),
      operator,
      note,
      created_at: nowISO(),
    });
  }
}

/* ------------------------------------------------------------------ *
 * 种子数据
 * ------------------------------------------------------------------ */
const DEFAULT_ORG = [
  { name: '总公司', type: 'company', code: 'HQ', children: [
    { name: '信息技术部', type: 'department', code: 'HQ-IT', children: [
      { name: '运维组', type: 'team', code: 'HQ-IT-OPS' },
      { name: '研发组', type: 'team', code: 'HQ-IT-DEV' },
    ]},
    { name: '行政人事部', type: 'department', code: 'HQ-HR' },
    { name: '财务部', type: 'department', code: 'HQ-FIN' },
    { name: '市场部', type: 'department', code: 'HQ-MKT' },
  ]},
  { name: '华东分公司', type: 'company', code: 'EAST', children: [
    { name: '技术支持部', type: 'department', code: 'EAST-TS' },
    { name: '销售部', type: 'department', code: 'EAST-SALES' },
  ]},
];

const DEFAULT_CATEGORIES = [
  {
    name: '台式主机', code: 'PC', code_prefix: 'PC', icon: 'pc', color: '#2563eb', sort_order: 10,
    tracking_fields: [
      { key: 'cpu', label: 'CPU', type: 'text' },
      { key: 'memory', label: '内存', type: 'text' },
      { key: 'disk', label: '硬盘', type: 'text' },
      { key: 'os_name', label: '操作系统', type: 'text' },
      { key: 'ip_address', label: 'IP 地址', type: 'text' },
      { key: 'mac_address', label: 'MAC 地址', type: 'text' },
    ],
  },
  {
    name: '显示器', code: 'MON', code_prefix: 'MON', icon: 'monitor', color: '#8b5cf6', sort_order: 30,
    tracking_fields: [
      { key: 'screen_size', label: '屏幕尺寸', type: 'select', options: ['24寸', '27寸'] },
      { key: 'resolution', label: '分辨率', type: 'text' },
      { key: 'interface', label: '接口类型', type: 'select', options: ['HDMI', 'DP', 'VGA', 'DVI', 'Type-C'] },
    ],
  },
  {
    name: '笔记本电脑', code: 'NB', code_prefix: 'NB', icon: 'laptop', color: '#0ea5e9', sort_order: 20,
    tracking_fields: [
      { key: 'cpu', label: 'CPU', type: 'text' },
      { key: 'memory', label: '内存', type: 'text' },
      { key: 'disk', label: '硬盘', type: 'text' },
      { key: 'os_name', label: '操作系统', type: 'text' },
      { key: 'screen_size', label: '屏幕尺寸', type: 'select', options: ['13.3寸', '14寸', '15.6寸', '16寸'] },
      { key: 'mac_address', label: 'MAC 地址', type: 'text' },
    ],
  },
  {
    name: '打印机', code: 'PRT', code_prefix: 'PRT', icon: 'printer', color: '#f59e0b', sort_order: 40,
    tracking_fields: [
      { key: 'print_type', label: '打印类型', type: 'text' },
      { key: 'ip_address', label: 'IP 地址', type: 'text' },
    ],
  },
  {
    name: '网络设备', code: 'NET', code_prefix: 'NET', icon: 'network', color: '#00b8d9', sort_order: 50,
    tracking_fields: [
      { key: 'ip_address', label: '管理 IP', type: 'text' },
      { key: 'mac_address', label: 'MAC 地址', type: 'text' },
      { key: 'ports', label: '端口数', type: 'text' },
    ],
  },
  {
    name: '服务器', code: 'SRV', code_prefix: 'SRV', icon: 'server', color: '#ef4444', sort_order: 60,
    tracking_fields: [
      { key: 'cpu', label: 'CPU', type: 'text' },
      { key: 'memory', label: '内存', type: 'text' },
      { key: 'disk', label: '硬盘', type: 'text' },
      { key: 'ip_address', label: 'IP 地址', type: 'text' },
      { key: 'rack_no', label: '机柜位', type: 'text' },
    ],
  },
  {
    name: '手机/平板', code: 'MB', code_prefix: 'MB', icon: 'phone', color: '#ec4899', sort_order: 70,
    tracking_fields: [
      { key: 'imei', label: 'IMEI', type: 'text' },
      { key: 'phone_no', label: '手机号', type: 'text' },
    ],
  },
  {
    name: '外设配件', code: 'ACC', code_prefix: 'ACC', icon: 'box', color: '#64748b', sort_order: 80,
    tracking_fields: [],
  },
];

export function seedIfEmpty({ withDemo = true } = {}) {
  const orgCount = scalar('SELECT COUNT(*) AS c FROM org_unit');
  if (!orgCount) {
    logger.info('初始化默认组织架构…');
    const insertNode = (node, parentId) => {
      const id = uuid();
      insert('org_unit', {
        id, parent_id: parentId, name: node.name, code: node.code || null,
        type: node.type || 'department', manager: null, phone: null, location: null,
        sort_order: 0, remark: null, created_at: nowISO(), updated_at: nowISO(),
      });
      for (const child of node.children || []) insertNode(child, id);
    };
    for (const n of DEFAULT_ORG) insertNode(n, null);
  }

  const catCount = scalar('SELECT COUNT(*) AS c FROM device_category');
  if (!catCount) {
    logger.info('初始化默认设备分类…');
    for (const c of DEFAULT_CATEGORIES) {
      insert('device_category', {
        id: uuid(), name: c.name, code: c.code, icon: c.icon, color: c.color,
        code_prefix: c.code_prefix, has_sn: 1,
        tracking_fields: JSON.stringify(c.tracking_fields || []),
        sort_order: c.sort_order || 0, remark: null,
        created_at: nowISO(), updated_at: nowISO(),
      });
    }
  }

  upgradeDefaultTrackingFields();

  if (!getSetting('ocr', null)) {
    setSetting('ocr', {
      provider: process.env.OCR_PROVIDER || 'mock',
      confidence_threshold: 0.55,
      auto_fill: true,
    });
  }
  // 系统设置：企业信息 + 供应商选项（默认只有易点云、小熊，可在系统设置里扩充）
  const DEFAULT_SYSTEM = {
    company_name: '示例科技有限公司',
    asset_no_pattern: '{PREFIX}-{YYYY}-{SEQ:4}',
    currency: 'CNY',
    suppliers: ['易点云', '小熊'],
  };
  const sys = getSetting('system', null);
  if (!sys) {
    setSetting('system', DEFAULT_SYSTEM);
  } else if (!Array.isArray(sys.suppliers)) {
    // 老库升级：补齐供应商字段，保留已有配置
    setSetting('system', { ...sys, suppliers: DEFAULT_SYSTEM.suppliers });
  }

  // 演示数据只在「全新数据库」写入一次。
  // 用 demo_seeded 标记做闸门：用户清空台账后，重启不能再把演示数据灌回来。
  const deviceCount = scalar('SELECT COUNT(*) AS c FROM device WHERE deleted_at IS NULL');
  const everSeeded = getSetting('demo_seeded', null);
  if (!deviceCount && withDemo && !everSeeded) {
    logger.info('写入演示数据…（仅首次，之后不会再自动生成）');
    seedDemoDevices();
    setSetting('demo_seeded', true);
  } else if (!everSeeded) {
    // 老库补齐标记，避免以后被误灌演示数据
    setSetting('demo_seeded', true);
  }
}

/* --------------------------- 字段升级 --------------------------- */

/**
 * 老库升级：把默认分类里「屏幕尺寸」这类字段从自由文本升级成下拉选项。
 * 只在该字段还是 text 类型时升级，不会覆盖用户自己改过的配置。
 */
function upgradeDefaultTrackingFields() {
  const UPGRADES = {
    MON: { screen_size: ['24寸', '27寸'] },
    NB: { screen_size: ['13.3寸', '14寸', '15.6寸', '16寸'] },
  };
  for (const [code, fields] of Object.entries(UPGRADES)) {
    const cat = get('SELECT * FROM device_category WHERE code=?', code);
    if (!cat) continue;
    let list;
    try { list = JSON.parse(cat.tracking_fields || '[]'); } catch { list = []; }
    if (!Array.isArray(list) || !list.length) continue;

    let changed = false;
    for (const f of list) {
      const opts = fields[f.key];
      if (opts && f.type !== 'select') {
        f.type = 'select';
        f.options = opts;
        changed = true;
      }
    }
    if (changed) {
      update('device_category', cat.id, {
        tracking_fields: JSON.stringify(list),
        updated_at: nowISO(),
      });
      logger.info(`已把「${cat.name}」的屏幕尺寸升级为下拉选项：${fields.screen_size.join(' / ')}`);
    }
  }
}

/* --------------------------- 演示数据 --------------------------- */
const DEMO = [
  ['PC', 'Dell', 'OptiPlex 7010', '信息技术部', 'in_use', '张伟', 'C02XK1AB', '研发组'],
  ['PC', '联想', 'ThinkCentre M720', '信息技术部', 'in_use', '李娜', 'PC0A9F31', '运维组'],
  ['NB', '联想', 'ThinkPad X1 Carbon', '市场部', 'in_use', '王强', 'PF2LK9Y7', null],
  ['NB', 'Apple', 'MacBook Pro 14 M3', '信息技术部', 'in_use', '刘洋', 'FVFGH2XK', '研发组'],
  ['NB', 'HP', 'EliteBook 840 G8', '财务部', 'idle', null, '5CG1234XYZ', null],
  ['MON', 'Dell', 'U2723QE', '信息技术部', 'in_use', '张伟', 'CN0M2K7P', '研发组'],
  ['MON', 'AOC', 'Q27G2S', '行政人事部', 'in_use', '陈静', 'AOC27G2S001', null],
  ['MON', '三星', 'S24R350', '华东分公司', 'in_stock', null, 'S24R350XY88', null],
  ['PRT', '惠普', 'LaserJet M404dn', '行政人事部', 'in_use', '陈静', 'VNC3K12345', null],
  ['PRT', '爱普生', 'L3153', '财务部', 'repair', null, 'EPL3153A77', null],
  ['NET', '华为', 'S5700-28C', '信息技术部', 'in_use', '李娜', '2102351ABC', '运维组'],
  ['NET', 'TP-Link', 'TL-SG1024D', '华东分公司', 'in_use', '赵敏', 'TPS1024D009', null],
  ['SRV', '戴尔', 'PowerEdge R750', '信息技术部', 'in_use', '李娜', 'SRV750X01', '运维组'],
  ['MB', 'Apple', 'iPhone 15', '销售部', 'in_use', '赵敏', 'IMEI356789012345', null],
  ['ACC', '罗技', 'MX Master 3S', '信息技术部', 'in_use', '刘洋', 'LGMX3S123', null],
  ['PC', '华硕', 'D700TC', '技术支持部', 'scrapped', null, 'ASUSD700TC1', null],
  ['MON', '飞利浦', '243V7', '技术支持部', 'lent', '周杰', 'PHL243V7002', null],
  ['NB', '小米', 'RedmiBook 14', '行政人事部', 'in_stock', null, 'XMIRB14A01', null],
];

function seedDemoDevices() {
  const cats = new Map(all('SELECT id,name,code,code_prefix FROM device_category').map((c) => [c.code, c]));
  const orgs = new Map(all('SELECT id,name FROM org_unit').map((o) => [o.name, o]));
  const year = new Date().getFullYear();
  let seq = 1;
  for (const [catCode, brand, model, orgName, status, owner, sn, teamName] of DEMO) {
    const cat = cats.get(catCode);
    if (!cat) continue;
    const org = orgs.get(orgName);
    const team = teamName ? orgs.get(teamName) : null;
    const purchase = `${year - 1}-0${(seq % 9) + 1}-15`;
    insert('device', {
      id: uuid(),
      asset_no: `IT-${year}-${String(seq).padStart(4, '0')}`,
      sn, brand, model,
      category_id: cat.id,
      org_id: (team || org)?.id ?? null,
      status,
      condition_grade: seq % 5 === 0 ? 'B' : 'A',
      owner_name: owner,
      owner_employee_no: owner ? `E${1000 + seq}` : null,
      owner_phone: owner ? `138${String(10000000 + seq * 137).slice(0, 8)}` : null,
      location: orgName,
      ip_address: catCode === 'NET' || catCode === 'SRV' ? `10.0.${seq}.${(seq * 7) % 250 + 2}` : null,
      mac_address: null,
      os_name: catCode === 'PC' || catCode === 'NB' ? (brand === 'Apple' ? 'macOS 14' : 'Windows 11 专业版') : null,
      cpu: catCode === 'PC' || catCode === 'NB' || catCode === 'SRV' ? 'Intel Core i7-13700' : null,
      memory: catCode === 'PC' || catCode === 'NB' || catCode === 'SRV' ? '16GB DDR4' : null,
      disk: catCode === 'PC' || catCode === 'NB' || catCode === 'SRV' ? '512GB NVMe SSD' : null,
      screen_size: catCode === 'MON' ? '27 英寸' : catCode === 'NB' ? '14 英寸' : null,
      purchase_date: purchase,
      warranty_until: `${year + 2}-0${(seq % 9) + 1}-15`,
      purchase_price: catCode === 'SRV' ? 68000 : catCode === 'NB' ? 8900 : catCode === 'MON' ? 1899 : 4500,
      supplier: '示例供应商',
      contract_no: `HT-${year}-${String(seq).padStart(3, '0')}`,
      department_code: org?.name,
      remark: null,
      extra: JSON.stringify({}),
      sn_source: 'import',
      created_by: 'system',
      created_at: nowISO(),
      updated_at: nowISO(),
    });
    seq++;
  }
}

export function nextAssetNo(categoryId) {
  const year = new Date().getFullYear();
  const cat = categoryId
    ? get('SELECT * FROM device_category WHERE id=?', categoryId)
    : null;
  const prefix = (cat?.code_prefix || cat?.code || 'IT').toUpperCase();
  const like = `${prefix}-${year}-%`;
  const row = get(
    `SELECT asset_no FROM device WHERE asset_no LIKE ? ORDER BY asset_no DESC LIMIT 1`,
    like,
  );
  let next = 1;
  if (row?.asset_no) {
    const m = String(row.asset_no).match(/(\d+)\s*$/);
    if (m) next = parseInt(m[1], 10) + 1;
  }
  // 冲突规避
  let candidate = `${prefix}-${year}-${String(next).padStart(4, '0')}`;
  while (get('SELECT 1 AS x FROM device WHERE asset_no=?', candidate)) {
    next++;
    candidate = `${prefix}-${year}-${String(next).padStart(4, '0')}`;
  }
  return candidate;
}
