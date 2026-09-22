/**
 * 二维码解码器（纯 Node.js 零依赖，输入是灰度像素）
 *
 * 为什么要自己写一个：
 *   手机浏览器自带的 BarcodeDetector 在「对着显示器拍」时经常解不出来
 *   （摩尔纹 + 视频压缩 + 浏览器内部缩放），iPhone 的 Safari 更是压根没有这个 API。
 *   手机解不出来时把这一帧的灰度图发到服务端，由这里兜底解码，稳定得多。
 *
 * 输入约定：gray 是 Uint8Array，长度 = width*height，行优先，值 0~255（0 黑）。
 * 输出：{ text } 或 null。
 *
 * 只实现扫码核对需要的场景（正的、稍有倾斜的二维码），不做畸变校正。
 */
import { EC_TABLE, reservedMap, MASK_FNS, EC_BITS_TO_LEVEL } from './qrcode.js';

/* ---------------- GF(256) ---------------- */
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
const gfInv = (a) => (a === 0 ? 0 : EXP[255 - LOG[a]]);
const gfPow = (a, n) => (a === 0 ? 0 : EXP[((LOG[a] * n) % 255 + 255) % 255]);

/* ---------------- Reed-Solomon 纠错 ---------------- */

/**
 * 多项式求值。**注意两种下标约定不能混**：
 *  - polyEval：p[i] 是 x^i 的系数（常数项在前）—— 错误位置多项式 Λ、Ω 用这个
 *  - evalCodeword：cw[0] 是最高次项（码字数组就是这个顺序）—— 伴随式、校验用这个
 * 这两个写反了的话，纠错会「对干净的码字也报错」。
 */
function polyEval(p, x) {
  let y = 0;
  for (let i = p.length - 1; i >= 0; i--) y = gfMul(y, x) ^ p[i];
  return y;
}

function evalCodeword(cw, x) {
  let y = 0;
  for (let i = 0; i < cw.length; i++) y = gfMul(y, x) ^ cw[i];
  return y;
}

function polyMul(a, b) {
  const r = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    if (!a[i]) continue;
    for (let j = 0; j < b.length; j++) r[i + j] ^= gfMul(a[i], b[j]);
  }
  return r;
}

/**
 * 纠正一段码字里的错误。纠不了返回 null。
 * @param {ArrayLike<number>} msg 含纠错码字的整块
 * @param {number} nsym 纠错码字数
 */
export function rsDecode(msg, nsym) {
  const n = msg.length;
  const synd = [];
  let clean = true;
  for (let i = 0; i < nsym; i++) {
    const s = evalCodeword(msg, EXP[i]);
    synd.push(s);
    if (s) clean = false;
  }
  if (clean) return Array.from(msg);

  // Berlekamp–Massey 求错误位置多项式 Λ(x)
  let C = [1];
  let B = [1];
  let L = 0;
  let m = 1;
  let b = 1;
  for (let i = 0; i < nsym; i++) {
    let d = synd[i];
    for (let j = 1; j <= L; j++) d ^= gfMul(C[j] || 0, synd[i - j]);
    if (d === 0) { m++; continue; }
    const T = C.slice();
    const coef = gfMul(d, gfInv(b));
    for (let j = 0; j < B.length; j++) C[j + m] = (C[j + m] || 0) ^ gfMul(coef, B[j]);
    if (2 * L <= i) { L = i + 1 - L; B = T; b = d; m = 1; } else m++;
  }
  if (L === 0 || L * 2 > nsym) return null;

  // Chien 搜索：找 Λ 的根 → 错误位置
  const positions = [];
  for (let i = 0; i < n; i++) {
    const xInv = gfInv(EXP[(n - 1 - i) % 255]);
    if (polyEval(C, xInv) === 0) positions.push(i);
  }
  if (positions.length !== L) return null;

  // Forney 求错误值：Ω(x) = S(x)Λ(x) mod x^nsym
  const omega = polyMul(synd, C).slice(0, nsym);
  const out = Array.from(msg);
  for (const pos of positions) {
    const xi = EXP[(n - 1 - pos) % 255];
    const xiInv = gfInv(xi);
    let deriv = 0;
    for (let j = 1; j < C.length; j += 2) deriv ^= gfMul(C[j], gfPow(xiInv, j - 1));
    if (deriv === 0) return null;
    const magnitude = gfMul(xi, gfMul(polyEval(omega, xiInv), gfInv(deriv)));
    out[pos] ^= magnitude;
  }
  for (let i = 0; i < nsym; i++) if (evalCodeword(out, EXP[i]) !== 0) return null;
  return out;
}

