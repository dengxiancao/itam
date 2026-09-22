/**
 * GLPI Agent 对接测试。
 *
 * 分两半：
 *   A. 服务层（直接调函数，不需要服务）—— 字段映射、部分盘点合并、令牌、认领
 *   B. HTTP 端到端（对着正在跑的服务发真实请求）—— CONTACT / INVENTORY / PROLOG / 鉴权
 *
 * 样例全部来自官方仓库 glpi-project/inventory_format 的 examples/，
 * 是**真实 agent 报上来的数据**（Dell XPS 13 那台），不是我自己编的字段名。
 * 这一点很重要：字段名靠猜的话，装上真机就全是 null。
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FIX = path.join(ROOT, 'tests', 'fixtures', 'glpi');
const BASE = process.env.BASE || 'http://127.0.0.1:8080';

// ⚠️ ITAM_DB 由外层（tests/all.js）用环境变量注入，这里直接静态 import 就行。
//    单独手跑时若没设，会落到真实库上 —— 所以下面第一步就检查这一点。
import * as agent from '../server/lib/agent.js';
import * as svc from '../server/services.js';
import { migrate, seedIfEmpty, db, scalar } from '../server/db.js';

let pass = 0; let fail = 0;
const failures = [];
const t = async (name, fn) => {
  try { await fn(); pass++; console.log(`  \x1b[32m✔\x1b[0m ${name}`); }
  catch (e) { fail++; failures.push(name); console.log(`  \x1b[31m✘\x1b[0m ${name}\n      ${e.message}`); }
};
const assert = (c, m) => { if (!c) throw new Error(m || '断言失败'); };
const eq = (a, b, m) => assert(a === b, `${m || '值不相等'}：期望 ${JSON.stringify(b)}，实得 ${JSON.stringify(a)}`);

migrate();
seedIfEmpty({ withDemo: true });

const load = (f) => JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'));

/**
 * 按 agent 的 deviceid 精确取一台机器。
 * ⚠️ 不要用 `machineList({q:'glpixps'})` 再取 items[0] —— 后来还有几台机器的主机名也叫 glpixps，
 *    列表排序会变，取到的是哪一台全看运气（第一次就是这么误判成「没认领」的）。
 */
const DEVICEID_GLPIXPS = 'glpixps-2018-07-09-09-07-13';
function machineByDeviceId(deviceid) {
  return agent.machineList({ page_size: 500 }).items.find((m) => m.deviceid === deviceid) || null;
}
const glpixps = () => {
  const m = machineByDeviceId(DEVICEID_GLPIXPS);
  assert(m, '找不到样例机器 ' + DEVICEID_GLPIXPS);
  return m;
};

console.log('\n=== GLPI Agent 对接 ===\n');
console.log(`  库：${process.env.ITAM_DB || '(真实库！)'}`);
console.log(`  服务：${BASE}\n`);

console.log('── A. 服务层 ──');

await t('新表都建好了', () => {
  for (const tb of ['agent_token', 'agent_machine', 'agent_monitor', 'agent_report']) {
    const c = scalar(`SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name=?`, tb);
    eq(Number(c), 1, `表 ${tb} 不存在`);
  }
});

await t('上报令牌：生成 → 只回一次明文 → 库里只有哈希 → 校验通过', () => {
  const r = agent.tokenCreate({ name: '测试令牌A', note: '自动化测试', createdBy: 'test' });
  assert(r.token && r.token.length >= 30, '没有返回明文令牌');
  const row = db.prepare('SELECT * FROM agent_token WHERE id=?').get(r.id);
  assert(!String(row.token_hash).includes(r.token), '库里居然存了明文令牌');
  eq(row.token_hash.length, 64, 'token_hash 应该是 SHA-256');
  assert(agent.tokenVerify('itam', r.token, { ip: '127.0.0.1' }), '正确令牌应校验通过');
  assert(agent.tokenVerify('itam', r.token + 'x') === null, '错误令牌不该通过');
  assert(agent.tokenVerify('', '') === null, '空令牌不该通过');
  const again = db.prepare('SELECT use_count,last_ip FROM agent_token WHERE id=?').get(r.id);
  assert(again.use_count >= 1, '用过之后 use_count 应该累加');
  eq(again.last_ip, '127.0.0.1');
  const safe = agent.tokenList().find((x) => x.id === r.id);
  assert(!('token_hash' in safe), '列表接口不该带出 token_hash');
});

