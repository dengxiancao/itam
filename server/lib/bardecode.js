/**
 * 一维条码解码器（零依赖，纯 JS）。
 *
 * 为什么需要它：前端 `BarcodeDetector` 在「对着显示器/贴纸拍」时经常整帧失手
 * （摩尔纹 + 视频压缩 + 浏览器内部缩放），而二维码早就有服务端兜底（`qrdecode.js`）。
 * 一维条码此前**完全没有兜底**，所以用户反馈「二维码能扫、条码永远扫不出来」。
 *
 * 支持：Code 128（A/B/C 三张码表，自动选最优）与 Code 39。
 * 这两样覆盖了资产标签上的绝大多数一维码；EAN/UPC 是定长数字码，结构不同，暂不实现。
 *
 * ⚠️ 一维解码的关键不是「把图放大」，而是**保住黑白边沿**：
 *    码里的每一根条只有 1~4 px，任何双线性插值都会把它抹成灰阶过渡，
 *    而本解码器靠「两个相邻像素一个黑一个白」来找边界 —— 糊了就直接找不到起止符。
 *    所以前端那两趟扁带裁切是 `imageSmoothingEnabled` 保持开启（放大时用高质量插值
 *    反而有助于判边界），而**旋转趟必须关掉**（见 m.js 的 SCAN_STEPS.bar）。
 */

/* ============================ 码表 ============================ */

/** Code 128 的 107 个符号（index = 码值）。每项 6 个数字 = 条空条空条空 的模块宽。 */
const C128 = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

/** Code 39：字符 → 9 个元素的宽窄模式（1=窄 2=宽）。索引 0..42。 */
const C39_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%*';
const C39_PAT = [
  '111221211', '211211112', '112211112', '212211111', '111221112', '211221111',
  '112221111', '111211212', '211211211', '112211211', '211112112', '112112112',
  '212112111', '111122112', '211122111', '112122111', '111112212', '211112211',
  '112112211', '111122211', '211111122', '112111122', '212111121', '111121122',
  '211121121', '112121121', '111111222', '211111221', '112111221', '111121221',
  '221111112', '122111112', '222111111', '121121112', '221121111', '122121111',
  '121111212', '221111211', '122111211', '121212111', '121211121', '121112121',
  '111212121', '121121211',
];

/** Code 128 码值与字符的换算表（Code B，最常用：数字+大小写+常见符号） */
const C128_B = (() => {
  const map = new Array(107).fill(null);
  // A 表
  for (let i = 0; i < 64; i++) map[i] = String.fromCharCode(32 + i);
  // B 表（覆盖 A 表的后半段）
  for (let i = 0; i < 95; i++) map[i] = String.fromCharCode(32 + i);
  return map;
})();

/* ============================ 基础工具 ============================ */

/**
 * 全局阈值（大津法）。条码是大面积黑白两值，全局阈值比局部均值更不容易把细条吃掉。
 *
 * ⚠️ 返回的是**两个类均值的中点**，不是「类间方差最大的那个灰度级」。
 *    这一点踩过坑：图里只有 20（黑）和 235（白）两种值时，最大类间方差出现在 i=20 处，
 *    直接拿它当阈值 → `gray < 20` 一个像素都不命中 → 整幅判成全白 → 解码恒为 null。
 *    中点是 (20+235)/2 = 127.5，`gray < 127` 才正好把黑挑出来。
 *    真实的相机灰度图是连续分布，这两种写法差别不大；但二值化的合成图（和某些
 *    对比度极高的标签扫描件）会精确复现这个 bug，所以必须按中点算。
 */
function otsu(gray) {
  const hist = new Int32Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0; let wB = 0; let best = -1; let split = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; split = (mB + mF) / 2; }
  }
  return Math.round(split);
}

/** 灰度 → 二值（1 = 黑，0 = 白），与 qrdecode.js 的约定保持一致 */
function binarizeGlobal(gray, thr) {
  const bin = new Uint8Array(gray.length);
  for (let i = 0; i < bin.length; i++) bin[i] = gray[i] < thr ? 1 : 0;
  return bin;
}

