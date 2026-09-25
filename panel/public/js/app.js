import { API, showToast, escapeHtml } from "./api.js";
import { Mascot } from "./mascot.js";
import { FirebaseService } from "./firebase-service.js";

// Global app state for single administrator
const state = {
  user: null,
  activeTab: "dashboard",
  mainBot: null,
  logs: [],
  logPaused: false,
  logAutoScroll: true,
  logFilterLevel: "ALL",
  logSearchQuery: "",
  pluginsData: null,
  pluginsFilterCategory: "all",
  pluginsSearchQuery: "",
  metrics: null,
  settingsData: null,
  recentActivity: [],
  realtimeSocket: null,
  realtimeReconnectTimer: null,
  realtimePingTimer: null,
  isProcessingAction: false,
};

// --- Initialization ---
document.addEventListener("DOMContentLoaded", async () => {
  // Initialize Firebase client in background
  FirebaseService.init().catch(err => console.warn("[Firebase] Init:", err));

  // Handle session expiration
  window.addEventListener("auth_expired", showLoginView);

  try {
    const user = await API.getMe();
    state.user = user;
    showMainView();
  } catch (_e) {
    showLoginView();
  }

  setupEventListeners();
  bindGlobalWindowMethods();
});

function showLoginView() {
  document.getElementById("login-view").classList.remove("hidden");
  document.getElementById("main-view").classList.add("hidden");
  
  const mascotContainer = document.getElementById("login-mascot-container");
  if (mascotContainer) {
    mascotContainer.innerHTML = Mascot.renderSvg("happy", 100);
  }

  if (state.realtimeReconnectTimer) {
    clearTimeout(state.realtimeReconnectTimer);
    state.realtimeReconnectTimer = null;
  }
  if (state.realtimePingTimer) {
    clearInterval(state.realtimePingTimer);
    state.realtimePingTimer = null;
  }
  if (state.realtimeSocket) {
    state.realtimeSocket.close();
    state.realtimeSocket = null;
  }
}

function showMainView() {
  document.getElementById("login-view").classList.add("hidden");
  document.getElementById("main-view").classList.remove("hidden");

  // Top header user info
  const topUserEl = document.getElementById("top-username");
  if (topUserEl) {
    topUserEl.innerText = state.user?.displayName || state.user?.email?.split("@")[0] || "Admin";
  }

  // Settings email info
  const settingsEmailEl = document.getElementById("settings-admin-email");
  if (settingsEmailEl) {
    settingsEmailEl.innerText = state.user?.email || state.user?.configuredAdminEmail || "--";
  }

  initRealtime();
  switchTab(state.activeTab || "dashboard");
  refreshDashboard();

  // Background refresh interval
  setInterval(() => {
    if (state.activeTab === "dashboard") refreshDashboard(false);
    else if (state.activeTab === "bots") refreshBots(false);
    else if (state.activeTab === "server") refreshSystemMetrics(false);
  }, 3500);
}

// --- Realtime WebSocket Stream ---
function initRealtime() {
  if (state.realtimeSocket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(state.realtimeSocket.readyState)) return;

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
  state.realtimeSocket = socket;

  socket.onopen = () => {
    if (state.realtimePingTimer) clearInterval(state.realtimePingTimer);
    state.realtimePingTimer = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "ping" }));
    }, 25000);
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.type === "log" && data.entry) {
        handleIncomingLog(data.entry);
      } else if (data.type === "bot_status" && data.botId === "main") {
        handleBotStatusUpdate(data.status, data.details || data.meta);
      } else if (data.type === "pairing_code" && data.botId === "main") {
        handlePairingCodeUpdate(data.code, data.targetNumber);
      } else if (data.type === "system_metrics") {
        state.metrics = data.data;
        if (state.activeTab === "server") renderSystemView();
        updateTopBarMetrics(data.data);
      }
    } catch (_e) {}
  };

  socket.onclose = () => {
    if (state.realtimeSocket === socket) state.realtimeSocket = null;
    if (state.realtimePingTimer) {
      clearInterval(state.realtimePingTimer);
      state.realtimePingTimer = null;
    }
    if (!state.realtimeReconnectTimer) {
      state.realtimeReconnectTimer = setTimeout(() => {
        state.realtimeReconnectTimer = null;
        initRealtime();
      }, 1500);
    }
  };
}

function handleIncomingLog(entry) {
  state.logs.push(entry);
  if (state.logs.length > 1500) state.logs.shift();

  if (state.activeTab === "logs" && !state.logPaused) {
    appendLogToTerminal(entry);
  }
}

function handleBotStatusUpdate(status, meta = {}) {
  if (state.mainBot) {
    state.mainBot.status = status;
    if (meta.number) state.mainBot.number = meta.number;
  }
  updateMascotMood(status);
  
  if (state.activeTab === "dashboard") {
    refreshDashboard(false);
  } else if (state.activeTab === "bots") {
    refreshBots(false);
  }
  showToast(`Main Bot is now ${status}`, status === "ONLINE" ? "success" : status === "CRASHED" ? "error" : "info");
}

function handlePairingCodeUpdate(code, targetNumber) {
  if (state.mainBot) {
    state.mainBot.status = "PAIRING";
    state.mainBot.pairingState = {
      isWaiting: true,
      code,
      targetNumber
    };
  }
  showToast(`Pairing code received: ${code}`, "success");
  if (state.activeTab === "dashboard") refreshDashboard(false);
  else if (state.activeTab === "bots") refreshBots(false);
}

// --- Navigation Tabs ---
export function switchTab(tabName) {
  state.activeTab = tabName;

  document.querySelectorAll(".nav-tab-btn").forEach((btn) => {
    if (btn.dataset.tab === tabName) {
      btn.classList.add("bg-[#1d99f3]", "text-white", "border-[#147ec9]", "font-bold", "shadow-[2px_2px_0px_#0c63a0]");
      btn.classList.remove("text-[#334155]", "border-transparent", "hover:bg-[#f1f5f9]");
    } else {
      btn.classList.remove("bg-[#1d99f3]", "text-white", "border-[#147ec9]", "font-bold", "shadow-[2px_2px_0px_#0c63a0]");
      btn.classList.add("text-[#334155]", "border-transparent", "hover:bg-[#f1f5f9]");
    }
  });

  const sections = ["dashboard", "bots", "logs", "plugins", "server", "settings"];
  sections.forEach((sec) => {
    const el = document.getElementById(`section-${sec}`);
    if (sec === tabName) el?.classList.remove("hidden");
    else el?.classList.add("hidden");
  });

  // Load section-specific data
  if (tabName === "dashboard") refreshDashboard();
  else if (tabName === "bots") refreshBots();
  else if (tabName === "logs") refreshLogs();
  else if (tabName === "plugins") refreshPlugins();
  else if (tabName === "server") refreshSystemMetrics();
  else if (tabName === "settings") refreshSettings();

  closeMobileDrawer();
}

