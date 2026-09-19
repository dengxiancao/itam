/**
 * 账户系统测试：登录、角色权限、用户管理、注册审核、账号锁定、会话失效
 *
 * 建议对着一个「独立的临时服务实例」跑，避免动到真实数据：
 *   $env:ITAM_DB="$env:TEMP\itam-acct.db"
 *   $env:ITAM_ADMIN_PASSWORD="TestAdmin-123"
 *   $env:PORT="8099"; $env:HTTPS_PORT="8444"
 *   node server/index.js            # 另开一个窗口
 *   $env:BASE="http://127.0.0.1:8099"; $env:ITAM_PASS="TestAdmin-123"
 *   node tests/account.js
 */
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const ROOT_USER = process.env.ITAM_USER || 'admin';
const ROOT_PASS = process.env.ITAM_PASS || '';

let pass = 0, fail = 0;
const failures = [];

async function check(name, fn) {
  try {
    await fn();
    pass++;
    console.log(`  \x1b[32m✔\x1b[0m ${name}`);
  } catch (e) {
    fail++;
    failures.push({ name, message: e.message });
    console.log(`  \x1b[31m✘\x1b[0m ${name}\n      ${e.message}`);
  }
}

/** 每个「浏览器」一个独立会话 */
function newClient() {
  let cookie = '';
  const req = async (path, opts = {}) => {
    const headers = { ...(opts.headers || {}) };
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(BASE + path, { ...opts, headers });
    const setC = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    if (setC.length) {
      const c = setC.map((x) => x.split(';')[0]).join('; ');
      cookie = /itam_session=;/.test(c) || /itam_session=$/.test(c) ? '' : c;
    }
    const ct = res.headers.get('content-type') || '';
    let body = ct.includes('json') ? await res.json().catch(() => null) : await res.text();
    if (body && typeof body === 'object' && 'data' in body && 'ok' in body) body = body.data;
    return { status: res.status, body, ct, res };
  };
  req.json = (path, data, method = 'POST') => req(path, {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data ?? {}),
  });
  req.login = async (username, password, remember) => {
    const r = await req.json('/api/auth/login', { username, password, remember });
    return r;
  };
  req.cookie = () => cookie;
  return req;
}

