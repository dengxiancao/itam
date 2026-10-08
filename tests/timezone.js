/**
 * 时区 / 日期口径回归测试。
 *
 *   node tests/timezone.js        （不需要起服务）
 *
 * 为什么要有它（2026-10-08 的真实故障）：
 *   服务端一律用 `new Date().toISOString()` 存时间（UTC、带 Z 结尾），
 *   而前端以前到处写 `.replace('T', ' ').slice(0, 16)` —— 那是**把 UTC 当本地时间直接切字符串**。
 *   对 UTC+8 的用户来说，「录入时间 / 更新时间」整整**差 8 小时**：
 *   实测库里最新一台 `NB-2026-0003` 存的是 `2026-10-08T10:02:52.959Z`（= 北京时间 18:02），
 *   界面却显示 `2026-10-08 10:02`。用户的原话：「服务器的录入时间也有问题跟北京时间有差异」。
 *
 * 同一类错误还有「拿 UTC 的今天当今天」：
 *   `new Date().toISOString().slice(0, 10)` 在北京时间 0:00~7:59 之间会**早一天**，
 *   于是保修「已过期 / 有效」判断、仪表盘到期统计、导出文件名、照片目录名全会错一天。
 *
 * 这套断言看住四件事：
 *   ① 前端 `fmtLocal()` 真的按**本地**时区换算（不是切字符串）；
 *   ② 纯日期（采购日期 / 保修到期）**不做**时区换算 —— 硬套时区会整体挪一天；
 *   ③ 服务端 `today()` / `localDate()` / `normalizeDate()` 取的是本地日历日；
 *   ④ `admin.js` 与业务服务端文件里**不许再出现**旧写法（防止回潮）。
 *
 * ③ 直接 import 服务端模块；① 用「从源码里把函数文本抠出来、在干净 vm 里跑」的方式测 ——
 * 不搭整套 DOM 桩，因为这两个函数是纯的。
 *
 * ⚠️ 本套件会**在运行期切换 `process.env.TZ`**：
 *    Node ≥ 16 支持这么做（V8 会重置时区缓存），这样才能真正造出「北京时间凌晨」的场景，
 *    而不是靠相信「本地就是 +8」。切换前后都实测过，见下方 F 组。
 *    跑完会**恢复**原来的 TZ（原本没设置就删掉，不能留个字符串 "undefined"）。
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { today, localDate, localDateOf, normalizeDate } from '../server/util.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adminSrc = fs.readFileSync(path.join(ROOT, 'public/assets/admin.js'), 'utf8');

let pass = 0;
const fails = [];
const assert = (name, cond, extra) => { if (cond) pass++; else fails.push(name + (extra ? '  → ' + extra : '')); };

const startTZ = process.env.TZ;
const setTZ = (tz) => { if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz; };
const pad2 = (n) => String(n).padStart(2, '0');
const ymdOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/* ================= 从 admin.js 源码里取出纯函数 =================
 * 只抠 `fmtLocal` / `todayLocal` 两个函数文本，在干净 vm 里跑 —— 不必搭 DOM 桩。
 * 按 `{` / `}` 配对扫到收尾那一行（这两个函数体里出现的 `{}` 都是成对的，
 * 包括模板串里的 `${...}`，所以计数是可靠的）。
 */
function extractFn(src, name) {
  const lines = src.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`function ${name}(`));
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
    }
    if (i > start && depth === 0) return lines.slice(start, i + 1).join('\n');
  }
  return null;
}

const FN_SRC = ['fmtLocal', 'todayLocal'].map((n) => extractFn(adminSrc, n)).filter(Boolean).join('\n\n');
assert('能从 admin.js 里抠出 fmtLocal / todayLocal 两个函数',
  FN_SRC.includes('function fmtLocal(') && FN_SRC.includes('function todayLocal('),
  '抠不到说明函数被改名/搬走了 —— 请同步更新本套件（而不是删掉这条断言）');

const ctx = FN_SRC.includes('function fmtLocal(')
  ? vm.runInNewContext(`${FN_SRC}\n\n({ fmtLocal, todayLocal })`, {})
  : null;

