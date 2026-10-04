/**
 * 本机地址挑选 —— 单独抽出来是为了**能测**。
 *
 * 为什么要挑：一台电脑上往往有多个 IPv4 地址（虚拟网卡、热点网段、链路本地…），
 * 随手拿第一个会连带出三个静默故障：
 *   · 导出的 Excel 里照片链接写成别人打不开的地址
 *   · GLPI Agent 安装指引给出一个装完永远上报不上来的地址
 *   · Excel 实时链接里"推荐"的那个地址取数报「无法获取数据」
 *
 * 实测踩到的例子：`os.networkInterfaces()` 里排前面的可能是 `192.168.137.1`，
 * 那是 Windows「移动热点 / Internet 连接共享」自己开的网段（192.168.137.x 是它的固定默认值），
 * 真正的办公网往往在无线网卡上（如 `192.168.1.x`）。
 */

/** 虚拟网卡的名字特征：这些地址别的电脑访问不到 */
const VIRTUAL_NAME = /vEthernet|Hyper-?V|VMware|VirtualBox|Loopback|WSL|Bluetooth|TAP|Npcap|Radmin|ZeroTier|Tailscale|Docker/i;

/**
 * 从 `os.networkInterfaces()` 的结果里挑出可用的局域网地址，按可信度排序。
 * @param {object} ifaces os.networkInterfaces() 的返回值
 * @returns {string[]} 排好序的 IPv4 地址
 */
export function rankLocalIPs(ifaces = {}) {
  const out = [];
  for (const [name, list] of Object.entries(ifaces)) {
    for (const i of list || []) {
      if (!i || i.family !== 'IPv4' || i.internal) continue;
      const ip = String(i.address || '');
      if (!ip) continue;
      if (ip.startsWith('169.254.')) continue;          // 链路本地：网线没插好时的自赋值
      if (VIRTUAL_NAME.test(name)) continue;            // 虚拟网卡
      out.push({ ip, name });
    }
  }
  const score = ({ ip, name }) => {
    let s = 0;
    // 192.168.137.x 是 Windows 共享/热点的固定网段 —— 它排在前面过，于是被当成了"局域网地址"
    if (ip.startsWith('192.168.137.')) s -= 100;
    if (/无线|WLAN|Wi-?Fi/i.test(name)) s += 2;         // 办公网常常走无线
    else if (/以太网|Ethernet/i.test(name)) s += 1;
    return s;
  };
  out.sort((a, b) => score(b) - score(a));
  return out.map((x) => x.ip);
}
