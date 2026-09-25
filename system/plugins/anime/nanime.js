import fs from "fs-extra";
import path from "node:path";
import axios from "axios";
import { generateWAMessageFromContent, prepareWAMessageMedia } from "@whiskeysockets/baileys";
//=================
const userCache = new Map();
class NanimeAPI {
constructor(token = null) {
this.baseUrl = "https://mainappsv1.nanimeid.xyz/2.1.0";
this.token = token;
this.client = axios.create({
baseURL: this.baseUrl,
headers: {
"User-Agent": "Dart/3.12 (dart:io)",
"Content-Type": "application/json",
"Accept-Encoding": "gzip"
}
});
if (token) {
this.client.defaults.headers.common["Authorization"] = `Bearer ${token}`;
}
}
async verifyGoogleLogin(idToken) {
const payload = {
id_token: idToken,
client_ip: "localhost:80",
deviceId: "777",
fingerprint_hash: Date.now(),
device_info: {
brand: "Amd",
model: "Ryzen7x3d",
sdk: 36,
resolution: "720x1600",
abi: "arch64"
}
};
const res = await this.client.post("/auth/google/verify", payload);
if (res.data?.token) {
this.token = res.data.token;
this.client.defaults.headers.common["Authorization"] = `Bearer ${this.token}`;
}
return res.data;
}
async searchAnime(query) {
const res = await this.client.get(`/anime/live-search?q=${encodeURIComponent(query)}&limit=30`);
return res.data;
}
async getAnimeDetail(id) {
const res = await this.client.get(`/anime/${id}`);
return res.data;
}
async getEpisodeDetail(id) {
const res = await this.client.get(`/episode/${id}`);
return res.data;
}
async getAllGenres() {
const res = await this.client.get(`/anime/genres`);
return res.data;
}
async getGenreAnime(genre, limit = 30) {
const res = await this.client.get(`/anime/genre/${genre}?page=1&limit=${limit}`);
return res.data;
}
async getCatalog(letter) {
const res = await this.client.get(`/anime/catalog?letter=${letter}&page=1&limit_per_group=100`);
return res.data;
}
}
//=================
const dir = "./system/database";
fs.ensureDirSync(dir);
const getNanimeDbPath = (botId) => path.join(dir, botId === "main" ? "nanimeauth.json" : `nanimeauth_${botId}.json`);
const loadNanimeToken = (botId) => {
const p = getNanimeDbPath(botId);
if (fs.existsSync(p)) {
try {
const data = fs.readJsonSync(p);
return data.token || null;
} catch { return null; }
}
return null;
};
const saveNanimeToken = (botId, token) => {
const p = getNanimeDbPath(botId);
fs.writeJsonSync(p, { token }, { spaces: 2 });
};
const deleteNanimeToken = (botId) => {
const p = getNanimeDbPath(botId);
if (fs.existsSync(p)) fs.unlinkSync(p);
};
//=================
const handler = async (m, { conn, isBotAdmins, isAdmins, command, args, text, isAccess, prefix }) => {
try {
if (!text) return m.reply(`-Example:

${prefix + command} login
${prefix + command} verify (url)
${prefix + command} logout
${prefix + command} genre
${prefix + command} katalog
${prefix + command} (title)`);
const botNumberJid = conn.decodeJid(conn.user.id);
const botNumber = botNumberJid.replace(/[^0-9]/g, "");
const dbId = !conn.isClone ? "main" : botNumber;
const inputFirst = args[0]?.toLowerCase();
const currentToken = loadNanimeToken(dbId);
if (inputFirst === "login") {
if (!isAccess) return m.reply(mess.owner);
if (currentToken) return m.reply(mess.wrong);
const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=536941617808-m9krnqev6lfl1e7kkdsj9v1al6dfk0v9.apps.googleusercontent.com&redirect_uri=${encodeURIComponent("https://developers.google.com/oauthplayground")}&response_type=id_token&scope=openid%20profile%20email&nonce=${Math.random().toString(36).substring(2)}`;
return m.reply(`*⌗ Google Login Link*
> *Link:* ${authUrl}`.trim());
}
if (inputFirst === "verify") {
if (!isAccess) return m.reply(mess.owner);
if (currentToken) return m.reply(mess.wrong);
const inputUrl = args[1];
if (!inputUrl) return m.reply(`-Example: ${prefix + command} verify (url)`);
let idToken = inputUrl.trim();
if (idToken.includes("id_token=")) {
idToken = idToken.split("id_token=")[1]?.split("&")[0] || idToken;
}
if (!idToken || idToken.startsWith("http")) return m.reply(mess.wrong);
await m.reply(mess.wait);
try {
const nanime = new NanimeAPI();
const authRes = await nanime.verifyGoogleLogin(idToken);
if (authRes.token) {
saveNanimeToken(dbId, authRes.token);
return m.reply(mess.success);
}
m.reply(mess.wrong);
} catch (err) {
console.error("Handler:", err.message);
m.reply(mess.error);
}
return;
}
if (inputFirst === "logout") {
if (!isAccess) return m.reply(mess.owner);
deleteNanimeToken(dbId);
return m.reply(mess.success);
}
if (inputFirst === "genre") {
if (!currentToken) return m.reply(mess.wrong);
const selectedGenre = args[1];
if (!selectedGenre) {
await m.reply(mess.wait);
try {
const nanime = new NanimeAPI(currentToken);
const genresRes = await nanime.getAllGenres();
if (!genresRes?.data?.genreStats || genresRes.data.genreStats.length === 0) return m.reply(mess.error);
const genreStats = genresRes.data.genreStats.filter(g => g.count > 0);
const sections = [{
title: "Genre List",
rows: genreStats.map((g, idx) => ({
title: `${g.genre} (${g.count})`,
id: `${prefix + command} genre ${idx}`
}))
}];
const contextInfo = {
stanzaId: m.key.id,
participant: m.sender || m.key.participant || m.key.remoteJid,
quotedMessage: m.message || { conversation: "" }
};
const msgData = {
interactiveMessage: {
body: { text: "*⌗ Nanime Genre*" },
footer: { text: "© ᴋᴏʙᴇɴɪ-ᴍᴅ" },
nativeFlowMessage: {
buttons: [{
name: "single_select",
buttonParamsJson: JSON.stringify({
title: "\u0000",
sections: sections
})
}]
},
contextInfo
},
};
const msg = generateWAMessageFromContent(m.chat, msgData, { userJid: conn.user?.id });
const INTERACTIVE_NODES = [{
tag: "biz",
attrs: {},
content: [{
tag: "interactive",
attrs: { type: "native_flow", v: "1" },
content: [{ tag: "native_flow", attrs: { v: "9", name: "mixed" } }],
}],
}];
await conn.relayMessage(m.chat, msg.message, {
messageId: msg.key.id,
additionalNodes: INTERACTIVE_NODES
});
} catch (err) {
console.error("Handler:", err.message);
m.reply(mess.error);
}
return;
}
await m.reply(mess.wait);
try {
const nanime = new NanimeAPI(currentToken);
const genresRes = await nanime.getAllGenres();
const genreStats = genresRes.data.genreStats.filter(g => g.count > 0);
const selectedGenreObj = genreStats[parseInt(selectedGenre)];
if (!selectedGenreObj || selectedGenreObj.count === 0) return m.reply(mess.error);
const genreName = selectedGenreObj.genre;
const genreRes = await nanime.getGenreAnime(genreName, 1);
if (!genreRes?.items || genreRes.items.length === 0) return m.reply(mess.error);
const totalAnime = genreRes.total || genreRes.items.length;
const fullGenreRes = await nanime.getGenreAnime(genreName, totalAnime);
if (!fullGenreRes?.items || fullGenreRes.items.length === 0) return m.reply(mess.error);
const randomIdx = Math.floor(Math.random() * fullGenreRes.items.length);
const randomAnimeId = fullGenreRes.items[randomIdx].id;
const detailRes = await nanime.getAnimeDetail(randomAnimeId);
if (!detailRes?.data) return m.reply(mess.error);
const a = detailRes.data;
const currentUserCache = userCache.get(m.sender) || {};
currentUserCache[a.id] = a;
userCache.set(m.sender, currentUserCache);
const cap = `*⌗ Nanime ${genreName}*
> *Title:* ${a.nama_anime || "-"}
> *Rating:* ${a.rating_anime || "-"} 
> *Status:* ${a.status_anime || "-"}
> *Episodes:* ${a.episodes_count || "-"}
> *Release:* ${a.tanggal_rilis_anime || "-"}
> *Genres:* ${a.genre_anime?.join(", ") || "-"}`;
if (a.episodes && a.episodes.length > 0) {
const sections = [{
title: "Episode List",
rows: a.episodes.map((ep) => ({
title: ep.judul_episode || `Episode ${ep.nomor_episode}`,
description: `Duration: ${ep.durasi_episode ? Math.floor(ep.durasi_episode / 60) + ' min' : "-"}`,
id: `${prefix + command} ep ${ep.id} ${a.id}` 
}))
}];
const contextInfo = {
stanzaId: m.key.id,
participant: m.sender || m.key.participant || m.key.remoteJid,
quotedMessage: m.message || { conversation: "" }
};
let imageHeader = {};
if (a.gambar_anime) {
const mediaUpload = await prepareWAMessageMedia({ image: { url: a.gambar_anime } }, { upload: conn.waUploadToServer });
imageHeader = { imageMessage: mediaUpload.imageMessage };
}
const msgData = {
interactiveMessage: {
body: { text: cap },
footer: { text: "© ᴋᴏʙᴇɴɪ-ᴍᴅ" },
header: {
hasMediaAttachment: a.gambar_anime ? true : false,
...imageHeader
},
nativeFlowMessage: {
buttons: [{
name: "single_select",
buttonParamsJson: JSON.stringify({
title: "\u0000",
sections: sections
})
}]
},
contextInfo
},
};
const msg = generateWAMessageFromContent(m.chat, msgData, { userJid: conn.user?.id });
const INTERACTIVE_NODES = [{
tag: "biz",
attrs: {},
content: [{
tag: "interactive",
attrs: { type: "native_flow", v: "1" },
content: [{ tag: "native_flow", attrs: { v: "9", name: "mixed" } }],
}],
}];
await conn.relayMessage(m.chat, msg.message, {
messageId: msg.key.id,
additionalNodes: INTERACTIVE_NODES
});
} else {
await conn.sendMessage(m.chat, { image: { url: a.gambar_anime }, caption: cap }, { quoted: m });
}
} catch (err) {
console.error("Handler:", err.message)
m.reply(mess.error);
}
return;
}
if (inputFirst === "ep") {
if (!currentToken) return m.reply(mess.wrong);
const epId = args[1];
const animeId = args[2]; 
if (!epId) return m.reply(mess.error);
await m.reply(mess.wait);
try {
const nanime = new NanimeAPI(currentToken);
const epRes = await nanime.getEpisodeDetail(epId);
if (!epRes?.data) return m.reply(mess.error);
const ep = epRes.data;
const userMangaData = userCache.get(m.sender);
const currentCache = userMangaData ? userMangaData[animeId] : null;
if (!currentCache) {
return m.reply(`-Example:

${prefix + command} login
${prefix + command} verify (url)
${prefix + command} logout
${prefix + command} genre
${prefix + command} katalog
${prefix + command} (title)`);
}
const animeName = currentCache.nama_anime || "Anime";
let cap = `*⌗ Download Links*
> *Title:* ${animeName}
> *Episode:* ${ep.judul_episode || "-"}
> *Duration:* ${ep.durasi_episode ? Math.floor(ep.durasi_episode / 60) + ' min' : "-"}
`;
if (ep.qualities && ep.qualities.length > 0) {
ep.qualities.forEach(q => {
cap += `\n> *${q.nama_quality}:* ${q.source_quality || "-"}`;
});
} else {
cap += `\n> (Link missing.)`;
}
await conn.sendMessage(m.chat, {
text: cap.trim()
}, { quoted: m });
} catch (err) {
console.error("Handler:", err.message);
m.reply(mess.error);
}
return;
}
if (inputFirst === "katalog") {
if (!currentToken) return m.reply(mess.wrong);
const selectedLetter = args[1];
if (!selectedLetter) {
const letters = ["#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")];
const sections = [{
title: "Catalog List",
rows: letters.map((letter) => ({
title: letter,
id: `${prefix + command} katalog ${letter}`
}))
}];
const contextInfo = {
stanzaId: m.key.id,
participant: m.sender || m.key.participant || m.key.remoteJid,
quotedMessage: m.message || { conversation: "" }
};
const msgData = {
interactiveMessage: {
body: { text: "*⌗ Nanime Catalog*" },
footer: { text: "© ᴋᴏʙᴇɴɪ-ᴍᴅ" },
nativeFlowMessage: {
buttons: [{
name: "single_select",
buttonParamsJson: JSON.stringify({
title: "\u0000",
sections: sections
})
}]
},
contextInfo
},
};
const msg = generateWAMessageFromContent(m.chat, msgData, { userJid: conn.user?.id });
const INTERACTIVE_NODES = [{
tag: "biz",
attrs: {},
content: [{
tag: "interactive",
attrs: { type: "native_flow", v: "1" },
content: [{ tag: "native_flow", attrs: { v: "9", name: "mixed" } }],
}],
}];
await conn.relayMessage(m.chat, msg.message, {
messageId: msg.key.id,
additionalNodes: INTERACTIVE_NODES
});
return;
}
await m.reply(mess.wait);
try {
const nanime = new NanimeAPI(currentToken);
const catalogRes = await nanime.getCatalog(selectedLetter);
const catalogData = catalogRes?.data?.catalog?.[selectedLetter];
if (!catalogData || catalogData.length === 0) return m.reply(mess.error);
const animeList = catalogData;
const randomIdx = Math.floor(Math.random() * animeList.length);
const randomAnimeId = animeList[randomIdx].id;
const detailRes = await nanime.getAnimeDetail(randomAnimeId);
if (!detailRes?.data) return m.reply(mess.error);
const a = detailRes.data;
const currentUserCache = userCache.get(m.sender) || {};
currentUserCache[a.id] = a;
userCache.set(m.sender, currentUserCache);
const cap = `*⌗ Nanime Catalog [${selectedLetter}]*
> *Title:* ${a.nama_anime || "-"}
> *Rating:* ${a.rating_anime || "-"} 
> *Status:* ${a.status_anime || "-"}
> *Episodes:* ${a.episodes_count || "-"}
> *Release:* ${a.tanggal_rilis_anime || "-"}
> *Genres:* ${a.genre_anime?.join(", ") || "-"}`;
if (a.episodes && a.episodes.length > 0) {
const sections = [{
title: "Episode List",
rows: a.episodes.map((ep) => ({
title: ep.judul_episode || `Episode ${ep.nomor_episode}`,
description: `Duration: ${ep.durasi_episode ? Math.floor(ep.durasi_episode / 60) + ' min' : "-"}`,
id: `${prefix + command} ep ${ep.id} ${a.id}` 
}))
}];
const contextInfo = {
stanzaId: m.key.id,
participant: m.sender || m.key.participant || m.key.remoteJid,
quotedMessage: m.message || { conversation: "" }
};
let imageHeader = {};
if (a.gambar_anime) {
const mediaUpload = await prepareWAMessageMedia({ image: { url: a.gambar_anime } }, { upload: conn.waUploadToServer });
imageHeader = { imageMessage: mediaUpload.imageMessage };
}
const msgData = {
interactiveMessage: {
body: { text: cap },
footer: { text: "© ᴋᴏʙᴇɴɪ-ᴍᴅ" },
header: {
hasMediaAttachment: a.gambar_anime ? true : false,
...imageHeader
},
nativeFlowMessage: {
buttons: [{
name: "single_select",
buttonParamsJson: JSON.stringify({
title: "\u0000",
sections: sections
})
}]
},
contextInfo
},
};
const msg = generateWAMessageFromContent(m.chat, msgData, { userJid: conn.user?.id });
const INTERACTIVE_NODES = [{
tag: "biz",
attrs: {},
content: [{
tag: "interactive",
attrs: { type: "native_flow", v: "1" },
content: [{ tag: "native_flow", attrs: { v: "9", name: "mixed" } }],
}],
}];
await conn.relayMessage(m.chat, msg.message, {
messageId: msg.key.id,
additionalNodes: INTERACTIVE_NODES
});
} else {
await conn.sendMessage(m.chat, { image: { url: a.gambar_anime }, caption: cap }, { quoted: m });
}
} catch (err) {
console.error("Handler:", err.message);
m.reply(mess.error);
}
return;
}
if (!currentToken) return m.reply(mess.wrong);
await m.reply(mess.wait);
try {
const nanime = new NanimeAPI(currentToken);
const searchRes = await nanime.searchAnime(text.trim());
if (!searchRes?.data || searchRes.data.length === 0) return m.reply(mess.error);
const firstAnime = searchRes.data[0];
const detailRes = await nanime.getAnimeDetail(firstAnime.id);
if (!detailRes?.data) return m.reply(mess.error);
const a = detailRes.data;
const currentUserCache = userCache.get(m.sender) || {};
currentUserCache[a.id] = a;
userCache.set(m.sender, currentUserCache);
const cap = `*⌗ Nanime Search*
> *Title:* ${a.nama_anime || "-"}
> *Rating:* ${a.rating_anime || "-"} 
> *Status:* ${a.status_anime || "-"}
> *Episodes:* ${a.episodes_count || "-"}
> *Release:* ${a.tanggal_rilis_anime || "-"}
> *Genres:* ${a.genre_anime?.join(", ") || "-"}`;
if (a.episodes && a.episodes.length > 0) {
const sections = [{
title: "Episode List",
rows: a.episodes.map((ep) => ({
title: ep.judul_episode || `Episode ${ep.nomor_episode}`,
description: `Duration: ${ep.durasi_episode ? Math.floor(ep.durasi_episode / 60) + ' min' : "-"}`,
id: `${prefix + command} ep ${ep.id} ${a.id}` 
}))
}];
const contextInfo = {
stanzaId: m.key.id,
participant: m.sender || m.key.participant || m.key.remoteJid,
quotedMessage: m.message || { conversation: "" }
};
let imageHeader = {};
if (a.gambar_anime) {
const mediaUpload = await prepareWAMessageMedia({ image: { url: a.gambar_anime } }, { upload: conn.waUploadToServer });
imageHeader = { imageMessage: mediaUpload.imageMessage };
}
const msgData = {
interactiveMessage: {
body: { text: cap },
footer: { text: "© ᴋᴏʙᴇɴɪ-ᴍᴅ" },
header: {
hasMediaAttachment: a.gambar_anime ? true : false,
...imageHeader
},
nativeFlowMessage: {
buttons: [{
name: "single_select",
buttonParamsJson: JSON.stringify({
title: "\u0000",
sections: sections
})
}]
},
contextInfo
},
};
const msg = generateWAMessageFromContent(m.chat, msgData, { userJid: conn.user?.id });
const INTERACTIVE_NODES = [{
tag: "biz",
attrs: {},
content: [{
tag: "interactive",
attrs: { type: "native_flow", v: "1" },
content: [{ tag: "native_flow", attrs: { v: "9", name: "mixed" } }],
}],
}];
await conn.relayMessage(m.chat, msg.message, {
messageId: msg.key.id,
additionalNodes: INTERACTIVE_NODES
});
} else {
await conn.sendMessage(m.chat, { image: { url: a.gambar_anime }, caption: cap }, { quoted: m });
}
} catch (err) {
console.error("Handler:", err.message);
m.reply(mess.error);
}
} catch (err) {
console.error("Handler:", err.message);
m.reply(mess.error);
}
};
//=================
handler.command = ["nanime"];
export default handler;
