# IT 资产管理系统（ITAM）

一套**零外部依赖**的企业 IT 资产管理应用：一个服务端网页做数据存储管理，一个移动端网页负责现场数据录入（手机相机识别设备品牌与 SN），并支持组织架构管理与 Excel 对接。

- **零依赖**：只用 Node.js 内置模块（`node:sqlite` / `node:http` / `node:https` / `node:crypto`），**无需 `npm install`**，不用装数据库。
- **数据本地化**：SQLite 单文件存储，位于 `data/itam.db`，可随时备份。
- **Excel 对接**：一键导出/导入 `.xlsx`（含模板、字段说明、字典页、下拉校验、自动去重）。
- **组织管理**：无限层级组织树（集团 → 公司 → 部门 → 小组），设备按组织挂靠并可聚合统计。
- **移动端**：拍照/扫码识别品牌与 SN，支持条码扫描、从相册识别、人工校正、SN 查重。

---

## 一、快速开始

> 环境要求：**Node.js 22.5+**（本项目使用 `node:sqlite`，需要 Node 22.5 以上版本，推荐 Node 24）。

1. 双击 **`start.bat`**（或 PowerShell 执行 `.\start.ps1`）。
2. 首次运行会自动生成 HTTPS 自签证书，并初始化演示数据。
3. 看到如下提示即启动成功：

```
管理端   http://localhost:8080/
局域网   http://192.168.x.x:8080/
HTTPS 已启用（手机相机可用）
手机访问 https://192.168.x.x:8443/m
```

| 入口 | 地址 | 说明 |
| --- | --- | --- |
| 管理端网页 | `http://localhost:8080/` | 仪表盘 / 设备台账 / 组织 / 分类 / Excel / 回收站 / 设置 |
| 移动端网页 | `http://localhost:8080/m` | 拍照识别、扫码核对（局域网内手机访问） |
| 移动端（相机） | `https://<电脑IP>:8443/m` | **相机必需 HTTPS**，用手机访问此地址 |

### 🔐 首次登录

系统**已启用账号系统**，未登录访问任何页面都会跳转到登录页。

- 首次启动会自动创建管理员账号，控制台打印初始密码（也写入 `data/admin-password.txt`，改密后自动删除）：

```
================================================================
  ⚠️  已创建管理员账号，请立刻记下并登录后修改密码
      用户名: admin
      初始密码: XXXX-XXXX-XXXX
================================================================
```

- **上公网前请务必先改成自己的强密码**：右上角「账号」→ 修改资料 / 密码
- 忘记密码：`node server/reset-password.js`（可加 `--user 张三 --pass 新密码`，`--list` 列出账号）
- 从旧版本升级会自动迁移：原有单账号的用户名与密码**原样保留**，无需重设

> 想把系统暴露到公网（樱花 frp / 自有域名 / 备案要点 / 证书方案），请见 **[docs/public-access.md](docs/public-access.md)**。
> 想让电脑重启后服务自动恢复（含无人登录场景），请见 **[docs/autostart.md](docs/autostart.md)**。

### 📖 使用手册

给使用者（不只是管理员）看的完整操作说明，覆盖登录、台账、手机拍照入库、Excel 导入导出、常见问题：

| 形式 | 位置 | 用途 |
| --- | --- | --- |
| Markdown 源文件 | `docs/使用手册.md` | 便于修改、版本管理 |
| **分享版 HTML** | `docs/使用手册.html` | 单文件、无依赖，可直接发给同事或打印成 PDF |
| **站内页面** | 登录后点左下角「📖 使用手册」，或访问 `/manual` | 同事随时在网页里查 |

改完 `docs/使用手册.md` 后运行 `node scripts/build-manual.js` 重新生成另外两份。

### ⚙️ 开机自启（可选）

`scripts\install-autostart.cmd` 会注册两个计划任务：

| 任务 | 触发 | 说明 |
| --- | --- | --- |
| `ITAM-Server` | 开机后 20 秒（+ 登录时） | 隐藏窗口启动服务，**看门狗**保证崩溃后 5 秒内自动拉起 |
| `ITAM-SakuraFrp` | 开机后 60 秒 | 启动樱花启动器，自动恢复公网隧道 |

两者都用 `S4U` 身份运行——**不需要保存 Windows 密码，也不要求你登录**。