/* ---------------- 图像：自适应二值化 ---------------- */

/**
 * 局部均值二值化。
 * 比全局阈值稳得多：拍屏幕时经常一半亮一半暗，全局阈值会把暗的那半整片判成黑。
 */
export function binarize(gray, w, h, win = 25, offset = 6) {
  /*
   * ⚠️ 窗口大小不能写死。定位图案的正中间是一整块 3×3 模块的实心黑，
   *    窗口如果比它小（实测：每格 9px 时中心块 27px，窗口 25px 正好被包住），
   *    局部均值就全是黑的，中心被判成白 → 回字形被掏空 → 三个定位图案全找不着。
   *    所以外面 decodeQR 会拿好几个窗口轮流试。
   */
  const W = w + 1;
  const I = new Int32Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += gray[y * w + x];
      I[(y + 1) * W + (x + 1)] = I[y * W + (x + 1)] + rowSum;
    }
  }
  const out = new Uint8Array(w * h);
  const r = win >> 1;
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum = I[(y1 + 1) * W + (x1 + 1)] - I[y0 * W + (x1 + 1)] - I[(y1 + 1) * W + x0] + I[y0 * W + x0];
      const mean = sum / area;
      // 深于局部均值才算黑；再给一个绝对下限，避免整片灰的时候全是黑
      out[y * w + x] = gray[y * w + x] < mean - offset && gray[y * w + x] < 200 ? 1 : 0;
    }
  }
  return out;
}

/* ---------------- 定位图案（三个回字形） ---------------- */

/** 取中位数：格子大小的三次估计里，中位数比平均值抗离群 */
function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

const ratioOK = (c) => {  const total = c[0] + c[1] + c[2] + c[3] + c[4];
  if (total < 7) return 0;
  const m = total / 7;
  const tol = m * 0.75;
  if (Math.abs(c[0] - m) > tol) return 0;
  if (Math.abs(c[1] - m) > tol) return 0;
  if (Math.abs(c[2] - 3 * m) > 3 * tol) return 0;
  if (Math.abs(c[3] - m) > tol) return 0;
  if (Math.abs(c[4] - m) > tol) return 0;
  return m;
};

/** 垂直方向验证：从 (x, y) 上下量出 1:1:3:1:1 */
function checkVertical(bin, w, h, x, y) {
  const c = [0, 0, 0, 0, 0];
  let i = 2;
  let yy = y;
  while (yy >= 0 && bin[yy * w + x]) { c[i]++; yy--; }
  while (yy >= 0 && !bin[yy * w + x] && c[1] < 64) { c[1]++; yy--; }
  while (yy >= 0 && bin[yy * w + x] && c[0] < 64) { c[0]++; yy--; }
  yy = y + 1;
  while (yy < h && bin[yy * w + x]) { c[i]++; yy++; }
  while (yy < h && !bin[yy * w + x] && c[3] < 64) { c[3]++; yy++; }
  while (yy < h && bin[yy * w + x] && c[4] < 64) { c[4]++; yy++; }
  const m = ratioOK(c);
  if (!m) return null;
  return { center: yy - c[4] - c[3] - c[2] / 2, module: m };
}

