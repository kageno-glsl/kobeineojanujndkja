import crypto from "node:crypto";
import fs from "fs-extra";
import axios from "axios";
//=================
class TakoClient {
constructor() {
this.cookies = {
'store-idc': 'alisg',
'store-country-code': 'my',
'sid_guard': '69bad22b4d6edfbd8cbce9ec82ae70fe%7C1782573726%7C15551999%7CThu%2C+24-Dec-2099+15%3A22%3A05+GMT'
};
}
cleanText(text) {
if (!text) return text;
return text
.replace(/<[^>]+>/gs, '')
.replace(/<data-\w+[^>]*>.*?<\/data-\w+>/gs, '')
.replace(/&quot;/g, '"')
.replace(/&amp;/g, '&')
.replace(/&lt;/g, '<')
.replace(/&gt;/g, '>')
.replace(/&apos;/g, "'")
.replace(/&#39;/g, "'")
.replace(/\*/g, '') 
.replace(/\n\n+/g, '\n\n')
.split('\n')
.map(line => line.trim())
.filter(line => line.length > 0)
.join('\n')
.trim();
}
generateDynamicToken() {
const prefixPayload = "03e10ee26165e4bd3221bbd98679972f480157d2"; 
const randomPayloadBody = crypto.randomBytes(67).toString('hex');
return `${prefixPayload}${randomPayloadBody}--KageVibeCoder`;
}
getCookieString() {
return Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
}
getHeaders(currentTimestamp, token) {
return {
'host': 'tako22-normal-alisg.tiktokv.com',
'cookie': this.getCookieString(),
'x-ss-req-ticket': currentTimestamp,
'x-tt-token': token,
'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
'user-agent': 'com.ss.android.ugc.trill/440503 (Linux; U; Android 15; en_GB; 23127PN0CC; Build/BP1A.250505.005; Cronet/TTNetVersion:b18ffdba 2026-03-04 QuicVersion:3679867a 2026-02-06)',
'accept-encoding': 'gzip, deflate, br',
'x-gorgon': '8404307e0000746c07924948343e3f68619db67ad43c4adfd903',
'x-khronos': '1782574292'
};
}
async chat(prompt, options = {}) {
try {
const dynamicToken = this.generateDynamicToken();
const currentTimestamp = "1782574313607";
const currentUnixSec = 1782574333;
const randomUuid = crypto.randomUUID();
const msgContentObj = {text: prompt};
const payload = new URLSearchParams();
payload.append('op_type', '1');
payload.append('uuid', randomUuid);
payload.append('msg_id', '');
payload.append('msg_type', '1');
payload.append('msg_content', JSON.stringify(msgContentObj));
payload.append('bot_id', '1');
payload.append('bot_source', '1');
payload.append('enable_deep_search', 'false');
const apiUrl = `https://tako22-normal-alisg.tiktokv.com/aweme/v1/tako/op/stream/?device_platform=android&os=android&ssmix=a&_rticket=1782574313598&channel=googleplay&aid=1180&app_name=trill&version_code=440503&version_name=44.5.3&manifest_version_code=440503&update_version_code=440503&ab_version=44.5.3&resolution=720*1600&dpi=281&device_type=23127PN0CC&device_brand=Xiaomi&language=en&os_api=35&os_version=15&ac=wifi&is_pad=0&app_type=normal&sys_region=GB&last_install_time=1782573370&timezone_name=Asia%2FKuala_Lumpur&app_language=en&timezone_offset=28800&host_abi=arm64-v8a&locale=en-GB&ac2=unknown&uoo=0&op_region=MY&build_number=44.5.3&region=GB&ts=${currentUnixSec}&iid=7623820063082530568&device_id=7570082692370843144`;
const response = await axios({
method: 'POST',
url: apiUrl,
headers: this.getHeaders(currentTimestamp, dynamicToken),
data: payload.toString(),
responseType: 'stream'
});
return new Promise((resolve, reject) => {
let finalMessage = "";
let bufferStr = "";
let collectedVideos = [];
let collectedImages = [];
let responseType = "text"; 
let metadata = {};
let logId = "";
let cardTypeDetected = false; 
response.data.on('data', (chunk) => {
bufferStr += chunk.toString('utf8');
const jsonLines = bufferStr.match(/\{"status_code":.+?\}(?=\s*(\{|$))/gs);
if (jsonLines) {
jsonLines.forEach(line => {
try {
const cleanLine = line.substring(line.indexOf('{'));
const parsed = JSON.parse(cleanLine);
if (parsed.extra?.log_id) logId = parsed.extra.log_id;
if (parsed.server_process_info) {
metadata.latency = {
server_chunk_latency: parsed.server_process_info.server_chunk_latency,
engine_chunk_latency: parsed.server_process_info.engine_chunk_latency,
server_e2e_latency: parsed.server_process_info.server_e2e_latency,
biz_state_code: parsed.server_process_info.biz_state_code,
hit_engine_cache: parsed.server_process_info.hit_engine_cache,
use_engine_search: parsed.server_process_info.use_engine_search,
bot_intent: parsed.server_process_info.bot_intent
};
}
if (parsed.msg_content_patch?.patch) {
parsed.msg_content_patch.patch.forEach(p => {
if (p.field === 'card_type' && !cardTypeDetected) {
try {
const cardTypeVal = JSON.parse(p.value);
const cType = cardTypeVal.card_type;
if (cType === 301) {
responseType = "image_generation";
cardTypeDetected = true;
} else if (cType === 51) {
responseType = "video_search";
cardTypeDetected = true;
}
} catch(e) {}
}
if (p.field === 'pics' && p.op === 'add') {
try {
const parsedPics = JSON.parse(p.value);
if (parsedPics && Array.isArray(parsedPics.pics)) {
parsedPics.pics.forEach(img => {
collectedImages.push({
image_id: img.image_id,
url: img.url_list?.[0] || null,
uri: img.uri
});
});
}
} catch(e) {}
}
if (p.field === 'sources' && p.op === 'add') {
try {
const parsedSources = JSON.parse(p.value);
if (parsedSources && Array.isArray(parsedSources.sources)) {
parsedSources.sources.forEach(src => {
if (src.item) {
collectedVideos.push({
rank: src.rank,
id: src.item.aweme_id,
description: src.item.desc,
author: {
id: src.item.user?.user_id,
nickname: src.item.user?.nickname,
avatar: src.item.user?.avatar?.url_list?.[0]
},
cover_url: src.item.cover?.url_list?.[0],
digg_count: src.item.digg_count,
create_time: src.item.create_time,
video_url: `https://www.tiktok.com/@${src.item.user?.nickname}/video/${src.item.aweme_id}`
});
}
});
}
} catch(e) {}
}
if (p.field === 'text' && (p.op === 'add' || p.op === 'replace')) {
if (p.value.includes('<data-inline')) return;
if (responseType === "image_generation") return;
try {
const textObj = JSON.parse(p.value);
if (textObj && textObj.text) finalMessage += textObj.text;
} catch (e) {
if (!p.value.startsWith('{')) finalMessage += p.value;
}
}
});
}
} catch (err) {}
});
const lastMatch = bufferStr.lastIndexOf(jsonLines[jsonLines.length - 1]);
if (lastMatch !== -1) {
bufferStr = bufferStr.substring(lastMatch + jsonLines[jsonLines.length - 1].length);
}
}
});
response.data.on('end', () => {
const cleanMessage = this.cleanText(finalMessage);
if (responseType === "video_search" && collectedVideos.length === 0) {
responseType = "text";
}
const output = {
status: "success",
type: responseType,
metadata: {
log_id: logId,
...metadata
}
};
if (responseType === "image_generation") {
output.data = {
prompt: prompt,
images: collectedImages
};
} else if (responseType === "video_search") {
output.data = {
query_search: prompt,
ai_response: cleanMessage,
total_results: collectedVideos.length,
videos: collectedVideos
};
} else {
output.data = {
message: cleanMessage
};
}
resolve(output);
});
response.data.on('error', () => reject(new Error('Stream error encountered')));
});
} catch (error) {
throw new Error(error.response ? `API Error: ${error.response.status}` : 'Network missing / Signature Expired');
}
}
}
//=================
const handler = async (m, { conn, isBotAdmins, isAdmins, command, args, text, isAccess, prefix }) => {
if (!text) return m.reply(`-Example: ${prefix + command} (text)`);
await m.reply(mess.wait);
try {
const tako = new TakoClient();
const result = await tako.chat(text, { deepSearch: false });
if (!result || result.status !== "success") {
return m.reply(mess.error);
}
if (result.type === "image_generation" && result.data?.images?.length > 0) {
const firstImg = result.data.images[0];
const imgUrl = firstImg.url || `https://p16-va.tiktokcdn.com/obj/${firstImg.uri}`;
return await conn.sendMessage(m.chat, {
image: { url: imgUrl },
caption: `*⌗ Tako AI*
> *Prompt:* ${text}`
}, { quoted: m });
}
if (result.type === "video_search" && result.data?.videos?.length > 0) {
const aiResponse = result.data.ai_response;
let videoListText = `\n`;
result.data.videos.slice(0, 5).forEach((vid, index) => {
const safeUrl = encodeURI(vid.video_url);
videoListText += `\n${index + 1}. ${vid.author.nickname}\n${vid.description.slice(0, 60)}...\n${safeUrl}\n`;
});
const finalCaption = `${aiResponse}${videoListText}`;
return await m.reply(finalCaption);
}
if (result.data?.message) {
return await conn.sendMessage(m.chat, { text: result.data.message }, {
quoted: {
key: { fromMe: false, participant: "0@s.whatsapp.net", remoteJid: "0@s.whatsapp.net" },
message: {
orderMessage: {
orderId: "65bh4ddqr90",
thumbnail: fs.readFileSync("./system/media/tako.jpg"),
itemCount: 999,
status: "INQUIRY",
surface: "CATALOG",
orderTitle: "product",
message: "ᴛɪᴋᴛᴏᴋ.ᴄᴏᴍ/ᴛᴀᴋᴏ",
sellerJid: m.sender,
token: "775BBQR0",
totalAmount1000: 777,
totalCurrencyCode: "MYR",
contextInfo: { mentionedJid: [m.sender] }
}
}
}
});
}
return m.reply(mess.error);
} catch (err) {
console.error("Handler:", err.message);
return m.reply(mess.error);
}
};
//=================
handler.command = ["tako"];
export default handler;
