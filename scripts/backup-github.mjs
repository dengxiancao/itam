#!/usr/bin/env node
/**
 * 一键备份 ITAM 源码到 GitHub（dengxiancao/itam）。
 *
 * 为什么不用 `git push`：当前环境里 github.com:443 被代理拦截（502），
 * 而 api.github.com 可以访问，所以走 GitHub Git Data API 推送。
 * 在能正常访问 github.com 的机器上，直接 `git push` 即可，无需本脚本。
 *
 * 用法：
 *   GH_TOKEN=<你的PAT> node scripts/backup-github.mjs
 *
 * 需要的 Token 权限：经典 Token 勾 `repo`；细粒度 Token 勾 Contents 读写。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OWNER = 'dengxiancao';
const REPO = 'itam';
const BRANCH = 'main';
const API = 'https://api.github.com';

const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!TOKEN) {
  console.error('缺少令牌。请用：GH_TOKEN=<你的PAT> node scripts/backup-github.mjs');
  process.exit(1);
}

// 优先用 PATH 里的 git，其次用随 WorkBuddy 附带的便携版
function findGit() {
  const cands = [
    'git',
    'C:/Users/admin/.workbuddy/binaries/PortableGit/versions/1.2.0/mingw64/bin/git.exe',
  ];
  for (const c of cands) {
    try { execFileSync(c, ['--version'], { stdio: 'ignore' }); return c; } catch { /* 下一个 */ }
  }
  throw new Error('找不到 git 可执行文件');
}
const GIT = findGit();

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  'User-Agent': 'itam-backup',
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
};

async function api(method, url, body) {
  const res = await fetch(API + url, {
    method,
    headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* 非 JSON 响应 */ }
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}\n${text.slice(0, 600)}`);
  return json;
}

const run = (...args) => execFileSync(GIT, args, { cwd: ROOT, encoding: 'utf8' }).trim();

// —— 1. 先在本地把改动提交进 git（保留本地历史）——
const dirty = run('status', '--porcelain');
if (dirty) {
  console.log('检测到未提交改动，先在本地提交…');
  run('add', '-A');
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
  run('commit', '-m', `chore: 同步备份 ${stamp}`);
}
const localSha = run('rev-parse', 'HEAD').trim();
const files = run('ls-tree', '-r', 'HEAD', '--name-only').split(/\r?\n/).filter(Boolean);
const commitMsg = run('log', '-1', '--format=%B');
console.log(`本地提交 ${localSha.slice(0, 7)}，含 ${files.length} 个文件`);

// —— 2. 远端当前 tip 作为父提交 ——
let parentSha = null;
try {
  const ref = await api('GET', `/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`);
  parentSha = ref.object.sha;
} catch { /* 分支不存在则建首个提交 */ }

// 若远端已指向本地提交内容，跳过
if (parentSha) {
  const remoteFiles = await api('GET', `/repos/${OWNER}/${REPO}/git/trees/${parentSha}?recursive=1`);
  const remoteMap = new Map(
    remoteFiles.tree.filter((x) => x.type === 'blob').map((x) => [x.path, x.sha])
  );
  const { createHash } = await import('node:crypto');
  let same = remoteMap.size === files.length;
  if (same) {
    for (const rel of files) {
      const buf = fs.readFileSync(path.join(ROOT, rel));
      const sha = createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
      if (remoteMap.get(rel) !== sha) { same = false; break; }
    }
  }
  if (same) {
    console.log('远端已是最新，无需推送 ✅');
    process.exit(0);
  }
}

// —— 3. 上传 blob 并构建 tree ——
const entries = [];
for (const [i, rel] of files.entries()) {
  const buf = fs.readFileSync(path.join(ROOT, rel));
  const blob = await api('POST', `/repos/${OWNER}/${REPO}/git/blobs`, {
    content: buf.toString('base64'),
    encoding: 'base64',
  });
  entries.push({ path: rel, mode: '100644', type: 'blob', sha: blob.sha });
  if ((i + 1) % 10 === 0 || i === files.length - 1) {
    console.log(`  上传 ${i + 1}/${files.length}`);
  }
}

// —— 4. tree → commit → 更新分支 ——
const tree = await api('POST', `/repos/${OWNER}/${REPO}/git/trees`, { tree: entries });
const commit = await api('POST', `/repos/${OWNER}/${REPO}/git/commits`, {
  message: commitMsg,
  tree: tree.sha,
  parents: parentSha ? [parentSha] : [],
});
await api('PATCH', `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, {
  sha: commit.sha,
  force: true,
});

console.log(`\n✅ 备份完成：https://github.com/${OWNER}/${REPO}`);
console.log(`   远端提交 ${commit.sha.slice(0, 7)} / 本地提交 ${localSha.slice(0, 7)} / ${files.length} 个文件`);
