/**
 * 极简 QR 码生成器（零依赖）—— 用于生成资产二维码贴纸
 * 支持字节模式、纠错等级 L/M/Q/H、版本 1-20、自动掩码选择。
 */

/* ---------------- GF(256) 运算 ---------------- */
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

const gfMul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/* ---------------- 版本容量表 ---------------- */
// [每块纠错码字数, 块1数据码字, 块1块数, 块2数据码字, 块2块数]
export const EC_TABLE = {  L: [null,
    [7, 19, 1, 0, 0], [10, 34, 1, 0, 0], [15, 55, 1, 0, 0], [20, 80, 1, 0, 0], [26, 108, 1, 0, 0],
    [18, 68, 2, 0, 0], [20, 78, 2, 0, 0], [24, 97, 2, 0, 0], [30, 116, 2, 0, 0], [18, 68, 2, 69, 2],
    [20, 81, 4, 0, 0], [24, 92, 2, 93, 2], [26, 107, 4, 0, 0], [30, 115, 3, 116, 1], [22, 87, 5, 88, 1],
    [24, 98, 5, 99, 1], [28, 107, 1, 108, 5], [30, 120, 5, 121, 1], [28, 113, 3, 114, 4], [28, 107, 3, 108, 5],
  ],
  M: [null,
    [10, 16, 1, 0, 0], [16, 28, 1, 0, 0], [26, 44, 1, 0, 0], [18, 32, 2, 0, 0], [24, 43, 2, 0, 0],
    [16, 27, 4, 0, 0], [18, 31, 4, 0, 0], [22, 38, 2, 39, 2], [22, 36, 3, 37, 2], [26, 43, 4, 44, 1],
    [30, 50, 1, 51, 4], [22, 36, 6, 37, 2], [22, 37, 8, 38, 1], [24, 43, 4, 44, 5], [24, 41, 5, 42, 5],
    [28, 50, 7, 51, 3], [28, 50, 10, 51, 1], [26, 47, 9, 48, 4], [26, 49, 3, 50, 11], [26, 50, 3, 51, 13],
  ],
  Q: [null,
    [13, 13, 1, 0, 0], [22, 22, 1, 0, 0], [18, 17, 2, 0, 0], [26, 24, 2, 0, 0], [18, 15, 2, 16, 2],
    [24, 19, 4, 0, 0], [18, 14, 2, 15, 4], [22, 18, 4, 19, 2], [20, 16, 4, 17, 4], [24, 19, 6, 20, 2],
    [28, 22, 4, 23, 4], [26, 20, 4, 21, 6], [24, 18, 8, 19, 4], [20, 26, 11, 27, 5], [30, 24, 5, 25, 7],
    [24, 20, 15, 21, 2], [28, 24, 1, 25, 15], [30, 28, 17, 29, 1], [28, 26, 17, 27, 4], [28, 26, 15, 27, 5],
  ],
  H: [null,
    [17, 9, 1, 0, 0], [28, 16, 1, 0, 0], [22, 13, 1, 0, 0], [16, 9, 4, 0, 0], [22, 11, 2, 12, 2],
    [28, 15, 4, 0, 0], [26, 13, 4, 14, 1], [26, 14, 4, 15, 2], [24, 12, 4, 13, 4], [28, 15, 6, 16, 2],
    [24, 12, 3, 13, 8], [28, 14, 7, 15, 4], [22, 11, 12, 12, 4], [24, 12, 11, 13, 5], [24, 12, 11, 13, 7],
    [30, 15, 3, 16, 13], [28, 14, 2, 15, 17], [28, 14, 2, 15, 19], [26, 13, 9, 14, 16], [28, 14, 15, 15, 10],
  ],
};

/* ---------------- 对齐图案位置 ---------------- */
const ALIGN = [null,
  [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
  [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50], [6, 30, 54],
  [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70], [6, 26, 50, 74],
  [6, 30, 54, 78], [6, 30, 56, 82], [6, 30, 58, 86], [6, 34, 62, 90],
];

/* ---------------- Reed-Solomon ---------------- */
function rsGenerator(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data, ecLen) {
  const gen = rsGenerator(ecLen);
  const res = new Array(ecLen).fill(0);
  for (const d of data) {
    const factor = d ^ res[0];
    res.shift();
    res.push(0);
    for (let i = 0; i < ecLen; i++) res[i] ^= gfMul(gen[i + 1], factor);
  }
  return res;
}

/* ---------------- 位缓冲 ---------------- */
class BitBuffer {
  constructor() { this.bits = []; }
  put(value, length) {
    for (let i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  }
  get length() { return this.bits.length; }
}

/* ---------------- 矩阵 ---------------- */
function makeMatrix(size) {
  return Array.from({ length: size }, () => new Int8Array(size).fill(-1)); // -1 = 未设置
}

function placeFinder(m, reserved, row, col) {
  const size = m.length;
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const rr = row + r;
      const cc = col + c;
      if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
      const isBorder = (r === 0 || r === 6 || c === 0 || c === 6) && r >= 0 && r <= 6 && c >= 0 && c <= 6;
      const isCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      m[rr][cc] = isBorder || isCenter ? 1 : 0;
      reserved[rr][cc] = 1;
    }
  }
}

