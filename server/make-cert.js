/**
 * 生成 HTTPS 证书（CA + 服务器证书链）
 *
 * 为什么不直接用自签名证书？
 *   自签名证书浏览器一定要你手点「继续访问」。这里改成本地自建 CA：
 *     - certs/ca.pem     ← 把这个装到手机/电脑的「受信任的根证书」里，之后永久不再报警告
 *     - certs/cert.pem   ← 服务器证书（含到 CA 的链）
 *     - certs/key.pem    ← 服务器私钥
 *   公网 / 内网穿透（樱花 frp TCP 隧道）场景下，装一次 ca.pem 就能消除证书警告，
 *   手机调用摄像头也不再需要先点「继续访问」。
 *
 * 用法：
 *   node server/make-cert.js
 *   node server/make-cert.js itam.dengxc.cloud              # 追加域名到 SAN
 *   ITAM_CERT_HOSTS="itam.dengxc.cloud,dengxc.cloud" node server/make-cert.js
 *   ITAM_CERT_IPS="1.2.3.4" node server/make-cert.js
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CERT_DIR = path.resolve(__dirname, '..', 'certs');
fs.mkdirSync(CERT_DIR, { recursive: true });

const certPath = path.join(CERT_DIR, 'cert.pem');
const keyPath = path.join(CERT_DIR, 'key.pem');
const caPath = path.join(CERT_DIR, 'ca.pem');

/* ================================================================== *
 * 极简 ASN.1 DER 编码器
 * ================================================================== */
class Asn1 {
  static len(n) {
    if (n < 0x80) return Buffer.from([n]);
    const bytes = [];
    let x = n;
    while (x > 0) { bytes.unshift(x & 0xff); x >>= 8; }
    return Buffer.from([0x80 | bytes.length, ...bytes]);
  }
  static tlv(tag, content) {
    const body = Buffer.isBuffer(content) ? content : Buffer.from(content);
    return Buffer.concat([Buffer.from([tag]), Asn1.len(body.length), body]);
  }
  static seq(...items) { return Asn1.tlv(0x30, Buffer.concat(items)); }
  static set(...items) { return Asn1.tlv(0x31, Buffer.concat(items)); }
  static int(n) {
    if (n === 0) return Buffer.from([0x02, 0x01, 0x00]);
    const bytes = [];
    let x = n;
    while (x > 0) { bytes.unshift(x & 0xff); x = Math.floor(x / 256); }
    if (bytes[0] & 0x80) bytes.unshift(0);
    return Asn1.tlv(0x02, Buffer.from(bytes));
  }
  static bitString(buf) {
    return Asn1.tlv(0x03, Buffer.concat([Buffer.from([0x00]), buf]));
  }
  /** BIT STRING，首字节为「末尾补齐位数」 */
  static bitStrRaw(unusedBits, bytes) {
    return Asn1.tlv(0x03, Buffer.concat([Buffer.from([unusedBits]), Buffer.from(bytes)]));
  }
  static octetString(buf) { return Asn1.tlv(0x04, buf); }
  static bool(v) { return Asn1.tlv(0x01, Buffer.from([v ? 0xff : 0x00])); }
  static null_() { return Buffer.from([0x05, 0x00]); }
  static oid(str) {
    const parts = str.split('.').map(Number);
    const bytes = [parts[0] * 40 + parts[1]];
    for (const p of parts.slice(2)) {
      const stack = [];
      let x = p;
      do { stack.unshift(x & 0x7f); x >>= 7; } while (x > 0);
      for (let i = 0; i < stack.length - 1; i++) stack[i] |= 0x80;
      bytes.push(...stack);
    }
    return Asn1.tlv(0x06, Buffer.from(bytes));
  }
  static utcTime(d) {
    const s = d.toISOString().replace(/[-:T]/g, '').slice(2, 14) + 'Z';
    return Asn1.tlv(0x17, Buffer.from(s, 'ascii'));
  }
  static explicit(n, content) { return Asn1.tlv(0xa0 + n, content); }
  static ctxPrimitive(n, content) {
    const body = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    return Asn1.tlv(0x80 + n, body);
  }
  /** X.509 Extension: SEQUENCE { extnID, [critical], extnValue OCTET STRING } */
  static ext(oidStr, derContent, critical = false) {
    const parts = [Asn1.oid(oidStr)];
    if (critical) parts.push(Asn1.bool(true));
    parts.push(Asn1.octetString(derContent));
    return Asn1.seq(...parts);
  }
}

