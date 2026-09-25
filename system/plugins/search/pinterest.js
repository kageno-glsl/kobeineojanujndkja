
import axios from "axios";
//=================
async function scrapePinterest(query, limit = 10) {
try {
const url = "https://www.pinterest.com/resource/BaseSearchResource/get/";
const results = [];
let bookmark = null;
let maxIter = 0;
limit = Math.min(Math.max(Number(limit) || 10, 1), 10);
while (results.length < limit && maxIter < 5) {
maxIter++;
const payload = {
options: {
query,
scope: "pins",
page_size: 50,
bookmarks: bookmark ? [bookmark] : []
},
context: {}
};
const { data } = await axios.get(url, {
params: {
source_url: `/search/pins/?q=${encodeURIComponent(query)}`,
data: JSON.stringify(payload)
},
headers: {
"user-agent": "Mozilla/5.0",
"x-pinterest-pws-handler": "www/search/[scope].js"
},
timeout: 15000
});
const pins = data?.resource_response?.data?.results || [];
for (const pin of pins) {
const image =
pin.images?.orig?.url ||
pin.images?.["736x"]?.url ||
pin.images?.["474x"]?.url ||
pin.images?.["236x"]?.url ||
pin.images?.["170x"]?.url;
if (!image) continue;
results.push({
id: pin.id,
title: pin.title || pin.grid_title || "",
image,
link: `https://www.pinterest.com/pin/${pin.id}/`,
created_at: pin.created_at || null,
pinner: {
id: pin.pinner?.id || null,
username: pin.pinner?.username || null,
full_name: pin.pinner?.full_name || null
}
});
if (results.length >= limit) break;
}
bookmark = data?.resource_response?.bookmark || null;
if (!bookmark) break;
}
for (let i = results.length - 1; i > 0; i--) {
const j = Math.floor(Math.random() * (i + 1));
[results[i], results[j]] = [results[j], results[i]];
}
return {
status: true,
data: results.slice(0, limit)
};
} catch (e) {
console.error("Handler:" , e?.response?.data || e.message);
return {
status: false,
data: []
};
}
}
const handler = async (m, { conn, command, args, text, prefix }) => {
try {
if (!text) return m.reply(`-Example: ${prefix + command} (text)`);
await m.reply(mess.wait);
try {
const query = text.trim();
const result = await scrapePinterest(query, 10);
if (!result?.status || !result?.data?.length) {
return m.reply(mess.error);
}
const pins = result.data;
const medias = pins.map((pin, i) => ({
image: pin.image,
caption: `*⌗ Pinterest Search*
> *Title:* ${pin.title || "-"}
> *Pinner:* ${pin.pinner?.username ? `@${pin.pinner.username}` : "-"}
> *Created:* ${pin.created_at || "-"}
> *Result:* ${i + 1}/${pins.length}
> *ID:* ${pin.id}`.trim()
}));
await conn.sendAlbum(
m.chat,
medias,
`*⌗ Pinterest Search*
> *Query:* ${query}
> *Results:* ${pins.length}`,
m
);
} catch (err) {
console.error("Handler:", err.message);
m.reply(mess.error);
}
} catch (err) {
console.error("Handler:", err.message);
m.reply(mess.error);
}
};
//=================
handler.command = ["pinterest"];
export default handler;