常用命令：`scripts\status.cmd`（体检）· `scripts\restart.cmd`（重启服务）· `scripts\uninstall-autostart.cmd`（取消）

### 👥 用户与权限

内置 4 种角色，在 **用户管理** 页面里给每个人开账号：

| 角色 | 说明 | 可用功能 |
| --- | --- | --- |
| **系统管理员** `admin` | 全部权限 | 所有功能，含用户管理、系统设置、回收站 |
| **资产管理员** `manager` | 设备与数据管理 | 设备增删改、组织/分类、Excel 导入导出、回收站、审计日志 |
| **录入员** `operator` | 日常录入 | 查看 + 新增/编辑设备（含手机拍照录入）、Excel 导出 |
| **只读** `viewer` | 只能查看 | 仪表盘、台账、组织、分类 |

**用户管理能力**（仅系统管理员）：

- 新建 / 编辑 / 删除用户，分配角色与状态（正常 / 待审核 / 已停用）
- 重置密码（生成一次性随机密码，用户下次登录必须改密）
- 解锁被锁定账号、审核自助注册的账号
- 查看**登录日志**（成功 / 失败 / 锁定 / 注册，含 IP 与客户端）
- 保护机制：最后一个管理员**不能被降级、停用或删除**；不能删除自己

**自助注册**（默认关闭，可在系统设置里开启）：

- 可设「注册后需管理员审核」——新账号先进「待审核」，管理员点「通过」才能登录
- 可设注册默认角色（建议 `只读` 或 `录入员`）

**安全设计**：

- 口令 `scrypt` 加盐哈希，数据库内无明文；强度校验（≥8 位、非纯数字/纯字母、不与用户名相同）
- 会话为 HMAC 签名 `HttpOnly` Cookie，携带 `token_version`：**改密 / 停用 / 改角色 / 删除会立刻踢掉该用户所有已登录设备**
- 登录失败双保险：**按 IP 限流**（15 分钟 10 次）+ **按账号锁定**（连续 5 次锁 10 分钟）
- 每次登录/登出/失败/锁定/注册都写入 `login_log` 表
- 所有写操作记入 `device_log` / `audit_log`，操作者记为真实用户名

---

## 二、核心功能

### 1. 服务端网页（管理端）

- **仪表盘**：设备总数/在用/库存/维修/资产总值/保修预警等 KPI，状态分布、分类 TOP、品牌 TOP、最近更新、保修预警、操作记录。
- **设备台账**：多条件检索（关键词/分类/组织/状态/品牌）、分页、批量操作（变更状态、转移组织、交接使用人、删除）、单条增删改查、流转历史、资产二维码。
- **组织架构**：树形组织管理，支持增删改、层级移动、设备数统计。
- **设备分类**：预置显示器/主机/笔记本/打印机/网络/服务器等，可自定义图标、颜色、资产编号前缀、**专属字段**。
- **Excel 对接**：导出（含说明页）、下载模板、上传导入（预览 → 确认 → 结果报告）、导入历史。
- **系统设置**：企业信息、资产编号格式、**识别服务配置**（品牌/SN 识别）。

### 2. 移动端网页（数据录入）

- **拍照识别入库**：调用手机相机 → 自动识别**品牌 / 型号 / SN**，显示置信度，人工校正后一键入库。
- **扫码核对/查询**：扫描资产二维码或 SN 条码，快速查询设备；对具体设备做“扫码核对”一致性校验。
- **从相册识别**：没有摄像头或非 HTTPS 环境下的兜底方案。
- **最近设备**：查看最近更新的设备。

> 移动端相机依赖浏览器 `getUserMedia`，必须在 **HTTPS 或 localhost** 下才能调用。首次手机打开自签 HTTPS 会提示“不安全”，点击「高级 → 继续访问」即可。

---

## 三、品牌 / SN 识别配置（重要）

“识别设备品牌与 SN”由后端 `识别服务` 完成，支持 5 种后端 + 1 种演示模式，在**管理端 → 系统设置 → 识别服务**中配置：

