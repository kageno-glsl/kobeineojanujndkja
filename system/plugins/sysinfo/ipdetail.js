import axios from "axios";
//=================
const handler = async (m, { conn, isAccess, command, prefix }) => {
if (!isAccess) return m.reply(mess.owner);
try {
await m.reply(mess.wait);   
const res = await axios.get("http://ip-api.com/json/?fields=status,message,country,regionName,city,zip,lat,lon,timezone,isp,org,as,query");
if (!res.data || res.data.status !== "success") return m.reply(mess.error);
const d = res.data;
const replyText = `*⌗ Network & IP Info*
> *IP Address:* ${d.query || "-"}
> *ISP Name:* ${d.isp || "-"}
> *Organization:* ${d.org || "-"}
> *ASN:* ${d.as || "-"}

*⌗ Location Info*
> *City:* ${d.city || "-"}
> *Region:* ${d.regionName || "-"}
> *Postal Code:* ${d.zip || "-"}
> *Country:* ${d.country || "-"}
> *Timezone:* ${d.timezone || "-"}
> *Coordinate:* ${d.lat}, ${d.lon}`;
m.reply(replyText.trim());
} catch (e) {
console.error("Handler:", e.message);
m.reply(mess.error);
}
};
//=================
handler.command = ["ipinfo"];
export default handler;
