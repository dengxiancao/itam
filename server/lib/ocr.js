/**
 * OCR 服务层 —— 多厂商适配器
 *
 * 支持的后端（在「系统设置 -> 识别服务」里配置）：
 *   mock      本地模拟，无需密钥，用于演示与联调
 *   baidu     百度智能云「通用文字识别（高精度版）」
 *   tencent   腾讯云「通用印刷体识别」
 *   aliyun    阿里云「通用文字识别」（Market / OCR 云市场）
 *   vision    OpenAI 兼容的视觉大模型（GPT-4o / Qwen-VL / GLM-4V / DeepSeek-VL 等）
 *   custom    任意 HTTP OCR 接口（自己填 URL / Header / 字段路径）
 *
 * 所有适配器统一返回：
 *   { ok:true, lines:[{text, score, box?}], text:string, provider, elapsed }
 */
import crypto from 'node:crypto';
import { getSetting } from '../db.js';
import { HttpError, normalizeText } from '../util.js';

const TIMEOUT = 30000;

/* ------------------------------------------------------------------ *
 * 配置读取（环境变量优先，其次系统设置）
 * ------------------------------------------------------------------ */

function envOr(settingKey, envKey) {
  const v = process.env[envKey];
  if (v !== undefined && v !== '') return v;
  return settingKey;
}

/**
 * 支持的 OCR 厂商
 * 注意：apiKey / secretKey 等既能通过系统设置页填写，也能通过环境变量注入
 */
const FIELD_ENV = {
  baidu: { api_key: 'BAIDU_OCR_API_KEY', secret_key: 'BAIDU_OCR_SECRET_KEY' },
  tencent: { secret_id: 'TENCENT_SECRET_ID', secret_key: 'TENCENT_SECRET_KEY' },
  aliyun: { app_code: 'ALIYUN_OCR_APP_CODE', app_key: 'ALIYUN_APP_KEY', app_secret: 'ALIYUN_APP_SECRET' },
  vision: { api_key: 'VISION_API_KEY', base_url: 'VISION_BASE_URL', model: 'VISION_MODEL' },
  custom: { url: 'CUSTOM_OCR_URL', api_key: 'CUSTOM_OCR_KEY' },
};

export function getOcrConfig() {
  const stored = getSetting('ocr', {}) || {};
  const provider = (process.env.OCR_PROVIDER || stored.provider || 'mock').toLowerCase();
  // 各服务商的密钥单独存在 ocr_<provider> 键下（如 ocr_vision / ocr_baidu），必须合并进来
  const providerCreds = getSetting(`ocr_${provider}`, {}) || {};
  const out = { ...stored, ...providerCreds, provider };
  const envs = FIELD_ENV[provider] || {};
  for (const [field, envName] of Object.entries(envs)) {
    const v = process.env[envName];
    if (v !== undefined && v !== '') out[field] = v;
  }
  // 归一化 key（前端可能传 'api-key' / 'apiKey' / 'api key'）；服务商专属配置优先
  out.__norm = { ...normalizeKeys(stored), ...normalizeKeys(providerCreds) };
  return out;
}

function normalizeKeys(obj) {
  const n = {};
  for (const [k, v] of Object.entries(obj || {})) {
    n[k.toLowerCase().replace(/[^a-z0-9]/g, '')] = v;
  }
  return n;
}

function pick(cfg, ...names) {
  for (const name of names) {
    const norm = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cfg[name]) return cfg[name];
    if (cfg.__norm?.[norm]) return cfg.__norm[norm];
  }
  return '';
}

/* ------------------------------------------------------------------ *
 * 工具
 * ------------------------------------------------------------------ */

async function httpJson(url, { method = 'POST', headers = {}, body, timeout = TIMEOUT } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method,
      headers,
      body,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* 非 JSON */ }
    return { status: res.status, ok: res.ok, json, text, elapsed: Date.now() - started };
  } catch (e) {
    if (e.name === 'AbortError') throw new HttpError(504, `识别服务超时（${timeout / 1000}s），请重试或改用更快的识别服务`);
    throw new HttpError(502, `无法连接识别服务：${e.message}`);
  } finally {
    clearTimeout(timer);
  }
}

