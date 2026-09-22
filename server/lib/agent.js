/**
 * GLPI Agent 对接 —— 服务端那一半。
 *
 * 为什么要有这个文件：
 *   现场录入靠拍照 + OCR，一条一条录，56 台就要举 56 次手机，SN 还可能认错。
 *   GLPI Agent 装到每台电脑上之后，会自己把主机名、SN、厂商、型号、CPU、内存、
 *   硬盘、系统、网卡 MAC、登录用户，**以及显示器的 EDID（含显示器序列号）** 报上来。
 *
 * 协议是公开文档化的（glpi-project/json-protocol），服务端要做的事就三件：
 *   ① 认领 CONNECT/CONTACT：告诉 agent「我支持 glpi 协议、下次多久再来」
 *   ② 收 INVENTORY：把 content 里的字段映射进库
 *   ③ 回 ok / error
 *
 * ⚠️ 三个一定要守住的点（都是协议原文规定或实测踩出来的）：
 *
 *   1) **不能直接写进 device 台账**。agent 报的是机器自己的 SN（如 640HP72），
 *      和企业资产编号（PC-2026-0017）毫无关系，直接插会把台账搞脏。
 *      所以先落 agent_machine，人工认领之后才和台账建关联。
 *
 *   2) **部分盘点**。agent 默认「只报变化的那几段」（顶层 partial: true），
 *      所以必须**按段合并**：出现的段覆盖，没出现的段保留旧值。
 *      写成整条覆盖的话，第二次上报就能把软件列表、显示器全洗掉。
 *
 *   3) **别把原始 content 整份存库**。一台机器的 softwares 动辄几百上千条，
 *      monitors 里还带 base64 的 EDID 图，一份能到 1MB 以上。
 *      所以先 compact 再存。
 *
 * 字段坑（用官方样例实测出来的，不是猜的）：
 *   · monitors[].serial    才是序列号
 *   · monitors[].description 是「尺寸/年份」，样例里是 "32/2015"（32 寸、2015 年）—— 别当 SN 用
 *   · bios.msn 是"/640HP72/CE129536461378/"这种带斜杠的拼接串，里面**含** ssn，要清洗
 *   · cpus[].serial 常见 "To Be Filled By O.E.M." 这种垃圾值，必须过滤
 *   · networks 里有 loopback（virtualdev: true）和 00:00:00:00:00:00，挑主网卡时要排掉
 *   · hardware.vmsystem 是 Physical / VMware / VirtualBox —— 虚拟机不该混进实体台账
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import zlib from 'node:zlib';
import {
  all, allP, get, getP, run, runP, scalar, scalarP, insert, update, tx,
} from '../db.js';
import { nowISO, uuid, str } from '../util.js';

/* ================================================================== *
 * 一、传输层：解压 + 鉴权
 * ================================================================== */

/**
 * 按 Content-Type / Content-Encoding 把请求体还原成文本。
 *
 * 为什么要认这么多：agent 默认**压缩**上报，而压缩方式取决于它协商到的能力——
 * gzip / zlib(deflate) / brotli 三种都可能（见 COMMON 协议）。只认 gzip 的话，
 * 换个 agent 版本就会「收到了但解不开」。
 */
export function decodeAgentBody(raw, contentType = '', contentEncoding = '') {
  const ct = String(contentType).toLowerCase();
  const ce = String(contentEncoding).toLowerCase();
  const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  const tryInflate = (fn, name) => {
    try { return { text: fn(buf).toString('utf8'), format: name }; } catch { return null; }
  };
  // 先看 Content-Encoding（HTTP 标准那一层）
  if (ce.includes('gzip')) { const r = tryInflate(zlib.gunzipSync, 'gzip'); if (r) return r; }
  if (ce.includes('deflate')) { const r = tryInflate(zlib.inflateSync, 'zlib'); if (r) return r; }
  if (ce.includes('br')) { const r = tryInflate(zlib.brotliDecompressSync, 'br'); if (r) return r; }
  // 再看协议自己的 Content-Type（agent 走的是这一层）
  if (ct.includes('x-compress-gzip')) { const r = tryInflate(zlib.gunzipSync, 'gzip'); if (r) return r; }
  if (ct.includes('x-compress-zlib')) { const r = tryInflate(zlib.inflateSync, 'zlib'); if (r) return r; }
  if (ct.includes('x-compress-br')) { const r = tryInflate(zlib.brotliDecompressSync, 'br'); if (r) return r; }

  /*
   * 兜底：不压缩，或者声明得不对但内容其实是压缩的。
   * 实测老式 FusionInventory agent 有把 gzip 当 application/json 发出来的情况，
   * 与其回「解不开」，不如按魔数猜一把 —— 猜错的代价只是多两次失败尝试。
   */
  const text = buf.toString('utf8');
  if (text && !text.trimStart().startsWith('<') && !text.trimStart().startsWith('{')) {
    for (const [fn, name] of [[zlib.gunzipSync, 'gzip'], [zlib.inflateSync, 'zlib'], [zlib.brotliDecompressSync, 'br']]) {
      const r = tryInflate(fn, name);
      if (r && r.text.trimStart().startsWith('{')) return r;
    }
  }
  return { text, format: 'json' };
}

