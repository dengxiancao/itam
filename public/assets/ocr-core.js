/* ==================================================================== *
 * 识别核心 —— 移动端（m.js）与管理端（admin.js）共用的一套东西。
 *
 * 为什么单独一个文件：手机「从相册批量识别」和电脑「从资源管理器批量录入」
 * 走的是**同一条链路**（压缩 → 灰度拉伸 → 判文字走向 → 0/90/180/270 轮着试 →
 * 读到就停 → 归档三份图）。这条链路上每个坑都踩过（旋转要转画布而不是只改
 * 尺寸、重试趟必须带 save=0、图地址只认第一趟），抄成两份迟早会分叉 ——
 * 一份修好了另一份还是坏的，而且坏得静默。
 *
 * 约束：
 *   1. 零依赖，只用浏览器内置 API（canvas / createImageBitmap / fetch / FormData）。
 *   2. **导入期不碰 DOM**（不在顶层读 document/window）—— 测试夹具是在
 *      建好 DOM 桩之后才 import 的，顶层乱摸会让整个套件加载失败。
 *   3. 不认识「哪个页面在调我」：登录过期跳哪、用谁的名字记审计，都由调用方传进来。
 * ==================================================================== */

/** 一次识别产出三份图的尺寸上限（最长边） */
export const OCR_MAX_SIDE = 2200;      // 送识别：铭牌小字要够清楚，2200 比 1600 明显更准
export const ORIGINAL_MAX_SIDE = 4096; // 归档原图
export const THUMB_MAX_SIDE = 320;     // 缩略图（导出 Excel 嵌单元格）
/** 手机相册原图常有十几 MB；超过这个就不传原图，拿压缩图当原图，避免上传卡死 */
export const ORIGINAL_MAX_BYTES = 20 * 1024 * 1024;

/** 单张识别最长等多久（四个角度都试一遍的兜底） */
export const OCR_TIMEOUT_MS = 120000;

/* ==================== 图片处理 ==================== */

/**
 * 等比缩放成 JPEG Blob，可只取其中的一块（crop 用源像素坐标）。
 * 手机原图动辄 4000×3000、好几 MB，直接 toDataURL 会卡死主线程且上传极慢。
 * maxSide 只做「不超过」限制：传 4096 时若源图只有 1920 宽，就保持 1920 原样输出。
 */
export function downscaleToBlob(src, maxSide = 1600, quality = 0.85, crop = null) {
  return new Promise((resolve) => {
    try {
      const sw = src.videoWidth || src.naturalWidth || src.width || 0;
      const sh = src.videoHeight || src.naturalHeight || src.height || 0;
      if (!sw || !sh) { resolve(null); return; }
      const sx = crop ? Math.max(0, Math.min(crop.x, sw - 1)) : 0;
      const sy = crop ? Math.max(0, Math.min(crop.y, sh - 1)) : 0;
      const cw = crop ? Math.max(1, Math.min(crop.w, sw - sx)) : sw;
      const ch = crop ? Math.max(1, Math.min(crop.h, sh - sy)) : sh;

      const scale = Math.min(1, maxSide / Math.max(cw, ch));
      const w = Math.max(1, Math.round(cw * scale));
      const h = Math.max(1, Math.round(ch * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(src, sx, sy, cw, ch, 0, 0, w, h);
      if (typeof canvas.toBlob !== 'function') { resolve(null); return; }
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
    } catch {
      resolve(null);
    }
  });
}

/**
 * 把 Blob 读成可画进 canvas 的图，并给一个 release() 用来释放 objectURL。
 * 读不出来返回 null（调用方给一句「无法读取该图片」即可，不要抛）。
 */
export function loadImageBlob(blob) {
  return new Promise((resolve) => {
    if (typeof Image !== 'function' || typeof URL?.createObjectURL !== 'function') { resolve(null); return; }
    const url = URL.createObjectURL(blob);
    const release = () => { try { URL.revokeObjectURL(url); } catch { /* ignore */ } };
    const img = new Image();
    img.onload = () => resolve({ img, release });
    img.onerror = () => { release(); resolve(null); };
    img.src = url;
  });
}

/**
 * 从一张图（相册选的照片 / 资源管理器选的文件）产出三份图：**不裁**。
 * 这里没有取景框，用户选的图本身就是他想要的那张；
 * 按屏幕比例硬裁一条反而会把铭牌切掉。
 */
export async function shootFromImage(img, file) {
  const [image, thumb] = await Promise.all([
    downscaleToBlob(img, OCR_MAX_SIDE, 0.92),
    downscaleToBlob(img, THUMB_MAX_SIDE, 0.7),
  ]);
  const original = file && file.size <= ORIGINAL_MAX_BYTES ? file : image;
  return { image, original, thumb };
}

/**
 * 送识别之前先做一次「灰度 + 对比度拉伸」。
 *
 * 铭牌大多是白底黑字，但拍摄常偏灰、反光、曝光不均；
 * 拉伸一下直方图能让字和底分得更开，对小型文字的识别率提升很明显。
 * 只影响送去 OCR 的那张，归档的原图不动。
 */
export function enhanceForOcr(blob) {
  return new Promise((resolve) => {
    if (typeof createImageBitmap !== 'function') { resolve(blob); return; }
    createImageBitmap(blob).then((bmp) => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = bmp.width;
        canvas.height = bmp.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bmp, 0, 0);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = img.data;

        // 先算灰度直方图，取 2% / 98% 分位当黑白点
        const hist = new Uint32Array(256);
        for (let i = 0; i < d.length; i += 4) {
          const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0;
          hist[g]++;
        }
        const total = d.length / 4;
        let lo = 0; let hi = 255; let acc = 0;
        for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= total * 0.02) { lo = v; break; } }
        acc = 0;
        for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= total * 0.02) { hi = v; break; } }
        if (hi - lo < 24) { lo = 0; hi = 255; }   // 本来就没什么对比度，别硬拉
        const span = Math.max(1, hi - lo);

        for (let i = 0; i < d.length; i += 4) {
          let g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
          g = ((g - lo) / span) * 255;
          g = g < 0 ? 0 : g > 255 ? 255 : g;
          d[i] = d[i + 1] = d[i + 2] = g;
        }
        ctx.putImageData(img, 0, 0);
        bmp.close?.();
        if (typeof canvas.toBlob !== 'function') { resolve(blob); return; }
        canvas.toBlob((b) => resolve(b && b.size ? b : blob), 'image/jpeg', 0.92);
      } catch {
        resolve(blob);
      }
    }).catch(() => resolve(blob));
  });
}

