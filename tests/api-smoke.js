/**
 * API 冒烟测试：对正在运行的服务发请求，验证主要接口可用
 * 先启动服务（start.bat / node server/index.js），再运行：node tests/api-smoke.js
 *
 * 服务已开启登录认证，本脚本会自动登录：
 *   - 优先读环境变量 ITAM_USER / ITAM_PASS
 *   - 否则读 data/admin-password.txt（首次启动自动生成的初始密码）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE || 'http://127.0.0.1:8080';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

/* ---------- 会话 Cookie ---------- */
let cookie = '';

async function rawReq(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(BASE + path, { ...opts, headers });
  const setC = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  if (setC.length) cookie = setC.map((c) => c.split(';')[0]).join('; ');
  return res;
}

async function req(path, opts = {}) {
  const res = await rawReq(path, opts);
  const ct = res.headers.get('content-type') || '';
  let body = ct.includes('json') ? await res.json() : await res.text();
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}: ${typeof body === 'string' ? body.slice(0, 200) : JSON.stringify(body).slice(0, 200)}`);
  }
  // 服务端统一 { ok, data } 包装
  if (body && typeof body === 'object' && 'data' in body && 'ok' in body) body = body.data;
  return { status: res.status, body, ct };
}

/* ---------- 取管理员密码 ---------- */
const ADMIN_USER = process.env.ITAM_USER || 'admin';
let ADMIN_PASS = process.env.ITAM_PASS || '';
if (!ADMIN_PASS) {
  const f = path.join(__dirname, '..', 'data', 'admin-password.txt');
  if (fs.existsSync(f)) {
    const m = fs.readFileSync(f, 'utf8').match(/初始密码:\s*(\S+)/);
    if (m) ADMIN_PASS = m[1];
  }
}

console.log('\n=== API 冒烟测试 (' + BASE + ') ===\n');

/* ---------- 认证 ---------- */
await check('未登录访问受保护接口应返回 401', async () => {
  for (const p of ['/api/devices', '/api/settings', '/api/options', '/api/devices/trash']) {
    const res = await fetch(BASE + p);
    if (res.status !== 401) throw new Error(`${p} 应为 401，实际 ${res.status}`);
  }
});

await check('未登录访问页面应重定向到登录页', async () => {
  for (const p of ['/', '/m']) {
    const res = await fetch(BASE + p, { redirect: 'manual' });
    if (res.status !== 302) throw new Error(`${p} 应为 302，实际 ${res.status}`);
    const loc = res.headers.get('location') || '';
    if (!loc.startsWith('/login')) throw new Error(`${p} 应跳转 /login，实际 ${loc}`);
  }
});

await check('登录页可匿名访问', async () => {
  const res = await fetch(BASE + '/login');
  if (!res.ok) throw new Error('登录页应可访问，实际 ' + res.status);
  const html = await res.text();
  if (!html.includes('IT 资产管理系统')) throw new Error('登录页内容异常');
});

await check('错误密码应被拒绝', async () => {
  const res = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USER, password: 'wrong-' + Date.now() }),
  });
  if (res.status !== 401) throw new Error('应为 401，实际 ' + res.status);
});

await check('正确密码可登录并拿到会话', async () => {
  if (!ADMIN_PASS) throw new Error('未找到管理员密码：请设置 ITAM_PASS 环境变量，或查看 data/admin-password.txt');
  const res = await rawReq('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  });
  if (!res.ok) throw new Error(`登录失败 HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  if (!cookie) throw new Error('未收到会话 Cookie');
  const { body } = await req('/api/auth/status');
  if (!body.authenticated) throw new Error('登录后应处于已认证状态');
  if (body.username !== ADMIN_USER) throw new Error('用户名不符：' + body.username);
});

/* ---------- 准备：库为空时自建测试数据，结束后清理 ---------- */
const fixtureIds = [];
async function createFixtureDevice(tag) {
  const { body: opts } = await req('/api/options');
  const cat = opts.categories.find((c) => c.has_sn) || opts.categories[0];
  const { body: dev } = await req('/api/devices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category_id: cat.id, brand: 'SMOKE', model: 'SMOKE-TEST',
      sn: 'SMOKE' + tag + Date.now(), status: 'in_use', supplier: (opts.suppliers || [])[0] || null,
    }),
  });
  fixtureIds.push(dev.id);
  return dev;
}
async function ensureFixtureDevice() {
  const { body } = await req('/api/devices?status=in_use&page_size=1');
  if (body.total > 0) return null;
  return createFixtureDevice('');
}
const fixtureDevice = await ensureFixtureDevice();
if (fixtureDevice) console.log('  （库中无设备，已自动创建测试数据）\n');

/**
 * 保证库里**至少有一台带照片的设备**。
 *
 * 以前这段依赖「真实库里正好有照片」：全新环境（临时库）里演示数据没有照片，
 * 「导出 Excel 自动嵌图」那条断言就会红 —— 看起来像导出坏了，其实是测试没有素材。
 * 这里自己补一张，测试才不靠运气。图片直接写进 data/uploads（和服务同一个目录），
 * 再把路径挂到设备上，走的正是手机端入库时写的那两个字段。
 *
 * ⚠️ 只改**本次测试自己建的**那台设备。以前这里顺手挑「列表里第一台」去挂照片 ——
 *    对着真实服务跑一次，用户某台设备的照片就被改成了测试图。
 */
