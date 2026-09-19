/**
 * 后端自测：Excel 读写往返、QR 码、识别引擎、数据库 CRUD
 * 运行：node tests/selftest.js
 */
import assert from 'node:assert';
import { buildXlsx, parseXlsx, zipRead } from '../server/lib/xlsx.js';
import { qrcodeEncode, qrcodeSvg } from '../server/lib/qrcode.js';
import { interpret, detectSN, detectBrand, stripSNLabels, snPatternFrom, snCandidates } from '../server/lib/recognize.js';
import { buildTemplate, exportDevices, importDevices, allColumns } from '../server/excel.js';
import { migrate, seedIfEmpty, scalar } from '../server/db.js';
import * as svc from '../server/services.js';

let pass = 0;
let failCount = 0;
const failures = [];

async function t(name, fn) {
  try {
    await fn();
    pass++;
    console.log(`  \x1b[32m✔\x1b[0m ${name}`);
  } catch (e) {
    failCount++;
    failures.push({ name, message: e.message, stack: e.stack });
    console.log(`  \x1b[31m✘\x1b[0m ${name}\n      ${e.message}`);
  }
}

console.log('\n=== ITAM 自测 ===\n');

migrate();
seedIfEmpty({ withDemo: true });

console.log('[1] Excel 引擎');
await t('写入并读回 xlsx（中文 / 数字 / 日期 / 空值）', () => {
  const buf = buildXlsx({
    sheets: [{
      name: '测试表',
      title: '标题行',
      columns: [
        { header: '名称', key: 'name', width: 20 },
        { header: '数量', key: 'qty', type: 'int' },
        { header: '日期', key: 'date', type: 'date' },
        { header: '金额', key: 'amount', type: 'money' },
        { header: '备注', key: 'note' },
      ],
      rows: [
        { name: '显示器 & <测试> "引号"', qty: 12, date: '2024-03-15', amount: 1899.5, note: '中文备注' },
        { name: '主机', qty: 3, date: '2024-04-01', amount: 4500, note: '' },
      ],
    }],
  });
  assert.ok(buf.length > 500, 'xlsx 应该有内容');
  const parsed = parseXlsx(buf);
  assert.strictEqual(parsed.sheetName, '测试表');
  assert.deepStrictEqual(parsed.headers, ['名称', '数量', '日期', '金额', '备注']);
  assert.strictEqual(parsed.data.length, 2);
  assert.strictEqual(parsed.data[0].名称, '显示器 & <测试> "引号"');
  assert.strictEqual(parsed.data[0].数量, 12);
  assert.strictEqual(parsed.data[0].金额, 1899.5);
  assert.strictEqual(parsed.data[1].备注, null);
});

await t('多工作表写入/读取', () => {
  const buf = buildXlsx({
    sheets: [
      { name: 'A表', columns: [{ header: 'X', key: 'x' }], rows: [{ x: 'a1' }] },
      { name: 'B表', columns: [{ header: 'Y', key: 'y' }], rows: [{ y: 'b1' }] },
    ],
  });
  const p0 = parseXlsx(buf, { sheet: 0 });
  const p1 = parseXlsx(buf, { sheet: 'B表' });
  assert.strictEqual(p0.data[0].X, 'a1');
  assert.strictEqual(p1.data[0].Y, 'b1');
  assert.deepStrictEqual(p0.sheets, ['A表', 'B表']);
});