/* ================= A. 前端 fmtLocal：按本地时区换算 ================= */
setTZ('Asia/Shanghai');
if (ctx) {
  const TS = '2026-10-08T10:02:52.959Z';   // 库里真实的那一条：北京时间 18:02:52
  assert('★ 时间戳按**本地**时区显示（不是切 UTC 字符串）', ctx.fmtLocal(TS) === '2026-10-08 18:02',
    `实测「${ctx.fmtLocal(TS)}」/ 期望「2026-10-08 18:02」`);
  assert('fmtLocal(..., "sec") 带秒', ctx.fmtLocal(TS, 'sec') === '2026-10-08 18:02:52',
    `实测「${ctx.fmtLocal(TS, 'sec')}」`);
  assert('fmtLocal(..., "date") 只要日期', ctx.fmtLocal(TS, 'date') === '2026-10-08',
    `实测「${ctx.fmtLocal(TS, 'date')}」`);
  assert('fmtLocal(..., "md") = 月-日 时:分（登录日志那种紧凑格式）', ctx.fmtLocal(TS, 'md') === '10-08 18:02',
    `实测「${ctx.fmtLocal(TS, 'md')}」`);

  /* ---- B. 纯日期串不做时区换算 ---- */
  assert('★ 纯日期（如保修到期 2027-01-01）**原样返回**，不被时区挪走',
    ctx.fmtLocal('2027-01-01', 'date') === '2027-01-01', `实测「${ctx.fmtLocal('2027-01-01', 'date')}」`);
  assert('纯日期走 "md" 也只给月-日', ctx.fmtLocal('2027-01-01', 'md') === '01-01',
    `实测「${ctx.fmtLocal('2027-01-01', 'md')}」`);

  /* ---- C. 空值 / 脏值 ---- */
  for (const [v, label] of [['', '空串'], [null, 'null'], [undefined, 'undefined'], ['乱码', '非日期文本']]) {
    assert(`fmtLocal(${label}) → 「—」而不是 Invalid Date`, ctx.fmtLocal(v) === '—', `实测「${ctx.fmtLocal(v)}」`);
  }

  /* ---- D. ★ 真正的杀手场景：北京时间凌晨 ---- */
  // UTC 的 10-08 16:30 = 北京 10-09 00:30。这时「UTC 的日期」和「本地日期」是**两天**。
  const MIDNIGHT = '2026-10-08T16:30:00.000Z';
  assert('★ 北京凌晨 00:30 录入的设备，日期显示为**当天**（10-09）',
    ctx.fmtLocal(MIDNIGHT, 'date') === '2026-10-09', `实测「${ctx.fmtLocal(MIDNIGHT, 'date')}」`);
  assert('（对照）同一个时刻按 UTC 切会给 10-08 —— 这就是用户看到「差一天」的来源',
    MIDNIGHT.slice(0, 10) === '2026-10-08');

  /* ---- E. todayLocal 与本地日历日一致 ---- */
  assert('★ todayLocal() 等于本机日历日', ctx.todayLocal() === ymdOf(new Date()),
    `实测 ${ctx.todayLocal()} / 期望 ${ymdOf(new Date())}`);
}

/* ================= F. 服务端：今天 / 日期归一化 ================= */
{
  const now = new Date();
  assert('★ today() 取**本地**日历日（不是 UTC 的今天）', today() === ymdOf(now),
    `实测 ${today()} / 期望 ${ymdOf(now)}`);

  const tmr = new Date(); tmr.setDate(tmr.getDate() + 1);
  assert('localDate(1) 是明天（setDate 交给 Date 处理跨月/跨年/闰年）', localDate(1) === ymdOf(tmr),
    `实测 ${localDate(1)} / 期望 ${ymdOf(tmr)}`);

  const yst = new Date(); yst.setDate(yst.getDate() - 1);
  assert('localDate(-1) 是昨天', localDate(-1) === ymdOf(yst), `实测 ${localDate(-1)}`);

  setTZ('Asia/Shanghai');
  assert('★ localDateOf 把 UTC 16:30 认成北京次日 00:30',
    localDateOf(new Date('2026-10-08T16:30:00Z')) === '2026-10-09',
    `实测 ${localDateOf(new Date('2026-10-08T16:30:00Z'))}`);

  // normalizeDate：兜底分支（不带时区的输入会被 JS 按本地解析）
  assert('★ normalizeDate("2026-10-08 00:30") 不再退回前一天',
    normalizeDate('2026-10-08 00:30') === '2026-10-08', `实测 ${normalizeDate('2026-10-08 00:30')}`);
  assert('normalizeDate("2026-10-08 23:30") 正常', normalizeDate('2026-10-08 23:30') === '2026-10-08');
  assert('normalizeDate("2026/10/8") 正常', normalizeDate('2026/10/8') === '2026-10-08');
  assert('normalizeDate("2026年10月8日") 正常', normalizeDate('2026年10月8日') === '2026-10-08');
  assert('normalizeDate("2026") → 当年 1 月 1 日（别被解析成 2001 年）',
    normalizeDate('2026') === '2026-01-01', `实测 ${normalizeDate('2026')}`);
  // Excel 序列号：必须仍按 **UTC** 解读（算出来的就是 UTC 午夜），不能被本地化
  setTZ('Asia/Shanghai');
  assert('normalizeDate(Excel 序列号 45999) 仍是 2025-12-08',
    normalizeDate(45999) === '2025-12-08', `实测 ${normalizeDate(45999)}`);
  setTZ('America/New_York');
  assert('★ Excel 序列号在别的时区也**不变**（说明它没被错误地本地化）',
    normalizeDate(45999) === '2025-12-08', `实测 ${normalizeDate(45999)}`);
}