await t('停用令牌后立刻失效', () => {
  const r = agent.tokenCreate({ name: '测试令牌B' });
  assert(agent.tokenVerify('x', r.token), '刚建的应该可用');
  agent.tokenSetEnabled(r.id, false);
  assert(agent.tokenVerify('x', r.token) === null, '停用后不该还能用');
  agent.tokenDelete(r.id);
  assert(agent.tokenVerify('x', r.token) === null, '删掉后不该还能用');
});

await t('全量上报：官方真实样例的字段全部映射正确', () => {
  const r = agent.ingest(load('computer_1.json'), { agentName: 'GLPI-Agent', agentVersion: '1.16' });
  assert(r.created, '第一次上报应该是新建');
  const m = r.machine;
  eq(m.hostname, 'glpixps', '主机名');
  eq(m.sn, '640HP72', 'SN（bios.ssn）');
  eq(m.sn_alt, '640HP72', 'bios.msn 要清洗成序列号');
  eq(m.manufacturer, 'Dell Inc.', '品牌（bios.smanufacturer）');
  eq(m.model, 'XPS 13 9350', '型号（bios.smodel）');
  eq(m.chassis_type, 'Laptop');
  eq(m.machine_kind, 'nb', '笔记本应判成 nb');
  eq(m.vmsystem, 'Physical');
  eq(m.os_arch, 'x86_64');
  assert(/Fedora 31/.test(m.os_name), '系统名：' + m.os_name);
  assert(/i5-6200U/.test(m.cpu), 'CPU：' + m.cpu);
  eq(m.cpu_cores, 2);
  eq(m.cpu_threads, 4);
  eq(m.ram_mb, 7800);
  assert(/Samsung/.test(m.disk_summary) && /250GB/.test(m.disk_summary), '硬盘摘要：' + m.disk_summary);
  eq(m.last_user, 'root');
  // 主网卡必须是真网卡，不能挑到 loopback 或全零 MAC
  eq(m.mac_primary, '00:E0:4C:68:01:DB', '主网卡 MAC');
  eq(m.ip_primary, '192.168.1.142', '主 IP');
  assert(m.networks.some((n) => n.virtual), '虚拟网卡也应该保留在明细里（只是不当主网卡）');
  assert(m.software_list.length > 0, '软件榜不该为空');
  eq(m.software_count, 6);
});

await t('显示器：serial 是序列号，description 里的尺寸/年份要解出来', () => {
  const m = glpixps();
  const mons = agent.monitorList({ machineId: m.id });
  eq(mons.length, 1, '应该报上来 1 台显示器');
  const mon = mons[0];
  eq(mon.serial, 'ABH55D', '显示器序列号（monitors[].serial）');
  eq(mon.caption, 'DJCP6');
  eq(mon.manufacturer, 'Sharp Corporation');
  eq(mon.size_inch, 32, 'description "32/2015" 应解出 32 寸');
  eq(mon.made_year, 2015);
  eq(mon.edid_seen, 1, '样例带 EDID，应该记下来');
  assert(mon.claimed === false, '新报上来的显示器应该是未认领');
});

await t('部分盘点：没报的段必须原样保留（这是最容易被写错的地方）', () => {
  const before = glpixps();
  const softBefore = before.software_count;
  const cpuBefore = before.cpu;

  const r = agent.ingest(load('computer_1_partial_cpu.json'), {});
  assert(r.partial, '这份样例的 partial 应该是 true');
  const after = r.machine;
  eq(after.software_count, softBefore, '部分盘点后软件数被洗掉了');
  eq(agent.monitorList({ machineId: after.id }).length, 1, '部分盘点后显示器丢了');
  assert(after.sn, '部分盘点后 SN 丢了');
  assert(after.cpu, 'CPU 段这次报了，应该有值');

  // 再报一次 volumes，软件和显示器还得在
  const r2 = agent.ingest(load('computer_1_partial_volumes.json'), {});
  eq(r2.machine.software_count, softBefore, '第二次部分盘点后软件数又丢了');
  eq(agent.monitorList({ machineId: r2.machine.id }).length, 1, '第二次部分盘点后显示器丢了');
  assert(r2.machine.cpu === cpuBefore, 'CPU 段这次没报，应该保留上次的值');
});

