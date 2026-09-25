import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import "../../system/setting.js";

const rootDir = path.resolve(import.meta.dirname, "../..");

// Load .env if present
const envPath = path.join(rootDir, ".env");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const k = trimmed.substring(0, eqIdx).trim();
      const v = trimmed.substring(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[k]) {
        process.env[k] = v;
      }
    }
  }
}

export const config = {
  env: process.env.NODE_ENV || "production",
  // Port priority: PANEL_PORT -> 3000
  port: parseInt(process.env.PANEL_PORT || "3000", 10),
  host: process.env.PANEL_HOST || "0.0.0.0",
  
  // Single Admin Google Email
  adminEmail: (process.env.PANEL_ADMIN_EMAIL || global.adminEmail || "keeplazyy@gmail.com").trim().toLowerCase(),
  
  // Admin credentials (legacy fallback if needed)
  adminUsername: process.env.PANEL_ADMIN_USERNAME || global.adminUsername || "admin",
  adminPassword: process.env.PANEL_ADMIN_PASSWORD || global.adminPassword || "kobeni2026!",
  
  // Session secret
  sessionSecret: process.env.PANEL_SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
  sessionExpiryHours: 12,
  
  // Log limits
  maxMemoryLogs: 1500,
  maxAuditLogs: 500,
  
  // Paths
  rootDir,
  systemDir: path.join(rootDir, "system"),
  sessionDir: path.join(rootDir, "session"),
  botsDir: path.join(rootDir, "session", "bots"),
  databaseDir: path.join(rootDir, "system", "database"),
  pluginsDir: path.join(rootDir, "system", "plugins"),
  
  // Mock mode for local tests
  isMock: process.env.PANEL_MOCK === "true",
};
