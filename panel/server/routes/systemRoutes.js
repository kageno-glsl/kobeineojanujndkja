import express from "express";
import { systemMonitor } from "../services/systemMonitor.js";
import {
  getMainBotController,
  getMainBotStatus,
} from "../services/mainBotBridge.js";
import { kobeniService } from "../services/kobeniService.js";
import { auditService } from "../services/auditService.js";
import { requireAuth } from "../security.js";

const router = express.Router();

// GET Public Health Check
router.get("/health", (_req, res) => {
  return res.json({
    success: true,
    status: "ok",
    timestamp: Date.now(),
    uptime: Math.floor(process.uptime()),
    panel: "Kobeni Control Panel v1.0",
  });
});

// GET Dashboard overview (Main bot + Clones + System stats + Activity summary)
router.get("/dashboard", requireAuth, async (_req, res) => {
  const mainBot = getMainBotStatus();
  const clones = kobeniService.getCloneList();
  const metrics = systemMonitor.getMetrics();
  const plugins = await kobeniService.getPlugins();
  const recentAudit = auditService.getRecent(10);
  const settings = kobeniService.getSettings();

  return res.json({
    success: true,
    data: {
      bot: {
        main: mainBot,
        totalClones: clones.length,
        onlineClones: clones.filter(c => c.status === "ONLINE").length,
        totalPlugins: plugins.totalPlugins,
        totalCommands: plugins.totalCommands,
        settings,
      },
      system: {
        cpuPercent: metrics.cpu.usagePercent,
        ramPercent: metrics.memory.percent,
        diskPercent: metrics.disk.percent,
        loadAverage: metrics.cpu.loadAverage,
        uptime: metrics.host.uptimeFormatted,
        hostname: metrics.host.hostname,
        nodeVersion: metrics.host.nodeVersion,
      },
      recentActivity: recentAudit,
    }
  });
});

// GET Detailed Server Metrics
router.get("/system", requireAuth, (_req, res) => {
  const metrics = systemMonitor.getMetrics();
  return res.json({
    success: true,
    data: metrics,
  });
});

// GET Settings overview for Admin Panel
router.get("/settings", requireAuth, (_req, res) => {
  const settings = kobeniService.getSettings();
  const access = kobeniService.getAccess("main");
  const mode = kobeniService.getMode("main");

  return res.json({
    success: true,
    data: {
      adminEmail: process.env.PANEL_ADMIN_EMAIL || global.adminEmail || "keeplazyy@gmail.com",
      owner: global.owner || "601112260297",
      pairingTargetNumber: getMainBotStatus().pairingState?.targetNumber || global.owner || "601112260297",
      prefix: global.prefix || [".", "!", "/"],
      pairingcode: global.pairingcode || "KOBENIMD",
      wmsw: global.wmsw || "",
      mode: mode.mode,
      isPublic: mode.isPublic,
      accessUsers: access.users || [],
    }
  });
});

// POST Update Bot Settings
router.post("/settings", requireAuth, (req, res) => {
  const { prefix, pairingcode, wmsw, isPublic, pairingTargetNumber } = req.body || {};

  if (Array.isArray(prefix)) {
    global.prefix = prefix;
  } else if (typeof prefix === "string" && prefix.trim()) {
    global.prefix = prefix.split(",").map(p => p.trim()).filter(Boolean);
  }

  if (typeof pairingcode === "string" && pairingcode.trim()) {
    global.pairingcode = pairingcode.trim().toUpperCase();
  }

  if (typeof wmsw === "string") {
    global.wmsw = wmsw;
  }

  if (typeof isPublic === "boolean") {
    kobeniService.setMode("main", isPublic);
  }

  if (typeof pairingTargetNumber === "string" && pairingTargetNumber.trim()) {
    const cleanNum = pairingTargetNumber.replace(/[^0-9]/g, "");
    if (cleanNum.length >= 7) {
      const controller = getMainBotController();
      if (controller?.setTargetNumber) {
        controller.setTargetNumber(cleanNum);
      } else {
        global.owner = cleanNum;
      }
    }
  }

  auditService.log("UPDATE_SETTINGS", "system", req.user.email, "SUCCESS", {
    prefix: global.prefix,
    pairingcode: global.pairingcode,
    pairingTargetNumber: getMainBotStatus().pairingState?.targetNumber
  });

  return res.json({
    success: true,
    data: {
      message: "Settings saved successfully",
      settings: {
        adminEmail: process.env.PANEL_ADMIN_EMAIL || global.adminEmail || "keeplazyy@gmail.com",
        owner: global.owner,
        pairingTargetNumber: getMainBotStatus().pairingState?.targetNumber,
        prefix: global.prefix,
        pairingcode: global.pairingcode,
        wmsw: global.wmsw,
        mode: kobeniService.getMode("main").mode,
        isPublic: kobeniService.getMode("main").isPublic,
        accessUsers: kobeniService.getAccess("main").users || [],
      }
    }
  });
});

export default router;
