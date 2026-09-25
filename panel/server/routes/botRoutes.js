import express from "express";
import {
  getMainBotController,
  getMainBotStatus,
  requireMainBotController,
} from "../services/mainBotBridge.js";
import { auditService } from "../services/auditService.js";
import { requireAuth, mutationLimiter } from "../security.js";

const router = express.Router();

// GET Main bot status explicitly
router.get("/main", requireAuth, (_req, res) => {
  const status = getMainBotStatus();

  return res.json({
    success: true,
    data: status,
  });
});

// POST Main bot start (Admin Only)
router.post("/main/start", requireAuth, mutationLimiter, async (req, res) => {
  try {
    const { phoneNumber, number } = req.body || {};
    const targetPhone = phoneNumber || number || null;
    const result = await requireMainBotController().start(targetPhone);
    auditService.log("START_MAIN_BOT", "main", req.user.email, "SUCCESS", { targetPhone, pid: result?.bot?.pid || process.pid });

    return res.json({
      success: true,
      data: {
        message: result.message || "Main Bot started successfully",
        bot: getMainBotStatus(),
      }
    });
  } catch (err) {
    auditService.log("START_MAIN_BOT_FAILED", "main", req.user.email, "FAILED", { error: err.message });
    return res.status(500).json({
      success: false,
      error: { code: "START_FAILED", message: err.message }
    });
  }
});

// POST Main bot stop (Admin Only)
router.post("/main/stop", requireAuth, mutationLimiter, async (req, res) => {
  try {
    const result = await requireMainBotController().stop();
    auditService.log("STOP_MAIN_BOT", "main", req.user.email, "SUCCESS");

    return res.json({
      success: true,
      data: {
        message: "Main Bot stopped",
        stopped: result,
        bot: getMainBotStatus(),
      }
    });
  } catch (err) {
    auditService.log("STOP_MAIN_BOT_FAILED", "main", req.user.email, "FAILED", { error: err.message });
    return res.status(500).json({
      success: false,
      error: { code: "STOP_FAILED", message: err.message }
    });
  }
});

// POST Main bot restart (Admin Only)
router.post("/main/restart", requireAuth, mutationLimiter, async (req, res) => {
  try {
    const { phoneNumber, number } = req.body || {};
    const targetPhone = phoneNumber || number || null;
    const result = await requireMainBotController().restart(targetPhone);
    auditService.log("RESTART_MAIN_BOT", "main", req.user.email, "SUCCESS", { targetPhone, pid: result?.bot?.pid || process.pid });

    return res.json({
      success: true,
      data: {
        message: "Main Bot restarted",
        bot: getMainBotStatus(),
      }
    });
  } catch (err) {
    auditService.log("RESTART_MAIN_BOT_FAILED", "main", req.user.email, "FAILED", { error: err.message });
    return res.status(500).json({
      success: false,
      error: { code: "RESTART_FAILED", message: err.message }
    });
  }
});

// POST Reset Main Bot Session (Admin Only Danger Action)
router.post("/main/reset-session", requireAuth, mutationLimiter, async (req, res) => {
  const { confirmation } = req.body || {};

  if (confirmation !== "RESET") {
    return res.status(400).json({
      success: false,
      error: { code: "INVALID_CONFIRMATION", message: "Type 'RESET' to confirm session wipe" }
    });
  }

  try {
    await requireMainBotController().resetSession();
    auditService.log("WIPE_MAIN_SESSION", "main", req.user.email, "SUCCESS");

    return res.json({
      success: true,
      data: { message: "Main bot session wiped successfully. Instance restarted and ready for new pairing." }
    });
  } catch (err) {
    auditService.log("WIPE_MAIN_SESSION_FAILED", "main", req.user.email, "FAILED", { error: err.message });
    return res.status(500).json({
      success: false,
      error: { code: "RESET_FAILED", message: err.message }
    });
  }
});

export default router;
