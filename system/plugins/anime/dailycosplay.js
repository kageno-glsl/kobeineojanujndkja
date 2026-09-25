import axios from "axios";
import * as cheerio from "cheerio";
//=================
async function getRandomCosplay() {
try {
const home = await axios.get(
"https://cosplaydaily.com/",
{
headers: {
"User-Agent":
"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0 Safari/537.36"
},
timeout: 15000
}
);
const $ = cheerio.load(home.data);
const pages = [];
$(".calendar .day.active").each(
(_i, el) => {
const href = $(el).attr("href");
if (href?.startsWith("/")) {
pages.push(
`https://cosplaydaily.com${href}`
);
}
}
);
if (!pages.length) {
return null;
}
const randomPage =
pages[
Math.floor(
Math.random() * pages.length
)
];
const { data } =
await axios.get(
randomPage,
{
headers: {
"User-Agent":
"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0 Safari/537.36"
},
timeout: 15000
}
);
const $$ = cheerio.load(data);
const images = [];
$$("script").each(
(_i, el) => {
const t = $$(el).html();
if (!t) return;
if (
t.includes("window.__IMAGES__")
) {
const match = t.match(
/window\.__IMAGES__\s*=\s*(\[.*?\]);/s
);
if (!match?.[1]) return;
try {
const arr =
JSON.parse(match[1]);
arr.forEach(
(img) => {
if (!img?.large) {
return;
}
const full =
new URL(
img.large,
randomPage
).href;
images.push(full);
}
);
} catch {
return;
}

}
}
);
//=================
if (!images.length) {
return null;
}
return images[
Math.floor(
Math.random() * images.length
)
];
} catch (err) {
console.error("Handler:" ,
err?.response?.data ||
err.message
);
return null;
}
}
//=================
const handler = async (
m,
{ conn, command }
) => {
try {
await m.reply(mess.wait);
const imageUrl =
await getRandomCosplay();
if (!imageUrl) {
return m.reply(mess.error);
}
await conn.sendMessage(
m.chat,
{
image: {
url: imageUrl
},
caption:
`*⌗ Cosplayer*
> *Status:* Random Cosplay`
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
handler.command = ["cosplayer"];
export default handler;