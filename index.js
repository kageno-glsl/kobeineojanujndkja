import './system/setting.js';
import baileys from "@whiskeysockets/baileys";
import makeWASocket, {useMultiFileAuthState, DisconnectReason} from "@whiskeysockets/baileys";
const silentLogger = (baileys.DEFAULT_CONNECTION_CONFIG?.logger?.child?.({}) || {
level: "silent",
info: () => {},
error: () => {},
warn: () => {},
debug: () => {},
trace: () => {},
child: () => silentLogger,
});
silentLogger.level = "silent";

import readline from "readline";
import fs from "node:fs";
import path from "node:path";
import { startAllBot, reloadOutdex } from "./outdex.js";
import { smsg } from "./system/lib/smsg.js";
import { startPanel } from "./panel/server/index.js";
import { config as panelConfig } from "./panel/server/config.js";
import { setMainBotController } from "./panel/server/services/mainBotBridge.js";
import { logService } from "./panel/server/services/logService.js";
import { realTimeService } from "./panel/server/services/realTimeService.js";

//============================================================
// Process-level error handling
//============================================================
process.on("uncaughtException", (err) => {
console.error(err?.stack || err?.message || err);
});

process.on("unhandledRejection", (err) => {
console.error(err?.stack || err?.message || err);
});

//============================================================
// Existing Kobeni globals / plugin system
//============================================================
global.plugins = {};

const question = (text) =>
new Promise((resolve) => {
const rl = readline.createInterface({
input: process.stdin,
output: process.stdout,
});
rl.question(text, (answer) => {
rl.close();
resolve(answer);
});
});

async function loadPlugins() {
const pluginDir = path.join(import.meta.dirname, "system", "plugins");
global.plugins = {};

try {
const folders = (await fs.promises.readdir(pluginDir, { withFileTypes: true }))
.filter((dirent) => dirent.isDirectory())
.map((dirent) => dirent.name);

await Promise.all(folders.map(async (folder) => {
const folderPath = path.join(pluginDir, folder);
const files = (await fs.promises.readdir(folderPath, { withFileTypes: true }))
.filter((dirent) => dirent.isFile() && dirent.name.endsWith(".js"))
.map((dirent) => dirent.name);

await Promise.all(files.map(async (file) => {
const filePath = path.join(folderPath, file);

try {
const plugin = await import(`file://${filePath}?t=${Date.now()}`);
const pluginObj = plugin.default || plugin;
const handlerFunc = typeof pluginObj === "function"
? pluginObj
: pluginObj?.handler;
const commands = pluginObj?.command;

if (typeof handlerFunc === "function" && Array.isArray(commands)) {
const categoryName = folder.toLowerCase();

for (const cmd of commands) {
global.plugins[cmd.toLowerCase()] = {
name: file,
category: categoryName,
handler: handlerFunc,
};
}
}
} catch (e) {
console.error(`Error load plugin ${file}:`, e?.stack || e?.message || e);
}
}));
}));

console.log(`[ PLUGIN ] Total ${Object.keys(global.plugins).length} commands loaded.`);
} catch (err) {
console.error("Error reading plugin directory:", err?.stack || err?.message || err);
}
}

let mainHandler;

async function loadMainHandler() {
const mod = await import(`./system/handler.js?t=${Date.now()}`);
mainHandler = mod.default;
}

await loadMainHandler();
await reloadOutdex();

//============================================================
// Main Bot Runtime
//============================================================
let mainSocket = null;
let mainSocketGeneration = 0;
let mainStartPromise = null;
let mainReconnectTimer = null;
let mainReconnectDelay = 5000;
let intentionalStop = true;
let currentTargetNumber = null;
let currentPairingCode = null;
let currentPairingCodeCreatedAt = null;
let pairingRequestedForGeneration = false;
let pairingError = null;
let mainStatus = "STOPPED";
let mainStartedAt = null;
let lastConnection = null;
let lastDisconnect = null;
let reconnectCount = 0;
let mainNumber = null;
let wasOnlineInGeneration = false;

function normalizePhoneNumber(value) {
return String(value || "")
.replace(/\D/g, "")
.trim();
}

function formatUptime(seconds) {
if (!seconds || seconds <= 0) return "0s";
const d = Math.floor(seconds / 86400);
const h = Math.floor((seconds % 86400) / 3600);
const m = Math.floor((seconds % 3600) / 60);
const s = seconds % 60;
if (d > 0) return `${d}d ${h}h ${m}m`;
if (h > 0) return `${h}h ${m}m ${s}s`;
if (m > 0) return `${m}m ${s}s`;
return `${s}s`;
}