/**
 * 把一行像素压成「游程」数组：连续同色像素的宽度。
 *
 * ⚠️ 起点必须是白的。一维条码两侧一定有静区（白），但从手机截图裁出来的那条
 *    很可能是从黑条中间开始的 —— 那样第一个游程就是黑的，算出来的条空序列会整体错位，
 *    查表必然全错。所以先跳掉开头的黑游程。
 * 同理结尾若是黑游程也丢掉（缺了右侧静区，无法确认条码结束）。
 */
function runsOfLine(bin, w, y) {
  const n = w;
  const at = (i) => bin[y * w + i];
  return runsOfAccessor(n, at);
}

/**
 * 把一**列**像素压成游程。竖拿手机时条码是竖的（条变成横的），
 * 一条水平行穿过的永远是同一根条（单色），逐行扫怎么都不可能命中。
 *
 * ⚠️ 这里**不去旋转像素**，而是换个方向读 —— 旋转会重采样，
 *    1~2px 的条经双线性插值直接没了（实测 15° 就解不出、90° 全灭）。
 *    换方向读是**零损失**的，同一个二值图直接按列取。
 */
function runsOfColumn(bin, w, h, x) {
  const at = (i) => bin[i * w + x];
  return runsOfAccessor(h, at);
}

/**
 * 游程提取的公共实现：把长度为 `n` 的一维采样压成宽度数组。
 *
 * 传入的是 `at(i)` 访问器而不是数组，这样行/列两种扫法共用一份逻辑 ——
 * 两份实现的下场就是「改好了一边忘了另一边」。
 */
function runsOfAccessor(n, at) {
  let x = 0;
  while (x < n && at(x)) x++;             // 跳过开头黑（没拍到左侧静区）
  const runs = [];
  if (x >= n) return runs;
  let cur = at(x);
  let len = 0;
  for (; x < n; x++) {
    const v = at(x);
    if (v === cur) len++;
    else { runs.push(len); cur = v; len = 1; }
  }
  runs.push(len);
  if (runs.length % 2 === 1) runs.pop();  // 结尾是黑 → 缺右侧静区，丢掉
  return runs;
}

/* ============================ Code 128 ============================ */

/**
 * 把 6 个游程的宽度量化成 6 个模块数（和恒为 11）。
 *
 * Code 128 每个符号 11 个模块、3 条 3 空。实际测得的总宽 `sum` 会有 ±1~2 的抖动，
 * 所以按 `round(w / (sum/11))` 归一化，再夹到 1..4（最大模块数是 4）。
 * 量化后若和不是 11 就判为「这一组不是合法符号」，交给上层滑动重试 ——
 * 这比强行凑成 11 要稳，因为凑出来的很可能对应到**错误但合法**的字符。
 */
/**
 * 把 6 个游程量化成 6 个模块数（和恒为 11）。
 *
 * ⚠️ 这里是整个解码器**最容易产生误报**的地方，务必理解：
 *    「四舍五入到最近的模块数」这个动作本身**几乎不会失败** ——
 *    任意 6 个游程长度，round 一下总能得到一组正整数；而 Code128 的 107 个图案
 *    恰好覆盖了「和为 11 的 6 元组」中相当一部分，所以查表也常常能中。
 *    结果就是：**纯随机噪声也能「解」出一串码值**，偶尔还能凑过 mod-103 校验
 *    （实测解得 "5" / "M" 这种假码）。
 *
 *    分辨「真码」和「噪声」的唯一可靠依据是**残差**：
 *    真码的游程长度严格是模块宽的整数倍（哪怕有模糊，误差也在 ±0.35 模块内）；
 *    噪声的游程长度是随机的，round 之后每根条的误差经常接近 0.5 个模块。
 *    所以量化完必须回头核对「原值 vs 量化值」的偏离，超了就判这一组不可信。
 */