async function ensurePhotoDevice() {
  const list = (await req('/api/devices?page_size=200')).body;
  if (list.items.some((d) => d.photo_path)) return null;

  const target = fixtureDevice || await createFixtureDevice('-PHOTO');
  const day = new Date().toISOString().slice(0, 10);
  const rel = `/uploads/${day}/smoke-photo-${Date.now()}.png`;
  const abs = path.join(__dirname, '..', 'data', rel.replace(/^\/uploads\//, 'uploads/'));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  // 1×1 的合法 PNG：内容无所谓，要的是「有个真文件可以被嵌进 Excel / 用 token 取回」
  fs.writeFileSync(abs, Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ));
  await req('/api/devices/' + target.id, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photo_path: rel }),
  });
  return { id: target.id, path: rel };
}
const photoFix = await ensurePhotoDevice();
if (photoFix) console.log(`  （库中设备都没照片，已给测试设备 ${photoFix.id.slice(0, 8)} 补了一张）\n`);

await check('健康检查', async () => {
  const { body } = await req('/api/health');
  if (body.status !== 'ok') throw new Error('status != ok');
  if (body.counts.devices < 1) throw new Error('应有可用设备（含自动创建的测试数据）');
});

await check('管理端页面', async () => {
  const { body, ct } = await req('/');
  if (!ct.includes('text/html')) throw new Error('不是 HTML');
  if (!body.includes('资产管理系统')) throw new Error('缺少标题');
});

await check('移动端页面', async () => {
  const { body, ct } = await req('/m');
  // 标题从「IT 资产录入」改成了「IT 资产管理」：手机端首屏已是仪表盘，不只是录入
  if (!body.includes('IT 资产管理')) throw new Error('缺少移动端标题');
  if (!ct.includes('text/html')) throw new Error('不是 HTML');
  // 底部导航要有仪表盘这一格，否则首屏没地方落
  if (!body.includes('data-v="dashboard"')) throw new Error('底部导航缺少仪表盘入口');
});

await check('静态资源 CSS', async () => {
  const { ct } = await req('/assets/admin.css');
  if (!ct.includes('text/css')) throw new Error('CSS 类型错误');
});

await check('选项接口', async () => {
  const { body } = await req('/api/options');
  if (!body.categories?.length) throw new Error('无分类');
  if (!body.statuses?.length) throw new Error('无状态');
});

await check('供应商选项与筛选', async () => {
  const { body } = await req('/api/options');
  if (!Array.isArray(body.suppliers) || !body.suppliers.length) throw new Error('无供应商选项');
  if (!body.suppliers.includes('易点云')) throw new Error('供应商应包含「易点云」');
  const { body: filtered } = await req('/api/devices?supplier=' + encodeURIComponent('易点云'));
  if (!Array.isArray(filtered.items)) throw new Error('按供应商筛选失败');
  if (!filtered.items.every((d) => d.supplier === '易点云')) throw new Error('筛选结果含其它供应商');
});

await check('仪表盘统计', async () => {
  const { body } = await req('/api/dashboard');
  if (!body.kpi || body.kpi.total < 1) throw new Error('KPI 缺失');
  if (!Array.isArray(body.byCategory)) throw new Error('缺少分类统计');
});

await check('设备列表 + 筛选', async () => {
  const { body } = await req('/api/devices?page_size=5&status=in_use');
  if (!body.items?.length) throw new Error('无在用设备');
  if (!body.items.every((d) => d.status === 'in_use')) throw new Error('状态筛选无效');
});

await check('设备详情', async () => {
  const { body: list } = await req('/api/devices?page_size=1');
  const id = list.items[0].id;
  const { body } = await req('/api/devices/' + id);
  if (body.id !== id) throw new Error('详情 id 不匹配');
});

await check('组织架构', async () => {
  const { body } = await req('/api/orgs');
  if (!body.tree?.length) throw new Error('无组织');
});

await check('分类列表', async () => {
  const { body } = await req('/api/categories');
  if (!body.items?.length) throw new Error('无分类');
});

await check('Excel 导出', async () => {
  const { body, ct } = await req('/api/excel/export');
  if (!ct.includes('spreadsheetml')) throw new Error('Content-Type 不是 xlsx');
  if (!body) throw new Error('内容为空');
});

await check('Excel 模板下载', async () => {
  const { ct } = await req('/api/excel/template');
  if (!ct.includes('spreadsheetml')) throw new Error('Content-Type 不是 xlsx');
});

await check('二维码生成', async () => {
  const { body, ct } = await req('/api/qrcode?text=' + encodeURIComponent('hello'));
  if (!ct.includes('image/svg')) throw new Error('不是 SVG');
  if (!body.startsWith('<svg')) throw new Error('不是有效 SVG');
});

await check('OCR 识别（mock）', async () => {
  // 用一张 1x1 PNG 触发 mock 通道
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const { body } = await req('/api/ocr', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: png.toString('base64'), provider: 'mock' }),
  });
  if (body.provider !== 'mock') throw new Error('provider 不是 mock');
  if (!body.lines?.length) throw new Error('无识别行');
  if (!body.sn) throw new Error('未识别出 SN');
});