function getMainNumberFromSession() {
try {
const credsPath = path.join(import.meta.dirname, "session", "creds.json");
const creds = JSON.parse(fs.readFileSync(credsPath, "utf8"));
return creds?.me?.id?.split(":")[0] || null;
} catch {
return null;
}
}

function broadcastStatus(extra = {}) {
realTimeService.broadcastBotStatus("main", mainStatus, {
number: mainNumber || currentTargetNumber || global.owner || null,
pairingCode: currentPairingCode,
pairingTarget: currentTargetNumber,
pairingError,
...extra,
});
}

function getMainBotStatus() {
const sessionExists = fs.existsSync(
path.join(import.meta.dirname, "session", "creds.json")
);

const uptimeSeconds = mainStartedAt
? Math.floor((Date.now() - mainStartedAt) / 1000)
: 0;

return {
id: "main",
name: "Kobeni-MD Main Bot",
status: mainStatus,
number: mainNumber || getMainNumberFromSession() || currentTargetNumber || global.owner || null,
pid: process.pid,
socketGeneration: mainSocketGeneration,
uptimeSeconds,
uptimeFormatted: formatUptime(uptimeSeconds),
lastConnection,
lastDisconnect,
reconnectCount,
pairingState: {
isWaiting: mainStatus === "PAIRING",
code: currentPairingCode,
targetNumber: currentTargetNumber,
createdAt: currentPairingCodeCreatedAt,
ageMs: currentPairingCodeCreatedAt
? Date.now() - currentPairingCodeCreatedAt
: null,
error: pairingError,
},
sessionState: {
hasSession: sessionExists,
registered: Boolean(mainSocket?.authState?.creds?.registered),
sessionDir: "session/",
},
memory: {
rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`,
heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`,
},
};
}

function clearReconnectTimer() {
if (mainReconnectTimer) {
clearTimeout(mainReconnectTimer);
mainReconnectTimer = null;
}
}

async function closeMainSocket(socket, reason = "Panel stop") {
if (!socket) return;

try {
socket.ev?.removeAllListeners();
} catch {}

try {
socket.ws?.close();
} catch {}

try {
socket.end?.(new Error(reason));
} catch {}
}

function scheduleReconnect(generation) {
clearReconnectTimer();

if (intentionalStop || generation !== mainSocketGeneration) return;

const delay = mainReconnectDelay;
mainReconnectDelay = Math.min(30000, Math.floor(mainReconnectDelay * 1.5));

mainReconnectTimer = setTimeout(async () => {
mainReconnectTimer = null;

if (intentionalStop || generation !== mainSocketGeneration) return;
if (mainSocket) return;

try {
await SartMBG(currentTargetNumber);
} catch (error) {
logService.add("ERROR", "BOT", `[MAIN] Reconnect failed: ${error?.message || error}`);
}
}, delay);

logService.add("INFO", "BOT", `[MAIN] Reconnecting in ${delay}ms...`);
}

async function requestMainPairingCode(conn, targetNumber, generation) {
if (generation !== mainSocketGeneration) return;
if (pairingRequestedForGeneration) return;
if (conn !== mainSocket) return;
if (conn.authState?.creds?.registered) return;

pairingRequestedForGeneration = true;
pairingError = null;
mainStatus = "PAIRING";
currentTargetNumber = targetNumber;
broadcastStatus({ phase: "REQUESTING_PAIRING_CODE" });

logService.add(
"INFO",
"BOT",
`[MAIN] Requesting pairing code for WhatsApp number: +${targetNumber}...`
);
console.log(`[MAIN] Requesting pairing code for WhatsApp number: +${targetNumber}...`);

try {
const customCode = typeof global.pairingcode === "string" && global.pairingcode.length === 8
? global.pairingcode
: undefined;

const code = await conn.requestPairingCode(targetNumber, customCode);

if (generation !== mainSocketGeneration || conn !== mainSocket) return;

currentPairingCode = code || null;
currentPairingCodeCreatedAt = Date.now();
pairingError = null;
mainStatus = "PAIRING";

realTimeService.broadcastPairingCode("main", code, targetNumber);
broadcastStatus({ phase: "WAITING_FOR_PAIRING" });
console.log(`[MAIN] Pairing code: ${code}`);

logService.add("INFO", "BOT", `╔═══════════════════════════════════════════════════════════╗`);
logService.add("INFO", "BOT", `║🌸 WHATSAPP PAIRING CODE: ${String(code).padEnd(30)} ║`);
logService.add("INFO", "BOT", `║Phone Number: +${String(targetNumber).padEnd(41)} ║`);
logService.add("INFO", "BOT", `║👉 Enter code on WhatsApp: Linked Devices > Link Device║`);
logService.add("INFO", "BOT", `╚═══════════════════════════════════════════════════════════╝`);
} catch (error) {
pairingError = error?.message || "Pairing code request failed";
mainStatus = "PAIRING";
broadcastStatus({ phase: "PAIRING_ERROR" });
console.error(`[MAIN] Pairing code request failed: ${pairingError}`);
logService.add("WARN", "BOT", `[MAIN] Pairing code request failed: ${pairingError}`);
}
}

