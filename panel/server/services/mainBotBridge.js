let controller = null;

const stoppedStatus = () => ({
  id: "main",
  name: "Kobeni-MD Main Bot",
  status: "STOPPED",
  number: global.owner || null,
  pid: process.pid,
  uptimeSeconds: 0,
  uptimeFormatted: "0s",
  lastConnection: null,
  lastDisconnect: null,
  reconnectCount: 0,
  pairingState: {
    isWaiting: false,
    code: null,
    targetNumber: null,
    error: null,
  },
  sessionState: {
    hasSession: false,
    sessionDir: "session/",
  },
  memory: {
    rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`,
    heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`,
  },
});

export function setMainBotController(nextController) {
  if (!nextController || typeof nextController.start !== 'function' ||
      typeof nextController.stop !== 'function' ||
      typeof nextController.restart !== 'function' ||
      typeof nextController.getStatus !== 'function' ||
      typeof nextController.resetSession !== 'function') {
    throw new TypeError('Invalid Main Bot controller');
  }
  controller = nextController;
}

export function getMainBotController() {
  return controller;
}

export function getMainBotStatus() {
  return controller?.getStatus?.() || stoppedStatus();
}

export function requireMainBotController() {
  if (!controller) {
    throw new Error("Main Bot runtime is unavailable. Start Kobeni-MD with 'npm start'.");
  }
  return controller;
}
