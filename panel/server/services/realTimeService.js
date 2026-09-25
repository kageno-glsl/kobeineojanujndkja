import { logService } from "./logService.js";
import { systemMonitor } from "./systemMonitor.js";

let wsServerInstance = null;

export const realTimeService = {
  init(server, ws) {
    if (ws) {
      wsServerInstance = ws;
      ws.on("connection", (socket) => {
        socket.on("message", (msg) => {
          try {
            const data = JSON.parse(msg.toString());
            if (data.type === "ping") {
              socket.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
            }
          } catch (_e) {}
        });

        // Send initial state
        socket.send(JSON.stringify({
          type: "welcome",
          timestamp: Date.now(),
          metrics: systemMonitor.getMetrics()
        }));
      });
    }

    // Subscribe to logService to push logs in real-time
    logService.subscribe((entry) => {
      this.broadcast({
        type: "log",
        entry,
      });
    });

    // Periodic system metrics broadcast every 3 seconds
    setInterval(() => {
      if (wsServerInstance && wsServerInstance.clients.size > 0) {
        this.broadcast({
          type: "system_metrics",
          data: systemMonitor.getMetrics(),
        });
      }
    }, 3000);
  },

  broadcast(event) {
    const payload = JSON.stringify(event);

    // Send to WebSocket clients
    if (wsServerInstance) {
      for (const client of wsServerInstance.clients) {
        if (client.readyState === 1 /* OPEN */) {
          try {
            client.send(payload);
          } catch (_e) {}
        }
      }
    }
  },

  broadcastBotStatus(botId, status, details = {}) {
    this.broadcast({
      type: "bot_status",
      botId,
      status, // ONLINE, STARTING, RECONNECTING, STOPPED, CRASHED, PAIRING
      details,
      timestamp: Date.now(),
    });
  },

  broadcastPairingCode(botId, code, targetNumber) {
    this.broadcast({
      type: "pairing_code",
      botId,
      code,
      targetNumber,
      timestamp: Date.now(),
    });
  }
};
