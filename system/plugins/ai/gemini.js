import axios from "axios";
import fs from "fs-extra";
//=================
class GeminiClient {
headers(extra = {}) {
return {
"host": "gemini.google.com",
"content-type": "application/x-www-form-urlencoded;charset=UTF-8",
"user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
...extra
};
}
async chat(prompt) {
const url = `https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?bl=boq_assistant-bard-web-server_20260618.10_p0&hl=en-US&rt=c`; 
const innerStructure = [
[prompt, 0, null, null, null, null, 0], null,
["", "", "", null, null, null, null, null, null, ""],
null, null, null, [1], 1, null, null, 1, 0, null, null, null, null, null, [[0]], 0, null, null, null, null, null, null, null, null, 1, null, null, [4], null, null, null, null, null, null, null, null, null, null, [2], null, null, null, null, null, null, null, null, null, null, null, 0, null, null, null, null, null, null, null, [], null, null, null, null, null, null, 2, null, null, null, null, null, null, null, null, null, null, 1
];
const res = await axios.post(url, `f.req=${encodeURIComponent(JSON.stringify([null, JSON.stringify(innerStructure)]))}`, {
headers: this.headers(), 
responseType: "stream"
});
return new Promise((resolve, reject) => {
let fullText = "", buf = "";
res.data.on("data", chunk => {
buf += chunk.toString();
const lines = buf.split("\n");
buf = lines.pop();
for (let line of lines) {
line = line.trim();
if (!line || /^\d+$/.test(line)) continue;
try {
const parsedLine = JSON.parse(line);
if (!Array.isArray(parsedLine)) continue;
for (const item of parsedLine) {
if (Array.isArray(item) && item[0] === "wrb.fr" && typeof item[2] === "string") {
const innerData = JSON.parse(item[2]);
if (!Array.isArray(innerData)) continue;
const candidates = Array.isArray(innerData[4]) ? innerData[4] : Array.isArray(innerData[5]) ? innerData[5] : [];
for (const cand of candidates) {
if (Array.isArray(cand) && typeof cand[0] === "string" && cand[0].startsWith("rc_")) {
const text = cand?.[1]?.[0] || cand?.[1]?.join?.("") || "";
if (typeof text === "string" && text.length > fullText.length) fullText = text;
}
}
}
}
} catch {}
}
});
res.data.on("end", () => resolve({ text: fullText.trim() || null }));
res.data.on("error", reject);
});
}
}
//=================
const handler = async (m, { conn, isBotAdmins, isAdmins, command, args, text, isAccess, prefix }) => {
if (!text) return m.reply(`-Example: ${prefix + command} (text)`);
await m.reply(mess.wait);
try {
const gemini = new GeminiClient();
const result = await gemini.chat(text);
if (!result.text) {
return m.reply(mess.error);
}
await conn.sendMessage(m.chat,{ text: result.text }, { quoted: {
key: { fromMe: false, participant: "0@s.whatsapp.net", remoteJid: "0@s.whatsapp.net"},
message: { orderMessage: { orderId: "65bh4ddqr90", thumbnail: fs.readFileSync("./system/media/gemini.jpg"), itemCount: 999, status: "INQUIRY", surface: "CATALOG", orderTitle: "product", message: "ɢᴇᴍɪɴɪ.ɢᴏᴏɢʟᴇ.ᴄᴏᴍ/ᴀᴘᴘ", sellerJid: m.sender, token: "775BBQR0", totalAmount1000: 777, totalCurrencyCode: "MYR", contextInfo: { mentionedJid: [m.sender] } } } } })
} catch (err) {
console.error("Handler:", err.message);
return m.reply(mess.error);
}
};
//=================
handler.command = ["gemini"];
export default handler;