const OID = {
  CN: '2.5.4.3',
  O: '2.5.4.10',
  C: '2.5.4.6',
  basicConstraints: '2.5.29.19',
  keyUsage: '2.5.29.15',
  extKeyUsage: '2.5.29.37',
  subjectAltName: '2.5.29.17',
  serverAuth: '1.3.6.1.5.5.7.3.1',
  sha256RSA: '1.2.840.113549.1.1.11',
};

const SIG_ALG = Asn1.seq(Asn1.oid(OID.sha256RSA), Asn1.null_());

function rdn(oidStr, value) {
  return Asn1.set(Asn1.seq(Asn1.oid(oidStr), Asn1.tlv(0x0c, Buffer.from(value, 'utf8'))));
}
function makeName({ commonName, org }) {
  return Asn1.seq(rdn(OID.CN, commonName), rdn(OID.O, org), rdn(OID.C, 'CN'));
}

function newKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKeyDer: publicKey, privateKeyPem: privateKey };
}

function sign(tbs, privateKeyPem) {
  const s = crypto.createSign('RSA-SHA256');
  s.update(tbs);
  return s.sign(privateKeyPem);
}

function pem(buf, label) {
  const s = buf.toString('base64').replace(/(.{64})/g, '$1\n').trim();
  return `-----BEGIN ${label}-----\n${s}\n-----END ${label}-----\n`;
}

/* ================================================================== *
 * 1. 生成根 CA
 * ================================================================== */
function makeCA() {
  const { publicKeyDer, privateKeyPem } = newKeyPair();
  const now = new Date();
  const subject = makeName({ commonName: 'ITAM Local CA', org: 'ITAM Local CA' });

  const tbs = Asn1.seq(
    Asn1.explicit(0, Asn1.int(2)),
    Asn1.int(crypto.randomBytes(8).readUInt32BE(0) & 0x7fffffff),
    SIG_ALG,
    subject,
    Asn1.seq(Asn1.utcTime(new Date(now.getTime() - 24 * 3600 * 1000)), Asn1.utcTime(new Date(now.getTime() + 3650 * 24 * 3600 * 1000))),
    subject,
    publicKeyDer,
    Asn1.explicit(3, Asn1.seq(
      // CA:TRUE
      Asn1.ext(OID.basicConstraints, Asn1.seq(Asn1.bool(true)), true),
      // keyUsage: keyCertSign + cRLSign
      Asn1.ext(OID.keyUsage, Asn1.bitStrRaw(1, [0x06]), true),
    )),
  );

  const certDer = Asn1.seq(tbs, SIG_ALG, Asn1.bitString(sign(tbs, privateKeyPem)));
  return { subjectDer: subject, certDer, privateKeyPem, certPem: pem(certDer, 'CERTIFICATE') };
}

/* ================================================================== *
 * 2. 生成服务器证书（由 CA 签发）
 * ================================================================== */
