
import axios from "axios";
import FormData from "form-data";
//=================
async function removeBg(buffer) {
try {
const base64 = buffer.toString("base64");
const form = new FormData();
form.append(
"image",
`data:image/png;base64,${base64}`
);
const res = await axios.post(
"https://ai-api.magicstudio.com/api/remove-background",
form,
{
headers: {
...form.getHeaders(),
Origin: "https://magicstudio.com",
Referer: "https://magicstudio.com/remove-background/"
},
timeout: 60000
}
);
return res.data;
} catch (err) {
console.error("Handler:" ,
err?.response?.data || err.message
);
return null;
}
}
//=================
const handler = async (
m,
{ conn, command, prefix }
) => {
try {
if (
!m.quoted ||
!m.quoted.mimetype ||
!/^image\//.test(m.quoted.mimetype)
) {
return m.reply(
`-Example: Reply Image ${prefix + command}`
);
}
await m.reply(mess.wait);
const buffer = await m.quoted.download();
if (
!buffer ||
!Buffer.isBuffer(buffer) ||
!buffer.length
) {
return m.reply(mess.error);
}
const result = await removeBg(buffer);
if (
!result ||
result.status !== "success" ||
!Array.isArray(result.results) ||
!result.results.length
) {
console.error("Handler:" ,
result
);
return m.reply(mess.error);
}
const imageUrl =
result.results[0]?.image ||
result.results[0]?.preview_image;
if (!imageUrl) {
return m.reply(mess.error);
}
const cleanUrl = imageUrl
.replace(/^\[|\]$/g, "")
.replace(/\((.*?)\)$/g, "$1");
const markdownMatch =
imageUrl.match(
/^\[(https?:\/\/[^\]]+)\]\((https?:\/\/[^)]+)\)$/
);
const finalUrl =
markdownMatch
? markdownMatch[2]
: cleanUrl;
await conn.sendMessage(
m.chat,
{
image: {
url: finalUrl
},
caption: `*⌗ Remove Background*
> *Status:* Success`
},
{
quoted: m
}
);
} catch (err) {
console.error(
"Handler:",
err.message
);
m.reply(mess.error);
}
};
//=================
handler.command = ["removebg"];
export default handler;