function quantize6(runs, i) {
  let sum = 0;
  for (let k = 0; k < 6; k++) sum += runs[i + k];
  if (!(sum > 0)) return null;
  const unit = sum / 11;
  // 单元宽度太小（<1px）说明这一带根本分不出条空，量化没有意义
  if (unit < 1) return null;
  const out = [];
  let tot = 0;
  let err = 0;
  for (let k = 0; k < 6; k++) {
    const ideal = runs[i + k] / unit;
    let v = Math.round(ideal);
    // 残差：量化值与真实值差了多少个模块。真码应当很小（<0.4）
    err += Math.abs(ideal - v);
    if (v < 1) v = 1;
    if (v > 4) v = 4;
    out.push(v);
    tot += v;
  }
  if (tot !== 11) return null;
  // 6 个元素的总允许残差：真码实测 <1.2；噪声常在 1.8 以上。
  // 卡在 1.5 是量出来的折中（更严会开始拒真码，更松噪声就漏进来）
  if (err > QUANT_MAX_ERR6) return null;
  return out;
}

/** 6 元素量化的总残差上限（单位：模块）。实测真码 <1.2、噪声 >1.8，取 1.5 折中。 */
const QUANT_MAX_ERR6 = 1.5;

/** 6 个模块数 → Code128 码值（0..106）。返回 -1 表示没匹配上。 */
function c128Value(mods) {
  const key = mods.join('');
  return C128_KEY.get(key) ?? -1;
}
const C128_KEY = new Map(C128.map((p, i) => [p, i]));

/**
 * 在一条游程序列里解 Code 128：滑动窗口找起始符，再逐符号前进。
 *
 * ⚠️ 停止符是 **7 个元素**（`2331112`），其余符号是 6 个。
 *    第一版每步固定 +6，读到停止符时取的是 `[2,3,3,1,1,1]`（少了最后那个 2），
 *    查表必然 -1 → `break` → 永远判不出结束 → 整条码解码恒为 null。
 *    实测这是 Code128 全红、Code39 全绿的唯一原因（Code39 的字符长度是齐的，不受影响）。
 *    所以：先按 6 个试，若不匹配**再单独试 7 个元素的停止符**。
 */
function decodeC128Runs(runs) {
  for (let start = 0; start + 6 <= runs.length; start++) {
    // 起始符必须是 103/104/105（分别对应 A/B/C）
    const startMods = quantize6(runs, start);
    if (!startMods) continue;
    const startVal = c128Value(startMods);
    if (startVal !== 103 && startVal !== 104 && startVal !== 105) continue;

    const vals = [startVal];
    let i = start + 6;
    let end = i;
    let done = false;
    for (let guard = 0; guard < 64; guard++) {
      // ① 先试 7 元素的停止符（`2331112`）—— 必须在 6 元素之前试，
      //    因为它的前 6 位 `233111` 在别处也可能出现，但末尾多出的 2 只有停止符有。
      if (i + 7 <= runs.length) {
        const stopMods = quantize7(runs, i);
        if (stopMods && c128Value(stopMods) === 106) {
          vals.push(106);
          end = i + 7;
          done = true;
          break;
        }
      }
      // ② 再按普通符号（6 元素）前进
      if (i + 6 > runs.length) break;
      const m = quantize6(runs, i);
      if (!m) break;
      const v = c128Value(m);
      if (v < 0) break;
      vals.push(v);
      i += 6;
      end = i;
    }
    if (!done || vals.length < 4) continue;

    const body = vals.slice(0, -2);        // 去掉停止符与校验符
    const checksum = vals[vals.length - 2];
    let sum = body[0];
    for (let k = 1; k < body.length; k++) sum += body[k] * k;
    if (sum % 103 !== checksum) continue;

    // ⚠️ 只凭 mod-103 校验是**不够**的：校验符在 0..102 里均匀取一个，
    //    随机游程有 ~1/103 概率恰好对上。一张 1600×900 的噪声图上有几十万个滑动窗口，
    //    必然蒙中几个 —— 实测纯噪声会解出 "5" / "M" 这种单字符假码（而且是在
    //    去倾斜那一层，因为转过的噪声会拉出斜向条纹，意外地对齐成「像条码」的游程）。
    //
    //    试过、但**不可用**的判据（都实测过，记下来免得后人重走）：
    //    ✗ 文本长度 ≥ 4        —— 把 '42'/'73' 这种合法短编号一起打挂了
    //    ✗ 量化残差 ≤ 阈值      —— 噪声的「最小残差」也是 0.00：窗口多了总会撞上一个
    //    ✗ 卡控制码 / 可打印 ASCII —— 假码本来就解得出可打印字符，拦不住
    //
    //    真正有效的是**整条码的模块宽度必须一致**这个物理约束：
    //    真条码是印刷出来的，所有符号共用同一个模块宽度（barW），
    //    所以拿「整条码的总宽度 ÷ 总模块数」算出的 unit，去量化每一个符号都该吻合。
    //    噪声拼出来的片段没有这个全局一致性 —— 它只是局部凑巧。
    //    这里做一次**全局复核**：用整段窗口重新算 unit，逐个符号量化，全过才算数。
    if (body.length < MIN_C128_BODY) continue;
    const dec = c128ToText(body);
    if (!dec || !dec.text) continue;
    if (dec.dataCount < 1) continue;
    if (/[\x00-\x1f\x7f]/.test(dec.text)) continue;
    if (/^(.)\1+$/.test(dec.text)) continue;

    // ★ 全局模块宽度一致性复核（真正的分水岭）
    if (!verifyGlobalUnit(runs, start, end)) continue;

    return { text: dec.text, start, end };
  }
  return null;
}