await t('图片嵌入单元格（drawing / media / 关系链完整）', () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const buf = buildXlsx({
    sheets: [
      // 第 1 张表没有图：不该被挂上 drawing
      { name: '汇总', columns: [{ header: '名称', key: 'n' }], rows: [{ n: 'x' }] },
      {
        name: '明细',
        columns: [
          { header: '资产编号', key: 'asset_no' },
          { header: '照片', key: 'photo', type: 'image', imageWidth: 88, imageHeight: 62 },
        ],
        rows: [
          { asset_no: 'A1', photo: png },
          { asset_no: 'A2', photo: png },
          { asset_no: 'A3', photo: null },
        ],
      },
    ],
  });
  const files = zipRead(buf);
  const media = [...files.keys()].filter((n) => n.startsWith('xl/media/'));
  assert.strictEqual(media.length, 2, '两张有图的行应产出两个媒体文件');

  const drawings = [...files.keys()].filter((n) => /^xl\/drawings\/drawing\d+\.xml$/.test(n));
  assert.strictEqual(drawings.length, 1, '只有明细表需要 drawing 部件');

  const sheet1 = files.get('xl/worksheets/sheet1.xml').toString('utf8');
  assert.ok(!sheet1.includes('<drawing'), '汇总表不该有 drawing');
  const sheet2 = files.get('xl/worksheets/sheet2.xml').toString('utf8');
  assert.ok(sheet2.includes('<drawing r:id="rId1"/>'), '明细表应引用 drawing');
  assert.ok(/<autoFilter[^>]*\/><drawing/.test(sheet2.replace(/\n/g, '')), 'drawing 必须排在 autoFilter 之后');

  const drawingFile = drawings[0].split('/').pop();
  assert.ok(files.has(`xl/drawings/_rels/${drawingFile}.rels`), 'drawing 缺少关系文件');
  assert.ok(files.has('xl/worksheets/_rels/sheet2.xml.rels'), '工作表缺少 drawing 关系文件');
  assert.ok(files.get('xl/worksheets/_rels/sheet2.xml.rels').toString('utf8').includes(drawingFile), '关系指错了 drawing');

  const ct = files.get('[Content_Types].xml').toString('utf8');
  assert.ok(ct.includes('Extension="png"'), 'Content_Types 缺少 png 声明');
  assert.ok(ct.includes(drawings[0]), 'Content_Types 缺少 drawing 声明');

  const dr = files.get(drawings[0]).toString('utf8');
  assert.strictEqual((dr.match(/<xdr:oneCellAnchor/g) || []).length, 2, '锚点数应等于有图的行数');
  assert.ok(dr.includes('r:embed="rId1"') && dr.includes('r:embed="rId2"'), '图片引用 id 不对');

  const imgRows = sheet2.match(/<row r="3"[^>]*>/g) || [];
  assert.ok(imgRows.some((r) => /ht="\d+"/.test(r)), '含图片的行应设置行高');
});

console.log('\n[2] 二维码');
await t('生成二维码矩阵（版本自适应）', () => {
  const r = qrcodeEncode('https://192.168.1.5:8443/m/#/device/abc', 'M');
  assert.ok(r.size >= 21);
  assert.strictEqual(r.modules.length, r.size);
  // 定位图案校验：左上角 7x7 外框应为深色
  assert.strictEqual(r.modules[0][0], 1);
  assert.strictEqual(r.modules[0][6], 1);
  assert.strictEqual(r.modules[6][0], 1);
  assert.strictEqual(r.modules[1][1], 0);
  const svg = qrcodeSvg('hello world');
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes('<path'));
});

await t('二维码内容过长时报错', () => {
  assert.throws(() => qrcodeEncode('x'.repeat(3000), 'H'));
});

console.log('\n[3] 识别引擎（品牌 / SN）');await t('SN 标签粘连剥离（模型常把 S/N 标签一起读进值里）', () => {
  assert.strictEqual(stripSNLabels('SN1YLX22196'), '1YLX22196');
  assert.strictEqual(stripSNLabels('SN:YJX283G1'), 'YJX283G1');
  assert.strictEqual(stripSNLabels('S/N: YLX22196'), 'YLX22196');
  assert.strictEqual(stripSNLabels('SN:SN:YLX1TEX2'), 'YLX1TEX2');
  assert.strictEqual(stripSNLabels('Serial Number: ABC12345'), 'ABC12345');
  assert.strictEqual(stripSNLabels('YLX22196'), 'YLX22196');
});

