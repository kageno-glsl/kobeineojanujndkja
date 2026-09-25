import axios from "axios";
import * as cheerio from "cheerio";
//=================
async function mediafire(url) {
try {
const { data } = await axios.get(url, {
headers: {
"User-Agent": "Mozilla/5.0"
},
timeout: 20000
});
const $ = cheerio.load(data);
const downloadLink =
$("a#downloadButton").attr("href") ||
$("a.popsok").attr("href") ||
$('a[aria-label="Download file"]').attr("href");
const fileName =
$("div.filename").text().trim() ||
$("a#downloadButton").text().trim() ||
"mediafire_file";
const fileSize =
$("div.details")
.first()
.text()
.trim()
.split("\n")[0] ||
"-";
if (
!downloadLink ||
!downloadLink.startsWith("https://download")
) {
return null;
}
return {
url: downloadLink,
name: fileName || "mediafire_file",
size: fileSize
};
} catch (e) {
console.error("Handler:" ,
e?.response?.data || e.message
);
return null;
}
}
//=================
async function downloadFile(url) {
try {
const response = await axios.get(url, {
headers: {
"User-Agent": "Mozilla/5.0"
},
responseType: "arraybuffer",
timeout: 120000,
maxRedirects: 10
});
return Buffer.from(response.data);
} catch (e) {
console.error("Handler:" ,
e?.response?.data || e.message
);
return null;
}
}
//=================
function getFileName(info) {
let name = String(info?.name || "").trim();
if (name) {
return name;
}
try {
const parsed = new URL(info.url);
const pathname = decodeURIComponent(parsed.pathname);
const lastPart =
pathname.split("/").filter(Boolean).pop();
if (lastPart) {
return lastPart;
}
} catch {}
return "mediafire_file";
}
//=================
const handler = async (
m,
{ conn, command, text, prefix }
) => {
try {
if (!text) {
return m.reply(
`-Example: ${prefix + command} (link)`
);
}
await m.reply(mess.wait);
const result =
await mediafire(text.trim());
if (!result) {
return m.reply(mess.error);
}
const buffer =
await downloadFile(result.url);
if (
!buffer ||
!Buffer.isBuffer(buffer) ||
!buffer.length
) {
return m.reply(mess.error);
}
const fileName =
getFileName(result);
await conn.sendMessage(
m.chat,
{
document: buffer,
fileName: fileName,
mimetype: "application/octet-stream",
caption: `*⌗ MediaFire Download*
> *Name:* ${fileName}
> *Size:* ${result.size || "-"}`
},
{
quoted: m
}
);
} catch (e) {
console.error(
"Handler:",
e.message
);
m.reply(mess.error);
}
};
//=================
handler.command = ["mediafire"];
export default handler;