await check('OCR 返回 SN 纠错候选（供手机端一点替换）', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const fd = new FormData();
  fd.append('image', new Blob([png], { type: 'image/png' }), 'n.png');
  fd.append('provider', 'mock');
  const { body } = await req('/api/ocr', { method: 'POST', body: fd });
  if (!Array.isArray(body.sn_candidates)) throw new Error('sn_candidates 应是数组');
  if (!('sn_fix' in body)) throw new Error('缺少 sn_fix 字段（自动纠错说明）');
  for (const c of body.sn_candidates) {
    if (!c.sn || typeof c.score !== 'number') throw new Error('候选结构不对：' + JSON.stringify(c));
    if (c.sn === body.sn) throw new Error('候选里不该重复出现当前 SN');
  }
});

await check('OCR 通道测试', async () => {
  const { body } = await req('/api/ocr/test', { method: 'POST', body: JSON.stringify({}) });
  if (!body.provider) throw new Error('无 provider');
});

await check('拍照入库：原图与缩略图自动一起归档（无需手动操作）', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const original = Buffer.concat([png, Buffer.alloc(1024, 3)]);

  const fd = new FormData();
  fd.append('image', new Blob([png], { type: 'image/png' }), 'nameplate.png');
  fd.append('original', new Blob([original], { type: 'image/png' }), 'original.png');
  fd.append('thumb', new Blob([png], { type: 'image/png' }), 'thumb.png');
  fd.append('provider', 'mock');

  const { body } = await req('/api/ocr', { method: 'POST', body: fd });
  const trio = { image_path: body.image_path, original_path: body.original_path, thumb_path: body.thumb_path };
  for (const [k, v] of Object.entries(trio)) {
    if (!v) throw new Error(`OCR 未返回 ${k}`);
  }
  if (new Set(Object.values(trio)).size !== 3) throw new Error('三份图应各自独立保存：' + JSON.stringify(trio));

  // 三份都要能取回来（原图字节数应大于压缩图）
  const sizes = {};
  for (const [k, v] of Object.entries(trio)) {
    const r = await rawReq(v);
    if (!r.ok) throw new Error(`${k} 取不回来 HTTP ${r.status}`);
    sizes[k] = (await r.arrayBuffer()).byteLength;
  }
  if (sizes.original_path <= sizes.image_path) {
    throw new Error(`原图(${sizes.original_path}B) 不该小于等于压缩图(${sizes.image_path}B)`);
  }
});

