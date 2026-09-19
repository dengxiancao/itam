/**
 * Excel (.xlsx) 读写引擎 —— 纯 Node.js 零依赖实现
 *
 * 写：手工拼装 OOXML + zip（使用 node:zlib 的 deflateRawSync）
 * 读：解析 zip 中央目录 + DeflateRaw 解压 + OOXML 解析
 *
 * 支持：多工作表、表头样式、冻结首行、自动筛选、列宽、日期、数字、超链接风格
 */
import zlib from 'node:zlib';

/* ================================================================== *
 *  XML 基础
 * ================================================================== */

export function xmlEscape(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // 去掉 XML 1.0 不允许的控制字符
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

function decodeXmlEntities(s) {
  return String(s ?? '')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** 列号(0 基) -> A, B, ..., AA */
export function colLetter(n) {
  let s = '';
  let x = n + 1;
  while (x > 0) {
    const r = (x - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

/** A -> 0, AA -> 26 */
export function letterCol(s) {
  let n = 0;
  for (const ch of String(s).toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

/* ================================================================== *
 *  ZIP 写入
 * ================================================================== */

function crc32(buf) {
  if (!crc32.table) {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    crc32.table = t;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crc32.table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(d = new Date()) {
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  return { date, time };
}

/**
 * @param {Array<{name:string, data:Buffer|string}>} files
 * @returns {Buffer}
 */
export function zipWrite(files) {
  const { date, time } = dosDateTime();
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8');
    const raw = Buffer.isBuffer(f.data) ? f.data : Buffer.from(String(f.data), 'utf8');
    const crc = crc32(raw);
    const deflated = zlib.deflateRawSync(raw, { level: 9 });
    const useDeflate = deflated.length < raw.length;
    const body = useDeflate ? deflated : raw;
    const method = useDeflate ? 8 : 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);          // version needed
    local.writeUInt16LE(0x0800, 6);      // flag: UTF-8 文件名
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    chunks.push(local, nameBuf, body);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(method, 10);
    cd.writeUInt16LE(time, 12);
    cd.writeUInt16LE(date, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(body.length, 20);
    cd.writeUInt32LE(raw.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...chunks, centralBuf, end]);
}

/* ================================================================== *
 *  ZIP 读取
 * ================================================================== */

/**
 * @returns {Map<string, Buffer>} name -> 解压后的内容
 */
export function zipRead(buf) {
  const files = new Map();
  // 定位 EOCD
  let eocd = -1;
  const minPos = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= minPos; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('不是有效的 xlsx/zip 文件（找不到中央目录）');

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);

    // 读 local header 得到真实数据偏移
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);

    let data;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = zlib.inflateRawSync(raw);
    else throw new Error(`不支持的压缩方式: ${method} (${name})`);

    files.set(name, data);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

/* ================================================================== *
 *  样式表
 * ================================================================== */

const BUILTIN_NUMFMT = {
  general: 0,
  '0': 1,
  '0.00': 2,
  '#,##0': 3,
  '#,##0.00': 4,
  '0%': 9,
  '0.00%': 10,
  'yyyy-mm-dd': 14,
  'h:mm:ss': 21,
};

function buildStyles(extraNumFmts) {
  // 自定义数字格式从 164 开始
  const custom = [];
  const customMap = new Map();
  for (const fmt of extraNumFmts) {
    if (BUILTIN_NUMFMT[fmt] !== undefined) continue;
    if (customMap.has(fmt)) continue;
    customMap.set(fmt, 164 + custom.length);
    custom.push(fmt);
  }

  const numFmtXml = custom.length
    ? `<numFmts count="${custom.length}">${custom
      .map((f) => `<numFmt numFmtId="${customMap.get(f)}" formatCode="${xmlEscape(f)}"/>`)
      .join('')}</numFmts>`
    : '';

  // 字体 0：正文；1：表头（加粗白字）；2：标题（大号加粗）
  const fonts = `<fonts count="3">
<font><sz val="10.5"/><color theme="1"/><name val="微软雅黑"/><charset val="134"/></font>
<font><b/><sz val="10.5"/><color rgb="FFFFFFFF"/><name val="微软雅黑"/><charset val="134"/></font>
<font><b/><sz val="13"/><color theme="1"/><name val="微软雅黑"/><charset val="134"/></font>
</fonts>`;

  const fills = `<fills count="3">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF2563EB"/><bgColor indexed="64"/></patternFill></fill>
</fills>`;

  const borders = `<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFD0D7E2"/></left><right style="thin"><color rgb="FFD0D7E2"/></right><top style="thin"><color rgb="FFD0D7E2"/></top><bottom style="thin"><color rgb="FFD0D7E2"/></bottom><diagonal/></border>
</borders>`;

  // cellXfs 索引：
  // 0 普通 / 1 表头 / 2 标题 / 3 日期 / 4 金额 / 5 整数 / 6 百分比 / 7 边框
  const numFmtForDate = BUILTIN_NUMFMT['yyyy-mm-dd'];
  const xfs = [
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>`,
    `<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>`,
    `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>`,
    `<xf numFmtId="${numFmtForDate}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`,
    `<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`,
    `<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`,
    `<xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`,
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>`,
    `<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`,
  ];

  for (const [fmt, id] of customMap) {
    xfs.push(`<xf numFmtId="${id}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`);
  }

  return {
    customMap,
    xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
${numFmtXml}${fonts}${fills}${borders}
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>
<cellStyles count="1"><cellStyle name="常规" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`,
  };
}

/** 供写入使用的内置 xf 索引 */
export const XF = {
  normal: 0,
  header: 1,
  title: 2,
  date: 3,
  money: 4,
  int: 5,
  percent: 6,
  bordered: 7,
  text: 8,
};

/* ================================================================== *
 *  写入
 * ================================================================== */

/**
 * @param {object} opts
 * @param {string} opts.title       大标题（可空）
 * @param {Array<{header:string, key:string, width?:number, type?:'text'|'number'|'date'|'money'|'int'|'image'}>} opts.columns
 * @param {Array<object>} opts.rows
 * @param {Array<{name:string, columns:any[], rows:any[], title?:string}>} [opts.sheets] 多表模式
 *
 * type: 'image' 的列，行值需为 Buffer（JPEG/PNG 字节），会作为图片嵌进单元格；
 * 行值缺失时该格留空。图片列会自动把行高撑大，无需调用方操心。
 * @returns {Buffer}
 */
export function buildXlsx(opts) {
  const sheetDefs = opts.sheets?.length
    ? opts.sheets
    : [{ name: opts.sheetName || '数据', title: opts.title, columns: opts.columns, rows: opts.rows }];

  const usedNumFmts = [];
  for (const s of sheetDefs) {
    for (const c of s.columns || []) {
      if (c.numFmt) usedNumFmts.push(c.numFmt);
    }
  }
  const styles = buildStyles(usedNumFmts);

  const sharedStrings = [];
  const sstIndex = new Map();
  const sst = (v) => {
    const s = String(v);
    if (sstIndex.has(s)) return sstIndex.get(s);
    const i = sharedStrings.length;
    sharedStrings.push(s);
    sstIndex.set(s, i);
    return i;
  };

  // 图片列：收集所有待嵌入的图，统一编号 xl/media/imageN.<ext>
  const media = [];          // { name, data }
  const sheetDrawings = [];  // 每个 sheet 的锚点列表

  const sheetXmls = [];
  const sheetMeta = [];

  sheetDefs.forEach((sheet, si) => {
    const cols = sheet.columns || [];
    const rows = sheet.rows || [];
    const hasTitle = !!sheet.title;
    const headerRowIdx = hasTitle ? 2 : 1;   // 1 基
    const dataStartIdx = headerRowIdx + 1;

    const imageCols = cols
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.type === 'image');
    const anchors = [];

    const parts = [];
    parts.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
    parts.push('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">');

    // 冻结表头 + 选中单元格
    parts.push(`<sheetViews><sheetView workbookViewId="0"><pane ySplit="${headerRowIdx}" topLeftCell="A${dataStartIdx}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${dataStartIdx}" sqref="A${dataStartIdx}"/></sheetView></sheetViews>`);

    // 列宽
    if (cols.length) {
      parts.push('<cols>');
      cols.forEach((c, i) => {
        parts.push(`<col min="${i + 1}" max="${i + 1}" width="${c.width || 16}" customWidth="1"/>`);
      });
      parts.push('</cols>');
    }

    parts.push('<sheetData>');

    if (hasTitle) {
      parts.push(`<row r="1" ht="26" customHeight="1">`);
      parts.push(`<c r="A1" s="${XF.title}" t="s"><v>${sst(sheet.title)}</v></c>`);
      parts.push('</row>');
    }

    // 表头
    parts.push(`<row r="${headerRowIdx}" ht="22" customHeight="1">`);
    cols.forEach((c, i) => {
      parts.push(`<c r="${colLetter(i)}${headerRowIdx}" s="${XF.header}" t="s"><v>${sst(c.header)}</v></c>`);
    });
    parts.push('</row>');

    // 数据行
    rows.forEach((row, ri) => {
      const r = dataStartIdx + ri;
      const rowImages = imageCols.filter(({ c }) => {
        const v = typeof c.value === 'function' ? c.value(row) : row[c.key];
        return Buffer.isBuffer(v) && v.length;
      });
      parts.push(`<row r="${r}"${rowImages.length ? ' ht="66" customHeight="1"' : ''}>`);
      cols.forEach((c, ci) => {
        const ref = `${colLetter(ci)}${r}`;
        const v = typeof c.value === 'function' ? c.value(row) : row[c.key];
        if (c.type === 'image') {
          // 图片是浮在单元格上层的对象，单元格本身留空（保留边框底色）
          parts.push(`<c r="${ref}" s="${XF.bordered}"/>`);
          if (Buffer.isBuffer(v) && v.length) {
            const isPng = v[0] === 0x89 && v[1] === 0x50;
            const ext = isPng ? 'png' : 'jpeg';
            const idx = media.length + 1;
            media.push({ name: `xl/media/image${idx}.${ext}`, data: v });
            anchors.push({
              col: ci,
              row: r,          // 0 基行号 = r - 1
              mediaIdx: idx,
              ext,
              w: c.imageWidth || 88,
              h: c.imageHeight || 62,
              alt: String(row.asset_no || row.sn || `图 ${idx}`),
            });
          }
          return;
        }
        if (v === undefined || v === null || v === '') {
          parts.push(`<c r="${ref}" s="${XF.bordered}"/>`);
          return;
        }
        const type = c.type || inferType(v);
        if (type === 'number' || type === 'money' || type === 'int' || type === 'percent') {
          const num = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
          if (!isFinite(num)) {
            parts.push(`<c r="${ref}" s="${XF.bordered}" t="s"><v>${sst(v)}</v></c>`);
            return;
          }
          const s = type === 'money' ? XF.money : type === 'int' ? XF.int : type === 'percent' ? XF.percent : XF.bordered;
          parts.push(`<c r="${ref}" s="${s}"><v>${num}</v></c>`);
        } else if (type === 'date') {
          const d = v instanceof Date ? v : new Date(v);
          if (isNaN(d)) {
            parts.push(`<c r="${ref}" s="${XF.bordered}" t="s"><v>${sst(v)}</v></c>`);
          } else {
            const serial = d.getTime() / 86400000 + 25569;
            parts.push(`<c r="${ref}" s="${XF.date}"><v>${serial.toFixed(6)}</v></c>`);
          }
        } else if (c.numFmt && styles.customMap.has(c.numFmt)) {
          const num = typeof v === 'number' ? v : parseFloat(v);
          const idx = 9 + [...styles.customMap.keys()].indexOf(c.numFmt);
          if (isFinite(num)) parts.push(`<c r="${ref}" s="${idx}"><v>${num}</v></c>`);
          else parts.push(`<c r="${ref}" s="${XF.bordered}" t="s"><v>${sst(v)}</v></c>`);
        } else {
          parts.push(`<c r="${ref}" s="${XF.bordered}" t="s"><v>${sst(v)}</v></c>`);
        }
      });
      parts.push('</row>');
    });

    parts.push('</sheetData>');

    // 自动筛选（必须在 dataValidations 之前，这是 OOXML 的元素顺序要求）
    const lastCol = colLetter(Math.max(0, cols.length - 1));
    parts.push(`<autoFilter ref="A${headerRowIdx}:${lastCol}${Math.max(headerRowIdx, dataStartIdx + rows.length - 1)}"/>`);

    // 数据校验（下拉列表）
    if (sheet.dv?.length) {
      parts.push(`<dataValidations count="${sheet.dv.length}">`);
      for (const dv of sheet.dv) {
        const formula = `"${String(dv.values).replace(/"/g, '').slice(0, 250)}"`;
        parts.push(`<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" errorTitle="输入有误" error="请从下拉列表中选择" sqref="${dv.sqref}"><formula1>${xmlEscape(formula)}</formula1></dataValidation>`);
      }
      parts.push('</dataValidations>');
    }

    if (anchors.length) parts.push('<drawing r:id="rId1"/>');

    parts.push('</worksheet>');

    sheetXmls.push(parts.join(''));
    sheetMeta.push({ name: sanitizeSheetName(sheet.name || `Sheet${si + 1}`), index: si + 1, rowCount: rows.length });
    sheetDrawings.push(anchors);
  });

  // 组装 zip
  const files = [];

  const hasImages = media.length > 0;

  files.push({
    name: '[Content_Types].xml',
    data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
${hasImages ? '<Default Extension="jpeg" ContentType="image/jpeg"/>\n<Default Extension="jpg" ContentType="image/jpeg"/>\n<Default Extension="png" ContentType="image/png"/>' : ''}
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
${sheetMeta.map((s) => `<Override PartName="/xl/worksheets/sheet${s.index}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
${sheetDrawings.map((a, i) => (a.length ? `<Override PartName="/xl/drawings/drawing${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>` : '')).filter(Boolean).join('\n')}
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`,
  });

  files.push({
    name: '_rels/.rels',
    data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`,
  });

  files.push({
    name: 'docProps/core.xml',
    data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${xmlEscape(opts.title || 'IT 资产数据')}</dc:title>
<dc:creator>ITAM 资产管理系统</dc:creator>
<cp:lastModifiedBy>ITAM</cp:lastModifiedBy>
<dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>
</cp:coreProperties>`,
  });

  files.push({
    name: 'docProps/app.xml',
    data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
<Application>ITAM</Application>
</Properties>`,
  });

  files.push({
    name: 'xl/workbook.xml',
    data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheetMeta.map((s) => `<sheet name="${xmlEscape(s.name)}" sheetId="${s.index}" r:id="rId${s.index}"/>`).join('')}</sheets>
</workbook>`,
  });

  files.push({
    name: 'xl/_rels/workbook.xml.rels',
    data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheetMeta.map((s) => `<Relationship Id="rId${s.index}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${s.index}.xml"/>`).join('\n')}
<Relationship Id="rId${sheetMeta.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId${sheetMeta.length + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`,
  });

  files.push({ name: 'xl/styles.xml', data: styles.xml });

  files.push({
    name: 'xl/sharedStrings.xml',
    data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sharedStrings.length}" uniqueCount="${sharedStrings.length}">
${sharedStrings.map((s) => `<si><t xml:space="preserve">${xmlEscape(s)}</t></si>`).join('')}
</sst>`,
  });

  sheetXmls.forEach((xml, i) => {
    files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: xml });
  });

  // 图片：drawing 部件 + 关系 + 媒体文件
  if (hasImages) {
    sheetDrawings.forEach((anchors, i) => {
      if (!anchors.length) return;
      const drawingIdx = i + 1;
      files.push({
        name: `xl/drawings/drawing${drawingIdx}.xml`,
        data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
${anchors.map((an, k) => {
  // 行号从 1 基转 0 基；oneCellAnchor 固定尺寸，editAs 让它跟着单元格走
  const row0 = an.row - 1;
  return `<xdr:oneCellAnchor editAs="oneCell">
<xdr:from><xdr:col>${an.col}</xdr:col><xdr:colOff>9525</xdr:colOff><xdr:row>${row0}</xdr:row><xdr:rowOff>9525</xdr:rowOff></xdr:from>
<xdr:ext cx="${an.w * 9525}" cy="${an.h * 9525}"/>
<xdr:pic>
<xdr:nvPicPr><xdr:cNvPr id="${k + 1}" name="照片${k + 1}" descr="${xmlEscape(an.alt)}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>
<xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rId${k + 1}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>
<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${an.w * 9525}" cy="${an.h * 9525}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>
</xdr:pic>
<xdr:clientData/>
</xdr:oneCellAnchor>`;
}).join('\n')}
</xdr:wsDr>`,
      });

      files.push({
        name: `xl/drawings/_rels/drawing${drawingIdx}.xml.rels`,
        data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${anchors.map((an, k) => `<Relationship Id="rId${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${an.mediaIdx}.${an.ext}"/>`).join('\n')}
</Relationships>`,
      });

      files.push({
        name: `xl/worksheets/_rels/sheet${drawingIdx}.xml.rels`,
        data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${drawingIdx}.xml"/>
</Relationships>`,
      });
    });

    for (const m of media) files.push({ name: m.name, data: m.data });
  }

  return zipWrite(files);
}