/**
 * 全局一致性复核：把 start..end 整段游程当成一条码，验算它是否存在**一个统一的模块宽度**。
 *
 * 做法：整段总宽度 ÷ 期望的总模块数 = unit，然后用这个 unit 去量化每一根条，
 * 要求每根条的量化残差都很小（真印刷码在 0.35 模块内）。
 *
 * 为什么这一招能分开「真码」和「噪声凑的」：
 *   噪声片段是**逐符号**凑出来的 —— 每 6 个游程各自 round 一次，局部总能凑上，
 *   但把它们放在一起，就没有一个共同的 unit 能让所有条都对齐。
 *   真码反过来：全局 unit 是唯一的，逐符号只是它的整数倍。
 */
function verifyGlobalUnit(runs, start, end) {
  const seg = runs.slice(start, end);
  const totalPx = seg.reduce((a, b) => a + b, 0);
  // 期望的总模块数：每个 6 元素符号占 11 模块，停止符占 13。
  // 用「已知的 vals 长度」反推更直接：符号数 = seg.length/6 向下取整，
  // 但停止符是 7 个游程 —— 由调用方保证 end 已经对上了，这里用总长反推：
  // 6n + 1 = seg.length（n-1 个普通符 + 1 个停止符）⇒ 直接用 11 模块/符号近似，
  // 再对停止符补 2 个模块。
  const nSym = Math.round((seg.length - 1) / 6);
  if (nSym < 3) return false;
  const expMods = (nSym - 1) * 11 + 13;
  const unit = totalPx / expMods;
  if (!(unit >= 0.9)) return false;             // 模块宽度不到 1px，无法分辨
  let worst = 0;
  for (const r of seg) {
    const ideal = r / unit;
    const v = Math.max(1, Math.min(4, Math.round(ideal)));
    const e = Math.abs(ideal - v);
    if (e > worst) worst = e;
  }
  // 真码实测量到的最差残差 <0.4；噪声拼出来的经常 >0.5
  return worst <= GLOBAL_UNIT_TOL;
}

/** 整条 Code128 至少要有几个符号才算「像一张真标签」（START + 数据 + 校验，不含停止符）。 */
const MIN_C128_BODY = 2;
/** 全局模块宽度复核的单根条最大允许残差（单位：模块）。真码 <0.4。 */
const GLOBAL_UNIT_TOL = 0.45;

/**
 * 把 7 个游程量化成 7 个模块数（和恒为 13）—— 停止符专用。
 * 停止符是 4 条 3 空共 13 模块（其它符号是 3 条 3 空共 11）。
 */