await check('照片列：导出 Excel 自动嵌图 + 实时链接带可用的照片 URL', async () => {
  const { parseXlsx, zipRead } = await import('../server/lib/xlsx.js');

  // 1) 快照导出：应有媒体文件与「照片」列
  const exp = await rawReq('/api/excel/export?split=1');
  const buf = Buffer.from(await exp.arrayBuffer());
  const media = [...zipRead(buf).keys()].filter((n) => n.startsWith('xl/media/'));
  if (!media.length) throw new Error('导出的 xlsx 里没有嵌入任何照片');

  const sheetNames = parseXlsx(buf).sheets;
  let checkedCols = 0;
  let sawOriginalCol = false;
  for (const n of sheetNames) {
    if (['字段说明', '设备分类', '组织架构', '汇总'].includes(n)) continue;
    const p = parseXlsx(buf, { sheet: n });
    if (!p.headers.includes('照片')) throw new Error(`工作表「${n}」缺少「照片」列`);
    if (!p.headers.includes('照片链接')) throw new Error(`工作表「${n}」缺少「照片链接」列`);
    // 「原图链接」只在真的有独立原图时才出列，避免和「照片链接」一模一样
    if (p.headers.includes('原图链接')) sawOriginalCol = true;
    checkedCols++;
  }
  if (!checkedCols) throw new Error('没有可校验的明细工作表');

  // 2) 实时链接：照片列必须是能直接打开的 URL（带 token），且不带 token 打不开
  const live = (await req('/api/excel/live-links')).body;
  const withPhotos = live.sheets.find((s) => s.name) || null;
  const r = await fetch(live.all.html);
  const html = await r.text();
  if (!html.includes('照片链接')) throw new Error('实时网页表格缺少「照片链接」列');
  if (!String(r.headers.get('x-photo-count'))) throw new Error('缺少 X-Photo-Count 响应头');

  // 照片列必须是可点击的超链接（短文字），不能是一屏长网址
  if (/<td>https?:\/\/[^<]*\/uploads\//.test(html)) {
    throw new Error('照片链接应渲染成可点击的 <a> 短链接，而不是裸网址文本');
  }
  if (!html.includes('<a href="http://') || !html.includes('打开照片')) {
    throw new Error('照片链接没有渲染成「打开照片」超链接');
  }

  // 同一行里「照片链接」和「原图链接」不能指向同一个文件（以前两列一模一样）
  for (const tr of html.split('<tr>')) {
    const links = [...tr.matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]);
    if (links.length === 2 && links[0] === links[1]) {
      throw new Error('同一行的「照片链接」与「原图链接」重复，看起来像坏了两列');
    }
  }

  const m = /(https?:\/\/[^"'<\s]+\/uploads\/[^"'<\s]+token=[a-f0-9]+)/.exec(html);
  if (m) {
    const img = await fetch(m[1]);
    if (!img.ok || !String(img.headers.get('content-type')).startsWith('image/')) {
      throw new Error('带 token 的照片链接取不到图片，Excel 里会显示不出来');
    }
    const bare = await fetch(m[1].split('?')[0], { redirect: 'manual' });
    const bareType = String(bare.headers.get('content-type') || '');
    if (bare.status === 200 && bareType.startsWith('image/')) {
      throw new Error('不带 token 也能拿到照片，照片失去登录保护');
    }
  } else if (withPhotos) {
    // 库里确实没照片时跳过（例如全新环境）
    const anyPhoto = await req('/api/devices?page_size=200');
    if (anyPhoto.body.items.some((d) => d.photo_path || d.photo_original_path)) {
      throw new Error('设备有照片，但实时表格里找不到带 token 的照片链接');
    }
  }

  // 3) 可以显式关掉照片导出
  const noPhoto = await rawReq('/api/excel/export?photos=0');
  const nb = Buffer.from(await noPhoto.arrayBuffer());
  if ([...zipRead(nb).keys()].some((n) => n.startsWith('xl/media/'))) {
    throw new Error('photos=0 时不应嵌入图片');
  }
});

await check('照片链接不会写成本机地址（换台电脑也打得开）', async () => {
  const live = (await req('/api/excel/live-links')).body;
  const anyDevice = await req('/api/devices?page_size=200');
  const hasPhoto = anyDevice.body.items.some((d) => d.photo_path || d.photo_original_path);
  if (!hasPhoto) return;   // 库里没照片就跳过

  // 模拟管理员在服务器本机用 127.0.0.1 打开后台
  const r = await fetch(`${BASE}/api/live/devices.html?token=${live.token}&all=1`, { headers: { Host: '127.0.0.1:8080' } });
  const html = await r.text();
  const urls = [...html.matchAll(/https?:\/\/[^"'<\s]*\/uploads\/[^"'<\s]*/g)].map((m) => m[0]);
  if (!urls.length) throw new Error('实时表格里找不到任何照片链接');
  const loopback = urls.filter((u) => /\/\/(127\.0\.0\.1|localhost)[:/]/.test(u));
  if (loopback.length) {
    throw new Error(`有 ${loopback.length} 条照片链接指向本机地址，别的电脑/手机点开会「无法访问」：${loopback[0]}`);
  }

  // 手填「外部访问地址」后必须以它为准
  const sys = (await req('/api/settings')).body.settings.system || {};
  const backup = sys.link_base_url || '';
  try {
    await req('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({ system: { link_base_url: 'http://itam.example.com:9999' } }),
    });
    const r2 = await fetch(`${BASE}/api/live/devices.html?token=${live.token}&all=1`, { headers: { Host: '127.0.0.1:8080' } });
    const h2 = await r2.text();
    if (!h2.includes('http://itam.example.com:9999/uploads/')) {
      throw new Error('设置了「外部访问地址」后，照片链接没有跟着改');
    }
  } finally {
    await req('/api/settings', { method: 'PUT', body: JSON.stringify({ system: { link_base_url: backup } }) });
  }
});

await check('系统设置读取', async () => {
  const { body } = await req('/api/settings');
  if (!body.settings || !body.ocr_status) throw new Error('设置结构缺失');
  if (body.settings.auth) throw new Error('账号信息不应下发给前端');
});

await check('密钥在接口中已脱敏', async () => {
  const { body } = await req('/api/settings');
  const cfg = body.settings.ocr_vision || {};
  if (cfg.api_key && !String(cfg.api_key).includes('****')) {
    throw new Error('API Key 应以掩码返回，实际：' + cfg.api_key);
  }
  if (cfg.secret_key && !String(cfg.secret_key).includes('****')) {
    throw new Error('Secret Key 应以掩码返回');
  }
});

await check('SN 查重查询', async () => {
  const { body: list } = await req('/api/devices?page_size=1');
  const sn = list.items[0].sn;
  if (sn) {
    const { body } = await req('/api/devices/lookup?sn=' + encodeURIComponent(sn));
    if (!body.found) throw new Error('应能查到该 SN');
  }
});

await check('资产二维码用短码：扫资产编号也能查到设备', async () => {
  const { body: list } = await req('/api/devices?page_size=5');
  const dev = list.items.find((d) => d.asset_no);
  if (!dev) return;

  // 二维码里放的是资产编号（21×21 模块，好扫），所以按资产编号必须能查到
  const byAsset = await req('/api/devices/lookup?sn=' + encodeURIComponent(dev.asset_no));
  if (!byAsset.body.found) throw new Error(`按资产编号「${dev.asset_no}」查不到设备，扫码会失效`);
  if (byAsset.body.items[0].id !== dev.id) throw new Error('按资产编号查到了别的设备');

  // 短码的二维码必须比网址码简单（模块少 = 好扫）
  const { qrcodeEncode } = await import('../server/lib/qrcode.js');
  const short = qrcodeEncode(dev.asset_no, 'M');
  const url = qrcodeEncode(`http://192.168.1.100:8080/m/#/device/${dev.id}`, 'L');
  if (short.size >= url.size) {
    throw new Error(`短码(${short.size}×${short.size}) 不该比网址码(${url.size}×${url.size}) 还复杂`);
  }

  // 二维码接口要能出图
  for (const q of [dev.asset_no, `http://x/m/#/device/${dev.id}`]) {
    const r = await rawReq('/api/qrcode?text=' + encodeURIComponent(q) + '&ec=M');
    if (!r.ok) throw new Error('二维码接口返回 ' + r.status);
    const svg = await r.text();
    if (!svg.includes('<svg')) throw new Error('二维码不是 SVG');
  }
});

await check('服务端二维码兜底解码（/api/scan）：手机拍屏幕解不出来时的那条后路', async () => {
  const { qrcodeEncode } = await import('../server/lib/qrcode.js');
  const dev = (await req('/api/devices?page_size=5')).body.items.find((d) => d.asset_no);
  if (!dev) return;
  const { modules } = qrcodeEncode(dev.asset_no, 'M');

  /** 把模块矩阵光栅化成前端会发上来的那种灰度字节（顺便撒点噪声，像拍屏幕） */
  const raster = (scale, noiseAmp) => {
    const n = modules.length; const quiet = 4;
    const size = (n + quiet * 2) * scale;
    const gray = Buffer.alloc(size * size, 255);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (!modules[y][x]) continue;
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            gray[((y + quiet) * scale + dy) * size + (x + quiet) * scale + dx] = 0;
          }
        }
      }
    }
    let seed = 12345;
    for (let i = 0; i < gray.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const v = gray[i] + Math.round((seed / 0x7fffffff - 0.5) * 2 * noiseAmp);
      gray[i] = Math.max(0, Math.min(255, v));
    }
    return { gray, size };
  };

  for (const scale of [4, 6, 10]) {
    const { gray, size } = raster(scale, 10);
    const res = await rawReq(`/api/scan?w=${size}&h=${size}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: gray,
    });
    if (!res.ok) throw new Error(`每格 ${scale}px 时接口返回 ${res.status}`);
    const body = await res.json();
    if (!body.data?.ok) throw new Error(`每格 ${scale}px 时服务端没解出来`);
    if (body.data.text !== dev.asset_no) {
      throw new Error(`解出来的内容不对：期望 ${dev.asset_no}，实得 ${body.data.text}`);
    }
  }

  // 手机真实发上来的那种帧：900×900 的画面里只有一小块是二维码（约 180px）。
  // 顺带压一次体积上限：900×900 = 810KB，是这条接口最大档的请求体。
  {
    const W = 900;
    const frame = Buffer.alloc(W * W, 232);          // 显示器白底偏灰
    const n = modules.length;
    const quiet = 3;
    const px = 180;
    const side = px + quiet * 2;
    const mod = px / n;
    const ox = Math.round((W - side) / 2);
    const oy = Math.round((W - side) / 2);
    for (let y = 0; y < side; y++) {
      for (let x = 0; x < side; x++) {
        const mx = Math.floor((x - quiet) / mod);
        const my = Math.floor((y - quiet) / mod);
        const dark = mx >= 0 && my >= 0 && mx < n && my < n ? modules[my][mx] : 0;
        frame[(oy + y) * W + ox + x] = dark ? 16 : 240;
      }
    }
    // 摩尔纹：拍屏幕必有，不加就测不出真实难度
    for (let y = 0; y < W; y++) {
      for (let x = 0; x < W; x++) {
        const v = Math.sin(x / 1.6) * Math.sin(y / 1.8) * 18;
        frame[y * W + x] = Math.max(0, Math.min(255, frame[y * W + x] + v));
      }
    }
    const res = await rawReq(`/api/scan?w=${W}&h=${W}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: frame,
    });
    if (!res.ok) throw new Error(`900×900 大帧（810KB）被接口拒绝：HTTP ${res.status}`);
    const body = await res.json();
    if (body.data?.text !== dev.asset_no) {
      throw new Error('大画面里那块 180px 的码没解出来（这正是对着显示器拍的实际情况）');
    }
  }

  // 不是二维码的图：必须老老实实回 ok:false，不能 500，更不能瞎猜
  const junk = Buffer.alloc(200 * 200);
  for (let i = 0; i < junk.length; i++) junk[i] = (i * 37) % 256;
  const bad = await rawReq('/api/scan?w=200&h=200', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: junk,
  });
  if (bad.status !== 200) throw new Error('噪声图不该报 ' + bad.status + '（那会把「没扫到」显示成「服务器错误」）');
  if ((await bad.json()).data?.ok) throw new Error('噪声图居然解出了内容');

  // 缺 w/h 或数据不够：明确 400
  const noSize = await rawReq('/api/scan', { method: 'POST', body: junk });
  if (noSize.status !== 400) throw new Error('缺 w/h 应返回 400，实得 ' + noSize.status);
  const shortBody = await rawReq('/api/scan?w=200&h=200', { method: 'POST', body: Buffer.alloc(10) });
  if (shortBody.status !== 400) throw new Error('灰度数据不足应返回 400，实得 ' + shortBody.status);
});

