/**
 * 资源管理器（按组织架构浏览设备）测试。
 *
 * 这个页面最容易出的问题是**口径不一致**：
 * 左边文件夹写着「12 台」，点进去右边只列出 3 台 —— 用户没法自证谁对。
 * 根因是「含下级」这件事有两套算法（树上的统计 vs 列表的筛选）。
 * 所以本测试的核心就是钉住这条不变式：
 *
 *     文件夹上的数字  ===  点进去列表里的总数
 *     （没勾含下级 → 直接数；勾了 → 含下级总数）
 *
 * 另外覆盖：未分配组织、批量移动归属、移动到未分配、跨层级统计。
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BASE = process.env.BASE || 'http://127.0.0.1:8080';

import * as svc from '../server/services.js';
import { migrate, seedIfEmpty, db } from '../server/db.js';

let pass = 0; let fail = 0;
const failures = [];
const t = async (name, fn) => {
  try { await fn(); pass++; console.log(`  \x1b[32m✔\x1b[0m ${name}`); }
  catch (e) { fail++; failures.push(name); console.log(`  \x1b[31m✘\x1b[0m ${name}\n      ${e.message}`); }
};
const assert = (c, m) => { if (!c) throw new Error(m || '断言失败'); };
/**
 * ⚠️ 不能一律 Number() 比较：org_id 是 UUID，Number(uuid) 是 NaN，NaN === NaN 恒为假，
 *    于是「两边明明是同一个字符串」也会报失败（第一次就踩了，报错信息看着像值不同，
 *    其实两边的 UUID 一模一样）。所以：两边都是数字才按数字比，否则按字符串比。
 */
const eq = (a, b, m) => {
  const isNum = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
  const ok = (isNum(a) && isNum(b)) ? Number(a) === Number(b) : String(a) === String(b);
  assert(ok, `${m || '值不相等'}：期望 ${JSON.stringify(b)}，实得 ${JSON.stringify(a)}`);
};

migrate();
seedIfEmpty({ withDemo: true });

console.log('\n=== 资源管理器（组织树 × 设备） ===\n');
console.log(`  库：${process.env.ITAM_DB || '(真实库！)'}`);
console.log(`  服务：${BASE}\n`);

/* ---------- 会话 ---------- */
const ADMIN_USER = process.env.ITAM_USER || 'admin';
const ADMIN_PASS = process.env.ITAM_PASS || '';
let cookie = '';
async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  });
  const setC = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  if (setC.length) cookie = setC.map((c) => c.split(';')[0]).join('; ');
  if (!res.ok) throw new Error(`登录失败 HTTP ${res.status}`);
}
async function api(p, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(BASE + p, { ...opts, headers });
  let body = null;
  try { body = await res.json(); } catch { /* ignore */ }
  if (body && typeof body === 'object' && 'data' in body) body = body.data;
  if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
  return body;
}

/* ---------- 准备一棵可控的组织树 + 几台设备 ---------- */
const TAG = 'EX' + Date.now().toString().slice(-6);
const madeDeviceIds = [];
let parent = null; let childA = null; let childB = null;

function makeOrg(name, parentId) {
  const r = svc.orgCreate({ name, parent_id: parentId, type: parentId ? 'team' : 'company' });
  return r;
}
function makeDevice(orgId, tag) {
  const cat = svc.categoryList().find((c) => c.code === 'PC') || svc.categoryList()[0];
  const d = svc.deviceCreate({
    category_id: cat.id, org_id: orgId, brand: 'EXPLORER', model: 'TEST-' + tag,
    sn: `${TAG}-${tag}`, status: 'in_use',
  }, 'test');
  madeDeviceIds.push(d.id);
  return d;
}

await t('准备：建一棵「父 → 两个子」的组织树，并把设备分别放进不同层级', () => {
  parent = makeOrg(`${TAG}-总部`);
  childA = makeOrg(`${TAG}-研发部`, parent.id);
  childB = makeOrg(`${TAG}-销售部`, parent.id);
  // 父组织直接放 2 台，两个子组织各 3 台 → 父的「含下级」应该是 8
  makeDevice(parent.id, 'P1'); makeDevice(parent.id, 'P2');
  for (let i = 1; i <= 3; i++) makeDevice(childA.id, 'A' + i);
  for (let i = 1; i <= 3; i++) makeDevice(childB.id, 'B' + i);
  assert(parent.id && childA.id && childB.id, '组织创建失败');
});

await t('统计口径：直接数 own=2，含下级 total=8', () => {
  const stats = svc.orgDeviceStats();
  const p = stats.find((s) => s.id === parent.id);
  eq(p.own, 2, '父组织直接放的设备数');
  eq(p.total, 8, '父组织含下级的设备数');
  const a = stats.find((s) => s.id === childA.id);
  eq(a.own, 3);
  eq(a.total, 3);
});

