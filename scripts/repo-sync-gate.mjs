#!/usr/bin/env node
/**
 * 推送前安全闸门 —— 扫「即将提交的文件内容」，命中就拦住，不让它上公开仓库。
 *
 * 为什么是独立脚本：本项目的 node 不能 spawn 子进程（沙箱 EBUSY），
 * 所以 git 操作由 scripts/repo-sync.sh 负责，本脚本只做纯文件 I/O + 正则，零子进程。
 *
 * 用法：
 *   git diff --cached --name-only > /tmp/list && node scripts/repo-sync-gate.mjs --list=/tmp/list
 *   node scripts/repo-sync-gate.mjs --list=-        # 从 stdin 读路径清单（换行或 NUL 分隔）
 *   node scripts/repo-sync-gate.mjs --list=f --json  # 机器可读输出
 *
 * 退出码：0 = 放行，1 = 拦截，2 = 用法错误。
 *
 * ============================ 规则来源说明 ============================
 * 设计原则和 REFERENCE.md/security-probe 一致：**只拦「已确知是真实的」值**，
 * 外加「必须显式过审」的通用凭据。每条白名单都写清来源，避免闸门变成噪音。
 * ====================================================================
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------- 参数 ----------
const args = process.argv.slice(2);
const listArg = args.find((a) => a.startsWith('--list='));
const asJson = args.includes('--json');
if (!listArg) {
  console.error('用法: node scripts/repo-sync-gate.mjs --list=<路径清单文件|-> [--json]');
  process.exit(2);
}
const listSrc = listArg.slice('--list='.length);

let raw;
if (listSrc === '-') {
  raw = fs.readFileSync(0, 'utf8');
} else {
  try { raw = fs.readFileSync(listSrc, 'utf8'); }
  catch (e) { console.error('读不到路径清单 ' + listSrc + ': ' + e.message); process.exit(2); }
}

const files = raw.split(/\0|\r?\n/).map((s) => s.trim()).filter(Boolean);

// ---------- 硬拦：本项目已确知的真实部署信息 ----------
// 来源：2026-09-26 把内网地址固定之后，误把手册里已脱敏的占位符（192.168.1.100）
// 替换成了办公室真实网段；仓库是 public，这些绝不能推上去。
// ⚠️ 本文件自己也在被扫描范围内 —— **注释里不要写字面量**，用「网段 + .x」的形式描述。
const DENY = [
  {
    id: 'REAL_LAN_IP',
    label: '真实内网 IP（办公室网段）',
    re: /\b192\.168\.110\.\d{1,3}\b/g,
    why: '办公室真实网段。公开仓库里应写成 192.168.1.100（占位符）',
  },
  {
    id: 'REAL_DOMAIN',
    label: '真实域名 / 隧道地址',
    re: /\b(?:[a-z0-9-]+\.)*(?:dengxc\.cloud|frp-put\.com)\b/gi,
    why: '真实对外域名与穿透节点。公开仓库里应写成 example.com',
  },
];

// ---------- 通用：凭据类，命中一律拦（没有「合法出现在公开仓库」的理由）----------
const CRED = [
  { id: 'PAT_CLASSIC', label: 'GitHub 经典令牌', re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g },
  { id: 'PAT_FINE', label: 'GitHub 细粒度令牌', re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  { id: 'OPENAI', label: 'API 密钥（sk- 开头）', re: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { id: 'AWS', label: 'AWS Access Key', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { id: 'PRIVATE_KEY', label: '私钥块', re: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/g },
  {
    id: 'HARDCODED_SECRET',
    label: '疑似硬编码口令',
    re: /\b(?:password|passwd|pwd|secret|api_?key|access_?token)\s*[:=]\s*["'][^"'\s]{8,}["']/gi,
  },
];

// 「硬编码口令」这条规则的已知误报，两类：
//   · env 变量名 —— `'BAIDU_OCR_API_KEY'` 这种是在说「去读哪个环境变量」，不是密钥本身
//   · 测试夹具口令 —— 公开的假口令，用来跑登录流程
// 收紧在这里而不是放宽正则，是为了别把真口令也一起放过去。
const ALLOW_SECRET_VALUE = [
  'ScanTest!123456',   // tests/scan-verify.js 的假口令
];
function isEnvNameOrFixture(matched) {
  const v = (matched.match(/["']([^"']*)["']/) || [])[1] ?? '';
  if (ALLOW_SECRET_VALUE.includes(v)) return true;
  return /^[A-Z][A-Z0-9_]*$/.test(v);
}

// ---------- 通用：私网地址，凡不在白名单里就必须人工过审 ----------
// 反查过 origin/main：下列每一条都是**已经公开、且确属测试夹具/示例**的值，
// 新增一条白名单前请先确认它确实不是真实环境。
const ALLOW_PRIVATE = [
  '127.0.0.1',      // 回环
  '0.0.0.0',
  '192.168.1.100',  // 铁律 #10 规定的占位符
  '192.168.1.5',    // tests/selftest.js 二维码夹具
  '10.9.9.9',       // tests/security.js 假可信代理
  '172.20.0.1',     // tests/selftest.js Hyper-V 假网卡
  '172.28.96.1',    // tests/selftest.js WSL 假网卡
  '172.28.220.1',   // tests/fixtures/glpi/computer_2.json 假网关
  '10.59.29.175',   // tests/fixtures/glpi/printer_1.json 假打印机
  '192.168.137.1',  // Windows「移动热点 / ICS」的固定默认网段（微软公开默认值，非本机私密信息），
                    // tests/selftest.js 需要它来验证「该网段应被降权」，故保留
];
const PRIVATE_IP = /\b(?:(?:10|127)\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})\b/g;

// ---------- 行级白名单：真实存在的固定误报 ----------
// 顺手修掉新加白名单前先看这里，别重复加。
const ALLOW_LINE = [
  /2\.5\.4\.\d+/,                                             // make-cert.js 的 ASN.1 OID
  /2\.5\.29\.\d+/,                                            // 同上
  /\b1\.2\.3\.4\b/,                                           // 注释里的示例 IP
  /\b203\.0\.113\.\d{1,3}\b/,                                 // RFC 5737 文档网段（我们的占位符）
  /\b198\.51\.100\.\d{1,3}\b/,                                // RFC 5737 文档网段
  /\bexample\.(?:com|org|net)\b/,                             // 占位域名（铁律 #10 规定）
];
// ⚠️ 别往这里加真实值。白名单只放「公开仓库里本来就该有的占位符/示例」，
// 真实域名与真实网段一律由上面的 DENY 拦死。

const findings = [];
const filesScanned = [];
const skipped = [];

for (const rel of files) {
  const abs = path.resolve(ROOT, rel);
  if (!abs.startsWith(ROOT)) { skipped.push({ rel, why: '越出仓库目录' }); continue; }
  let text;
  try { text = fs.readFileSync(abs, 'utf8'); }
  catch { skipped.push({ rel, why: '读不到（已删除或二进制）' }); continue; }
  if (text.includes('\u0000')) { skipped.push({ rel, why: '二进制文件' }); continue; }
  filesScanned.push(rel);

  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    const lineno = i + 1;
    if (ALLOW_LINE.some((re) => re.test(line))) return;

    const add = (rule, hit, why) =>
      findings.push({ level: 'BLOCK', id: rule.id, label: rule.label, file: rel, line: lineno, hit, why, snippet: line.trim().slice(0, 120) });

    for (const rule of DENY) {
      rule.re.lastIndex = 0;
      const m = line.match(rule.re);
      if (m) add(rule, m[0], rule.why);
    }
    for (const rule of CRED) {
      rule.re.lastIndex = 0;
      const m = line.match(rule.re);
      if (!m) continue;
      if (rule.id === 'HARDCODED_SECRET' && isEnvNameOrFixture(m[0])) continue;
      add(rule, m[0].slice(0, 12) + '…', '凭据不得进公开仓库');
    }
    // 私网地址：白名单之外、且本行还没被上面的规则抓过才拦 ——
    // 否则同一个 IP 会被 REAL_LAN_IP 与 PRIVATE_IP 各报一遍，噪音翻倍
    const hitHere = new Set(findings.filter((f) => f.file === rel && f.line === lineno).map((f) => f.hit));
    PRIVATE_IP.lastIndex = 0;
    for (const m of line.matchAll(PRIVATE_IP)) {
      if (ALLOW_PRIVATE.includes(m[0]) || hitHere.has(m[0])) continue;
      add({ id: 'PRIVATE_IP', label: '未登记的私网地址' }, m[0], '不在白名单里 —— 若确属测试夹具，请显式加进 ALLOW_PRIVATE 并注明来源');
    }
  });
}

// ---------- 输出 ----------
const blocked = findings.filter((f) => f.level === 'BLOCK');

if (asJson) {
  console.log(JSON.stringify({ ok: blocked.length === 0, scanned: filesScanned.length, skipped, findings }, null, 2));
} else {
  console.log('安全闸门：扫描 ' + filesScanned.length + ' 个文件' + (skipped.length ? '，跳过 ' + skipped.length + ' 个' : ''));
  if (skipped.length) for (const s of skipped) console.log('  · 跳过 ' + s.rel + '（' + s.why + '）');
  if (!blocked.length) {
    console.log('通过：未发现敏感信息。');
  } else {
    const byId = {};
    for (const f of blocked) (byId[f.id] ||= []).push(f);
    console.log('');
    console.log('拦截：发现 ' + blocked.length + ' 处敏感信息，共 ' + Object.keys(byId).length + ' 类。');
    for (const [id, list] of Object.entries(byId)) {
      console.log('');
      console.log('### ' + list[0].label + '（' + id + '）—— ' + list.length + ' 处');
      console.log('    原因：' + list[0].why);
      const byFile = {};
      for (const f of list) (byFile[f.file] ||= []).push(f);
      for (const [file, ls] of Object.entries(byFile)) {
        console.log('  ' + file + '  (' + ls.length + ' 处)');
        for (const l of ls.slice(0, 3)) console.log('     L' + l.line + ': ' + l.hit + '   | ' + l.snippet);
        if (ls.length > 3) console.log('     …… 另 ' + (ls.length - 3) + ' 处');
      }
    }
  }
}

process.exit(blocked.length ? 1 : 0);
