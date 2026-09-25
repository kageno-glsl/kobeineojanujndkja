import http from "node:http";
import path from "node:path";
import express from "express";
import { WebSocketServer } from "ws";
import { config } from "./config.js";
import { logService } from "./services/logService.js";
import { realTimeService } from "./services/realTimeService.js";
import { getMainBotController } from "./services/mainBotBridge.js";

// Routes
import authRoutes from "./routes/authRoutes.js";
import botRoutes from "./routes/botRoutes.js";
import pluginRoutes from "./routes/pluginRoutes.js";
import systemRoutes from "./routes/systemRoutes.js";
import logRoutes from "./routes/logRoutes.js";

const app = express();
const server = http.createServer(app);

// Initialize WebSocket server on same HTTP port
const wss = new WebSocketServer({ server, path: "/ws" });
realTimeService.init(server, wss);

// Security & Parsing Middleware
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  next();
});

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Static frontend panel files
const publicDir = path.join(config.rootDir, "panel", "public");
app.use(express.static(publicDir));

// Static Media from bot
const mediaDir = path.join(config.systemDir, "media");
app.use("/media", express.static(mediaDir));

// Mount API Routes
app.use("/api/auth", authRoutes);
app.use("/api/bots", botRoutes);
app.use("/api/plugins", pluginRoutes);
app.use("/api/system", systemRoutes);
app.use("/api/logs", logRoutes);
// Root health check
app.use("/api", systemRoutes);

// SPA Fallback: Send index.html for all non-API web routes
app.use((req, res, next) => {
  if (req.method === "GET" && !req.path.startsWith("/api/")) {
    return res.sendFile(path.join(publicDir, "index.html"));
  }
  next();
});

// Centralized error handler
app.use((err, _req, res, _next) => {
  logService.add("ERROR", "SYSTEM", `Unhandled error: ${err.message}`);
  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: process.env.NODE_ENV === "production" ? "An internal server error occurred" : err.message,
    }
  });
});

export function startPanel(port = config.port) {
  server.listen(port, "0.0.0.0", () => {
    logService.add("INFO", "SYSTEM", `╔═══════════════════════════════════════════════════════════════╗`);
    logService.add("INFO", "SYSTEM", `║  🌸 KOBENI-MD WEB CONTROL PANEL (Pixel Anime VPS Edition)     ║`);
    logService.add("INFO", "SYSTEM", `║  URL  : http://0.0.0.0:${port}                                 ║`);
    logService.add("INFO", "SYSTEM", `║  PORT : ${port}                                                ║`);
    logService.add("INFO", "SYSTEM", `╚═══════════════════════════════════════════════════════════════╝`);
  });

  return { app, server };
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  logService.add("WARN", "SYSTEM", "Received SIGTERM. Shutting down gracefully...");
  await getMainBotController()?.stop?.().catch(() => {});
  server.close(() => process.exit(0));
});

process.on("SIGINT", async () => {
  logService.add("WARN", "SYSTEM", "Received SIGINT. Shutting down gracefully...");
  await getMainBotController()?.stop?.().catch(() => {});
  server.close(() => process.exit(0));
});

// Auto-start if run directly
if (process.argv[1] && process.argv[1].endsWith("panel/server/index.js")) {
  startPanel();
}
