import * as cheerio from "cheerio";
import axios from "axios";
import { spawn } from "child_process";
import fs from "fs";
//=================
class SoundCloudDownloader {
constructor() {
this.baseUrl = 'https://api-mobi.soundcloud.com';
this.headers = {
'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
'Origin': 'https://m.soundcloud.com',
'Referer': 'https://m.soundcloud.com/',
'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8'
};
this.clientId = null;
}
async fetchClientId() {
try {
const response = await axios.get('https://m.soundcloud.com/', { headers: this.headers });
const $ = cheerio.load(response.data);
const nextDataText = $('#__NEXT_DATA__').html();
if (!nextDataText) throw new Error();
const nextData = JSON.parse(nextDataText);
const cid = nextData.props?.pageProps?.runtimeConfig?.clientId || nextData.runtimeConfig?.clientId;
if (!cid) throw new Error();
this.clientId = cid;
return this.clientId;
} catch {
throw new Error();
}
}
async search(judul) {
try {
if (!this.clientId) await this.fetchClientId();
const searchResponse = await axios.get(`${this.baseUrl}/search`, {
headers: this.headers,
params: { q: judul, client_id: this.clientId, stage: '' }
});
const collection = searchResponse.data.collection;
if (!collection || collection.length === 0) throw new Error();
const trackData = collection.find(item => item.kind === 'track');
if (!trackData) throw new Error();
const hlsMedia = trackData.media.transcodings.find(
t => t.format.protocol === 'hls' && (t.preset.includes('160k') || t.preset.includes('hq'))
) || trackData.media.transcodings.find(t => t.format.protocol === 'hls') || trackData.media.transcodings[0];
if (!hlsMedia) throw new Error();
const streamResponse = await axios.get(hlsMedia.url, {
headers: this.headers,
params: {
client_id: this.clientId,
track_authorization: trackData.track_authorization,
stage: ''
}
});
const highResArtwork = trackData.artwork_url 
? trackData.artwork_url.replace('-large.', '-t500x500.') 
: trackData.user?.avatar_url?.replace('-large.', '-t500x500.') || null;
const minutes = Math.floor(trackData.duration / 60000);
const seconds = ((trackData.duration % 60000) / 1000).toFixed(0);
const timestamp = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
return {
status: true,
data: {
title: trackData.title,
timestamp: timestamp,
views: trackData.playback_count || 0,
author: { name: trackData.user.username },
url: trackData.permalink_url,
thumbnail: highResArtwork,
avatar: trackData.user.avatar_url,
streamUrl: streamResponse.data.url
}
};
} catch {
this.clientId = null;
return { status: false };
}
}
}
const sc = new SoundCloudDownloader();
//=================
const handler = async (m, { conn, isBotAdmins, isAdmins, command, args, text, isAccess, prefix }) => {
if (!text) return m.reply(`-Example: ${prefix + command} (title)`);
try {
await m.reply(mess.wait);
const res = await sc.search(text);
if (!res.status) return m.reply(mess.error);
const vid = res.data;
const thumb = vid.thumbnail || `https://i.ytimg.com/vi/default/hqdefault.jpg`;
const icon = vid.avatar || thumb;
const cap = `*⌗ SoundCloud Play*
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
const ffmpeg = spawn("ffmpeg", [
"-i", vid.streamUrl,
"-c:a", "libmp3lame",
"-b:a", "128k",
"-y",
output
]);
ffmpeg.on("close", async (code) => {
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
handler.command = ["scloud"];
export default handler;