await t('同一个 deviceid 反复上报只有一条记录，报数会累加', () => {
  // 按 deviceid 精确数，别用模糊搜索的总数（后来还有几台主机名也叫 glpixps）
  const count = () => agent.machineList({ page_size: 500 }).items.filter((x) => x.deviceid === DEVICEID_GLPIXPS).length;
  const before = count();
  const r = agent.ingest(load('computer_1.json'), {});
  assert(!r.created, '第二次不该新建');
  eq(count(), before, '同一台机器冒出多条记录了');
  eq(count(), 1, '同一台机器应该只有一条记录');
  assert(r.machine.report_count >= 4, 'report_count 应该在累加，实得 ' + r.machine.report_count);
  assert(r.machine.partial_count >= 2, 'partial_count 应该在累加，实得 ' + r.machine.partial_count);
});

await t('全量盘点：没了的段就应该没了（不是合并）', () => {
  // 造一份"全量但缺少 monitors 段"的上报
  const p = load('computer_1.json');
  const clone = JSON.parse(JSON.stringify(p));
  delete clone.content.monitors;
  clone.deviceid = 'full-no-monitor-test';
  const r = agent.ingest(clone, {});
  eq(agent.monitorList({ machineId: r.machine.id }).length, 0, '全量上报没带显示器，就不该有显示器');
  eq(r.machine.hostname, 'glpixps', '主机名还是应该映射出来');
});

await t('SN 占位符必须过滤掉（OEM 出厂没写 SN 的机器很常见）', () => {
  for (const junk of ['To Be Filled By O.E.M.', 'Default string', '00000000', 'None', 'System Serial Number', 'N/A', '']) {
    assert(agent.cleanSN(junk) === null, `"${junk}" 应该被判为无效 SN，实得 ${JSON.stringify(agent.cleanSN(junk))}`);
  }
  eq(agent.cleanSN('640HP72'), '640HP72');
  eq(agent.cleanSN('  ABH55D  '), 'ABH55D');
  // msn 那种 "/640HP72/CE129536461378/" 要能取出里面的序列号
  eq(agent.cleanMsn('/640HP72/CE129536461378/'), '640HP72');
});

await t('显示器 description 解析各厂商写法', () => {
  eq(agent.parseMonitorDescription('32/2015').size_inch, 32);
  eq(agent.parseMonitorDescription('27/2022').made_year, 2022);
  eq(agent.parseMonitorDescription('').size_inch, null);
  eq(agent.parseMonitorDescription('PHL 241B8Q').size_inch, null, '不是尺寸格式就不该瞎猜');
});

await t('另一台机器（computer_2）：assettag 也要认', () => {
  const r = agent.ingest(load('computer_2.json'), {});
  const m = r.machine;
  eq(m.hostname, 'COMP1');
  eq(m.sn, '2FAGP34');
  eq(m.manufacturer, 'Dell Inc.');
  eq(m.model, 'XPS 13 9350');
  eq(m.assettag, 'COMP1', 'assettag 是部分厂商放资产标签的地方，要存下来');
  eq(m.machine_kind, 'nb');
});

await t('虚拟机要能识别出来（别混进实体台账）', () => {
  const p = load('computer_2.json');
  p.deviceid = 'vm-test-machine';
  p.content.hardware.chassis_type = 'Desktop';
  p.content.hardware.vmsystem = 'VMware';
  p.content.hardware.name = 'VM-TEST';
  const r = agent.ingest(p, {});
  eq(r.machine.vmsystem, 'VMware');
  eq(r.machine.is_physical, false, '虚拟机不该标成实体');
  const list = agent.machineList({ only: 'physical' }).items.map((x) => x.deviceid);
  assert(!list.includes('vm-test-machine'), '虚拟机会被「只看实体机」筛掉');
});