| 提供商 | 需要 | 说明 |
| --- | --- | --- |
| `mock`（默认） | 无需 | 本地模拟，返回示例铭牌文字，用于演示/联调 |
| `baidu` | API Key + Secret Key | 百度智能云「通用文字识别（高精度版）」，中文铭牌效果好 |
| `tencent` | SecretId + SecretKey | 腾讯云「通用印刷体识别」 |
| `aliyun` | AppCode + 接口 URL | 阿里云 OCR 云市场 |
| `vision` | API Key（+ Base URL/模型） | OpenAI 兼容视觉大模型（GPT-4o / Qwen-VL / GLM-4V 等），直接结构化返回 |
| `custom` | 任意 HTTP OCR 接口 | 对接公司内部 OCR 网关 |

**密钥也可以不写库，通过环境变量注入**（优先于页面配置）：
`BAIDU_OCR_API_KEY` / `BAIDU_OCR_SECRET_KEY`、`TENCENT_SECRET_ID` / `TENCENT_SECRET_KEY`、`ALIYUN_OCR_APP_CODE`、`VISION_API_KEY` / `VISION_BASE_URL` / `VISION_MODEL`、`CUSTOM_OCR_URL`。

**识别解析引擎**（`server/lib/recognize.js` + `brands.js`）：
- 内置 80+ 品牌知识库（中英文别名、SN 前缀规则），从文本行或 SN 反推品牌。
- 识别 `S/N` / `Serial Number` / `Service Tag` / `序列号` 等标签后的 SN，过滤电气参数、型号等噪声。
- 输出字段置信度，低于阈值在移动端高亮提示人工确认。
- 识别结果会保存到设备（`sn_source`、`ocr_confidence`、`ocr_raw`、现场照片）。

### 「视觉大模型（OpenAI 兼容）」不限于 GPT —— 国产免费平替

`vision` 走的是 **OpenAI 兼容协议**（`POST {base_url}/chat/completions` + `image_url`），所以任何兼容该协议的国内视觉模型都能用。在**系统设置 → 识别服务 → 服务提供商**选「视觉大模型」后，会出现「**服务商预设**」下拉，选一下即自动填好 Base URL 与模型名，你只需粘贴该平台的 API Key：

| 预设（下拉里直接选） | Base URL | 模型名 | 免费情况 |
| --- | --- | --- | --- |
| **智谱 GLM-4.6V-Flash** ⭐ | `https://open.bigmodel.cn/api/paas/v4` | `glm-4.6v-flash` | **完全免费**，128K 上下文，国内直连 |
| 智谱 GLM-4.6V-Flash（国际站） | `https://api.z.ai/api/paas/v4` | `glm-4.6v-flash` | 同上，走 z.ai |
| 硅基流动 SiliconFlow | `https://api.siliconflow.cn/v1` | `Qwen/Qwen2.5-VL-7B-Instruct` | 注册送额度 + 部分模型免费 |
| 魔搭 ModelScope | `https://api-inference.modelscope.cn/v1` | `Qwen/Qwen2.5-VL-7B-Instruct` | **免费推理额度**，国内直连 |
| 阿里百炼 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-vl-plus` | 新用户百万 token 级免费额度 |
| 火山方舟 豆包视觉 | `https://ark.cn-beijing.volces.com/api/v3` | `doubao-1.5-vision-pro-32k` | 新用户免费额度 |
| 腾讯混元 | `https://api.hunyuan.cloud.tencent.com/v1` | `hunyuan-vision` | 新用户免费额度 |
| Kimi 视觉 | `https://api.moonshot.cn/v1` | `moonshot-v1-8k-vision-preview` | 付费（较便宜） |
| OpenRouter | `https://openrouter.ai/api/v1` | `qwen/qwen2.5-vl-72b-instruct:free` | 带 `:free` 后缀的模型免费 |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` | 付费 |

#### GLM-4.6V-Flash 具体怎么调（已在代码里适配好）

智谱这一档完全免费，**注册即用、无需充值**：到 [open.bigmodel.cn](https://open.bigmodel.cn) 注册 → [API Keys](https://bigmodel.cn/usercenter/proj-mgmt/apikeys) 创建密钥。

最小可用的 `curl` 示例（注意智谱的 `image_url.url` 用的是**裸 base64**，不带 `data:` 前缀）：

```bash
curl -X POST https://open.bigmodel.cn/api/paas/v4/chat/completions \
  -H "Authorization: Bearer 你的APIKey" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "glm-4.6v-flash",
    "messages": [{
      "role": "user",
      "content": [
        { "type": "image_url", "image_url": { "url": "这里放铭牌图片的裸base64" } },
        { "type": "text", "text": "识别这张设备铭牌，输出 JSON：{\"brand\":\"\",\"model\":\"\",\"sn\":\"\"}" }
      ]
    }],
    "thinking": { "type": "disabled" }
  }'