async function SartMBG(targetOverride = null) {
if (mainStartPromise) return mainStartPromise;

if (mainSocket && ["STARTING", "CONNECTING", "PAIRING", "ONLINE", "RECONNECTING"].includes(mainStatus)) {
return mainSocket;
}

mainStartPromise = (async () => {
intentionalStop = false;
clearReconnectTimer();

currentTargetNumber = normalizePhoneNumber(targetOverride || currentTargetNumber || global.owner);
if (!currentTargetNumber || currentTargetNumber.length < 7) {
throw new Error("Invalid WhatsApp pairing phone number");
}

currentPairingCode = null;
currentPairingCodeCreatedAt = null;
pairingRequestedForGeneration = false;
pairingError = null;
wasOnlineInGeneration = false;

mainStatus = "STARTING";
reconnectCount = 0;
broadcastStatus({ phase: "STARTING" });

const { state, saveCreds } = await useMultiFileAuthState(
path.join(import.meta.dirname, "session")
);

// Snapshot whether this socket started from an already-authenticated session.
// This is important: a fresh pairing socket must never wipe its session on an
// early 401 before the user has completed linking.
const hadRegisteredSessionAtStart = Boolean(state.creds.registered);

const connectionOptions = {
logger: silentLogger,
keepAliveIntervalMs: 30000,
printQRInTerminal: !global.usePairingCode,
auth: state,
// Match the browser identity used by the known-working Kobeni-MD build.
browser: ["Mac OS", "Safari", "17.0"],
markOnlineOnConnect: false,
generateHighQualityLinkPreview: false,
syncFullHistory: false,
getMessage: async (_key) => ({ conversation: "kyahh" }),
};

const conn = makeWASocket(connectionOptions);
const generation = ++mainSocketGeneration;
mainSocket = conn;
mainStatus = hadRegisteredSessionAtStart ? "CONNECTING" : "CONNECTING";
mainStartedAt = mainStartedAt || Date.now();
broadcastStatus({ phase: "SOCKET_CREATED" });

try {
const mod = await import(`./system/lib/pathconn.js?t=${Date.now()}`);
mod.default(conn);
} catch (error) {
logService.add("WARN", "SYSTEM", `[MAIN] pathconn warning: ${error?.message || error}`);
}

// Match the original Kobeni-MD index: wait for the socket handshake, then
// request pairing before registering connection listeners.
if (global.usePairingCode && !conn.authState?.creds?.registered) {
await new Promise(resolve => setTimeout(resolve, 4000));
await requestMainPairingCode(conn, currentTargetNumber, generation);
}

conn.ev.on("connection.update", async (update) => {
const { connection, lastDisconnect: lastDisconnectEvent, qr, isNewLogin } = update || {};

if (generation !== mainSocketGeneration || conn !== mainSocket) return;

if (connection === "connecting") {
if (conn.authState?.creds?.registered) {
mainStatus = "CONNECTING";
} else {
mainStatus = "PAIRING";
}
broadcastStatus({ phase: "CONNECTING" });

return;
}

// Some Baileys builds expose a QR/update event without another `connecting`
// event. It is also a safe point to request a pairing code exactly once.
if (qr && global.usePairingCode && !conn.authState?.creds?.registered) {
mainStatus = "PAIRING";
broadcastStatus({ phase: "PAIRING_READY" });
return;
}

if (isNewLogin) {
logService.add("INFO", "BOT", "[MAIN] WhatsApp pairing accepted; authentication state updated.");
pairingError = null;
}

if (connection === "open") {
wasOnlineInGeneration = true;
mainStatus = "ONLINE";
mainStartedAt = Date.now();
lastConnection = new Date().toISOString();
reconnectCount = 0;
mainReconnectDelay = 5000;
currentPairingCode = null;
currentPairingCodeCreatedAt = null;
pairingError = null;

if (conn.user?.id) {
mainNumber = conn.user.id.split(":")[0];
}

broadcastStatus({
phase: "ONLINE",
number: mainNumber,
});

logService.add(
"INFO",
"BOT",
`[MAIN] WhatsApp Connected successfully! (${mainNumber || "OK"})`
);
return;
}

if (connection !== "close") return;

lastDisconnect = new Date().toISOString();

const disconnectReason =
lastDisconnectEvent?.error?.output?.statusCode ||
lastDisconnectEvent?.error?.statusCode ||
lastDisconnectEvent?.error?.cause?.statusCode;

logService.add(
"WARN",
"BOT",
`[MAIN] WhatsApp connection closed (reason: ${disconnectReason || "unknown"})`
);

if (generation !== mainSocketGeneration || intentionalStop) return;

mainSocket = null;

const isRegisteredNow = Boolean(state.creds.registered);
const codeWasIssued = Boolean(currentPairingCode);

// ------------------------------------------------------------
// FRESH PAIRING SESSION
// ------------------------------------------------------------
// If this socket started UNREGISTERED, do not automatically restart
// or wipe the session on 401. A restart loop invalidates/replaces the
// active pairing attempt and is exactly what caused the previous bug.
if (!hadRegisteredSessionAtStart) {
if (
disconnectReason === DisconnectReason.restartRequired ||
disconnectReason === 515
) {
if (isRegisteredNow) {
// Pairing completed and WhatsApp asks us to restart the connection.
mainStatus = "RECONNECTING";
reconnectCount++;
broadcastStatus({ phase: "PAIRING_RESTART_REQUIRED" });
scheduleReconnect(generation);
return;
}
}

mainStatus = "PAIRING";
pairingError = codeWasIssued
? `Connection closed (${disconnectReason || "unknown"}) while waiting for pairing. No automatic retry was started.`
: `Connection closed (${disconnectReason || "unknown"}) before pairing completed. No automatic retry was started.`;

broadcastStatus({ phase: "PAIRING_FAILED" });
logService.add(
"WARN",
"BOT",
`[MAIN] Pairing standby. Automatic restart disabled to preserve the current pairing attempt. Use Restart to retry.`
);
return;
}

// ------------------------------------------------------------
// ALREADY AUTHENTICATED SESSION
// ------------------------------------------------------------
if (disconnectReason === DisconnectReason.loggedOut) {
mainStatus = "STOPPED";
currentPairingCode = null;
currentPairingCodeCreatedAt = null;
pairingError = "WhatsApp session logged out.";
broadcastStatus({ phase: "LOGGED_OUT" });

const sessionDir = path.join(import.meta.dirname, "session");
if (fs.existsSync(sessionDir)) {
try {
fs.rmSync(sessionDir, { recursive: true, force: true });
} catch (error) {
logService.add("ERROR", "BOT", `[MAIN] Failed to remove logged-out session: ${error?.message || error}`);
}
}

logService.add("ERROR", "BOT", "[MAIN] Authenticated WhatsApp session was logged out.");
return;
}

// Normal reconnect for already-authenticated sessions.
mainStatus = "RECONNECTING";
reconnectCount++;
broadcastStatus({
phase: "RECONNECTING",
count: reconnectCount,
});
scheduleReconnect(generation);
});

conn.ev.on("messages.upsert", async ({ messages, type }) => {
if (generation !== mainSocketGeneration || conn !== mainSocket) return;
if (type !== "notify") return;

for (const msg of messages || []) {
if (!msg?.message || msg.key?.remoteJid === "status@broadcast") continue;

try {
const m = smsg(conn, msg);
await mainHandler(conn, m, msg);
} catch (error) {
logService.add("ERROR", "BOT", `[MAIN] Handler error: ${error?.message || error}`);
}
}
});

conn.ev.on("creds.update", saveCreds);

mainStartPromise = null;
return conn;
})();

try {
return await mainStartPromise;
} finally {
mainStartPromise = null;
}
}