/** 水平方向验证 */
function checkHorizontal(bin, w, h, x, y) {
  const c = [0, 0, 0, 0, 0];
  let i = 2;
  let xx = x;
  while (xx >= 0 && bin[y * w + xx]) { c[i]++; xx--; }
  while (xx >= 0 && !bin[y * w + xx] && c[1] < 64) { c[1]++; xx--; }
  while (xx >= 0 && bin[y * w + xx] && c[0] < 64) { c[0]++; xx--; }
  xx = x + 1;
  while (xx < w && bin[y * w + xx]) { c[i]++; xx++; }
  while (xx < w && !bin[y * w + xx] && c[3] < 64) { c[3]++; xx++; }
  while (xx < w && bin[y * w + xx] && c[4] < 64) { c[4]++; xx++; }
  const m = ratioOK(c);
  if (!m) return null;
  return { center: xx - c[4] - c[3] - c[2] / 2, module: m };
}

/** 逐行扫，找 1:1:3:1:1 的形状，再做横竖交叉验证 */
export function findFinders(bin, w, h) {
  const found = [];
  for (let y = 0; y < h; y++) {
    if (found.length > 20000) break;      // 兜底：图太脏就别扫了，别再往里堆
    const c = [0, 0, 0, 0, 0];
    let cur = 0;   // 当前统计的是第几段（0..4）
    for (let x = 0; x < w; x++) {
      if (bin[y * w + x]) {
        if ((cur & 1) === 1) cur++;      // 之前是白，现在转黑
        c[cur]++;
      } else {
        if ((cur & 1) === 0) {
          if (cur === 4) {
            const m = ratioOK(c);
            if (m) {
              const cx = x - c[4] - c[3] - c[2] / 2;
              const v = checkVertical(bin, w, h, Math.round(cx), y);
              if (v) {
                const hh = checkHorizontal(bin, w, h, Math.round(cx), Math.round(v.center));
                if (hh) {
                  found.push({ x: hh.center, y: v.center, module: (m + v.module + hh.module) / 3 });
                }
              }
            }
            c[0] = c[2]; c[1] = c[3]; c[2] = c[4]; c[3] = 1; c[4] = 0;
            cur = 3;
          } else {
            cur++;
            c[cur]++;
          }
        } else {
          c[cur]++;
        }
      }
    }
  }
  return cluster(found);
}

/**
 * 把同一个码的多个候选点合并成一个。
 *
 * 用网格分桶，不用「跟已有结果逐个比」：噪声图上候选点能上万个，
 * 逐对比就是 O(n²)，实测能把内存吃干净。每格 24px，只看周围 3×3 格。
 */
function cluster(points) {
  const CELL = 24;
  const grid = new Map();
  const out = [];
  for (const p of points) {
    const gx = Math.floor(p.x / CELL);
    const gy = Math.floor(p.y / CELL);
    let hit = null;
    for (let dy = -1; dy <= 1 && !hit; dy++) {
      for (let dx = -1; dx <= 1 && !hit; dx++) {
        const bucket = grid.get((gx + dx) + ':' + (gy + dy));
        if (!bucket) continue;
        hit = bucket.find((q) => Math.abs(q.x - p.x) < q.module * 3 && Math.abs(q.y - p.y) < q.module * 3) || null;
      }
    }
    if (hit) {
      hit.x = (hit.x * hit.n + p.x) / (hit.n + 1);
      hit.y = (hit.y * hit.n + p.y) / (hit.n + 1);
      hit.module = (hit.module * hit.n + p.module) / (hit.n + 1);
      hit.n++;
      // 重心会漂到隔壁格，按记录里存的旧桶号重新挂
      const nx = Math.floor(hit.x / CELL); const ny = Math.floor(hit.y / CELL);
      if (nx !== hit.bx || ny !== hit.by) {
        const list = grid.get(hit.bk);
        if (list) {
          const at = list.indexOf(hit);
          if (at >= 0) list.splice(at, 1);
        }
        hit.bx = nx; hit.by = ny; hit.bk = nx + ':' + ny;
        if (!grid.has(hit.bk)) grid.set(hit.bk, []);
        grid.get(hit.bk).push(hit);
      }
      continue;
    }
    const rec = { ...p, n: 1, bx: gx, by: gy, bk: gx + ':' + gy };
    out.push(rec);
    if (!grid.has(rec.bk)) grid.set(rec.bk, []);
    grid.get(rec.bk).push(rec);
  }
  return out.filter((p) => p.n >= 2);   // 只出现一次的多半是噪声
}

