PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ============================================================
-- 1. 组织架构（支持无限层级：集团 -> 公司 -> 部门 -> 科室）
-- ============================================================
CREATE TABLE IF NOT EXISTS org_unit (
  id           TEXT PRIMARY KEY,
  parent_id    TEXT REFERENCES org_unit(id) ON DELETE RESTRICT,
  name         TEXT NOT NULL,
  code         TEXT,
  type         TEXT NOT NULL DEFAULT 'department',   -- group/company/department/team/other
  manager      TEXT,
  phone        TEXT,
  location     TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  remark       TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_org_parent ON org_unit(parent_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_code ON org_unit(code) WHERE code IS NOT NULL AND code <> '';

-- ============================================================
-- 2. 设备分类（显示器 / 主机 / 笔记本 / 打印机 ...）
-- ============================================================
CREATE TABLE IF NOT EXISTS device_category (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  code               TEXT,
  icon               TEXT NOT NULL DEFAULT 'box',
  color              TEXT NOT NULL DEFAULT '#4f8cff',
  code_prefix        TEXT,                            -- 资产编号前缀，如 PC / MON
  has_sn             INTEGER NOT NULL DEFAULT 1,      -- 是否有 SN
  tracking_fields    TEXT NOT NULL DEFAULT '[]',      -- 额外字段定义(JSON)
  sort_order         INTEGER NOT NULL DEFAULT 0,
  remark             TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cat_name ON device_category(name);

-- ============================================================
-- 3. 设备资产主表
-- ============================================================
CREATE TABLE IF NOT EXISTS device (
  id                  TEXT PRIMARY KEY,
  asset_no            TEXT NOT NULL,                  -- 资产编号（企业内部）
  sn                  TEXT,                           -- 序列号 / SN
  brand               TEXT,                           -- 品牌
  model               TEXT,                           -- 型号
  category_id         TEXT REFERENCES device_category(id) ON DELETE SET NULL,
  org_id              TEXT REFERENCES org_unit(id) ON DELETE SET NULL,
  status              TEXT NOT NULL DEFAULT 'in_stock', -- in_stock/in_use/idle/repair/scrapped/lent/lost
  condition_grade     TEXT,                           -- 新旧程度 A/B/C
  owner_name          TEXT,                           -- 使用人
  owner_employee_no   TEXT,                           -- 使用人工号
  owner_phone         TEXT,
  location            TEXT,                           -- 存放位置
  ip_address          TEXT,
  mac_address         TEXT,
  os_name             TEXT,
  cpu                 TEXT,
  memory              TEXT,
  disk                TEXT,
  screen_size         TEXT,
  purchase_date       TEXT,
  warranty_until      TEXT,
  purchase_price      REAL,
  supplier            TEXT,
  contract_no         TEXT,
  department_code     TEXT,
  remark              TEXT,
  extra               TEXT NOT NULL DEFAULT '{}',     -- 分类自定义字段(JSON)
  photo_path          TEXT,                           -- 现场照片相对路径（压缩图，识别与预览用）
  sn_photo_path       TEXT,                           -- SN 铭牌照片相对路径
  photo_original_path TEXT,                           -- 原图（手机拍摄的完整分辨率照片）
  photo_thumb_path    TEXT,                           -- 缩略图（小图，导出 Excel 时嵌入）
  sn_source           TEXT,                           -- ocr / manual / scan / import
  ocr_confidence      REAL,
  ocr_raw             TEXT,                           -- OCR 原始返回(JSON 字符串)
  created_by          TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  deleted_at          TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_device_asset_no ON device(asset_no) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_device_sn      ON device(sn);
CREATE INDEX IF NOT EXISTS idx_device_org     ON device(org_id);
CREATE INDEX IF NOT EXISTS idx_device_cat     ON device(category_id);
CREATE INDEX IF NOT EXISTS idx_device_status  ON device(status);
CREATE INDEX IF NOT EXISTS idx_device_brand   ON device(brand);
CREATE INDEX IF NOT EXISTS idx_device_updated ON device(updated_at DESC);

-- ============================================================
-- 4. 设备状态变更 / 流转记录
-- ============================================================
CREATE TABLE IF NOT EXISTS device_log (
  id          TEXT PRIMARY KEY,
  device_id   TEXT NOT NULL REFERENCES device(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,        -- create/update/move/handover/repair/scrap/import/ocr
  field       TEXT,
  old_value   TEXT,
  new_value   TEXT,
  operator    TEXT,
  note        TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_log_device ON device_log(device_id, created_at DESC);

-- ============================================================
-- 5. 系统设置（OCR 密钥等）-- ============================================================
CREATE TABLE IF NOT EXISTS app_setting (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  updated_at  TEXT NOT NULL
);

-- ============================================================
-- 6. 操作审计
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,
  actor       TEXT,
  ip          TEXT,
  method      TEXT,
  path        TEXT,
  action      TEXT,
  detail      TEXT,
  status      INTEGER,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(created_at DESC);

-- ============================================================
-- 7. 移动端设备注册（哪台手机在用）
-- ============================================================
CREATE TABLE IF NOT EXISTS mobile_client (
  id          TEXT PRIMARY KEY,
  device_name TEXT,
  operator    TEXT,
  user_agent  TEXT,
  last_seen   TEXT,
  created_at  TEXT NOT NULL
);

-- ============================================================
-- 8. 导入批次
-- ============================================================
CREATE TABLE IF NOT EXISTS import_batch (
  id          TEXT PRIMARY KEY,
  filename    TEXT,
  total       INTEGER NOT NULL DEFAULT 0,
  success     INTEGER NOT NULL DEFAULT 0,
  failed      INTEGER NOT NULL DEFAULT 0,
  errors      TEXT NOT NULL DEFAULT '[]',
  operator    TEXT,
  created_at  TEXT NOT NULL
);

-- ============================================================
-- 9. 用户账号（多用户 + 角色权限）
-- ============================================================
CREATE TABLE IF NOT EXISTS app_user (
  id               TEXT PRIMARY KEY,
  username         TEXT NOT NULL,                        -- 登录名（唯一，大小写不敏感）
  display_name     TEXT,                                 -- 姓名
  password_hash    TEXT NOT NULL,
  role             TEXT NOT NULL DEFAULT 'operator',     -- admin/manager/operator/viewer
  status           TEXT NOT NULL DEFAULT 'active',       -- active/disabled/pending
  email            TEXT,
  phone            TEXT,
  org_id           TEXT,                                 -- 所属组织（可选）
  remark           TEXT,
  must_change      INTEGER NOT NULL DEFAULT 0,           -- 强制下次登录改密
  token_version    INTEGER NOT NULL DEFAULT 1,           -- 改密/禁用后旧会话失效
  failed_attempts  INTEGER NOT NULL DEFAULT 0,
  locked_until     TEXT,
  last_login_at    TEXT,
  last_login_ip    TEXT,
  login_count      INTEGER NOT NULL DEFAULT 0,
  created_by       TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_username ON app_user(username COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_user_status ON app_user(status);

-- ============================================================
-- 10. 登录日志（审计谁在什么时候从哪登录）
-- ============================================================
CREATE TABLE IF NOT EXISTS login_log (
  id          TEXT PRIMARY KEY,
  user_id     TEXT,
  username    TEXT,
  action      TEXT NOT NULL,        -- login / logout / login_failed / register / lockout
  ip          TEXT,
  user_agent  TEXT,
  note        TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_loginlog_time ON login_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loginlog_user ON login_log(username, created_at DESC);