/** 解析 `Authorization: Basic ...` */
export function parseBasicAuth(header) {
  const m = /^Basic\s+([A-Za-z0-9+/=]+)$/i.exec(String(header || '').trim());
  if (!m) return null;
  let decoded = '';
  try { decoded = Buffer.from(m[1], 'base64').toString('utf8'); } catch { return null; }
  const at = decoded.indexOf(':');
  if (at < 0) return { user: decoded, pass: '' };
  return { user: decoded.slice(0, at), pass: decoded.slice(at + 1) };
}

/**
 * 老式 PROLOG：GLPI 9 时代的 FusionInventory agent 会先发一段 XML 打招呼，
 * 里面带 deviceid/token。我们只认得出这是「招呼」就够了，回话用新的 JSON 协议
 * ——协议原文明确写了：只要看到 GLPI-Agent-ID 头，就应该用新协议回答。
 */
export function parseProlog(text) {
  if (!/^\s*</.test(String(text || ''))) return null;
  const pick = (tag) => {
    const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i').exec(text);
    return m ? m[1].trim() : null;
  };
  const query = (pick('QUERY') || '').toUpperCase();
  if (query !== 'PROLOG') return null;
  return { prolog: true, deviceid: pick('DEVICEID'), token: pick('TOKEN') };
}

/**
 * CONTACT 的应答。
 *
 * `tasks.inventory.server = glpi` 是在告诉 agent：「盘点用 GLPI 原生 JSON 格式发给我」；
 * 回 `fusioninventory` 就会收到老的压缩 XML —— 那是另一套解析器，我们不实现。
 * expiration 是「下次多久再来问一次」。
 */
export function contactAnswer({ expiration = '6h', message = null } = {}) {
  const body = {
    status: 'ok',
    expiration,
    tasks: {
      inventory: { server: 'glpi', version: '10.0.0' },
    },
  };
  if (message) body.message = message;
  return body;
}

/* ================================================================== *
 * 二、令牌（agent 侧当 HTTP Basic 的 user/password 用）
 * ================================================================== */

const sha256 = (s) => createHash('sha256').update(String(s), 'utf8').digest('hex');

/** 生成上报令牌：返回明文（只在这一刻出现一次）与库里的记录 */
export function tokenCreate({ name = '未命名', note = '', createdBy = '' } = {}) {
  const secret = `itam_${uuid().replace(/-/g, '')}${uuid().replace(/-/g, '').slice(0, 16)}`;
  const id = uuid();
  const now = nowISO();
  insert('agent_token', {
    id,
    name: str(name, 60) || '未命名',
    token_hash: sha256(secret),
    prefix: secret.slice(0, 12),
    enabled: 1,
    note: str(note, 200) || null,
    created_by: createdBy || 'system',
    created_at: now,
    last_used_at: null,
    last_ip: null,
    use_count: 0,
  });
  return { id, token: secret, name: str(name, 60) || '未命名' };
}

export function tokenList() {
  return allP('SELECT * FROM agent_token ORDER BY created_at DESC').map((t) => ({
    id: t.id,
    name: t.name,
    prefix: t.prefix,
    enabled: !!t.enabled,
    note: t.note,
    created_by: t.created_by,
    created_at: t.created_at,
    last_used_at: t.last_used_at,
    last_ip: t.last_ip,
    use_count: t.use_count,
  }));
}

export function tokenSetEnabled(id, on) {
  const row = getP('SELECT * FROM agent_token WHERE id=?', [id]);
  if (!row) return { changes: 0 };
  return update('agent_token', id, { enabled: on ? 1 : 0 });
}

export function tokenDelete(id) {
  return runP('DELETE FROM agent_token WHERE id=?', [id]);
}

/**
 * 校验令牌。agent 会把 user 和 password 都填成我们给的令牌
 * （它俩在 Basic 里是两个字段，我们只认「两个都等于令牌」或「password 等于令牌」）。
 */
