# 开机自启部署说明

目标：**电脑重启后（即使没人登录 Windows），ITAM 服务和公网隧道都能自动恢复。**

---

## 一、已部署的两个计划任务

| 任务名 | 触发时机 | 运行身份 | 作用 |
| --- | --- | --- | --- |
| `ITAM-Server` | **开机后 20 秒** + 登录时 | `S4U`（无需登录） | 隐藏窗口启动 ITAM 服务，并由**看门狗**保证不死 |
| `ITAM-SakuraFrp` | **开机后 60 秒** | `S4U`（无需登录） | 启动樱花启动器 → 恢复 frpc 与 `itam` 隧道 |

`S4U` = 不需要保存你的 Windows 密码，也不要求你处于登录状态。

查看/管理：`taskschd.msc`（任务计划程序）

---

## 二、为什么需要「看门狗」

Windows 计划任务自带的「失败后重启」对**登录触发型任务不可靠**（实测杀掉进程后任务只标记失败、并不会重跑）。

所以 `ITAM-Server` 实际执行的是 `scripts\watchdog.ps1`：

```
watchdog.ps1  →  循环调用 run-server.cmd  →  node server/index.js
                    ↑______________ 退出即 5 秒后重启 ______________|
```

- 服务崩溃 / 被误杀 / 被 OOM 干掉 → **5 秒内自动拉起**（已实测）
- 连续 6 次「起来就秒退」→ 停止重试并写日志，避免死循环刷日志
- 想让它停：先建 `logs\stop.flag`，再结束 node 进程（`uninstall-autostart.cmd` 已自动处理）

执行细节：

| 文件 | 作用 |
| --- | --- |
| `scripts\install-autostart.ps1` | 注册两个计划任务（S4U + 开机触发 + 登录触发兜底） |
| `scripts\watchdog.ps1` | 看门狗主循环（记录 `logs\watchdog.log`） |
| `scripts\run-server.cmd` | 单次启动服务，stdout/stderr 追加到 `logs\server.log`（UTF-8） |
| `scripts\start-hidden.vbs` | 让看门狗在**完全隐藏的窗口**里运行 |
| `scripts\start-sakura.vbs` | 启动樱花启动器（自动恢复隧道） |
| `scripts\status.ps1` / `status.cmd` | 一键体检：端口、任务、进程、公网、日志 |
| `scripts\restart.cmd` | 重启 ITAM 服务（靠看门狗自动拉起） |
| `scripts\uninstall-autostart.cmd` | 删除计划任务并停止服务 |

---

## 三、常用操作

```bat
scripts\status.cmd              :: 看服务 / 任务 / 隧道 / 日志
scripts\restart.cmd             :: 重启 ITAM 服务
scripts\install-autostart.cmd   :: 重新注册（改过路径或换电脑后用）
scripts\uninstall-autostart.cmd :: 取消开机自启并停止服务
```

手动触发一次（验证用）：

```powershell
Start-ScheduledTask -TaskName 'ITAM-Server'
Start-ScheduledTask -TaskName 'ITAM-SakuraFrp'
```

---

## 四、验证结果（本机实测）

| 测试 | 结果 |
| --- | --- |
| 注册 `S4U + 开机触发` 任务 | ✅ 成功 |
| ITAM 服务随任务启动 | ✅ 进程运行在 **session 0**（与桌面/登录无关） |
| **杀掉服务进程 → 看门狗恢复** | ✅ **6 秒内**自动拉起，健康检查恢复 ok |
| **杀掉樱花全部进程 → 任务恢复** | ✅ 三个进程全部重建，公网隧道回到 **HTTP 200** |
| 公网可达性 | ✅ `https://itam.dengxc.cloud:40259/` → HTTP 200 |

---

## 五、注意事项

1. **不要重复启动**：自启已生效时再双击 `start.bat` 会端口冲突（8080 被占用）。
   要手动前台运行，先执行 `scripts\uninstall-autostart.cmd`。
2. **樱花 GUI**：自启的启动器运行在 session 0，你桌面上看不到它的窗口是正常的；隧道在后台正常运行。
   想在界面上看隧道状态，直接双击 SakuraLauncher 即可。
3. **日志位置**：`logs\server.log`（服务输出）、`logs\watchdog.log`（拉起记录）。
   两个都是 UTF-8，用记事本或 VS Code 打开正常；PowerShell 读取时加 `-Encoding UTF8`。
4. **改过项目路径后**要重新跑一次 `scripts\install-autostart.cmd`（任务里存的是绝对路径）。
5. 电脑**休眠/睡眠**时服务仍在内存中，唤醒后即恢复；**完全断电重启**则由这两个任务接管。
6. 如果不希望开机自启（比如只在需要时手动开），执行 `scripts\uninstall-autostart.cmd` 即可完全撤销。
