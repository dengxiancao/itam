/**
 * 一把跑完所有测试（自动化回归总入口）。用法：npm test
 *
 * 三条设计原则，都是踩过坑才定下来的：
 *
 * ① **绝不碰真实数据**。
 *    以前这些测试直接对着正在运行的服务（8080）和真实的 data/itam.db 跑：
 *    selftest 会往真实库里塞演示数据、api-smoke 会增删设备、账户测试会改密码。
 *    现在这里自己起一个**临时库 + 临时端口**的服务，测试跑完即销毁。
 *
 * ② **不依赖任何密码**。
 *    真实管理员改过密码后，data/admin-password.txt 就是过期的，
 *    所有 HTTP 测试会集体 401 —— 看起来像代码坏了，其实只是口令不对。
 *    现在临时实例用 ITAM_ADMIN_PASSWORD 指定一个当天生成的测试口令，谁都别猜。
 *
 * ③ **一个文件一个子进程**。
 *    各测试自己管 pass/fail 且失败时 process.exit(1)，同进程 import 会把整轮打断。
 *
 * 环境变量：
 *   BASE_KEEP=1   跑完不删临时库（排查用）
 *   SKIP_SERVER=1 跳过需要服务的测试（只跑纯库测试）
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const NODE = process.execPath;

const TEST_PORT = Number(process.env.TEST_PORT || 8099);
const TEST_HTTPS_PORT = Number(process.env.TEST_HTTPS_PORT || 8444);
const BASE = `http://127.0.0.1:${TEST_PORT}`;
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'TestPass!' + Math.floor(Math.random() * 1e6);

/** 要不要起服务的测试分两拨：纯库的先跑，需要服务的后跑 */
const SUITES = [
  { file: 'selftest.js', label: '数据库 / 业务逻辑', server: false },
  { file: 'qr-decode.js', label: '二维码解码器', server: false },
  { file: 'ledger-density.js', label: '台账密度', server: false },
  { file: 'vision-adapter.js', label: 'OCR 通道', server: false },
  { file: 'charts.js', label: '统计图表', server: true },
  { file: 'm-dashboard-slim.js', label: '手机首页瘦身', server: true },
  { file: 'render-smoke.js', label: '页面渲染', server: true },
  { file: 'scan-verify.js', label: '扫码核对流程', server: true },
  { file: 'agent.js', label: 'GLPI Agent 对接', server: true },
  { file: 'account.js', label: '账户与权限', server: true },
  { file: 'api-smoke.js', label: 'HTTP 接口', server: true },
  // ⚠️ security 放最后，而且它**自己起实例**（server:false 是故意的）：
  //    它为了验证限流会故意把限流打满，打在共享实例上会让后面所有套件集体 429。
  { file: 'security.js', label: '安全加固', server: false },
];

/* ---------------- 临时环境 ---------------- */
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'itam-test-'));
const tmpDb = path.join(tmpDir, 'itam-test.db');
const serverLog = path.join(tmpDir, 'server.log');
console.log(`\n临时库：${tmpDb}\n临时服务：${BASE}\n`);

function cleanup() {
  if (process.env.BASE_KEEP === '1') { console.log(`\n（BASE_KEEP=1，保留临时目录 ${tmpDir}）`); return; }
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* 有文件锁就算了 */ }
}

/* ---------------- 起临时服务 ---------------- */
let server = null;
async function startServer() {
  const logFd = fs.openSync(serverLog, 'a');
  server = spawn(NODE, [path.join(ROOT, 'server', 'index.js')], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      HTTPS_PORT: String(TEST_HTTPS_PORT),
      // 必须绑 0.0.0.0：api-smoke 会拿「局域网取数地址」真去 curl 一次，
      // 只绑 127.0.0.1 的话那条断言永远是 fetch failed（不是产品坏了，是测试环境没开这个门）
      HOST: '0.0.0.0',
      ITAM_DB: tmpDb,
      ITAM_ADMIN_USER: ADMIN_USER,
      ITAM_ADMIN_PASSWORD: ADMIN_PASS,
    },
    // ⚠️ 不用管道：沙箱下 node 打不开命名管道，stdio:'pipe' 会直接 EPERM。
    //    日志写文件一样能看，还不会被缓冲区吃满卡住。
    stdio: ['ignore', logFd, logFd],
    windowsHide: true,
  });
  server.on('error', (e) => console.log('起服务失败：' + e.message));

  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(BASE + '/api/health');
      if (res.ok) { console.log(`临时服务已就绪（${((25000 - (deadline - Date.now())) / 1000).toFixed(1)}s）`); return true; }
    } catch { /* 还没起来 */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  console.log('临时服务启动超时，最后几行日志：');
  try { console.log(fs.readFileSync(serverLog, 'utf8').split(/\r?\n/).slice(-12).join('\n')); } catch { /* ignore */ }
  return false;
}

function stopServer() {
  if (!server || server.exitCode != null) return;
  try { spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); }
  catch { try { server.kill('SIGKILL'); } catch { /* ignore */ } }
}

/* ---------------- 跑 ---------------- */
const results = [];
let failed = 0;
let serverUp = false;

try {
  if (process.env.SKIP_SERVER !== '1') serverUp = await startServer();

  for (const s of SUITES) {
    const abs = path.join(ROOT, 'tests', s.file);
    if (!fs.existsSync(abs)) { results.push({ ...s, ok: true, note: '文件不存在，跳过' }); continue; }
    if (s.server && !serverUp) { results.push({ ...s, ok: true, skipped: true, note: '需要服务，已跳过' }); continue; }

    process.stdout.write(`\n──────── ${s.label}（${s.file}）────────\n`);
    const t0 = Date.now();
    const r = spawnSync(NODE, [abs], {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        ITAM_DB: tmpDb,
        BASE,
        ITAM_USER: ADMIN_USER,
        ITAM_PASS: ADMIN_PASS,
        ITAM_ADMIN_PASSWORD: ADMIN_PASS,
      },
    });
    const ms = Date.now() - t0;
    const out = ((r.stdout || '') + (r.stderr || '')).trimEnd();
    const lines = out.split(/\r?\n/);
    // 每个测试结尾都会打自己的汇总，成功只看尾巴就够；失败要把全文（或前 60 行）打出来才知道坏在哪
    const ok = r.status === 0;
    if (ok) console.log(lines.slice(-12).join('\n'));
    else {
      console.log(lines.slice(0, 60).join('\n'));
      if (lines.length > 60) console.log(`…… （省略 ${lines.length - 60} 行）`);
    }
    if (!ok) failed++;
    results.push({ ...s, ok, ms });
  }
} finally {
  stopServer();
  cleanup();
}

console.log('\n════════════════════ 总表 ════════════════════');
for (const r of results) {
  const mark = r.ok ? (r.skipped ? '\x1b[33m—\x1b[0m' : '\x1b[32m✔\x1b[0m') : '\x1b[31m✘\x1b[0m';
  const pad = (t, n) => t + '　'.repeat(Math.max(0, n - [...t].length));
  console.log(`${mark} ${pad(r.label, 8)} ${r.file.padEnd(22)} ${r.ok ? (r.note || (r.ms + 'ms')) : '失败'}`);
}
const ran = results.filter((r) => !r.skipped).length;
console.log(`\n${ran - failed} / ${ran} 个测试文件通过${results.some((r) => r.skipped) ? '（有跳过）' : ''}`);
if (failed) { console.log('有失败项，看上面的输出（临时服务日志：' + serverLog + '）'); process.exit(1); }