await t('认领：按 SN 推荐已有设备', () => {
  const machine = glpixps();
  const cats = svc.categoryList();
  const nb = cats.find((c) => c.code === 'NB') || cats[0];
  const dev = svc.deviceCreate({ category_id: nb.id, sn: '640HP72', brand: 'Dell', model: 'XPS 13 9350' }, 'test');
  const cands = agent.matchCandidates(machine);
  assert(cands.some((c) => c.id === dev.id), '应该按 SN 推荐出这台设备，实得 ' + JSON.stringify(cands));
  assert(/序列号/.test(cands.find((c) => c.id === dev.id).reason), '推荐理由要说清是序列号命中');
});

await t('认领到已有设备：只补空字段，绝不覆盖人工填过的值', () => {
  const machine = glpixps();
  // 复用上一轮那台 SN=640HP72 的设备（SN 有唯一约束，不能再造一台）
  const dev = svc.deviceGetBySN('640HP72')[0];
  assert(dev, '应该能找到上一轮造的 SN=640HP72 设备');
  // 先人工填几个字段，再看认领会不会把它们冲掉
  svc.deviceUpdate(dev.id, { owner_name: '张伟', location: '三楼机房', remark: '人工备注别动我' }, 'test');

  const r = svc.agentClaimMachine(machine.id, { deviceId: dev.id, actor: 'test' });
  eq(r.device.id, dev.id);
  // 人工填的必须原样
  eq(r.device.owner_name, '张伟', '使用人被覆盖了');
  eq(r.device.location, '三楼机房', '位置被覆盖了');
  eq(r.device.remark, '人工备注别动我', '备注被覆盖了');
  // 空的应该被补上
  assert(r.device.mac_address === '00:E0:4C:68:01:DB', '空着的 MAC 应该补上，实得 ' + r.device.mac_address);
  assert(/Fedora/.test(r.device.os_name || ''), '空着的系统应该补上，实得 ' + r.device.os_name);
  // 机器侧要记下认领关系
  eq(glpixps().claimed, true);
  // extra 里要有机器身份，方便以后认机器
  // ⚠️ services 的 hydrate() 已经把 extra 解析成对象了，这里别再 JSON.parse 一次
  const extra = typeof r.device.extra === 'string' ? JSON.parse(r.device.extra || '{}') : (r.device.extra || {});
  eq(extra.agent.deviceid, machine.deviceid);
  eq(extra.agent.uuid, '4c4c4544-0034-3010-8048-b6c04f503732');
  // 流转记录里要有痕
  const logs = svc.deviceHistory(dev.id).filter((l) => l.action === 'agent');
  assert(logs.length >= 1, '认领应该写流转记录');
});

await t('认领后同步：机器事实会刷新，人的决定一律不动', () => {
  const machine = glpixps();
  const devId = machine.claimed_device_id;
  assert(devId, '上一轮应该已经认领过了');
  // 把台账里的 MAC 改成一个错的值，模拟"机器换了网卡/以前填错了"
  svc.deviceUpdate(devId, { mac_address: 'AA:BB:CC:DD:EE:FF', owner_name: '李娜' }, 'test');
  svc.agentSyncMachine(machine.id, 'agent');
  const after = svc.deviceGet(devId);
  eq(after.mac_address, '00:E0:4C:68:01:DB', 'MAC 应该被盘点结果刷新');
  eq(after.owner_name, '李娜', '使用人是人的决定，绝对不能被 agent 改');
  // 关掉自动同步后就不再动了
  svc.agentSetSync(machine.id, false);
  svc.deviceUpdate(devId, { mac_address: 'AA:BB:CC:DD:EE:FF' }, 'test');
  const r = svc.agentSyncMachine(machine.id, 'agent');
  eq(svc.deviceGet(devId).mac_address, 'AA:BB:CC:DD:EE:FF', '关了自动同步就不该再改');
  assert(r.skipped, '应该说明被跳过了');
  svc.agentSetSync(machine.id, true);
});

