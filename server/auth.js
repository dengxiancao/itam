/**
 * 账户系统：多用户、角色权限、会话、登录审计
 *
 * 角色（权限矩阵见 PERMS）：
 *   admin    系统管理员  —— 全部权限，含用户管理与系统设置
 *   manager  资产管理员  —— 设备增删改、组织/分类、Excel 导入导出、回收站、审计
 *   operator 录入员      —— 查看 + 新增/编辑设备（含手机拍照录入）
 *   viewer   只读        —— 只能查看
 *
 * 安全设计：
 *   - 口令 scrypt 加盐哈希，库内无明文
 *   - 会话为 HMAC 签名 Cookie，携带 token_version；改密/禁用/删除即失效
 *   - 登录失败双保险：按 IP 限流 + 按账号锁定
 *   - 所有登录/登出/失败/注册/锁定写入 login_log
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  all, get, run, insert, update, getSetting, setSetting, scalar, DATA_DIR, allP, getP, runP, scalarP,
} from './db.js';
import { uuid, nowISO, HttpError, str } from './util.js';

export const COOKIE_NAME = 'itam_session';
const SECRET_KEY = 'session_secret';
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const TTL_DEFAULT = 7 * 24 * 3600 * 1000;
const TTL_REMEMBER = 30 * 24 * 3600 * 1000;
export const SESSION_TTL = { default: TTL_DEFAULT, remember: TTL_REMEMBER };

const INITIAL_PW_FILE = path.join(DATA_DIR, 'admin-password.txt');

/* ================================================================== *
 * 角色与权限
 * ================================================================== */

export const ROLES = [
  { id: 'admin', label: '系统管理员', desc: '全部权限，含用户管理与系统设置' },
  { id: 'manager', label: '资产管理员', desc: '设备增删改、组织分类、Excel 导入导出、回收站' },
  { id: 'operator', label: '录入员', desc: '可查看并新增/编辑设备（含手机拍照录入），不能删除' },
  { id: 'viewer', label: '只读', desc: '只能查看数据，不能做任何修改' },
];

export const ROLE_IDS = ROLES.map((r) => r.id);

/** 每个角色拥有的权限点；admin 用 * 通配 */
const PERMS = {
  admin: ['*'],
  manager: [
    'device.read', 'device.write', 'device.delete',
    'excel.import', 'excel.export',
    'org.write', 'category.write',
    'trash.manage', 'audit.read', 'settings.read',
  ],
  operator: ['device.read', 'device.write', 'excel.export'],
  viewer: ['device.read'],
};

export function can(user, perm) {
  if (!user || user.status !== 'active') return false;
  if (user.role === 'admin') return true;
  const list = PERMS[user.role] || [];
  return list.includes(perm);
}

export function permissionsOf(role) {
  if (role === 'admin') return ['*'];
  return PERMS[role] || [];
}

const USER_STATUS = [
  { id: 'active', label: '正常' },
  { id: 'pending', label: '待审核' },
  { id: 'disabled', label: '已停用' },
];