await check('导入批次列表', async () => {
  const { body } = await req('/api/excel/batches');
  if (!Array.isArray(body.items)) throw new Error('非数组');
});

await check('导入模板：主表无示例数据 + 示例页带忽略标记', async () => {
  const tpl = await rawReq('/api/excel/template');
  const buf = Buffer.from(await tpl.arrayBuffer());
  const { parseXlsx } = await import('../server/lib/xlsx.js');

  const main = parseXlsx(buf);
  if (main.sheetName !== '设备台账') throw new Error('第一个工作表应为「设备台账」，实际 ' + main.sheetName);
  if (main.data.length !== 0) throw new Error(`主表不应含示例数据，实际 ${main.data.length} 行`);
  if (!main.headers.includes('供应商')) throw new Error('模板缺少「供应商」列');
  if (!main.sheets.includes('填写示例')) throw new Error('缺少「填写示例」工作表');

  const sample = parseXlsx(buf, { sheet: '填写示例' });
  if (sample.data.length < 1) throw new Error('「填写示例」页应有示例行');
  const marked = sample.data.every((r) => String(r['备注'] || '').includes('示例行'));
  if (!marked) throw new Error('示例行备注应带「示例行」标记（导入时会被自动忽略）');
});

await check('multipart Excel 导入（预览 + 试运行）', async () => {
  const { buildXlsx } = await import('../server/lib/xlsx.js');
  const { body: opts } = await req('/api/options');
  const catName = opts.categories[0].name;
  const sn = 'IMP' + Date.now();
  const buf = await buildXlsx({
    sheets: [{
      name: '设备台账',
      columns: [
        { header: '设备分类', key: 'a' }, { header: '品牌', key: 'b' },
        { header: 'SN 序列号', key: 'c' }, { header: '供应商', key: 'd' },
        { header: '备注', key: 'e' },
      ],
      rows: [
        { a: catName, b: 'SmokeImport', c: sn, d: (opts.suppliers || [])[0] || '', e: '正常数据' },
        { a: catName, b: 'SmokeSample', c: sn + 'S', d: '', e: '示例行（导入时自动忽略）' },
      ],
    }],
  });
  const blob = () => new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  const fd = new FormData();
  fd.append('file', blob(), '导入.xlsx');
  fd.append('create_missing', '1');
  const prev = await req('/api/excel/preview', { method: 'POST', body: fd });
  if (prev.body.total !== 2) throw new Error('应解析出 2 行，实际 ' + prev.body.total);
  if (!prev.body.matched?.length) throw new Error('表头未匹配');

  const fd2 = new FormData();
  fd2.append('file', blob(), '导入.xlsx');
  fd2.append('create_missing', '1');
  fd2.append('dry_run', '1');
  const imp = await req('/api/excel/import', { method: 'POST', body: fd2 });
  if (imp.body.created !== 1) throw new Error(`试运行应新增 1 行（示例行被忽略），实际 ${imp.body.created}`);
  if (imp.body.skipped !== 1) throw new Error(`示例行应被跳过 1 行，实际 ${imp.body.skipped}`);
});

