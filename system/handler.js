//=================
import fs from "fs-extra";
import util from "util";
import { exec } from "child_process";
import { createRequire } from "module";
import { generateWAMessageFromContent } from "@whiskeysockets/baileys";
import { addAccessUser, delAccessUser, setPublic, isPublic, get } from "./lib/access.js";
import { getGroupAdmins } from "./lib/smsg.js";
import { addBot, delBot, listBot } from "../outdex.js";
//=================
export default async (conn, m) => {
try {
const body = m.body || "";
const prefix = global.prefix.find(
(p) => body.startsWith(p)
) || "";
if (!prefix) return;
//=================
const botNumberJid = conn.decodeJid(conn.user.id);
const botNumber = botNumberJid.replace(/[^0-9]/g, "");
const globalOwnerJid = `${global.owner}@s.whatsapp.net`;
const isMainBot = !conn.isClone;
const dbId = isMainBot ? "main" : botNumber;
const mainData = get("main");
const mainAccess = mainData.access || [];
const isMainAccess =
m.sender === globalOwnerJid ||
(m.sender === botNumberJid && isMainBot) ||
mainAccess.some(
(u) => `${u.id.replace(/\D/g, "")}@s.whatsapp.net` === m.sender,
);
//=================
let args = prefix
? body.slice(prefix.length).trim().split(/ +/).slice(1)
: body.trim().split(/ +/).slice(1);
let command = prefix
? body.slice(prefix.length).trim().split(/ +/)[0].toLowerCase()
: body.trim().split(/ +/)[0].toLowerCase();
let text = args.join(" ");
//=================
const currentData = get(dbId);
const premuser = currentData.access || [];
const isAccess =
m.sender === botNumberJid ||
m.sender === globalOwnerJid ||
mainAccess.some((u) => `${u.id.replace(/\D/g, "")}@s.whatsapp.net` === m.sender) ||
premuser.some((u) => `${u.id.replace(/\D/g, "")}@s.whatsapp.net` === m.sender);
//=================
const groupMetadata = m.chat.endsWith("@g.us")
? await conn.groupMetadata(m.chat).catch((_e) => ({}))
: {};
const participants = groupMetadata?.participants ?? [];
const groupAdmins =
participants.length > 0 ? getGroupAdmins(participants) : [];
const isBotAdmins = groupAdmins.includes(botNumberJid);
const isAdmins = groupAdmins.includes(m.sender);
const groupOwner = groupMetadata.owner || groupAdmins[0] || "";
//=================
const isBotPublic = isPublic(dbId);
if (!isBotPublic && !isAccess) return;
const logId = isMainBot ? "MAIN" : botNumber;
console.log(
`\x1b[95m[ MSG - ${logId} ]\x1b[0m ` +
`\x1b[35m${m.body || m.mtype}\x1b[0m ` +
`Dari \x1b[95m${m.pushName}\x1b[0m`,
);
//=================
const pluginData = global.plugins[command];
if (pluginData) {
await pluginData.handler(m, {
conn,
m,
isBotAdmins,
isAdmins,
command,
args,
text,
isAccess,
prefix,
});
return;
}
//=================
switch (command) {
//=================
case "menu":
case "smenu":
case "allmenu": {
const categories = {
owner: ["public", "self", "addaccess", "delaccess", "listaccess", "addbot", "delbot", "listbot"]
};
for (const cmd in global.plugins) {
const cat = (global.plugins[cmd].category || "plugins").toLowerCase();
if (!categories[cat]) categories[cat] = [];
if (!categories.owner.includes(cmd)) {
categories[cat].push(cmd);
}
}
let totalCmds = 0;
for (const cat in categories) totalCmds += categories[cat].length;
const uptime = `${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m`;
const statusBot = isPublic(dbId) ? "Public" : "Self"; 
let captionText = "";
if (command === "menu") {
let keys = Object.keys(categories).filter(k => k !== "owner");
keys.push("owner");
let catList = keys.map(k => `> │ ${prefix}smenu ${k}`).join("\n");
captionText = `Moshi-moshi, ${m.pushName}-san!
A-anu... selamat datang di Kobeni MD.
╭╼ *⌗ Bot Info* ╾
> │ Uptime: ${uptime}
> │ Mode: ${statusBot}
> │ Total: ${totalCmds} Cmds
╰╼ 
╭╼ *⌗ User Info* ╾
> │ Sender: ${m.sender.replace(/\D/g, "")}
> │ Access: ${isAccess ? "True" : "False"}
╰╼
╭╼ *⌗ Categories* ╾
${catList}
╰╼
_Type ${prefix}allmenu for full list menu.._`;
} else if (command === "smenu") {
const category = (args[0] || "owner").toLowerCase();
const commandsList = categories[category];
if (!commandsList) return m.reply(mess.wrong);
captionText = `╭╼ *⌗ Category:* ${category.charAt(0).toUpperCase() + category.slice(1)} ╾
> │ Total: ${commandsList.length} Cmds
╰╼
╭╼ *⌗ Commands* ╾
${commandsList.map(cmd => `> │ ${prefix}${cmd}`).join("\n")}
╰╼
_Type ${prefix}menu to back.._`;
} else if (command === "allmenu") {
let allCatText = "";
let keys = Object.keys(categories).filter(k => k !== "owner");
keys.push("owner");
for (const cat of keys) {
allCatText += `╭╼ *⌗ ${cat.charAt(0).toUpperCase() + cat.slice(1)}* ╾\n${categories[cat].map(cmd => `> │ ${prefix}${cmd}`).join("\n")}\n╰╼\n\n`;
}
captionText = `╭╼ *⌗ All Menu* ╾
> │ Total: ${totalCmds} Cmds
╰╼
${allCatText.trim()}
_Type ${prefix}menu to back.._`;
}
await conn.sendExternalThumb(
m.chat,
{
text: captionText,
body: "ɢɪᴛʜᴜʙ.ᴄᴏᴍ/ᴋᴀɢᴇɴᴏᴜʀᴇᴀʟ",
thumbUrl: "./system/media/mainthumb.jpg",
iconUrl: "./system/media/iconthumb.png",
sourceUrl: "https://github.com/kagenouReal/Kobeni-MD",
},
{ quoted: {
key: { fromMe: false, participant: "0@s.whatsapp.net", remoteJid: "0@s.whatsapp.net"},
message: { orderMessage: { orderId: "65bh4ddqr90", thumbnail: fs.readFileSync("./system/media/kobeni.jpg"), itemCount: 999, status: "INQUIRY", surface: "CATALOG", orderTitle: "product", message: "ᴋᴏʙᴇɴɪ ʏᴏɴᴏᴍᴏʀɪ", sellerJid: m.sender, token: "775BBQR0", totalAmount1000: 777, totalCurrencyCode: "MYR", contextInfo: { mentionedJid: [m.sender] } } }
} }
);
break;
}
//=================
case "addbot": {
if (!isMainBot) return m.reply(mess.owner);
if (!isMainAccess) return m.reply(mess.owner);
if (!text) return m.reply(`-Example: ${prefix + command} (number)`);
const number = text.replace(/[^0-9]/g, "");
if (number === botNumber) return m.reply(mess.owner);
await m.reply(mess.wait);
const result = await addBot(number);
if (result.error) return m.reply(mess.error);
if (result.isNew) {
return m.reply(`*⌗ Multi Device*
> *Number:* ${result.id || "-"}
> *Pairing Code:* ${result.code || "-"}`);
}
m.reply(mess.error);
}
break;
//=================
case "delbot": {
if (!isMainBot) return m.reply(mess.owner);
if (!isMainAccess) return m.reply(mess.owner);
if (!text) return m.reply(`-Example: ${prefix + command} (number)`);
const id = text.replace(/[^0-9]/g, "");
delBot(id);
m.reply(mess.success);
}
break;
//=================
case "listbot": {
if (!isMainBot) return m.reply(mess.owner);
if (!isMainAccess) return m.reply(mess.owner);
const list = listBot();
if (!list.length) return m.reply(mess.wrong);
let txt = `*⌗ List Connected Devices*\n`;
for (const v of list) {
txt += `> *ID:* ${v}\n`;
}
m.reply(txt.trim());
}
break;
//=================
case "public":
{
if (!isAccess) return m.reply(mess.owner);
if (isPublic(dbId)) return m.reply(mess.wrong);
setPublic(true, dbId);
m.reply(mess.success);
}
break;
//=================
case "self":
{
if (!isAccess) return m.reply(mess.owner);
if (!isPublic(dbId)) return m.reply(mess.wrong);
setPublic(false, dbId);
m.reply(mess.success);
}
break;
//=================
case "addaccess":
{
if (!isAccess) return m.reply(mess.owner);
if (!text) return m.reply(`-Example: ${prefix + command} (number)`);
const user = text.replace(/[^\d]/g, "");
if (currentData.access.some((u) => u.id === user))
return m.reply(mess.wrong);
addAccessUser(user, dbId);
m.reply(mess.success);
}
break;
//=================
case "delaccess":
{
if (!isAccess) return m.reply(mess.owner);
if (!text) return m.reply(`-Example: ${prefix + command} (number)`);
const user = text.replace(/[^\d]/g, "");
if (!currentData.access.some((u) => u.id === user))
return m.reply(mess.wrong);
delAccessUser(user, dbId);
m.reply(mess.success);
}
break;
//=================
case "listaccess":
{
if (!isAccess) return m.reply(mess.owner);
const list = currentData.access;
if (!list || list.length === 0) {
return m.reply(mess.wrong);
}
let teks = `*⌗ List Access*\n`;
list.forEach((u, i) => {
teks += `> *${i + 1}:* ${u.id}\n`;
});
m.reply(teks.trim());
}
break;
//=================
case "getpl": {
if (!isMainAccess) return m.reply(mess.owner);
if (!text) return m.reply(`-Example: ${prefix + command} (pl)`);
const cmdName = text.toLowerCase();
const plugData = global.plugins[cmdName];
if (!plugData) return m.reply(mess.wrong);
const filePath = `./system/plugins/${plugData.category}/${plugData.name}`;
if (!(await fs.pathExists(filePath))) return m.reply(mess.wrong);
const codeUtama = await fs.readFile(filePath, "utf-8");
const regex = /(`(?:\\`|[^`])*`|"(?:\\"|[^"])*"|'(?:\\'|[^'])*')|(\/\/.*|\/\*[\s\S]*?\*\/)|(\b(?:async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|finally|for|function|if|import|in|instanceof|let|new|return|super|switch|this|throw|try|typeof|var|void|while|with|yield|true|false|null|undefined)\b)|([a-zA-Z_$][a-zA-Z0-9_$]*)|([\s\S])/g;
const blocks = [];
let match;
while ((match = regex.exec(codeUtama)) !== null) {
if (match[1]) blocks.push({ highlightType: 3, codeContent: match[1] });
else if (match[2]) blocks.push({ highlightType: 5, codeContent: match[2] });
else if (match[3]) blocks.push({ highlightType: 1, codeContent: match[3] });
else if (match[4]) blocks.push({ highlightType: 2, codeContent: match[4] });
else if (match[5]) {
const last = blocks[blocks.length - 1];
if (last && last.highlightType === 0) last.codeContent += match[5];
else blocks.push({ highlightType: 0, codeContent: match[5] });
}
}
let teks = `*⌗ Plugin Viewer*
> *File:* ${plugData.name}
> *Category:* ${plugData.category}`;
const msgData = {
messageContextInfo: {
deviceListMetadata: {},
deviceListMetadataVersion: 2,
botMetadata: {
richResponseSourcesMetadata: { sources: [] }
}
},
botForwardedMessage: {
message: {
richResponseMessage: {
messageType: 1,
submessages: [
{
messageType: 2,
messageText: teks
},
{
messageType: 5,
codeMetadata: {
codeLanguage: "javascript",
codeBlocks: blocks
}
}
],
contextInfo: {
forwardingScore: 1,
isForwarded: true,
forwardedAiBotMessageInfo: { botJid: "867051314767696@bot" },
forwardOrigin: 4,
stanzaId: m.key.id,
participant: m.sender,
quotedMessage: m.message
}
}
}
}
};
const msg = generateWAMessageFromContent(
m.chat,
msgData,
{
userJid: conn.user?.id
}
);
await conn.relayMessage(
m.chat,
msg.message,
{
messageId: msg.key.id
}
);
break;
}
//=================
case "exec": {
if (!isMainBot) return m.reply(mess.owner);
if (!isMainAccess) return m.reply(mess.owner);
if (!text) return m.reply(`-Example: ${prefix + command} (text)`);
exec(text, (err, stdout, stderr) => {
if (err)
return m.reply(
`-Exec Error:\n${stderr.trim() || err.message}`
);
m.reply(stdout || stderr || "");
});
}
break;
//=================
case "eval": {
if (!isMainBot) return m.reply(mess.owner);
if (!isMainAccess) return m.reply(mess.owner);
if (!text) return m.reply(`-Example: ${prefix + command} (text)`);
try {
const require = createRequire(import.meta.url);
const AsyncFunction =
Object.getPrototypeOf(async function () {}).constructor;
const fn = new AsyncFunction(
"m",
"conn",
"sock",
"require",
"util",
"__code",
`
return (async () => {
return await eval(__code)
})()
`
);
let result = await fn(
m,
conn,
conn,
require,
util,
text
);
if (typeof result !== "string") {
result = util.inspect(result, {
depth: 2
});
}
await m.reply(result || "undefined");
} catch (err) {
await m.reply(String(err));
}
}
break;
//=================
default:
break;
}
} catch (e) {
console.error(e);
}
};
//=================
