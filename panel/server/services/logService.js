import { config } from "../config.js";

const logs = [];
const subscribers = new Set();

// Sensitive patterns to redact
const SENSITIVE_PATTERNS = [
  /("?(?:token|secret|password|key|apiKey|jwt|auth|cookie|pairingcode)"?\s*[:=]\s*["'])([^"'\n\r]{4,})(["'])/gi,
  /(sk-[a-zA-Z0-9_-]{16,})/gi,
  /(AIzaSy[a-zA-Z0-9_-]{28,})/gi,
  /(ghp_[a-zA-Z0-9]{30,})/gi,
  /(Bearer\s+)([a-zA-Z0-9_\-\.]{15,})/gi,
];

export function redactSensitive(text) {
  if (typeof text !== "string") {
    text = String(text);
  }
  let sanitized = text;
  // Apply token redactions
  sanitized = sanitized.replace(SENSITIVE_PATTERNS[0], "$1••••••••$3");
  sanitized = sanitized.replace(SENSITIVE_PATTERNS[1], "sk-••••••••");
  sanitized = sanitized.replace(SENSITIVE_PATTERNS[2], "AIzaSy••••••••");
  sanitized = sanitized.replace(SENSITIVE_PATTERNS[3], "ghp_••••••••");
  sanitized = sanitized.replace(SENSITIVE_PATTERNS[4], "$1••••••••");
  return sanitized;
}

export const logService = {
  add(level, source, message, metadata = {}) {
    const rawMessage = typeof message === "object" ? JSON.stringify(message) : String(message);
    const cleanMessage = redactSensitive(rawMessage);

    const entry = {
      id: "log_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
      timestamp: new Date().toISOString(),
      timeFormatted: new Date().toLocaleTimeString(),
      level: (level || "info").toUpperCase(), // INFO, WARN, ERROR, BOT, SYSTEM, CLONE
      source: source || "SYSTEM",
      message: cleanMessage,
      metadata,
    };

    logs.push(entry);
    if (logs.length > config.maxMemoryLogs) {
      logs.shift();
    }

    // Broadcast to real-time subscribers
    for (const sub of subscribers) {
      try {
        sub(entry);
      } catch (_e) {
        subscribers.delete(sub);
      }
    }

    return entry;
  },

  get(filter = {}) {
    let result = logs;
    if (filter.level && filter.level !== "ALL") {
      result = result.filter(l => l.level === filter.level.toUpperCase() || l.source === filter.level.toUpperCase());
    }
    if (filter.search) {
      const q = filter.search.toLowerCase();
      result = result.filter(l => l.message.toLowerCase().includes(q) || l.source.toLowerCase().includes(q));
    }
    const limit = filter.limit ? parseInt(filter.limit, 10) : 300;
    return result.slice(-limit);
  },

  subscribe(callback) {
    subscribers.add(callback);
    return () => subscribers.delete(callback);
  },

  clear() {
    logs.length = 0;
  }
};

// Hook console.log and console.error safely
const originalLog = console.log;
const originalWarn = console.warn;
const originalErr = console.error;

console.log = (...args) => {
  originalLog(...args);
  const msg = args.map(a => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
  logService.add("INFO", "SYSTEM", msg);
};

console.warn = (...args) => {
  originalWarn(...args);
  const msg = args.map(a => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
  logService.add("WARN", "SYSTEM", msg);
};

console.error = (...args) => {
  originalErr(...args);
  const msg = args.map(a => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
  logService.add("ERROR", "SYSTEM", msg);
};