await t('解除认领：台账设备保留，只断开绑定', () => {
  const machine = glpixps();
  const devId = machine.claimed_device_id;
  svc.agentUnclaimMachine(machine.id, 'test');
  assert(svc.deviceGet(devId), '解除绑定不该把台账设备删掉');
  assert(!glpixps().claimed, '绑定应该断了');
  svc.agentClaimMachine(machine.id, { deviceId: devId, actor: 'test' });   // 复原，后面的 HTTP 用例还要用
});

await t('新建设备式认领：自动推荐分类（笔记本 → NB）', () => {
  const machine = agent.machineList({ q: 'COMP1' }).items[0];
  assert(machine, '应该有 COMP1 这台机器');
  const r = svc.agentClaimMachine(machine.id, { actor: 'test' });
  const cat = svc.categoryList().find((c) => c.id === r.device.category_id);
  eq(cat.code, 'NB', 'Laptop 机箱应该认到笔记本分类，实得 ' + cat.code);
  eq(r.device.sn, '2FAGP34', 'SN 应该带过来');
  eq(r.device.asset_no.startsWith('NB-'), true, '资产编号应带 NB 前缀，实得 ' + r.device.asset_no);
  eq(r.device.sn_source, 'agent', '来源要标成 agent');
});

await t('显示器认领：能新建一台显示器资产并把尺寸填上', () => {
  const mon = agent.monitorList({ only: 'unclaimed' })[0];
  assert(mon, '应该有一台未认领的显示器');
  const r = svc.agentClaimMonitor(mon.id, { actor: 'test' });
  const cat = svc.categoryList().find((c) => c.id === r.device.category_id);
  eq(cat.code, 'MON', '应认到显示器分类');
  eq(r.device.sn, 'ABH55D');
  eq(r.device.brand, 'Sharp Corporation');
  eq(r.device.screen_size, '32 英寸', 'EDID 里的尺寸应该填进台账');
  assert(/自动盘点/.test(r.device.remark || ''), '备注里应说明来源');
});

await t('上报日志：每次上报都留痕（含被拒绝的）', () => {
  const n = scalar('SELECT COUNT(*) AS c FROM agent_report');
  assert(Number(n) >= 1, '应该有上报日志');
  const list = agent.reportList({ page_size: 5 });
  assert(list.items.length > 0, '日志列表不该为空');
  assert(list.items[0].created_at, '日志要有时间');
});

await t('统计口径正确', () => {
  const s = agent.stats();
  assert(s.machines >= 3, '机器数：' + s.machines);
  assert(s.monitors >= 1, '显示器数：' + s.monitors);
  assert(s.monitors_unclaimed >= 0);
  assert(typeof s.unclaimed === 'number');
});

await t('解压：gzip / zlib / brotli / 裸 JSON 四种都要认', () => {
  const text = JSON.stringify({ action: 'inventory', deviceid: 'x', content: { hardware: { name: 'a' } } });
  const buf = Buffer.from(text, 'utf8');
  eq(agent.decodeAgentBody(buf, 'application/json', '').text, text, '裸 JSON');
  eq(agent.decodeAgentBody(zlib.gzipSync(buf), 'application/x-compress-gzip', '').text, text, 'gzip（协议自己的 content-type）');
  eq(agent.decodeAgentBody(zlib.deflateSync(buf), 'application/x-compress-zlib', '').text, text, 'zlib');
  eq(agent.decodeAgentBody(zlib.brotliCompressSync(buf), 'application/x-compress-br', '').text, text, 'brotli');
  eq(agent.decodeAgentBody(zlib.gzipSync(buf), 'application/json', 'gzip').text, text, 'gzip（HTTP Content-Encoding）');
  // 声明错了但内容其实是 gzip —— 老 agent 会这么干，得兜住
  eq(agent.decodeAgentBody(zlib.gzipSync(buf), 'application/json', '').text, text, '声明成 json 其实是 gzip，也要能解');
});