function placeAlignment(m, reserved, version) {
  const pos = ALIGN[version] || [];
  for (const r of pos) {
    for (const c of pos) {
      if (reserved[r][c]) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const isBorder = Math.abs(dr) === 2 || Math.abs(dc) === 2;
          const isCenter = dr === 0 && dc === 0;
          m[r + dr][c + dc] = isBorder || isCenter ? 1 : 0;
          reserved[r + dr][c + dc] = 1;
        }
      }
    }
  }
}

function placeTiming(m, reserved) {
  const size = m.length;
  for (let i = 8; i < size - 8; i++) {
    if (!reserved[6][i]) { m[6][i] = i % 2 === 0 ? 1 : 0; reserved[6][i] = 1; }
    if (!reserved[i][6]) { m[i][6] = i % 2 === 0 ? 1 : 0; reserved[i][6] = 1; }
  }
}

function reserveFormatAreas(m, reserved) {
  const size = m.length;
  for (let i = 0; i < 9; i++) {
    if (!reserved[8][i]) { reserved[8][i] = 1; m[8][i] = 0; }
    if (!reserved[i][8]) { reserved[i][8] = 1; m[i][8] = 0; }
  }
  for (let i = 0; i < 8; i++) {
    if (!reserved[8][size - 1 - i]) { reserved[8][size - 1 - i] = 1; m[8][size - 1 - i] = 0; }
    if (!reserved[size - 1 - i][8]) { reserved[size - 1 - i][8] = 1; m[size - 1 - i][8] = 0; }
  }
  // 固定暗模块
  m[size - 8][8] = 1;
  reserved[size - 8][8] = 1;
}

/* ---------------- 主流程 ---------------- */
const EC_LEVEL_BITS = { L: 0b01, M: 0b00, Q: 0b11, H: 0b10 };

/**
 * @param {string} text
 * @param {'L'|'M'|'Q'|'H'} ecLevel
 * @returns {{size:number, modules:Int8Array[], version:number}}
 */