```

系统里对应的 3 个填写项：

| 字段 | 填什么 |
| --- | --- |
| **Base URL** | `https://open.bigmodel.cn/api/paas/v4`（粘贴成 `.../v4/chat/completions` 也行，会自动去重） |
| **模型名** | `glm-4.6v-flash` |
| **API Key** | 智谱控制台的 Key |
| 图片编码方式 | 选「智谱」预设时自动设为**裸 base64**；不确定就选「自动」（先标准、失败自动退回） |

已内置的容错：
- **图片格式自动回退**：`auto` 模式先按 OpenAI 标准 `data:` URL 发送，若被拒再自动改发裸 base64。
- **限流提示**：返回 429 时提示「免费额度被限流」，可把模型换成 `glm-4.1v-thinking-flash` 或 `glm-4v-flash`（同 Key 通用）。
- **URL 去重**：`base_url` 尾部多写 `/chat/completions` 不会拼成重复路径。
- **只对智谱附加** `thinking: {type:"disabled"}`，其它厂商不发送该参数，避免未知参数报错。

> **建议**：如果主要目标是**读准 SN 和品牌**，专门 OCR（百度「通用文字识别（高精度版）」）通常比通用视觉大模型更准、更便宜；视觉大模型的优势是能直接输出结构化的「品牌 + 型号 + SN」。
> 免费额度与模型名会调整，以各平台控制台当前说明为准。

---

## 四、Excel 对接说明

### 导出
管理端「Excel 对接」或台账页「导出」，生成包含 4 个工作表的 `.xlsx`：
`设备台账`（冻结表头、自动筛选、金额/日期格式）、`字段说明`、`设备分类`、`组织架构`。

### 导入
1. 下载「导入模板」，按表头填写（状态、分类列带下拉校验）。
2. 上传 → 系统**按表头智能匹配列**（支持常见别名，如 “SN 序列号 / SN / 序列号 / Service Tag”）。
3. 预览 → 确认 → 导入；结果报告逐行给出错误。

**导入规则**：
- 组织/分类按名称自动匹配；勾选「自动创建」可自动补建缺失项。
- 组织支持路径写法：`总公司 / 信息技术部 / 运维组`。
- **按 SN（其次资产编号）去重**：同 SN 走「更新」，无则「新增」。
- 资产编号留空自动生成（`分类前缀-年份-4位流水号`）。
- 日期兼容 `2024/3/15`、`2024-03-15`、`2024年3月15日` 及 Excel 日期序列号。

---

## 五、数据与备份

- 数据库：`data/itam.db`（SQLite）。
- 现场照片：`data/uploads/`。
- 导出文件缓存：`data/exports/`。
- 备份：`POST /api/backup` 会生成 `data/backups/itam-backup-*.db`（管理端后续可扩展一键下载）。

**重置/清空数据**：`node server/reset-db.js`（或 `npm run reset-db`）会清空 `data/`，下次启动重建并重新初始化演示数据。

---

## 六、安全加固

这一节是**部署时可能想调**的开关。默认值已经按「挂公网隧道 + 局域网混用」的场景调好，不改也能用。

### 6.1 客户端 IP 的判定（`ITAM_TRUSTED_PROXIES`）

登录限流、审计日志都按客户端 IP 计数，而 IP 是从 `X-Forwarded-For` 里取的。为了让这个头不能被随便伪造，程序只在**直连方本身可信**时才采信它：

| 直连方 | 默认是否可信 | 说明 |
| --- | --- | --- |
| `127.0.0.1` / `::1` | ✅ | 本机的 frp / nginx —— 最常见的情况 |
| 私网（`10.*` / `192.168.*` / `172.16-31.*`） | ✅ | 同网段的反代 |
| 公网地址 | ❌ | 它对 `X-Forwarded-For` 说的话一概不理 |

采信时会从右往左取**第一个不可信的地址**（越靠右越接近本机，左边的是客户端自己塞的），所以「每次换一个伪造 IP」不再能打散限流桶。

