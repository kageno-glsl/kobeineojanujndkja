import './system/setting.js'
import makeWASocket, {useMultiFileAuthState, DisconnectReason} from "@whiskeysockets/baileys";
import readline from "readline";
import fs from "node:fs";
import path from "node:path";
import {startAllBot, reloadOutdex} from "./outdex.js";
import {smsg} from "./system/lib/smsg.js";
import { startPanel } from "./panel/server/index.js";
import { config as panelConfig } from "./panel/server/config.js";
import { setMainBotController } from "./panel/server/services/mainBotBridge.js";
import { logService } from "./panel/server/services/logService.js";
import { realTimeService } from "./panel/server/services/realTimeService.js";
//=================
process.on("uncaughtException", (err) => {
console.error(err.message);
});
process.on("unhandledRejection", (err) => {
console.error(err.message);
});
//=================
global.plugins = {};
const question = (text) =>
new Promise((res) => {
const rl = readline.createInterface({
input: process.stdin,
output: process.stdout,
});
rl.question(text, (ans) => {
rl.close();
res(ans);
});
});
//=================
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
const handlerFunc = typeof pluginObj === "function" ? pluginObj : pluginObj?.handler;
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
console.error(`Error load plugin ${file}:`, e);
}
}));
}));
console.log(`[ PLUGIN ] Total ${Object.keys(global.plugins).length} commands loaded.`);
} catch (err) {
console.error("Error reading plugin directory:", err);
}
}
//=================
let mainHandler;
async function loadMainHandler() {
const mod = await import(`./system/handler.js?t=${Date.now()}`);
mainHandler = mod.default;
}
await loadMainHandler();
await reloadOutdex(); 
//=================
const sessionDir = path.join(import.meta.dirname, "session");
let mainSocket = null;
let mainStartPromise = null;
let mainSocketGeneration = 0;
let mainReconnectTimer = null;
let intentionalStop = false;
let mainStatus = "STOPPED";
let mainStartedAt = null;
let lastConnection = null;
let lastDisconnect = null;
let reconnectCount = 0;
let mainNumber = null;
let currentTargetNumber = null;
let currentPairingCode = null;
let currentPairingCodeCreatedAt = null;
let pairingError = null;

function cleanPhoneNumber(value) {
return String(value || "").replace(/\D/g, "");
}

function clearMainSessionFiles() {
if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });
for (const entry of fs.readdirSync(sessionDir, { withFileTypes: true })) {
if (entry.name === "bots") continue;
fs.rmSync(path.join(sessionDir, entry.name), { recursive: true, force: true });
}
}

function getMainBotStatus() {
const uptimeSeconds = mainStartedAt && mainStatus === "ONLINE"
? Math.floor((Date.now() - mainStartedAt) / 1000)
: 0;
const hours = Math.floor(uptimeSeconds / 3600);
const minutes = Math.floor((uptimeSeconds % 3600) / 60);
const seconds = uptimeSeconds % 60;
const uptimeFormatted = hours ? `${hours}h ${minutes}m ${seconds}s`
: minutes ? `${minutes}m ${seconds}s`
: `${seconds}s`;

return {
id: "main",
name: "Kobeni-MD Main Bot",
status: mainStatus,
number: mainNumber || currentTargetNumber || global.owner || null,
pid: process.pid,
uptimeSeconds,
uptimeFormatted,
lastConnection,
lastDisconnect,
reconnectCount,
pairingState: {
isWaiting: mainStatus === "PAIRING",
code: currentPairingCode,
targetNumber: currentTargetNumber,
createdAt: currentPairingCodeCreatedAt,
ageMs: currentPairingCodeCreatedAt ? Date.now() - currentPairingCodeCreatedAt : null,
error: pairingError,
},
sessionState: {
hasSession: fs.existsSync(path.join(sessionDir, "creds.json")),
registered: Boolean(mainSocket?.authState?.creds?.registered),
sessionDir: "session/",
},
memory: {
rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`,
heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`,
},
};
}

function broadcastMainStatus(phase) {
realTimeService.broadcastBotStatus("main", mainStatus, {
...getMainBotStatus(),
phase,
});
}

function clearReconnectTimer() {
if (mainReconnectTimer) clearTimeout(mainReconnectTimer);
mainReconnectTimer = null;
}

