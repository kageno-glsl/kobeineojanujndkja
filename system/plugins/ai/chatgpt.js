import axios from "axios";
import fs from "fs-extra";
import crypto from "crypto";
//=================
class ChatGPTClient {
constructor() {
this.cookies = {
_playintegrity: `Ai-native_Engineer:${Math.floor(Date.now() / 1000)}-kagenonchalant`,
"oai-sc": null, __cf_bm: null, __cflb: null, _cfuvid: null
};
this.tokens = { conduit: null, conduitExp: 0, sentinel: null, sentinelExp: 0 };
this.session = { convoId: null, parentId: null };
}
uid() {
return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => (c === "x" ? Math.random() * 16 | 0 : Math.random() * 4 | 8).toString(16));
}
headers(extra = {}) {
const cookie = Object.entries(this.cookies).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join("; ");
return {
"user-agent": "ChatGPT/1.2026.111 (Android 15; 23127PN0CC; build 2611126)",
"oai-package-name": "com.openai.chatgpt",
"oai-client-type": "android",
"oai-device-id": "KageTampanMenawan",
"accept-language": "en-GB,en;q=0.9",
"content-type": "application/json",
"x-oai-convo-session-id": this.uid(),
"x-oai-turn-trace-id": this.uid(),
...(cookie && { cookie }), ...extra
};
}
saveCookies(hdrs) {
const raw = hdrs["set-cookie"] || [];
for (const c of Array.isArray(raw) ? raw : [raw]) {
if (!c) continue;
const [k, v] = c.split(";")[0].split("=");
if (k.trim() in this.cookies) this.cookies[k.trim()] = v.trim();
}
}
async sentinel() {
const now = Date.now() / 1000;
if (this.tokens.sentinel && now < this.tokens.sentinelExp - 30) return this.tokens.sentinel;
const res = await axios.post("https://android.chat.openai.com/backend-anon/sentinel/chat-requirements", {}, {
headers: this.headers({ accept: "application/json", "x-openai-target-path": "/backend-anon/sentinel/chat-requirements" })
});
this.saveCookies(res.headers);
this.tokens.sentinel = res.data.token;
this.tokens.sentinelExp = res.data.expire_at || (now + 540);
return this.tokens.sentinel;
}
async conduit(sp) {
const now = Date.now() / 1000;
if (this.tokens.conduit && now < this.tokens.conduitExp - 10) return this.tokens.conduit;
const res = await axios.post("https://android.chat.openai.com/backend-anon/f/conversation/prepare", {
action: "next", messages: [], model: "auto", supported_encodings: ["v1"], supports_buffering: true,
timezone: "Asia/Kuala_Lumpur", timezone_offset_min: -480,
...(this.session.convoId && { conversation_id: this.session.convoId }),
...(this.session.parentId && { parent_message_id: this.session.parentId })
}, {
headers: this.headers({ accept: "application/json", "x-sentinel-payload": sp, "x-openai-target-path": "/backend-anon/f/conversation/prepare" })
});
this.saveCookies(res.headers);
this.tokens.conduit = res.data.conduit_token;
this.tokens.conduitExp = now + 3600;
return this.tokens.conduit;
}
async chat(prompt) {
const sp = JSON.stringify({ bot_token: { play_integrity_token: "kyahh", chat_requirement_token: await this.sentinel() } });
const ct = await this.conduit(sp);
const res = await axios.post("https://android.chat.openai.com/backend-anon/f/conversation", {
action: "next",
messages: [
{
id: this.uid(),
author: { role: "user" },
content: { parts: [prompt], content_type: "text" },
status: "finished_successfully",
recipient: "all"
}
],
model: "auto", enable_message_followups: true, force_use_sse: true, supported_encodings: ["v1"], supports_buffering: true,
timezone: "Asia/Kuala_Lumpur", timezone_offset_min: -480, stream: true,
...(this.session.convoId && { conversation_id: this.session.convoId }),
...(this.session.parentId && { parent_message_id: this.session.parentId })
}, {
headers: this.headers({ accept: "text/event-stream,application/json", "cache-control": "no-cache", "x-sentinel-payload": sp, "x-conduit-token": ct, "x-openai-target-path": "/backend-anon/f/conversation" }),
responseType: "stream"
});
this.saveCookies(res.headers);
if (res.headers["x-conduit-token"]) { this.tokens.conduit = res.headers["x-conduit-token"]; this.tokens.conduitExp = Date.now() / 1000 + 3600; }
return new Promise((resolve, reject) => {
let txt = "", buf = "";
const meta = { model: "unknown", plan: "guest" };
res.data.on("data", chunk => {
buf += chunk.toString();
const lines = buf.split("\n");
buf = lines.pop();
for (const line of lines) {
if (!line.startsWith("data:")) continue;
const raw = line.slice(5).trim();
if (!raw || raw === "[DONE]") continue;
try {
const j = JSON.parse(raw);
if (j.o === "patch" && Array.isArray(j.v)) {
for (const p of j.v) if (p.p?.includes("parts/0")) txt = p.o === "append" ? txt + (p.v ?? "") : (p.v ?? "");
} else if (j.p?.includes("parts/0")) {
txt = j.o === "append" ? txt + (j.v ?? "") : (Array.isArray(j.v) ? (j.v[0] ?? "") : (j.v ?? ""));
} else if (typeof j.v === "string" && !j.p) {
txt += j.v;
}
if (j.conversation_id) this.session.convoId = j.conversation_id;
if (j.v?.message?.id && j.v?.message?.author?.role === "assistant") this.session.parentId = j.v.message.id;
if (j.type === "server_ste_metadata") {
meta.model = j.metadata?.model_slug ?? "unknown";
meta.plan = j.metadata?.plan_type ?? "guest";
}
} catch {}
}
});
res.data.on("end", () => {
let cleanText = txt.replace(/[\s\S]*?[\s\S]*?/g, "");
cleanText = cleanText.replace(/[\s\S]*?/g, "");
cleanText = cleanText.replace(/[]/g, "");
resolve({ text: cleanText.trim(), meta });
});
res.data.on("error", reject);
});
}
reset() {
this.session = { convoId: null, parentId: null };
this.tokens.conduit = null;
this.tokens.conduitExp = 0;
}
}
//=================
const handler = async (m, { conn, isBotAdmins, isAdmins, command, args, text, isAccess, prefix }) => {
if (!text) return m.reply(`-Example: ${prefix + command} (text)`);
await m.reply(mess.wait);
try {
const chatgpt = new ChatGPTClient();
const result = await chatgpt.chat(text);
if (!result.text) return m.reply(mess.error);
await conn.sendMessage(m.chat, { text: result.text }, {
quoted: {
key: { fromMe: false, participant: "0@s.whatsapp.net", remoteJid: "0@s.whatsapp.net" },
message: { orderMessage: { orderId: "65bh4ddqr90", thumbnail: fs.readFileSync("./system/media/chatgpt.jpg"), itemCount: 999, status: "INQUIRY", surface: "CATALOG", orderTitle: "product", message: "ᴄʜᴀᴛɢᴘᴛ.ᴄᴏᴍ/ᴀᴘᴘ", sellerJid: m.sender, token: "775BBQR0", totalAmount1000: 777, totalCurrencyCode: "MYR", contextInfo: { mentionedJid: [m.sender] } } }}});
} catch (err) {
console.error("Handler:", err.message);
return m.reply(mess.error);
}
};
//=================
handler.command = ["chatgpt"];
export default handler;
