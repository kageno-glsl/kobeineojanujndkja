// Frontend API Client with Token / Cookie support
export const API = {
  token: localStorage.getItem("kobeni_token") || null,

  setToken(t) {
    this.token = t;
    if (t) localStorage.setItem("kobeni_token", t);
    else localStorage.removeItem("kobeni_token");
  },

  async request(path, options = {}) {
    const headers = {
      "Content-Type": "application/json",
      ...(this.token ? { "Authorization": `Bearer ${this.token}` } : {}),
      ...(options.headers || {}),
    };

    const res = await fetch(path, {
      ...options,
      headers,
    });

    // Handle session expiry
    if (res.status === 401 && !path.includes("/auth/google-login")) {
      this.setToken(null);
      window.dispatchEvent(new CustomEvent("auth_expired"));
      throw new Error("Session expired. Please sign in again.");
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data?.error?.message || `Request failed with status ${res.status}`);
      err.code = data?.error?.code || `HTTP_${res.status}`;
      err.unauthorizedEmail = data?.error?.unauthorizedEmail || null;
      throw err;
    }

    return data.data;
  },

  // Single Admin Google Auth
  googleLogin: (idToken, profile) => API.request("/api/auth/google-login", {
    method: "POST",
    body: JSON.stringify({ idToken, profile })
  }),
  getMe: () => API.request("/api/auth/me"),
  logout: () => API.request("/api/auth/logout", { method: "POST" }),

  // Dashboard & System
  getDashboard: () => API.request("/api/system/dashboard"),
  getSystem: () => API.request("/api/system/system"),

  // Main Bot Only
  getMainBot: () => API.request("/api/bots/main"),
  startMainBot: (phoneNumber) => API.request("/api/bots/main/start", {
    method: "POST",
    body: JSON.stringify({ phoneNumber })
  }),
  stopMainBot: () => API.request("/api/bots/main/stop", { method: "POST" }),
  restartMainBot: (phoneNumber) => API.request("/api/bots/main/restart", {
    method: "POST",
    body: JSON.stringify({ phoneNumber })
  }),
  resetMainSession: (confirmation) => API.request("/api/bots/main/reset-session", {
    method: "POST",
    body: JSON.stringify({ confirmation })
  }),

  // Settings
  getSettings: () => API.request("/api/system/settings"),
  updateSettings: (data) => API.request("/api/system/settings", {
    method: "POST",
    body: JSON.stringify(data)
  }),

  // Plugins
  getPlugins: () => API.request("/api/plugins"),
  reloadPlugins: () => API.request("/api/plugins/reload", { method: "POST" }),
  getPluginDetail: (category, filename) => API.request(`/api/plugins/detail/${encodeURIComponent(category)}/${encodeURIComponent(filename)}`),
  createPlugin: (data) => API.request("/api/plugins", { method: "POST", body: JSON.stringify(data) }),
  updatePlugin: (category, filename, code) => API.request(`/api/plugins/${encodeURIComponent(category)}/${encodeURIComponent(filename)}`, { method: "PUT", body: JSON.stringify({ code }) }),
  deletePlugin: (category, filename) => API.request(`/api/plugins/${encodeURIComponent(category)}/${encodeURIComponent(filename)}`, { method: "DELETE" }),
  deletePluginCategory: (category) => API.request(`/api/plugins/${encodeURIComponent(category)}`, { method: "DELETE" }),
  validatePluginSyntax: (code) => API.request("/api/plugins/validate-syntax", { method: "POST", body: JSON.stringify({ code }) }),

  // Logs
  getLogs: (level, search, limit = 300) => {
    let q = `?limit=${limit}`;
    if (level && level !== "ALL") q += `&level=${encodeURIComponent(level)}`;
    if (search) q += `&search=${encodeURIComponent(search)}`;
    return API.request(`/api/logs${q}`);
  },
  clearLogs: () => API.request("/api/logs/clear", { method: "POST" }),
};

export function escapeHtml(str) {
  if (typeof str !== "string") return str;
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