async function SartMBG(targetOverride = null) {
if (mainStartPromise) return mainStartPromise;
if (mainSocket) return mainSocket;

const requestedTarget = cleanPhoneNumber(targetOverride);
if (targetOverride && requestedTarget.length < 7) {
throw new Error("Invalid WhatsApp pairing phone number");
}
if (requestedTarget) currentTargetNumber = requestedTarget;
intentionalStop = false;
clearReconnectTimer();
mainStatus = "STARTING";
pairingError = null;
currentPairingCode = null;
currentPairingCodeCreatedAt = null;
const generation = ++mainSocketGeneration;
broadcastMainStatus("STARTING");

mainStartPromise = (async () => {
const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
if (intentionalStop || generation !== mainSocketGeneration) return null;
const connectionOptions = {
keepAliveIntervalMs: 30000,
printQRInTerminal: !global.usePairingCode,
auth: state,
browser: ["Mac OS", "Safari", "17.0"],
markOnlineOnConnect: false,
generateHighQualityLinkPreview: false,
getMessage: async (_key) => {
return { conversation: "kyahh" };
},
};
const conn = makeWASocket(connectionOptions);
mainSocket = conn;
mainStatus = "CONNECTING";
mainStartedAt = Date.now();
const mod = await import(`./system/lib/pathconn.js?t=${Date.now()}`);
mod.default(conn);
if (intentionalStop || generation !== mainSocketGeneration) return null;
//=================
if (global.usePairingCode && !conn.authState.creds.registered) {
let targetNumber; 
if (global.useOwnerToPair || requestedTarget) {
targetNumber = requestedTarget || global.owner;
console.log(`-[ Auto-Pairing using Owner Number: ${targetNumber} ]`);
await new Promise(resolve => setTimeout(resolve, 4000)); 
} else {
const phone = await question("-[ Enter Your Phone Number ] : ");
targetNumber = phone.trim();
}
currentTargetNumber = cleanPhoneNumber(targetNumber);
mainStatus = "PAIRING";
broadcastMainStatus("PAIRING");
try {
const code = await conn.requestPairingCode(
targetNumber,
global.pairingcode
);
if (generation !== mainSocketGeneration || intentionalStop) return null;
currentPairingCode = code || null;
currentPairingCodeCreatedAt = Date.now();
realTimeService.broadcastPairingCode("main", code, targetNumber);
broadcastMainStatus("WAITING_FOR_PAIRING");
console.log(`[ Your Pairing Code ] : ${code} `);
} catch (error) {
if (intentionalStop || generation !== mainSocketGeneration) return null;
pairingError = error?.message || "Pairing code request failed";
logService.add("ERROR", "BOT", `[MAIN] Pairing code request failed: ${pairingError}`);
}
}
//=================
conn.ev.on("connection.update", async ({ connection, lastDisconnect: disconnectInfo }) => {
if (generation !== mainSocketGeneration || conn !== mainSocket) return;
if (connection === "connecting") {
mainStatus = conn.authState?.creds?.registered ? "CONNECTING" : "PAIRING";
broadcastMainStatus("CONNECTING");
return;
}
if (connection === "open") {
mainStatus = "ONLINE";
mainStartedAt = Date.now();
lastConnection = new Date().toISOString();
reconnectCount = 0;
currentPairingCode = null;
currentPairingCodeCreatedAt = null;
pairingError = null;
mainNumber = conn.user?.id?.split(":")[0] || mainNumber;
broadcastMainStatus("ONLINE");
return console.log("-[ WhatsApp Connected! ]");
}
if (connection !== "close") return
let reason =
disconnectInfo?.error?.output?.statusCode ||
disconnectInfo?.error?.statusCode ||
disconnectInfo?.error?.cause?.statusCode
lastDisconnect = new Date().toISOString();
console.log(`Connection closed: ${reason}`)
if (intentionalStop) return;
mainSocket = null;
if (reason === DisconnectReason.loggedOut) {
clearMainSessionFiles();
mainStatus = "STOPPED";
currentPairingCode = null;
currentPairingCodeCreatedAt = null;
pairingError = "WhatsApp session logged out.";
broadcastMainStatus("LOGGED_OUT");
logService.add("WARN", "BOT", "WhatsApp session logged out. Panel remains available.");
} else {
mainStatus = "RECONNECTING";
reconnectCount++;
broadcastMainStatus("RECONNECTING");
clearReconnectTimer();
mainReconnectTimer = setTimeout(() => {
mainReconnectTimer = null;
SartMBG().catch(error => logService.add("ERROR", "BOT", `[MAIN] Reconnect failed: ${error?.message || error}`));
}, 3000);
}
})
//=================
conn.ev.on("messages.upsert", async ({ messages, type }) => {
if (generation !== mainSocketGeneration || conn !== mainSocket) return;
if (type !== "notify") return;
const msg = messages[0];
if (!msg?.message || msg.key?.remoteJid === "status@broadcast") return;
try {
const m = smsg(conn, msg);
await mainHandler(conn, m, msg); 
} catch (e) {
console.error(e);
}
});
//=================
conn.ev.on("creds.update", saveCreds);
return conn;
})();
const startPromise = mainStartPromise;

try {
return await startPromise;
} catch (error) {
if (intentionalStop || generation !== mainSocketGeneration) return null;
mainSocket = null;
mainStatus = "CRASHED";
pairingError = error?.message || "Failed to start WhatsApp connection";
broadcastMainStatus("START_FAILED");
throw error;
} finally {
if (mainStartPromise === startPromise) mainStartPromise = null;
}
}