function result(lines, provider, elapsed, extra = {}) {
  const clean = (lines || [])
    .map((l) => ({ text: String(l.text ?? '').trim(), score: Number(l.score) || 0, box: l.box || null }))
    .filter((l) => l.text);
  const text = clean.map((l) => l.text).join('\n');
  return { ok: true, provider, lines: clean, text, elapsed, ...extra };
}

/* ------------------------------------------------------------------ *
 * 1. mock —— 本地模拟，方便没有密钥时演示
 * ------------------------------------------------------------------ */

function mockRecognize() {
  const samples = [
    ['DELL', 'Model: U2723QE', 'S/N: CN0M2K7P1234', '显示器', 'Made in China', 'AC 100-240V 50/60Hz'],
    ['Lenovo', 'ThinkPad X1 Carbon Gen 11', 'Type 21HM', 'S/N PF2LK9Y7', 'Input 20V 3.25A'],
    ['HP', 'LaserJet Pro M404dn', 'SERIAL NO: VNC3K12345', 'Made in China'],
    ['HUAWEI', 'Model: S5700-28C-EI', 'ESN: 2102351ABC', '交换机'],
  ];
  const pickSample = samples[Math.floor(Math.random() * samples.length)];
  return result(
    pickSample.map((text) => ({ text, score: 0.9 + Math.random() * 0.09 })),
    'mock',
    3,
    { mocked: true, note: '这是本地模拟结果，请在「系统设置」中配置真实 OCR 服务' },
  );
}

/* ------------------------------------------------------------------ *
 * 2. 百度智能云
 * ------------------------------------------------------------------ */

const baiduTokens = new Map(); // key -> { token, expireAt }