export function qrcodeEncode(text, ecLevel = 'M') {
  // 纠错等级只认 L/M/Q/H。传别的（例如 ?ec=zzz）以前会直接
  // `EC_TABLE[ecLevel][v]` 抛 TypeError → 500，等于给了一个免费的错误日志刷屏口。
  const lvl = String(ecLevel ?? '').toUpperCase();
  const ec = Object.prototype.hasOwnProperty.call(EC_TABLE, lvl) && lvl !== '__proto__' ? lvl : 'M';
  const bytes = [...Buffer.from(String(text), 'utf8')];

  // 选版本
  let version = 0;
  let info = null;
  for (let v = 1; v <= 20; v++) {
    const t = EC_TABLE[ec][v];
    if (!t) continue;
    const dataCodewords = t[1] * t[2] + t[3] * t[4];
    const capacityBits = dataCodewords * 8;
    const needed = 4 + (v <= 9 ? 8 : 16) + bytes.length * 8;
    if (needed <= capacityBits) { version = v; info = t; break; }
  }
  if (!version) throw new Error('内容过长，无法生成二维码');

  const [ecLen, d1, n1, d2, n2] = info;
  const totalDataCodewords = d1 * n1 + d2 * n2;

  // 数据位流
  const bb = new BitBuffer();
  bb.put(0b0100, 4);                              // 字节模式
  bb.put(bytes.length, version <= 9 ? 8 : 16);    // 字符计数
  for (const b of bytes) bb.put(b, 8);

  // 结束符 + 补齐
  const capacityBits = totalDataCodewords * 8;
  const terminator = Math.min(4, capacityBits - bb.length);
  bb.put(0, terminator);
  while (bb.length % 8 !== 0) bb.put(0, 1);

  const dataCodewords = [];
  for (let i = 0; i < bb.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bb.bits[i + j];
    dataCodewords.push(v);
  }
  const padBytes = [0xec, 0x11];
  let pi = 0;
  while (dataCodewords.length < totalDataCodewords) {
    dataCodewords.push(padBytes[pi++ % 2]);
  }

  // 分块 + RS
  const blocks = [];
  let offset = 0;
  for (let i = 0; i < n1; i++) {
    const d = dataCodewords.slice(offset, offset + d1);
    offset += d1;
    blocks.push({ data: d, ec: rsEncode(d, ecLen) });
  }
  for (let i = 0; i < n2; i++) {
    const d = dataCodewords.slice(offset, offset + d2);
    offset += d2;
    blocks.push({ data: d, ec: rsEncode(d, ecLen) });
  }

  // 交错
  const maxData = Math.max(...blocks.map((b) => b.data.length));
  const finalCodewords = [];
  for (let i = 0; i < maxData; i++) {
    for (const b of blocks) if (i < b.data.length) finalCodewords.push(b.data[i]);
  }
  for (let i = 0; i < ecLen; i++) {
    for (const b of blocks) finalCodewords.push(b.ec[i]);
  }

  // 最终位流（含剩余位）
  const finalBits = [];
  for (const cw of finalCodewords) {
    for (let i = 7; i >= 0; i--) finalBits.push((cw >>> i) & 1);
  }

  const size = version * 4 + 17;
  const m = makeMatrix(size);
  const reserved = Array.from({ length: size }, () => new Int8Array(size));

  placeFinder(m, reserved, 0, 0);
  placeFinder(m, reserved, 0, size - 7);
  placeFinder(m, reserved, size - 7, 0);
  placeAlignment(m, reserved, version);
  placeTiming(m, reserved);
  reserveFormatAreas(m, reserved);

  // 版本信息（版本 >= 7）
  if (version >= 7) {
    let vbits = version << 12;
    const g = 0x1f25;
    let rem = vbits;
    for (let i = 0; i < 6; i++) rem = (rem << 1) ^ ((rem >>> 11) * g);
    vbits = ((version << 12) | rem) & 0x3ffff;
    for (let i = 0; i < 18; i++) {
      const bit = (vbits >>> i) & 1;
      const r = Math.floor(i / 3);
      const c = i % 3;
      m[r][size - 11 + c] = bit;
      reserved[r][size - 11 + c] = 1;
      m[size - 11 + c][r] = bit;
      reserved[size - 11 + c][r] = 1;
    }
  }

  // 布置数据
  let bitIdx = 0;
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--; // 跳过时序列
    for (let i = 0; i < size; i++) {
      const row = upward ? size - 1 - i : i;
      for (const c of [col, col - 1]) {
        if (reserved[row][c]) continue;
        const bit = bitIdx < finalBits.length ? finalBits[bitIdx++] : 0;
        m[row][c] = bit;
      }
    }
    upward = !upward;
  }

  // 掩码选择
  const maskFns = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ];

  const base = m.map((row) => Int8Array.from(row));
  let best = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const cand = base.map((row) => Int8Array.from(row));
    const res2 = reserved.map((row) => Int8Array.from(row));
    applyMask(cand, reserved, maskFns[mask]);
    drawFormat(cand, res2, ec, mask);
    const score = penalty(cand);
    if (score < bestScore) { bestScore = score; best = cand; }
  }

  return { size, modules: best, version, ecLevel: ec };
}

function applyMask(m, reserved, fn) {
  const size = m.length;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (reserved[r][c]) continue;
      if (fn(r, c)) m[r][c] ^= 1;
    }
  }
}

/** 8 个数据掩码（解码时按格式信息里那一位选一个） */
export const MASK_FNS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

export const EC_BITS_TO_LEVEL = { [EC_LEVEL_BITS.L]: 'L', [EC_LEVEL_BITS.M]: 'M', [EC_LEVEL_BITS.Q]: 'Q', [EC_LEVEL_BITS.H]: 'H' };

/**
 * 重建「哪些格子是功能图案（不存数据）」的地图 —— 解码时要靠它跳过功能区。
 * 和编码时的布置顺序完全一致，改动这里必须同步改 qrcodeEncode。
 */
export function reservedMap(version) {
  const size = version * 4 + 17;
  const m = makeMatrix(size);
  const reserved = Array.from({ length: size }, () => new Int8Array(size));
  placeFinder(m, reserved, 0, 0);
  placeFinder(m, reserved, 0, size - 7);
  placeFinder(m, reserved, size - 7, 0);
  placeAlignment(m, reserved, version);
  placeTiming(m, reserved);
  reserveFormatAreas(m, reserved);
  if (version >= 7) {
    for (let i = 0; i < 18; i++) {
      const r = Math.floor(i / 3);
      const c = i % 3;
      m[r][size - 11 + c] = 0;
      reserved[r][size - 11 + c] = 1;
      m[size - 11 + c][r] = 0;
      reserved[size - 11 + c][r] = 1;
    }
  }
  return { size, reserved };
}