/* ================= G. 回潮扫描：旧写法不许再出现 ================= */
{
  const stripComments = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, '')       // 块注释（含 JSDoc）
    .replace(/^[ \t]*\/\/.*$/gm, '');       // 行注释（只认行首，免得误伤 http:// ）

  const adminCode = stripComments(adminSrc);
  assert('★ admin.js 里不再有 `.replace("T", " ")` 这种「把 UTC 当本地时间切」的写法',
    !/\.replace\(\s*['"]T['"]\s*,\s*['"]\s['"]\s*\)/.test(adminCode),
    '又有人写回去了 —— 显示时间请一律走 fmtLocal()');

  // 业务侧三个文件里不许再拿 UTC 当「今天」
  for (const f of ['server/services.js', 'server/excel.js', 'server/index.js']) {
    const code = stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8'));
    assert(`★ ${f} 里不再用 UTC 的「今天」（toISOString().slice(0,10)）`,
      !/toISOString\(\)\.slice\(0,\s*10\)/.test(code),
      '「今天」请用 util.js 的 today() / localDate()');
  }

  // util.js 里**允许**保留一处：Excel 序列号必须按 UTC 解读。它必须还带着说明注释。
  const utilCode = fs.readFileSync(path.join(ROOT, 'server/util.js'), 'utf8');
  assert('util.js 的 Excel 序列号分支仍按 UTC 解读（并且注释写清了为什么）',
    /UTC 午夜/.test(utilCode) && /toISOString\(\)\.slice\(0, 10\)/.test(utilCode),
    '这一处是**故意**的，别顺手改成本地日期 —— 那会在时区靠西的机器上退一天');
}

/* ================= H. 反例自检：证明 A 组判据不是恒真 ================= */
{
  setTZ('Asia/Shanghai');
  const LEGACY = `function fmtLocal(iso, mode = 'min') {
  const s = String(iso || '');
  if (!s) return '—';
  return mode === 'date' ? s.slice(0, 10) : s.replace('T', ' ').slice(mode === 'sec' ? 0 : mode === 'md' ? 5 : 0, mode === 'sec' ? 19 : 16);
}`;
  const legacy = vm.runInNewContext(`${LEGACY}\nfmtLocal`, {});
  const TS = '2026-10-08T10:02:52.959Z';
  assert('★ 反例自检：旧写法（切 UTC 字符串）在同一输入上给出**不同**的值',
    legacy(TS) !== ctx.fmtLocal(TS),
    `旧写法「${legacy(TS)}」 vs 新写法「${ctx.fmtLocal(TS)}」—— 两者相同说明 A 组判据是恒真的，白测`);
}

/* ================= 收尾 ================= */
setTZ(startTZ);

// ⚠️ 失败行用 `✘`（U+2718），和其余套件保持一致 ——
//    `__patch/mutate-batch.mjs` 就是按这个符号从套件输出里捞失败断言名的。
for (const f of fails) console.log('  ✘ ' + f);
console.log(`\n时区 / 日期口径回归：${pass} 通过 / ${fails.length} 失败\n`);
process.exit(fails.length ? 1 : 0);