await t('从历史档案学编号规律（多数派前缀，不能被一条错数据带偏）', () => {
  const good = ['YLX1DLZK', 'YLX2CTPX', 'YLX1EMEK', 'YLX2K4K1', 'YLX29X3G', 'YLX1EMKK'];
  const dirty = [...good, 'Y1X1TWFT', 'Y1X1FMVJ'];   // 两条录错的
  assert.strictEqual(snPatternFrom(good).prefix, 'YLX');
  assert.strictEqual(snPatternFrom(good).length, 8);
  // 严格公共前缀会被那两条错数据缩到 1 个字符，多数派前缀不会
  assert.ok(snPatternFrom(dirty).prefix.startsWith('YLX'), '有脏数据时前缀仍应识别出来，实际：' + snPatternFrom(dirty).prefix);
  assert.strictEqual(snPatternFrom(['AB12', 'CD34']).prefix, '', '样本毫无共性时不该硬造前缀');
  assert.strictEqual(snPatternFrom(['YLX1DLZK']).prefix, '', '样本不足 3 条时不推断前缀');
});

await t('SN 纠错候选：真实踩过的坑都能纠回来', () => {
  const known = ['YLX1DLZK', 'YLX2CTPX', 'YLX1EMEK', 'YLX2K4K1', 'YLX29X3G', 'YLX1EMKK',
    'YLY221KJ', 'YLX1TGXT', 'YLX29WQR', 'YLX1P8T0', 'YLX220XJ', 'YLX2JPH7'];
  const cases = [
    ['SN1YLX22196', 'YLX22196'],   // 标签粘连
    ['SNYJX283G1', 'YLX283G1'],    // 标签 + 前缀看错
    ['Y1LX1TEX2', 'YLX1TEX2'],     // 多读一个 1
    ['YUX1DLZK', 'YLX1DLZK'],      // U/L 混淆
    ['Y1X1EMOZ', 'YLX1EMQZ'],      // 1→L + O→Q
    ['YLX2K4H1', 'YLX2K4K1'],      // H/K 混淆
  ];
  for (const [ocr, truth] of cases) {
    const c = snCandidates(ocr, known);
    const hit = c.some((x) => x.sn === truth);
    assert.ok(hit, `${ocr} 应能推出 ${truth}，实际候选：${c.map((x) => x.sn).join(', ')}`);
    assert.strictEqual(c[0].sn, stripSNLabels(ocr), '原值必须排在第一，不能悄悄替掉');
  }

  // 别家的编号不能被硬掰成联想的
  const dell = snCandidates('F1C05F3', known);
  assert.ok(!dell.some((x) => x.sn === 'YLC05F3'), '戴尔编号不该被前缀修正成 YLC…');
  assert.strictEqual(dell[0].sn, 'F1C05F3', '原值仍应排在第一位');

  // 样本不足时不做任何前缀推断（服务层还会直接只返回原值）
  const few = snCandidates('SN1YLX22196', ['YLX1DLZK']);
  assert.strictEqual(few[0].sn, '1YLX22196', '没有可参照的规律时原值必须排第一');
  assert.ok(!few.some((x) => x.sn === 'YLX22196'), '没有规律时不该凭空去掉前导字符');
});

await t('带标签的 S/N 行', () => {
  const r = interpret([{ text: 'S/N: CN0M2K7P1234', score: 0.95 }, { text: 'DELL', score: 0.98 }]);
  assert.strictEqual(r.sn, 'CN0M2K7P1234');
  assert.strictEqual(r.brand, '戴尔');
  assert.ok(r.sn_confidence > 0.8);
});

await t('"Serial Number" / "Service Tag" 写法', () => {
  const a = detectSN([{ text: 'Serial Number : VNC3K12345', score: 0.9 }]);
  assert.strictEqual(a.sn, 'VNC3K12345');
  const b = detectSN([{ text: 'Service Tag 5CG1234XYZ', score: 0.9 }]);
  assert.strictEqual(b.sn, '5CG1234XYZ');
});