async function stopMainBot() {
intentionalStop = true;
clearReconnectTimer();
pairingRequestedForGeneration = false;
pairingError = null;

const socket = mainSocket;
mainSocket = null;
mainSocketGeneration++;

if (socket) {
logService.add("WARN", "BOT", "[MAIN] Stopping Main Bot..." );
await closeMainSocket(socket, "Stopped via Panel");
}

mainStatus = "STOPPED";
mainStartedAt = null;
currentPairingCode = null;
currentPairingCodeCreatedAt = null;
broadcastStatus({ phase: "STOPPED" });
logService.add("INFO", "BOT", "[MAIN] Main Bot stopped safely.");

return {
success: true,
message: "Main Bot stopped",
bot: getMainBotStatus(),
};
}

async function restartMainBot(targetNumber = null) {
logService.add("INFO", "BOT", "[MAIN] Restarting Main Bot..." );
await stopMainBot();
await new Promise(resolve => setTimeout(resolve, 500));
return SartMBG(targetNumber || currentTargetNumber || global.owner);
}

async function resetMainSession() {
await stopMainBot();

const sessionDir = path.join(import.meta.dirname, "session");
if (fs.existsSync(sessionDir)) {
fs.rmSync(sessionDir, { recursive: true, force: true });
}
fs.mkdirSync(sessionDir, { recursive: true });

mainNumber = null;
currentPairingCode = null;
currentPairingCodeCreatedAt = null;
pairingError = null;
currentTargetNumber = null;

logService.add("INFO", "BOT", "[MAIN] Main Bot session reset. Bot remains stopped until Start is pressed.");

return {
success: true,
message: "Main Bot session reset successfully",
bot: getMainBotStatus(),
};
}

