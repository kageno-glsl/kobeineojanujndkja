import crypto from "node:crypto";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

// In-memory active admin sessions: token -> { email, username, role: "admin", createdAt, expiresAt }
const activeSessions = new Map();

// Helper to get Firebase app config (apiKey, projectId)
function getFirebaseConfig() {
  try {
    const configPath = path.join(config.rootDir, "firebase-applet-config.json");
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, "utf-8"));
    }
  } catch (_e) {}
  return null;
}

// Decode and parse JWT payload without external dependencies
export function decodeJwtPayload(jwtToken) {
  if (!jwtToken || typeof jwtToken !== "string" || !jwtToken.includes(".")) {
    return null;
  }
  const parts = jwtToken.split(".");
  if (parts.length !== 3) return null;

  try {
    const payloadJson = Buffer.from(parts[1], "base64url").toString("utf-8");
    return JSON.parse(payloadJson);
  } catch (_e) {
    try {
      const payloadJson = Buffer.from(parts[1], "base64").toString("utf-8");
      return JSON.parse(payloadJson);
    } catch (_e2) {
      return null;
    }
  }
}

// Helper to verify Firebase ID token using Identity Toolkit API
export async function verifyWithIdentityToolkit(idToken, apiKey) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ idToken });
    const url = new URL(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`);

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData)
      },
      timeout: 8000
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode !== 200 || parsed.error) {
            const msg = parsed.error?.message || "Token verification failed";
            return reject(new Error(msg));
          }
          if (parsed.users && parsed.users[0]) {
            const u = parsed.users[0];
            return resolve({
              email: u.email,
              email_verified: u.emailVerified === true,
              displayName: u.displayName || u.email?.split("@")[0],
              photoURL: u.photoUrl || null,
              sub: u.localId,
            });
          }
          reject(new Error("No user profile returned from token verification"));
        } catch (e) {
          reject(new Error(`Failed to parse verification response: ${e.message}`));
        }
      });
    });

    req.on("error", (err) => reject(err));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Token verification request timed out"));
    });

    req.write(postData);
    req.end();
  });
}

// Main verification function supporting Firebase Auth ID tokens
export async function verifyFirebaseIdToken(idToken) {
  if (!idToken || typeof idToken !== "string") {
    throw new Error("Missing or invalid Google/Firebase ID Token");
  }

  const fbConfig = getFirebaseConfig();
  const apiKey = fbConfig?.apiKey;

  if (!apiKey) {
    throw new Error("Firebase API key is not configured; refusing to trust an unverified ID token");
  }

  // Firebase Identity Toolkit validates the signature, issuer, audience,
  // expiration and user identity server-side. Do not fall back to decoding
  // the JWT payload locally because decoding does not verify its signature.
  const verifiedUser = await verifyWithIdentityToolkit(idToken, apiKey);

  return {
    email: verifiedUser.email,
    email_verified: verifiedUser.email_verified === true,
    displayName: verifiedUser.displayName,
    photoURL: verifiedUser.photoURL,
    sub: verifiedUser.sub,
  };
}

export const authService = {
  getAdminEmail() {
    return (config.adminEmail || "keeplazyy@gmail.com").toLowerCase();
  },

  // Authorize Google Login with exact email match
  async authenticateGoogleUser(idToken, clientProfile = {}) {
    if (!idToken) {
      throw new Error("Google ID Token is required for authentication");
    }

    let decodedToken;
    try {
      decodedToken = await verifyFirebaseIdToken(idToken);
    } catch (err) {
      // Fallback for offline unit test runner
      if (process.env.NODE_ENV === "test" && clientProfile?.email) {
        decodedToken = {
          email: clientProfile.email,
          email_verified: true,
          displayName: clientProfile.displayName || "Test Admin",
          sub: clientProfile.uid || "test-uid"
        };
      } else {
        throw new Error(`Google ID token verification failed: ${err.message}`);
      }
    }

    const email = (decodedToken.email || clientProfile.email || "").trim().toLowerCase();
    const isVerified = decodedToken.email_verified === "true" || decodedToken.email_verified === true;

    if (!email) {
      throw new Error("Google account email is missing from verified token");
    }

    if (!isVerified) {
      const err = new Error("Google email address is not verified");
      err.code = "EMAIL_NOT_VERIFIED";
      throw err;
    }

    const configuredAdmin = this.getAdminEmail();

    // Exact email match check
    if (email !== configuredAdmin) {
      const err = new Error("Access Denied: This Google account is not authorized to access the Kobeni Control Panel.");
      err.code = "ADMIN_EMAIL_NOT_ALLOWED";
      err.unauthorizedEmail = email;
      throw err;
    }

    // Generate signed secure admin session
    const sessionId = crypto.randomBytes(32).toString("hex");
    const payload = `${sessionId}:${email}:admin:${Date.now()}`;
    const signature = crypto.createHmac("sha256", config.sessionSecret).update(payload).digest("hex");
    const token = `${Buffer.from(payload).toString("base64url")}.${signature}`;

    const expiresAt = Date.now() + config.sessionExpiryHours * 60 * 60 * 1000;
    const sessionData = {
      email,
      displayName: decodedToken.displayName || clientProfile.displayName || email.split("@")[0],
      photoURL: decodedToken.photoURL || clientProfile.photoURL || null,
      sub: decodedToken.sub || clientProfile.uid,
      role: "admin",
      isGoogle: true,
      createdAt: Date.now(),
      expiresAt,
    };

    activeSessions.set(token, sessionData);

    return {
      token,
      expiresAt,
      email,
      displayName: sessionData.displayName,
      photoURL: sessionData.photoURL,
      role: "admin",
    };
  },

  // Verify internal panel session token
  verifyToken(token) {
    if (!token || typeof token !== "string" || !token.includes(".")) return null;

    const [payloadB64, signature] = token.split(".");
    if (!payloadB64 || !signature) return null;

    let payload;
    try {
      payload = Buffer.from(payloadB64, "base64url").toString("utf-8");
    } catch (_e) {
      return null;
    }

    const expectedSignature = crypto.createHmac("sha256", config.sessionSecret).update(payload).digest("hex");
    if (!/^[a-f0-9]{64}$/i.test(signature)) return null;

    const provided = Buffer.from(signature, "hex");
    const expected = Buffer.from(expectedSignature, "hex");
    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
      return null;
    }

    const session = activeSessions.get(token);
    if (!session) {
      return null;
    }

    if (Date.now() > session.expiresAt) {
      activeSessions.delete(token);
      return null;
    }

    return session;
  },

  revokeSession(token) {
    if (token) {
      activeSessions.delete(token);
    }
  },

  // Helper for test suites
  createTestAdminSession(email = this.getAdminEmail()) {
    const sessionId = crypto.randomBytes(32).toString("hex");
    const payload = `${sessionId}:${email.toLowerCase()}:admin:${Date.now()}`;
    const signature = crypto.createHmac("sha256", config.sessionSecret).update(payload).digest("hex");
    const token = `${Buffer.from(payload).toString("base64url")}.${signature}`;
    const expiresAt = Date.now() + config.sessionExpiryHours * 60 * 60 * 1000;

    const sessionData = {
      email: email.toLowerCase(),
      displayName: "Admin",
      role: "admin",
      isGoogle: true,
      createdAt: Date.now(),
      expiresAt,
    };
    activeSessions.set(token, sessionData);
    return { token, session: sessionData };
  }
};
