import './system/setting.js';
import makeWASocket, {useMultiFileAuthState, DisconnectReason} from "@whiskeysockets/baileys";
import fs from 'node:fs';
import path from 'node:path';
import {smsg} from './system/lib/smsg.js';
//=================
const BOT_DIR = path.join(import.meta.dirname, 'session', 'bots');
if (!fs.existsSync(BOT_DIR)) {
fs.mkdirSync(BOT_DIR, { recursive: true });
}
const bots = new Map();
//=================
let mainHandler;
let pathConnHandler;
async function reloadOutdex() {
const modWA = await import(`file://${path.join(import.meta.dirname, 'system', 'handler.js')}?t=${Date.now()}`);
mainHandler = modWA.default;
const modPath = await import(`file://${path.join(import.meta.dirname, 'system', 'lib', 'pathconn.js')}?t=${Date.now()}`);
pathConnHandler = modPath.default;
}
//=================
async function addBot(number, forceStart = false) {
const id = number.replace(/[^0-9]/g, "");
const mainNum = getMainNumber();
if (id === mainNum) {
return { error: true, message: "bruhh moment." };
}
if (bots.has(id) && !forceStart) return { id, isNew: false };
bots.set(id, "loading");
const sessionPath = path.join(BOT_DIR, id);
if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });
const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
const isNew = !fs.existsSync(path.join(sessionPath, 'creds.json'));
const connectionOptions = {
keepAliveIntervalMs: 30000,
printQRInTerminal: !global.usePairingCode,
auth: state,
browser: ["Mac OS", "Safari", "17.0"],   
markOnlineOnConnect: false, 
generateHighQualityLinkPreview: false, 
getMessage: async () => ({ conversation: 'kyahh' })
};
const conn = makeWASocket(connectionOptions);
conn.isClone = true;
if (pathConnHandler) pathConnHandler(conn);
//=================
let pairingCode = "";
if (isNew && !conn.authState.creds.registered) {
await new Promise(resolve => setTimeout(resolve, 3000)); 
try {
pairingCode = await conn.requestPairingCode(number.trim(), global.pairingcode || "");
} catch (e) {}
}
//=================
conn.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
if (connection === 'open') {
console.log(`-[ ${id} Connected! ]`);
return bots.set(id, conn); 
}
if (connection !== 'close') return;
bots.delete(id); 
if (lastDisconnect?.error === 'Error: Stream Errored (unknown)') return addBot(number, true); 
let reason =
lastDisconnect?.error?.output?.statusCode ||
lastDisconnect?.error?.statusCode ||
lastDisconnect?.error?.cause?.statusCode
const R = DisconnectReason;
if ([R.badSession, R.loggedOut, R.connectionReplaced].includes(reason)) return delBot(id, true);
if (isNew && !conn.authState?.creds?.registered) return delBot(id, true);
return addBot(number, true); 
});
//=================
conn.ev.on("messages.upsert", async ({ messages, type }) => {
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
conn.ev.on('creds.update', saveCreds);
return { conn, code: pairingCode, id, isNew };
}
//=================
function delBot(id, isAuto = false) {
const sessionPath = path.join(import.meta.dirname, 'session', 'bots', id);
const databaseDir = path.join(import.meta.dirname, 'system', 'database');
if (!fs.existsSync(sessionPath) && !bots.has(id)) return false; 
if (bots.has(id)) {
const botConn = bots.get(id);   
bots.delete(id); 
if (botConn && botConn !== "loading" && botConn.ev) {
botConn.ev.removeAllListeners();
if (!isAuto) {
try { 
if (botConn.authState?.creds?.registered) Promise.resolve(botConn.logout()).catch(() => botConn.end(undefined));
else botConn.end(undefined);
} catch {
botConn.end(undefined);
}
} else {
botConn.end(undefined);
}
}
}
setTimeout(() => {
if (fs.existsSync(sessionPath)) {
try { fs.rmSync(sessionPath, { recursive: true, force: true }); } catch (e) { console.error(`[ Cleaner ] Error: ${e.message}`); }
}   
const trashFiles = [
`access_${id}.json`,
`public_${id}.json`,
`kobeni_${id}.json`
];
trashFiles.forEach(file => {
const filePath = path.join(databaseDir, file);
if (id !== "main" && fs.existsSync(filePath)) {
try { 
fs.unlinkSync(filePath); 
} catch (e) {}
}
});
}, 2000);
return true;
}
//=================
function listBot() {
return [...bots.keys()];
}
//=================
function getMainNumber() {
try {
const creds = fs.readJsonSync(path.join(import.meta.dirname, 'session', 'creds.json'));
return creds.me.id.split(':')[0];
} catch {
return null;
}
}
//=================
async function startAllBot() {
if (!fs.existsSync(BOT_DIR)) return;
const folders = fs.readdirSync(BOT_DIR, { withFileTypes: true })
.filter((dirent) => dirent.isDirectory())
.map((dirent) => dirent.name);
await Promise.all(folders.map(async (id) => {
const sessionPath = path.join(BOT_DIR, id);
if (fs.existsSync(path.join(sessionPath, 'creds.json'))) {
try { 
await addBot(id, true); 
} catch (e) { 
console.log(`[ ${id} ] Error AutoStart:`, e); 
}
}
}));
}
//=================
export { addBot, delBot, listBot, startAllBot, reloadOutdex };