// --- Dashboard ---
async function refreshDashboard(showLoader = true) {
  try {
    const data = await API.getDashboard();
    state.mainBot = data.bot.main;
    state.recentActivity = data.recentActivity || [];

    // Render Status Badges
    const statusEl = document.getElementById("stat-main-status");
    if (statusEl) statusEl.innerHTML = getStatusBadge(data.bot.main.status);

    const topBadge = document.getElementById("top-main-status-badge");
    if (topBadge) {
      topBadge.innerHTML = getStatusBadge(data.bot.main.status);
    }

    const numEl = document.getElementById("dashboard-bot-number");
    if (numEl) {
      numEl.innerText = `WhatsApp: ${data.bot.main.number ? data.bot.main.number : (data.bot.main.status === 'ONLINE' ? 'Connected' : 'Not Connected')}`;
    }

    // Set phone input value if not manually edited yet
    const phoneInput = document.getElementById("dash-phone-input");
    if (phoneInput && !phoneInput.value.trim()) {
      phoneInput.value = data.bot.main.pairingState?.targetNumber || data.bot.settings?.owner || "628";
    }

    // Pairing Banner
    const pairingBanner = document.getElementById("dash-pairing-banner");
    const pairingTarget = document.getElementById("dash-pairing-target");
    const pairingCodeDisp = document.getElementById("dash-pairing-code-display");

    if (data.bot.main.status === "PAIRING" || data.bot.main.pairingState?.isWaiting) {
      if (pairingBanner) pairingBanner.classList.remove("hidden");
      if (pairingTarget) pairingTarget.innerText = data.bot.main.pairingState?.targetNumber || "Custom";
      if (pairingCodeDisp) pairingCodeDisp.innerText = data.bot.main.pairingState?.code || "WAITING...";
    } else {
      if (pairingBanner) pairingBanner.classList.add("hidden");
    }

    const uptimeEl = document.getElementById("stat-uptime");
    if (uptimeEl) uptimeEl.innerText = data.bot.main.uptimeFormatted || "0s";

    const memEl = document.getElementById("stat-memory");
    if (memEl) memEl.innerText = data.bot.main.memory?.rss || "0 MB";

    const pidEl = document.getElementById("stat-pid");
    if (pidEl) pidEl.innerText = data.bot.main.pid || "-";

    const recEl = document.getElementById("stat-reconnects");
    if (recEl) recEl.innerText = data.bot.main.reconnectCount ?? 0;

    // Mascot Mood
    updateMascotMood(data.bot.main.status);

    // Hardware summary
    const cpuEl = document.getElementById("stat-cpu-percent");
    const cpuBar = document.getElementById("stat-cpu-bar");
    if (cpuEl) cpuEl.innerText = `${data.system.cpuPercent}%`;
    if (cpuBar) cpuBar.style.width = `${data.system.cpuPercent}%`;

    const ramEl = document.getElementById("stat-ram-percent");
    const ramBar = document.getElementById("stat-ram-bar");
    if (ramEl) ramEl.innerText = `${data.system.ramPercent}%`;
    if (ramBar) ramBar.style.width = `${data.system.ramPercent}%`;

    const diskEl = document.getElementById("stat-disk-percent");
    const diskBar = document.getElementById("stat-disk-bar");
    if (diskEl) diskEl.innerText = `${data.system.diskPercent}%`;
    if (diskBar) diskBar.style.width = `${data.system.diskPercent}%`;

    const hostEl = document.getElementById("stat-hostname");
    if (hostEl) hostEl.innerText = data.system.hostname || "vps";

    // Quick control buttons state
    const isOnline = data.bot.main.status === "ONLINE";
    const isConnecting = data.bot.main.status === "CONNECTING" || data.bot.main.status === "PAIRING";
    
    const startBtn = document.getElementById("dash-btn-start");
    const stopBtn = document.getElementById("dash-btn-stop");
    if (startBtn) startBtn.disabled = isOnline || isConnecting;
    if (stopBtn) stopBtn.disabled = !isOnline && !isConnecting;

    // Recent activity table
    renderRecentActivityTable(state.recentActivity);
  } catch (err) {
    if (showLoader) showToast(err.message, "error");
  }
}

function updateMascotMood(status) {
  const container = document.getElementById("header-mascot-container");
  const dialog = Mascot.getDialogue(status);

  if (container) {
    container.innerHTML = Mascot.renderSvg(dialog.mood, 84);
  }

  const moodTitle = document.getElementById("mascot-mood-title");
  const moodText = document.getElementById("mascot-mood-text");
  if (moodTitle) {
    moodTitle.innerText = dialog.title;
    moodTitle.className = `font-pixel text-xs sm:text-sm ${dialog.color}`;
  }
  if (moodText) moodText.innerText = dialog.text;
}

