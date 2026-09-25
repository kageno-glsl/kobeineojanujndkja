import { generateWAMessageFromContent, prepareWAMessageMedia } from "@whiskeysockets/baileys";
import axios from "axios";
import * as cheerio from "cheerio";
import imageToPdf from "image-to-pdf";
import { spawn } from "child_process";
//=================
const userCache = new Map();
const config = {
url: "https://06.ikiru.wtf",
headers: {
"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
"Referer": "https://06.ikiru.wtf/",
"Origin": "https://06.ikiru.wtf"
},
cdnHeaders: {
"Referer": "https://06.ikiru.wtf/",
"User-Agent": "okhttp/5.2.1"
}
};
//=================
async function ikiruSearch(title) {
try {
const { data: htmlNonce } = await axios.get(`${config.url}/wp-admin/admin-ajax.php?type=search_form&action=get_nonce`, { headers: config.headers });
const nonce = htmlNonce.match(/value='([^']+)'/)?.[1] || "";
if (!nonce) return null;
const { data: htmlSearch } = await axios.post(
`${config.url}/wp-admin/admin-ajax.php?nonce=${nonce}&action=search`,
`query=${encodeURIComponent(title)}`,
{ headers: { ...config.headers, "Content-Type": "application/x-www-form-urlencoded" } }
);
const $ = cheerio.load(htmlSearch);
const firstResult = $("#searchResults a").first();
const link = firstResult.attr("href");
if (!link || link.includes("advanced-search")) return null;
const mangaId = link.split("/").filter(Boolean).pop() || Math.random().toString(36).slice(2, 7);
const { data: html } = await axios.get(link, { headers: config.headers });
const $$ = cheerio.load(html);
let metaData = {};
$$("script[type='application/ld+json']").each((i, el) => {
try {
const json = JSON.parse($$(el).html());
if (json["@type"] && (json["@type"].includes("Book") || json["@type"].includes("ComicSeries"))) {
metaData = {
title: json.name,
synopsis: json.description,
author: json.author?.name || "-",
genres: json.genre || [],
status: json.creativeWorkStatus || "-"
};
}
} catch (err) {}
});
if (!metaData.title) {
metaData.title = $$("[itemprop='name']").text().trim() || $$(".entry-title").text().trim();
metaData.synopsis = $$("[itemprop='description']").first().text().trim();
}
const thumb = $$("[itemprop='image'] img").attr("src") || $$(".wp-post-image").attr("src");
let type = "-";
$$("h4:contains('Type')").each((i, el) => {
type = $$(el).next().text().trim();
});
const chapters = [];
$$("#chapter-list [data-chapter-number]").each((i, el) => {
const chLink = $$(el).find("a").attr("href");
const chTitle = $$(el).find(".flex.flex-row.gap-1.font-medium span").text().trim() || `Chapter ${$$(el).attr("data-chapter-number")}`;
if (chLink) {
chapters.push({
title: chTitle,
link: chLink
});
}
});
return {
manga_id: mangaId,
title: metaData.title,
thumb: thumb || null,
author: metaData.author || "-",
type: type,
status: metaData.status || "-",
total_chapter: chapters.length,
chapters: chapters.reverse()
};
} catch (e) {
return null;
}
}
async function getChapterImages(chapterUrl) {
try {
const { data: html } = await axios.get(chapterUrl, { headers: config.headers });
const $ = cheerio.load(html);
const imgUrls = [];
$('section[data-image-data="1"] img').each((i, el) => {
const src = $(el).attr("src");
if (src) imgUrls.push(src);
});
return imgUrls;
} catch (err) {
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
const imgUrls = await getChapterImages(targetChapter.link);
if (!imgUrls.length) return m.reply(mess.error);
const imageBuffers = await Promise.all(
imgUrls.map(async (url) => {
try {
const res = await axios.get(url, { headers: config.cdnHeaders, responseType: "arraybuffer" });
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
caption: `*⌗ Ikiru PDF Reader*
> *Judul:* ${komikCache.title}
> *Chapter:* ${targetChapter.title}`
}, { quoted: m });
}
await m.reply(mess.wait);
const meta = await ikiruSearch(text);
if (!meta) return m.reply(mess.error);
const currentUserCache = userCache.get(m.sender) || {};
currentUserCache[meta.manga_id] = meta;
userCache.set(m.sender, currentUserCache);
const cap = `*⌗ Ikiru Search*
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
handler.command = ["ikiru"];
export default handler;
