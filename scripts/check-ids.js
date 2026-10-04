/**
 * 元素 id 冲突体检。
 *
 * 背景（2026-09 线上真实故障）：设备台账页的筛选栏和编辑弹窗用了同一批 id
 * （fBrand / fOrg / fStatus），而 `$('#id')` = `document.querySelector('#id')`
 * 只会返回 DOM 里**第一个**匹配的元素 —— 弹窗保存时读到的是筛选栏的空值，
 * 于是「编辑保存后品牌被清空、所属组织变未分配、状态回落成库存」。
 *
 * 这个脚本按「渲染单元」（每个函数 / 顶层模板常量）把 id 分组，
 * 两个单元之间出现同名 id 就报出来 —— 因为页面上它们可能同时存在。
 * 用法：node scripts/check-ids.js            （默认查 admin.js）
 *       node scripts/check-ids.js <文件路径>
 */
import fs from 'node:fs';

/**
 * 找出「不同渲染单元之间重复出现的 id」。
 * @param {string} src 源码文本
 * @returns {{id:string, a:string, b:string}[]} 冲突列表
 */
export function findIdCollisions(src) {
  const blocks = [];
  const re = /(?:\/\*\*[\s\S]*?\*\/\s*)?(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\([\s\S]*?\n\}/g;
  for (const m of src.matchAll(re)) blocks.push({ name: m[1], text: m[0] });
  for (const m of src.matchAll(/const\s+([A-Z0-9_]{3,})\s*=\s*(?:'|`)([\s\S]*?)(?:'|`);/g)) {
    blocks.push({ name: m[1], text: m[0] });
  }

  const units = [];
  for (const b of blocks) {
    const ids = [...new Set([...b.text.matchAll(/id="([A-Za-z0-9_]+)"/g)].map((x) => x[1]))];
    if (ids.length) units.push({ name: b.name, ids });
  }

  const bad = [];
  for (let i = 0; i < units.length; i++) {
    for (let j = i + 1; j < units.length; j++) {
      for (const id of units[i].ids) {
        if (units[j].ids.includes(id)) bad.push({ id, a: units[i].name, b: units[j].name });
      }
    }
  }
  return bad;
}

/* ---------------- 命令行用法 ---------------- */
const isCli = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href;
if (isCli) {
  const FILE = process.argv[2] || 'public/assets/admin.js';
  const src = fs.readFileSync(FILE, 'utf8');
  const bad = findIdCollisions(src);
  const total = new Set([...src.matchAll(/id="([A-Za-z0-9_]+)"/g)].map((m) => m[1])).size;
  console.log(`检查 ${FILE}：共 ${total} 个 id`);
  if (!bad.length) {
    console.log('✔ 没有发现跨单元的 id 冲突');
  } else {
    console.log(`✘ 发现 ${bad.length} 处 id 冲突（同一页面上会互相抢）：`);
    for (const b of bad) console.log(`   ${b.id}  ←  ${b.a}  与  ${b.b}`);
    process.exit(1);
  }
}
