import os from "node:os";
import net from "node:net";
import fs from "node:fs";
import { performance } from "node:perf_hooks";
//=================
function getDiskInfo() {
try {
const stats = fs.statfsSync("/");
const totalBytes = stats.bsize * stats.blocks;
const freeBytes = stats.bsize * stats.bavail;
const usedBytes = totalBytes - freeBytes;
return `> *Total:* ${formatBytes(totalBytes)}
> *Used:* ${formatBytes(usedBytes)}
> *Free:* ${formatBytes(freeBytes)}`;
} catch {
return "> *Total:* N/A\n> *Used:* N/A\n> *Free:* N/A";
}
}
//=================
function getPing() {
return new Promise((resolve) => {
const start = performance.now();
const sock = new net.Socket();
sock.setTimeout(2000);
sock.on("connect", () => {
const latency = (performance.now() - start).toFixed(2);
sock.destroy();
resolve(`${latency} ms`);
});
sock.on("error", () => resolve("Timeout"));
sock.on("timeout", () => {
sock.destroy();
resolve("Timeout");
});
sock.connect(53, "8.8.8.8");
});
}
//=================
function formatBytes(bytes) {
if (!bytes || bytes === 0) return "0 B";
const units = ["B", "KB", "MB", "GB", "TB"];
const i = Math.floor(Math.log(bytes) / Math.log(1024));
return `${(bytes / 1024 ** i).toFixed(2)} ${units[i]}`;
}
//=================
function formatUptime(sec) {
const d = Math.floor(sec / 86400),
h = Math.floor((sec % 86400) / 3600),
m = Math.floor((sec % 3600) / 60);
return `${d}d ${h}h ${m}m`;
}
//=================
const handler = async (m, { conn, isBotAdmins, isAdmins, command, args, text, isAccess, prefix }) => {
if (!isAccess) return m.reply(mess.owner);
try {
await m.reply(mess.wait);
const platform = os.platform();
const arch = os.arch();
const uptime = formatUptime(os.uptime());
const totalMem = formatBytes(os.totalmem());
const freeMem = formatBytes(os.freemem());
const usedMem = formatBytes(os.totalmem() - os.freemem());
const cpuInfo = os.cpus()[0]?.model || "Unknown";
const cpuCores = os.cpus().length;
const cpuLoad = os.loadavg()[0].toFixed(2);
const diskInfo = getDiskInfo(); 
const pingMs = await getPing();
const replyText = `*⌗ System Information*
> *OS:* ${platform} (${arch})
> *Uptime:* ${uptime}
> *Ping:* ${pingMs}

*⌗ CPU Info*
> *Model:* ${cpuInfo}
> *Cores:* ${cpuCores}
> *Load:* ${cpuLoad}

*⌗ Memory Info*
> *Total:* ${totalMem}
> *Used:* ${usedMem}
> *Free:* ${freeMem}

*⌗ Disk Info*
${diskInfo}`;
m.reply(replyText);
} catch (e) {
console.error("Handler:", e.message);
m.reply(mess.error);
}
};
//=================
handler.command = ["specs"];
export default handler;