/** 从三个定位图案定出左上 / 右上 / 左下 */
export function orderFinders(pts) {
  if (pts.length < 3) return null;
  // 三个里两两距离最远的那条是斜边，剩下那个就是左上角
  let best = null;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = (pts[i].x - pts[j].x) ** 2 + (pts[i].y - pts[j].y) ** 2;
      if (!best || d > best.d) best = { i, j, d };
    }
  }
  const tl = pts.find((_, k) => k !== best.i && k !== best.j);
  const a = pts[best.i];
  const b = pts[best.j];
  // 用叉积判断哪个是右上。图像坐标 y 向下，
  // (右上-TL) × (左下-TL) 是**正的**（数学坐标里是负的，别照抄公式）。
  const cross = (a.x - tl.x) * (b.y - tl.y) - (a.y - tl.y) * (b.x - tl.x);
  const tr = cross > 0 ? a : b;
  const bl = cross > 0 ? b : a;
  if (!tl || !tr || !bl) return null;
  return { tl, tr, bl };
}

/* ---------------- 采样 + 解析 ---------------- */

/** 按三个定位图案做仿射采样，得到 dim×dim 的模块矩阵 */
export function sampleModules(bin, w, h, dim, tl, tr, bl, modulePx = 0) {
  const span = dim - 7;   // 两个定位图案中心之间隔着 dim-7 个模块
  // 格子很小的时候（比如每格才 3px）取样邻域也要跟着收窄，否则会串到隔壁格
  const rad = modulePx >= 6 ? 1 : 0;
  const modules = [];
  for (let row = 0; row < dim; row++) {
    const line = new Uint8Array(dim);
    const v = (row + 0.5 - 3.5) / span;
    for (let col = 0; col < dim; col++) {
      const u = (col + 0.5 - 3.5) / span;
      const x = tl.x + u * (tr.x - tl.x) + v * (bl.x - tl.x);
      const y = tl.y + u * (tr.y - tl.y) + v * (bl.y - tl.y);
      if (!rad) {
        const px = Math.round(x); const py = Math.round(y);
        line[col] = px >= 0 && py >= 0 && px < w && py < h ? bin[py * w + px] : 0;
        continue;
      }
      // 3×3 邻域取多数，抗噪
      let dark = 0; let total = 0;
      for (let dy = -rad; dy <= rad; dy++) {
        for (let dx = -rad; dx <= rad; dx++) {
          const px = Math.round(x + dx); const py = Math.round(y + dy);
          if (px < 0 || py < 0 || px >= w || py >= h) continue;
          total++;
          dark += bin[py * w + px];
        }
      }
      line[col] = total && dark * 2 > total ? 1 : 0;
    }
    modules.push(line);
  }
  return modules;
}

/** 读格式信息（15 位，BCH(15,5)，两次冗余取对的那个） */
export function readFormat(modules, size) {
  const pick = (coords) => {
    let bits = 0;
    for (let i = 0; i < 15; i++) {
      const [r, c] = coords[i];
      bits |= (modules[r][c] & 1) << i;
    }
    return bits;
  };
  const copyA = [];
  for (let i = 0; i <= 5; i++) copyA[i] = [8, i];
  copyA[6] = [8, 7];
  copyA[7] = [8, 8];
  copyA[8] = [7, 8];
  for (let i = 9; i <= 14; i++) copyA[i] = [14 - i, 8];

  const copyB = [];
  for (let i = 0; i <= 7; i++) copyB[i] = [size - 1 - i, 8];
  for (let i = 8; i <= 14; i++) copyB[i] = [8, size - 15 + i];

  for (const coords of [copyA, copyB]) {
    const raw = pick(coords);
    // 15 位最多纠 3 位错：直接试遍 32 种数据位，取汉明距离最小的
    let best = null;
    for (let d = 0; d < 32; d++) {
      const enc = encodeFormat(d);
      const dist = hamming15(enc, raw);
      if (!best || dist < best.dist) best = { d, dist };
    }
    if (best && best.dist <= 3) {
      return { ecLevel: EC_BITS_TO_LEVEL[best.d >> 3], mask: best.d & 7 };
    }
  }
  return null;
}