await t('接口：/api/devices?org_id=X（含下级）与 org_direct=1（直接）数量必须是 2 / 8', async () => {
  if (!ADMIN_PASS) throw new Error('没有 ITAM_PASS');
  await login();
  const recur = await api(`/api/devices?org_id=${parent.id}&page_size=1`);
  eq(recur.total, 8, '含下级的总数');
  const direct = await api(`/api/devices?org_id=${parent.id}&org_direct=1&page_size=1`);
  eq(direct.total, 2, '只看直接归属的总数');
  // 列表里返回的 id 不能重复、不能串文件夹
  const directFull = await api(`/api/devices?org_id=${parent.id}&org_direct=1&page_size=100`);
  for (const d of directFull.items) eq(d.org_id, parent.id, '直接模式下混进了别的组织的设备');
});

await t('不变式：树上的数字 === 点进去列表的总数（含下级 / 不含下级两种口径都验）', async () => {
  const orgs = await api('/api/orgs');
  const flat = orgs.flat;
  const stats = new Map(orgs.stats.map((s) => [s.id, s]));

  // 只抽查我们造的那棵树，避免受演示数据影响
  for (const [orgId, expectDirect, expectTotal] of [[parent.id, 2, 8], [childA.id, 3, 3], [childB.id, 3, 3]]) {
    const f = flat.find((o) => o.id === orgId);
    const s = stats.get(orgId);
    assert(f && s, '组织没出现在 /api/orgs 里');

    // ① 含下级：树的 total 必须 === 列表（不加 org_direct）的 total
    const recur = await api(`/api/devices?org_id=${orgId}&page_size=1`);
    eq(recur.total, s.total, `${f.name} 含下级口径对不上（树 total=${s.total}）`);
    eq(s.total, expectTotal, `${f.name} 含下级总数`);

    // ② 直接：树的 device_count 必须 === 列表（加 org_direct）的 total
    const direct = await api(`/api/devices?org_id=${orgId}&org_direct=1&page_size=1`);
    eq(direct.total, f.device_count, `${f.name} 直接口径对不上（树 device_count=${f.device_count}）`);
    eq(f.device_count, expectDirect, `${f.name} 直接数`);
  }
});

await t('/devices/ids：按条件取 id 列表（「导出当前文件夹」用），口径必须和列表总数一致', async () => {
  // 资源管理器导出当前文件夹时先拿 id 列表再导出。
  // 这条接口必须和列表页共用同一套筛选，否则会出现「列表显示 8 台、导出 2 台」。
  for (const extra of ['', '&org_direct=1']) {
    const list = await api(`/api/devices?org_id=${parent.id}${extra}&page_size=1`);
    const ids = await api(`/api/devices/ids?org_id=${parent.id}${extra}`);
    eq(ids.ids.length, list.total, `筛选「${extra || '含下级'}」时 id 数量与列表总数不一致`);
  }
  // 未分配的设备也要能取到
  const noOrgList = await api('/api/devices?no_org=1&page_size=1');
  const noOrgIds = await api('/api/devices/ids?no_org=1');
  eq(noOrgIds.ids.length, noOrgList.total, '未分配口径的 id 数量对不上');
  // ⚠️ 顺带钉住路由顺序：/devices/ids 不能被 /devices/:id 抢走（那样会被当成设备 id 查不到）
  assert(Array.isArray(noOrgIds.ids), '/devices/ids 返回的应该是数组，而不是「设备不存在」的错误');
});

await t('未分配组织：/api/orgs 给出数量，no_org=1 只列没归属的设备', async () => {
  const before = await api('/api/orgs');
  const noOrgTotal = await api('/api/devices?no_org=1&page_size=1');
  eq(before.unassigned, noOrgTotal.total, '「未分配」文件夹的数字和列表对不上');

  // 造一台没有组织的设备，两边都要 +1
  const cat = svc.categoryList().find((c) => c.code === 'PC') || svc.categoryList()[0];
  const orphan = svc.deviceCreate({ category_id: cat.id, sn: `${TAG}-ORPHAN`, brand: 'EXPLORER', status: 'in_stock' }, 'test');
  madeDeviceIds.push(orphan.id);
  const after = await api('/api/orgs');
  const afterList = await api('/api/devices?no_org=1&page_size=1');
  eq(after.unassigned, before.unassigned + 1, '未分配数量没跟着涨');
  eq(afterList.total, noOrgTotal.total + 1, '未分配列表没跟着涨');
  const items = await api('/api/devices?no_org=1&page_size=100');
  for (const d of items.items) assert(d.org_id === null, '未分配列表里混进了有归属的设备');
});