export function tokenVerify(user, pass, { ip = '' } = {}) {
  const candidates = [pass, user].filter((v) => v && String(v).length >= 20);
  if (!candidates.length) return null;
  const rows = allP('SELECT * FROM agent_token WHERE enabled=1', []);
  for (const row of rows) {
    for (const cand of candidates) {
      const h = Buffer.from(sha256(cand), 'hex');
      const want = Buffer.from(row.token_hash, 'hex');
      if (h.length === want.length && timingSafeEqual(h, want)) {
        runP('UPDATE agent_token SET last_used_at=?, last_ip=?, use_count=use_count+1 WHERE id=?', [nowISO(), ip || null, row.id]);
        return row;
      }
    }
  }
  return null;
}

/* ================================================================== *
 * 三、把 content 压成「能长期存」的样子
 * ================================================================== */

/** 软件的 top 榜留多少个名字（其余只计数） */
const SOFTWARE_TOP = 20;
/** sections_json 的硬上限：超了就继续丢细节，绝不把库撑爆 */
const SECTIONS_MAX_BYTES = 256 * 1024;

/** 明显是占位符的序列号，出现频率极高（OEM 出厂没写就填这个） */
const JUNK_SN = [
  'to be filled by o.e.m.', 'to be filled by oem', 'default string', 'none', 'null',
  'system serial number', 'system product name', 'n/a', 'na', 'unknown', 'not specified',
  '00000000', '0000000000', '0123456789', 'serial number', 'o.e.m.', 'chassis serial number',
  'fill by oem', 'x.x', '-', '/', 'system serial', 'base board serial number',
  'not applicable', 'invalid', 'unavailable', 'empty', 'noasset', 'asset-1234567890',
];

/**
 * 压成「纯小写字母数字」用于比对占位符。
 * ⚠️ 必须这样比：这些占位符各家写法五花八门（`To Be Filled By O.E.M.` /
 * `to be filled by oem` / `O.E.M.`），去空格比对会漏掉一大半 ——
 * 实测就是这么漏掉了 Dell 机器上的 "To Be Filled By O.E.M."。
 */
const junkKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const JUNK_SN_SET = new Set(JUNK_SN.map(junkKey));

/**
 * 清洗一个「可能是序列号」的值。
 * 返回 null 表示这不是个正经 SN（占位符 / 全零 / 太短 / 明显是别的字段）。
 */
export function cleanSN(v) {
  if (v === undefined || v === null) return null;
  let s = String(v).trim().replace(/\s+/g, '');
  if (!s) return null;
  s = s.replace(/^[:\-]+/, '').replace(/[；;，,]+$/, '');
  if (JUNK_SN_SET.has(junkKey(s))) return null;
  if (/^[0\-.]+$/.test(s)) return null;                       // 全是 0 或横线
  if (s.length < 4 || s.length > 64) return null;
  if (!/[A-Za-z0-9]/.test(s)) return null;
  if (!/[0-9]/.test(s) && s.length < 6) return null;          // 纯字母又很短 → 多半是型号
  return s;
}

/**
 * 清洗 bios.msn 那种 "/640HP72/CE129536461378/" 拼接串。
 * 取第一个像 SN 的片段（Dell 的机器序列号就在第一段）。
 */