> 如果连同一局域网里的机器也不信，就设：
> ```
> ITAM_TRUSTED_PROXIES=127.0.0.1
> ```
> 填了就以它为准，不再自动放行整个私网。

### 6.2 限流（`ITAM_RATE_API` / `ITAM_RATE_HEAVY` / `ITAM_LOGIN_GLOBAL_MAX`）

| 环境变量 | 默认 | 作用 |
| --- | --- | --- |
| `ITAM_RATE_API` | `600` | 每个 IP 每分钟最多几次 `/api/*` 请求 |
| `ITAM_RATE_HEAVY` | `240` | 重接口（扫码 / 二维码 / OCR / Excel 导入导出）单独的每分钟上限 |
| `ITAM_LOGIN_GLOBAL_MAX` | `200` | 全站 5 分钟内允许的登录失败总次数（**与 IP 无关**） |

超限返回 `429` 并带 `Retry-After` 头。日常使用（几个人录设备、手机扫码）远到不了这些阈值；它们是用来给自动化爆破和放大攻击封顶的。

`ITAM_RATE_HEAVY` 为什么是 240（不是更小）：手机按一次快门最多发 **2** 个 `/api/scan`（见 `m.js` 的 `serverDecodeFrame`：条码走「扁带→整帧」、二维码走「中心方形→整帧」），而且只在浏览器自带解码器失手后才发 —— 一个「狂按快门」的人约 60 次/分钟 = 120 请求。更关键的是**限流按 IP 计**，几台手机经同一个 NAT / 反代（没转发 XFF）时共用一份配额，所以阈值取单人上界的 2 倍。调到比真实用量还低，安全措施就会变成功能故障（用户狂按快门时弹「请求过于频繁」）。

除限流外还有两道闸门，都是「超了就丢弃（返回 `503` + `Retry-After`）」而不是排队：

- 扫码解码同时最多 **4 个**
- 图像识别（OCR）同时最多 **6 个**

> ⚠️ 闸门的**位置**就是它的全部效力所在，挪一行就静默失效。扫码解码是纯同步 JS，所以「在跑的数量」只有在 `acquire()` 早于第一个 `await`（即早于 `await readBody`）时才涨得上去；套在解码外面的话 24 个并发会全部放行。`tests/security.js` 的 B11 就是钉这件事的（详见 `server/index.js` 里 `scanGate` 的注释）。
>
> 「丢弃」而不是「排队」是刻意的：队列在 socket 缓冲区里，排队的代价是**所有接口一起变慢**，连 `/api/health` 都答不上来 —— 运维就没法判断服务是不是还活着了。

### 6.3 浏览器安全头

所有响应都带 CSP / `X-Frame-Options` / `X-Content-Type-Options` / `Referrer-Policy` / `Permissions-Policy`；HTTPS 下额外带 HSTS。二维码这类由参数拼出来的 SVG 用的是更严的 `default-src 'none'; sandbox`。

CSP 里 `script-src` 保留了 `'unsafe-inline'`（前端有内联脚本和大量内联事件属性，去掉按钮就全失灵），所以它挡不住「站内已注入的内联脚本」，但仍然实际挡掉：外域脚本加载、`eval`、`<object>` 插件、注入 `<base>` 劫持相对地址、把数据外发到其它域名、外域图片。

### 6.4 还不知道 / 没做的

- **登录限流是进程内的内存计数器**，重启即清零，多实例部署不共享。
- **审计日志和 `logs/` 没有轮转**，长期被打会持续增长（`audit_log` 在库里）。真挂公网建议在隧道/反代那一层也加限流并定期清理。
- 仓库里**没有 LICENSE**，也**没有做依赖扫描**（本项目零第三方依赖，供应链面很小）。

---

## 七、目录结构