await t('CONTACT 应答告诉 agent 用 glpi 协议', () => {
  const a = agent.contactAnswer();
  eq(a.status, 'ok');
  assert(a.expiration, '必须给 expiration，否则 agent 不知道下次什么时候来');
  eq(a.tasks.inventory.server, 'glpi', '必须让 agent 用 GLPI 原生 JSON 协议');
  assert(a.tasks.inventory.version, '要报版本，agent 按它决定能力');
});

await t('老式 PROLOG XML 也能认出来', () => {
  const xml = '<?xml version="1.0"?><REQUEST><QUERY>PROLOG</QUERY><DEVICEID>old-agent-1</DEVICEID><TOKEN></TOKEN></REQUEST>';
  const p = agent.parseProlog(xml);
  assert(p && p.prolog, '应该认出这是 PROLOG');
  eq(p.deviceid, 'old-agent-1');
  eq(agent.parseProlog('{"action":"contact"}'), null, 'JSON 不该被当成 PROLOG');
});

await t('Basic 鉴权头解析', () => {
  const h = 'Basic ' + Buffer.from('itam:secret123').toString('base64');
  eq(agent.parseBasicAuth(h).user, 'itam');
  eq(agent.parseBasicAuth(h).pass, 'secret123');
  eq(agent.parseBasicAuth('Bearer xxx'), null);
});

/* ================= B. HTTP 端到端 ================= */
console.log('\n── B. HTTP 端到端（真实请求）──');

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
  if (!res.ok) throw new Error(`登录失败 HTTP ${res.status}（ITAM_PASS 设了吗？）`);
}
async function api(path2, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(BASE + path2, { ...opts, headers });
  let body = null;
  try { body = await res.json(); } catch { /* ignore */ }
  if (body && typeof body === 'object' && 'data' in body) body = body.data;
  if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
  return { status: res.status, body, res };
}

/** 造一个 agent 上报的 HTTP 请求 */
async function postAgent({ payload, token, gzip = true, auth = true, path: p = '/api/agent', headers = {} }) {
  const raw = Buffer.from(JSON.stringify(payload), 'utf8');
  const body = gzip ? zlib.gzipSync(raw) : raw;
  const h = {
    'Content-Type': gzip ? 'application/x-compress-gzip' : 'application/json',
    'GLPI-Agent-ID': payload.deviceid || 'test-agent',
    Pragma: 'no-cache',
    ...headers,
  };
  if (auth && token) h.Authorization = 'Basic ' + Buffer.from(`itam:${token}`).toString('base64');
  const res = await fetch(BASE + p, { method: 'POST', headers: h, body });
  let json = null;
  try { json = await res.json(); } catch { /* ignore */ }
  return { status: res.status, body: json, res };
}

let httpToken = null;

await t('管理端登录（拿会话）', async () => {
  if (!ADMIN_PASS) throw new Error('没有 ITAM_PASS，跳过不了 —— 说明外层没把测试口令传进来');
  await login();
  const r = await api('/api/auth/status');
  eq(r.body.authenticated, true);
});

await t('管理端：生成上报令牌', async () => {
  const r = await api('/api/agent/tokens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'HTTP 测试令牌' }),
  });
  assert(r.body.token && r.body.token.length > 30, '没有拿到明文令牌');
  httpToken = r.body.token;
  const list = await api('/api/agent/tokens');
  const found = list.body.find((x) => x.id === r.body.id);
  assert(found, '新令牌应该出现在列表里');
  assert(!('token_hash' in found), '列表里不该有 token_hash');
});

await t('HTTP：没带令牌 → 401 forbidden（不是 500，也不是跳登录页）', async () => {
  const r = await postAgent({ payload: load('computer_1.json'), auth: false });
  eq(r.status, 401);
  eq(r.body.status, 'error');
  eq(r.body.message, 'forbidden');
});

await t('HTTP：令牌错了 → 401', async () => {
  const r = await postAgent({ payload: load('computer_1.json'), token: 'itam_wrong_wrong_wrong_wrong' });
  eq(r.status, 401);
});