function quantize7(runs, i) {
  let sum = 0;
  for (let k = 0; k < 7; k++) sum += runs[i + k];
  if (!(sum > 0)) return null;
  const unit = sum / 13;
  if (unit < 1) return null;
  const out = [];
  let tot = 0;
  let err = 0;
  for (let k = 0; k < 7; k++) {
    const ideal = runs[i + k] / unit;
    let v = Math.round(ideal);
    err += Math.abs(ideal - v);
    if (v < 1) v = 1;
    if (v > 4) v = 4;
    out.push(v);
    tot += v;
  }
  if (tot !== 13) return null;
  if (err > QUANT_MAX_ERR7) return null;
  return out;
}

/** 7 元素（停止符）量化的总残差上限。元素更多，容差按比例略放宽。 */
const QUANT_MAX_ERR7 = 1.7;

/**
 * 码值序列 → 文本。按起始符选码表，遇到切换码（CODE A/B/C、SHIFT）就换表。
 *
 * Code C 是「两位数字压一个符号」，标签上的纯数字编号（如 SN）经常用它，
 * 少了这张表会解出乱码 —— 所以三张表都得实现。
 *
 * 返回 `{ text, dataCount }`：`dataCount` 是**真正承载字符的符号数**
 * （不含 CODE/SHIFT/FNC 这些控制码）。调用方靠它区分「真码」和「噪声蒙中」，
 * 因为蒙中的序列往往是「一堆控制码 + 一个字符」拼出来的。返回 null 表示解码失败。
 */
function c128ToText(vals) {
  let mode = vals[0] === 103 ? 'A' : vals[0] === 104 ? 'B' : 'C';
  let out = '';
  let dataCount = 0;
  for (let i = 1; i < vals.length; i++) {
    const v = vals[i];
    if (mode === 'C') {
      if (v === 100) { mode = 'B'; continue; }
      if (v === 101) { mode = 'A'; continue; }
      if (v === 102) { continue; }                       // FNC1，忽略
      if (v >= 100) return null;                          // C 表里 >=100 都是控制码
      out += String(v).padStart(2, '0');
      dataCount++;
    } else {
      if (v === 99) { mode = 'C'; continue; }
      if (v === 100) { mode = 'B'; continue; }
      if (v === 101) { mode = 'A'; continue; }
      if (v === 102) { continue; }                        // FNC1
      if (v >= 96) return null;
      if (mode === 'A') {
        // A 表：0..63 → 空格..'_'，64..95 → 控制字符（用不到，直接拒）
        if (v > 63) return null;
        out += String.fromCharCode(32 + v);
      } else {
        out += String.fromCharCode(32 + v);
      }
      dataCount++;
    }
  }
  return out ? { text: out, dataCount } : null;
}

/* ============================ Code 39 ============================ */

/** 9 个元素的宽窄 → Code39 字符。窄≈1、宽≈2~3，所以按「≥1.8 倍最小宽」判宽。 */
function c39CharOf(runs, i) {
  let min = Infinity;
  let sum = 0;
  for (let k = 0; k < 9; k++) {
    const r = runs[i + k];
    if (r < min) min = r;
    sum += r;
  }
  if (!(min > 0) || sum <= 0) return null;
  let pat = '';
  for (let k = 0; k < 9; k++) pat += runs[i + k] >= min * 1.8 ? '2' : '1';
  const idx = C39_PAT.indexOf(pat);
  return idx < 0 ? null : C39_CHARS[idx];
}

/**
 * Code 39：每个字符 9 个元素（5 条 4 空），字符之间靠一个窄**白**间隔分开。
 * 所以游程序列是：char(9) + gap(1) + char(9) + gap(1) ... 共 10 个元素一组。
 * 起始/结束符都是 `*`。
 */