async function baiduToken(apiKey, secretKey) {
  const cacheKey = `${apiKey}:${secretKey}`;
  const cached = baiduTokens.get(cacheKey);
  if (cached && cached.expireAt > Date.now() + 60000) return cached.token;

  const url = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${encodeURIComponent(apiKey)}&client_secret=${encodeURIComponent(secretKey)}`;
  const r = await httpJson(url, { method: 'POST', timeout: 15000 });
  if (!r.json?.access_token) {
    throw new HttpError(502, `百度 OCR 获取 access_token 失败：${r.json?.error_description || r.text.slice(0, 200)}`);
  }
  baiduTokens.set(cacheKey, { token: r.json.access_token, expireAt: Date.now() + (r.json.expires_in || 2592000) * 1000 });
  return r.json.access_token;
}

async function baiduRecognize(cfg, buf) {
  const apiKey = pick(cfg, 'api_key', 'apiKey', 'client_id', 'ak');
  const secretKey = pick(cfg, 'secret_key', 'secretKey', 'client_secret', 'sk');
  if (!apiKey || !secretKey) throw new HttpError(400, '百度 OCR 需要配置 API Key 与 Secret Key');
  const token = await baiduToken(apiKey, secretKey);

  const url = `https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic?access_token=${token}`;
  const body = new URLSearchParams({ image: buf.toString('base64'), detect_direction: 'true', probability: 'true' });
  const r = await httpJson(url, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (r.json?.error_code) {
    throw new HttpError(502, `百度 OCR 识别失败 [${r.json.error_code}] ${r.json.error_msg || ''}`);
  }
  const lines = (r.json?.words_result || []).map((w) => ({
    text: w.words,
    score: w.probability?.average ?? 0.9,
    box: w.location
      ? { x: w.location.left, y: w.location.top, w: w.location.width, h: w.location.height }
      : null,
  }));
  return result(lines, 'baidu', r.elapsed);
}

/* ------------------------------------------------------------------ *
 * 3. 腾讯云 OCR（TC3-HMAC-SHA256）
 * ------------------------------------------------------------------ */

function sha256hex(s) { return crypto.createHash('sha256').update(s).digest('hex'); }
function hmac(key, s) { return crypto.createHmac('sha256', key).update(s).digest(); }

async function tencentRecognize(cfg, buf) {
  const secretId = pick(cfg, 'secret_id', 'secretId', 'SecretId', 'api_key');
  const secretKey = pick(cfg, 'secret_key', 'secretKey', 'SecretKey');
  const region = pick(cfg, 'region') || 'ap-guangzhou';
  if (!secretId || !secretKey) throw new HttpError(400, '腾讯云 OCR 需要配置 SecretId 与 SecretKey');

  const host = 'ocr.tencentcloudapi.com';
  const service = 'ocr';
  const action = 'GeneralBasicOCR';
  const version = '2018-11-19';
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);

  const payload = JSON.stringify({ ImageBase64: buf.toString('base64') });
  const canonicalRequest = [
    'POST', '/', '',
    `content-type:application/json; charset=utf-8\nhost:${host}\n`,
    'content-type;host',
    sha256hex(payload),
  ].join('\n');

  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = [
    'TC3-HMAC-SHA256', timestamp, credentialScope, sha256hex(canonicalRequest),
  ].join('\n');

  const kDate = hmac(`TC3${secretKey}`, date);
  const kService = hmac(kDate, service);
  const kSigning = hmac(kService, 'tc3_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  const authorization = `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=content-type;host, Signature=${signature}`;

  const r = await httpJson(`https://${host}/`, {
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json; charset=utf-8',
      Host: host,
      'X-TC-Action': action,
      'X-TC-Timestamp': String(timestamp),
      'X-TC-Version': version,
      'X-TC-Region': region,
    },
    body: payload,
  });

  const resp = r.json?.Response;
  if (!resp || resp.Error) {
    throw new HttpError(502, `腾讯云 OCR 失败：${resp?.Error?.Message || r.text.slice(0, 200)}`);
  }
  const lines = (resp.TextDetections || []).map((d) => ({
    text: d.DetectedText,
    score: d.Confidence ? d.Confidence / 100 : 0.9,
    box: d.Polygon?.[0] ? { x: d.Polygon[0].X, y: d.Polygon[0].Y } : null,
  }));
  return result(lines, 'tencent', r.elapsed);
}

/* ------------------------------------------------------------------ *
 * 4. 阿里云 OCR（云市场 AppCode 或 AK/SK 网关）
 * ------------------------------------------------------------------ */