await t('HTTP：CONTACT → 告诉它用 glpi 协议 + 回写 agent id', async () => {
  const r = await postAgent({
    token: httpToken,
    payload: {
      action: 'contact', deviceid: 'http-test-agent', name: 'GLPI-Agent', version: '1.16',
      'installed-tasks': ['inventory'], 'enabled-tasks': ['inventory'],
    },
  });
  eq(r.status, 200, '返回体：' + JSON.stringify(r.body));
  eq(r.body.status, 'ok');
  eq(r.body.tasks.inventory.server, 'glpi');
  assert(r.body.expiration, '要有 expiration');
  eq(r.res.headers.get('glpi-agent-id'), 'http-test-agent', '协议要求回写 GLPI-Agent-ID');
});

await t('HTTP：INVENTORY（gzip）→ ok + expiration:24，且数据真的进库了', async () => {
  const payload = load('computer_1.json');
  payload.deviceid = 'http-inv-test-1';
  payload.content.hardware.name = 'HTTP-TEST-PC';
  payload.content.bios.ssn = 'HTTPTEST' + Date.now();
  const r = await postAgent({ payload, token: httpToken });
  eq(r.status, 200, '返回体：' + JSON.stringify(r.body));
  eq(r.body.status, 'ok');
  eq(r.body.expiration, 24);
  // 管理端能查到这台机器
  const list = await api('/api/agent/machines?q=HTTP-TEST-PC');
  eq(list.body.total, 1, '上报的机器应该能在管理端看到');
  const m = list.body.items[0];
  eq(m.sn, payload.content.bios.ssn);
  eq(m.hostname, 'HTTP-TEST-PC');
  assert(m.claimed === false, '还没认领');
});

await t('HTTP：不带 gzip 的裸 JSON 也要收', async () => {
  const payload = load('computer_1.json');
  payload.deviceid = 'http-inv-plain';
  payload.content.hardware.name = 'PLAIN-JSON-PC';
  const r = await postAgent({ payload, token: httpToken, gzip: false });
  eq(r.status, 200);
  eq(r.body.status, 'ok');
});

await t('HTTP：老式 PROLOG（XML）→ 用新协议回答', async () => {
  const xml = '<?xml version="1.0" encoding="UTF-8"?><REQUEST><QUERY>PROLOG</QUERY><DEVICEID>legacy-1</DEVICEID><TOKEN></TOKEN></REQUEST>';
  const res = await fetch(`${BASE}/api/agent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/xml',
      'GLPI-Agent-ID': 'legacy-1',
      Authorization: 'Basic ' + Buffer.from(`itam:${httpToken}`).toString('base64'),
    },
    body: xml,
  });
  const body = await res.json();
  eq(res.status, 200, 'XML PROLOG 应该被接受');
  eq(body.status, 'ok');
  eq(body.tasks.inventory.server, 'glpi');
});

await t('HTTP：/front/inventory.php（GLPI 官方默认地址）也要能用', async () => {
  const payload = load('computer_2.json');
  payload.deviceid = 'php-path-test';
  payload.content.hardware.name = 'PHP-PATH-PC';
  const r = await postAgent({ payload, token: httpToken, path: '/front/inventory.php' });
  eq(r.status, 200, '官方默认地址必须能通，否则照官方文档配的人会一头雾水');
  eq(r.body.status, 'ok');
});

await t('HTTP：只填主机名时（POST /）也能收到，且不影响浏览器访问首页', async () => {
  const payload = load('computer_2.json');
  payload.deviceid = 'root-path-test';
  payload.content.hardware.name = 'ROOT-PATH-PC';
  const r = await postAgent({ payload, token: httpToken, path: '/' });
  eq(r.status, 200);
  eq(r.body.status, 'ok');
  // 不带 GLPI-Agent-ID 的 POST / 必须还是原来的行为，不能被 agent 逻辑截走。
  // ⚠️ 必须 redirect:'manual' —— fetch 默认会自动跟随 302，这里就只看得到登录页的 200 了
  const browserish = await fetch(`${BASE}/`, { method: 'POST', redirect: 'manual' });
  assert([302, 401, 405].includes(browserish.status), '普通 POST / 不该走 agent 分支，实得 ' + browserish.status);
});

await t('HTTP：register → registered', async () => {
  const r = await postAgent({
    token: httpToken,
    payload: { action: 'register', deviceid: 'reg-1', port: 0, name: 'GLPI-Agent', version: '1.16' },
  });
  eq(r.status, 200);
  eq(r.body.status, 'registered');
  assert(r.body.expiration, '要回 expiration');
});

await t('HTTP：坏 JSON → 400 malformed json（不能 500）', async () => {
  const res = await fetch(`${BASE}/api/agent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'GLPI-Agent-ID': 'bad-1',
      Authorization: 'Basic ' + Buffer.from(`itam:${httpToken}`).toString('base64'),
    },
    body: '{ 这不是 json',
  });
  const body = await res.json();
  eq(res.status, 400);
  eq(body.status, 'error');
  eq(body.message, 'malformed json');
});