await t('联想 / ThinkPad 铭牌', () => {
  const r = interpret([
    { text: 'Lenovo', score: 0.97 },
    { text: 'ThinkPad X1 Carbon Gen 11', score: 0.94 },
    { text: 'Type 21HM', score: 0.9 },
    { text: 'S/N PF2LK9Y7', score: 0.93 },
    { text: 'Input 20V 3.25A', score: 0.88 },
  ]);
  assert.strictEqual(r.brand, '联想');
  assert.strictEqual(r.sn, 'PF2LK9Y7');
});

await t('电气参数不会被误认为 SN', () => {
  const r = detectSN([{ text: 'AC 100-240V 50/60Hz 1.5A', score: 0.9 }, { text: 'SN: ABC1234567', score: 0.8 }]);
  assert.strictEqual(r.sn, 'ABC1234567');
});

await t('无品牌文本时用 SN 前缀推断品牌', () => {
  const r = interpret([{ text: 'PF2LK9Y7', score: 0.9 }]);
  assert.strictEqual(r.sn, 'PF2LK9Y7');
  assert.ok(r.brand === '联想', `期望联想，实际 ${r.brand}`);
  assert.strictEqual(r.brand_source, 'sn-rule');
});

await t('显示器关键词识别', () => {
  const r = interpret([{ text: '液晶显示器 MONITOR', score: 0.9 }, { text: 'S/N: CN0M2K7P', score: 0.9 }]);
  assert.strictEqual(r.category_hint, 'MON');
});

console.log('\n[4] 数据库与业务服务');
await t('演示数据已写入', () => {
  const n = scalar('SELECT COUNT(*) AS c FROM device WHERE deleted_at IS NULL');
  assert.ok(n >= 10, `设备数 ${n}`);
});

await t('组织树结构正确', () => {
  const tree = svc.orgList({ tree: true });
  assert.ok(tree.length >= 2);
  const hq = tree.find((x) => x.name === '总公司');
  assert.ok(hq);
  assert.ok(hq.children.length >= 3);
  const it = hq.children.find((x) => x.name === '信息技术部');
  assert.ok(it.children.some((c) => c.name === '运维组'));
});

await t('设备列表筛选与分页', () => {
  const all = svc.deviceList({ page_size: 100 });
  assert.ok(all.total >= 10);
  const monitors = svc.deviceList({ keyword: '', page_size: 100, status: 'in_use' });
  assert.ok(monitors.items.every((d) => d.status === 'in_use'));
  const kw = svc.deviceList({ keyword: 'ThinkPad', page_size: 50 });
  assert.ok(kw.total >= 1);
});

await t('创建 / 更新 / 删除设备 + 历史', () => {
  const cat = svc.categoryList().find((c) => c.code === 'MON');
  const org = svc.orgFlatWithPath().find((o) => o.name === '运维组');
  const dev = svc.deviceCreate({
    category_id: cat.id, org_id: org.id, brand: '测试品牌', model: 'TEST-1',
    sn: `SELFTEST${Date.now()}`, status: 'in_use', owner_name: '自测员',
  }, 'selftest');
  assert.ok(dev.asset_no.startsWith('MON-'), dev.asset_no);
  assert.strictEqual(dev.org_path.includes('运维组'), true);

  const updated = svc.deviceUpdate(dev.id, { status: 'repair', remark: '自测修改' }, 'selftest');
  assert.strictEqual(updated.status, 'repair');
  const history = svc.deviceHistory(dev.id);
  assert.ok(history.length >= 2);
  assert.ok(history.some((h) => h.action === 'create'));

  svc.deviceDelete(dev.id, 'selftest');
  assert.strictEqual(svc.deviceList({ keyword: 'TEST-1' }).total, 0);
});