function renderRecentActivityTable(activities) {
  const tbody = document.getElementById("activity-table-body");
  if (!tbody) return;

  if (!activities || activities.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-[#64748b] font-mono text-xs font-semibold">No recent admin events recorded</td></tr>`;
    return;
  }

  tbody.innerHTML = activities.map((a) => `
    <tr class="border-b-2 border-[#cbd5e1] hover:bg-[#f8fafc] font-mono text-xs">
      <td class="p-2 text-[#64748b] font-bold whitespace-nowrap">${new Date(a.timestamp).toLocaleTimeString()}</td>
      <td class="p-2 font-bold text-[#1d99f3]">${escapeHtml(a.action)}</td>
      <td class="p-2 text-[#0f172a] font-semibold">${escapeHtml(a.target || "main")}</td>
      <td class="p-2"><span class="pixel-badge ${a.status === 'SUCCESS' ? 'pixel-badge-online' : 'pixel-badge-stopped'}">${a.status}</span></td>
    </tr>
  `).join("");
}

// --- Main Bot Process Manager ---
async function refreshBots(showLoader = true) {
  try {
    const data = await API.getMainBot();
    state.mainBot = data;
    renderMainBotCard(data);
  } catch (err) {
    if (showLoader) showToast(err.message, "error");
  }
}

function renderMainBotCard(bot) {
  const card = document.getElementById("main-bot-card");
  if (!card) return;

  if (!bot) {
    card.innerHTML = `<div class="p-6 text-center text-[#64748b] font-mono text-xs font-semibold">Main Bot instance offline or unreachable</div>`;
    return;
  }

  const isOnline = bot.status === "ONLINE";
  const isConnecting = bot.status === "CONNECTING" || bot.status === "PAIRING";
  const isPairing = bot.status === "PAIRING" || bot.pairingState?.isWaiting;

  card.innerHTML = `
    <div class="pixel-card-header p-4 flex items-center justify-between border-b-2 border-[#cbd5e1]">
      <div class="flex items-center gap-3">
        <span class="text-xl">🌸</span>
        <div>
          <div class="flex items-center gap-2">
            <h3 class="font-pixel text-xs text-[#0f172a]">MAIN BOT PROCESS (KOBENI-MD)</h3>
            <span class="kde-window-controls ml-2 hidden sm:inline-flex">
              <span class="kde-dot kde-dot-min"></span>
              <span class="kde-dot kde-dot-max"></span>
              <span class="kde-dot kde-dot-close"></span>
            </span>
          </div>
          <p class="font-mono text-xs text-[#475569] font-bold">WhatsApp: ${escapeHtml(bot.number || (isOnline ? "Connected" : "Not Paired"))}</p>
        </div>
      </div>
      <div>${getStatusBadge(bot.status)}</div>
    </div>

    <div class="p-5 space-y-4">
      <!-- Phone Number Input Form for Pairing -->
      <div class="p-4 bg-[#f8fafc] border-2 border-[#cbd5e1] rounded space-y-2">
        <label class="block font-mono text-xs font-bold text-[#0f172a]">
          WhatsApp Pairing Phone Number:
        </label>
        <div class="flex flex-col sm:flex-row gap-2">
          <input type="tel" id="main-card-phone-input" value="${escapeHtml(bot.pairingState?.targetNumber || bot.number || '628')}" placeholder="6281234567890" class="flex-1 px-3 py-2 bg-white border-2 border-[#cbd5e1] rounded font-mono text-xs text-[#0f172a] font-bold focus:border-[#1d99f3] outline-none" />
          <button onclick="handleStartWithInputNumber('main-card-phone-input')" ${isOnline || isConnecting ? 'disabled' : ''} class="pixel-btn pixel-btn-success text-xs whitespace-nowrap">
            ▶ [ START & GET PAIRING CODE ]
          </button>
        </div>
        <p class="font-mono text-[11px] text-[#64748b]">
          Enter your WhatsApp number with international country code (no + or spaces). When you click Start, Kobeni will generate an 8-digit pairing code.
        </p>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
        <div class="p-3 bg-white border-2 border-[#cbd5e1] rounded">
          <span class="text-[#64748b] block text-[10px] uppercase font-bold">Process PID</span>
          <span class="text-[#0f172a] font-bold text-sm">${bot.pid || "-"}</span>
        </div>
        <div class="p-3 bg-white border-2 border-[#cbd5e1] rounded">
          <span class="text-[#64748b] block text-[10px] uppercase font-bold">Bot Uptime</span>
          <span class="text-[#27ae60] font-bold text-sm">${bot.uptimeFormatted || "0s"}</span>
        </div>
        <div class="p-3 bg-white border-2 border-[#cbd5e1] rounded">
          <span class="text-[#64748b] block text-[10px] uppercase font-bold">Memory RSS</span>
          <span class="text-[#0f172a] font-bold text-sm">${bot.memory?.rss || "0 MB"}</span>
        </div>
        <div class="p-3 bg-white border-2 border-[#cbd5e1] rounded">
          <span class="text-[#64748b] block text-[10px] uppercase font-bold">Reconnects</span>
          <span class="text-[#0f172a] font-bold text-sm">${bot.reconnectCount ?? 0}</span>
        </div>
      </div>

      ${isPairing ? `
        <div class="p-4 bg-white border-2 border-[#f67400] rounded-md flex flex-col sm:flex-row items-center justify-between gap-3 font-mono shadow-[2px_2px_0px_#d35400]">
          <div>
            <span class="text-xs font-pixel text-[#f67400] block font-bold">WHATSAPP PAIRING CODE ACTIVE</span>
            <span class="text-xs text-[#334155] font-semibold">Target Number: <strong>${escapeHtml(bot.pairingState?.targetNumber || '--')}</strong></span>
          </div>
          <div class="flex items-center gap-2">
            <div id="bot-card-pairing-code" class="px-4 py-2 bg-white border-2 border-[#f67400] text-[#f67400] font-mono text-xl font-bold tracking-widest rounded select-all shadow-[2px_2px_0px_#d35400]">
              ${escapeHtml(bot.pairingState?.code || 'WAITING...')}
            </div>
            <button onclick="copyPairingCode('${escapeHtml(bot.pairingState?.code || '')}')" class="pixel-btn pixel-btn-primary text-xs py-2 px-3">
              📋 [ COPY ]
            </button>
          </div>
        </div>
      ` : ""}

      <!-- Action Buttons -->
      <div class="flex flex-wrap gap-2 pt-2 border-t-2 border-[#cbd5e1]">
        <button onclick="handleBotAction('main', 'stop')" ${!isOnline && !isConnecting ? 'disabled' : ''} class="pixel-btn pixel-btn-danger">
          ■ [ STOP BOT ]
        </button>
        <button onclick="handleBotAction('main', 'restart')" class="pixel-btn pixel-btn-primary">
          ⟳ [ RESTART BOT ]
        </button>
        <button onclick="openWipeModal()" class="pixel-btn pixel-btn-danger ml-auto">
          ⚠️ [ WIPE SESSION ]
        </button>
      </div>
    </div>
  `;
}

export async function handleStartWithInputNumber(inputId) {
  const input = document.getElementById(inputId);
  const phoneNumber = input ? input.value.trim() : "";

  if (!phoneNumber || phoneNumber.replace(/[^0-9]/g, "").length < 7) {
    showToast("Please enter a valid WhatsApp phone number (at least 7 digits)", "error");
    return;
  }

  if (state.isProcessingAction) return;
  state.isProcessingAction = true;

  try {
    showToast(`Initiating Main Bot start for number ${phoneNumber}...`, "info");
    const res = await API.startMainBot(phoneNumber);
    showToast(res.message || "Bot start initiated", "success");
    await refreshDashboard(false);
    await refreshBots(false);
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    state.isProcessingAction = false;
  }
}

export async function handleBotAction(botId, action) {
  if (state.isProcessingAction) return;
  state.isProcessingAction = true;

  try {
    showToast(`Sending ${action.toUpperCase()} command to Main Bot...`, "info");
    if (action === "start") {
      const phoneInput = document.getElementById("dash-phone-input");
      const phone = phoneInput ? phoneInput.value.trim() : null;
      await API.startMainBot(phone);
    } else if (action === "stop") {
      await API.stopMainBot();
    } else if (action === "restart") {
      const phoneInput = document.getElementById("dash-phone-input");
      const phone = phoneInput ? phoneInput.value.trim() : null;
      await API.restartMainBot(phone);
    }

    showToast(`Main Bot ${action}ed successfully`, "success");
    await refreshDashboard(false);
    await refreshBots(false);
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    state.isProcessingAction = false;
  }
}

export function copyPairingCode(codeOverride = null) {
  const code = codeOverride || 
               document.getElementById("dash-pairing-code-display")?.innerText?.trim() || 
               state.mainBot?.pairingState?.code;
  if (!code || code === "---- ----" || code === "WAITING...") {
    showToast("No pairing code available yet", "info");
    return;
  }
  navigator.clipboard.writeText(code);
  showToast(`Pairing code ${code} copied to clipboard!`, "success");
}

// --- Live Logs ---
async function refreshLogs() {
  try {
    const data = await API.getLogs(state.logFilterLevel, state.logSearchQuery);
    state.logs = data.logs || [];
    renderLogsTerminal();
  } catch (err) {
    showToast(err.message, "error");
  }
}

function renderLogsTerminal() {
  const terminal = document.getElementById("logs-terminal");
  if (!terminal) return;

  if (state.logs.length === 0) {
    terminal.innerHTML = `<div class="text-[#64748b] font-semibold">No logs available matching current filter.</div>`;
    return;
  }

  terminal.innerHTML = state.logs.map(renderSingleLogLine).join("");
  if (state.logAutoScroll) {
    terminal.scrollTop = terminal.scrollHeight;
  }
}

function appendLogToTerminal(entry) {
  const terminal = document.getElementById("logs-terminal");
  if (!terminal) return;

  if (state.logFilterLevel !== "ALL" && entry.level !== state.logFilterLevel) return;
  if (state.logSearchQuery && !entry.message.toLowerCase().includes(state.logSearchQuery.toLowerCase())) return;

  const lineHtml = renderSingleLogLine(entry);
  terminal.insertAdjacentHTML("beforeend", lineHtml);

  if (state.logAutoScroll) {
    terminal.scrollTop = terminal.scrollHeight;
  }
}

function renderSingleLogLine(l) {
  const levelColors = {
    INFO: "text-[#1d99f3] font-bold",
    WARN: "text-[#f67400] font-bold",
    ERROR: "text-[#da4453] font-bold",
    WHATSAPP: "text-[#27ae60] font-bold",
    MSG: "text-[#8e44ad] font-bold",
    BOT: "text-[#16a085] font-bold"
  };
  const color = levelColors[l.level] || "text-[#334155] font-bold";

  return `
    <div class="hover:bg-[#f1f5f9] px-1 py-0.5 rounded font-mono text-[11px] leading-relaxed break-all">
      <span class="text-[#64748b] select-none font-bold">${new Date(l.timestamp).toLocaleTimeString()}</span>
      <span class="${color} select-none mx-1.5">[${l.level}]</span>
      <span class="text-[#334155] font-bold select-none mr-1.5">&lt;${escapeHtml(l.source)}&gt;</span>
      <span class="text-[#0f172a] font-medium">${escapeHtml(l.message)}</span>
    </div>
  `;
}

window.filterLogs = function(level) {
  if (level !== undefined) state.logFilterLevel = level;
  const searchInput = document.getElementById("log-search-input");
  state.logSearchQuery = searchInput?.value.trim() || "";
  refreshLogs();
};

window.togglePauseLogs = function() {
  state.logPaused = !state.logPaused;
  const btn = document.getElementById("btn-pause-logs");
  if (btn) btn.innerText = state.logPaused ? "▶ RESUME" : "⏸ PAUSE";
};

window.toggleAutoScroll = function(checkbox) {
  state.logAutoScroll = checkbox.checked;
};

window.handleClearLogs = async function() {
  await API.clearLogs();
  state.logs = [];
  renderLogsTerminal();
};

window.copyLogsToClipboard = function() {
  const text = state.logs.map(l => `[${l.timestamp}] [${l.level}] <${l.source}> ${l.message}`).join("\n");
  navigator.clipboard.writeText(text);
  showToast("Logs copied to clipboard!", "success");
};

// --- Plugins Manager ---
let activeEditorMode = "create"; // "create" or "edit"
let activeEditCategory = "";
let activeEditFilename = "";
let editorSyntaxTimer = null;

async function refreshPlugins() {
  try {
    const data = await API.getPlugins();
    state.pluginsData = data;
    
    // Update Syntax Alert Banner
    const alertBox = document.getElementById("plugin-syntax-alert");
    const countEl = document.getElementById("plugin-syntax-count");
    const errorCount = data.syntaxErrorCount || 0;
    if (alertBox && countEl) {
      countEl.innerText = errorCount;
      if (errorCount > 0) {
        alertBox.classList.remove("hidden");
      } else {
        alertBox.classList.add("hidden");
      }
    }

    renderPluginsPills(data.categories || []);
    renderPluginsGrid(data.plugins || []);
  } catch (err) {
    showToast(err.message, "error");
  }
}

function renderPluginsPills(categories) {
  const container = document.getElementById("plugins-category-pills");
  if (!container) return;

  const allCount = state.pluginsData?.totalPlugins || 0;
  const syntaxErrCount = state.pluginsData?.syntaxErrorCount || 0;
  let html = `
    <button onclick="filterPluginsCategory('all')" class="pixel-btn ${state.pluginsFilterCategory === 'all' ? 'pixel-btn-primary' : 'pixel-btn-secondary'} text-[10px] py-1 px-2.5">
      ALL (${allCount})
    </button>
  `;

  if (syntaxErrCount > 0) {
    html += `
      <button onclick="filterPluginsCategory('__errors__')" class="pixel-btn ${state.pluginsFilterCategory === '__errors__' ? 'pixel-btn-danger' : 'pixel-btn-secondary'} text-[10px] py-1 px-2.5">
        ⚠️ SYNTAX ERRORS (${syntaxErrCount})
      </button>
    `;
  }

  categories.forEach(c => {
    const active = state.pluginsFilterCategory === c.category;
    html += `
      <button onclick="filterPluginsCategory('${c.category}')" class="pixel-btn ${active ? 'pixel-btn-primary' : 'pixel-btn-secondary'} text-[10px] py-1 px-2.5 uppercase">
        ${c.category} (${c.pluginCount})
      </button>
    `;
  });

  container.innerHTML = html;
}

function renderPluginsGrid(plugins) {
  const grid = document.getElementById("plugins-grid");
  if (!grid) return;

  let filtered = plugins || [];
  if (state.pluginsFilterCategory === "__errors__") {
    filtered = filtered.filter(p => p.hasSyntaxError);
  } else if (state.pluginsFilterCategory !== "all") {
    filtered = filtered.filter(p => p.category === state.pluginsFilterCategory);
  }

  if (state.pluginsSearchQuery) {
    const q = state.pluginsSearchQuery.toLowerCase();
    filtered = filtered.filter(p => 
      (p.name && p.name.toLowerCase().includes(q)) || 
      (p.filename && p.filename.toLowerCase().includes(q)) || 
      (p.commands && p.commands.some(c => c.toLowerCase().includes(q)))
    );
  }

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="p-6 text-center text-[#64748b] font-mono text-xs col-span-full font-semibold">No plugins found matching filter.</div>`;
    return;
  }

  grid.innerHTML = filtered.map(p => {
    const isError = !!p.hasSyntaxError;
    const cardBorder = isError ? "border-[#da4453] shadow-[2px_2px_0px_#da4453]" : "border-[#cbd5e1] hover:border-[#1d99f3] shadow-[2px_2px_0px_#94a3b8]";

    return `
      <div class="p-3.5 bg-white border-2 ${cardBorder} rounded font-mono text-xs transition space-y-2 flex flex-col justify-between">
        <div class="space-y-2">
          <div class="flex items-center justify-between gap-1">
            <span class="font-bold text-[#0f172a] truncate">${escapeHtml(p.filename || p.name)}</span>
            <div class="flex items-center gap-1 shrink-0">
              ${isError ? `<span class="pixel-badge pixel-badge-stopped text-[9px]">● SYNTAX ERROR</span>` : `<span class="pixel-badge pixel-badge-primary text-[9px] uppercase">${escapeHtml(p.category)}</span>`}
            </div>
          </div>

          ${isError ? `
            <div class="p-2 bg-[#fef2f2] border border-[#f87171] text-[#b91c1c] text-[10px] rounded space-y-0.5 leading-snug">
              <span class="font-bold block">⚠️ Syntax Error:</span>
              <p class="truncate" title="${escapeHtml(p.syntaxError || 'Invalid code')}">${escapeHtml(p.syntaxError || 'Syntax error in file')}</p>
            </div>
          ` : `
            <div class="text-[11px] text-[#334155] flex flex-wrap gap-1">
              ${(p.commands || []).map(cmd => `<span class="px-1.5 py-0.5 bg-white text-[#1d99f3] font-bold rounded border border-[#1d99f3]">.${escapeHtml(cmd)}</span>`).join("")}
            </div>
          `}
        </div>

        <div class="flex items-center justify-between pt-2 border-t border-[#e2e8f0] text-[10px]">
          <span class="text-[#64748b] font-medium">${escapeHtml(p.sizeFormatted || 'JS')}</span>
          <div class="flex items-center gap-2">
            <button onclick="openEditPluginModal('${escapeHtml(p.category)}', '${escapeHtml(p.filename)}')" class="${isError ? 'pixel-btn pixel-btn-danger text-[10px] py-1 px-2' : 'pixel-btn pixel-btn-primary text-[10px] py-1 px-2'} font-bold">
              ${isError ? '✏️ [ FIX SYNTAX ]' : '✏️ [ EDIT ]'}
            </button>
            <button onclick="deletePluginDirect('${escapeHtml(p.category)}', '${escapeHtml(p.filename)}')" class="pixel-btn pixel-btn-danger text-[10px] py-1 px-2 font-bold" title="Delete this plugin file">
              🗑️
            </button>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

window.filterPluginsCategory = function(cat) {
  state.pluginsFilterCategory = cat;
  renderPluginsPills(state.pluginsData?.categories || []);
  renderPluginsGrid(state.pluginsData?.plugins || []);
};

window.filterPluginsWithSyntaxErrors = function() {
  state.pluginsFilterCategory = "__errors__";
  renderPluginsPills(state.pluginsData?.categories || []);
  renderPluginsGrid(state.pluginsData?.plugins || []);
};

window.handlePluginSearch = function(query) {
  state.pluginsSearchQuery = query.trim();
  renderPluginsGrid(state.pluginsData?.plugins || []);
};

window.handleReloadPlugins = async function() {
  const btn = document.getElementById("btn-reload-plugins");
  if (btn) btn.disabled = true;

  try {
    showToast("Reloading plugins into bot handler...", "info");
    const res = await API.reloadPlugins();
    showToast(res.message || "Plugins reloaded!", "success");
    await refreshPlugins();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    if (btn) btn.disabled = false;
  }
};

// --- Add & Edit Plugin Modals ---
window.openAddPluginModal = function() {
  activeEditorMode = "create";
  activeEditCategory = "";
  activeEditFilename = "";

  const modal = document.getElementById("plugin-modal");
  const title = document.getElementById("plugin-modal-title");
  const modeBadge = document.getElementById("plugin-editor-mode-badge");
  const catInput = document.getElementById("plugin-input-category");
  const fileInput = document.getElementById("plugin-input-filename");
  const codeTextarea = document.getElementById("plugin-editor-code");
  const delBtn = document.getElementById("btn-delete-plugin");
  const errBox = document.getElementById("plugin-editor-error-box");
  const syntaxStatus = document.getElementById("plugin-syntax-status");

  if (title) title.innerText = "CREATE NEW PLUGIN";
  if (modeBadge) {
    modeBadge.innerText = "NEW PLUGIN";
    modeBadge.className = "pixel-badge pixel-badge-online text-[9px]";
  }

  if (catInput) {
    catInput.value = (state.pluginsFilterCategory !== "all" && state.pluginsFilterCategory !== "__errors__") ? state.pluginsFilterCategory : "tools";
    catInput.disabled = false;
  }
  if (fileInput) {
    fileInput.value = "mycmd.js";
    fileInput.disabled = false;
  }
  if (delBtn) delBtn.classList.add("hidden");
  if (errBox) errBox.classList.add("hidden");
  if (syntaxStatus) {
    syntaxStatus.innerHTML = `<span class="text-[#27ae60]">✓ Ready to create</span>`;
  }

  if (codeTextarea) {
    codeTextarea.value = getDefaultPluginTemplate("mycmd");
  }
  setEditorDirty(false);

  setupEditorTabSupport();
  if (modal) modal.classList.remove("hidden");
};

window.openEditPluginModal = async function(category, filename) {
  activeEditorMode = "edit";
  activeEditCategory = category;
  activeEditFilename = filename;

  const modal = document.getElementById("plugin-modal");
  const title = document.getElementById("plugin-modal-title");
  const modeBadge = document.getElementById("plugin-editor-mode-badge");
  const catInput = document.getElementById("plugin-input-category");
  const fileInput = document.getElementById("plugin-input-filename");
  const codeTextarea = document.getElementById("plugin-editor-code");
  const delBtn = document.getElementById("btn-delete-plugin");
  const errBox = document.getElementById("plugin-editor-error-box");
  const errMsg = document.getElementById("plugin-editor-error-msg");
  const syntaxStatus = document.getElementById("plugin-syntax-status");

  if (title) title.innerText = `EDIT: ${category}/${filename}`;
  if (modeBadge) {
    modeBadge.innerText = "EDIT MODE";
    modeBadge.className = "pixel-badge pixel-badge-primary text-[9px]";
  }

  if (catInput) {
    catInput.value = category;
    catInput.disabled = true;
  }
  if (fileInput) {
    fileInput.value = filename;
    fileInput.disabled = true;
  }
  if (delBtn) delBtn.classList.remove("hidden");

  try {
    showToast(`Loading ${category}/${filename}...`, "info");
    const res = await API.getPluginDetail(category, filename);
    if (codeTextarea) codeTextarea.value = res.code || "// Empty";
    setEditorDirty(false);

    if (res.hasSyntaxError) {
      if (errBox) errBox.classList.remove("hidden");
      if (errMsg) errMsg.innerText = res.syntaxError || "Invalid syntax";
      if (syntaxStatus) syntaxStatus.innerHTML = `<span class="text-[#da4453]">⚠️ Syntax Error</span>`;
    } else {
      if (errBox) errBox.classList.add("hidden");
      if (syntaxStatus) syntaxStatus.innerHTML = `<span class="text-[#27ae60]">✓ Syntax Valid</span>`;
    }
  } catch (err) {
    showToast(err.message, "error");
    if (codeTextarea) codeTextarea.value = "// Error loading file content";
  }

  setupEditorTabSupport();
  if (modal) modal.classList.remove("hidden");
};

window.insertPluginTemplate = function() {
  const fileInput = document.getElementById("plugin-input-filename");
  const filename = fileInput?.value?.trim() || "sample.js";
  const cmdName = filename.replace(/\.js$/i, "") || "sample";
  const codeTextarea = document.getElementById("plugin-editor-code");
  if (codeTextarea) {
    codeTextarea.value = getDefaultPluginTemplate(cmdName);
    handleCheckEditorSyntax();
    showToast("Template inserted!", "success");
  }
};

function getDefaultPluginTemplate(cmdName = "test") {
  return `/**
 * Kobeni-MD Command Plugin: ${cmdName}
 */
let handler = async (m, { conn, text, usedPrefix, command }) => {
  // Your command logic here:
  await m.reply(\`✨ Hello from .\${command}! Senpai asked: \${text || '(nothing)'}\`);
};

handler.help = ["${cmdName}"];
handler.tags = ["tools"];
handler.command = ["${cmdName}"];

export default handler;
`;
}

window.handleCheckEditorSyntax = async function(options = {}) {
  const codeTextarea = document.getElementById("plugin-editor-code");
  const code = codeTextarea?.value || "";
  const errBox = document.getElementById("plugin-editor-error-box");
  const errMsg = document.getElementById("plugin-editor-error-msg");
  const syntaxStatus = document.getElementById("plugin-syntax-status");

  if (syntaxStatus) syntaxStatus.innerHTML = `<span class="text-[#f67400]">⟳ Checking syntax...</span>`;

  try {
    const res = await API.validatePluginSyntax(code);
    if (res.valid) {
      if (errBox) errBox.classList.add("hidden");
      if (syntaxStatus) syntaxStatus.innerHTML = `<span class="text-[#27ae60]">✓ Syntax is 100% Valid</span>`;
      if (!options.silent) showToast("JavaScript Syntax is valid!", "success");
    } else {
      if (errBox) errBox.classList.remove("hidden");
      if (errMsg) errMsg.innerText = res.error || "Syntax error";
      if (syntaxStatus) syntaxStatus.innerHTML = `<span class="text-[#da4453]">⚠️ Syntax Error Detected</span>`;
      if (!options.silent) showToast(`Syntax error: ${res.error}`, "error");
    }
  } catch (err) {
    if (!options.silent) showToast(err.message, "error");
  }
};

window.handleSavePlugin = async function() {
  const catInput = document.getElementById("plugin-input-category");
  const fileInput = document.getElementById("plugin-input-filename");
  const codeTextarea = document.getElementById("plugin-editor-code");
  const saveBtn = document.getElementById("btn-save-plugin");

  const category = catInput?.value?.trim() || "tools";
  let filename = fileInput?.value?.trim() || "newplugin.js";
  if (!filename.endsWith(".js")) filename += ".js";
  const code = codeTextarea?.value || "";

  if (!code.trim()) {
    showToast("Plugin code cannot be empty", "error");
    return;
  }

  if (saveBtn) saveBtn.disabled = true;

  try {
    let result;
    if (activeEditorMode === "create") {
      showToast(`Creating plugin ${category}/${filename}...`, "info");
      result = await API.createPlugin({ category, filename, code });
    } else {
      showToast(`Updating plugin ${activeEditCategory}/${activeEditFilename}...`, "info");
      result = await API.updatePlugin(activeEditCategory, activeEditFilename, code);
    }

    if (result.hasSyntaxError) {
      showToast(`Saved with syntax error warning: ${result.syntaxError}`, "error");
    } else {
      showToast(result.message || "Plugin saved and reloaded!", "success");
    }

    setEditorDirty(false);
    closePluginModal();
    await refreshPlugins();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
};

window.handleDeletePlugin = async function() {
  if (activeEditorMode !== "edit" || !activeEditCategory || !activeEditFilename) return;

  const confirmed = confirm(`Are you sure you want to permanently delete plugin ${activeEditCategory}/${activeEditFilename}?`);
  if (!confirmed) return;

  try {
    showToast(`Deleting ${activeEditCategory}/${activeEditFilename}...`, "info");
    const res = await API.deletePlugin(activeEditCategory, activeEditFilename);
    showToast(res.message || "Plugin deleted successfully", "success");
    closePluginModal();
    await refreshPlugins();
  } catch (err) {
    showToast(err.message, "error");
  }
};

window.deletePluginDirect = async function(category, filename) {
  const confirmed = confirm(`Delete plugin ${category}/${filename}? This removes the file from the category folder.`);
  if (!confirmed) return;

  try {
    showToast(`Deleting ${category}/${filename}...`, "info");
    const res = await API.deletePlugin(category, filename);
    showToast(res.message || "Plugin deleted successfully", "success");
    await refreshPlugins();
  } catch (err) {
    showToast(err.message, "error");
  }
};

window.closePluginModal = function() {
  const modal = document.getElementById("plugin-modal");
  if (state.pluginEditorDirty && !confirm("Discard unsaved plugin changes?")) return;
  setEditorDirty(false);
  if (modal) modal.classList.add("hidden");
};

function setEditorDirty(dirty) {
  state.pluginEditorDirty = dirty;
  const status = document.getElementById("plugin-editor-dirty-status");
  if (status) status.innerText = dirty ? "● UNSAVED CHANGES" : "✓ SAVED";
  if (status) status.className = dirty
    ? "text-[#f67400] font-bold"
    : "text-[#27ae60] font-bold";
}

function setupEditorTabSupport() {
  const textarea = document.getElementById("plugin-editor-code");
  if (!textarea || textarea.dataset.tabBound) return;

  textarea.dataset.tabBound = "true";
  textarea.addEventListener("keydown", function(e) {
    if (e.key === "Tab") {
      e.preventDefault();
      const start = this.selectionStart;
      const end = this.selectionEnd;
      this.value = this.value.substring(0, start) + "  " + this.value.substring(end);
      this.selectionStart = this.selectionEnd = start + 2;
    }

  });

  textarea.addEventListener("input", () => {
    setEditorDirty(true);
    const status = document.getElementById("plugin-syntax-status");
    if (status) status.innerHTML = `<span class="text-[#64748b]">● Waiting for syntax check...</span>`;
    clearTimeout(editorSyntaxTimer);
    editorSyntaxTimer = setTimeout(() => window.handleCheckEditorSyntax({ silent: true }), 650);
  });
}

// --- Server Monitor ---
async function refreshSystemMetrics(showLoader = true) {
  try {
    const metrics = await API.getSystem();
    state.metrics = metrics;
    renderSystemView();
    updateTopBarMetrics(metrics);
  } catch (err) {
    if (showLoader) showToast(err.message, "error");
  }
}

function updateTopBarMetrics(metrics) {
  const cpuEl = document.getElementById("top-cpu");
  const ramEl = document.getElementById("top-ram");
  const upEl = document.getElementById("top-uptime");

  if (cpuEl) cpuEl.innerText = `CPU ${metrics.cpu.usagePercent}%`;
  if (ramEl) ramEl.innerText = `RAM ${metrics.memory.percent}%`;
  if (upEl) upEl.innerText = `Uptime: ${metrics.host.uptimeFormatted}`;
}

function renderSystemView() {
  const m = state.metrics;
  if (!m) return;

  // CPU
  const cpuPct = document.getElementById("metric-cpu-percent");
  const cpuBar = document.getElementById("metric-cpu-bar");
  if (cpuPct) cpuPct.innerText = `${m.cpu.usagePercent}%`;
  if (cpuBar) cpuBar.style.width = `${m.cpu.usagePercent}%`;
  document.getElementById("metric-cpu-model").innerText = m.cpu.model;
  document.getElementById("metric-cpu-cores").innerText = `${m.cpu.cores} Cores`;
  document.getElementById("metric-load-avg").innerText = m.cpu.loadAverage.join(", ");

  // RAM
  const ramPct = document.getElementById("metric-ram-percent");
  const ramBar = document.getElementById("metric-ram-bar");
  if (ramPct) ramPct.innerText = `${m.memory.percent}%`;
  if (ramBar) ramBar.style.width = `${m.memory.percent}%`;
  document.getElementById("metric-ram-used").innerText = m.memory.usedFormatted;
  document.getElementById("metric-ram-total").innerText = m.memory.totalFormatted;
  document.getElementById("metric-ram-free").innerText = m.memory.freeFormatted;

  // Disk
  const diskPct = document.getElementById("metric-disk-percent");
  const diskBar = document.getElementById("metric-disk-bar");
  if (diskPct) diskPct.innerText = `${m.disk.percent}%`;
  if (diskBar) diskBar.style.width = `${m.disk.percent}%`;
  document.getElementById("metric-disk-used").innerText = m.disk.usedFormatted;
  document.getElementById("metric-disk-total").innerText = m.disk.totalFormatted;
  document.getElementById("metric-disk-free").innerText = m.disk.freeFormatted;

  // Process
  document.getElementById("metric-proc-pid").innerText = m.process.pid;
  document.getElementById("metric-proc-uptime").innerText = m.process.uptimeFormatted;
  document.getElementById("metric-proc-heap").innerText = m.process.heapUsedFormatted;
  document.getElementById("metric-node-version").innerText = m.host.nodeVersion;
  document.getElementById("metric-os-info").innerText = `${m.host.platform} (${m.host.arch}) - ${m.host.release}`;
}

// --- Settings & Access ---
async function refreshSettings() {
  try {
    const data = await API.getSettings();
    state.settingsData = data;

    const emailEl = document.getElementById("settings-admin-email");
    if (emailEl) {
      emailEl.innerText = data.adminEmail || state.user?.email || "keeplazyy@gmail.com";
    }

    const setPairing = document.getElementById("set-pairing-number");
    if (setPairing) setPairing.value = data.pairingTargetNumber || data.owner || "";

    const setPrefix = document.getElementById("set-prefix");
    if (setPrefix) setPrefix.value = Array.isArray(data.prefix) ? data.prefix.join(", ") : data.prefix;

    const setPairingCode = document.getElementById("set-pairing-code-name");
    if (setPairingCode) setPairingCode.value = data.pairingcode || "KOBENIMD";

    const setMode = document.getElementById("set-bot-mode");
    if (setMode) setMode.value = String(data.isPublic);

    const setWmsw = document.getElementById("set-wmsw");
    if (setWmsw) setWmsw.value = data.wmsw || "";

    renderAccessUsers(data.accessUsers || []);
  } catch (err) {
    showToast(err.message, "error");
  }
}

function renderAccessUsers(users) {
  const container = document.getElementById("access-users-list");
  const badge = document.getElementById("access-total-badge");
  if (badge) badge.innerText = `${users.length} USERS`;
  if (!container) return;

  if (users.length === 0) {
    container.innerHTML = `<div class="p-3 bg-white border border-[#cbd5e1] rounded text-[#64748b] text-center font-bold">No access users added yet</div>`;
    return;
  }

  container.innerHTML = users.map(u => `
    <div class="p-2.5 bg-white border-2 border-[#cbd5e1] rounded flex items-center justify-between hover:bg-[#f8fafc]">
      <div class="flex items-center gap-2">
        <span class="text-[#27ae60] font-bold">●</span>
        <span class="font-bold text-[#0f172a]">${escapeHtml(u.id || u)}</span>
      </div>
      <button onclick="handleRemoveAccessUser('${escapeHtml(u.id || u)}')" class="pixel-btn pixel-btn-danger text-[10px] py-1 px-2">
        ✕ [ REMOVE ]
      </button>
    </div>
  `).join("");
}

window.handleSaveSettings = async function(e) {
  e.preventDefault();
  const btn = document.getElementById("btn-save-settings");
  if (btn) btn.disabled = true;

  try {
    const pairingTargetNumber = document.getElementById("set-pairing-number")?.value?.trim();
    const prefixRaw = document.getElementById("set-prefix")?.value?.trim();
    const prefix = prefixRaw ? prefixRaw.split(",").map(s => s.trim()).filter(Boolean) : [".", "!"];
    const pairingcode = document.getElementById("set-pairing-code-name")?.value?.trim() || "KOBENIMD";
    const isPublic = document.getElementById("set-bot-mode")?.value === "true";
    const wmsw = document.getElementById("set-wmsw")?.value || "";

    const res = await API.updateSettings({
      pairingTargetNumber,
      prefix,
      pairingcode,
      isPublic,
      wmsw
    });

    showToast("Bot settings saved successfully!", "success");
    await refreshSettings();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    if (btn) btn.disabled = false;
  }
};

window.handleAddAccessUser = async function() {
  const input = document.getElementById("new-access-number");
  const number = input?.value?.trim();

  if (!number || number.replace(/[^0-9]/g, "").length < 7) {
    showToast("Please enter a valid phone number with country code", "error");
    return;
  }

  try {
    await API.addAccess("main", number);
    showToast(`User ${number} added to Access list`, "success");
    if (input) input.value = "";
    await refreshSettings();
  } catch (err) {
    showToast(err.message, "error");
  }
};

window.handleRemoveAccessUser = async function(number) {
  try {
    await API.removeAccess("main", number);
    showToast(`User ${number} removed from Access list`, "success");
    await refreshSettings();
  } catch (err) {
    showToast(err.message, "error");
  }
};

// --- In-App Wipe Session Modal ---
window.openWipeModal = function() {
  const modal = document.getElementById("wipe-modal");
  const input = document.getElementById("wipe-confirm-input");
  if (input) input.value = "";
  if (modal) modal.classList.remove("hidden");
};

window.closeWipeModal = function() {
  const modal = document.getElementById("wipe-modal");
  if (modal) modal.classList.add("hidden");
};

window.executeWipeSession = async function() {
  const input = document.getElementById("wipe-confirm-input");
  const val = input ? input.value.trim().toUpperCase() : "";

  if (val !== "RESET") {
    showToast("Please type 'RESET' in uppercase to confirm wipe", "error");
    return;
  }

  const btn = document.getElementById("btn-confirm-wipe");
  if (btn) btn.disabled = true;

  try {
    showToast("Wiping Baileys session credentials...", "info");
    const res = await API.resetMainSession("RESET");
    showToast(res.message || "Session wiped successfully!", "success");
    closeWipeModal();
    await refreshDashboard(false);
    await refreshBots(false);
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    if (btn) btn.disabled = false;
  }
};

// --- Google Sign-In & Single Admin Auth ---
async function handleGoogleSignIn() {
  const btn = document.getElementById("btn-google-login");
  const btnText = document.getElementById("btn-google-text");
  const deniedBox = document.getElementById("login-denied-box");

  if (deniedBox) deniedBox.classList.add("hidden");
  if (btn) btn.disabled = true;
  if (btnText) btnText.innerText = "Connecting with Google...";

  try {
    showToast("Opening Google Sign-In with Firebase...", "info");
    const { idToken, profile } = await FirebaseService.signInWithGoogle();

    showToast("Verifying administrator identity...", "info");
    const res = await API.googleLogin(idToken, profile);
    API.setToken(res.token);

    state.user = res;
    showToast(`Welcome Administrator! Signed in as ${res.email}`, "success");
    showMainView();
  } catch (err) {
    console.error("Google sign-in error:", err);
    await FirebaseService.signOut().catch(() => {});
    API.setToken(null);

    if (err?.code === "ADMIN_EMAIL_NOT_ALLOWED" || err?.message?.includes("not authorized")) {
      if (deniedBox) {
        deniedBox.classList.remove("hidden");
        const deniedEmail = document.getElementById("denied-email-display");
        if (deniedEmail) deniedEmail.innerText = err.unauthorizedEmail || "this account";
      }
      showToast("Access Denied: This Google account is not the authorized administrator.", "error");
    } else if (err?.code === "auth/popup-closed-by-user") {
      showToast("Google sign-in popup was closed.", "info");
    } else {
      showToast(err.message || "Authentication failed", "error");
    }
  } finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.innerText = "Continue with Google";
  }
}

window.handleDismissDenied = function() {
  const deniedBox = document.getElementById("login-denied-box");
  if (deniedBox) deniedBox.classList.add("hidden");
};

// --- Helpers & Global Binding ---
function getStatusBadge(status) {
  if (status === "ONLINE") {
    return `<span class="pixel-badge pixel-badge-online">● ONLINE</span>`;
  } else if (status === "PAIRING") {
    return `<span class="pixel-badge pixel-badge-pairing">⚡ PAIRING</span>`;
  } else if (status === "CONNECTING" || status === "RECONNECTING") {
    return `<span class="pixel-badge pixel-badge-pairing">⟳ ${status}</span>`;
  } else {
    return `<span class="pixel-badge pixel-badge-stopped">■ ${status || 'STOPPED'}</span>`;
  }
}

function setupEventListeners() {
  // Google Sign-In Button
  const googleBtn = document.getElementById("btn-google-login");
  if (googleBtn) {
    googleBtn.addEventListener("click", handleGoogleSignIn);
  }

  // Logout Buttons
  document.querySelectorAll(".btn-logout").forEach(btn => {
    btn.addEventListener("click", async () => {
      try {
        await API.logout();
      } catch (_e) {}
      await FirebaseService.signOut().catch(() => {});
      API.setToken(null);
      state.user = null;
      showLoginView();
      showToast("Signed out successfully", "info");
    });
  });

  // Mobile drawer toggle
  const toggleBtn = document.getElementById("mobile-menu-toggle");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      const drawer = document.getElementById("sidebar-drawer");
      drawer?.classList.toggle("open");
    });
  }
}