function encodeFormat(data) {
  let rem = data << 10;
  const g = 0x537;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * g);
  return (((data << 10) | (rem & 0x3ff)) ^ 0x5412) & 0x7fff;
}

function hamming15(a, b) {
  let x = (a ^ b) & 0x7fff;
  let n = 0;
  while (x) { n += x & 1; x >>= 1; }
  return n;
}

/** 按锯齿顺序读出码字，并去掉掩码 */
export function readCodewords(modules, version, mask) {
  const size = modules.length;
  const { reserved } = reservedMap(version);
  const fn = MASK_FNS[mask];
  const bits = [];
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let i = 0; i < size; i++) {
      const row = upward ? size - 1 - i : i;
      for (const c of [col, col - 1]) {
        if (reserved[row][c]) continue;
        let bit = modules[row][c] & 1;
        if (fn(row, c)) bit ^= 1;
        bits.push(bit);
      }
    }
    upward = !upward;
  }
  const codewords = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
    codewords.push(v);
  }
  return codewords;
}

/** 反交错 + RS 纠错，得到数据码字 */
export function correctBlocks(codewords, version, ecLevel) {
  const t = EC_TABLE[ecLevel]?.[version];
  if (!t) return null;
  const [ecLen, d1, n1, d2, n2] = t;
  const blocks = [];
  for (let i = 0; i < n1; i++) blocks.push({ data: new Array(d1), ec: new Array(ecLen), dl: d1 });
  for (let i = 0; i < n2; i++) blocks.push({ data: new Array(d2), ec: new Array(ecLen), dl: d2 });

  let p = 0;
  const maxData = Math.max(d1, n2 ? d2 : 0);
  for (let i = 0; i < maxData; i++) {
    for (const b of blocks) if (i < b.dl) b.data[i] = codewords[p++];
  }
  for (let i = 0; i < ecLen; i++) {
    for (const b of blocks) b.ec[i] = codewords[p++];
  }

  const out = [];
  for (const b of blocks) {
    const whole = [...b.data, ...b.ec];
    const fixed = rsDecode(whole, ecLen);
    if (!fixed) return null;
    out.push(...fixed.slice(0, b.dl));
  }
  return out;
}

/** 解析数据位流（字节模式 / 数字 / 字母数字，够扫码用） */
export function parsePayload(data) {
  const bits = [];
  for (const b of data) for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
  let p = 0;
  const take = (n) => {
    let v = 0;
    for (let i = 0; i < n; i++) v = (v << 1) | (bits[p++] || 0);
    return v;
  };
  const out = [];
  while (p + 4 <= bits.length) {
    const mode = take(4);
    if (mode === 0) break;                       // 结束符
    if (mode === 4) {                            // 字节模式
      const len = take(8);
      const bytes = [];
      for (let i = 0; i < len && p + 8 <= bits.length; i++) bytes.push(take(8));
      out.push(Buffer.from(bytes).toString('utf8'));
    } else if (mode === 2) {                     // 字母数字
      const len = take(9);
      const AL = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
      let s = '';
      for (let i = 0; i + 2 <= len; i += 2) {
        const v = take(11);
        s += AL[Math.floor(v / 45)] + AL[v % 45];
      }
      if (len % 2) s += AL[take(6)];
      out.push(s);
    } else if (mode === 1) {                     // 数字
      const len = take(10);
      let s = '';
      let i = 0;
      for (; i + 3 <= len; i += 3) s += String(take(10)).padStart(3, '0');
      if (len - i === 2) s += String(take(7)).padStart(2, '0');
      else if (len - i === 1) s += String(take(4));
      out.push(s);
    } else break;
  }
  return out.join('');
}

