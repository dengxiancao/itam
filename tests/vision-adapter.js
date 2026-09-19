/**
 * 视觉大模型适配器测试（重点验证 GLM-4.6V-Flash 接法）
 * 通过桩化 fetch，检查：
 *   - 密钥能从 ocr_vision 键正确读取（此前的 bug）
 *   - base_url 兼容 …/v4 与 …/v4/chat/completions 两种写法，不会拼成重复路径
 *   - 智谱使用裸 base64，并附加 thinking:disabled
 *   - auto 模式下先 data_url、失败后自动退回裸 base64
 *   - 错误码能翻译成人话
 *
 * 运行：node tests/vision-adapter.js
 * （会临时改写 ocr 设置，结束后自动还原）
 */
import assert from 'node:assert';
import { migrate, getSetting, setSetting, run } from '../server/db.js';
import { recognize, getOcrConfig, ocrStatus } from '../server/lib/ocr.js';

migrate();

let pass = 0;
const failures = [];
async function t(name, fn) {
  try {
    await fn();
    pass++;
    console.log(`  \x1b[32m✔\x1b[0m ${name}`);
  } catch (e) {
    failures.push({ name, message: e.message, stack: e.stack });
    console.log(`  \x1b[31m✘\x1b[0m ${name}\n      ${e.message}`);
  }
}

/* ---------- 备份原设置，结束后还原 ---------- */
const origOcr = getSetting('ocr', null);
const origVision = getSetting('ocr_vision', null);
const origBaidu = getSetting('ocr_baidu', null);
function restore() {
  const setOrDelete = (k, v) => {
    if (v === null || v === undefined) run('DELETE FROM app_setting WHERE key=?', k);
    else setSetting(k, v);
  };
  setOrDelete('ocr', origOcr);
  setOrDelete('ocr_vision', origVision);
  setOrDelete('ocr_baidu', origBaidu);
}

/* ---------- fetch 桩 ---------- */
const realFetch = globalThis.fetch;
let calls = [];
let respond = () => okResponse({ brand: '戴尔', model: 'U2723QE', sn: 'CN0M2K7P1234', lines: ['DELL', 'Model: U2723QE', 'S/N: CN0M2K7P1234'] });