/* ============ 方向容错：倒着 / 横着 / 拍歪了也要能认 ============ *
 * 铭牌经常是倒着的（笔记本底部的标签相对取景方向就是反的），整幅转过的照片
 * 识别模型基本读不出 SN。这里判一下「文字是横排还是竖排」，再按 0/90/180/270
 * 轮着试，任一趟读出东西就停。
 * 正常照片第一趟就命中，**不会多调一次识别服务、也不会多等**。
 * ============================================================== */

/** 墨量投影的两轴起伏。文字成行 → 该轴上是「行/空隙」交替，起伏大；另一轴平坦。 */
export function inkProfileCV(gray, w, h) {
  const row = new Float64Array(h);
  const col = new Float64Array(w);
  for (let y = 0; y < h; y++) {
    const base = y * w;
    let sum = 0;
    for (let x = 0; x < w; x++) {
      const ink = 255 - gray[base + x];
      sum += ink;
      col[x] += ink;
    }
    row[y] = sum;
  }
  const cv = (arr, n) => {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += arr[i];
    const mean = sum / n;
    if (!(mean > 0)) return 0;
    let v = 0;
    for (let i = 0; i < n; i++) { const d = arr[i] - mean; v += d * d; }
    return Math.sqrt(v / n) / mean;
  };
  return { row: cv(row, h), col: cv(col, w) };
}

/**
 * 文字走向：'h' 横排 / 'v' 竖排，ratio 是判据强度（1 = 分不出来）。
 * 只用来决定「先试哪个角度」，判错也只是多试一趟，不会改坏照片。
 */
export function textAxisOf(gray, w, h) {
  const none = { axis: 'h', ratio: 1 };
  if (!gray || !w || !h || gray.length < w * h) return none;
  const s = inkProfileCV(gray, w, h);
  // 两边都太平（画面基本没字/没对比）→ 不给意见
  if (s.row < 0.15 && s.col < 0.15) return none;
  return s.row >= s.col
    ? { axis: 'h', ratio: s.row / Math.max(s.col, 1e-6) }
    : { axis: 'v', ratio: s.col / Math.max(s.row, 1e-6) };
}

/** 重试顺序：横排先试倒置 180（最常见），竖排先试转 90/270。90 的三种必全覆盖。 */
export function retryAngles(axis) {
  return axis === 'v' ? [90, 270, 180] : [180, 90, 270];
}