function bindGlobalWindowMethods() {
  window.switchTab = switchTab;
  window.refreshDashboard = refreshDashboard;
  window.refreshBots = refreshBots;
  window.refreshLogs = refreshLogs;
  window.refreshPlugins = refreshPlugins;
  window.refreshSystemMetrics = refreshSystemMetrics;
  window.refreshSettings = refreshSettings;
  window.handleBotAction = handleBotAction;
  window.handleStartWithInputNumber = handleStartWithInputNumber;
  window.copyPairingCode = copyPairingCode;
  window.handleGoogleSignIn = handleGoogleSignIn;
  window.openWipeModal = openWipeModal;
  window.closeWipeModal = closeWipeModal;
  window.executeWipeSession = executeWipeSession;
  window.openAddPluginModal = openAddPluginModal;
  window.openEditPluginModal = openEditPluginModal;
  window.handleSavePlugin = handleSavePlugin;
  window.handleDeletePlugin = handleDeletePlugin;
  window.insertPluginTemplate = insertPluginTemplate;
  window.handleCheckEditorSyntax = handleCheckEditorSyntax;
  window.closePluginModal = closePluginModal;
  window.filterPluginsWithSyntaxErrors = filterPluginsWithSyntaxErrors;
}

bindGlobalWindowMethods();

function closeMobileDrawer() {
  const drawer = document.getElementById("sidebar-drawer");
  if (drawer) drawer.classList.remove("open");
}