await check('回收站：列表 / 恢复 / 彻底删除', async () => {
  // 建一台专用设备 -> 软删除 -> 出现在回收站 -> 恢复 -> 再删 -> 彻底删除
  const { body: opts } = await req('/api/options');
  const cat = opts.categories[0];
  const sn = 'TRASHTEST' + Date.now();
  const { body: dev } = await req('/api/devices', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category_id: cat.id, brand: 'TRASH', sn }),
  });

  await req('/api/devices/' + dev.id, { method: 'DELETE' });
  const { body: list } = await req('/api/devices/trash?page_size=200');
  if (!list.items.some((d) => d.id === dev.id)) throw new Error('删除后未出现在回收站');

  const { body: r1 } = await req('/api/devices/trash/restore', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: [dev.id] }),
  });
  if (r1.ok !== 1) throw new Error('恢复失败：' + JSON.stringify(r1.errors));

  await req('/api/devices/' + dev.id, { method: 'DELETE' });
  const { body: r2 } = await req('/api/devices/' + dev.id + '/permanent', { method: 'DELETE' });
  if (r2.purged !== 1) throw new Error('彻底删除失败');

  const { body: after } = await req('/api/devices/trash?page_size=200');
  if (after.items.some((d) => d.id === dev.id)) throw new Error('彻底删除后仍出现在回收站');
});

