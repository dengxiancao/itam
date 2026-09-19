import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "..", "data");

if (fs.existsSync(dataDir)) {
  for (const f of fs.readdirSync(dataDir)) {
    fs.rmSync(path.join(dataDir, f), { recursive: true, force: true });
  }
}
console.log("已清空 data 目录（数据库将在下次启动时重建）");