/* ================================================================== *
 * 口令
 * ================================================================== */

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(pw), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(pw, stored) {
  try {
    const [alg, N, r, p, saltB64, hashB64] = String(stored || '').split('$');
    if (alg !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const actual = crypto.scryptSync(String(pw), salt, expected.length, { N: Number(N), r: Number(r), p: Number(p) });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** 密码强度校验；返回错误信息或 null */
export function checkPasswordStrength(pw, username = '') {
  const s = String(pw || '');
  if (s.length < 8) return '密码至少 8 位';
  if (s.length > 128) return '密码过长（最多 128 位）';
  if (/^\d+$/.test(s)) return '密码不能是纯数字';
  if (/^[a-zA-Z]+$/.test(s)) return '密码不能是纯字母，请混合数字或符号';
  if (username && s.toLowerCase() === String(username).toLowerCase()) return '密码不能与用户名相同';
  const weak = ['12345678', 'password', 'admin123', '88888888', 'qwertyui', '11111111'];
  if (weak.includes(s.toLowerCase())) return '密码过于简单，请更换';
  return null;
}

function generatePassword(len = 12) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const pick = () => alphabet[crypto.randomInt(0, alphabet.length)];
  const groups = [];
  for (let g = 0; g < 3; g++) {
    let s = '';
    for (let i = 0; i < Math.ceil(len / 3); i++) s += pick();
    groups.push(s);
  }
  return groups.join('-');
}

/* ================================================================== *
 * 用户查询与增删改
 * ================================================================== */

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    display_name: u.display_name,
    role: u.role,
    role_label: ROLES.find((r) => r.id === u.role)?.label || u.role,
    status: u.status,
    status_label: USER_STATUS.find((s) => s.id === u.status)?.label || u.status,
    email: u.email,
    phone: u.phone,
    org_id: u.org_id,
    remark: u.remark,
    must_change: !!u.must_change,
    locked_until: u.locked_until,
    last_login_at: u.last_login_at,
    last_login_ip: u.last_login_ip,
    login_count: u.login_count,
    created_by: u.created_by,
    created_at: u.created_at,
    updated_at: u.updated_at,
  };
}

export function findUserByName(username) {
  if (!username) return null;
  return getP('SELECT * FROM app_user WHERE username = ? COLLATE NOCASE', [String(username).trim()]) || null;
}

export function findUserById(id) {
  if (!id) return null;
  return getP('SELECT * FROM app_user WHERE id = ?', [id]) || null;
}

