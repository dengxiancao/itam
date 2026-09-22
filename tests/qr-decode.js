/**
 * 二维码解码器回环测试：拿自己的编码器生成 → 光栅化成灰度图 → 解码 → 比对
 * 还模拟了手机拍屏幕的几种劣化：缩放、模糊、倾斜、光照不均、噪声、摩尔纹
 */
import { qrcodeEncode } from '../server/lib/qrcode.js';
import { decodeQR, rsDecode, binarize } from '../server/lib/qrdecode.js';

/** 把模块矩阵按 scale 放大成灰度图（quiet 是静默区模块数） */
function rasterize(modules, scale, quiet = 4, bg = 255, fg = 0) {
  const n = modules.length;
  const size = (n + quiet * 2) * scale;
  const gray = new Uint8Array(size * size).fill(bg);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!modules[y][x]) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const px = (x + quiet) * scale + dx;
          const py = (y + quiet) * scale + dy;
          gray[py * size + px] = fg;
        }
      }
    }
  }
  return { gray, size };
}

/** 双线性缩放（模拟「拍得远 / 拍得近」） */
function rescale(gray, w, h, nw, nh) {
  const out = new Uint8Array(nw * nh);
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      const sx = (x + 0.5) * w / nw - 0.5;
      const sy = (y + 0.5) * h / nh - 0.5;
      const x0 = Math.max(0, Math.floor(sx)); const y0 = Math.max(0, Math.floor(sy));
      const x1 = Math.min(w - 1, x0 + 1); const y1 = Math.min(h - 1, y0 + 1);
      const fx = Math.max(0, Math.min(1, sx - x0)); const fy = Math.max(0, Math.min(1, sy - y0));
      const a = gray[y0 * w + x0] * (1 - fx) + gray[y0 * w + x1] * fx;
      const b = gray[y1 * w + x0] * (1 - fx) + gray[y1 * w + x1] * fx;
      out[y * nw + x] = Math.round(a * (1 - fy) + b * fy);
    }
  }
  return out;
}

/** 3×3 均值模糊（模拟失焦） */
function blur(gray, w, h) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0; let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const px = x + dx; const py = y + dy;
          if (px < 0 || py < 0 || px >= w || py >= h) continue;
          s += gray[py * w + px]; n++;
        }
      }
      out[y * w + x] = Math.round(s / n);
    }
  }
  return out;
}

/** 小幅旋转（模拟手持倾斜） */
function rotate(gray, w, h, deg) {
  const rad = deg * Math.PI / 180;
  const cos = Math.cos(rad); const sin = Math.sin(rad);
  const cx = w / 2; const cy = h / 2;
  const out = new Uint8Array(w * h).fill(255);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx; const dy = y - cy;
      const sx = Math.round(cx + dx * cos + dy * sin);
      const sy = Math.round(cy - dx * sin + dy * cos);
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      out[y * w + x] = gray[sy * w + sx];
    }
  }
  return out;
}

/** 光照不均（一边亮一边暗，拍屏幕很常见） */
function gradient(gray, w, h, dark = 0.55) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = 1 - dark * (x / w) * 0.6 - dark * (y / h) * 0.6;
      out[y * w + x] = Math.max(0, Math.min(255, Math.round(gray[y * w + x] * k + 255 * (1 - k) * 0.6)));
    }
  }
  return out;
}

/** 噪声 */
function noise(gray, w, h, amp = 18) {
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const out = Uint8Array.from(gray);
  for (let i = 0; i < out.length; i++) out[i] = Math.max(0, Math.min(255, out[i] + Math.round((rnd() - 0.5) * 2 * amp)));
  return out;
}

let pass = 0; let fail = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log('  \x1b[32m✔\x1b[0m ' + name); }
  catch (e) { fail++; console.log('  \x1b[31m✘\x1b[0m ' + name + '\n      ' + e.message); }
};
const assert = (c, m) => { if (!c) throw new Error(m || '断言失败'); };

console.log('\n=== 二维码解码器 ===\n');

const SAMPLES = [
  ['MON-2026-0010', 'M'],
  ['YLX2K4K1', 'M'],
  ['ITAM:PC-2026-0051', 'L'],
  ['https://itam.example.com:12345/m/#/device/820c5898-de4d-4688-80d9-23a56711b593', 'L'],
];

t('干净的图：四种内容都能解回来', () => {
  for (const [text, ec] of SAMPLES) {
    const { modules } = qrcodeEncode(text, ec);
    const { gray, size } = rasterize(modules, 8);
    const r = decodeQR(gray, size, size);
    assert(r, `解不出：${text}`);
    assert(r.text === text, `内容不符：期望 ${text}，得到 ${r.text}`);
  }
});