/* ---------------- 对外入口 ---------------- */

/**
 * @param {Uint8Array} gray 灰度像素，行优先
 * @param {number} width
 * @param {number} height
 * @returns {{text:string, version:number, ecLevel:string, mask:number}|null}
 */
export function decodeQR(gray, width, height) {
  /*
   * 二值化窗口扫一遍。
   *
   * 手机那一帧里二维码有多大完全不可控（近一点每格 40px，远一点每格 2px），
   * 而「局部均值」的窗口只有和格子尺寸匹配时才不掉块。所以干脆按几个窗口各跑一遍，
   * 谁先解出来算谁的 —— 解不出来才会走下一个，正常情况第一个或第二个就中了。
   * 另外补一个全局阈值（Otsu）兜底，应付整幅图光照很均匀的情况。
   */
  const wins = [];
  const base = Math.max(12, Math.round(Math.min(width, height) / 22));
  for (const w0 of [17, 25, 37, 51, 71, 101, base, base * 2]) {
    const v = Math.max(11, Math.round(w0) | 1);
    if (!wins.includes(v)) wins.push(v);
  }
  for (const win of wins) {
    const got = decodeBinary(binarize(gray, width, height, win), width, height);
    if (got) return got;
  }
  const t = otsu(gray);
  const bin = new Uint8Array(width * height);
  for (let i = 0; i < bin.length; i++) bin[i] = gray[i] < t ? 1 : 0;
  return decodeBinary(bin, width, height);
}

/** 全局阈值（大津法）：给光照均匀的整幅图兜底 */
function otsu(gray) {
  const hist = new Int32Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0; let wB = 0; let best = 0; let thr = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; thr = i; }
  }
  return thr;
}

/** 已经二值化好的图：找定位图案 → 试解码 */
function decodeBinary(bin, width, height) {
  let finders = findFinders(bin, width, height);
  if (finders.length < 3) return null;

  /*
   * ⚠️ 下面挑「三个真定位图案」是三重循环（O(n³)）。噪声图 / 满屏文字的截图
   *    能吐出成千上万个假图案，不设上限的话光循环就能把进程的内存吃光
   *    （实测：纯噪声 720×1280 让 node 直接 out of memory）。
   *    真的定位图案一定是候选里被命中次数最多的那几个（一整片 3×3 实心块），
   *    所以按 n 排序取前 24 个，够用且封顶。
   */
  const MAX_FINDERS = 24;
  if (finders.length > MAX_FINDERS) {
    finders = finders.slice().sort((a, b) => b.n - a.n).slice(0, MAX_FINDERS);
  }

  /*
   * 挑出真正的三个定位图案。
   *
   * ⚠️ 不能只挑「张得最大」的那三个：版本高一点时，对齐图案和数据区里的花纹
   *    也会凑出 1:1:3:1:1 的形状（实测 v5 能找出 8 个候选），
   *    随便挑三个最远的组合会拼出一个假的「二维码」，然后一路失败。
   *    真正的三个定位图案必须满足：两条直角边等长、斜边 = 边长×√2、三个格子大小一致。
   */
  const trios = [];
  for (let i = 0; i < finders.length; i++) {
    for (let j = i + 1; j < finders.length; j++) {
      for (let k = j + 1; k < finders.length; k++) {
        const trio = orderFinders([finders[i], finders[j], finders[k]]);
        if (!trio) continue;
        const r1 = Math.hypot(trio.tr.x - trio.tl.x, trio.tr.y - trio.tl.y);
        const r2 = Math.hypot(trio.bl.x - trio.tl.x, trio.bl.y - trio.tl.y);
        const hyp = Math.hypot(trio.tr.x - trio.bl.x, trio.tr.y - trio.bl.y);
        if (r1 < 8 || r2 < 8) continue;

        const legAvg = (r1 + r2) / 2;
        const legDiff = Math.abs(r1 - r2) / legAvg;                       // 两条直角边应等长
        const hypErr = Math.abs(hyp - legAvg * Math.SQRT2) / (legAvg * Math.SQRT2);  // 应为 √2 倍
        const mods = [trio.tl.module, trio.tr.module, trio.bl.module];
        const modDiff = (Math.max(...mods) - Math.min(...mods)) / (mods.reduce((a, b) => a + b, 0) / 3);
        // 直角边的几何关系卡得严（假图案凑不出等边直角），
        // 格子大小的估计本来就毛躁（实测能差 15%），阈值放宽一点
        if (legDiff > 0.22 || hypErr > 0.22 || modDiff > 0.6) continue;
        trios.push({ trio, r1, r2, module: median(mods), score: legAvg * (1 - legDiff) * (1 - hypErr) * (1 - modDiff) });
      }
    }
  }
  trios.sort((a, b) => b.score - a.score);
  if (!trios.length) return null;

  // 最好的那组解不出来就试下一组（最多试 4 组，避免在噪声图上耗太久）
  for (const cand of trios.slice(0, 4)) {
    const got = tryDecode(bin, width, height, cand);
    if (got) return got;
  }
  return null;
}