/** 这一趟算不算「读出来了」：有 SN 最好；或者品牌 + 型号都读到了 */
export function usableResult(r) {
  if (!r) return false;
  if (r.sn) return true;
  return !!(r.brand && r.model);
}

/** 旋转 Blob（只走 90 的整数倍）。失败就原样返回，不阻断识别。 */
export function rotateBlob(blob, angle) {
  return new Promise((resolve) => {
    if (!angle || typeof createImageBitmap !== 'function') { resolve(blob); return; }
    createImageBitmap(blob).then((bmp) => {
      try {
        const swap = angle % 180 !== 0;
        const canvas = document.createElement('canvas');
        canvas.width = swap ? bmp.height : bmp.width;
        canvas.height = swap ? bmp.width : bmp.height;
        const ctx = canvas.getContext('2d');
        // ⚠️ 画布尺寸和变换是两件事：只改 width/height 不 rotate，画面会转到画布外面去
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((angle * Math.PI) / 180);
        ctx.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
        bmp.close?.();
        if (typeof canvas.toBlob !== 'function') { resolve(blob); return; }
        canvas.toBlob((b) => resolve(b && b.size ? b : blob), 'image/jpeg', 0.92);
      } catch { resolve(blob); }
    }).catch(() => resolve(blob));
  });
}

