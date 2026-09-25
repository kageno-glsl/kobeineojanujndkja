import express from "express";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { authService } from "../services/authService.js";
import { auditService } from "../services/auditService.js";
import { loginLimiter, requireAuth } from "../security.js";

const router = express.Router();

// GET Firebase client config
router.get("/config", (_req, res) => {
  try {
    const configPath = path.join(config.rootDir, "firebase-applet-config.json");
    if (fs.existsSync(configPath)) {
      const fbConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      return res.json({
        success: true,
        data: {
          ...fbConfig,
          configuredAdminEmail: authService.getAdminEmail(),
        }
      });
    }
  } catch (_e) {}
  return res.json({
    success: true,
    data: {
      configuredAdminEmail: authService.getAdminEmail(),
    }
  });
});

// POST Google Sign-In with Server-Side Token Verification & Exact Admin Match
router.post("/google-login", loginLimiter, async (req, res) => {
  const { idToken, profile } = req.body || {};
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1";

  if (!idToken) {
    return res.status(400).json({
      success: false,
      error: { code: "MISSING_TOKEN", message: "Google ID Token is required" }
    });
  }

  try {
    const session = await authService.authenticateGoogleUser(idToken, profile);
    auditService.log("ADMIN_GOOGLE_LOGIN_SUCCESS", "auth", session.email, "SUCCESS", { ip });

    // Set secure HttpOnly session cookie
    res.cookie("kobeni_session", session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" && req.protocol === "https",
      sameSite: "lax",
      maxAge: 12 * 60 * 60 * 1000,
      path: "/",
    });

    return res.json({
      success: true,
      data: {
        email: session.email,
        displayName: session.displayName,
        photoURL: session.photoURL,
        role: "admin",
        token: session.token,
        expiresAt: session.expiresAt,
      }
    });
  } catch (err) {
    auditService.log("ADMIN_LOGIN_DENIED", "auth", err.unauthorizedEmail || profile?.email || "unknown", "DENIED", {
      reason: err.message,
      ip
    });

    const statusCode = err.code === "ADMIN_EMAIL_NOT_ALLOWED" ? 403 : 401;
    return res.status(statusCode).json({
      success: false,
      error: {
        code: err.code || "AUTH_FAILED",
        message: err.message || "Authentication failed",
        unauthorizedEmail: err.unauthorizedEmail || null,
      }
    });
  }
});

// GET Current Admin Session info
router.get("/me", requireAuth, (req, res) => {
  return res.json({
    success: true,
    data: {
      email: req.user.email,
      displayName: req.user.displayName || req.user.email?.split("@")[0] || "Administrator",
      photoURL: req.user.photoURL || null,
      role: "admin",
      isGoogle: true,
      configuredAdminEmail: authService.getAdminEmail(),
      expiresAt: req.user.expiresAt,
    }
  });
});

// POST Logout
router.post("/logout", requireAuth, (req, res) => {
  if (req.sessionToken) {
    authService.revokeSession(req.sessionToken);
  }
  res.clearCookie("kobeni_session", { path: "/" });
  auditService.log("LOGOUT", "auth", req.user?.email || "admin", "SUCCESS");

  return res.json({
    success: true,
    data: { message: "Logged out successfully" }
  });
});

export default router;