t('缩放到不同大小（模拟远近）', () => {
  const text = 'MON-2026-0010';
  const { modules } = qrcodeEncode(text, 'M');
  for (const scale of [3, 5, 10]) {
    const { gray, size } = rasterize(modules, scale);
    const r = decodeQR(gray, size, size);
    assert(r && r.text === text, `scale=${scale} 解不出`);
  }
});

t('先放大再缩小（模拟相机把屏幕拍小）', () => {
  const text = 'MON-2026-0010';
  const { modules } = qrcodeEncode(text, 'M');
  const { gray, size } = rasterize(modules, 12);
  for (const k of [0.8, 0.5, 0.35]) {
    const n = Math.round(size * k);
    const g2 = rescale(gray, size, size, n, n);
    const r = decodeQR(g2, n, n);
    assert(r && r.text === text, `缩到 ${(k * 100).toFixed(0)}% 解不出`);
  }
});

t('轻微失焦（模糊）', () => {
  const text = 'MON-2026-0010';
  const { modules } = qrcodeEncode(text, 'M');
  const { gray, size } = rasterize(modules, 8);
  const g2 = blur(blur(gray, size, size), size, size);
  const r = decodeQR(g2, size, size);
  assert(r && r.text === text, '模糊两遍就解不出');
});

t('手持倾斜 ±12°', () => {
  const text = 'MON-2026-0010';
  const { modules } = qrcodeEncode(text, 'M');
  const { gray, size } = rasterize(modules, 8, 6);
  for (const deg of [-12, -6, 6, 12]) {
    const g2 = rotate(gray, size, size, deg);
    const r = decodeQR(g2, size, size);
    assert(r && r.text === text, `旋转 ${deg}° 解不出`);
  }
});

t('光照不均（拍屏幕一半亮一半暗）', () => {
  const text = 'MON-2026-0010';
  const { modules } = qrcodeEncode(text, 'M');
  const { gray, size } = rasterize(modules, 8, 6);
  const g2 = gradient(gray, size, size, 0.6);
  const r = decodeQR(g2, size, size);
  assert(r && r.text === text, '光照不均就解不出');
});

t('噪声 + 模糊 + 倾斜 一起上', () => {
  const text = 'YLX2K4K1';
  const { modules } = qrcodeEncode(text, 'M');
  let { gray, size } = rasterize(modules, 9, 6);
  gray = noise(gray, size, size, 16);
  gray = blur(gray, size, size);
  gray = rotate(gray, size, size, 8);
  gray = gradient(gray, size, size, 0.4);
  const r = decodeQR(gray, size, size);
  assert(r && r.text === text, '组合劣化后解不出');
});

t('二维码只占画面一小块（模拟取景框截图）', () => {
  const text = 'MON-2026-0010';
  const { modules } = qrcodeEncode(text, 'M');
  const { gray, size } = rasterize(modules, 6, 5);
  // 贴到一张大画布中间，模拟「屏幕上的一块」
  const W = 640; const H = 640;
  const canvas = new Uint8Array(W * H).fill(210);
  const ox = Math.round((W - size) / 2); const oy = Math.round((H - size) / 2);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) canvas[(oy + y) * W + ox + x] = gray[y * size + x];
  const r = decodeQR(canvas, W, H);
  assert(r && r.text === text, '大画面里的小二维码解不出');
});

t('RS 纠错：往码字里塞错也能纠回来', () => {
  const { modules } = qrcodeEncode('MON-2026-0010', 'M');
  // 直接测 rsDecode：构造一个已知块，翻几个字节
  const { rsEncode } = { rsEncode: null };
  // 用编码器同款生成方式手工造一块
  const EXP2 = []; // 不需要，直接用 qrcode 的 rsEncode 不可导出，这里改用解码器自校验
  // 简化：整图注入错误点，验证整体仍能解出
  const n = modules.length;
  const broken = modules.map((r) => Uint8Array.from(r));
  broken[10][10] ^= 1; broken[11][12] ^= 1; broken[13][9] ^= 1;
  const { gray, size } = rasterize(broken, 8, 4);
  const r = decodeQR(gray, size, size);
  assert(r && r.text === 'MON-2026-0010', '注入 3 个错误点后解不出');
});

t('不是二维码的图应该返回 null（不能瞎猜）', () => {
  const W = 200; const H = 200;
  const gray = new Uint8Array(W * H);
  for (let i = 0; i < gray.length; i++) gray[i] = (i * 37) % 256;
  assert(decodeQR(gray, W, H) === null, '噪声图不该解出东西');
  const blank = new Uint8Array(W * H).fill(255);
  assert(decodeQR(blank, W, H) === null, '全白图不该解出东西');
});

console.log(`\n=== 结果：${pass} 通过 / ${fail} 失败 ===`);
if (fail) process.exit(1);