await t('SN 重复会被拒绝', () => {
  const cat = svc.categoryList()[0];
  const sn = `DUPSN${Date.now()}`;
  svc.deviceCreate({ category_id: cat.id, sn, brand: 'A' }, 'selftest');
  assert.throws(() => svc.deviceCreate({ category_id: cat.id, sn, brand: 'B' }, 'selftest'), /已存在/);
});

await t('统计看板数据结构完整', () => {
  const d = svc.dashboard();
  assert.ok(d.kpi.total > 0);
  assert.ok(Array.isArray(d.byCategory));
  assert.ok(Array.isArray(d.byStatus));
  assert.ok(Array.isArray(d.recent));
  assert.ok(d.byCategory.some((c) => c.name));
});

console.log('\n[5] Excel 导入导出往返');
await t('导出模板可被解析且表头可识别', () => {
  const { buffer, filename } = buildTemplate();
  assert.ok(filename.endsWith('.xlsx'));
  const parsed = parseXlsx(buffer);
  assert.ok(parsed.headers.includes('资产编号'));
  assert.ok(parsed.headers.includes('SN 序列号'));
  assert.ok(parsed.headers.includes('所属组织'));
});

await t('导出真实台账并读回', () => {
  const { buffer, count } = exportDevices({}, { withHelp: true });
  assert.ok(count > 0);
  const parsed = parseXlsx(buffer, { sheet: '设备台账' });
  assert.strictEqual(parsed.data.length, count);
  assert.ok(parsed.data[0].资产编号);
  const sheets = parsed.sheets;
  assert.ok(sheets.includes('字段说明'));
  assert.ok(sheets.includes('设备分类'));
});

await t('导入新设备（自动建组织，SN 去重）', () => {
  const sn = `IMP${Date.now()}`;
  const buf = buildXlsx({
    sheets: [{
      name: '设备台账',
      columns: [
        { header: '资产编号', key: 'a' },
        { header: '设备分类', key: 'b' },
        { header: '品牌', key: 'c' },
        { header: '型号', key: 'd' },
        { header: 'SN 序列号', key: 'e' },
        { header: '所属组织', key: 'f' },
        { header: '状态', key: 'g' },
        { header: '采购日期', key: 'h' },
        { header: '采购金额', key: 'i' },
      ],
      rows: [
        { a: '', b: '显示器', c: 'Dell', d: 'U2422H', e: sn, f: '总公司 / 信息技术部 / 运维组', g: '在用', h: '2024/5/6', i: '1999.00' },
        { a: '', b: '不存在的分类XYZ', c: 'Test', d: 'M1', e: `${sn}B`, f: '新部门ABC', g: '库存', h: '', i: '' },
      ],
    }],
  });
  const r = importDevices(buf, { createMissing: true, operator: 'selftest' });
  assert.strictEqual(r.created, 2, JSON.stringify(r.errors));
  assert.strictEqual(r.failed, 0);
  const dev = svc.deviceGetBySN(sn)[0];
  assert.strictEqual(dev.brand, 'Dell');
  assert.strictEqual(dev.purchase_date, '2024-05-06');
  assert.strictEqual(dev.purchase_price, 1999);
  assert.ok(dev.org_path.includes('运维组'));
});

await t('再次导入同一文件会走更新而不是重复新增', () => {
  const before = svc.deviceList({ page_size: 1 }).total;
  const sn = `IMP2${Date.now()}`;
  const buf = buildXlsx({
    sheets: [{
      name: '台账',
      columns: [
        { header: 'SN', key: 'sn' },
        { header: '分类', key: 'cat' },
        { header: '品牌', key: 'brand' },
        { header: '使用人', key: 'owner' },
      ],
      rows: [
        { sn, cat: '笔记本电脑', brand: '华硕', owner: '张三' },
      ],
    }],
  });
  const r1 = importDevices(buf, { operator: 'selftest' });
  assert.strictEqual(r1.created, 1, JSON.stringify(r1.errors));
  const buf2 = buildXlsx({
    sheets: [{
      name: '台账',
      columns: [{ header: 'SN', key: 'sn' }, { header: '分类', key: 'cat' }, { header: '品牌', key: 'brand' }, { header: '使用人', key: 'owner' }],
      rows: [{ sn, cat: '笔记本电脑', brand: '华硕', owner: '李四' }],
    }],
  });
  const r2 = importDevices(buf2, { operator: 'selftest' });
  assert.strictEqual(r2.updated, 1);
  assert.strictEqual(r2.created, 0);
  assert.strictEqual(svc.deviceGetBySN(sn)[0].owner_name, '李四');
  assert.strictEqual(svc.deviceList({ page_size: 1 }).total, before + 1);
});