function okResponse(obj) {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(obj) } }] }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}
function errResponse(status, message) {
  return new Response(JSON.stringify({ error: { message } }), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

globalThis.fetch = async (url, opts = {}) => {
  const rec = { url: String(url), headers: opts.headers || {}, body: null };
  try { rec.body = opts.body ? JSON.parse(opts.body) : null; } catch { /* ignore */ }
  calls.push(rec);
  return respond(calls.length);
};

const IMG = Buffer.from('fake-image-bytes');

console.log('\n=== 视觉大模型适配器测试 ===\n');

await t('密钥从 ocr_vision 键读取（修复前读不到）', () => {
  setSetting('ocr', { provider: 'vision', confidence_threshold: 0.55, auto_fill: true });
  setSetting('ocr_vision', { api_key: 'test-key-123', base_url: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4.6v-flash', image_format: 'base64' });
  const cfg = getOcrConfig();
  assert.strictEqual(cfg.provider, 'vision');
  assert.strictEqual(cfg.api_key, 'test-key-123', 'api_key 应能从 ocr_vision 读到');
  assert.strictEqual(cfg.model, 'glm-4.6v-flash');
  assert.strictEqual(ocrStatus().configured.vision, true, 'vision 应显示为已配置');
});

await t('调用智谱 GLM-4.6V-Flash：URL / 鉴权 / 模型 / 裸 base64 / thinking 关闭', async () => {
  calls = [];
  respond = () => okResponse({ brand: '戴尔', model: 'U2723QE', sn: 'CN0M2K7P1234', lines: ['DELL', 'Model: U2723QE', 'S/N: CN0M2K7P1234'] });
  const r = await recognize({ buffer: IMG, mime: 'image/jpeg' });

  assert.strictEqual(calls.length, 1, '应只调用一次');
  assert.strictEqual(calls[0].url, 'https://open.bigmodel.cn/api/paas/v4/chat/completions', 'URL 应为智谱端点');
  assert.strictEqual(calls[0].headers.Authorization, 'Bearer test-key-123', '应带 Bearer 鉴权');
  assert.strictEqual(calls[0].body.model, 'glm-4.6v-flash', '模型名应为 glm-4.6v-flash');

  const imgPart = calls[0].body.messages[0].content.find((c) => c.type === 'image_url');
  assert.ok(imgPart, '应包含 image_url 内容块');
  assert.ok(!imgPart.image_url.url.startsWith('data:'), '智谱应为裸 base64（不带 data: 前缀）');
  assert.strictEqual(imgPart.image_url.url, IMG.toString('base64'), 'base64 内容应一致');
  assert.deepStrictEqual(calls[0].body.thinking, { type: 'disabled' }, '智谱应关闭 thinking 以加速 OCR');

  assert.strictEqual(r.provider, 'vision');
  assert.ok(r.lines.some((l) => l.text.includes('CN0M2K7P1234')), '应解析出 SN 行');
  assert.strictEqual(r.structured.sn, 'CN0M2K7P1234');
});

await t('base_url 粘贴完整 /chat/completions 也不会重复拼接', async () => {
  setSetting('ocr_vision', { api_key: 'test-key-123', base_url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-4.6v-flash', image_format: 'base64' });
  calls = [];
  await recognize({ buffer: IMG, mime: 'image/jpeg' });
  assert.strictEqual(calls[0].url, 'https://open.bigmodel.cn/api/paas/v4/chat/completions', '不应出现 chat/completions/chat/completions');
  // 还原为规范写法
  setSetting('ocr_vision', { api_key: 'test-key-123', base_url: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4.6v-flash', image_format: 'base64' });
});

await t('auto 模式：先 data_url，失败后自动退回裸 base64', async () => {
  setSetting('ocr_vision', { api_key: 'test-key-123', base_url: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4.6v-flash', image_format: 'auto' });
  calls = [];
  respond = (n) => (n === 1
    ? errResponse(400, 'invalid image url format')
    : okResponse({ brand: '联想', model: 'ThinkPad X1', sn: 'PF2LK9Y7', lines: ['Lenovo', 'S/N PF2LK9Y7'] }));

  const r = await recognize({ buffer: IMG, mime: 'image/jpeg' });
  assert.strictEqual(calls.length, 2, '应重试一次');
  assert.ok(calls[0].body.messages[0].content.find((c) => c.type === 'image_url').image_url.url.startsWith('data:'), '第一次用 data URL');
  assert.ok(!calls[1].body.messages[0].content.find((c) => c.type === 'image_url').image_url.url.startsWith('data:'), '第二次退回裸 base64');
  assert.strictEqual(r.structured.sn, 'PF2LK9Y7', '重试后应成功解析');
});

await t('非智谱厂商不发送 thinking 参数', async () => {
  setSetting('ocr', { provider: 'vision', confidence_threshold: 0.55, auto_fill: true });
  setSetting('ocr_vision', { api_key: 'sk-abc', base_url: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen2.5-VL-7B-Instruct', image_format: 'auto' });
  calls = [];
  respond = () => okResponse({ brand: 'Dell', model: 'U2723QE', sn: 'ABC123456', lines: ['DELL'] });
  await recognize({ buffer: IMG, mime: 'image/jpeg' });
  assert.strictEqual(calls[0].url, 'https://api.siliconflow.cn/v1/chat/completions');
  assert.ok(!('thinking' in calls[0].body), '硅基流动不应收到 thinking 参数');
  assert.ok(calls[0].body.messages[0].content.find((c) => c.type === 'image_url').image_url.url.startsWith('data:'), '默认用 OpenAI 标准 data URL');
});

await t('错误码翻译成人话（401 / 404 / 429）', async () => {
  for (const [status, expect] of [[401, 'API Key'], [404, 'Base URL'], [429, '限流']]) {
    calls = [];
    respond = () => errResponse(status, 'boom');
    let msg = '';
    try { await recognize({ buffer: IMG, mime: 'image/jpeg' }); } catch (e) { msg = e.message; }
    assert.ok(msg.includes(expect), `状态 ${status} 的提示应包含「${expect}」，实际：${msg}`);
  }
});

await t('缺少 API Key 时给出明确提示', async () => {
  setSetting('ocr_vision', { base_url: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4.6v-flash' });
  let msg = '';
  try { await recognize({ buffer: IMG, mime: 'image/jpeg' }); } catch (e) { msg = e.message; }
  assert.ok(msg.includes('API Key'), '应提示需要配置 API Key，实际：' + msg);
});

await t('mock 模式仍然可用（回归）', async () => {
  setSetting('ocr', { provider: 'mock', confidence_threshold: 0.55, auto_fill: true });
  calls = [];
  const r = await recognize({ buffer: IMG, mime: 'image/jpeg' });
  assert.strictEqual(r.provider, 'mock');
  assert.strictEqual(calls.length, 0, 'mock 不应发起网络请求');
  assert.ok(r.lines.length > 0);
});

/* ---------- 还原 ---------- */
restore();
globalThis.fetch = realFetch;

console.log(`\n=== 结果：${pass} 通过 / ${failures.length} 失败 ===\n`);
if (failures.length) {
  for (const f of failures) console.log(`\n[${f.name}]\n${f.stack || f.message}`);
  process.exit(1);
}
process.exit(0);
