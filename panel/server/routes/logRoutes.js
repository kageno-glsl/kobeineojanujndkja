import express from "express";
import { logService } from "../services/logService.js";
import { requireAuth } from "../security.js";

const router = express.Router();

// GET Logs with filtering
router.get("/", requireAuth, (req, res) => {
  const { level, search, limit } = req.query;
  const entries = logService.get({ level, search, limit });

  return res.json({
    success: true,
    data: {
      total: entries.length,
      logs: entries,
    }
  });
});

// POST Clear logs buffer
router.post("/clear", requireAuth, (_req, res) => {
  logService.clear();
  return res.json({
    success: true,
    data: { message: "Logs cleared" }
  });
});

export default router;
