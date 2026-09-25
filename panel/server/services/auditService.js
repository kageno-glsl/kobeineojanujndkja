import { config } from "../config.js";

const auditLogs = [];

export const auditService = {
  log(action, target, user = "admin", status = "SUCCESS", details = {}) {
    const safeDetails = { ...details };
    // Redact any password or token in details
    if (safeDetails.password) safeDetails.password = "••••••••";
    if (safeDetails.token) safeDetails.token = "••••••••";
    if (safeDetails.key) safeDetails.key = "••••••••";

    const entry = {
      id: "aud_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
      timestamp: new Date().toISOString(),
      user: user || "admin",
      action,
      target: target || "system",
      status,
      details: safeDetails,
    };

    auditLogs.unshift(entry);
    if (auditLogs.length > config.maxAuditLogs) {
      auditLogs.pop();
    }

    return entry;
  },

  getRecent(limit = 50) {
    return auditLogs.slice(0, Math.min(limit, auditLogs.length));
  },

  clear() {
    auditLogs.length = 0;
  }
};