await check('Excel 按分类分表导出', async () => {
  const res = await rawReq('/api/excel/export?split=1');
  if (!res.ok) throw new Error('导出失败 HTTP ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  const { parseXlsx } = await import('../server/lib/xlsx.js');
  const p = parseXlsx(buf);
  if (!p.sheets.includes('汇总')) throw new Error('缺少「汇总」页，实际：' + p.sheets.join(' / '));

  const opts = await req('/api/options');
  const catNames = opts.body.categories.map((c) => c.name);
  const perCat = p.sheets.filter((s) => catNames.includes(s));
  if (!perCat.length) throw new Error('没有按分类拆出工作表，实际：' + p.sheets.join(' / '));

  // 汇总页的数量应与该分类工作表行数一致
  const sum = parseXlsx(buf, { sheet: '汇总' });
  if (!sum.data.length) throw new Error('汇总页没有数据');
  const first = sum.data[0];
  if (first['设备数量'] !== undefined) {
    const detail = parseXlsx(buf, { sheet: first['对应工作表'] });
    if (detail.data.length !== first['设备数量']) {
      throw new Error(`汇总说 ${first['设备数量']} 台，明细表实际 ${detail.data.length} 行`);
    }
  }

  // 工作表必须按该分类自己的字段配置出列：显示器页不该出现 CPU/内存/硬盘…
  const HARD = {
    CPU: 'cpu', 内存: 'memory', 硬盘: 'disk', 操作系统: 'os_name',
    屏幕尺寸: 'screen_size', 'IP 地址': 'ip_address', 'MAC 地址': 'mac_address',
  };
  let checked = 0;
  for (const cat of opts.body.categories) {
    if (!p.sheets.includes(cat.name)) continue;
    const detail = parseXlsx(buf, { sheet: cat.name });
    const own = new Set((cat.tracking_fields || []).map((f) => f.key));
    for (const [header, key] of Object.entries(HARD)) {
      if (own.has(key)) continue;
      if (detail.headers.includes(header)) {
        throw new Error(`「${cat.name}」工作表不该有「${header}」列（该分类未配置 ${key}）：${detail.headers.join(' | ')}`);
      }
    }
    const dup = detail.headers.filter((h, i) => detail.headers.indexOf(h) !== i);
    if (dup.length) throw new Error(`「${cat.name}」工作表有重复列：${[...new Set(dup)].join('、')}`);
    checked++;
  }
  if (!checked) throw new Error('没有可校验的分类工作表');
});

await check('导出所选：只导出勾选的设备，不让它退化成全部', async () => {
  const { parseXlsx } = await import('../server/lib/xlsx.js');
  const list = await req('/api/devices?page_size=200');
  const picked = list.body.items.slice(0, 3);
  if (picked.length < 2) return;   // 设备太少就不测

  const ids = picked.map((d) => d.id).join(',');
  const res = await rawReq('/api/excel/export?ids=' + encodeURIComponent(ids));
  const buf = Buffer.from(await res.arrayBuffer());
  const rows = parseXlsx(buf, { sheet: '设备台账' }).data;
  const got = rows.map((r) => r['资产编号']).sort().join(',');
  const want = picked.map((d) => d.asset_no).sort().join(',');
  if (got !== want) throw new Error(`导出的不是所选设备：期望 ${want}，实际 ${got}`);

  // 所选 + 分类分表：每张明细表加起来还是那几台
  const res2 = await rawReq('/api/excel/export?split=1&ids=' + encodeURIComponent(ids));
  const buf2 = Buffer.from(await res2.arrayBuffer());
  let n = 0;
  for (const s of parseXlsx(buf2).sheets) {
    if (['汇总', '字段说明', '设备分类', '组织架构'].includes(s)) continue;
    n += parseXlsx(buf2, { sheet: s }).data.length;
  }
  if (n !== picked.length) throw new Error(`所选分表导出应共 ${picked.length} 行，实际 ${n} 行`);

  // 无效 id 不能退化成「导出全部」——那是最危险的静默错误
  const res3 = await rawReq('/api/excel/export?ids=no-such-device-1,no-such-device-2');
  const rows3 = parseXlsx(Buffer.from(await res3.arrayBuffer()), { sheet: '设备台账' }).data;
  if (rows3.length) throw new Error(`无效 id 应导出 0 行，实际导出了 ${rows3.length} 行`);
});

await check('Excel 实时数据链接（token 鉴权 + CSV 带 BOM）', async () => {  const live = await req('/api/excel/live-links');
  if (!live.body.token) throw new Error('未返回 token');
  if (!live.body.all?.csv) throw new Error('未返回「全部设备」CSV 链接');
  if (!Array.isArray(live.body.sheets)) throw new Error('未返回分类链接列表');

  const res = await fetch(live.body.all.csv);
  if (!res.ok) throw new Error('CSV 拉取失败 HTTP ' + res.status);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!(bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF)) {
    throw new Error('CSV 缺少 UTF-8 BOM（Excel 会中文乱码）');
  }
  if (!bytes.includes(Buffer.from('\r\n'))) throw new Error('CSV 应使用 CRLF 换行');
  const csv = bytes.toString('utf8').replace(/^\uFEFF/, '');
  if (!csv.startsWith('资产编号,设备分类,')) throw new Error('CSV 表头不对：' + csv.slice(0, 50));

  const rowCount = Number(res.headers.get('x-row-count') || -1);
  const bodyRows = csv.trim().split('\r\n').length - 1;
  if (rowCount !== bodyRows) throw new Error(`X-Row-Count(${rowCount}) 与实际行数(${bodyRows}) 不一致`);
});

await check('实时链接：无 token / 错 token 一律拒绝', async () => {
  for (const p of ['/api/live/devices.csv', '/api/live/devices.csv?token=wrong-token-1234', '/api/live/manifest.json']) {
    const res = await fetch(BASE + p);
    if (res.status !== 401) throw new Error(`${p} 应返回 401，实际 ${res.status}`);
  }
});

await check('实时链接可用 manifest 发现所有分类', async () => {
  const live = await req('/api/excel/live-links');
  const man = await fetch(live.body.manifest);
  if (!man.ok) throw new Error('manifest 拉取失败 HTTP ' + man.status);
  const m = (await man.json()).data;
  if (typeof m.total !== 'number') throw new Error('manifest 缺少 total');
  if (!m.sheets.length) throw new Error('manifest 没有分类条目');
  for (const s of m.sheets) {
    if (!s.csv || !s.name) throw new Error('manifest 条目缺少 name/csv');
    const r = await fetch(s.csv);
    if (!r.ok) throw new Error(`分类「${s.name}」的 CSV 拉取失败 HTTP ${r.status}`);
  }
});