export function cleanMsn(v) {
  if (!v) return null;
  const parts = String(v).split('/').map((x) => x.trim()).filter(Boolean);
  for (const p of parts) {
    const c = cleanSN(p);
    if (c) return c;
  }
  return cleanSN(String(v).replace(/\//g, ''));
}

/** 从 "32/2015" 解出尺寸与年份（monitors[].description 是这个格式，不是序列号） */
export function parseMonitorDescription(desc) {
  const m = /^\s*(\d{1,3})\s*\/\s*(\d{4})\s*$/.exec(String(desc || ''));
  if (!m) return { size_inch: null, made_year: null };
  const size = Number(m[1]);
  const year = Number(m[2]);
  return {
    size_inch: size >= 7 && size <= 120 ? size : null,
    made_year: year >= 1990 && year <= 2100 ? year : null,
  };
}

/** 挑主网卡：排掉 loopback / 虚拟网卡 / 全零 MAC */
export function pickPrimaryNetwork(networks) {
  if (!Array.isArray(networks)) return null;
  const usable = networks.filter((n) => {
    const mac = String(n?.mac || '').toLowerCase();
    if (!mac || mac === '00:00:00:00:00:00') return false;
    if (n.virtualdev === true || n.virtualdev === 'true') return false;
    const type = String(n.type || '').toLowerCase();
    if (type === 'loopback') return false;
    return true;
  });
  if (!usable.length) return null;
  // 优先「有 IPv4 且状态 up」的，其次看类型
  const score = (n) => (
    (n.ipaddress ? 4 : 0)
    + (/up/i.test(String(n.status || '')) ? 2 : 0)
    + (/ethernet|wifi|wireless|802\.11/i.test(String(n.type || '')) ? 1 : 0)
  );
  usable.sort((a, b) => score(b) - score(a));
  const n = usable[0];
  return {
    mac: String(n.mac || '').toUpperCase(),
    ip: n.ipaddress || n.ipaddress6 || null,
    description: n.description || null,
    type: n.type || null,
  };
}

/** chassis_type → 我们台账里的分类建议 */
export function kindFromChassis(chassis, os = '', vmsystem = '') {
  const c = String(chassis || '').toLowerCase();
  const byChassis = {
    laptop: 'nb', notebook: 'nb', portable: 'nb', subnotebook: 'nb', 'convertible': 'nb',
    desktop: 'pc', 'low profile desktop': 'pc', 'space-saving': 'pc', 'mini pc': 'pc',
    tower: 'pc', 'mini tower': 'pc', 'all in one': 'pc', 'all-in-one': 'pc',
    server: 'srv', 'rack mount chassis': 'srv', blade: 'srv', 'main system chassis': 'srv',
  };
  if (byChassis[c]) return byChassis[c];
  if (/server/i.test(String(os))) return 'srv';
  if (/laptop|notebook/i.test(String(chassis))) return 'nb';
  if (vmsystem && !/physical/i.test(String(vmsystem))) return 'vm';
  return 'other';
}

const isPhysical = (vmsystem) => !vmsystem || /physical/i.test(String(vmsystem));

/**
 * 把 content 压成适合长期保存的紧凑结构。
 *
 * 丢掉的东西：EDID 的 base64 图（一张就上百 KB，我们只需要序列号）、
 * ssh 公钥、软件列表（只留前 20 个 + 总数）、登录用户（只留前 10 个）。
 */
export function compactContent(content) {
  const c = content && typeof content === 'object' ? content : {};
  const out = {};
  const copyKeys = [
    'hardware', 'bios', 'operatingsystem', 'cpus', 'memories', 'storages', 'drives',
    'networks', 'monitors', 'batteries', 'printers', 'videos', 'sounds', 'controllers',
    'usbdevices', 'inputs', 'firewalls', 'antivirus', 'remote_mgmt', 'accesslog',
    'versionclient', 'versionprovider', 'virtualmachines', 'network_device', 'firmwares',
    'pagecounters', 'cartridges', 'network_ports', 'slots', 'sensors', 'environments',
    'physical_volumes', 'logical_volumes', 'removable_medias', 'licenseinfo', 'users_login',
  ];
  for (const k of copyKeys) {
    if (c[k] === undefined || c[k] === null) continue;
    out[k] = c[k];
  }

  // 显示器：只留我们真正要的字段，顺手把 description 里的尺寸/年份解出来
  if (Array.isArray(c.monitors)) {
    out.monitors = c.monitors.map((m) => {
      const { size_inch, made_year } = parseMonitorDescription(m?.description);
      return {
        serial: cleanSN(m?.serial) || null,
        caption: str(m?.caption, 60) || null,
        name: str(m?.name, 60) || null,
        manufacturer: str(m?.manufacturer, 80) || null,
        description: str(m?.description, 40) || null,
        size_inch,
        made_year,
        edid: !!m?.base64,
      };
    });
  }

  // 软件：几百上千条没意义，留个榜和总数
  if (Array.isArray(c.softwares)) {
    out.softwares = c.softwares.slice(0, SOFTWARE_TOP).map((s) => ({
      name: str(s?.name, 120) || null,
      version: str(s?.version, 60) || null,
      publisher: str(s?.publisher, 80) || null,
      install_date: str(s?.install_date, 20) || null,
    }));
    out.__software_count = c.softwares.length;
  }

  // 用户：只要前 10 个登录名
  if (Array.isArray(c.users)) {
    out.users = c.users.slice(0, 10).map((u) => ({ login: str(u?.login, 60) || null }));
    out.__user_count = c.users.length;
  }

  // operatingsystem 里的 ssh_key 是敏感信息且很长，直接扔
  if (out.operatingsystem && typeof out.operatingsystem === 'object') {
    const { ssh_key, ...rest } = out.operatingsystem;
    out.operatingsystem = rest;
  }

  // 上限兜底：还是太大就只保留「定身份 + 定配置」的那几段
  let json = JSON.stringify(out);
  if (Buffer.byteLength(json, 'utf8') > SECTIONS_MAX_BYTES) {
    const keep = ['hardware', 'bios', 'operatingsystem', 'cpus', 'memories', 'storages', 'networks', 'monitors', 'versionclient'];
    const slim = {};
    for (const k of keep) if (out[k] !== undefined) slim[k] = out[k];
    if (Array.isArray(out.softwares)) slim.__software_count = out.__software_count ?? out.softwares.length;
    out.__trimmed = true;
    json = JSON.stringify(slim);
    return JSON.parse(json);
  }
  return out;
}

/** 从（已合并的）sections 推出扁平字段 */
export function deriveMachine(sections) {
  const s = sections || {};
  const hw = s.hardware || {};
  const bios = s.bios || {};
  const os = s.operatingsystem || {};
  const cpus = Array.isArray(s.cpus) ? s.cpus : [];
  const mems = Array.isArray(s.memories) ? s.memories : [];
  const storages = Array.isArray(s.storages) ? s.storages : [];
  const monitors = Array.isArray(s.monitors) ? s.monitors : [];
  const net = pickPrimaryNetwork(s.networks);

  const cpu0 = cpus[0] || {};
  // 内存优先用 hardware.memory（MB），没有就把内存条容量加起来
  let ramMb = Number(hw.memory) || 0;
  if (!ramMb && mems.length) ramMb = mems.reduce((a, m) => a + (Number(m?.capacity) || 0), 0);

  const fmtDisk = (mb) => {
    const n = Number(mb) || 0;
    if (!n) return '';
    return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(n % (1024 * 1024) === 0 ? 0 : 1)}TB`
      : n >= 1024 ? `${Math.round(n / 1024)}GB` : `${n}MB`;
  };
  const diskSummary = storages
    .filter((d) => Number(d?.disksize) > 0)
    .map((d) => [str(d.manufacturer, 30), str(d.model, 60), fmtDisk(d.disksize)].filter(Boolean).join(' '))
    .filter(Boolean)
    .join(' + ') || null;

  const osName = [str(os.name, 40), str(os.version, 40)].filter(Boolean).join(' ') || null;

  return {
    hostname: str(hw.name, 80) || str(os.fqdn, 80) || null,
    domain: str(os.fqdn, 120) || null,
    sn: cleanSN(bios.ssn),
    sn_alt: cleanMsn(bios.msn),
    assettag: cleanSN(bios.assettag),
    uuid: str(hw.uuid, 64) || null,
    manufacturer: str(bios.smanufacturer || bios.mmanufacturer, 80) || null,
    model: str(bios.smodel || bios.mmodel, 120) || null,
    chassis_type: str(hw.chassis_type, 40) || null,
    machine_kind: kindFromChassis(hw.chassis_type, os.name, hw.vmsystem),
    vmsystem: str(hw.vmsystem, 40) || null,
    os_name: osName,
    os_version: str(os.version, 60) || null,
    os_arch: str(os.arch, 20) || null,
    cpu: str(cpu0.name, 120) || null,
    cpu_cores: Number(cpu0.core) || null,
    cpu_threads: Number(cpu0.thread) || null,
    ram_mb: ramMb || null,
    disk_summary: diskSummary,
    last_user: str(hw.lastloggeduser, 60) || null,
    mac_primary: net?.mac || null,
    ip_primary: net?.ip || null,
    networks_json: (Array.isArray(s.networks) ? s.networks : []).map((n) => ({
      mac: str(n?.mac, 20) || null,
      ip: n?.ipaddress || n?.ipaddress6 || null,
      description: str(n?.description, 60) || null,
      type: str(n?.type, 30) || null,
      virtual: !!n?.virtualdev,
    })),
    software_count: s.__software_count ?? (Array.isArray(s.softwares) ? s.softwares.length : null),
    software_top: (Array.isArray(s.softwares) ? s.softwares : []).slice(0, SOFTWARE_TOP).map((x) => x.name).filter(Boolean),
    monitors: monitors.map((m) => ({
      serial: m?.serial || null,
      caption: m?.caption || null,
      name: m?.name || null,
      manufacturer: m?.manufacturer || null,
      size_inch: m?.size_inch ?? null,
      made_year: m?.made_year ?? null,
      edid: !!m?.edid,
    })),
    is_physical: isPhysical(hw.vmsystem),
  };
}

/** 合并 sections：全量替换，部分盘点只覆盖出现过的段 */
export function mergeSections(oldSections, newSections, partial) {
  const oldS = oldSections && typeof oldSections === 'object' ? oldSections : {};
  const newS = newSections && typeof newSections === 'object' ? newSections : {};
  // 全量盘点：整份替换（机器换了配置，某一段没了就该没了）
  if (!partial) return { ...newS };
  // 部分盘点：新发的段覆盖，没发的段保留
  return { ...oldS, ...newS };
}

/* ================================================================== *
 * 四、入库
 * ================================================================== */

/** 显示器同一台机器内的去重键：有序列号用序列号，否则用 厂商+型号代号 */
export function monitorKey(m) {
  if (m?.serial) return `S:${String(m.serial).toUpperCase()}`;
  const cap = [m?.manufacturer, m?.caption || m?.name].filter(Boolean).join(' ').trim().toUpperCase();
  return `M:${cap || 'UNKNOWN'}`;
}

/**
 * 处理一次 INVENTORY。
 * @returns {{created:boolean, machine:object, monitors:number, sections:string[], partial:boolean}}
 */
export function ingest(payload, meta = {}) {
  const now = nowISO();
  const content = payload?.content;
  if (!content || typeof content !== 'object') {
    throw Object.assign(new Error('bad-format'), { agentError: 'bad-format', status: 400 });
  }
  const deviceid = str(payload.deviceid, 120) || `unknown-${uuid().slice(0, 8)}`;
  const partial = payload.partial === true;
  const itemtype = str(payload.itemtype, 40) || 'Computer';
  const compact = compactContent(content);
  const sectionNames = Object.keys(compact).filter((k) => !k.startsWith('__'));

  const existing = getP('SELECT * FROM agent_machine WHERE deviceid=?', [deviceid]);
  let oldSections = {};
  if (existing?.sections_json) {
    try { oldSections = JSON.parse(existing.sections_json) || {}; } catch { oldSections = {}; }
  }
  const merged = mergeSections(oldSections, compact, partial);
  const flat = deriveMachine(merged);

  const report = {
    deviceid,
    tag: str(payload.tag, 60) || null,
    hostname: flat.hostname,
    domain: flat.domain,
    sn: flat.sn,
    sn_alt: flat.sn_alt,
    assettag: flat.assettag,
    uuid: flat.uuid,
    manufacturer: flat.manufacturer,
    model: flat.model,
    chassis_type: flat.chassis_type,
    machine_kind: flat.machine_kind,
    vmsystem: flat.vmsystem,
    os_name: flat.os_name,
    os_version: flat.os_version,
    os_arch: flat.os_arch,
    cpu: flat.cpu,
    cpu_cores: flat.cpu_cores,
    cpu_threads: flat.cpu_threads,
    ram_mb: flat.ram_mb,
    disk_summary: flat.disk_summary,
    last_user: flat.last_user,
    mac_primary: flat.mac_primary,
    ip_primary: flat.ip_primary,
    networks_json: JSON.stringify(flat.networks_json),
    software_count: flat.software_count,
    software_top: JSON.stringify(flat.software_top),
    sections_json: JSON.stringify(merged),
    agent_name: str(meta.agentName, 60) || null,
    agent_version: str(meta.agentVersion, 40) || null,
    last_seen_at: now,
  };

  let machineId;
  let created = false;
  tx(() => {
    if (existing) {
      machineId = existing.id;
      update('agent_machine', machineId, {
        ...report,
        report_count: Number(existing.report_count || 0) + 1,
        partial_count: Number(existing.partial_count || 0) + (partial ? 1 : 0),
      });
    } else {
      created = true;
      machineId = uuid();
      insert('agent_machine', {
        id: machineId,
        ...report,
        first_seen_at: now,
        report_count: 1,
        partial_count: partial ? 1 : 0,
        claimed_device_id: null,
        auto_sync: 1,
        last_sync_at: null,
        remark: null,
      });
    }

    // 显示器：按 edid_key upsert，同时把本次没出现的显示器保留（它可能只是这次没插）
    for (const m of flat.monitors) {
      const key = monitorKey(m);
      const row = getP('SELECT * FROM agent_monitor WHERE machine_id=? AND edid_key=?', [machineId, key]);
      if (row) {
        update('agent_monitor', row.id, {
          serial: m.serial ?? row.serial,
          caption: m.caption ?? row.caption,
          name: m.name ?? row.name,
          manufacturer: m.manufacturer ?? row.manufacturer,
          size_inch: m.size_inch ?? row.size_inch,
          made_year: m.made_year ?? row.made_year,
          edid_seen: (m.edid || row.edid_seen) ? 1 : 0,
          last_seen_at: now,
        });
      } else {
        insert('agent_monitor', {
          id: uuid(),
          machine_id: machineId,
          edid_key: key,
          serial: m.serial,
          caption: m.caption,
          name: m.name,
          manufacturer: m.manufacturer,
          size_inch: m.size_inch,
          made_year: m.made_year,
          edid_seen: m.edid ? 1 : 0,
          first_seen_at: now,
          last_seen_at: now,
          claimed_device_id: null,
        });
      }
    }
  });

  const machine = machineGet(machineId);
  /*
   * 上报日志在这里写，不交给调用方。
   * 一开始是让 HTTP 层写的，结果「直接调 ingest」的路径（测试、以后可能的导入器）
   * 就不留痕了 —— 日志这种东西，写在最靠近数据的地方才不会漏。
   * HTTP 层只负责写「没走到 ingest」的那些记录（鉴权失败 / 解不开 / 不支持的动作）。
   */
  logReport({
    deviceid,
    machine_id: machineId,
    action: 'inventory',
    itemtype,
    partial,
    sections: sectionNames,
    bytes: meta.bytes,
    format: meta.format,
    token_id: meta.token_id,
    token_name: meta.token_name,
    ip: meta.ip,
    agent_name: meta.agentName,
    agent_version: meta.agentVersion,
    result: 'ok',
    message: created ? '新机器' : `第 ${machine?.report_count} 次上报`,
  });

  return {
    created, machine, monitors: flat.monitors.length, sections: sectionNames, partial, itemtype,
  };
}

/* ---- 上报日志 ---- */
export function logReport(entry = {}) {
  try {
    insert('agent_report', {
      id: uuid(),
      deviceid: str(entry.deviceid, 120) || null,
      machine_id: entry.machine_id || null,
      action: str(entry.action, 30) || null,
      itemtype: str(entry.itemtype, 40) || null,
      partial: entry.partial ? 1 : 0,
      sections: JSON.stringify(entry.sections || []),
      bytes: Number(entry.bytes) || null,
      format: str(entry.format, 12) || null,
      token_id: entry.token_id || null,
      token_name: str(entry.token_name, 60) || null,
      ip: entry.ip || null,
      agent_name: str(entry.agent_name, 60) || null,
      agent_version: str(entry.agent_version, 40) || null,
      result: str(entry.result, 20) || 'ok',
      message: str(entry.message, 300) || null,
      created_at: nowISO(),
    });
  } catch { /* 日志失败不能影响上报 */ }
}

/* ================================================================== *
 * 五、查询
 * ================================================================== */

export function machineGet(id) {
  const row = getP('SELECT * FROM agent_machine WHERE id=?', [id]);
  if (!row) return null;
  return hydrateMachine(row);
}

export function machineList({ q = '', only = '', page = 1, page_size = 50 } = {}) {
  const where = [];
  const params = [];
  if (q) {
    where.push('(hostname LIKE ? OR sn LIKE ? OR sn_alt LIKE ? OR model LIKE ? OR manufacturer LIKE ? OR last_user LIKE ? OR ip_primary LIKE ? OR mac_primary LIKE ?)');
    const like = `%${q}%`;
    for (let i = 0; i < 8; i++) params.push(like);
  }
  if (only === 'unclaimed') where.push('claimed_device_id IS NULL');
  if (only === 'claimed') where.push('claimed_device_id IS NOT NULL');
  if (only === 'physical') where.push("(vmsystem IS NULL OR vmsystem = '' OR vmsystem LIKE 'Physical%')");
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = scalarP(`SELECT COUNT(*) AS c FROM agent_machine ${w}`, params);
  const size = Math.min(500, Math.max(1, Number(page_size) || 50));
  const p = Math.max(1, Number(page) || 1);
  const items = allP(
    `SELECT * FROM agent_machine ${w} ORDER BY (claimed_device_id IS NOT NULL), last_seen_at DESC LIMIT ? OFFSET ?`,
    [...params, size, (p - 1) * size],
  ).map(hydrateMachine);
  return { items, total, page: p, page_size: size };
}

function hydrateMachine(row) {
  const safe = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };
  const out = {
    ...row,
    networks: safe(row.networks_json, []),
    software_list: safe(row.software_top, []),
    claimed: !!row.claimed_device_id,
    // 虚拟机的判据：vmsystem 有值且不是 Physical。
    // ⚠️ 这个字段是**推出来的**，库里没有这一列（它随 vmsystem 变，存了反而会不一致）
    is_physical: isPhysical(row.vmsystem),
  };
  delete out.sections_json;      // 列表里不带这一坨（几百 KB）
  delete out.networks_json;
  delete out.software_top;
  return out;
}

/** 认领时要同步进台账的字段（只这些，别的一律不动） */
export const SYNC_FIELDS = ['sn', 'brand', 'model', 'os_name', 'cpu', 'memory', 'disk', 'mac_address', 'ip_address'];

/** 从 agent_machine + 分类，算出「如果新建设备，应该填什么」 */
export function suggestDeviceFields(machine, categoryCode = null) {
  const mem = machine.ram_mb ? (machine.ram_mb >= 1024 ? `${Math.round(machine.ram_mb / 1024)}GB` : `${machine.ram_mb}MB`) : null;
  return {
    sn: machine.sn || machine.sn_alt || null,
    brand: machine.manufacturer || null,
    model: machine.model || null,
    os_name: machine.os_name || null,
    cpu: machine.cpu || null,
    memory: mem,
    disk: machine.disk_summary || null,
    mac_address: machine.mac_primary || null,
    ip_address: machine.ip_primary || null,
    category_code: categoryCode,
  };
}

export function machineReports(deviceid, limit = 50) {
  return allP(
    'SELECT * FROM agent_report WHERE deviceid=? ORDER BY created_at DESC LIMIT ?',
    [deviceid, Math.min(200, Number(limit) || 50)],
  ).map((r) => {
    let sections = [];
    try { sections = JSON.parse(r.sections || '[]'); } catch { /* ignore */ }
    return { ...r, sections };
  });
}

export function reportList({ page = 1, page_size = 50, only_error = false } = {}) {
  const w = only_error ? "WHERE result <> 'ok'" : '';
  const total = scalarP(`SELECT COUNT(*) AS c FROM agent_report ${w}`, []);
  const size = Math.min(500, Math.max(1, Number(page_size) || 50));
  const p = Math.max(1, Number(page) || 1);
  const items = allP(
    `SELECT * FROM agent_report ${w} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [size, (p - 1) * size],
  ).map((r) => {
    let sections = [];
    try { sections = JSON.parse(r.sections || '[]'); } catch { /* ignore */ }
    return { ...r, sections };
  });
  return { items, total, page: p, page_size: size };
}

export function monitorList({ machineId = null, only = '' } = {}) {
  const where = [];
  const params = [];
  if (machineId) { where.push('m.machine_id = ?'); params.push(machineId); }
  if (only === 'unclaimed') where.push('m.claimed_device_id IS NULL');
  if (only === 'claimed') where.push('m.claimed_device_id IS NOT NULL');
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return allP(
    `SELECT m.*, a.hostname, a.sn AS machine_sn, a.last_seen_at AS machine_seen
       FROM agent_monitor m JOIN agent_machine a ON a.id = m.machine_id
       ${w} ORDER BY m.last_seen_at DESC LIMIT 500`,
    params,
  ).map((r) => ({ ...r, claimed: !!r.claimed_device_id }));
}

export function stats() {
  const machines = scalarP('SELECT COUNT(*) AS c FROM agent_machine', []) || 0;
  const unclaimed = scalarP('SELECT COUNT(*) AS c FROM agent_machine WHERE claimed_device_id IS NULL', []) || 0;
  const monitors = scalarP('SELECT COUNT(*) AS c FROM agent_monitor', []) || 0;
  const monitorsUnclaimed = scalarP('SELECT COUNT(*) AS c FROM agent_monitor WHERE claimed_device_id IS NULL', []) || 0;
  const reports = scalarP('SELECT COUNT(*) AS c FROM agent_report', []) || 0;
  const last = getP('SELECT created_at, result, deviceid FROM agent_report ORDER BY created_at DESC LIMIT 1', []);
  const tokens = scalarP('SELECT COUNT(*) AS c FROM agent_token WHERE enabled=1', []) || 0;
  const vm = scalarP("SELECT COUNT(*) AS c FROM agent_machine WHERE vmsystem IS NOT NULL AND vmsystem <> '' AND vmsystem NOT LIKE 'Physical%'", []) || 0;
  return {
    machines, unclaimed, monitors, monitors_unclaimed: monitorsUnclaimed,
    reports, tokens, virtual: vm, last_report_at: last?.created_at || null,
  };
}

/** 按 SN / UUID 给一台待认领机器推荐可能对应的台账设备（认领时给个默认值） */
export function matchCandidates(machine) {
  const out = [];
  const seen = new Set();
  const push = (row, reason) => {
    if (!row || seen.has(row.id)) return;
    seen.add(row.id);
    out.push({ id: row.id, asset_no: row.asset_no, sn: row.sn, brand: row.brand, model: row.model, status: row.status, reason });
  };
  if (!machine) return out;
  for (const cand of [machine.sn, machine.sn_alt]) {
    if (!cand) continue;
    for (const r of allP('SELECT * FROM device WHERE deleted_at IS NULL AND sn IS NOT NULL AND sn <> \'\' AND UPPER(sn)=UPPER(?) LIMIT 5', [cand])) {
      push(r, `序列号一致（${cand}）`);
    }
    // 去掉非字母数字再比一次：台账里可能存成 "640-HP72" 这种
    const compact = String(cand).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (compact.length >= 5) {
      for (const r of allP(
        `SELECT * FROM device WHERE deleted_at IS NULL AND sn IS NOT NULL
           AND REPLACE(REPLACE(REPLACE(UPPER(sn),'-',''),' ',''),'/','') = ? LIMIT 5`,
        [compact],
      )) push(r, `序列号归一化后一致（${cand}）`);
    }
  }
  if (machine.uuid) {
    for (const r of allP("SELECT * FROM device WHERE deleted_at IS NULL AND extra LIKE ? LIMIT 5", [`%${machine.uuid}%`])) {
      push(r, '机器 UUID 一致（之前认领过）');
    }
  }
  return out;
}