export function userList({ keyword, role, status, page = 1, page_size = 50 } = {}) {
  const where = [];
  const params = [];
  if (keyword) {
    where.push('(username LIKE ? OR display_name LIKE ? OR email LIKE ? OR phone LIKE ?)');
    for (let i = 0; i < 4; i++) params.push(`%${keyword}%`);
  }
  if (role) { where.push('role = ?'); params.push(role); }
  if (status) { where.push('status = ?'); params.push(status); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const size = Math.min(200, Math.max(1, Number(page_size) || 50));
  const p = Math.max(1, Number(page) || 1);
  const total = scalarP(`SELECT COUNT(*) AS c FROM app_user ${whereSql}`, params);
  const rows = allP(`SELECT * FROM app_user ${whereSql} ORDER BY
      CASE role WHEN 'admin' THEN 0 WHEN 'manager' THEN 1 WHEN 'operator' THEN 2 ELSE 3 END,
      created_at LIMIT ? OFFSET ?`, [...params, size, (p - 1) * size]);
  return {
    total, page: p, page_size: size,
    pages: Math.max(1, Math.ceil(total / size)),
    items: rows.map(publicUser),
  };
}

export function adminCount() {
  return scalarP("SELECT COUNT(*) AS c FROM app_user WHERE role='admin' AND status='active'", []) || 0;
}

function assertUsername(username, excludeId = null) {
  const name = String(username || '').trim();
  if (!/^[A-Za-z0-9_.@-]{3,40}$/.test(name)) {
    throw new HttpError(400, '用户名需为 3~40 位的字母、数字、下划线、点、@ 或短横线');
  }
  const dup = excludeId
    ? getP('SELECT id FROM app_user WHERE username = ? COLLATE NOCASE AND id <> ?', [name, excludeId])
    : getP('SELECT id FROM app_user WHERE username = ? COLLATE NOCASE', [name]);
  if (dup) throw new HttpError(400, `用户名「${name}」已被占用`);
  return name;
}

export function createUser(input, operator = 'system') {
  const username = assertUsername(input.username);
  const role = ROLE_IDS.includes(input.role) ? input.role : 'operator';
  const status = USER_STATUS.some((s) => s.id === input.status) ? input.status : 'active';

  const err = checkPasswordStrength(input.password, username);
  if (err) throw new HttpError(400, err);

  const id = uuid();
  const now = nowISO();
  insert('app_user', {
    id,
    username,
    display_name: str(input.display_name, 40) || username,
    password_hash: hashPassword(input.password),
    role,
    status,
    email: str(input.email, 120) || null,
    phone: str(input.phone, 30) || null,
    org_id: input.org_id || null,
    remark: str(input.remark, 200) || null,
    must_change: input.must_change ? 1 : 0,
    token_version: 1,
    failed_attempts: 0,
    locked_until: null,
    last_login_at: null,
    last_login_ip: null,
    login_count: 0,
    created_by: operator,
    created_at: now,
    updated_at: now,
  });
  return publicUser(findUserById(id));
}

export function updateUser(id, input, operator = 'system') {
  const cur = findUserById(id);
  if (!cur) throw new HttpError(404, '用户不存在');

  const patch = { updated_at: nowISO() };
  if (input.username !== undefined && String(input.username).trim() !== cur.username) {
    patch.username = assertUsername(input.username, id);
    patch.token_version = (cur.token_version || 1) + 1;   // 改名后旧会话失效
  }
  if (input.display_name !== undefined) patch.display_name = str(input.display_name, 40) || cur.username;
  if (input.email !== undefined) patch.email = str(input.email, 120) || null;
  if (input.phone !== undefined) patch.phone = str(input.phone, 30) || null;
  if (input.org_id !== undefined) patch.org_id = input.org_id || null;
  if (input.remark !== undefined) patch.remark = str(input.remark, 200) || null;

  if (input.role !== undefined && input.role !== cur.role) {
    if (!ROLE_IDS.includes(input.role)) throw new HttpError(400, '角色不合法');
    // 不允许把最后一个管理员降级
    if (cur.role === 'admin' && input.role !== 'admin' && adminCount() <= 1) {
      throw new HttpError(400, '这是最后一个系统管理员，不能降级');
    }
    patch.role = input.role;
    patch.token_version = (cur.token_version || 1) + 1;   // 角色变更立即生效
  }

  if (input.status !== undefined && input.status !== cur.status) {
    if (!USER_STATUS.some((s) => s.id === input.status)) throw new HttpError(400, '状态不合法');
    if (cur.role === 'admin' && input.status !== 'active' && adminCount() <= 1) {
      throw new HttpError(400, '这是最后一个系统管理员，不能停用');
    }
    patch.status = input.status;
    patch.token_version = (cur.token_version || 1) + 1;   // 停用/启用都让旧会话失效
    if (input.status === 'active') { patch.failed_attempts = 0; patch.locked_until = null; }
  }

  if (input.password) {
    const err = checkPasswordStrength(input.password, patch.username || cur.username);
    if (err) throw new HttpError(400, err);
    patch.password_hash = hashPassword(input.password);
    patch.must_change = input.must_change ? 1 : 0;
    patch.token_version = (cur.token_version || 1) + 1;
    patch.failed_attempts = 0;
    patch.locked_until = null;
  } else if (input.must_change !== undefined) {
    patch.must_change = input.must_change ? 1 : 0;
  }

  update('app_user', id, patch);
  return publicUser(findUserById(id));
}

export function deleteUser(id, operator = 'system') {
  const cur = findUserById(id);
  if (!cur) throw new HttpError(404, '用户不存在');
  if (cur.role === 'admin' && adminCount() <= 1) {
    throw new HttpError(400, '这是最后一个系统管理员，不能删除');
  }
  if (cur.username === operator) throw new HttpError(400, '不能删除当前登录的账号');
  runP('DELETE FROM app_user WHERE id = ?', [id]);
  return { deleted: 1 };
}

/** 管理员重置某用户密码，返回一次性明文密码 */
export function resetUserPassword(id, operator = 'system') {
  const cur = findUserById(id);
  if (!cur) throw new HttpError(404, '用户不存在');
  const pw = generatePassword();
  update('app_user', id, {
    password_hash: hashPassword(pw),
    must_change: 1,
    token_version: (cur.token_version || 1) + 1,
    failed_attempts: 0,
    locked_until: null,
    updated_at: nowISO(),
  });
  return { username: cur.username, password: pw };
}

/** 用户自己改密码 / 改资料 */
export function changeOwnPassword(userId, { oldPassword, newPassword, displayName }) {
  const cur = findUserById(userId);
  if (!cur) throw new HttpError(404, '用户不存在');
  if (!verifyPassword(oldPassword, cur.password_hash)) throw new HttpError(400, '当前密码不正确');
  const err = checkPasswordStrength(newPassword, cur.username);
  if (err) throw new HttpError(400, err);
  update('app_user', userId, {
    password_hash: hashPassword(newPassword),
    display_name: displayName ? str(displayName, 40) : cur.display_name,
    must_change: 0,
    token_version: (cur.token_version || 1) + 1,
    updated_at: nowISO(),
  });
  return publicUser(findUserById(userId));
}

/* ================================================================== *
 * 初始化 / 迁移
 * ================================================================== */

/**
 * 确保存在管理员账号。
 * 若库里已有老版本的单账号配置（app_setting.auth），自动迁移成 app_user 里的管理员，密码保持不变。
 * @returns {{user:object, generated:string|null}}
 */
export function ensureAdminUser() {
  const count = scalarP('SELECT COUNT(*) AS c FROM app_user', []) || 0;
  if (count > 0) return { user: publicUser(findUserById(getP("SELECT id FROM app_user WHERE role='admin' ORDER BY created_at LIMIT 1", [])?.id)), generated: null };

  const envPw = process.env.ITAM_ADMIN_PASSWORD;
  const legacy = getSetting('auth', null);
  const username = process.env.ITAM_ADMIN_USER
    || (legacy && legacy.username)
    || 'admin';

  let passwordHash;
  let generated = null;

  if (legacy && legacy.password_hash) {
    // 迁移老账号：沿用原来的用户名与密码哈希，用户无需重新设置密码
    passwordHash = legacy.password_hash;
  } else if (envPw && String(envPw).length >= 8) {
    passwordHash = hashPassword(envPw);
  } else {
    generated = generatePassword();
    passwordHash = hashPassword(generated);
  }

  const id = uuid();
  const now = nowISO();
  insert('app_user', {
    id,
    username,
    display_name: '系统管理员',
    password_hash: passwordHash,
    role: 'admin',
    status: 'active',
    email: null, phone: null, org_id: null,
    remark: legacy ? '由旧版单账号配置自动迁移' : '首次启动自动创建',
    must_change: 0,
    token_version: 1,
    failed_attempts: 0, locked_until: null,
    last_login_at: null, last_login_ip: null, login_count: 0,
    created_by: 'system',
    created_at: now, updated_at: now,
  });

  if (generated) {
    try {
      fs.writeFileSync(INITIAL_PW_FILE,
        `\uFEFF用户名: ${username}\r\n初始密码: ${generated}\r\n（登录后请立即修改；修改后本文件会被自动删除）\r\n`, 'utf8');
    } catch { /* ignore */ }
  }
  return { user: publicUser(findUserById(id)), generated };
}

/* ================================================================== *
 * 注册
 * ================================================================== */

export function registerConfig() {
  const sys = getSetting('system', {}) || {};
  return {
    allow: !!sys.allow_register,
    need_approval: sys.register_need_approval !== false,
    default_role: ROLE_IDS.includes(sys.register_default_role) ? sys.register_default_role : 'viewer',
  };
}

export function registerUser({ username, password, display_name, email, phone }, ip) {
  const cfg = registerConfig();
  if (!cfg.allow) throw new HttpError(403, '本系统未开放自助注册，请联系管理员开户');

  const name = assertUsername(username);
  const err = checkPasswordStrength(password, name);
  if (err) throw new HttpError(400, err);

  // 首个注册用户在没有任何账户时可自动成为管理员
  const anyUser = scalarP('SELECT COUNT(*) AS c FROM app_user', []) || 0;
  const role = anyUser === 0 ? 'admin' : cfg.default_role;
  const status = (anyUser === 0 || !cfg.need_approval) ? 'active' : 'pending';

  const id = uuid();
  const now = nowISO();
  insert('app_user', {
    id, username: name, display_name: str(display_name, 40) || name,
    password_hash: hashPassword(password),
    role, status,
    email: str(email, 120) || null, phone: str(phone, 30) || null,
    org_id: null, remark: '自助注册',
    must_change: 0, token_version: 1,
    failed_attempts: 0, locked_until: null,
    last_login_at: null, last_login_ip: null, login_count: 0,
    created_by: 'self-register', created_at: now, updated_at: now,
  });
  logLogin({ userId: id, username: name, action: 'register', ip, note: `注册成功（角色 ${role}，状态 ${status}）` });
  return { username: name, status, role, need_approval: status === 'pending' };
}

/* ================================================================== *
 * 登录日志
 * ================================================================== */

export function logLogin({ userId, username, action, ip, userAgent, note }) {
  try {
    insert('login_log', {
      id: uuid(), user_id: userId || null, username: username || null,
      action, ip: ip || '', user_agent: str(userAgent, 300) || '', note: note || null,
      created_at: nowISO(),
    });
  } catch { /* ignore */ }
}

export function loginLogList({ username, limit = 100 } = {}) {
  const where = username ? 'WHERE username = ? COLLATE NOCASE' : '';
  const params = username ? [username] : [];
  return allP(`SELECT * FROM login_log ${where} ORDER BY created_at DESC LIMIT ?`, [...params, Math.min(500, Number(limit) || 100)]);
}

/* ================================================================== *
 * 会话
 * ================================================================== */

function sessionSecret() {
  let s = getSetting(SECRET_KEY, null);
  if (!s) {
    s = crypto.randomBytes(32).toString('base64url');
    setSetting(SECRET_KEY, s);
  }
  return s;
}

export function signSession(user, ttlMs) {
  const payload = Buffer.from(JSON.stringify({
    uid: user.id, v: user.token_version || 1, iat: Date.now(), exp: Date.now() + ttlMs,
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function readToken(token) {
  if (!token || typeof token !== 'string') return null;
  const idx = token.lastIndexOf('.');
  if (idx <= 0) return null;
  const payload = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expect = crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

export function parseCookies(req) {
  const out = {};
  const raw = req.headers?.cookie;
  if (!raw) return out;
  for (const part of String(raw).split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/**
 * 从请求解析当前登录用户（校验签名、过期、账号状态、token_version）
 * @returns {object|null} 数据库用户行
 */
export function authenticate(req) {
  const data = readToken(parseCookies(req)[COOKIE_NAME]);
  if (!data) return null;
  const user = findUserById(data.uid);
  if (!user) return null;
  if (user.status !== 'active') return null;
  if ((user.token_version || 1) !== data.v) return null;
  return user;
}

export function sessionFromRequest(req) {
  const u = authenticate(req);
  return u ? { u: u.username, uid: u.id, role: u.role } : null;
}

export function setSessionCookie(res, token, maxAgeMs, secure) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/', 'HttpOnly', 'SameSite=Lax',
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
  ];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(res, secure) {
  const parts = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

/* ================================================================== *
 * 登录限流 + 账号锁定
 * ================================================================== */

const IP_MAX_FAILS = 10;
const IP_WINDOW_MS = 15 * 60 * 1000;
const ACC_MAX_FAILS = 5;
const ACC_LOCK_MS = 10 * 60 * 1000;
const ipFails = new Map();

/*
 * 全局登录失败闸门（**与来源 IP 无关**）。
 *
 * 为什么按 IP 计数不够：请求是经隧道/反代进来的，服务端看到的 IP 来自
 * X-Forwarded-For。哪怕我们做了「可信代理」判定，判定的正确性仍然取决于上游
 * 是**追加**还是**覆盖**这个头 —— 这是我们不能控制的外部条件。
 * 所以再加一道只看「失败总次数」的闸门：无论攻击者换多少 IP，总量到顶就一律拒。
 *
 * 阈值取 200 次 / 5 分钟：三人规模的 IT 部门正常手误远远到不了，
 * 但暴力破解也绝无可能。同时账号级锁定（5 次错 → 锁 10 分钟）仍然生效，
 * 两者一个管「面」一个管「点」。
 */
const GLOBAL_MAX_FAILS = Number(process.env.ITAM_LOGIN_GLOBAL_MAX || 200);
const GLOBAL_WINDOW_MS = 5 * 60 * 1000;
let globalFails = { count: 0, resetAt: 0 };

export function checkLoginRate(ip) {
  const now = Date.now();
  if (globalFails.count >= GLOBAL_MAX_FAILS && now < globalFails.resetAt) {
    const mins = Math.max(1, Math.ceil((globalFails.resetAt - now) / 60000));
    throw new HttpError(429, `登录失败次数过多，请 ${mins} 分钟后再试`);
  }
  const rec = ipFails.get(ip);
  if (!rec) return;
  if (Date.now() > rec.resetAt) { ipFails.delete(ip); return; }
  if (rec.count >= IP_MAX_FAILS) {
    const mins = Math.ceil((rec.resetAt - Date.now()) / 60000);
    throw new HttpError(429, `该 IP 登录失败次数过多，请 ${mins} 分钟后再试`);
  }
}

export function recordLoginFail(ip) {
  const now = Date.now();
  if (now > globalFails.resetAt) globalFails = { count: 0, resetAt: now + GLOBAL_WINDOW_MS };
  globalFails.count++;

  const rec = ipFails.get(ip);
  if (!rec || now > rec.resetAt) ipFails.set(ip, { count: 1, resetAt: now + IP_WINDOW_MS });
  else rec.count++;
}

export function clearLoginFail(ip) {
  // ⚠️ 只清「这个 IP」的计数，**不清全局计数** —— 否则攻击者只要手里有一个
  //    能登录的账号，成功一次就能把全局闸门重置掉。
  ipFails.delete(ip);
}

/** 账号级锁定检查 */
export function checkAccountLocked(user) {
  if (!user) return;
  if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
    const mins = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000);
    throw new HttpError(423, `账号已被锁定，请 ${mins} 分钟后再试，或联系管理员解锁`);
  }
}

export function bumpFailedAttempts(user) {
  const n = (user.failed_attempts || 0) + 1;
  const patch = { failed_attempts: n, updated_at: nowISO() };
  if (n >= ACC_MAX_FAILS) {
    patch.locked_until = new Date(Date.now() + ACC_LOCK_MS).toISOString();
    patch.failed_attempts = 0;
  }
  update('app_user', user.id, patch);
  return { attempts: n, locked: !!patch.locked_until };
}

export function clearFailedAttempts(user) {
  update('app_user', user.id, {
    failed_attempts: 0, locked_until: null,
    last_login_at: nowISO(), login_count: (user.login_count || 0) + 1,
    updated_at: nowISO(),
  });
}

export function recordLoginMeta(userId, ip) {
  update('app_user', userId, { last_login_ip: ip || '', updated_at: nowISO() });
}

/* ================================================================== *
 * 敏感字段脱敏
 * ================================================================== */

const SECRET_KEY_RE = /(key|secret|token|password|passwd|appcode|app_code)/i;

export function maskSecrets(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') out[k] = maskSecrets(v);
    else if (typeof v === 'string' && v && SECRET_KEY_RE.test(k)) out[k] = maskValue(v);
    else out[k] = v;
  }
  return out;
}

export function maskValue(v) {
  const s = String(v);
  if (s.includes('****')) return s;
  if (s.length <= 8) return '****';
  return `${s.slice(0, 4)}****${s.slice(-4)}`;
}

export function isMasked(v) {
  return typeof v === 'string' && v.includes('****');
}

export { generatePassword, publicUser, USER_STATUS, INITIAL_PW_FILE };