async function aliyunRecognize(cfg, buf) {
  const appCode = pick(cfg, 'app_code', 'appCode');
  const url = pick(cfg, 'url') || process.env.ALIYUN_OCR_URL || '';
  if (!appCode) throw new HttpError(400, '阿里云 OCR 需要配置 AppCode（云市场）');
  if (!url) throw new HttpError(400, '阿里云 OCR 需要配置接口 URL（在云市场商品页复制调用地址）');

  const r = await httpJson(url, {
    headers: {
      Authorization: `APPCODE ${appCode}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({ image: buf.toString('base64'), configure: { output_prob: true } }),
  });
  if (!r.ok) throw new HttpError(502, `阿里云 OCR 失败 [${r.status}] ${r.text.slice(0, 200)}`);

  const lines = [];
  const collect = (obj) => {
    if (!obj) return;
    if (Array.isArray(obj)) { obj.forEach(collect); return; }
    if (typeof obj === 'object') {
      if (typeof obj.text === 'string' || typeof obj.words === 'string') {
        lines.push({ text: obj.text || obj.words, score: Number(obj.probability ?? obj.score) || 0.9 });
        return;
      }
      for (const v of Object.values(obj)) collect(v);
    }
  };
  collect(r.json);
  return result(lines, 'aliyun', r.elapsed);
}

/* ------------------------------------------------------------------ *
 * 5. OpenAI 兼容视觉大模型（含智谱 GLM-4.6V-Flash 等国产免费模型）
 * ------------------------------------------------------------------ */

/** 判断服务商风味（用于附加厂商专有参数） */
function visionFlavor(baseUrl) {
  const u = String(baseUrl).toLowerCase();
  if (u.includes('bigmodel.cn') || u.includes('z.ai')) return 'zhipu';
  return 'openai';
}

/**
 * 组装 image_url.url。
 *  - data_url：OpenAI 标准写法 data:image/jpeg;base64,xxxx（大多数厂商支持）
 *  - base64：裸 base64（智谱 GLM-4V / 4.6V 系列官方示例用的是这种）
 */
function imageUrlFor(buf, mime, format) {
  const b64 = buf.toString('base64');
  return format === 'base64' ? b64 : `data:${mime || 'image/jpeg'};base64,${b64}`;
}

async function visionRecognize(cfg, buf, mime) {
  const apiKey = pick(cfg, 'api_key', 'apiKey');
  if (!apiKey) throw new HttpError(400, '视觉大模型识别需要配置 API Key');

  // base_url 同时兼容两种写法：
  //   https://open.bigmodel.cn/api/paas/v4
  //   https://open.bigmodel.cn/api/paas/v4/chat/completions  （自动去掉后缀，避免重复拼接）
  let baseUrl = String(pick(cfg, 'base_url', 'baseUrl') || 'https://api.openai.com/v1').trim();
  baseUrl = baseUrl.replace(/\/+$/, '').replace(/\/chat\/completions$/i, '');

  const model = pick(cfg, 'model') || 'glm-4.6v-flash';
  const flavor = visionFlavor(baseUrl);

  // 图片格式：auto 时先按 OpenAI 标准 data URL 发，失败再退回裸 base64
  const fmt = String(pick(cfg, 'image_format') || 'auto').toLowerCase();
  const formats = fmt === 'base64' ? ['base64', 'data_url']
    : fmt === 'data_url' ? ['data_url', 'base64']
      : ['data_url', 'base64'];

  const prompt = [
    '你是企业 IT 资产录入助手。请逐字识别这张设备铭牌 / 机身上的文字。',
    '',
    '【最重要】只输出图片里真实存在的字符，看不清就留空或写你看到的形状，',
    '绝对不要凭常识「猜」一个看起来合理的序列号——猜错比空着更麻烦。',
    '',
    '【序列号 SN 特别注意】',
    '1. 序列号通常跟在 S/N、SN、Serial、Service Tag、序列号 后面；',
    '2. 只输出序列号本身，不要把标签一起带上（不要输出 "SN:xxx" 这种带冒号的整体，也不要把 S/N 重复一遍）；',
    '3. 逐字符确认容易混的字符：数字 1 / 大写 L / 大写 I，数字 0 / 大写 O / 大写 Q，',
    '   数字 8 / 大写 B，数字 5 / 大写 S，数字 2 / 大写 Z，数字 6 / 大写 G，大写 H / 大写 K；',
    '4. 主机铭牌上常有两条长编号：一条是序列号（S/N），另一条是产品/机型编号（如 8SSM10X38077xxxx、ADPCDECMxxxx），',
    '   请把 S/N 那条填进 sn，另一条放进 lines 里即可。',
    '',
    '只输出 JSON，不要输出解释、不要 markdown 代码块。格式：',
    '{"brand":"品牌","model":"型号","sn":"序列号","lines":["逐行文字"]}',
    'brand 用中文或英文品牌名；找不到的字段填空字符串。',
  ].join('\n');

  let lastErr = null;
  let elapsedTotal = 0;

  for (const format of formats) {
    const body = {
      model,
      temperature: 0,
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: imageUrlFor(buf, mime, format) } },
        ],
      }],
    };
    // 智谱：关闭 thinking 可显著加快铭牌 OCR（其它厂商不发该参数，避免未知参数报错）
    if (flavor === 'zhipu') body.thinking = { type: 'disabled' };

    const r = await httpJson(`${baseUrl}/chat/completions`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    elapsedTotal += r.elapsed || 0;

    if (!r.ok || r.json?.error) {
      lastErr = { status: r.status, msg: r.json?.error?.message || r.text.slice(0, 300) };
      continue; // 换一种图片格式再试
    }

    const content = r.json?.choices?.[0]?.message?.content ?? '';
    const text = typeof content === 'string'
      ? content
      : Array.isArray(content) ? content.map((c) => c.text || '').join('\n') : String(content);

    let structured = null;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try { structured = JSON.parse(jsonMatch[0]); } catch { /* ignore */ }
    }

    const lines = [];
    const seen = new Set();
    // 结构化字段优先（置信度最高），并按归一化文本去重，避免与模型返回值重复
    const push = (t, score) => {
      const text = String(t ?? '').trim();
      const k = normalizeText(text);
      if (!k || seen.has(k)) return;
      seen.add(k);
      lines.push({ text, score });
    };
    if (structured?.brand) push(structured.brand, 0.98);
    if (structured?.model) push(`Model: ${structured.model}`, 0.97);
    if (structured?.sn) push(`S/N: ${structured.sn}`, 0.99);

    if (structured?.lines?.length) {
      for (const l of structured.lines) push(l, 0.92);
    } else {
      for (const l of text.split('\n')) push(l, 0.9);
    }

    return result(lines, 'vision', elapsedTotal, {
      structured, model, image_format: format, raw_response: text.slice(0, 2000),
    });
  }

  // 两种图片格式都失败：给出可操作的错误提示
  const status = lastErr?.status || 502;
  let hintText = '';
  if (status === 401 || status === 403) {
    hintText = '（API Key 未被服务商认可：请到 open.bigmodel.cn → API Keys 重新生成一个，'
      + '完整复制「32位ID.16位密钥」格式的整串；常见原因是复制漏字符、Key 已被重新生成失效、'
      + '或 Key 属于其它站点/账号）';
  } else if (status === 404) hintText = '（Base URL 或模型名不对，请对照预设检查）';
  else if (status === 429) hintText = '（免费额度被限流，稍后重试或换一个免费模型）';
  else if (/model/i.test(lastErr?.msg || '')) hintText = '（模型名可能不存在，请到控制台核对）';

  throw new HttpError(502, `视觉模型调用失败 [${status}] ${lastErr?.msg || ''} ${hintText}`, {
    base_url: baseUrl,
    model,
    tried_image_formats: formats,
    provider_error: lastErr?.msg || null,
  });
}

/* ------------------------------------------------------------------ *
 * 6. 自定义 HTTP 接口
 * ------------------------------------------------------------------ */

async function customRecognize(cfg, buf, mime) {
  const url = pick(cfg, 'url');
  if (!url) throw new HttpError(400, '自定义识别接口需要配置 URL');
  const apiKey = pick(cfg, 'api_key', 'apiKey');
  const textPath = pick(cfg, 'text_path') || '';
  const b64 = buf.toString('base64');

  let headers = { 'Content-Type': 'application/json' };
  const rawHeaders = pick(cfg, 'headers');
  if (rawHeaders) {
    try {
      headers = { ...headers, ...JSON.parse(rawHeaders) };
    } catch { throw new HttpError(400, '自定义 Header 必须是合法 JSON'); }
  }
  if (apiKey) headers.Authorization = headers.Authorization || `Bearer ${apiKey}`;

  const rawBody = pick(cfg, 'body_template');
  let body;
  if (rawBody) {
    body = String(rawBody)
      .replaceAll('{{base64}}', b64)
      .replaceAll('{{mime}}', mime || 'image/jpeg');
  } else {
    body = JSON.stringify({ image: b64, image_base64: b64, mime });
  }

  const r = await httpJson(url, { method: methodOf(cfg), headers, body });
  if (!r.ok) throw new HttpError(502, `自定义识别接口失败 [${r.status}] ${r.text.slice(0, 200)}`);

  const lines = [];
  const push = (v) => {
    if (typeof v === 'string') lines.push({ text: v, score: 0.9 });
    else if (v && typeof v === 'object') {
      const t = v.text ?? v.words ?? v.content;
      if (typeof t === 'string') lines.push({ text: t, score: Number(v.score ?? v.confidence ?? v.probability) || 0.9 });
    }
  };
  const found = textPath ? dig(r.json, textPath) : findTextArray(r.json);
  if (Array.isArray(found)) found.forEach(push);
  else push(found);

  return result(lines, 'custom', r.elapsed);
}

function methodOf(cfg) {
  const m = String(pick(cfg, 'method') || 'POST').toUpperCase();
  return ['POST', 'PUT', 'PATCH'].includes(m) ? m : 'POST';
}

function dig(obj, path) {
  return String(path).split(/[.[\]]+/).filter(Boolean)
    .reduce((o, k) => (o == null ? o : o[k]), obj);
}

function findTextArray(obj, depth = 0) {
  if (!obj || depth > 6) return null;
  if (Array.isArray(obj)) {
    if (obj.length && obj.every((x) => typeof x === 'string' || (x && (x.text || x.words || x.content)))) return obj;
    for (const v of obj) {
      const r = findTextArray(v, depth + 1);
      if (r) return r;
    }
    return null;
  }
  if (typeof obj === 'object') {
    for (const v of Object.values(obj)) {
      const r = findTextArray(v, depth + 1);
      if (r) return r;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * 总入口
 * ------------------------------------------------------------------ */

export async function recognize({ buffer, mime = 'image/jpeg', provider: forced }) {
  if (!buffer || !buffer.length) throw new HttpError(400, '缺少图片数据');
  if (buffer.length > 8 * 1024 * 1024) throw new HttpError(413, '图片过大（上限 8MB），请压缩后重试');

  const cfg = getOcrConfig();
  const provider = (forced || cfg.provider || 'mock').toLowerCase();

  switch (provider) {
    case 'mock': return mockRecognize();
    case 'baidu': return baiduRecognize(cfg, buffer);
    case 'tencent': return tencentRecognize(cfg, buffer);
    case 'aliyun': return aliyunRecognize(cfg, buffer);
    case 'vision': return visionRecognize(cfg, buffer, mime);
    case 'custom': return customRecognize(cfg, buffer, mime);
    default:
      throw new HttpError(400, `未知的识别服务：${provider}。可选：mock / baidu / tencent / aliyun / vision / custom`);
  }
}

/** 给设置页用的脱敏信息 */
export function ocrStatus() {
  const cfg = getOcrConfig();
  const has = (...names) => names.some((n) => !!pick(cfg, n));
  return {
    provider: cfg.provider,
    configured: {
      baidu: has('api_key', 'client_id') && has('secret_key', 'client_secret'),
      tencent: has('secret_id', 'SecretId') && has('secret_key', 'SecretKey'),
      aliyun: has('app_code', 'appCode'),
      vision: has('api_key'),
      custom: has('url'),
      mock: true,
    },
    providers: [
      { id: 'mock', label: '本地模拟（无需密钥）', hint: '用于演示和联调，随机返回示例铭牌文字' },
      { id: 'baidu', label: '百度智能云 OCR', hint: '通用文字识别（高精度版），需 API Key / Secret Key' },
      { id: 'tencent', label: '腾讯云 OCR', hint: '通用印刷体识别，需 SecretId / SecretKey' },
      { id: 'aliyun', label: '阿里云 OCR（云市场）', hint: '需 AppCode 与接口 URL' },
      { id: 'vision', label: '视觉大模型（OpenAI 兼容）', hint: '不限于 GPT：智谱 GLM-4V-Flash（长期免费）/ 通义千问 qwen-vl / 豆包 / 硅基流动 / 魔搭 等 OpenAI 兼容视觉模型，直接返回结构化品牌型号 SN' },
      { id: 'custom', label: '自定义 HTTP 接口', hint: '对接公司内部 OCR 网关' },
    ],
    env_locked: Object.keys(process.env).filter((k) => /OCR|VISION|BAIDU|TENCENT|ALIYUN|CUSTOM/.test(k)),
  };
}
