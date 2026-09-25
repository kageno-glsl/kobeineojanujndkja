import express from "express";
import { kobeniService } from "../services/kobeniService.js";
import { auditService } from "../services/auditService.js";
import { requireAuth, mutationLimiter, validateBotId, validatePhoneNumber } from "../security.js";

const router = express.Router();

function canAccessBot(req, botId) {
  if (req.user.role === "admin") return true;
  if (botId === "main") return false;
  return req.user.cloneId && String(req.user.cloneId) === String(botId);
}

// GET Access list for a bot (main or clone)
router.get("/:id/access", requireAuth, validateBotId, (req, res) => {
  const botId = req.params.id;
  if (!canAccessBot(req, botId)) {
    return res.status(403).json({
      success: false,
      error: { code: "FORBIDDEN", message: "You can only manage access for your own Clone Bot" }
    });
  }

  try {
    const data = kobeniService.getAccess(botId);
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: { code: "FETCH_ACCESS_FAILED", message: err.message }
    });
  }
});

// POST Add access user
router.post("/:id/access", requireAuth, mutationLimiter, validateBotId, validatePhoneNumber, (req, res) => {
  const botId = req.params.id;
  if (!canAccessBot(req, botId)) {
    return res.status(403).json({
      success: false,
      error: { code: "FORBIDDEN", message: "You can only manage access for your own Clone Bot" }
    });
  }

  const number = req.cleanNumber;

  try {
    const data = kobeniService.addUser(botId, number);
    auditService.log("ADD_ACCESS_USER", botId, req.user.username, "SUCCESS", { number });
    return res.json({ success: true, data });
  } catch (err) {
    auditService.log("ADD_ACCESS_USER", botId, req.user.username, "FAILED", { number, error: err.message });
    return res.status(400).json({
      success: false,
      error: { code: "ADD_USER_FAILED", message: err.message }
    });
  }
});

// DELETE Remove access user
router.delete("/:id/access/:number", requireAuth, mutationLimiter, validateBotId, validatePhoneNumber, (req, res) => {
  const botId = req.params.id;
  if (!canAccessBot(req, botId)) {
    return res.status(403).json({
      success: false,
      error: { code: "FORBIDDEN", message: "You can only manage access for your own Clone Bot" }
    });
  }

  const number = req.cleanNumber;

  try {
    const data = kobeniService.removeUser(botId, number);
    auditService.log("REMOVE_ACCESS_USER", botId, req.user.username, "SUCCESS", { number });
    return res.json({ success: true, data });
  } catch (err) {
    auditService.log("REMOVE_ACCESS_USER", botId, req.user.username, "FAILED", { number, error: err.message });
    return res.status(400).json({
      success: false,
      error: { code: "REMOVE_USER_FAILED", message: err.message }
    });
  }
});

// GET Public / Self mode
router.get("/:id/mode", requireAuth, validateBotId, (req, res) => {
  const botId = req.params.id;
  if (!canAccessBot(req, botId)) {
    return res.status(403).json({
      success: false,
      error: { code: "FORBIDDEN", message: "You can only view mode for your own Clone Bot" }
    });
  }

  try {
    const data = kobeniService.getMode(botId);
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: { code: "FETCH_MODE_FAILED", message: err.message }
    });
  }
});

// POST Toggle Public / Self mode
router.post("/:id/mode", requireAuth, mutationLimiter, validateBotId, (req, res) => {
  const botId = req.params.id;
  if (!canAccessBot(req, botId)) {
    return res.status(403).json({
      success: false,
      error: { code: "FORBIDDEN", message: "You can only manage mode for your own Clone Bot" }
    });
  }

  const { isPublic } = req.body || {};

  if (typeof isPublic !== "boolean") {
    return res.status(400).json({
      success: false,
      error: { code: "INVALID_MODE", message: "isPublic must be a boolean" }
    });
  }

  try {
    const data = kobeniService.setMode(botId, isPublic);
    auditService.log("SET_BOT_MODE", botId, req.user.username, "SUCCESS", { mode: isPublic ? "PUBLIC" : "SELF" });
    return res.json({ success: true, data });
  } catch (err) {
    auditService.log("SET_BOT_MODE", botId, req.user.username, "FAILED", { error: err.message });
    return res.status(500).json({
      success: false,
      error: { code: "SET_MODE_FAILED", message: err.message }
    });
  }
});

export default router;