function inferType(v) {
  if (typeof v === 'number') return 'number';
  if (v instanceof Date) return 'date';
  return 'text';
}

function sanitizeSheetName(name) {
  let s = String(name).replace(/[\\/?*[\]:]/g, '_').slice(0, 31);
  if (!s) s = 'Sheet';
  return s;
}

/* ================================================================== *
 *  读取
 * ================================================================== */

/**
 * 解析 xlsx -> 每个工作表转成对象数组
 * @param {Buffer} buf
 * @param {{sheet?: string|number, headerRow?: number, maxRows?: number}} [opts]
 * @returns {{sheets:string[], data: Array<Record<string,any>>, headers:string[], sheetName:string}}
 */
export function parseXlsx(buf, opts = {}) {
  const files = zipRead(buf);
  const get = (n) => files.get(n)?.toString('utf8') ?? '';

  // sharedStrings
  const sharedStrings = [];
  const sstXml = get('xl/sharedStrings.xml');
  if (sstXml) {
    for (const m of sstXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      const inner = m[1];
      // 拼接所有 <t> 内容（富文本会有多个 run）
      let text = '';
      for (const t of inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) text += decodeXmlEntities(t[1]);
      if (!text && /<t\/>/.test(inner)) text = '';
      sharedStrings.push(text);
    }
  }

  // workbook 工作表列表
  const wbXml = get('xl/workbook.xml');
  const relXml = get('xl/_rels/workbook.xml.rels');
  const relMap = new Map();
  for (const m of relXml.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    relMap.set(m[1], m[2]);
  }
  const sheetList = [];
  for (const m of wbXml.matchAll(/<sheet[^>]*name="([^"]*)"[^>]*r:id="([^"]+)"/g)) {
    const target = relMap.get(m[2]) || '';
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`.replace(/\/\.\//g, '/');
    sheetList.push({ name: decodeXmlEntities(m[1]), path: path.replace('xl/xl/', 'xl/') });
  }
  if (!sheetList.length) sheetList.push({ name: 'Sheet1', path: 'xl/worksheets/sheet1.xml' });

  const wanted = opts.sheet === undefined ? 0
    : typeof opts.sheet === 'number' ? opts.sheet
      : sheetList.findIndex((s) => s.name === opts.sheet);

  const chosen = sheetList[wanted] || sheetList[0];
  const sheetXml = get(chosen.path) || get('xl/worksheets/sheet1.xml');

  const rows = [];

  // 逐行切分：按 <row ...> ... </row> 边界
  for (const rm of sheetXml.matchAll(/<row\b([^>]*)>([\s\S]*?)(?=<\/row>)/g)) {
    const attrs = rm[1];
    const rMatch = attrs.match(/\br="(\d+)"/);
    const rIdx = rMatch ? parseInt(rMatch[1], 10) : rows.length + 1;
    const rowBody = rm[2];
    const cells = [];
    // 逐个 <c> 切分，兼容自闭合与成对标签
    for (const cm of rowBody.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const cAttrs = cm[1];
      const body = cm[2] || '';
      const refM = cAttrs.match(/\br="([A-Z]+)(\d+)"/);
      const colIdx = refM ? letterCol(refM[1]) : cells.length;
      const tM = cAttrs.match(/\bt="([^"]+)"/);
      const type = tM ? tM[1] : 'n';

      let value = null;
      if (type === 'inlineStr') {
        const t = body.match(/<t[^>]*>([\s\S]*?)<\/t>/);
        value = t ? decodeXmlEntities(t[1]) : '';
      } else {
        const vm = body.match(/<v>([\s\S]*?)<\/v>/);
        const rawV = vm ? decodeXmlEntities(vm[1]) : null;
        if (rawV === null) value = null;
        else if (type === 's') value = sharedStrings[parseInt(rawV, 10)] ?? '';
        else if (type === 'b') value = rawV === '1';
        else if (type === 'str') value = rawV;
        else {
          const n = Number(rawV);
          value = isFinite(n) ? n : rawV;
        }
      }
      cells[colIdx] = value;
    }
    rows.push({ r: rIdx, cells });
  }

  // 表头行检测：默认第 1 行；若第 1 行只有一个非空单元格（典型为大标题）
  // 而第 2 行有多个非空单元格，则把第 2 行当作表头。
  let headerRowIdx = opts.headerRow ?? 1;
  if (opts.headerRow === undefined) {
    const nonEmpty = (row) => (row?.cells || []).filter((c) => c !== null && c !== undefined && c !== '').length;
    const first = rows.find((x) => x.r === 1);
    const second = rows.find((x) => x.r === 2);
    if (first && second && nonEmpty(first) === 1 && nonEmpty(second) > 1) headerRowIdx = 2;
  }

  const headerCells = rows.find((x) => x.r === headerRowIdx)?.cells ?? [];
  const headers = headerCells.map((h, i) => (h === null || h === undefined || h === '' ? `__col${i}` : String(h).trim()));

  const out = [];
  const seen = new Set();
  for (const row of rows) {
    if (row.r <= headerRowIdx) continue;
    const obj = {};
    let hasValue = false;
    headers.forEach((h, i) => {
      let v = row.cells[i];
      if (v === undefined) v = null;
      if (typeof v === 'string') v = v.trim();
      if (v !== null && v !== '') hasValue = true;
      let key = h;
      let n = 2;
      while (Object.prototype.hasOwnProperty.call(obj, key)) key = `${h}_${n++}`;
      obj[key] = v;
    });
    if (!hasValue) continue;
    const sig = JSON.stringify(obj);
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(obj);
    if (opts.maxRows && out.length >= opts.maxRows) break;
  }

  return {
    sheets: sheetList.map((s) => s.name),
    sheetName: chosen.name,
    headers: headers.filter((h) => !h.startsWith('__col')),
    data: out,
  };
}
