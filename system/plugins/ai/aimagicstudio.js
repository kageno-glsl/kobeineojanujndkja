import axios from "axios";
import FormData from "form-data";
//==================
async function aiIMGGenerator(prompt) {
try {
const form = new FormData();
form.append("prompt", prompt);
const response = await axios.post(
"https://ai-api.magicstudio.com/api/ai-art-generator",
form,
{
headers: {
...form.getHeaders(),
"Accept": "application/json",
"Origin": "https://magicstudio.com",
"Referer": "https://magicstudio.com/ai-art-generator/",
"User-Agent": "Mozilla/5.0"
},
responseType: "arraybuffer"
}
);
return {
status: true,
buffer: Buffer.from(response.data)
};
} catch (err) {
return {
status: false,
error: err.message
};
}
}
//==================
const handler = async (m, { conn, command, text, prefix }) => {
if (!text) return m.reply(`-Example: ${prefix + command} (text)`);
try {
m.reply(mess.wait)
const result = await aiIMGGenerator(text);
if (!result.status || !result.buffer) {
return m.reply(mess.error);
}
await conn.sendMessage(
m.chat,
{
image: result.buffer,
caption: 
`*⌗ MagicStudio AI*
> *Prompt:* ${text}`
},
{ quoted: m }
);
} catch (err) {
console.error("Handler:" , err.message);
m.reply(mess.error);
}
};
//==================
handler.command = ["text2img"];
export default handler;