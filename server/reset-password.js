/**
 * 重置某个用户的密码（忘记密码 / 管理员账号锁死时使用）
 *
 * 用法：
 *   node server/reset-password.js                      # 重置第一个管理员，随机生成新密码
 *   node server/reset-password.js 我的新密码             # 指定新密码
 *   node server/reset-password.js --user 张三 --pass 新密码
 *   node server/reset-password.js --list                # 列出所有账号
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import { migrate, all } from './db.js';
import { hashPassword, INITIAL_PW_FILE } from './auth.js';

migrate();

const argv = process.argv.slice(2);
let username = null;
let password = null;
let listOnly = false;

for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--user' || argv[i] === '-u') username = argv[++i];
  else if (argv[i] === '--pass' || argv[i] === '-p') password = argv[++i];
  else if (argv[i] === '--list' || argv[i] === '-l') listOnly = true;
  else if (!password && !argv[i].startsWith('-')) password = argv[i];
}

const users = all('SELECT id, username, display_name, role, status FROM app_user ORDER BY created_at');

if (listOnly || users.length === 0) {
  console.log('');
  console.log('当前账号列表：');
  if (!users.length) console.log('  （还没有任何账号，直接启动服务会自动创建管理员）');
  for (const u of users) {
    console.log(`  ${u.username.padEnd(20)} ${String(u.role).padEnd(10)} ${String(u.status).padEnd(10)} ${u.display_name || ''}`);
  }
  console.log('');
  console.log('用法：node server/reset-password.js [--user 用户名] [--pass 新密码]');
  process.exit(0);
}

let target;
if (username) {
  target = users.find((u) => u.username.toLowerCase() === String(username).toLowerCase());
  if (!target) {
    console.error(`找不到用户名「${username}」。可用 --list 查看所有账号。`);
    process.exit(1);
  }
} else {
  target = users.find((u) => u.role === 'admin' && u.status === 'active') || users[0];
}

function generatePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const pick = () => alphabet[crypto.randomInt(0, alphabet.length)];
  const groups = [];
  for (let g = 0; g < 3; g++) {
    let s = '';
    for (let i = 0; i < 4; i++) s += pick();
    groups.push(s);
  }
  return groups.join('-');
}

if (!password) password = generatePassword();
if (password.length < 8) {
  console.error('密码至少 8 位');
  process.exit(1);
}

const { db } = await import('./db.js');
db.prepare(`UPDATE app_user SET password_hash=?, must_change=0, token_version=token_version+1,
            failed_attempts=0, locked_until=NULL, status='active', updated_at=?
            WHERE id=?`).run(hashPassword(password), new Date().toISOString(), target.id);

try { if (fs.existsSync(INITIAL_PW_FILE)) fs.unlinkSync(INITIAL_PW_FILE); } catch { /* ignore */ }

console.log('');
console.log('✔ 密码已重置');
console.log(`   用户名: ${target.username}`);
console.log(`   新密码: ${password}`);
console.log(`   （已顺带解锁并恢复为「正常」状态；该账号之前的所有登录会话已失效）`);
console.log('');
console.log('请用它登录后到「我的账号」里改成自己好记的密码。');
