/**
 * 识别结果解析引擎
 * 把 OCR 出来的原始文本行，解析成 { 品牌, 型号, SN, 其他 } 并给出置信度
 */
import { BRANDS, BRAND_NOISE } from './brands.js';
import { compactAlnum, normalizeText, toHalfWidth, uniq } from '../util.js';

/* ------------------------------------------------------------------ *
 * 1. 品牌识别
 * ------------------------------------------------------------------ */

function brandSearchIndex() {
  const idx = [];
  for (const b of BRANDS) {
    const forms = uniq([
      b.name, b.en, ...(b.aliases || []),
    ]).filter(Boolean);
    for (const f of forms) {
      idx.push({ brand: b, form: f, compact: compactAlnum(f) });
    }
  }
  // 长的优先，避免 "MI" 抢先匹配到 "MICROSOFT"
  idx.sort((a, b) => b.compact.length - a.compact.length);
  return idx;
}

let BRAND_INDEX = null;

/**
 * 从一组文本行中识别品牌
 * @param {Array<{text:string, score:number}>} lines
 * @returns {{brand:string|null, confidence:number, evidence:string|null, alternatives:Array}}
 */
export function detectBrand(lines) {
  if (!BRAND_INDEX) BRAND_INDEX = brandSearchIndex();
  const hits = new Map(); // brandName -> { score, evidence, count }

  for (const line of lines) {
    const raw = toHalfWidth(line.text || '');
    const compact = compactAlnum(raw);
    if (!compact || compact.length < 2) continue;
    const ocrScore = typeof line.score === 'number' && line.score > 0 ? line.score : 0.75;

    for (const entry of BRAND_INDEX) {
      if (entry.compact.length < 2) continue;
      let pos = compact.indexOf(entry.compact);
      if (pos < 0) continue;

      // 短别名（<=3）要求单词边界，避免误匹配
      if (entry.compact.length <= 3) {
        const before = compact[pos - 1];
        const after = compact[pos + entry.compact.length];
        const isBoundary = (c) => c === undefined || !/[A-Z0-9]/.test(c);
        if (!(isBoundary(before) && isBoundary(after))) continue;
      }

      // 命中噪声词则跳过
      if (BRAND_NOISE.some((n) => compact === n)) continue;

      // 分数：OCR 置信度 * 名称长度权重 * 整行匹配加成
      const exact = compact === entry.compact;
      const contained = compact.includes(`MODEL${entry.compact}`) || compact.includes(`${entry.compact}MODEL`);
      let s = ocrScore * (0.72 + Math.min(entry.compact.length, 12) * 0.023);
      if (exact) s += 0.18;
      if (pos === 0) s += 0.06;

      const key = entry.brand.name;
      const prev = hits.get(key);
      if (!prev || s > prev.score) {
        hits.set(key, { score: Math.min(s, 0.99), evidence: raw.trim(), count: (prev?.count || 0) + 1 });
      } else {
        prev.count++;
      }
    }
  }

  const ranked = [...hits.entries()]
    .map(([brand, v]) => ({ brand, confidence: Math.min(v.score + Math.min(v.count - 1, 3) * 0.02, 0.99), evidence: v.evidence }))
    .sort((a, b) => b.confidence - a.confidence);

  if (!ranked.length) return { brand: null, confidence: 0, evidence: null, alternatives: [] };
  return {
    brand: ranked[0].brand,
    confidence: ranked[0].confidence,
    evidence: ranked[0].evidence,
    alternatives: ranked.slice(1, 5),
  };
}

/** 用 SN 反推品牌（弱证据，仅在文本里没找到品牌时使用） */
export function brandFromSN(sn) {
  const c = compactAlnum(sn);
  if (!c || c.length < 6) return { brand: null, confidence: 0 };
  const cands = [];
  for (const b of BRANDS) {
    for (const p of b.snPrefixes || []) {
      const pc = compactAlnum(p);
      if (pc.length >= 2 && c.startsWith(pc)) {
        cands.push({ brand: b.name, confidence: 0.35 + Math.min(pc.length * 0.03, 0.12), prefix: p });
      }
    }
  }
  if (!cands.length) return { brand: null, confidence: 0 };
  cands.sort((a, b) => b.confidence - a.confidence);
  return cands[0];
}