await t('拖放移动：把设备移到另一个组织（走 /devices/bulk move）', async () => {
  const from = await api(`/api/devices?org_id=${childA.id}&org_direct=1&page_size=100`);
  const ids = from.items.slice(0, 2).map((d) => d.id);
  const r = await api('/api/devices/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, action: 'move', payload: { org_id: childB.id } }),
  });
  assert(r.ok >= 2, '批量移动应该成功 2 台，实得 ' + JSON.stringify(r));
  // 数量要跟着动：A 少 2、B 多 2
  const a = await api(`/api/devices?org_id=${childA.id}&org_direct=1&page_size=1`);
  const b = await api(`/api/devices?org_id=${childB.id}&org_direct=1&page_size=1`);
  eq(a.total, 1, '来源文件夹应该少 2 台');
  eq(b.total, 5, '目标文件夹应该多 2 台');
  // 父组织含下级总数不变（只是内部搬家）
  const p = await api(`/api/devices?org_id=${parent.id}&page_size=1`);
  eq(p.total, 8, '父组织含下级总数不该因为内部搬家变化');
  // 流转记录里要有「移动」的痕
  const hist = svc.deviceHistory(ids[0]).filter((l) => /org/i.test(String(l.field || '')) || /组织/.test(String(l.note || '')));
  assert(hist.length >= 1, '移动应该写进流转记录');
});

await t('拖到「未分配」= 清空归属，且能从列表里查回来', async () => {
  const list = await api(`/api/devices?org_id=${childB.id}&org_direct=1&page_size=100`);
  const one = list.items[0].id;
  await api('/api/devices/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: [one], action: 'move', payload: { org_id: null } }),
  });
  const d = svc.deviceGet(one);
  assert(d.org_id === null, '归属没被清空，实得 ' + d.org_id);
  assert(d.org_path === '', '没有归属时不该还有路径');
});

await t('列表返回 org_path，前端可以直接显示「总公司 / 研发部」', async () => {
  const items = await api(`/api/devices?org_id=${childA.id}&org_direct=1&page_size=10`);
  assert(items.items.length, '应该还有设备');
  const p = String(items.items[0].org_path || '');
  assert(p.includes('/'), 'org_path 应该是带层级的路径，实得 ' + p);
  assert(p.includes(TAG), 'org_path 应该包含我们造的组织名，实得 ' + p);
});

await t('深层嵌套：三层也能正确汇总', () => {
  // ⚠️ 期望值要**现算**，不能写死数字：前面的用例搬过家、也把一台清空了归属，
  //    写死数字的话这个测试会随着用例顺序变化而假红/假绿。
  const beforeParent = svc.orgDeviceStats().find((s) => s.id === parent.id);
  const beforeChild = svc.orgDeviceStats().find((s) => s.id === childA.id);

  const lv3 = makeOrg(`${TAG}-三组`, childA.id);
  makeDevice(lv3.id, 'L3-1');

  const stats = svc.orgDeviceStats();
  const l3 = stats.find((s) => s.id === lv3.id);
  eq(l3.own, 1, '三层组织的直接数');
  eq(l3.total, 1, '三层组织的含下级数');

  // 三层新增 1 台，二层和顶层的「含下级」都要 +1
  eq(stats.find((s) => s.id === childA.id).total, beforeChild.total + 1, '二层含下级应该 +1');
  eq(stats.find((s) => s.id === parent.id).total, beforeParent.total + 1, '顶层含下级应该 +1');
  // 但顶层的「直接数」不能变（设备是放进三层的，不是放进顶层）
  eq(stats.find((s) => s.id === parent.id).own, beforeParent.own, '顶层的直接数不该变');
});

await t('空文件夹：新组织数量为 0，列表为空（前端要能显示空态）', async () => {
  const empty = makeOrg(`${TAG}-空部门`, parent.id);
  const stats = svc.orgDeviceStats().find((s) => s.id === empty.id);
  eq(stats.own, 0);
  eq(stats.total, 0);
  const list = await api(`/api/devices?org_id=${empty.id}&page_size=10`);
  eq(list.total, 0, '空组织不该有设备');
  assert(Array.isArray(list.items) && list.items.length === 0, '应该返回空数组而不是报错');
});

await t('权限：未登录不能读组织树和设备列表', async () => {
  for (const p of ['/api/orgs', '/api/devices?org_id=x']) {
    const res = await fetch(BASE + p);
    eq(res.status, 401, `${p} 应该要求登录`);
  }
});

/* ---------- 清理：删掉本次造的设备和组织 ---------- */
if (madeDeviceIds.length) {
  for (const id of madeDeviceIds) {
    try { svc.deviceDelete(id, 'test'); svc.devicePurge(id); } catch { /* ignore */ }
  }
}
for (const o of [childA, childB, parent].filter(Boolean).reverse()) {
  try {
    // 三层那个还要先删
    const kids = db.prepare('SELECT id FROM org_unit WHERE parent_id=?').all(o.id);
    for (const k of kids) db.prepare('DELETE FROM org_unit WHERE id=?').run(k.id);
    db.prepare('DELETE FROM org_unit WHERE id=?').run(o.id);
  } catch { /* ignore */ }
}
console.log(`  （已清理 ${madeDeviceIds.length} 台测试设备与临时组织）`);

console.log(`\n=== 结果：${pass} 通过 / ${fail} 失败 ===`);
if (fail) {
  console.log('\n失败项：');
  for (const f of failures) console.log('  · ' + f);
  process.exit(1);
}