function decodeC39Runs(runs) {
  for (let start = 0; start + 10 <= runs.length; start++) {
    if (c39CharOf(runs, start) !== '*') continue;
    let out = '';
    let i = start + 10;
    let done = false;
    for (let guard = 0; guard < 48 && i + 9 <= runs.length; guard++) {
      const ch = c39CharOf(runs, i);
      if (!ch) break;
      if (ch === '*') { done = true; break; }
      out += ch;
      i += 10;
    }
    if (!done || !out) continue;

    // ⚠️ Code39 **没有校验位**（可选的 mod-43 校验绝大多数标签并不印），
    //    所以「找到一对 * 就返回」在噪声上必然出垃圾。
    //
    //    实测到的真实假码（这是把它揪出来的现场记录）：
    //      窗口 [1,4,1,1,2,1,2,1,1,3,5,1,1,3,2,1,1,1,1,1]，只有 34px 宽，
    //      解出单字符 "5" / "M" —— 而且出现的位置是**去倾斜后的行扫**
    //      （转过的噪声会拉出斜向条纹，局部凑出「星号 + 一个字符」的形状）。
    //
    //    分水岭是**物理宽度**：Code39 每个字符要占 9 个元素
    //    （5 条 4 空，窄≈1 宽≈2~3 模块），一个真标签至少印 3 个字符，
    //    也就是说星号到星号之间至少几十个模块、几百像素。
    //    「34px 宽、只夹一个字符」在物理上不可能是印刷出来的真码。
    //
    //    所以这里的两条闸都是**结构性**的，不是「猜长度」：
    //    ① 至少有 3 个字符（真实编号不会更短；测试样本均 ≥6）
    //    ② 起止星号之间的**模块数**至少 3 字符 × 9 元素 = 27 个元素（等价于宽度够）
    //    再加字符集/重复字符这两条便宜的排除。
    if (out.length < MIN_C39_CHARS) continue;
    if (!/^[0-9A-Z\-. $/+%]+$/.test(out)) continue;
    if (/(.)\1{3,}/.test(out)) continue;
    if (/^(.)\1+$/.test(out)) continue;

    // ★ 物理宽度复核：整段（含起止星号）的总模块数必须撑得起这些字符。
    //   每个字符 = 9 元素 + 1 模块间隔，起止星号各占 9 元素。
    //   窄元素至少 1 模块，所以 总模块数 ≥ 9*2 + (n+1)*1 + 9*n。
    const spanPx = runs.slice(start, i + 9).reduce((a, b) => a + b, 0);
    // 用最窄元素反推模块宽（Code39 里一定存在窄元素 = 1 模块）
    let minEl = Infinity;
    for (let k = start; k < i + 9 && k < runs.length; k++) if (runs[k] < minEl) minEl = runs[k];
    if (!(minEl > 0)) continue;
    const unitPx = minEl;                       // 窄元素 ≈ 1 模块
    const totalMods = spanPx / unitPx;
    const needMods = 18 + (out.length + 1) * 1 + 9 * out.length;  // 星号×2 + 间隔 + 字符
    // 允许一定压缩（宽元素可能是 2 模块而不是 3），所以放宽到 0.7 倍
    if (totalMods < needMods * 0.7) continue;

    return { text: out, start, end: i };
  }
  return null;
}

/** Code39 至少要有几个字符才算真标签（星号之间）。测试样本均 ≥6，取 3 留余量。 */
const MIN_C39_CHARS = 3;

/* ============================ 对外入口 ============================ */

/**
 * 逐行解码：一维条码只要**一行**穿过全部条就够，所以每一行都试。
 *
 * 为什么跳着扫而不是每行都扫：一张 900×800 的图有 800 行，每行都做全套游程+查表
 * 太慢（服务端要秒回）。条码高度一般占画面 10% 以上，每隔 3 行取一行足够命中，
 * 而且顺手避开了上下边缘的模糊过渡带。
 */
function scanRows(bin, w, h, decodeRuns, sample = 1) {
  const step = Math.max(1, sample | 0);
  for (let y = 0; y < h; y += step) {
    const runs = runsOfLine(bin, w, y);
    if (runs.length < 12) continue;
    const got = decodeRuns(runs);
    if (got) return { ...got, row: y, axis: 'row' };
  }
  return null;
}