/** 取灰度小图（判方向用，不用清晰）。拿不到就返回 null，走「不判方向」的默认路径。 */
export function grayOfBlob(blob, maxSide = 480) {
  return new Promise((resolve) => {
    if (typeof createImageBitmap !== 'function') { resolve(null); return; }
    createImageBitmap(blob).then((bmp) => {
      try {
        const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
        const w = Math.max(16, Math.round(bmp.width * scale));
        const h = Math.max(16, Math.round(bmp.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(bmp, 0, 0, w, h);
        const d = ctx.getImageData(0, 0, w, h).data;
        const gray = new Uint8Array(w * h);
        for (let i = 0, j = 0; i < gray.length; i++, j += 4) {
          gray[i] = (d[j] * 299 + d[j + 1] * 587 + d[j + 2] * 114) / 1000 | 0;
        }
        bmp.close?.();
        resolve({ gray, w, h });
      } catch { resolve(null); }
    }).catch(() => resolve(null));
  });
}

/** 综合置信度：品牌与 SN 置信度的平均（都为 0 时返回 0，不是 NaN） */
export function overallScore(r) {
  const vals = [r?.brand_confidence, r?.sn_confidence].map(Number).filter((v) => v > 0);
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/* ==================== 识别 ==================== */

/**
 * 发一趟识别。`first` 那趟才带原图/缩略图并落盘；
 * 重试那几趟只是同一张图转个方向，带 `save=0` 让服务端跳过归档，别刷出一堆重复文件。
 */
export async function postOcr(blob, first, opts = {}) {
  const { original = null, thumb = null, operator = '', loginNext = '/m', signal } = opts;
  const fd = new FormData();
  fd.append('image', blob, 'nameplate.jpg');
  if (operator) fd.append('operator', operator);   // 每一趟都要，审计日志才带得上录入人
  if (first) {
    if (original) fd.append('original', original, 'original.jpg');
    if (thumb) fd.append('thumb', thumb, 'thumb.jpg');
  } else {
    fd.append('save', '0');
  }
  const res = await fetch('/api/ocr', { method: 'POST', body: fd, signal });
  if (res.status === 401) {
    location.href = '/login?next=' + encodeURIComponent(loginNext) + '&expired=1';
    const e = new Error('登录已过期');
    e.redirected = true;
    throw e;
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || body?.detail || `识别失败（HTTP ${res.status}）`);
  return body?.data ?? body;
}

/**
 * 识别一张图，自带方向容错。
 *
 * @param {Blob} imageBlob  识别用（已压缩）图
 * @param {object} opts
 *   original / thumb  Blob|null —— 只在第一趟上传，服务端一起归档
 *   operator          录入人（写审计日志）
 *   loginNext         登录过期后跳回哪个页面（手机 '/m'、管理端 '/'）
 *   timeout           整趟超时（毫秒）
 *   signal            外部取消信号
 *   onStage(msg)      进度文案回调（「正在转正 180° 再试…」这类）
 * @returns {Promise<object>} 识别结果，图片地址沿用第一趟；rotate_angle 是最终采用的角度
 */
export async function recognizeOne(imageBlob, opts = {}) {
  const {
    original = null, thumb = null, operator = '',
    loginNext = '/m', timeout = OCR_TIMEOUT_MS, signal = null, onStage = null,
  } = opts;
  const stage = (m) => { if (typeof onStage === 'function') onStage(m); };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  const onAbort = () => ctrl.abort();
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener?.('abort', onAbort, { once: true });
  }

  try {
    // 送去识别的那张先做灰度 + 对比度拉伸：铭牌小字会清楚很多
    const ocrBlob = (await enhanceForOcr(imageBlob)) || imageBlob;

    // 判文字走向 → 决定先用哪个角度。拿不到灰度就按「先试 180」走
    const probe = await grayOfBlob(ocrBlob);
    const axis = probe ? textAxisOf(probe.gray, probe.w, probe.h) : { axis: 'h', ratio: 1 };
    const angles = [0, ...retryAngles(axis.axis)];

    let best = null;
    let bestAngle = 0;
    let firstPaths = null;      // 图片地址只认第一趟的：那才是用户真正拍下的那张
    for (let i = 0; i < angles.length; i++) {
      const angle = angles[i];
      const blob = angle === 0 ? ocrBlob : await rotateBlob(ocrBlob, angle);
      if (i > 0) stage(`没读出内容，正在把照片转正 ${angle}° 再试一次…`);
      const r = await postOcr(blob, i === 0, { original, thumb, operator, loginNext, signal: ctrl.signal });
      if (i === 0) firstPaths = { image_path: r.image_path, original_path: r.original_path, thumb_path: r.thumb_path };
      if (!best || overallScore(r) > overallScore(best)) { best = r; bestAngle = angle; }
      void usableResult(r);
    }

    const r = { ...best, ...firstPaths };
    if (bestAngle) r.note = [r.note, `照片是转过来的，已自动旋转 ${bestAngle}° 后识别`].filter(Boolean).join('；');
    r.rotate_angle = bestAngle;
    return r;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', onAbort);
  }
}

/**
 * 一步到位：把用户选的一个文件（相册里的照片 / 资源管理器里的图片）识别出来。
 * 内部负责「读图 → 出三份 → 识别 → 释放 objectURL」，调用方拿到的就是结果。
 */
export async function recognizeFile(file, opts = {}) {
  const loaded = await loadImageBlob(file);
  if (!loaded) throw new Error('无法读取该图片');
  try {
    const shots = await shootFromImage(loaded.img, file);
    if (!shots.image) throw new Error('图片处理失败，请换一张');
    return await recognizeOne(shots.image, { ...opts, original: shots.original, thumb: shots.thumb });
  } finally {
    loaded.release();
  }
}

/* ==================== 串行队列 ==================== */

/**
 * 一件一件地跑，**绝不做并发**。
 *
 * 为什么必须串行：GLM-4.6V-Flash 这类免费视觉模型限制的是**并发数**（国际站 1、
 * 国内站 3），不是调用次数。批量并发上传会被上游直接拒掉，表现出来是
 * 「模型解析失败」，而且很难查是哪里出的问题。
 *
 * 单件失败**不中断整批**（一张读不出来不该让其余九张白等），
 * 但登录过期（`err.redirected`）是例外 —— 再跑下去每一件都会失败。
 *
 * @param {Array} items   待处理项（原地打标记用）
 * @param {Function} worker (item, index) => Promise
 * @param {object} opts
 *   shouldContinue()  返回 false 就停下（用户关了页面/点了中止）
 *   onItem(item, index)  每件开始前
 *   onDone(item, index, err)  每件结束后
 * @returns {{total:number, done:number, ok:number, failed:number, stopped:boolean, aborted:boolean}}
 */
export async function runSerial(items, worker, opts = {}) {
  const { shouldContinue = null, onItem = null, onDone = null, signal = null } = opts;
  const total = items.length;
  let done = 0; let ok = 0; let failed = 0; let stopped = false; let aborted = false;

  for (let i = 0; i < total; i++) {
    if (signal?.aborted) { stopped = true; aborted = true; break; }
    if (typeof shouldContinue === 'function' && !shouldContinue()) { stopped = true; break; }
    const item = items[i];
    onItem?.(item, i);
    let err = null;
    try {
      await worker(item, i);
      ok++;
    } catch (e) {
      err = e;
      failed++;
      item.error = e?.message || String(e);
      // 登录过期：整批停下，不然每一件都在同一个坑里再摔一次
      if (e?.redirected) { done++; onDone?.(item, i, e); stopped = true; aborted = true; break; }
    }
    done++;
    onDone?.(item, i, err);
  }
  return { total, done, ok, failed, stopped, aborted };
}
