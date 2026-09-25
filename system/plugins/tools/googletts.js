import axios from "axios";
//=================
const handler = async (m, { conn, isBotAdmins, isAdmins, command, args, text, isAccess, prefix }) => {
if (!text) {
return m.reply(`-Example: ${prefix + command} (text)`);
}
try {
await m.reply(mess.wait);
let lang = "id";
let ttsText = text;
const args = text.split(" ");
if (args[0].length === 2) {
lang = args[0].toLowerCase();
ttsText = args.slice(1).join(" ");
}
if (ttsText.length > 200) {
return m.reply(mess.wrong);
}
if (!ttsText) {
return m.reply(`-Example: ${prefix + command} (text)`);
}
const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${lang}&client=tw-ob&q=${encodeURIComponent(ttsText)}`;
const response = await axios.get(url, { responseType: "arraybuffer" });
await conn.sendMessage(
m.chat,
{
audio: Buffer.from(response.data),
mimetype: "audio/mpeg",
},
{ quoted: m },
);
} catch (error) {
console.error("Handler:", error.message);
m.reply(mess.error);
}
};
//=================
handler.command = ["gtts"];
export default handler;