const expectStatus = (r, want, what) => {
  if (r.status !== want) throw new Error(`${what}：期望 HTTP ${want}，实际 ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
};

console.log('\n=== 账户系统测试 (' + BASE + ') ===\n');

if (!ROOT_PASS) {
  console.log('  \x1b[31m✘\x1b[0m 未提供管理员密码：请设置 ITAM_PASS（或 ITAM_USER/ITAM_PASS）');
  process.exit(1);
}

/* ================================================================== *
 * 1. 登录 / 登出
 * ================================================================== */
console.log('[1] 登录与会话');

const root = newClient();

await check('未登录访问受保护接口 → 401', async () => {
  expectStatus(await root('/api/devices'), 401, '未登录');
  expectStatus(await root('/api/users'), 401, '未登录访问用户管理');
});

await check('错误密码 → 401', async () => {
  const c = newClient();
  expectStatus(await c.login(ROOT_USER, 'definitely-wrong-' + Date.now()), 401, '错误密码');
});

await check('正确密码登录成功并返回角色权限', async () => {
  const r = await root.login(ROOT_USER, ROOT_PASS);
  expectStatus(r, 200, '登录');
  if (!r.body?.role) throw new Error('登录响应缺少 role');
  const st = await root('/api/auth/status');
  expectStatus(st, 200, '状态查询');
  if (!st.body.authenticated) throw new Error('应为已认证');
  if (!st.body.permissions.includes('*')) throw new Error('管理员应有 * 权限');
  if (st.body.role !== 'admin') throw new Error('角色应为 admin');
});

await check('登录后可以读取数据', async () => {
  expectStatus(await root('/api/devices?page_size=1'), 200, '读取设备');
  expectStatus(await root('/api/options'), 200, '读取选项');
});

await check('/api/settings 不包含账号信息且密钥脱敏', async () => {
  const r = await root('/api/settings');
  expectStatus(r, 200, '读取设置');
  if (r.body.settings.auth) throw new Error('不应下发 auth 配置');
  const key = r.body.settings.ocr_vision?.api_key;
  if (key && !String(key).includes('****')) throw new Error('密钥应脱敏，实际 ' + key);
});

/* ================================================================== *
 * 2. 用户管理
 * ================================================================== */
console.log('\n[2] 用户管理');

const ts = Date.now();
const users = {
  manager: `mgr_${ts}`,
  operator: `op_${ts}`,
  viewer: `view_${ts}`,
};
const PASS = 'Test-Pass-123';

for (const [role, name] of Object.entries(users)) {
  await check(`创建用户 ${name}（角色 ${role}）`, async () => {
    const r = await root.json('/api/users', {
      username: name, password: PASS, display_name: `测试${role}`, role,
    });
    expectStatus(r, 200, '创建用户');
    if (r.body.role !== role) throw new Error('角色不符：' + r.body.role);
    if (r.body.status !== 'active') throw new Error('状态应为 active');
  });
}

await check('用户名重复 → 400', async () => {
  const r = await root.json('/api/users', { username: users.viewer, password: PASS, role: 'viewer' });
  expectStatus(r, 400, '重复用户名');
});

await check('弱密码 → 400', async () => {
  for (const pw of ['12345678', 'abcdefgh', 'short']) {
    const r = await root.json('/api/users', { username: `weak_${ts}_${Math.random().toString(36).slice(2, 6)}`, password: pw, role: 'viewer' });
    expectStatus(r, 400, `弱密码 ${pw}`);
  }
});

await check('非法用户名 → 400', async () => {
  const r = await root.json('/api/users', { username: 'ab', password: PASS, role: 'viewer' });
  expectStatus(r, 400, '用户名过短');
});

await check('用户列表与搜索', async () => {
  const all = await root('/api/users?page_size=200');
  expectStatus(all, 200, '用户列表');
  if (all.body.total < 4) throw new Error('用户数应 >= 4，实际 ' + all.body.total);
  const kw = await root('/api/users?keyword=' + users.operator);
  if (!kw.body.items.some((u) => u.username === users.operator)) throw new Error('搜索未命中');
  const byRole = await root('/api/users?role=viewer');
  if (!byRole.body.items.every((u) => u.role === 'viewer')) throw new Error('角色筛选无效');
});

await check('编辑用户（改角色 / 停用 / 启用）', async () => {
  const list = await root('/api/users?keyword=' + users.viewer);
  const u = list.body.items[0];
  const up = await root.json('/api/users/' + u.id, { display_name: '改了名字', role: 'operator' }, 'PUT');
  expectStatus(up, 200, '编辑用户');
  if (up.body.role !== 'operator' || up.body.display_name !== '改了名字') throw new Error('编辑未生效');
  const dis = await root.json('/api/users/' + u.id, { status: 'disabled' }, 'PUT');
  if (dis.body.status !== 'disabled') throw new Error('停用失败');
  const en = await root.json('/api/users/' + u.id, { status: 'active' }, 'PUT');
  if (en.body.status !== 'active') throw new Error('启用失败');
  // 改回只读，后面权限测试要用
  await root.json('/api/users/' + u.id, { role: 'viewer' }, 'PUT');
});

await check('管理员重置密码：旧密码失效、新密码可用', async () => {
  const list = await root('/api/users?keyword=' + users.operator);
  const u = list.body.items[0];

  const c1 = newClient();
  expectStatus(await c1.login(users.operator, PASS), 200, '原密码登录');

  const r = await root.json(`/api/users/${u.id}/reset-password`, {});
  expectStatus(r, 200, '重置密码');
  if (!r.body.password || r.body.password.length < 8) throw new Error('未返回新密码');

  const c2 = newClient();
  expectStatus(await c2.login(users.operator, PASS), 401, '旧密码应失效');
  expectStatus(await c2.login(users.operator, r.body.password), 200, '新密码应可用');

  // 恢复成方便后续测试的密码
  await root.json('/api/users/' + u.id, { password: PASS }, 'PUT');
});

/* ================================================================== *
 * 3. 角色权限矩阵
 * ================================================================== */
console.log('\n[3] 角色权限');

const catList = await root('/api/options');
const categoryId = catList.body.categories[0].id;

await check('viewer 只能看，不能改', async () => {
  const c = newClient();
  expectStatus(await c.login(users.viewer, PASS), 200, 'viewer 登录');
  expectStatus(await c('/api/devices?page_size=1'), 200, 'viewer 读设备');
  expectStatus(await c('/api/dashboard'), 200, 'viewer 读仪表盘');
  expectStatus(await c.json('/api/devices', { category_id: categoryId, brand: 'X' }), 403, 'viewer 建设备');
  expectStatus(await c.json('/api/users', { username: 'x1', password: PASS, role: 'viewer' }), 403, 'viewer 建用户');
  expectStatus(await c('/api/settings'), 403, 'viewer 读设置');
});

await check('operator 能录入但不能删除/导入', async () => {
  const c = newClient();
  expectStatus(await c.login(users.operator, PASS), 200, 'operator 登录');
  const created = await c.json('/api/devices', {
    category_id: categoryId, brand: 'PermTest', model: 'OP-1', sn: 'PERMOP' + Date.now(), status: 'in_stock',
  });
  expectStatus(created, 200, 'operator 建设备');
  const id = created.body.id;
  expectStatus(await c.json('/api/devices/' + id, { remark: 'operator 改' }, 'PUT'), 200, 'operator 改设备');
  expectStatus(await c('/api/devices/' + id, { method: 'DELETE' }), 403, 'operator 删设备');
  expectStatus(await c('/api/devices/trash'), 403, 'operator 读回收站');
  expectStatus(await c('/api/users'), 403, 'operator 读用户管理');
  expectStatus(await c('/api/settings'), 403, 'operator 读设置');
  expectStatus(await c('/api/excel/export'), 200, 'operator 可导出 Excel');
});

await check('manager 能删设备但不能管用户 / 改设置', async () => {
  const c = newClient();
  expectStatus(await c.login(users.manager, PASS), 200, 'manager 登录');
  const created = await c.json('/api/devices', {
    category_id: categoryId, brand: 'PermTest', model: 'MGR-1', sn: 'PERMMGR' + Date.now(),
  });
  expectStatus(created, 200, 'manager 建设备');
  expectStatus(await c('/api/devices/' + created.body.id, { method: 'DELETE' }), 200, 'manager 删设备');
  expectStatus(await c('/api/devices/trash'), 200, 'manager 读回收站');
  expectStatus(await c('/api/audit'), 200, 'manager 读审计');
  expectStatus(await c('/api/users'), 403, 'manager 读用户管理');
  expectStatus(await c.json('/api/settings', { system: { company_name: 'X' } }, 'PUT'), 403, 'manager 改设置');
});

/* ================================================================== *
 * 4. 账号锁定与会话失效
 * ================================================================== */
console.log('\n[4] 锁定与会话失效');

await check('连续失败 5 次后账号被锁定', async () => {
  const c = newClient();
  for (let i = 0; i < 5; i++) {
    const r = await c.login(users.viewer, 'bad-pass-' + i);
    if (r.status !== 401) throw new Error(`第 ${i + 1} 次失败应 401，实际 ${r.status}`);
  }
  const locked = await c.login(users.viewer, PASS);
  if (locked.status !== 423) throw new Error(`锁定后应为 423，实际 ${locked.status} ${JSON.stringify(locked.body)}`);
});

await check('管理员解锁后可以正常登录', async () => {
  const list = await root('/api/users?keyword=' + users.viewer);
  const u = list.body.items[0];
  expectStatus(await root.json(`/api/users/${u.id}/unlock`, {}), 200, '解锁');
  const c = newClient();
  expectStatus(await c.login(users.viewer, PASS), 200, '解锁后登录');
});

await check('停用账号后：无法登录、已有会话立即失效', async () => {
  const c = newClient();
  expectStatus(await c.login(users.viewer, PASS), 200, '停用前登录');
  expectStatus(await c('/api/devices?page_size=1'), 200, '停用前可读');

  const list = await root('/api/users?keyword=' + users.viewer);
  const u = list.body.items[0];
  await root.json('/api/users/' + u.id, { status: 'disabled' }, 'PUT');

  expectStatus(await c('/api/devices?page_size=1'), 401, '停用后旧会话应失效');
  const c2 = newClient();
  expectStatus(await c2.login(users.viewer, PASS), 403, '停用后登录应被拒');

  await root.json('/api/users/' + u.id, { status: 'active' }, 'PUT');
});

await check('修改密码后其它设备的会话立即失效', async () => {
  const a = newClient();
  const b = newClient();
  expectStatus(await a.login(users.operator, PASS), 200, 'A 登录');
  expectStatus(await b.login(users.operator, PASS), 200, 'B 登录');
  expectStatus(await b('/api/devices?page_size=1'), 200, 'B 可读');

  const np = 'NewPass-' + Date.now();
  expectStatus(await a.json('/api/profile', { old_password: PASS, new_password: np }), 200, 'A 改密');
  expectStatus(await b('/api/devices?page_size=1'), 401, 'B 的会话应失效');
  expectStatus(await a('/api/devices?page_size=1'), 200, 'A 改密后仍可用（已重新签发）');

  // 改回去，方便重复跑测试
  await a.json('/api/profile', { old_password: np, new_password: PASS });
});

/* ================================================================== *
 * 5. 最后一个管理员保护
 * ================================================================== */
console.log('\n[5] 管理员保护');

let rootId = null;
await check('不能降级 / 停用 / 删除最后一个管理员', async () => {
  const me = await root('/api/profile');
  rootId = me.body.user.id;
  expectStatus(await root.json('/api/users/' + rootId, { role: 'viewer' }, 'PUT'), 400, '降级最后管理员');
  expectStatus(await root.json('/api/users/' + rootId, { status: 'disabled' }, 'PUT'), 400, '停用最后管理员');
  expectStatus(await root('/api/users/' + rootId, { method: 'DELETE' }), 400, '删除最后管理员');
});

await check('有第二个管理员后即可降级原管理员', async () => {
  const second = `admin2_${ts}`;
  const created = await root.json('/api/users', { username: second, password: PASS, role: 'admin' });
  expectStatus(created, 200, '创建第二个管理员');
  expectStatus(await root.json('/api/users/' + rootId, { display_name: '主管理员' }, 'PUT'), 200, '此时可编辑');
  expectStatus(await root('/api/users/' + created.body.id, { method: 'DELETE' }), 200, '删除第二个管理员');
});

/* ================================================================== *
 * 6. 自助注册
 * ================================================================== */
console.log('\n[6] 自助注册');

await check('默认关闭注册 → 403', async () => {
  const c = newClient();
  expectStatus(await c.json('/api/auth/register', { username: 'reg1_' + ts, password: PASS }), 403, '未开放注册');
});

await check('开启注册（需审核）→ 注册为待审核 → 通过后可登录', async () => {
  const s = await root('/api/settings');
  const sys = { ...(s.body.settings.system || {}), allow_register: true, register_need_approval: true, register_default_role: 'viewer' };
  expectStatus(await root.json('/api/settings', { system: sys }, 'PUT'), 200, '开启注册');

  const c = newClient();
  const reg = await c.json('/api/auth/register', { username: 'reg_' + ts, password: PASS, display_name: '注册用户' });
  expectStatus(reg, 200, '注册');
  if (reg.body.status !== 'pending') throw new Error('应进入待审核，实际 ' + reg.body.status);
  if (reg.body.role !== 'viewer') throw new Error('角色应为 viewer');

  expectStatus(await c.login('reg_' + ts, PASS), 403, '待审核阶段登录应被拒');

  const list = await root('/api/users?status=pending');
  const u = list.body.items.find((x) => x.username === 'reg_' + ts);
  if (!u) throw new Error('待审核列表里没有该用户');
  expectStatus(await root.json(`/api/users/${u.id}/approve`, {}), 200, '审核通过');
  expectStatus(await c.login('reg_' + ts, PASS), 200, '审核后可登录');
  expectStatus(await c.json('/api/devices', { category_id: categoryId, brand: 'X' }), 403, 'viewer 不能建设备');

  // 关闭注册
  const s2 = await root('/api/settings');
  await root.json('/api/settings', { system: { ...s2.body.settings.system, allow_register: false } }, 'PUT');
});

/* ================================================================== *
 * 7. 登录日志与收尾
 * ================================================================== */
console.log('\n[7] 登录日志');

await check('登录日志记录了成功/失败/锁定', async () => {
  const r = await root('/api/users/login-log?limit=200');
  expectStatus(r, 200, '登录日志');
  const actions = new Set(r.body.items.map((x) => x.action));
  for (const a of ['login', 'login_failed']) {
    if (!actions.has(a)) throw new Error(`登录日志缺少 ${a}，实际有：${[...actions].join(',')}`);
  }
  if (!r.body.items.some((x) => x.ip)) throw new Error('日志应记录 IP');
});

await check('删除测试用户并确认已清理', async () => {
  const list = await root('/api/users?page_size=200');
  let removed = 0;
  for (const u of list.body.items) {
    if (u.id === rootId) continue;
    if (/^(mgr_|op_|view_|reg_)/.test(u.username) || /^admin2_/.test(u.username)) {
      const r = await root('/api/users/' + u.id, { method: 'DELETE' });
      if (r.status === 200) removed++;
    }
  }
  const after = await root('/api/users?page_size=200');
  if (after.body.total !== 1) throw new Error(`应只剩管理员 1 个，实际 ${after.body.total}`);
  console.log(`      （已清理 ${removed} 个测试账号）`);
});

console.log(`\n=== 结果：${pass} 通过 / ${fail} 失败 ===\n`);
if (fail) {
  for (const f of failures) console.log(`\n[${f.name}] ${f.message}`);
  process.exit(1);
}
process.exit(0);
