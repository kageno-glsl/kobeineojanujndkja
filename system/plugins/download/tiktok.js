import axios from "axios";
//=================
async function tiktokscrape(url) {
try {
const api = "https://www.tikwm.com/api/";
const { data } = await axios.post(
api,
{ url, hd: 1 },
{ headers: { "Content-Type": "application/json" } }
);
if (!data || data.code !== 0) return null;
const result = data.data;
let type = "video";
let videoBuffer = null;
if (result.hdplay) {
const vid = await axios.get(result.play, { responseType: "arraybuffer" });
videoBuffer = Buffer.from(vid.data);
}
const imageBuffers = [];
if (result.images && result.images.length > 0) {
type = "image";
for (const img of result.images) {
const im = await axios.get(img, { responseType: "arraybuffer" });
imageBuffers.push(Buffer.from(im.data));
}
}
let audioBuffer = null;
if (result.music) {
const music = await axios.get(result.music, { responseType: "arraybuffer" });
audioBuffer = Buffer.from(music.data);
}
const meta = {
type,
desc: result.title || "",
createTime: result.create_time ? result.create_time * 1000 : null,
author: {
nickname: result.author?.nickname || "",
username: result.author?.unique_id || "",
},
stats: {
likes: result.digg_count || 0,
comment: result.comment_count || 0,
share: result.share_count || 0,
views: result.play_count || 0,
},
music: {
title: result.music_info?.title || "",
author: result.music_info?.author || "",
},
};
return { type, videoBuffer, audioBuffer, imageBuffers, meta };
} catch (err) {
console.error("Handler:", err.message);
return null;
}
}
//=================
const handler = async (m, { conn, isBotAdmins, isAdmins, command, args, text, isAccess, prefix }) => {
if (!text) return m.reply(`-Example: ${prefix + command} (link)`);
try {
await m.reply(mess.wait);
const data = await tiktokscrape(text);
if (!data) return m.reply(mess.error);
const { type, videoBuffer, audioBuffer, imageBuffers, meta } = data;
if (!videoBuffer && !imageBuffers?.length) return m.reply(mess.error);
const caption = `*⌗ TikTok Post Info*
> *Author:* ${meta.author?.nickname || meta.author?.username || "-"}
> *Views:* ${meta.stats?.views || 0}
> *Likes:* ${meta.stats?.likes || 0}
> *Comments:* ${meta.stats?.comment || 0}
> *Shares:* ${meta.stats?.share || 0}
> *Caption:* ${meta.desc || "-"}
> *Music:* ${meta.music?.title || "-"} ${meta.music?.author ? ` - ${meta.music.author}` : ""}`.trim();
if (type === "image" && imageBuffers?.length > 0) {
const medias = imageBuffers.map((img, i) => ({
image: img,
caption: `${caption} (${i + 1})`,
}));
await conn.sendAlbum(m.chat, medias, caption, m);
if (audioBuffer) {
await conn.sendMessage(
m.chat,
{ audio: audioBuffer, mimetype: "audio/mpeg" },
{ quoted: m }
);
}
} else {
await conn.sendMessage(
m.chat,
{ video: videoBuffer, caption },
{ quoted: m }
);
if (audioBuffer) {
await conn.sendMessage(
m.chat,
{ audio: audioBuffer, mimetype: "audio/mpeg" },
{ quoted: m }
);
}
}
} catch (e) {
console.error("Handler:", e.message);
m.reply(mess.error);
}
};
//=================
handler.command = ["tiktok"];
export default handler;
