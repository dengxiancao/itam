/**
 * HTTP 小工具：multipart/form-data 解析、MIME 判定
 */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pdf': 'application/pdf',
};

export function mimeOf(ext) {
  return MIME[String(ext).toLowerCase()] || 'application/octet-stream';
}

export function extOf(name = '') {
  const m = String(name).match(/(\.[a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : '';
}

/** 读取请求体（带大小上限） */
export function readBody(req, limit = 16 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error(`请求体过大（上限 ${Math.round(limit / 1024 / 1024)}MB）`), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export async function readJson(req, limit) {
  const buf = await readBody(req, limit);
  if (!buf.length) return {};
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch {
    throw Object.assign(new Error('请求体不是合法的 JSON'), { status: 400 });
  }
}

/**
 * 解析 multipart/form-data
 * @returns {{fields: Record<string,string>, files: Record<string,{filename:string, mime:string, data:Buffer}>}}
 */
/** 一次 multipart 最多允许几段。正常表单最多十几段（image/original/thumb + 几个字段） */
const MAX_PARTS = 64;

export function parseMultipart(buf, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!m) throw Object.assign(new Error('缺少 multipart boundary'), { status: 400 });
  const boundary = `--${(m[1] || m[2]).trim()}`;
  const bBuf = Buffer.from(boundary, 'utf8');

  const fields = {};
  const files = {};

  // 找出所有 boundary 位置
  const positions = [];
  let idx = buf.indexOf(bBuf, 0);
  while (idx !== -1) {
    positions.push(idx);
    // 段数超限直接拒，别把后面几百万次循环跑完再报错
    if (positions.length > MAX_PARTS + 1) {
      throw Object.assign(new Error(`multipart 分段过多（上限 ${MAX_PARTS} 段）`), { status: 400 });
    }
    idx = buf.indexOf(bBuf, idx + bBuf.length);
  }
  if (positions.length < 2) throw Object.assign(new Error('multipart 数据不完整'), { status: 400 });

  for (let i = 0; i < positions.length - 1; i++) {
    let start = positions[i] + bBuf.length;
    // 跳过 CRLF
    if (buf[start] === 0x0d && buf[start + 1] === 0x0a) start += 2;
    else if (buf[start] === 0x0a) start += 1;
    let end = positions[i + 1];
    // 去掉尾随 CRLF
    if (buf[end - 2] === 0x0d && buf[end - 1] === 0x0a) end -= 2;
    else if (buf[end - 1] === 0x0a) end -= 1;
    if (end <= start) continue;

    /*
     * ⚠️ 只在本段范围内找头结束标记。
     *
     * 老写法是 `buf.indexOf('\r\n\r\n', start)` —— 它会在**整个请求体**里往后搜。
     * 攻击者只要把请求体做成「几万个边界 + 每段 1 个字节」，每段都会白扫一遍后面的
     * 全部字节，总复杂度 O(n²) 且 parseMultipart 是**同步**的：
     * 2026-09-23 实测 1MB 的请求体就能把事件循环卡住 16 秒（整个服务失去响应）。
     * 改成先 subarray 出本段（零拷贝）再查找，单段搜索长度就与段长成正比。
     */
    const part = buf.subarray(start, end);
    const headerEnd = part.indexOf('\r\n\r\n');
    const headerEndAlt = part.indexOf('\n\n');
    let sep = headerEnd;
    if (sep === -1 || (headerEndAlt !== -1 && headerEndAlt < sep)) sep = headerEndAlt;
    if (sep === -1) continue;
    const sepLen = sep === headerEnd ? 4 : 2;

    const headerText = part.toString('utf8', 0, sep);
    const data = part.subarray(sep + sepLen);

    const nameM = /name="([^"]*)"/i.exec(headerText);
    const fileM = /filename="([^"]*)"/i.exec(headerText);
    const typeM = /Content-Type:\s*([^\r\n;]+)/i.exec(headerText);
    const name = nameM ? nameM[1] : `field${i}`;

    if (fileM) {
      files[name] = {
        filename: fileM[1] || 'upload.bin',
        mime: typeM ? typeM[1].trim() : 'application/octet-stream',
        data: Buffer.from(data),
      };
    } else {
      fields[name] = data.toString('utf8').trim();
    }
  }

  return { fields, files };
}

/** 简单的 multipart 构造（用于自测） */
export function buildMultipart(fields = {}, files = {}, boundary = `----itam${Date.now()}`) {
  const parts = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`, 'utf8'));
  }
  for (const [k, f] of Object.entries(files)) {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${k}"; filename="${f.filename}"\r\nContent-Type: ${f.mime || 'application/octet-stream'}\r\n\r\n`,
      'utf8',
    ));
    parts.push(Buffer.isBuffer(f.data) ? f.data : Buffer.from(String(f.data), 'utf8'));
    parts.push(Buffer.from('\r\n', 'utf8'));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));
  return { boundary, body: Buffer.concat(parts) };
}