function setMainBotTargetNumber(number) {
const clean = normalizePhoneNumber(number);
if (clean.length < 7) throw new Error("Invalid WhatsApp pairing phone number");
currentTargetNumber = clean;

// Changing the target invalidates only the UI pairing data; it does not
// restart or create a socket by itself. The next explicit START/RESTART
// consumes this target.
currentPairingCode = null;
currentPairingCodeCreatedAt = null;
pairingError = null;
}

// Register the actual runtime with the panel controller. The panel becomes a
// controller/view layer and never creates another Baileys socket.
setMainBotController({
start: SartMBG,
stop: stopMainBot,
restart: restartMainBot,
resetSession: resetMainSession,
getStatus: getMainBotStatus,
setTargetNumber: setMainBotTargetNumber,
});

//============================================================
// Existing startup / watchers
//============================================================
process.stdout.write("\x1Bc");
console.log(`
╭╮╭━┳━━━━┳━━╮╭━━━┳━╮╱╭╮╭━━╮
┃┃┃╭┫╭╮╭╮┃╭╮┃┃╭━━┫┃╰╮┃┃╭┫┣╮
┃╰╯╯┃╭━━╮┃╰╯╰┫╰━━┫╭╮╰╯┃┃┃┃┃
┃╭╮┃┃┃┃┃┃┃╭━╮┃╭━━┫┃╰╮┃┃╱┃┃╱
┃┃┃╰┫╰━━╯┃╰━╯┃╰━━┫┃╱┃┃┃╰┫┣╯
╰╯╰━┻━━━━┻━━━┻━━━┻╯╱╰━╯╰━━╯`);

await loadPlugins();

const pluginDir = path.join(import.meta.dirname, "system", "plugins");
let debounceTimeout;

fs.watch(pluginDir, { recursive: true }, (_eventType, filename) => {
if (!filename || !filename.endsWith(".js")) return;

clearTimeout(debounceTimeout);
debounceTimeout = setTimeout(async () => {
await loadPlugins();
}, 500);
});

const waFile = path.join(import.meta.dirname, "system", "handler.js");
fs.watchFile(waFile, async () => {
console.log("[ WATCHER ] handler.js reloaded.");
await loadMainHandler();
await reloadOutdex();
});

// Auto-start only authenticated sessions. Fresh installs stay stopped until
// the administrator starts pairing manually from the panel.
const mainSessionFile = path.join(import.meta.dirname, "session", "creds.json");
if (fs.existsSync(mainSessionFile)) {
SartMBG(global.owner).catch((error) => {
logService.add("ERROR", "BOT", `[MAIN] Session auto-start failed: ${error?.message || error}`);
});
} else {
console.log("[ READY ] No Main Bot session found. Start pairing manually from the control panel.");
}

// Start clone/outdex subsystem once. outdex only starts clones with sessions.
try {
await startAllBot();
} catch (error) {
logService.add("WARN", "CLONE", `[OUTDEX] startAllBot notice: ${error?.message || error}`);
}

// Start web panel. The panel itself does NOT start another Main Bot socket.
startPanel(process.env.PANEL_PORT || panelConfig.port);
console.log(
"[ PANEL ] Web Control Panel is online on port " +
(process.env.PANEL_PORT || panelConfig.port)
);
console.log("[ READY ] Panel is ready. Main Bot is stopped until START is pressed in the control panel.");