/* ------------------------------------------------------------------ *
 * 2. SN 识别
 * ------------------------------------------------------------------ */

const SN_LABEL_RE = /(序列号|序號|產品序號|产品序列号|机器序列号|主机序列号|s\/?n|sn|serial(\s*(no|number|#))?|service\s*tag|servicetag|产品编号|產品編號|机身编号|設備序號)\s*[:：.]?\s*/i;

/** 明显不是 SN 的标签值 */
const SN_BLACKLIST = new Set([
  'MADEINCHINA', 'MADEIN', 'CHINA', 'MODEL', 'MODELNO', 'SERIAL', 'SERIALNO', 'SN', 'INPUT',
  'OUTPUT', 'DC', 'AC', 'V', 'A', 'W', 'HZ', 'POWER', 'RATED', 'WARNING', 'CAUTION',
  'WWW', 'HTTP', 'P/N', 'PN', 'REV', 'NONE', 'N/A', 'NA', 'TBD', 'UNKNOWN', 'NULL',
]);

/**
 * @param {Array<{text:string, score:number}>} lines
 * @param {string|null} knownBrand
 * @returns {{sn:string|null, confidence:number, evidence:string|null, alternatives:Array}}
 */
export function detectSN(lines, knownBrand = null) {
  const candidates = [];

  for (const line of lines) {
    const raw = toHalfWidth(line.text || '');
    if (!raw.trim()) continue;
    const ocrScore = typeof line.score === 'number' && line.score > 0 ? line.score : 0.75;

    // 2.1 带标签的（最高优先级）
    const labelMatch = raw.match(SN_LABEL_RE);
    if (labelMatch) {
      const after = raw.slice(labelMatch.index + labelMatch[0].length);
      for (const v of splitValues(after)) {
        const s = cleanSN(v);
        if (isPlausibleSN(s)) {
          candidates.push({ sn: s, confidence: clamp(0.78 + ocrScore * 0.2), evidence: raw.trim(), reason: 'label' });
        }
      }
      // "S/N: XXX" 也可能在同一行更后面
      continue;
    }

    // 2.2 整行就是一个 SN
    const whole = cleanSN(raw);
    if (isPlausibleSN(whole) && !/[^\x20-\x7E]/.test(raw)) {
      candidates.push({ sn: whole, confidence: clamp(0.42 + ocrScore * 0.25), evidence: raw.trim(), reason: 'whole-line' });
    }

    // 2.3 行内 token 扫描
    for (const tok of raw.split(/[\s,;|]+/)) {
      const s = cleanSN(tok);
      if (!isPlausibleSN(s)) continue;
      if (s === whole) continue;
      candidates.push({ sn: s, confidence: clamp(0.3 + ocrScore * 0.2), evidence: raw.trim(), reason: 'token' });
    }
  }

  const scored = candidates.map((c) => {
    let s = c.confidence;
    if (c.reason === 'label') s += 0.12;
    if (/[A-Z]/.test(c.sn) && /\d/.test(c.sn)) s += 0.08;   // 字母数字混合
    if (/^\d+$/.test(c.sn)) s -= 0.12;                       // 纯数字更可能是型号/批次
    if (c.sn.length >= 8 && c.sn.length <= 22) s += 0.05;
    if (knownBrand && brandFromSN(c.sn).brand === knownBrand) s += 0.06;
    if (SN_BLACKLIST.has(compactAlnum(c.sn))) s -= 0.9;
    return { ...c, score: Math.max(0, Math.min(s, 0.99)) };
  }).sort((a, b) => b.score - a.score);

  // 相同 SN 合并
  const merged = [];
  const seen = new Set();
  for (const c of scored) {
    const k = compactAlnum(c.sn);
    if (seen.has(k)) continue;
    seen.add(k);
    merged.push({ sn: c.sn, confidence: c.score, evidence: c.evidence, reason: c.reason });
  }

  if (!merged.length) return { sn: null, confidence: 0, evidence: null, alternatives: [] };
  return { sn: merged[0].sn, confidence: merged[0].confidence, evidence: merged[0].evidence, alternatives: merged.slice(1, 6) };
}

function splitValues(s) {
  return String(s)
    .split(/[\s,;|，、]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function cleanSN(v) {
  return toHalfWidth(String(v ?? ''))
    .replace(/^[\s:：.\-—–_]+/, '')
    .replace(/[\s:：.\-—–_]+$/, '')
    .replace(/[^A-Za-z0-9\-]/g, '')
    .trim();
}

/**
 * 反复剥掉开头的标签词。
 *
 * 铭牌上写的是「S/N: YLX22196」，视觉模型经常把标签一起「读」进值里，
 * 实测出现过 SN1YLX22196 / SN:YJX283G1 / SN1YLX22196 这种，
 * cleanSN 只去标点，去不掉字母，所以这里专门再剥一层（可能叠好几层）。
 */
export function stripSNLabels(v) {
  let s = toHalfWidth(String(v ?? '')).trim();
  const LABEL = /^(?:s\s*[/\\]?\s*n|sn|serial(?:\s*(?:no|number|#))?|service\s*tag|序号|序列号|编号|no)\s*[:：.#]?\s*/i;
  for (let i = 0; i < 4; i++) {
    const next = s.replace(LABEL, '');
    if (next === s) break;
    s = next;
  }
  return cleanSN(s);
}

/**
 * OCR 容易混淆的字符对（只看形状真的像、且实测会出错的）。
 * ⚠️ 别乱加：X↔K、C↔G、T↔Y 这种「看起来沾边」的组合会制造大量假候选，
 *    把正确答案挤下去（实测就这样翻过车）。
 */
const CONFUSION_GROUPS = [
  ['0', 'O', 'Q', 'D'],
  ['1', 'I', 'L'],
  ['2', 'Z'],
  ['4', 'A'],
  ['5', 'S'],
  ['6', 'G'],
  ['8', 'B'],
  ['U', 'V'],
  ['H', 'K'],
];

const CONFUSION = (() => {
  const m = new Map();
  for (const g of CONFUSION_GROUPS) {
    for (const ch of g) {
      const set = m.get(ch) || new Set();
      for (const other of g) if (other !== ch) set.add(other);
      m.set(ch, set);
    }
  }
  return m;
})();

/** 同品牌历史编号推出来的「长什么样」 */
export function snPatternFrom(knownSns = []) {
  const list = knownSns
    .map((s) => cleanSN(s))
    .filter((s) => s && s.length >= 4 && s.length <= 24);
  if (list.length < 3) return { prefix: '', length: 0, classes: [], samples: list.length };

  // 「公共前缀」不能要求所有样本都一致：
  // 档案里只要有一条录错的（Y1X1TWFT 这种把 L 打成 1 的），
  // 严格公共前缀就会缩到 1 个字符，整套推断直接失效。
  // 改成「多数派前缀」：逐位取最常见的字符，占比 ≥60% 才继续。
  let prefix = '';
  for (let i = 0; i < 4; i++) {
    const cnt = new Map();
    let total = 0;
    for (const s of list) {
      if (s.length <= i) continue;
      total++;
      cnt.set(s[i], (cnt.get(s[i]) || 0) + 1);
    }
    if (!total) break;
    const [ch, n] = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0];
    if (n / total < 0.6) break;
    prefix += ch;
  }
  if (prefix.length < 2) prefix = '';

  // 最常见的长度 + 每一位最常见的字符类别（L=字母 D=数字 A=任意）
  const lenCount = new Map();
  for (const s of list) lenCount.set(s.length, (lenCount.get(s.length) || 0) + 1);
  const length = [...lenCount.entries()].sort((a, b) => b[1] - a[1])[0][0];

  const classes = [];
  const charsAt = [];
  for (let i = 0; i < length; i++) {
    let letters = 0; let digits = 0; let total = 0;
    const seen = new Set();
    for (const s of list) {
      if (s.length <= i) continue;
      total++;
      seen.add(s[i]);
      if (/[A-Za-z]/.test(s[i])) letters++;
      else if (/\d/.test(s[i])) digits++;
    }
    charsAt.push(seen);
    if (!total) { classes.push('A'); continue; }
    if (letters / total > 0.8) classes.push('L');
    else if (digits / total > 0.8) classes.push('D');
    else classes.push('A');
  }
  return { prefix, length, classes, charsAt, samples: list.length };
}

/** 候选与「历史编号规律」的吻合度，越高越像真的 */
function scoreAgainstPattern(sn, pattern) {
  if (!sn) return -99;
  let score = 0;
  if (pattern.prefix) {
    if (sn.startsWith(pattern.prefix)) score += 4;
    else {
      // 前缀只差 1~2 个字符，也还算沾边
      let diff = 0;
      for (let i = 0; i < pattern.prefix.length; i++) if (sn[i] !== pattern.prefix[i]) diff++;
      if (diff <= 2) score += 2 - diff;
    }
  }
  if (pattern.length && sn.length === pattern.length) score += 3;
  else if (pattern.length && Math.abs(sn.length - pattern.length) > 2) score -= 2;
  let clsHit = 0; let clsTotal = 0;
  pattern.classes.forEach((c, i) => {
    if (i >= sn.length || c === 'A') return;
    clsTotal++;
    if (c === 'L' ? /[A-Za-z]/.test(sn[i]) : /\d/.test(sn[i])) clsHit++;
  });
  if (clsTotal) score += (clsHit / clsTotal) * 2;

  // 逐位看「这个位置上历史出现过哪些字符」——
  // 同型号的编号在某一位上往往就那几种字符，出现没见过的字基本就是识别错了。
  // 这一条是分辨 YLX2K4K1（对）和 YLX2H4H1（错）的关键。
  if (pattern.charsAt?.length) {
    let seenHit = 0; let unseen = 0;
    for (let i = 0; i < Math.min(sn.length, pattern.charsAt.length); i++) {
      if (pattern.charsAt[i].has(sn[i])) seenHit++;
      else unseen++;
    }
    score += Math.min(seenHit, 8) * 0.25;
    score -= unseen * 0.8;
  }
  return score;
}

/**
 * 用「同品牌归档里已有的编号规律」+「OCR 常见混淆」给识别到的 SN 找几个更可能的写法。
 *
 * 实测价值（真实数据）：
 *   SN1YLX22196 → YLX22196     （模型把标签一起读了进来）
 *   Y1LX1TEX2   → YLX1TEX2     （多读了一个 1）
 *   YUX1DLZK    → YLX1DLZK     （U/L 混淆，前缀修回）
 *   Y1X1EMOZ    → YLX1EMQZ     （1→L、O→Q，前缀修正 + 混淆替换）
 *
 * @param {string} sn OCR 识别到的 SN
 * @param {string[]} knownSns 同品牌已归档的 SN
 * @returns {Array<{sn:string, score:number, reason:string}>} 按可能性排序，第一项是原值
 */
export function snCandidates(sn, knownSns = [], { limit = 5 } = {}) {
  const base = stripSNLabels(sn);
  if (!base || base.length < 4) return [];
  const pattern = snPatternFrom(knownSns);
  const out = new Map();
  const lenOk = !pattern.length || Math.abs(base.length - pattern.length) <= 2;

  const add = (value, reason) => {
    const v = cleanSN(value);
    if (!v || v.length < 4 || v.length > 24) return;
    if (v === base) return;
    if (!out.has(v)) out.set(v, reason);
  };

  // 前缀差了几个字：只在前缀长度也差不多时才修，否则会把戴尔的编号硬掰成联想的
  const prefixDiff = () => {
    if (!pattern.prefix) return 99;
    let d = 0;
    for (let i = 0; i < pattern.prefix.length; i++) if (base[i] !== pattern.prefix[i]) d++;
    return d;
  };

  // ① 前缀前面粘了东西（如 1YLX… / SN 剥完还剩个数字）
  if (pattern.prefix) {
    const at = base.indexOf(pattern.prefix);
    if (at > 0) add(base.slice(at), '去掉前面多出来的字符');
  }

  // ② 多读/少读一个字符：逐个删一位，看能不能对上历史编号的长度
  if (pattern.prefix) {
    for (let i = 0; i < base.length; i++) {
      const v = base.slice(0, i) + base.slice(i + 1);
      if (v.startsWith(pattern.prefix) && pattern.length && v.length === pattern.length) {
        add(v, `去掉多余的「${base[i]}」`);
      }
    }
  }

  // ③ 前缀写错：把前 N 位换回历史前缀。
  //    两个保险：① 首字符必须本来就对（同系列编号的第一个字母基本固定）；
  //              ② 差 ≤2 且长度对得上。
  //    否则「F1C05F3」这种别家编号会被硬掰成「YLC05F3」。
  const diff = prefixDiff();
  const canRepair = pattern.prefix && !base.startsWith(pattern.prefix)
    && base[0] === pattern.prefix[0]
    && diff <= 2 && lenOk;
  const repaired = canRepair ? pattern.prefix + base.slice(pattern.prefix.length) : null;
  if (repaired) add(repaired, '前缀按同型号编号规律修正');

  // ④ 逐位混淆替换。原始值和「修好的前缀」各做一遍，这样
  //    Y1X1EMOZ →（前缀修正）YLX1EMOZ →（O 看成 Q）YLX1EMQZ 也能出来
  for (const b of [base, repaired].filter(Boolean)) {
    for (let i = 0; i < b.length; i++) {
      const set = CONFUSION.get(b[i]);
      if (!set) continue;
      for (const ch of set) {
        add(b.slice(0, i) + ch + b.slice(i + 1), `第 ${i + 1} 位「${b[i]}」可能看成了「${ch}」`);
      }
    }
  }

  // 「整段修好」比「猜某一位看错了」更可信，给一点排序权重
  const reasonBonus = (reason) => (/前缀按同型号|去掉前面多出来|去掉多余/.test(reason) ? 1.5 : 0.5);
  const scored = [{ sn: base, score: scoreAgainstPattern(base, pattern) + 1, reason: '识别原值' }];
  for (const [v, reason] of out) {
    scored.push({ sn: v, score: scoreAgainstPattern(v, pattern) + reasonBonus(reason), reason });
  }
  scored.sort((a, b) => (b.score - a.score) || (a.sn.length - b.sn.length));

  // 原值永远保留，其余按分数截断
  const head = scored.filter((x) => x.sn === base);
  const rest = scored.filter((x) => x.sn !== base).slice(0, Math.max(0, limit - 1));
  return [...head, ...rest].map((x) => ({ ...x, score: Math.round(x.score * 100) / 100 }));
}

function isPlausibleSN(s) {
  if (!s) return false;
  if (s.length < 5 || s.length > 32) return false;
  const c = compactAlnum(s);
  if (c.length < 5) return false;
  if (SN_BLACKLIST.has(c)) return false;
  if (/^(19|20)\d{2}[-/]?\d{1,2}[-/]?\d{1,2}$/.test(s)) return false;  // 日期
  if (/^\d+(\.\d+)?$/.test(s) && s.length < 9) return false;           // 短纯数字
  if (/^\d+(V|W|A|HZ|MAH|MM)$/i.test(s)) return false;                 // 电气参数
  // 至少包含一个数字
  if (!/\d/.test(s)) return false;
  // 不能是常见单词
  if (/^[A-Za-z]{5,}$/.test(s)) return false;
  return true;
}

const clamp = (n) => Math.max(0, Math.min(n, 0.99));

/* ------------------------------------------------------------------ *
 * 3. 型号 / 其它字段
 * ------------------------------------------------------------------ */

const MODEL_LABEL_RE = /(型号|型號|產品型號|产品型号|model(\s*(no|number|#))?|modelno|type)\s*[:：.]?\s*/i;

export function detectModel(lines) {
  const out = [];
  for (const line of lines) {
    const raw = toHalfWidth(line.text || '');
    const m = raw.match(MODEL_LABEL_RE);
    let v = null;
    if (m) {
      v = raw.slice(m.index + m[0].length).trim();
    } else {
      // 无标签时，找形如 XXX-1234 / ABC1234 的 token
      const t = raw.match(/\b([A-Z]{2,6}[- ]?[A-Z0-9]{2,10}\d[A-Z0-9]{0,6})\b/);
      if (t) v = t[1];
    }
    if (!v) continue;
    v = v.replace(/\s{2,}/g, ' ').trim().slice(0, 60);
    if (v.length < 3) continue;
    if (BRAND_NOISE.includes(compactAlnum(v))) continue;
    out.push({ model: v, evidence: raw.trim(), confidence: m ? 0.8 : 0.38 });
  }
  out.sort((a, b) => b.confidence - a.confidence);
  const seen = new Set();
  const uniqOut = [];
  for (const o of out) {
    const k = compactAlnum(o.model);
    if (seen.has(k)) continue;
    seen.add(k);
    uniqOut.push(o);
  }
  if (!uniqOut.length) return { model: null, confidence: 0, alternatives: [] };
  return { model: uniqOut[0].model, confidence: uniqOut[0].confidence, evidence: uniqOut[0].evidence, alternatives: uniqOut.slice(1, 5) };
}

/* ------------------------------------------------------------------ *
 * 4. 整段文本 -> 关键词（辅助判断设备类型）
 * ------------------------------------------------------------------ */

const CATEGORY_KEYWORDS = [
  { code: 'MON', words: ['MONITOR', 'DISPLAY', '显示器', '液晶', 'LCD', 'LED背光', '液晶显示器', '屏幕'] },
  { code: 'NB', words: ['LAPTOP', 'NOTEBOOK', 'THINKPAD', 'MACBOOK', '笔记本电脑', '便携式计算机', 'IDEAPAD'] },
  { code: 'PC', words: ['DESKTOP', 'OPTIPLEX', 'THINKCENTRE', '台式', '微型计算机', '主机', 'TOWER'] },
  { code: 'PRT', words: ['PRINTER', 'LASERJET', '打印机', '打印', 'INKJET', 'MFP', '多功能一体机'] },
  { code: 'NET', words: ['ROUTER', 'SWITCH', '交换机', '路由器', 'AP', 'ACCESS POINT', 'FIREWALL'] },
  { code: 'SRV', words: ['SERVER', 'POWEREDGE', 'PROLIANT', '服务器', 'RACK'] },
  { code: 'MB', words: ['PHONE', '手机', 'TABLET', '平板', 'IPAD', 'IPHONE', 'SMARTPHONE'] },
];

export function detectCategoryHint(text) {
  const compact = compactAlnum(text);
  const scores = [];
  for (const cat of CATEGORY_KEYWORDS) {
    let best = 0;
    for (const w of cat.words) {
      const wc = compactAlnum(w);
      if (wc && compact.includes(wc)) best = Math.max(best, Math.min(0.9, 0.5 + wc.length * 0.04));
    }
    if (best) scores.push({ code: cat.code, confidence: best });
  }
  scores.sort((a, b) => b.confidence - a.confidence);
  return scores[0] || null;
}

/* ------------------------------------------------------------------ *
 * 5. 总入口
 * ------------------------------------------------------------------ */

/**
 * @param {Array<{text:string, score?:number}>} lines
 * @param {string} fullText
 */
export function interpret(lines, fullText = '') {
  const list = (lines || []).filter((l) => l && typeof l.text === 'string' && l.text.trim());
  const brandHit = detectBrand(list);
  const snHit = detectSN(list, brandHit.brand);
  const modelHit = detectModel(list);

  let brand = brandHit.brand;
  let brandConf = brandHit.confidence;
  let brandFromSn = false;
  if (!brand && snHit.sn) {
    const guess = brandFromSN(snHit.sn);
    if (guess.brand) {
      brand = guess.brand;
      brandConf = guess.confidence;
      brandFromSn = true;
    }
  }

  const text = fullText || list.map((l) => l.text).join('\n');
  const catHit = detectCategoryHint(text);

  return {
    brand,
    brand_confidence: round2(brandConf),
    brand_source: brandFromSn ? 'sn-rule' : brand ? 'text' : null,
    brand_evidence: brandHit.evidence,
    brand_alternatives: brandHit.alternatives,
    sn: snHit.sn,
    sn_confidence: round2(snHit.confidence),
    sn_evidence: snHit.evidence,
    sn_alternatives: snHit.alternatives,
    model: modelHit.model,
    model_confidence: round2(modelHit.confidence),
    model_alternatives: modelHit.alternatives,
    category_hint: catHit?.code ?? null,
    category_confidence: round2(catHit?.confidence ?? 0),
    lines: list,
    text,
  };
}

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
