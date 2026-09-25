import { generateWAMessageFromContent, prepareWAMessageMedia } from "@whiskeysockets/baileys";
import axios from "axios";
import imageToPdf from "image-to-pdf";
import { spawn } from "child_process";
//=================
const userCache = new Map();
async function getMangaList(query) {
try {
const headers = { "User-Agent": "okhttp/5.3.2" };
const url = `https://api.shngm.io/v1/manga/list?page=1&page_size=1&q=${encodeURIComponent(query)}`;
const { data: res } = await axios.get(url, { headers });
if (res.retcode !== 0 || !res.data.length) return null;
const mangaData = res.data[0];
const mangaId = mangaData.manga_id;
const chUrl = `https://api.shngm.io/v1/chapter/${mangaId}/list?page=1&page_size=100000&sort_by=chapter_number&sort_order=desc`;
const { data: resCh } = await axios.get(chUrl, { headers });
const chapters = (resCh.data || []).map(c => ({
title: `Chapter ${c.chapter_number} ${c.chapter_title ? '- ' + c.chapter_title : ''}`.trim(),
id: c.chapter_id
}));
return {
title: mangaData.title,
thumb: mangaData.cover_image_url,
author: mangaData.taxonomy?.Author?.[0]?.name || "-",
type: mangaData.taxonomy?.Format?.[0]?.name || "-",
total_chapter: resCh.meta?.total_record || chapters.length,
manga_id: mangaId,
chapters: chapters.reverse()
};
} catch (e) {
return null;
}
}
async function getChapterImages(chapterId) {
try {
const headers = { "User-Agent": "okhttp/5.3.2" };
const url = `https://api.shngm.io/v1/chapter/detail/${chapterId}`;
const { data: res } = await axios.get(url, { headers });
if (res.retcode !== 0 || !res.data?.chapter?.data) return [];
const baseUrl = res.data.base_url;
const path = res.data.chapter.path;
return res.data.chapter.data.map(imgName => `${baseUrl}${path}${imgName}`);
} catch (e) {
return [];
}
}
//=================
const handler = async (m, { conn, isBotAdmins, isAdmins, command, args, text, isAccess, prefix }) => {
try {
if (!text) return m.reply(`-Example: ${prefix + command} (title)`);
if (args[0] === "read") {
const idx = parseInt(args[1]);
const mangaId = args[2];
const userMangaData = userCache.get(m.sender);
if (!userMangaData || !userMangaData[mangaId]) {
return m.reply(`-Example: ${prefix + command} (title)`);
}
const komikCache = userMangaData[mangaId]; 
if (isNaN(idx) || !komikCache.chapters[idx]) return m.reply(mess.error);
await m.reply(mess.wait);
const targetChapter = komikCache.chapters[idx];
const imgUrls = await getChapterImages(targetChapter.id);
if (!imgUrls.length) return m.reply(mess.error);
const imageBuffers = await Promise.all(
imgUrls.map(async (url) => {
try {
const res = await axios.get(url, { responseType: "arraybuffer" });
const buffer = Buffer.from(res.data, "binary");
if (url.endsWith(".webp") || url.includes(".webp")) {
return await new Promise((resolve) => {
const ffmpeg = spawn("ffmpeg", [
"-i", "pipe:0",
"-f", "image2",
"-vcodec", "mjpeg",
"pipe:1"
]);
const chunks = [];
ffmpeg.stdout.on("data", (chunk) => chunks.push(chunk));
ffmpeg.stdout.on("end", () => resolve(Buffer.concat(chunks)));
ffmpeg.on("error", () => resolve(null));
ffmpeg.stdin.write(buffer);
ffmpeg.stdin.end();
});
}
return buffer;
} catch {
return null;
}
})
);
const validBuffers = imageBuffers.filter(buf => buf !== null);
if (!validBuffers.length) return m.reply(mess.error);
const pdfBuffer = await new Promise((resolve, reject) => {
const chunks = [];
const stream = imageToPdf(validBuffers);
stream.on("data", (chunk) => chunks.push(chunk));
stream.on("end", () => resolve(Buffer.concat(chunks)));
stream.on("error", (err) => reject(err));
});
const pdfName = `${komikCache.title} - ${targetChapter.title}.pdf`.replace(/[\\/:*?"<>|]/g, "");
return await conn.sendMessage(m.chat, {
document: pdfBuffer,
mimetype: "application/pdf",
fileName: pdfName,
caption: `*⌗ Komiku PDF Reader*
> *Judul:* ${komikCache.title}
> *Chapter:* ${targetChapter.title}`
}, { quoted: m });
}
await m.reply(mess.wait);
const meta = await getMangaList(text);
if (!meta) return m.reply(mess.error);
const currentUserCache = userCache.get(m.sender) || {};
currentUserCache[meta.manga_id] = meta;
userCache.set(m.sender, currentUserCache);
const cap = `*⌗ Komiku Search*
> *Title:* ${meta.title}
> *Author:* ${meta.author || "-"}
> *Type:* ${meta.type || "-"}
> *Total Chapter:* ${meta.total_chapter || 0}`;
const sections = [
{
title: "Chapter List",
rows: meta.chapters.map((ch, idx) => ({
title: ch.title,
id: `${prefix + command} read ${idx} ${meta.manga_id}`
}))
}
];
const contextInfo = { 
stanzaId: m.key.id, 
participant: m.sender || m.key.participant || m.key.remoteJid, 
quotedMessage: m.message || { conversation: "" } 
};
let imageHeader = {};
if (meta.thumb) {
const mediaUpload = await prepareWAMessageMedia({ image: { url: meta.thumb } }, { upload: conn.waUploadToServer });
imageHeader = { imageMessage: mediaUpload.imageMessage };
}
const msgData = {
interactiveMessage: {
body: { text: cap },
footer: { text: "© ᴋᴏʙᴇɴɪ-ᴍᴅ" },
header: {
hasMediaAttachment: meta.thumb ? true : false,
...imageHeader
},
nativeFlowMessage: {
buttons: [
{
name: "single_select",
buttonParamsJson: JSON.stringify({
title: "\u0000",
sections: sections
})
}
]
},
contextInfo
},
};
const msg = generateWAMessageFromContent(m.chat, msgData, { userJid: conn.user?.id });
const INTERACTIVE_NODES = [
{
tag: "biz",
attrs: {},
content: [
{
tag: "interactive",
attrs: { type: "native_flow", v: "1" },
content: [{ tag: "native_flow", attrs: { v: "9", name: "mixed" } }],
},
],
},
];
await conn.relayMessage(m.chat, msg.message, { 
messageId: msg.key.id,
additionalNodes: INTERACTIVE_NODES
});
} catch (err) {
console.error("Handler:", err.message);
m.reply(mess.error);
}
};
//=================
handler.command = ["komiku"];
export default handler;