function tryDecode(bin, width, height, cand) {
  const { trio, r1, r2, module: moduleEst } = cand;
  const legAvg = (r1 + r2) / 2;

  /*
   * 版本（=尺寸）由「边长 ÷ 格子大小」推出来，而格子大小是估的，可能差一点。
   * 差一点就会算出错误的尺寸，后面全白搭。所以把几个来源的估计都试一遍，
   * 每个再取 floor/round/ceil —— 错尺寸几乎一定过不了格式信息，试错很便宜。
   */
  const modGuesses = [trio.tl.module, trio.tr.module, trio.bl.module, moduleEst, legAvg / 14];
  const dims = new Set();
  for (const mod of modGuesses) {
    if (!mod || mod <= 0 || !isFinite(mod)) continue;
    const raw = legAvg / mod + 7;
    for (const d of [Math.round(raw), Math.floor(raw), Math.ceil(raw)]) {
      let dim = d;
      dim += (4 - ((dim - 17) % 4)) % 4;             // 合法尺寸是 21 + 4k
      const version = (dim - 17) / 4;
      if (version >= 1 && version <= 20) dims.add(dim);
    }
  }

  /*
   * 三个定位图案的实测中心会往码中心偏一点点（阈值化把暗块边缘啃掉了一圈），
   * 偏 1% 在高版本上就会让最外侧的格子错位大半格。
   * 所以围绕码中心按几个「外扩系数」把锚点推回去，挑能过校验的那组。
   * 格式信息（BCH 校验）+ RS 纠错是很强的判据，基本不会误判，所以这里敢试错。
   */
  const cx = (trio.tr.x + trio.bl.x) / 2;
  const cy = (trio.tr.y + trio.bl.y) / 2;
  const EXPANDS = [1, 1.05, 1.09, 1.13, 0.96];
  const shift = (p, k) => ({ x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k });

  for (const dim of dims) {
    const version = (dim - 17) / 4;
    for (const k of EXPANDS) {
      const modPx = (legAvg * k) / (dim - 7);
      const modules = sampleModules(bin, width, height, dim,
        shift(trio.tl, k), shift(trio.tr, k), shift(trio.bl, k), modPx);
      const fmt = readFormat(modules, dim);
      if (!fmt) continue;
      const codewords = readCodewords(modules, version, fmt.mask);
      const data = correctBlocks(codewords, version, fmt.ecLevel);
      if (!data) continue;
      const text = parsePayload(data);
      if (text) return { text, version, ecLevel: fmt.ecLevel, mask: fmt.mask };
    }
  }
  return null;
}
