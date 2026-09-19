/**
 * 把 docs/使用手册.md 转成单文件、可分享可打印的 HTML
 *
 * 用法：node scripts/build-manual.js
 * 输出：docs/使用手册.html
 *
 * 这是一个针对本项目手册所用 Markdown 子集的小型转换器
 * （标题 / 段落 / 加粗 / 行内代码 / 代码块 / 有序无序列表 / 表格 / 引用 / 分割线 / 链接），
 * 零依赖，不追求通用性。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'docs', '使用手册.md');
const OUT = path.join(ROOT, 'docs', '使用手册.html');

const md = fs.readFileSync(SRC, 'utf8');

const escapeHtml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/** GitHub 风格锚点：去掉标点与空格 */
const slug = (s) => String(s)
  .trim().toLowerCase()
  .replace(/[^\w\u4e00-\u9fff\- ]/g, '')
  .replace(/\s+/g, '-');

function inline(s) {
  let t = escapeHtml(s);
  t = t.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, txt, href) => `<a href="${href}">${txt}</a>`);
  return t;
}

const out = [];
let para = [];
let listStack = [];   // [{ tag:'ul'|'ol' }]
let inCode = false;
let codeBuf = [];
let quote = [];
const toc = [];

const flushPara = () => {
  if (!para.length) return;
  out.push(`<p>${inline(para.join(' '))}</p>`);
  para = [];
};
const closeLists = () => {
  while (listStack.length) out.push(`</${listStack.pop().tag}>`);
};
const flushQuote = () => {
  if (!quote.length) return;
  out.push(`<blockquote>${quote.map((q) => `<p>${inline(q)}</p>`).join('')}</blockquote>`);
  quote = [];
};
const flushAll = () => { flushPara(); closeLists(); flushQuote(); };

const lines = md.split(/\r?\n/);

for (let i = 0; i < lines.length; i++) {
  const raw = lines[i];
  const line = raw.replace(/\s+$/, '');

  /* 代码块 */
  if (/^```/.test(line)) {
    if (!inCode) { flushAll(); inCode = true; codeBuf = []; }
    else {
      inCode = false;
      out.push(`<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`);
      codeBuf = [];
    }
    continue;
  }
  if (inCode) { codeBuf.push(raw); continue; }

  /* 空行 */
  if (!line.trim()) { flushAll(); continue; }

  /* 分割线 */
  if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
    flushAll();
    out.push('<hr>');
    continue;
  }

  /* 标题 */
  const h = line.match(/^(#{1,6})\s+(.*)$/);
  if (h) {
    flushAll();
    const level = h[1].length;
    const text = h[2].trim();
    const id = slug(text);
    if (level === 1 || level === 2) toc.push({ level, text, id });
    out.push(`<h${level} id="${id}">${inline(text)}<a class="anchor" href="#${id}">#</a></h${level}>`);
    continue;
  }

  /* 表格 */
  if (/^\s*\|.*\|\s*$/.test(line)) {
    flushAll();
    const rows = [];
    while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
      rows.push(lines[i].trim());
      i++;
    }
    i--;
    const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    const head = cells(rows[0]);
    const body = rows.slice(2).map(cells);
    out.push('<div class="tw"><table>');
    out.push('<thead><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead>');
    out.push('<tbody>' + body.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody>');
    out.push('</table></div>');
    continue;
  }

  /* 引用 */
  if (/^>\s?/.test(line)) {
    flushPara(); closeLists();
    quote.push(line.replace(/^>\s?/, ''));
    continue;
  }
  flushQuote();

  /* 列表 */
  const ul = line.match(/^(\s*)[-*+]\s+(.*)$/);
  const ol = line.match(/^(\s*)(\d+)[.、)]\s+(.*)$/);
  if (ul || ol) {
    flushPara();
    const tag = ul ? 'ul' : 'ol';
    const text = ul ? ul[2] : ol[3];
    if (!listStack.length || listStack[listStack.length - 1].tag !== tag) {
      closeLists();
      out.push(`<${tag}>`);
      listStack.push({ tag });
    }
    out.push(`<li>${inline(text)}</li>`);
    continue;
  }
  if (listStack.length) closeLists();

  /* 普通段落 */
  para.push(line.trim());
}
flushAll();