function makeLeaf(ca, { commonName, dns, ips }) {
  const { publicKeyDer, privateKeyPem } = newKeyPair();
  const now = new Date();
  const subject = makeName({ commonName, org: 'ITAM' });

  const sanParts = [
    ...ips.map((n) => Asn1.ctxPrimitive(7, Buffer.from(n.split('.').map(Number)))),
    ...dns.map((n) => Asn1.ctxPrimitive(2, n)),
  ];

  const tbs = Asn1.seq(
    Asn1.explicit(0, Asn1.int(2)),
    Asn1.int(crypto.randomBytes(8).readUInt32BE(0) & 0x7fffffff),
    SIG_ALG,
    ca.subjectDer,                       // issuer = CA
    Asn1.seq(Asn1.utcTime(new Date(now.getTime() - 24 * 3600 * 1000)), Asn1.utcTime(new Date(now.getTime() + 3650 * 24 * 3600 * 1000))),
    subject,
    publicKeyDer,
    Asn1.explicit(3, Asn1.seq(
      Asn1.ext(OID.basicConstraints, Asn1.seq(), true),                       // CA:FALSE
      Asn1.ext(OID.keyUsage, Asn1.bitStrRaw(5, [0xa0]), true),                // digitalSignature + keyEncipherment
      Asn1.ext(OID.extKeyUsage, Asn1.seq(Asn1.oid(OID.serverAuth))),          // serverAuth
      Asn1.ext(OID.subjectAltName, Asn1.seq(...sanParts)),
    )),
  );

  const certDer = Asn1.seq(tbs, SIG_ALG, Asn1.bitString(sign(tbs, ca.privateKeyPem)));
  return { certDer, privateKeyPem, certPem: pem(certDer, 'CERTIFICATE') };
}

/* ================================================================== *
 * 3. 入口
 * ================================================================== */
function localIPs() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal) out.push(i.address);
    }
  }
  return out;
}

const extraDns = [
  ...(process.env.ITAM_CERT_HOSTS || '').split(','),
  ...process.argv.slice(2),
].map((s) => s.trim()).filter(Boolean);

const extraIps = (process.env.ITAM_CERT_IPS || '').split(',').map((s) => s.trim()).filter(Boolean);

const dns = [...new Set(['localhost', 'itam.local', ...extraDns])];
const ips = [...new Set(['127.0.0.1', ...localIPs(), ...extraIps])];
const commonName = extraDns[0] || ips[1] || 'localhost';

console.log('正在生成本地 CA 与服务器证书…');
console.log('  域名 (SAN):', dns.join(', '));
console.log('  IP   (SAN):', ips.join(', '));
console.log('  主域名/CN :', commonName);

const ca = makeCA();
const leaf = makeLeaf(ca, { commonName, dns, ips });

fs.writeFileSync(caPath, ca.certPem, 'utf8');
fs.writeFileSync(keyPath, leaf.privateKeyPem, 'utf8');
// cert.pem 里放「服务器证书 + CA 证书」，Node 会把整条链发给客户端
fs.writeFileSync(certPath, leaf.certPem + ca.certPem, 'utf8');

console.log('');
console.log('✔ 证书已生成：');
console.log(`   服务器证书链: ${certPath}`);
console.log(`   服务器私钥  : ${keyPath}`);
console.log(`   根 CA 证书  : ${caPath}   ← 装到手机/电脑上可彻底消除「不安全」警告`);
console.log('');
console.log('用法：');
console.log('  A. 什么都不装：浏览器会提示「不是私密连接」，点「高级 → 继续访问」即可');
console.log('     （手机同理，点一次之后相机就能用）');
console.log('  B. 想彻底没警告：把 ca.pem 装到设备上');
console.log('     · Windows：双击 ca.pem → 安装证书 → 本地计算机 → 受信任的根证书颁发机构');
console.log('     · Android：设置 → 安全 → 加密与凭据 → 安装证书 → CA 证书 → 选 ca.pem');
console.log('     · iOS    ：AirDrop/邮件把 ca.pem 传到手机 → 安装描述文件 →');
console.log('                设置 → 通用 → 关于本机 → 证书信任设置 → 打开该证书的完全信任');
console.log('');
console.log('重新生成后需要重启服务（node server/index.js）才会生效。');
