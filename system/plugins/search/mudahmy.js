
import axios from "axios";
//=================
const fetchBuffer = async (url) => {
try {
const res = await axios.get(url, {
headers: {
"User-Agent": "Mozilla/5.0",
"Accept": "image/avif,image/webp,image/apng,image/*,*/*"
},
responseType: "arraybuffer",
timeout: 15000
});
return Buffer.from(res.data);
} catch (e) {
console.error("Handler:" , e.message);
return null;
}
};
//=================
async function searchMudahMy(query) {
try {
const baseUrl =
"https://search.mudah.my/v1/search/include/featured";
const headers = {
"user-agent":
"UAAPK2410; SDK35; a5b4f0df1e29ba3f; houji REL v15; 175.141.46.138 23127PN0CC Xiaomi;",
"device_id": "a5b4f0df1e29ba3f",
"accept": "application/json",
"content-type": "application/json"
};
const params = {
q: query,
from: 0,
limit: 50
};
const response = await axios.get(
baseUrl,
{
headers,
params,
timeout: 15000
}
);
if (!Array.isArray(response.data?.data)) {
return {
status: false,
data: null
};
}
const results = response.data.data
.map((ad) => {
const attr = ad?.attributes || {};
return {
id: ad?.id || null,
title:
attr.subject ||
"-",
price:
attr.price ??
null,
oldPrice:
attr.old_price ||
null,
priceLabel:
attr.price_label ||
"-",
brand:
attr.phone_brand_name ||
null,
category:
attr.category_name ||
null,
location: {
subarea:
attr.subarea_name ||
null,
region:
attr.region_name ||
null
},
condition:
attr.condition_name ||
null,
images:
attr.image_count ||
0,
seller: {
name:
attr.name ||
"-",
id:
attr.user_id ||
null,
type:
attr.ad_seller_type === 1
? "Private"
: "Company"
},
url:
attr.adview_url ||
null,
thumbnail:
attr.image
? `https://img.rnudah.com/images${attr.image}`
: null,
timestamp:
attr.list_ts ||
null,
expiry:
attr.ad_expiry ||
null
};
})
.filter((ad) => ad.thumbnail);
for (let i = results.length - 1; i > 0; i--) {
const j = Math.floor(
Math.random() * (i + 1)
);
[results[i], results[j]] = [
results[j],
results[i]
];
}
const randomResult = results[0] || null;
return {
status: !!randomResult,
data: randomResult
};
} catch (e) {
console.error("Handler:" ,
e?.response?.data || e.message
);
return {
status: false,
data: null
};
}
}
//=================
const handler = async (
m,
{ conn, command, text, prefix }
) => {
try {
if (!text) {
return m.reply(
`-Example: ${prefix + command} (text)`
);
}
await m.reply(mess.wait);
try {
const query = text.trim();
const result =
await searchMudahMy(query);
if (
!result?.status ||
!result?.data
) {
return m.reply(mess.error);
}
const ad = result.data;
const imageBuffer =
await fetchBuffer(
ad.thumbnail
);
if (!imageBuffer) {
return m.reply(mess.error);
}
const caption = `*⌗ Mudah.my Search*
> *Title:* ${ad.title}
> *Price:* ${ad.priceLabel || ad.price || "-"}
> *Brand:* ${ad.brand || "-"}
> *Category:* ${ad.category || "-"}
> *Condition:* ${ad.condition || "-"}
> *Location:* ${ad.location?.subarea || "-"}, ${ad.location?.region || "-"}
> *Seller:* ${ad.seller?.name || "-"}
> *Link:* ${ad.url || "-"}`;
await conn.sendMessage(
m.chat,
{
image: imageBuffer,
caption
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
} catch (err) {
console.error(
"Handler:",
err.message
);
m.reply(mess.error);
}
};
//=================
handler.command = ["mudah"];
export default handler;