function drawFormat(m, reserved, ecLevel, mask) {
  const size = m.length;
  const data = (EC_LEVEL_BITS[ecLevel] << 3) | mask;
  let bits = data << 10;
  const g = 0x537;
  let rem = bits;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * g);
  bits = ((data << 10) | (rem & 0x3ff)) ^ 0x5412;

  const get = (i) => (bits >>> i) & 1;
  // 左上
  for (let i = 0; i <= 5; i++) m[8][i] = get(i);
  m[8][7] = get(6);
  m[8][8] = get(7);
  m[7][8] = get(8);
  for (let i = 9; i <= 14; i++) m[14 - i][8] = get(i);
  // 右上 / 左下
  for (let i = 0; i <= 7; i++) m[size - 1 - i][8] = get(i);
  for (let i = 8; i <= 14; i++) m[8][size - 15 + i] = get(i);
  m[size - 8][8] = 1;
}

function penalty(m) {
  const size = m.length;
  let score = 0;

  // 规则 1：连续同色
  const runScore = (line) => {
    let s = 0;
    let run = 1;
    for (let i = 1; i < line.length; i++) {
      if (line[i] === line[i - 1]) {
        run++;
        if (run === 5) s += 3;
        else if (run > 5) s += 1;
      } else run = 1;
    }
    return s;
  };
  for (let r = 0; r < size; r++) score += runScore(m[r]);
  for (let c = 0; c < size; c++) {
    const col = new Int8Array(size);
    for (let r = 0; r < size; r++) col[r] = m[r][c];
    score += runScore(col);
  }

  // 规则 2：2x2 同色块
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = m[r][c];
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
    }
  }

  // 规则 3：类似定位图案
  const pat1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  const checkLine = (line) => {
    let s = 0;
    for (let i = 0; i + 11 <= line.length; i++) {
      let m1 = true;
      let m2 = true;
      for (let j = 0; j < 11; j++) {
        if (line[i + j] !== pat1[j]) m1 = false;
        if (line[i + j] !== pat2[j]) m2 = false;
      }
      if (m1) s += 40;
      if (m2) s += 40;
    }
    return s;
  };
  for (let r = 0; r < size; r++) score += checkLine(m[r]);
  for (let c = 0; c < size; c++) {
    const col = new Int8Array(size);
    for (let r = 0; r < size; r++) col[r] = m[r][c];
    score += checkLine(col);
  }

  // 规则 4：黑白比例
  let dark = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) dark += m[r][c];
  const ratio = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(ratio - 50) / 5) * 10;

  return score;
}

/** 生成 SVG 字符串（viewBox 单位 = 1 模块） */
/**
 * ⚠️ 颜色必须过白名单！
 *
 * 这两个值最终会被插进 `fill="…"`，而 `/api/qrcode` 的 dark/light 是**直接来自 query** 的。
 * 2026-09-23 实测确认过：`?dark=%22%3E%3Cscript%3E…` 会拼出一个含 <script> 的 SVG，
 * 而该响应是顶层 `image/svg+xml` 文档 → 浏览器按文档执行 → 拿到本应用的源执行任意脚本。
 *
 * 校验放在「产出 SVG 的这一层」而不是调用方，是为了以后新增调用方时不会再漏一次。
 */
const COLOR_HEX = /^#[0-9a-f]{3,8}$/i;
const COLOR_FN = /^(rgb|rgba|hsl|hsla)\(\s*[\d.%,\s/]+\)$/i;
const COLOR_NAMED = /^(black|white|red|green|blue|gray|grey|silver|navy|teal|olive|purple|maroon|aqua|cyan|fuchsia|magenta|lime|yellow|orange|pink|brown|transparent|none)$/i;
function safeColor(v, fallback) {
  const s = String(v ?? '').trim();
  if (COLOR_HEX.test(s) || COLOR_FN.test(s) || COLOR_NAMED.test(s)) return s;
  return fallback;
}

export function qrcodeSvg(text, { ecLevel = 'M', quiet = 3, dark = '#111827', light = '#ffffff', size = null } = {}) {
  const fg = safeColor(dark, '#111827');
  const bg = safeColor(light, '#ffffff');
  const { size: n, modules } = qrcodeEncode(text, ecLevel);
  // quiet 只允许合理范围的非负整数，别让它变成把 viewBox 撑爆/写 NaN 的手段
  const qd = Number.isFinite(Number(quiet)) ? Math.min(16, Math.max(0, Math.trunc(Number(quiet)))) : 3;
  const total = n + qd * 2;
  const px = Number.isFinite(Number(size)) && Number(size) > 0
    ? ` width="${Math.min(4096, Math.trunc(Number(size)))}" height="${Math.min(4096, Math.trunc(Number(size)))}"`
    : '';
  const paths = [];
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (modules[r][c] === 1) {
        let w = 1;
        while (c + w < n && modules[r][c + w] === 1) w++;
        paths.push(`M${c + qd} ${r + qd}h${w}v1h-${w}z`);
        c += w;
      } else c++;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}"${px} shape-rendering="crispEdges">
<rect width="${total}" height="${total}" fill="${bg}"/>
<path d="${paths.join('')}" fill="${fg}"/>
</svg>`;
}