```
itam/
├─ server/
│  ├─ index.js          # HTTP/HTTPS 服务 + REST API 路由 + 登录门禁 + 权限校验
│  ├─ auth.js           # 账户系统：用户表 / 角色权限 / 会话 / 限流 / 登录日志
│  ├─ db.js             # SQLite 连接、迁移、种子数据
│  ├─ schema.sql        # 表结构
│  ├─ services.js       # 组织/分类/设备/回收站/统计业务逻辑
│  ├─ excel.js          # Excel 导入导出对接层
│  ├─ make-cert.js      # 生成 HTTPS 证书（本地 CA + 服务器证书链）
│  ├─ reset-password.js # 忘记密码时重置某个账号的口令
│  ├─ reset-db.js       # 清空数据
│  └─ lib/
│     ├─ xlsx.js        # 零依赖 xlsx 读写引擎
│     ├─ ocr.js         # 多厂商 OCR 适配器
│     ├─ recognize.js   # 品牌/SN 解析引擎
│     ├─ brands.js      # 品牌知识库
│     ├─ qrcode.js      # 零依赖二维码生成
│     ├─ guard.js       # 安全护栏：可信代理 IP / 限流 / 并发闸门 / 安全响应头
│     └─ http-util.js   # multipart / MIME 工具
├─ public/
│  ├─ index.html        # 管理端
│  ├─ login.html        # 登录页（匿名可访问）
│  ├─ register.html     # 自助注册页（默认关闭）
│  ├─ assets/admin.js   # 管理端逻辑
│  ├─ assets/admin.css  # 管理端样式
│  ├─ assets/auth.css   # 登录/注册页样式
│  └─ m/                # 移动端
│     ├─ index.html
│     └─ ../assets/m.js / m.css
├─ docs/
│  ├─ public-access.md  # 公网访问指南（樱花 frp / 域名 / 备案 / 证书）
│  ├─ autostart.md      # 开机自启部署与看门狗说明
│  ├─ 使用手册.md        # 用户手册（源文件）
│  └─ 使用手册.html      # 用户手册（分享/打印版，单文件）
├─ scripts/             # 自启与运维脚本（计划任务 / 看门狗 / 体检 / 重启 / 手册构建）
├─ logs/                # 运行时日志（server.log / watchdog.log）
├─ tests/
│  ├─ selftest.js       # 后端单测（Excel/QR/识别/CRUD/导入导出）
│  └─ api-smoke.js      # API 冒烟测试（需先启动服务）
├─ data/                # 运行时生成（数据库、照片、导出）
├─ certs/               # 自签证书
├─ start.bat / start.ps1
└─ package.json
```

---

## 八、测试

**推荐直接跑总入口** —— 它自己起临时库 + 临时端口，一个文件一个子进程，**绝不碰真实数据**：

```bash
npm test                      # 跑完所有套件（约 2 分钟）
```

想单独跑某一套：

```bash
npm run selftest              # 后端单测（Excel 往返、二维码、识别引擎、CRUD、导入导出）
npm run ledger                # 设备台账（含跨页批量选择的回归）
npm run render                # 前端渲染冒烟（无需浏览器）
npm run security              # 安全加固回归（自起实例，含限流/XFF/注入/穿越）
npm run security-mutate       # 变异测试：把每个安全修复改回缺陷版，确认断言会变红
npm run bulk-e2e              # 跨页批量操作真实 HTTP 端到端（会真改数据，跑完即删临时库）
```

> 服务类套件请一律走 `tests/all.js` 或 `node __patch/run-isolated.mjs`，
> 不要对着正在运行的实例（8080）跑：那会把失败登录写进真实库、还会把管理员账号锁上。

---

## 九、常见问题

**Q：手机打不开摄像头？**
A：必须用 HTTPS 访问 `https://<电脑IP>:8443/m`；首次会提示“不安全”，点「高级 → 继续访问」。若仍不行，先把 `certs/cert.pem` 安装到手机“信任凭据”，或在移动端点「从相册选图」兜底。

**Q：端口被占用？**
A：设置环境变量 `PORT`（HTTP，默认 8080）、`HTTPS_PORT`（默认 8443）后重启。

**Q：想改资产编号规则？**
A：管理端 → 系统设置 → 资产编号格式，支持 `{PREFIX}` `{YYYY}` `{SEQ:4}` 变量。

**Q：OCR 识别不准？**
A：优先配置 `baidu`（中文铭牌精度高）或 `vision`（视觉大模型结构化提取）；识别后务必人工核对 SN 再入库。

**Q：数据会不会上传到第三方？**
A：只有你在「系统设置」里配置并启用了真实 OCR 服务时，识别图片才会发送到你指定的服务商；其余数据全部存本地。`mock` 模式完全离线。
