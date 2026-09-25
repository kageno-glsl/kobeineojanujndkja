import yts from "yt-search";
import axios from "axios";
import { spawn } from "child_process";
import fs from "fs";
//=================
async function downloadApiMedia(url, config) {
const headers = {
accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
"accept-language": "en-US,en;q=0.9",
priority: "u=0, i",
referer: `${config.origin}/`,
"sec-ch-ua": '"Not;A=Brand";v="8", "Chromium";v="150", "Google Chrome";v="150"',
"sec-ch-ua-mobile": "?0",
"sec-ch-ua-platform": '"Windows"',
"sec-fetch-dest": "document",
"sec-fetch-mode": "navigate",
"sec-fetch-site": "cross-site",
"upgrade-insecure-requests": "1",
"user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150.0.0.0 Safari/537.36",
};
for (let attempt = 0; attempt < 3; attempt++) {
const response = await axios.get(url, {headers, responseType: "arraybuffer", timeout: 120000});
const data = Buffer.from(response.data);
const body = data.toString("utf8");
if (!/^\s*\{/.test(body) || !/"(?:error|progress)"/.test(body)) {
if (data.length === 0) throw new Error("API returned an empty media response");
return data;
}
if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 2000));
}
throw new Error("API returned an error instead of media");
}
//=================
async function convertWithApi(url, config, format) {
const headers = {
"user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150.0.0.0 Safari/537.36",
"origin": config.origin,
"referer": `${config.origin}/`,
"accept": "*/*",
"accept-language": "en-US,en;q=0.9",
priority: "u=1, i",
"sec-ch-ua": '"Not;A=Brand";v="8", "Chromium";v="150", "Google Chrome";v="150"',
"sec-ch-ua-mobile": "?0",
"sec-ch-ua-platform": '"Windows"',
"sec-fetch-dest": "empty",
"sec-fetch-mode": "cors",
"sec-fetch-site": "cross-site",
};
try {
const idMatch = url.match(/(?:v=|\/embed\/|\/11\/|\/v\/|https?:\/\/youtu\.be\/)([^"&?\/\s]{11})/);
if (!idMatch) throw new Error("Invalid YouTube URL");
const videoId = idMatch[1];
const buildDownloadUrl = (downloadUrl) => {
const separator = downloadUrl.includes("?") ? "&" : "?";
const referrer = config.downloadReferrer ? `&r=${encodeURIComponent(config.downloadReferrer)}` : "";
return `${downloadUrl}${separator}v=${videoId}&f=${format}${referrer}`;
};
const timestamp = Date.now();
const requestConfig = {headers, timeout: 30000};
const auth = (await axios.get(`https://${config.host}/api/v1/auth?_${timestamp}`, requestConfig)).data;
if (auth.err !== 0 || !auth.key) throw new Error("API auth failed");
const init = (await axios.get(`https://${config.host}/api/v1/init?_${timestamp + 100}`, {
...requestConfig,
headers: {...headers, authorization: `Bearer ${auth.key}`},
})).data;
if (!init.convertURL || init.error !== "0") throw new Error("API init failed");
const first = (await axios.get(`${init.convertURL}&v=${videoId}&f=${format}&_=${timestamp + 200}`, requestConfig)).data;
let downloadURL = first.downloadURL;
if (first.progressURL) {
let completed = false;
for (let attempt = 0; attempt < 100; attempt++) {
const progressUrl = `${first.progressURL}${first.progressURL.includes("?") ? "&" : "?"}_=${timestamp + 300 + attempt}`;
const progress = (await axios.get(progressUrl, requestConfig)).data;
if (progress.error && progress.error !== 0) {
throw new Error(`API conversion failed: ${progress.error}`);
}
if (progress.downloadURL) {
downloadURL = progress.downloadURL;
}
if (progress.progress >= 1 && downloadURL) {
completed = true;
break;
}
await new Promise((resolve) => setTimeout(resolve, 2000));
}
if (!completed) throw new Error("API conversion timed out");
}
if (downloadURL) {
downloadURL = buildDownloadUrl(downloadURL);
let validMedia = null;
const downloadStart = Date.now();
const maxDownloadWait = 10 * 60 * 1000;
let attempt = 0;
while (Date.now() - downloadStart < maxDownloadWait) {
attempt++;
try {
const response = await axios.get(`${downloadURL}${downloadURL.includes("?") ? "&" : "?"}_=${Date.now()}`, {
...requestConfig,
responseType: "arraybuffer",
maxContentLength: Infinity,
maxBodyLength: Infinity,
});
const data = Buffer.from(response.data);
const contentType = response.headers["content-type"] || "";
if (
data.length > 10000 &&
!contentType.includes("application/json") &&
!contentType.includes("text/html")
) {
validMedia = data;
break;
}
} catch (error) {
console.error(`Handler:` , error.message);
}
await new Promise((resolve) => setTimeout(resolve, 2000));
}
if (!validMedia) throw new Error("Download URL timed out or returned incomplete media");
return {
success: true,
title: first.title || "YouTube",
downloadURL,
media: validMedia,
};
}
if (first.redirect === 1 && first.redirectURL) {
let redirectUrl = first.redirectURL.replace(/\u0026/g, "&").replace(/&amp;/g, "&");
if (!redirectUrl.includes("_=")) redirectUrl += `&_=${timestamp + 300}`;
const second = (await axios.get(redirectUrl, requestConfig)).data;
if (second.error === 0 && second.downloadURL) {
downloadURL = buildDownloadUrl(second.downloadURL);
let validMedia = null;
const downloadStart = Date.now();
const maxDownloadWait = 10 * 60 * 1000;
let attempt = 0;
while (Date.now() - downloadStart < maxDownloadWait) {
attempt++;
try {
const response = await axios.get(`${downloadURL}${downloadURL.includes("?") ? "&" : "?"}_=${Date.now()}`, {
...requestConfig,
responseType: "arraybuffer",
maxContentLength: Infinity,
maxBodyLength: Infinity,
});
const data = Buffer.from(response.data);
const contentType = response.headers["content-type"] || "";
if (
data.length > 10000 &&
!contentType.includes("application/json") &&
!contentType.includes("text/html")
) {
validMedia = data;
break;
}
} catch (error) {
console.error(`Handler:` , error.message);
}
await new Promise((resolve) => setTimeout(resolve, 2000));
}
if (!validMedia) throw new Error("Redirect URL timed out or returned incomplete media");
return {
success: true,
title: second.title || "YouTube",
downloadURL,
media: validMedia,
};
}
}
throw new Error("No download URL");
} catch (error) {
return {success: false, error: error.message};
}
}
//=================
const handler = async (m, { conn, isBotAdmins, isAdmins, command, args, text, isAccess, prefix }) => {
if (!text) return m.reply(`-Example: ${prefix + command} (title)`);
try {
await m.reply(mess.wait);
const search = await yts(text);
const vid = search.videos[0];
if (!vid) return m.reply(mess.error);
const thumb = vid.thumbnail || `https://i.ytimg.com/vi/${vid.videoId}/hqdefault.jpg`;
const icon = vid.author?.image || vid.author?.thumbnail || thumb;
const cap = `*⌗ YouTube Play*
> *Title:* ${vid.title}
> *Duration:* ${vid.timestamp}
> *Views:* ${String(vid.views)}
> *Author:* ${vid.author.name}`;
await conn.sendExternalThumb(
m.chat,
{
text: cap,
title: vid.title,
body: `Channel: ${vid.author.name}`,
thumbUrl: thumb,
iconUrl: icon,
sourceUrl: vid.url,
},{ quoted: m });
const output = `./node_modules/.bin/${Date.now()}.mp3`;
const ytdlp = spawn("./node_modules/.bin/yt-dlp", [
"-f",
"bestaudio",
"--extract-audio",
"--audio-format",
"mp3",
"--no-playlist",
"--quiet",
"-o",
output,
vid.url,
]);
let stderr = "";
ytdlp.stderr.on("data", (data) => {
stderr += data.toString();
});
ytdlp.on("close", async (code) => {
try {
if (code === 0 && fs.existsSync(output)) {
await conn.sendMessage(
m.chat,
{
audio: fs.readFileSync(output),
mimetype: "audio/mpeg",
fileName: `${vid.title}.mp3`,
},
{ quoted: m }
);
if (fs.existsSync(output)) fs.unlinkSync(output);
return;
}
if (fs.existsSync(output)) fs.unlinkSync(output);
const configs = [
{label: "Gamma (ytmp3.gl)", host: "gamma.gammacloud.net", origin: "https://ytmp3.gl", downloadReferrer: "ytmp3.gl"},
{label: "Epsilon (convertytmp3.org)", host: "epsilon.epsiloncloud.org", origin: "https://convertytmp3.org", downloadReferrer: "convertytmp3.org"},
];
for (const config of configs) {
const res = await convertWithApi(vid.url, config, "mp3");
if (!res.success || !res.downloadURL) {
console.error(`Handler:` , res.error || "missing download URL");
continue;
}
try {
const media = await downloadApiMedia(res.downloadURL, config);
await conn.sendMessage(
m.chat,
{
audio: media,
mimetype: "audio/mpeg",
fileName: `${res.title || vid.title}.mp3`,
},
{ quoted: m }
);
return;
} catch (error) {
console.error("Handler:", error.message);
}
}
m.reply(mess.error);
} catch (err) {
if (fs.existsSync(output)) fs.unlinkSync(output);
console.error("Handler:", err.message);
m.reply(mess.error);
}
});
} catch (err) {
console.error("Handler:", err.message);
m.reply(mess.error);
}
};
//=================
handler.command = ["play"];
export default handler;