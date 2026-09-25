import { generateWAMessageFromContent, prepareWAMessageMedia } from "@whiskeysockets/baileys";
import axios from "axios";
import * as cheerio from "cheerio";
import imageToPdf from "image-to-pdf";
import { spawn } from "child_process";
//=================
const userCache = new Map();
class KomikindoScraper {
static headers = { "User-Agent": "Mozilla/5.0" };
static async search(title) {
try {
const { data: html } = await axios.get(
`https://komikindo.ch/daftar-manga/?title=${encodeURIComponent(title)}`,
{ headers: this.headers }
);
const $ = cheerio.load(html);
const all = $(".animepost").toArray();
if (!all.length) return null;
const el = all[0];
const link = $(el).find("h3 a").attr("href");
const { data: html2 } = await axios.get(link, { headers: this.headers });
const $$ = cheerio.load(html2);
const mangaId = link.split("/").filter(Boolean).pop() || Math.random().toString(36).slice(2, 7);
const meta = {
manga_id: mangaId, 
title: $$(".infox h1").text().replace(/\s+/g, " ").trim() || $(el).find("h3 a").text().trim(),
thumb: $$(".thumb img").attr("src") || $(el).find("img").attr("src") || null,
author: $$('.spe span:contains("Pengarang")').text().replace(/Pengarang:/i, "").replace(/\s+/g, " ").trim(),
type: $$('.spe span:contains("Jenis")').text().replace(/Jenis Komik:/i, "").replace(/\s+/g, " ").trim(),
total_chapter: $$("#chapter_list ul li").length,
link
};
const ch = [];
$$("#chapter_list ul li").each((i, e) => {
ch.push({
title: $$(e).find(".lchx a").text().replace(/\s+/g, " ").trim(),
link: $$(e).find(".lchx a").attr("href")
});
});
return { ...meta, chapters: ch.reverse() };
} catch (e) {
return null;
}
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
const chLink = komikCache.chapters[idx].link;
const { data: html } = await axios.get(chLink, { headers: KomikindoScraper.headers });
const $ = cheerio.load(html);
const imgUrls = $("#chimg-auh img").map((i, e) => $(e).attr("src")).get();
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
const pdfName = `${komikCache.title} - ${komikCache.chapters[idx].title}.pdf`.replace(/[\\/:*?"<>|]/g, "");
return await conn.sendMessage(m.chat, {
document: pdfBuffer,
mimetype: "application/pdf",
fileName: pdfName,
caption: `*⌗ Komikindo PDF Reader*
> *Judul:* ${komikCache.title}
> *Chapter:* ${komikCache.chapters[idx].title}`
}, { quoted: m });
}
await m.reply(mess.wait);
const meta = await KomikindoScraper.search(text);
if (!meta) return m.reply(mess.error);
const currentUserCache = userCache.get(m.sender) || {};
currentUserCache[meta.manga_id] = meta;
userCache.set(m.sender, currentUserCache);
const cap = `*⌗ Komikindo Search*
> *Title:* ${meta.title}
> *Author:* ${meta.author || "-"}
> *Type:* ${meta.type || "-"}
> *Total Chapter:* ${meta.total_chapter || 0}`;
const sections = [
{
title: "Chapter List",
rows: meta.chapters.map((ch, idx) => ({
title: ch.title,
description: `Read Chapter ${idx + 1}`,
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
handler.command = ["komikindo"];
export default handler;
