import axios from "axios";
import { generateWAMessageFromContent, prepareWAMessageMedia } from "@whiskeysockets/baileys";
//=================
const TOKEN_POOL = [
{ id_user: "860023", key_client: "3DhvqM1bvwt7XKbQWJ9rBxNex8ADpq5jYsxupZVn8ztUD75SN4" },
{ id_user: "861242", key_client: "kfcmoaHOIGSl3ZrSjMDq0dUlcqasMrhSV8ghxik535byVF21zD" },
{ id_user: "861248", key_client: "5ZDWEID37NlXZbKyL7tzp1pA2EF1HaJ0vjjxve8G76P1eIahc7" },
{ id_user: "861251", key_client: "27t2B2KQjeBItuuW1eKlcfBpgM4XFrB1iDhO7AMCPMjMqUZpdz" },
{ id_user: "861309", key_client: "VwFZtILcZ650KEDj6i6FsBjjfEW4vQQDuMBCPtiVuMRfWx4fWB" }
];
const getRandomToken = () => TOKEN_POOL[Math.floor(Math.random() * TOKEN_POOL.length)];
const userCache = new Map();
const fetchBuffer = async (url) => {
try {
const res = await axios.get(url, {
headers: {
"User-Agent": "okhttp/4.12.0",
"Accept": "image/avif,image/webp,image/apng,image/*,*/*"
},
responseType: "arraybuffer"
});
return Buffer.from(res.data, "binary");
} catch (e) {
console.error("Handler:", e.message);
return null;
}
};
//=================
class AnimeInAPI {
constructor(userData) {
this.baseUrl = "https://xyz-api.animein.net";
this.userData = userData; 
this.client = axios.create({
baseURL: this.baseUrl,
headers: {
"User-Agent": "okhttp/4.12.0",
"Accept-Encoding": "gzip"
}
});
}
async searchAnime(query) {
if (!this.userData) throw new Error("Unauthorized");
const { id_user, key_client } = this.userData;
const res = await this.client.get("/3/2/explore/movie", {
params: { genre_in: "", page: 0, sort: "views", keyword: query, id_user, key_client, apk_ver: "5.1.2" }
});
return res.data;
}
async getAnimeDetail(idMovie) {
if (!this.userData) throw new Error("Unauthorized");
const { id_user, key_client } = this.userData;
const res = await this.client.get(`/3/2/movie/episode/${idMovie}`, {
params: { search: "", page: 0, id_user, key_client, apk_ver: "5.1.2" }
});
return res.data;
}
async getEpisodeDetail(idEpisode) {
if (!this.userData) throw new Error("Unauthorized");
const { id_user, key_client } = this.userData;
const res = await this.client.get(`/3/2/episode/streamnew/${idEpisode}`, {
params: { id_user, key_client, apk_ver: "5.1.2" }
});
return res.data;
}
}
//=================
const handler = async (m, { conn, command, args, text, prefix }) => {
try {
const inputFirst = args[0]?.toLowerCase();
if (inputFirst === "ep") {
const epId = args[1];
const animeId = args[2];
const keyClientFromBtn = args[3];
if (!epId) return m.reply(mess.error);
await m.reply(mess.wait);
try {
const matchedToken = TOKEN_POOL.find(t => t.key_client === keyClientFromBtn) || getRandomToken();
const animeIn = new AnimeInAPI(matchedToken);
const epRes = await animeIn.getEpisodeDetail(epId);
if (!epRes?.data) return m.reply(mess.error);
const resData = epRes.data;
const epInfo = resData.episode || {};
const servers = resData.server || [];
const userAnimeCache = userCache.get(m.sender) || {};
const currentCache = userAnimeCache[animeId] || {};
const animeName = currentCache.title || "Anime";
const posterUrl = currentCache.image_poster || "https://animein.net/assets/images/logo.png";
let cap = `*⌗ Download Links*
> *Title:* ${animeName}
> *Episode:* ${epInfo.title || `Episode ${epInfo.index || "-"}`}`;
if (servers.length > 0) {
const groupedServers = {};
servers.forEach(srv => {
if (!groupedServers[srv.name]) groupedServers[srv.name] = [];
groupedServers[srv.name].push(srv);
});
for (const srvName in groupedServers) {
groupedServers[srvName].forEach(vid => {
cap += `\n> *${vid.quality || "Link"}:* ${vid.link}`;
});
}
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
if (!text) return m.reply(`-Example: ${prefix + command} (title)`);
await m.reply(mess.wait);
try {
const currentToken = getRandomToken();
const animeIn = new AnimeInAPI(currentToken);
const searchRes = await animeIn.searchAnime(text.trim());
if (searchRes?.error === true || !searchRes?.data?.movie || searchRes.data.movie.length === 0) {
return m.reply(mess.error);
}
const firstAnime = searchRes.data.movie[0];
const currentUserCache = userCache.get(m.sender) || {};
searchRes.data.movie.forEach(mov => {
currentUserCache[mov.id] = mov;
});
userCache.set(m.sender, currentUserCache);
const detailRes = await animeIn.getAnimeDetail(firstAnime.id);
if (!detailRes?.data) return m.reply(mess.error);
const episodes = detailRes.data.episode;
const title = firstAnime.title || "-";
const status = firstAnime.status || "-";
const views = firstAnime.views || "-";
const releaseYear = firstAnime.year || "-";
const genres = firstAnime.genre || "-";
const cap = `*⌗ AnimeIn Search*
> *Title:* ${title}
> *Rating:* ${views} 
> *Status:* ${status}
> *Episodes:* ${episodes ? episodes.length : "-"}
> *Release:* ${releaseYear}
> *Genres:* ${genres}
`;
if (episodes && episodes.length > 0) {
const sections = [{
title: "Episode List",
rows: episodes.map((ep) => ({
title: ep.title || `Episode ${ep.index}`,
description: `Release: ${ep.key_time || "-"}`,
id: `${prefix + command} ep ${ep.id} ${firstAnime.id} ${currentToken.key_client}` 
}))
}];
const contextInfo = {
stanzaId: m.key.id,
participant: m.sender || m.key.participant || m.key.remoteJid,
quotedMessage: m.message || { conversation: "" }
};
let imageHeader = {};
const posterUrl = firstAnime.image_poster || firstAnime.image_cover;
if (posterUrl) {
const imgBuffer = await fetchBuffer(posterUrl);
if (imgBuffer && Buffer.isBuffer(imgBuffer)) {
const mediaUpload = await prepareWAMessageMedia(
{ image: imgBuffer }, 
{ upload: conn.waUploadToServer }
);
imageHeader = { imageMessage: mediaUpload.imageMessage };
}
}
const msgData = {
interactiveMessage: {
body: { text: cap },
footer: { text: "© ᴋᴏʙᴇɴɪ-ᴍᴅ" },
header: {
hasMediaAttachment: Object.keys(imageHeader).length > 0,
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
let imageBuffer = await fetchBuffer(firstAnime.image_poster || firstAnime.image_cover);
if (!imageBuffer) imageBuffer = "https://animein.net/assets/images/logo.png";
await conn.sendMessage(m.chat, { 
image: typeof imageBuffer === "string" ? { url: imageBuffer } : imageBuffer, 
caption: cap 
}, { quoted: m });
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
handler.command = ["animein"];
export default handler;