await check('实时链接：网页表格格式（WPS 专用）', async () => {
  const live = await req('/api/excel/live-links');
  if (!live.body.bases?.length) throw new Error('未返回可选的取数地址列表');

  const withHtml = live.body.bases.filter((b) => b.all?.html);
  if (!withHtml.length) throw new Error('没有任何地址提供网页表格链接');

  const base = withHtml[0];
  const res = await fetch(base.all.html);
  if (!res.ok) throw new Error('HTML 拉取失败 HTTP ' + res.status);
  if (!String(res.headers.get('content-type')).includes('text/html')) {
    throw new Error('Content-Type 应为 text/html，实际 ' + res.headers.get('content-type'));
  }
  const html = await res.text();
  for (const tag of ['<table', '<thead>', '<tbody>', '<th>', '<td>']) {
    if (!html.includes(tag)) throw new Error(`HTML 缺少 ${tag}（WPS 的「自网站」认不出来）`);
  }
  const bodyHtml = (html.match(/<tbody>[\s\S]*?<\/tbody>/) || [''])[0];
  const rows = (bodyHtml.match(/<tr>/g) || []).length;
  if (rows !== Number(res.headers.get('x-row-count'))) {
    throw new Error(`HTML 行数(${rows}) 与 X-Row-Count(${res.headers.get('x-row-count')}) 不一致`);
  }
  if (!html.includes('资产编号')) throw new Error('HTML 表格缺少表头「资产编号」');
});

await check('实时链接：多个取数地址（本机 / 局域网）', async () => {
  const live = await req('/api/excel/live-links');
  const labels = live.body.bases.map((b) => b.label);
  if (!labels.some((l) => l.includes('本机'))) throw new Error('应提供「本机」地址，实际：' + labels.join(' / '));
  for (const b of live.body.bases) {
    if (!b.base || !b.all?.csv || !b.all?.html) throw new Error(`地址「${b.label}」缺少链接`);
    if (!Array.isArray(b.sheets)) throw new Error(`地址「${b.label}」缺少分类列表`);
  }
  // 局域网地址（若有）必须也能取到数据
  const lan = live.body.bases.find((b) => b.label.includes('局域网'));
  if (lan) {
    const res = await fetch(lan.all.csv);
    if (!res.ok) throw new Error('局域网地址取数失败 HTTP ' + res.status);
  }
});

await check('实时链接：一个页面含多个分类表格（多工作表用）', async () => {
  const live = await req('/api/excel/live-links');
  const base = live.body.bases[0];
  if (!base.workbook?.html) throw new Error('未返回多表页面链接');
  if (!(base.workbook.tables >= 1)) throw new Error('多表页面应至少包含 1 张表格');

  const res = await fetch(base.workbook.html);
  if (!res.ok) throw new Error('多表页面拉取失败 HTTP ' + res.status);
  if (!String(res.headers.get('content-type')).includes('text/html')) throw new Error('Content-Type 应为 text/html');
  const html = await res.text();

  const tables = [...html.matchAll(/<table id="([^"]+)"[^>]*summary="([^"]*)"/g)];
  if (tables.length !== Number(res.headers.get('x-table-count'))) {
    throw new Error(`表格数(${tables.length}) 与 X-Table-Count(${res.headers.get('x-table-count')}) 不一致`);
  }
  if (tables.length !== base.workbook.tables) {
    throw new Error(`表格数(${tables.length}) 与接口声明(${base.workbook.tables}) 不一致`);
  }
  // 每张表都要有独立的 id 和标题，且行数正确
  const ids = new Set(tables.map((t) => t[1]));
  if (ids.size !== tables.length) throw new Error('表格 id 有重复，导入时会混淆');
  for (const s of base.sheets) {
    const t = tables.find((x) => x[2] === s.name);
    if (!t) throw new Error(`多表页面里缺少分类「${s.name}」的表格`);
    const seg = html.split(`<table id="${t[1]}"`)[1] || '';
    const bodySeg = (seg.split('<tbody>')[1] || '').split('</tbody>')[0];
    const rows = (bodySeg.match(/<tr>/g) || []).length;
    if (rows !== s.count) throw new Error(`分类「${s.name}」表格行数 ${rows} 与清单 ${s.count} 不符`);
  }
});

await check('实时链接：纯文本清单（脚本/宏读取）', async () => {
  const live = await req('/api/excel/live-links');
  const res = await fetch(live.body.bases[0].manifest_text);
  if (!res.ok) throw new Error('清单拉取失败 HTTP ' + res.status);
  const text = await res.text();
  const lines = text.trim().split('\n');
  if (lines.length < 2) throw new Error('清单内容过少');
  for (const l of lines) {
    const parts = l.split('|');
    if (parts.length !== 3) throw new Error('清单格式应为「表名|条数|链接」，实际：' + l);
    if (!/^https?:\/\//.test(parts[2])) throw new Error('清单第三列应为 URL：' + parts[2]);
  }
});

/* ---------- 清理本次创建的测试数据 ---------- */
if (fixtureIds.length) {
  for (const id of fixtureIds) {
    try {
      await req('/api/devices/' + id, { method: 'DELETE' });
      await req('/api/devices/' + id + '/permanent', { method: 'DELETE' });
    } catch { /* ignore */ }
  }
  console.log(`  （已清理 ${fixtureIds.length} 条自动创建的测试数据）`);
}

console.log(`\n=== 冒烟结果：${pass} 通过 / ${fail} 失败 ===\n`);
if (fail) {
  for (const f of failures) console.log(`\n[${f.name}] ${f.message}`);
  process.exit(1);
}