const title = 'IT 资产管理系统 · 使用手册';
const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
:root {
  --fg: #0f172a; --fg2: #334155; --fg3: #64748b;
  --line: #e5e7eb; --primary: #2563eb; --bg: #ffffff; --surface-2: #f7f8fa;
  --font: system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI",
          "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
}
* { box-sizing: border-box; }
body {
  margin: 0; background: #f7f8fa; color: var(--fg);
  font-family: var(--font);
  font-size: 15.5px; line-height: 1.85; -webkit-font-smoothing: antialiased;
}
/* 文档页 = 白纸 + 发丝线描边，不给投影，与后台同一套视觉语言 */
.wrap { max-width: 900px; margin: 0 auto; background: var(--bg); padding: 48px 56px 80px;
  border: 1px solid var(--line); }
h1 { font-size: 30px; margin: 0 0 8px; letter-spacing: -.5px; font-weight: 600; }
h1 + blockquote { margin-top: 0; }
h2 { font-size: 23px; margin: 46px 0 14px; padding-bottom: 8px; border-bottom: 1px solid var(--line); font-weight: 600; }
h3 { font-size: 18px; margin: 32px 0 10px; font-weight: 600; }
h4 { font-size: 16px; margin: 24px 0 8px; font-weight: 600; color: var(--fg2); }
p { margin: 12px 0; }
a { color: var(--primary); text-decoration: none; }
a:hover { text-decoration: underline; }
.anchor { opacity: 0; margin-left: 8px; font-size: .7em; color: var(--fg3); }
h1:hover .anchor, h2:hover .anchor, h3:hover .anchor { opacity: 1; }
code { background: var(--surface-2); padding: 2px 6px; border-radius: 5px; font-size: .88em;
  font-family: ui-monospace, "SF Mono", Consolas, "Cascadia Code", monospace; color: #b3261e; }
pre { background: #0f172a; color: #e2e8f0; padding: 16px 18px; border-radius: 11px; overflow-x: auto; font-size: 13.5px; line-height: 1.6; }
pre code { background: none; color: inherit; padding: 0; font-size: inherit; }
blockquote { margin: 16px 0; padding: 12px 18px; background: #eff6ff; border-left: 3px solid var(--primary);
  border-radius: 0 8px 8px 0; color: var(--fg2); }
blockquote p { margin: 4px 0; }
hr { border: none; border-top: 1px solid var(--line); margin: 34px 0; }
ul, ol { padding-left: 26px; margin: 12px 0; }
li { margin: 5px 0; }
.tw { overflow-x: auto; margin: 16px 0; border: 1px solid var(--line); border-radius: 11px; }
table { width: 100%; border-collapse: collapse; font-size: 14.5px; }
th, td { padding: 10px 13px; text-align: left; border-bottom: 1px solid var(--line); vertical-align: top; }
th { background: var(--surface-2); font-weight: 600; color: var(--fg2); white-space: nowrap; }
tr:last-child td { border-bottom: none; }
tbody tr:hover { background: #f8fafc; }
.footer { margin-top: 60px; padding-top: 18px; border-top: 1px solid var(--line); color: var(--fg3); font-size: 13px; text-align: center; }
@media (max-width: 720px) { .wrap { padding: 24px 18px 60px; border: none; } body { font-size: 15px; } th, td { padding: 8px 10px; } }
@media print {
  body { background: #fff; font-size: 11.5pt; }
  .wrap { border: none; padding: 0; max-width: none; }
  h2 { page-break-after: avoid; page-break-before: auto; }
  table, pre, blockquote { page-break-inside: avoid; }
  .anchor { display: none; }
  a { color: #000; }
}
</style>
</head>
<body>
<div class="wrap">
${out.join('\n')}
<div class="footer">IT 资产管理系统 · 使用手册 · 生成于 ${new Date().toLocaleString('zh-CN')}</div>
</div>
</body>
</html>
`;

fs.writeFileSync(OUT, html, 'utf8');
// 同时放一份到 public/，这样登录后可以访问 /manual 直接在网页里查看
const PUB = path.join(ROOT, 'public', 'manual.html');
fs.writeFileSync(PUB, html, 'utf8');

const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
console.log('✔ 使用手册已生成');
console.log(`   源文件: ${SRC}`);
console.log(`   分享版: ${OUT}`);
console.log(`   站内版: ${PUB}  ->  登录后访问 /manual`);
console.log(`   大小  : ${kb} KB`);
console.log(`   章节  : ${toc.length} 个一级/二级标题`);
