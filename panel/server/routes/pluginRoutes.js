import express from "express";
import { kobeniService, checkModuleSyntax } from "../services/kobeniService.js";
import { auditService } from "../services/auditService.js";
import { requireAuth, validatePluginCategory } from "../security.js";

const router = express.Router();

// GET All plugins grouped by category + full list
router.get("/", requireAuth, async (_req, res) => {
  try {
    const data = await kobeniService.getPlugins();
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: { code: "PLUGIN_SCAN_FAILED", message: err.message }
    });
  }
});

// POST Reload all plugins into memory
router.post("/reload", requireAuth, async (req, res) => {
  try {
    const data = await kobeniService.reloadPlugins();
    auditService.log("RELOAD_PLUGINS", "plugins", req.user.email, "SUCCESS", {
      totalPlugins: data.totalPlugins,
      totalCommands: data.totalCommands,
    });

    return res.json({
      success: true,
      data: {
        message: `Reloaded ${data.totalPlugins} plugins with ${data.totalCommands} commands`,
        plugins: data,
      }
    });
  } catch (err) {
    auditService.log("RELOAD_PLUGINS_FAILED", "plugins", req.user.email, "FAILED", { error: err.message });
    return res.status(500).json({
      success: false,
      error: { code: "PLUGIN_RELOAD_FAILED", message: err.message }
    });
  }
});

// GET View plugin source code
router.get("/detail/:category/:filename", requireAuth, async (req, res) => {
  const { category, filename } = req.params;
  try {
    const data = await kobeniService.getPluginContent(category, filename);
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(404).json({
      success: false,
      error: { code: "PLUGIN_NOT_FOUND", message: err.message }
    });
  }
});

// POST Create new plugin
router.post("/", requireAuth, async (req, res) => {
  try {
    const { category, filename, code } = req.body || {};
    if (!filename || typeof filename !== "string") {
      return res.status(400).json({ success: false, error: { message: "Filename is required (e.g. ping.js)" } });
    }
    if (!code || typeof code !== "string") {
      return res.status(400).json({ success: false, error: { message: "Plugin code is required" } });
    }

    const result = await kobeniService.createPlugin(category, filename, code);
    auditService.log("CREATE_PLUGIN", `${result.category}/${result.filename}`, req.user.email, result.hasSyntaxError ? "SYNTAX_ERROR" : "SUCCESS");

    return res.json({ success: true, data: result });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: { code: "CREATE_PLUGIN_FAILED", message: err.message }
    });
  }
});

// PUT Save/Update existing plugin
router.put("/:category/:filename", requireAuth, async (req, res) => {
  try {
    const { category, filename } = req.params;
    const { code } = req.body || {};

    if (!code || typeof code !== "string") {
      return res.status(400).json({ success: false, error: { message: "Plugin code is required" } });
    }

    const result = await kobeniService.savePlugin(category, filename, code);
    auditService.log("SAVE_PLUGIN", `${category}/${filename}`, req.user.email, result.hasSyntaxError ? "SYNTAX_ERROR" : "SUCCESS");

    return res.json({ success: true, data: result });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: { code: "SAVE_PLUGIN_FAILED", message: err.message }
    });
  }
});

// DELETE Delete a plugin
router.delete("/:category/:filename", requireAuth, async (req, res) => {
  try {
    const { category, filename } = req.params;
    const result = await kobeniService.deletePlugin(category, filename);
    auditService.log("DELETE_PLUGIN", `${category}/${filename}`, req.user.email, "SUCCESS");

    return res.json({ success: true, data: result });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: { code: "DELETE_PLUGIN_FAILED", message: err.message }
    });
  }
});

// DELETE Delete an entire plugin category folder
router.delete("/:category", requireAuth, validatePluginCategory, async (req, res) => {
  try {
    const category = req.params.category.toLowerCase();
    const result = await kobeniService.deletePluginCategory(category);
    auditService.log("DELETE_PLUGIN_CATEGORY", category, req.user.email, "SUCCESS");

    return res.json({ success: true, data: result });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: { code: "DELETE_PLUGIN_CATEGORY_FAILED", message: err.message }
    });
  }
});

// POST Validate plugin syntax without saving
router.post("/validate-syntax", requireAuth, (req, res) => {
  const { code } = req.body || {};
  const check = checkModuleSyntax(code);
  return res.json({ success: true, data: check });
});

export default router;
