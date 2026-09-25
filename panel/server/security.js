import { authService } from "./services/authService.js";

const ipHits = new Map();

function parseCookies(req) {
  const cookies = {};
  const header = req.headers.cookie;
  if (!header) return cookies;

  header.split(";").forEach((part) => {
    const [name, ...rest] = part.split("=");
    const key = name?.trim();
    if (key) cookies[key] = decodeURIComponent(rest.join("=").trim());
  });

  return cookies;
}

export function requireAuth(req, res, next) {
  const cookies = parseCookies(req);
  const bearer = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : null;
  const token = cookies.kobeni_session || bearer;
  const session = token ? authService.verifyToken(token) : null;

  if (!session) {
    return res.status(401).json({
      success: false,
      error: {
        code: token ? "SESSION_EXPIRED" : "UNAUTHORIZED",
        message: token ? "Invalid or expired session. Please login again." : "Authentication required to access this resource",
      },
    });
  }

  req.user = session;
  req.sessionToken = token;
  next();
}

export function optionalAuth(req, res, next) {
  const cookies = parseCookies(req);
  const bearer = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : null;
  const session = authService.verifyToken(cookies.kobeni_session || bearer);
  if (session) req.user = session;
  next();
}

export function createRateLimiter({ windowMs = 60000, max = 30, message = "Too many requests. Please try again later." }) {
  return (req, res, next) => {
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const timestamps = ipHits.get(ip) || [];

    while (timestamps.length && timestamps[0] <= now - windowMs) timestamps.shift();
    if (timestamps.length >= max) {
      return res.status(429).json({
        success: false,
        error: {
          code: "RATE_LIMITED",
          message,
          retryAfter: Math.ceil((timestamps[0] + windowMs - now) / 1000),
        },
      });
    }

    timestamps.push(now);
    ipHits.set(ip, timestamps);
    next();
  };
}

export const loginLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 8,
  message: "Too many login attempts. Please wait 5 minutes before trying again.",
});

export const mutationLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: "Too many actions requested. Please slow down.",
});

export function validateBotId(req, res, next) {
  const id = req.params.id;
  if (!id) return res.status(400).json({ success: false, error: { code: "INVALID_PARAM", message: "Bot ID is required" } });
  if (id !== "main" && !/^\d{5,20}$/.test(id)) return res.status(400).json({ success: false, error: { code: "INVALID_BOT_ID", message: "Bot ID must be 'main' or a valid WhatsApp number (5-20 digits)" } });
  if (/[.]{2}|[/\\]|\0/.test(id)) return res.status(400).json({ success: false, error: { code: "ILLEGAL_PATH", message: "Path traversal characters detected" } });
  next();
}

export function validatePhoneNumber(req, res, next) {
  const number = req.body.number || req.params.number;
  const clean = String(number || "").replace(/[^0-9]/g, "");
  if (!number) return res.status(400).json({ success: false, error: { code: "MISSING_PHONE", message: "Phone number is required" } });
  if (!/^\d{5,20}$/.test(clean)) return res.status(400).json({ success: false, error: { code: "INVALID_PHONE", message: "Phone number must be between 5 and 20 digits" } });
  req.cleanNumber = clean;
  next();
}

export function validatePluginCategory(req, res, next) {
  const category = req.params.category;
  if (category && (!/^[a-zA-Z0-9_-]+$/.test(category) || category.includes(".."))) {
    return res.status(400).json({ success: false, error: { code: "INVALID_CATEGORY", message: "Invalid category name" } });
  }
  next();
}