await t('HTTP：不支持的 action（网络扫描）→ 明确回绝但别报错重试', async () => {
  const r = await postAgent({ token: httpToken, payload: { action: 'netdiscovery', deviceid: 'nd-1', content: {} } });
  eq(r.status, 200, '回 2xx，否则 agent 会一直重试');
  eq(r.body.status, 'ok');
  assert(/只支持/.test(r.body.message || ''), '要给出人看得懂的说明');
});

await t('管理端：统计、机器列表、上报历史接口都能用', async () => {
  const ov = await api('/api/agent/overview');
  assert(ov.body.stats.machines >= 1, '概览应有机器数');
  assert(ov.body.endpoint.includes('/api/agent'), '概览要给安装用地址');
  assert(ov.body.tokens.length >= 1, '概览要带令牌列表');
  const machines = await api('/api/agent/machines?only=unclaimed');
  assert(Array.isArray(machines.body.items), '机器列表结构不对');
  const reports = await api('/api/agent/reports');
  assert(reports.body.items.length > 0, '上报历史不该为空');
  assert(reports.body.items[0].deviceid, '历史里要有 deviceid');
});

await t('管理端：认领接口（HTTP）走通，并写入流转记录', async () => {
  const list = await api('/api/agent/machines?q=HTTP-TEST-PC');
  const m = list.body.items[0];
  const cands = await api(`/api/agent/machines/${m.id}/candidates`);
  assert(Array.isArray(cands.body), '候选推荐要返回数组');
  const r = await api(`/api/agent/machines/${m.id}/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ create: {} }),
  });
  assert(r.body.device?.asset_no, '认领后应返回台账设备');
  const detail = await api(`/api/agent/machines/${m.id}`);
  eq(detail.body.machine.claimed, true, '详情里应显示已认领');
  assert(detail.body.machine.claimed_device_id, '要有绑定关系');
});

await t('管理端：令牌停用/删除接口', async () => {
  const r = await api('/api/agent/tokens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '临时令牌' }),
  });
  await api(`/api/agent/tokens/${r.body.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: false }),
  });
  const list = await api('/api/agent/tokens');
  eq(list.body.find((x) => x.id === r.body.id).enabled, false);
  await api(`/api/agent/tokens/${r.body.id}`, { method: 'DELETE' });
  const list2 = await api('/api/agent/tokens');
  assert(!list2.body.find((x) => x.id === r.body.id), '删掉后不该还在');
});

await t('HTTP：CA 证书下载（安装脚本自动取证书用）', async () => {
  // 走 HTTPS + 自签证书的机器，安装脚本得先拿到我们的 CA，否则 agent 会拒绝连接
  const res = await fetch(`${BASE}/api/agent/ca`);
  eq(res.status, 200, 'CA 下载接口必须能匿名访问（证书本身是公开信息）');
  const pem = await res.text();
  assert(pem.includes('BEGIN CERTIFICATE'), '返回的应该是 PEM 证书');
  assert(pem.length > 200, '证书内容太短');
});

await t('权限：没登录访问 Agent 管理接口 → 401', async () => {
  const res = await fetch(`${BASE}/api/agent/overview`);
  eq(res.status, 401, '管理接口必须要求登录');
});

console.log(`\n=== 结果：${pass} 通过 / ${fail} 失败 ===`);
if (fail) {
  console.log('\n失败项：');
  for (const f of failures) console.log('  · ' + f);
  process.exit(1);
}