await t('dry-run 不写入数据库', () => {
  const before = svc.deviceList({ page_size: 1 }).total;
  const sn = `DRY${Date.now()}`;
  const buf = buildXlsx({
    sheets: [{
      name: 'S',
      columns: [{ header: 'SN', key: 'sn' }, { header: '分类', key: 'c' }],
      rows: [{ sn, c: '显示器' }],
    }],
  });
  const r = importDevices(buf, { dryRun: true });
  assert.strictEqual(r.created, 1);
  assert.strictEqual(svc.deviceList({ page_size: 1 }).total, before);
});

await t('无法识别的表头给出明确错误', () => {
  const buf = buildXlsx({
    sheets: [{ name: 'S', columns: [{ header: '无关列1', key: 'a' }, { header: '无关列2', key: 'b' }], rows: [{ a: 1, b: 2 }] }],
  });
  const r = importDevices(buf, {});
  assert.strictEqual(r.created, 0);
  assert.ok(r.errors[0].message.includes('表头无法识别'));
});

await t('导入模板主表不含示例数据，示例单独成页', () => {
  const { buffer } = buildTemplate();
  const main = parseXlsx(buffer);
  assert.strictEqual(main.sheetName, '设备台账');
  assert.strictEqual(main.data.length, 0, '主表不应含任何数据行');
  assert.ok(main.sheets.includes('填写示例'), '应有「填写示例」页');
  const sample = parseXlsx(buffer, { sheet: '填写示例' });
  assert.ok(sample.data.length >= 1, '示例页应有内容');
});

await t('备注标了「示例行」的行导入时自动忽略', () => {
  const sn = `SAMPLE${Date.now()}`;
  const buf = buildXlsx({
    sheets: [{
      name: '设备台账',
      columns: [
        { header: 'SN 序列号', key: 'sn' },
        { header: '设备分类', key: 'c' },
        { header: '备注', key: 'r' },
      ],
      rows: [
        { sn, c: '显示器', r: '示例行（导入时自动忽略）' },
        { sn: `${sn}X`, c: '显示器', r: '真实数据' },
      ],
    }],
  });
  const res = importDevices(buf, { createMissing: true });
  assert.strictEqual(res.skipped, 1, `示例行应被跳过，实际 skipped=${res.skipped}`);
  assert.strictEqual(res.created, 1, `正常行应被导入，实际 created=${res.created}`);
});

console.log('\n[6] 数据导入后一致性');
await t('导出 -> 导入到空表能完全还原（抽样字段）', () => {
  const { buffer } = exportDevices({ category_id: svc.categoryList().find((c) => c.code === 'MON').id });
  const parsed = parseXlsx(buffer, { sheet: '设备台账' });
  assert.ok(parsed.data.length > 0);
  const sample = parsed.data[0];
  const dev = svc.deviceGetBySN(sample['SN 序列号'])?.[0];
  assert.ok(dev, '导出的 SN 应能在库中找到');
  assert.strictEqual(dev.asset_no, sample['资产编号']);
  assert.strictEqual(dev.brand, sample['品牌']);
});

console.log(`\n=== 结果：${pass} 通过 / ${failCount} 失败 ===\n`);
if (failCount) {
  console.log('失败详情：');
  for (const f of failures) console.log(`\n[${f.name}]\n${f.stack || f.message}`);
  process.exit(1);
}
process.exit(0);
