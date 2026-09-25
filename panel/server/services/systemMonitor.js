import os from "node:os";
import fs from "node:fs";

let previousCpuUsage = getCpuSample();
let currentCpuPercent = 0;
const metricsHistory = [];
const MAX_HISTORY = 30;

function getCpuSample() {
  const cpus = os.cpus();
  let user = 0;
  let nice = 0;
  let sys = 0;
  let idle = 0;
  let irq = 0;

  for (const cpu of cpus) {
    user += cpu.times.user;
    nice += cpu.times.nice;
    sys += cpu.times.sys;
    idle += cpu.times.idle;
    irq += cpu.times.irq;
  }

  const total = user + nice + sys + idle + irq;
  return { idle, total };
}

function calculateCpuPercent() {
  const current = getCpuSample();
  const idleDiff = current.idle - previousCpuUsage.idle;
  const totalDiff = current.total - previousCpuUsage.total;
  previousCpuUsage = current;

  if (totalDiff === 0) return currentCpuPercent;
  const percent = Math.max(0, Math.min(100, Math.round((1 - idleDiff / totalDiff) * 100)));
  currentCpuPercent = percent;
  return percent;
}

function getDiskStats() {
  try {
    const stats = fs.statfsSync("/");
    const totalBytes = stats.bsize * stats.blocks;
    const freeBytes = stats.bsize * stats.bavail;
    const usedBytes = totalBytes - freeBytes;
    const percent = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0;

    return {
      total: totalBytes,
      used: usedBytes,
      free: freeBytes,
      percent,
      totalFormatted: formatBytes(totalBytes),
      usedFormatted: formatBytes(usedBytes),
      freeFormatted: formatBytes(freeBytes),
    };
  } catch (_e) {
    return {
      total: 0,
      used: 0,
      free: 0,
      percent: 0,
      totalFormatted: "N/A",
      usedFormatted: "N/A",
      freeFormatted: "N/A",
    };
  }
}

export function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`;
}

export function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// Background sampling interval for accurate CPU calculation and metrics history
const metricsTimer = setInterval(() => {
  const cpu = calculateCpuPercent();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const ramPercent = totalMem > 0 ? Math.round((usedMem / totalMem) * 100) : 0;

  metricsHistory.push({
    timestamp: Date.now(),
    cpu,
    ram: ramPercent,
  });

  if (metricsHistory.length > MAX_HISTORY) {
    metricsHistory.shift();
  }
}, 3000);
if (metricsTimer && typeof metricsTimer.unref === "function") {
  metricsTimer.unref();
}

export const systemMonitor = {
  getMetrics() {
    const cpu = currentCpuPercent || calculateCpuPercent();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const ramPercent = totalMem > 0 ? Math.round((usedMem / totalMem) * 100) : 0;

    const processMem = process.memoryUsage();
    const disk = getDiskStats();
    const loadAvg = os.loadavg().map(l => parseFloat(l.toFixed(2)));

    return {
      host: {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        release: os.release(),
        uptimeSeconds: os.uptime(),
        uptimeFormatted: formatUptime(os.uptime()),
        nodeVersion: process.version,
      },
      cpu: {
        usagePercent: cpu,
        cores: os.cpus().length,
        model: os.cpus()[0]?.model || "Generic CPU",
        loadAverage: loadAvg, // 1m, 5m, 15m
      },
      memory: {
        total: totalMem,
        used: usedMem,
        free: freeMem,
        percent: ramPercent,
        totalFormatted: formatBytes(totalMem),
        usedFormatted: formatBytes(usedMem),
        freeFormatted: formatBytes(freeMem),
      },
      disk,
      process: {
        pid: process.pid,
        uptimeSeconds: Math.floor(process.uptime()),
        uptimeFormatted: formatUptime(process.uptime()),
        rss: processMem.rss,
        rssFormatted: formatBytes(processMem.rss),
        heapUsed: processMem.heapUsed,
        heapUsedFormatted: formatBytes(processMem.heapUsed),
        heapTotal: processMem.heapTotal,
        heapTotalFormatted: formatBytes(processMem.heapTotal),
      },
      history: metricsHistory,
    };
  }
};