/**
 * 逐**列**解码。竖拿手机时条码在画面里是竖的（条变成横的），
 * 一条水平行穿过的永远是同一根条（全单色），逐行扫**从原理上**不可能命中 ——
 * 实测 90° 旋转后的图逐行扫 100% 失败。
 *
 * 换方向读是零损失的（同一个二值图按列取），比「把图转 90° 再喂」好得多：
 * 旋转必然重采样，而 1~2px 的条一插值就没了（实测 15° 就全军覆没）。
 * 所以「让程序把画面转正」这件事，服务端是靠**换扫描方向**做，不是靠转像素。
 */
function scanCols(bin, w, h, decodeRuns, sample = 1) {
  const step = Math.max(1, sample | 0);
  for (let x = 0; x < w; x += step) {
    const runs = runsOfColumn(bin, w, h, x);
    if (runs.length < 12) continue;
    const got = decodeRuns(runs);
    if (got) return { ...got, row: x, axis: 'col' };
  }
  return null;
}

/**
 * 两个方向都扫一遍：横拿的码在行里、竖拿的码在列里 */
function scanBoth(bin, w, h, decodeRuns, sample = 1) {
  return scanRows(bin, w, h, decodeRuns, sample) || scanCols(bin, w, h, decodeRuns, sample);
}

/**
 * 便宜地判断「这张图值不值得去倾斜」。
 *
 * 为什么需要：去倾斜很贵（12 个角度 × 每个角度重采样整幅 + 两方向扫）。
 * 对着白墙、桌面、纯色机身拍的照片里根本没有条码结构，没必要付这个钱。
 * 实测：这种图判 false 只要 0ms，直接省掉后面 ~1s。
 *
 * 注意**拦不住高频噪声**（噪声天生就是密集短游程，和条码行很像）——
 * 那种图只能靠 sample 把代价压下去。这个函数的作用是「便宜地排除明显不是的」，
 * 不是「准确地识别是条码」。
 *
 * 判据：条码行的游程**又多又短**（每根条 1~5px，一行几十上百个游程）。
 */
function looksLikeBarcode(bin, w, h) {
  const maxLines = 32;
  const step = Math.max(1, Math.floor(h / maxLines));
  let hits = 0;
  for (let y = 0; y < h; y += step) {
    const runs = runsOfLine(bin, w, y);
    if (runs.length < 24) continue;
    let short = 0;
    const lim = Math.min(runs.length, 300);
    for (let k = 0; k < lim; k++) if (runs[k] <= 6) short++;
    if (short / lim > 0.7) hits++;
    if (hits >= 3) return true;
  }
  return false;
}

/**
 * 把二值图**转正**（去倾斜）。
 *
 * 为什么需要：用户很难把手机拿得笔直。条码倾斜几度时，一条水平行斜着跨过多根条，
 * 每根条被切的位置都不同，宽度比失真 → 查表错位。实测 15° 就解不出来，
 * 而 5° 以内还能扛。
 *
 * ⚠️ 关键是**在二值图上转**，用最近邻：1~2px 的条经双线性插值就没了
 *    （实测「先把灰度图转 15° 再解」是 100% 失败）。二值图最近邻不引入任何新灰度值，
 *    条的黑白关系原样保留，转完还是干净的黑白。
 *
 * 角度循环放到外面（decodeBarcode 里），一次转一个角度、转完就试。
 * 返回 { bin, w, h }。
 */
function deskewBin(bin, w, h, deg) {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const W = Math.round(Math.abs(w * cos) + Math.abs(h * sin));
  const H = Math.round(Math.abs(w * sin) + Math.abs(h * cos));
  const out = new Uint8Array(W * H);          // 默认全 0 = 白，四角留白正好当静区
  const cx = w / 2;
  const cy = h / 2;
  const CX = W / 2;
  const CY = H / 2;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - CX;
      const dy = y - CY;
      // 逆变换：目标点 → 原图坐标
      const sx = Math.round(cx + dx * cos + dy * sin);
      const sy = Math.round(cy - dx * sin + dy * cos);
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      out[y * W + x] = bin[sy * w + sx];
    }
  }
  return { bin: out, w: W, h: H };
}

/** 去倾斜试的角度。跨度 ±18°、步长 3° —— 再大就不是「拿歪了」而是「根本没在拍条码」。 */
const DESKEW_ANGLES = [3, -3, 6, -6, 9, -9, 12, -12, 15, -15, 18, -18];

