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
  color              TEXT NOT NULL DEFAULT '#2563eb',
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

-- ============================================================
-- 11. GLPI Agent 上报令牌
--     agent 那侧配的是 user / password 做 HTTP Basic，所以令牌就是密码。
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_token (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  token_hash   TEXT NOT NULL,                        -- SHA-256；令牌是高熵随机串，慢哈希反而拖慢每次上报
  prefix       TEXT,                                 -- 明文前 8 位，只为人工辨认「是哪一个」
  enabled      INTEGER NOT NULL DEFAULT 1,
  note         TEXT,
  created_by   TEXT,
  created_at   TEXT NOT NULL,
  last_used_at TEXT,
  last_ip      TEXT,
  use_count    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_agent_token_hash ON agent_token(token_hash);

-- ============================================================
-- 12. Agent 自动盘点上来的机器
--     ⚠️ 刻意**不直接写进 device**：agent 报的是机器自己的 SN，
--     和企业资产编号没有任何关系，直接入库会污染台账。
--     先落在这里，人工认领之后才和正式台账建关联。
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_machine (
  id                TEXT PRIMARY KEY,
  deviceid          TEXT NOT NULL,                   -- agent 自己的 deviceid（同一台机器稳定不变）
  tag               TEXT,                            -- agent 配置的 tag
  hostname          TEXT,
  domain            TEXT,
  sn                TEXT,                            -- bios.ssn ← 主匹配键
  sn_alt            TEXT,                            -- bios.msn 清洗后的备选
  assettag          TEXT,                            -- bios.assettag（部分厂商把资产标签放这儿）
  uuid              TEXT,                            -- hardware.uuid ← 第二匹配键（比 SN 更稳）
  manufacturer      TEXT,
  model             TEXT,
  chassis_type      TEXT,                            -- Laptop / Desktop / Server / Tower ...
  machine_kind      TEXT,                            -- pc / nb / srv / other（我们判出来的分类建议）
  vmsystem          TEXT,                            -- Physical / VMware / VirtualBox ...
  os_name           TEXT,
  os_version        TEXT,
  os_arch           TEXT,
  cpu               TEXT,
  cpu_cores         INTEGER,
  cpu_threads       INTEGER,
  ram_mb            INTEGER,
  disk_summary      TEXT,
  last_user         TEXT,
  mac_primary       TEXT,
  ip_primary        TEXT,
  networks_json     TEXT NOT NULL DEFAULT '[]',
  software_count    INTEGER,
  software_top      TEXT NOT NULL DEFAULT '[]',      -- 只留前 20 个名字：几百条软件塞进库毫无意义还拖慢查询
  sections_json     TEXT NOT NULL DEFAULT '{}',      -- 按段合并后的快照（部分盘点就靠它）
  agent_name        TEXT,
  agent_version     TEXT,
  first_seen_at     TEXT NOT NULL,
  last_seen_at      TEXT NOT NULL,
  report_count      INTEGER NOT NULL DEFAULT 0,
  partial_count     INTEGER NOT NULL DEFAULT 0,
  claimed_device_id TEXT,                            -- 认领后指向 device.id
  auto_sync         INTEGER NOT NULL DEFAULT 1,      -- 认领后是否把盘点结果同步进台账
  last_sync_at      TEXT,
  remark            TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_machine_deviceid ON agent_machine(deviceid);
CREATE INDEX IF NOT EXISTS idx_agent_machine_sn ON agent_machine(sn);
CREATE INDEX IF NOT EXISTS idx_agent_machine_uuid ON agent_machine(uuid);
CREATE INDEX IF NOT EXISTS idx_agent_machine_claimed ON agent_machine(claimed_device_id);
CREATE INDEX IF NOT EXISTS idx_agent_machine_seen ON agent_machine(last_seen_at DESC);

-- ============================================================
-- 13. Agent 报上来的显示器（EDID）
--     monitors[].serial 才是序列号；description 是「尺寸/年份」（如 "32/2015"），别当成 SN。
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_monitor (
  id                TEXT PRIMARY KEY,
  machine_id        TEXT NOT NULL REFERENCES agent_machine(id) ON DELETE CASCADE,
  edid_key          TEXT NOT NULL,                   -- 同机去重用的稳定键
  serial            TEXT,
  caption           TEXT,                            -- 型号代号，如 DJCP6
  name              TEXT,
  manufacturer      TEXT,
  size_inch         INTEGER,                         -- 从 description 解出来
  made_year         INTEGER,
  edid_seen         INTEGER NOT NULL DEFAULT 0,
  first_seen_at     TEXT NOT NULL,
  last_seen_at      TEXT NOT NULL,
  claimed_device_id TEXT                               -- 认领到哪台显示器资产
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_monitor_key ON agent_monitor(machine_id, edid_key);

-- ============================================================
-- 14. Agent 上报日志（谁、什么时候、用哪个令牌、报了什么）
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_report (
  id            TEXT PRIMARY KEY,
  deviceid      TEXT,
  machine_id    TEXT,
  action        TEXT,
  itemtype      TEXT,
  partial       INTEGER NOT NULL DEFAULT 0,
  sections      TEXT NOT NULL DEFAULT '[]',
  bytes         INTEGER,
  format        TEXT,                                -- json / gzip / zlib / br / xml
  token_id      TEXT,
  token_name    TEXT,
  ip            TEXT,
  agent_name    TEXT,
  agent_version TEXT,
  result        TEXT,                                -- ok / error
  message       TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_report_time ON agent_report(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_report_dev ON agent_report(deviceid, created_at DESC);