async function stopMainBot() {
intentionalStop = true;
clearReconnectTimer();
mainSocketGeneration++;
mainStartPromise = null;
const socket = mainSocket;
mainSocket = null;
if (socket) {
try { socket.ev?.removeAllListeners(); } catch {}
try { socket.ws?.close(); } catch {}
try { socket.end?.(new Error("Stopped from control panel")); } catch {}
}
mainStatus = "STOPPED";
mainStartedAt = null;
currentPairingCode = null;
currentPairingCodeCreatedAt = null;
pairingError = null;
broadcastMainStatus("STOPPED");
return { success: true, message: "Main Bot stopped", bot: getMainBotStatus() };
}

async function restartMainBot(targetNumber = null) {
await stopMainBot();
await new Promise(resolve => setTimeout(resolve, 500));
return SartMBG(targetNumber || currentTargetNumber);
}

async function resetMainSession() {
await stopMainBot();
clearMainSessionFiles();
mainNumber = null;
currentTargetNumber = null;
pairingError = null;
logService.add("WARN", "BOT", "Main Bot session reset from the control panel.");
return { success: true, message: "Main Bot session reset. Ready for pairing." };
}

setMainBotController({
start: async targetNumber => {
const conn = await SartMBG(targetNumber);
return { message: "Main Bot started", bot: getMainBotStatus(), conn };
},
stop: stopMainBot,
restart: restartMainBot,
resetSession: resetMainSession,
getStatus: getMainBotStatus,
setTargetNumber: number => {
const cleanNumber = cleanPhoneNumber(number);
if (cleanNumber.length < 7) throw new Error("Invalid WhatsApp pairing phone number");
currentTargetNumber = cleanNumber;
},
});
//=================
process.stdout.write("\x1Bc");
console.log(`
╭╮╭━┳━━━━┳━━╮╭━━━┳━╮╱╭╮╭━━╮
┃┃┃╭┫╭╮╭╮┃╭╮┃┃╭━━┫┃╰╮┃┃╭┫┣╮
┃╰╯╯┃╭━━╮┃╰╯╰┫╰━━┫╭╮╰╯┃┃┃┃┃
┃╭╮┃┃┃┃┃┃┃╭━╮┃╭━━┫┃╰╮┃┃╱┃┃╱
┃┃┃╰┫╰━━╯┃╰━╯┃╰━━┫┃╱┃┃┃╰┫┣╯
╰╯╰━┻━━━━┻━━━┻━━━┻╯╱╰━╯╰━━╯`);
//=================
await loadPlugins();
const pluginDir = path.join(import.meta.dirname, "system", "plugins");
let debounceTimeout;
fs.watch(pluginDir, { recursive: true }, (_eventType, filename) => {
if (!filename) return;
if (filename.endsWith(".js")) {
clearTimeout(debounceTimeout);
debounceTimeout = setTimeout(async () => {
await loadPlugins(); 
}, 500);
}
});
const waFile = path.join(import.meta.dirname, "system", "handler.js");
fs.watchFile(waFile, async () => {
console.log("[ WATCHER ] handler.js reloaded.");
await loadMainHandler(); 
await reloadOutdex();
});
//=================
SartMBG();
startAllBot();
startPanel(process.env.PANEL_PORT || panelConfig.port);