/**
 * 解码一维条码。返回 { text, format, row, axis, deg } 或 null。
 *
 * 性能是这里的一等公民 —— 用户按下快门后必须秒回，否则会被当成「卡住了」。
 *
 * 实测（1600×900，最坏情况 = 图里根本没条码）：
 *   · 命中路径（条码在画面里）：**4~20ms**，用户感知不到延迟
 *   · 未命中路径：曾经 16s（12 角度 × 两方向 × 全行扫），靠下面三层降级压到 ~2s
 *
 * 三层，从便宜到贵，每一层都尽量「先用便宜的判据排除」：
 *   ① 原图逐行 + 逐列，sample=1 —— 最常见情况（码是水平的、铺满宽度）在这里就命中
 *   ② `looksLikeBarcode` 廉价预判 —— 对着白墙/桌面拍的照片直接放弃，省掉去倾斜
 *   ③ 去倾斜：只转二值图（零插值损失），只扫一个方向，sample=4
 *
 * ⚠️ 第 ③ 层为什么只扫行、不扫列：
 *    「竖着拿的码」在 ① 里已经被 scanCols 覆盖了（换扫描方向是零成本的）。
 *    去倾斜这一层剩下的唯一目标是「拿歪了几度」，而**歪了的码仍然是横的** ——
 *    转正之后它还是落在行里。所以没必要在 12 个角度上各扫两遍方向，
 *    那正是把 4s 拖成 16s 的原因。
 */
export function decodeBarcode(gray, width, height) {
  if (!gray || !(width > 8) || !(height > 8) || gray.length < width * height) return null;
  const thr = otsu(gray);
  // 阈值贴到极端（整幅几乎全黑/全白）说明这张图根本没有条码结构，别浪费时间
  if (thr < 8 || thr > 247) return null;
  const bin = binarizeGlobal(gray, thr);

  /** 在一个二值图上把两种码表各试一遍（Code128 优先：资产编号大多是它） */
  const tryRows = (b, bw, bh, deg, sample) => {
    for (const [fmt, fn] of [['code_128', decodeC128Runs], ['code_39', decodeC39Runs]]) {
      const got = scanRows(b, bw, bh, fn, sample);
      if (got && got.text) return { text: got.text, format: fmt, row: got.row, axis: got.axis, deg };
    }
    return null;
  };
  const tryBoth = (b, bw, bh, deg, sample) => {
    for (const [fmt, fn] of [['code_128', decodeC128Runs], ['code_39', decodeC39Runs]]) {
      const got = scanBoth(b, bw, bh, fn, sample);
      if (got && got.text) return { text: got.text, format: fmt, row: got.row, axis: got.axis, deg };
    }
    return null;
  };

  // ① 原图，逐行 + 逐列（横拿的码在行里、竖拿的码在列里，一趟覆盖两种姿势）
  const direct = tryBoth(bin, width, height, 0, 1);
  if (direct) return direct;

  // ② 廉价预判：画面平滑（白墙 / 桌面 / 纯色机身）说明连条码的影儿都没有
  if (!looksLikeBarcode(bin, width, height)) return null;

  // ③ 去倾斜（只转二值图，最近邻，零插值损失）。只扫行 —— 歪了的码转正后还是横的。
  //
  //    采样步长**按图高自适应**，不写死：
  //      小图（高 ≤400）全部 sample=1 —— 一共也就几百行，扫满也快，
  //        而且小图本来就没有余量，漏几行就可能漏掉整条码（实测 15° 在小图上
  //        用固定 sample=3 会失败，改自适应后通过）。
  //      大图（高 >400）sample=3 —— 几千行扫满要秒级，条码有高度，跳着扫够用。
  const step = height <= 400 ? 1 : 3;
  for (const deg of DESKEW_ANGLES) {
    const d = deskewBin(bin, width, height, deg);
    const got = tryRows(d.bin, d.w, d.h, deg, step);
    if (got) return got;
  }

  return null;
}
