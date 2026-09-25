import fs from "fs-extra";
import path from "node:path";
import axios from "axios";
import crypto from "node:crypto";
import WebSocket from "ws";
//=================
class AuthTrackingMY {
constructor(apiKey = null) {
this.baseUrl = "https://appapi.tracking.my";
this.apiKey = apiKey;
this.notificationToken = this._generateNotificationToken();
this.client = axios.create({
baseURL: this.baseUrl,
headers: {
"Host": "appapi.tracking.my",
"X-Api-Version": "3.5.0",
"X-Requested-With": "XMLHttpRequest",
"User-Agent": "Mozilla/5.0 (Linux; Android 15; 23127PN0CC) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/139.0.7258.143 Mobile Safari/537.36",
"Accept": "application/json",
"Content-Type": "application/json",
"locale": "en",
"X-Api-Platform": "android",
"Origin": "https://localhost",
"Referer": "https://localhost/"
}
});
}
_getHeaders() {
return {
"X-Api-Key": this.apiKey ? this.apiKey : "null"
};
}
_generateNotificationToken() {
const part1 = crypto.randomBytes(11).toString('hex');
const part2 = crypto.randomBytes(67).toString('hex').slice(0, 134);
return `${part1}:APA91b${part2}`;
}
async requestOtp(identity) {
const isEmail = identity.includes('@');
const payload = { identity: identity, action: "login" };
if (!isEmail) payload.otp_login = true;
const response = await this.client.post("/otp", payload, { headers: this._getHeaders() });
return response.data;
}
async verifyOtpAndLogin(identity, otpCode) {
const isEmail = identity.includes('@');
const response = await this.client.post("/auth/login", {
identity: identity,
type: isEmail ? "email" : "phone",
otp: otpCode,
notification_token: this.notificationToken,
platform: "android",
locale: "en",
device: "23127PN0CC"
}, { headers: this._getHeaders() });
if (response.data?.user?.token) {
this.apiKey = response.data.user.token;
}
return response.data;
}
async setupUser(userRawData) {
const payload = {
id: userRawData.id,
account_id: userRawData.account_id,
facebook_id: userRawData.facebook_id || null,
google_id: userRawData.google_id || null,
name: "Kobeni",
phone: userRawData.phone || null,
email: userRawData.email || null,
gender: "F",
birthday: "1999-09-09",
latitude: userRawData.latitude || null,
longitude: userRawData.longitude || null,
is_kyc_verified: userRawData.is_kyc_verified || false,
subscription_expired_at: userRawData.subscription_expired_at || null,
terminated_at: userRawData.terminated_at || null,
avatar: userRawData.avatar || null,
socials: userRawData.socials || { facebook: false, google: false },
token: this.apiKey,
identity: userRawData.email || userRawData.phone,
type: userRawData.email ? "email" : "phone",
otp_sent_at: null,
pending_collect_count: 0,
island_enabled: true,
disabled_notifications: null,
email_verified_at: userRawData.email_verified_at || null,
created_at: userRawData.created_at,
updated_at: userRawData.updated_at,
deleted_at: null,
notifications: userRawData.notifications || {
new: true, in_transit: true, delivery_office: true, out_for_delivery: true, delivered: true, exception: true, attempt_fail: true, expired: true, pickup_available: true, pickup_destroyed: true
},
phones: userRawData.phones || [null],
emails: userRawData.emails || [],
gmail_reauth_required: false
};
const response = await this.client.post("/user/setup", payload, { headers: this._getHeaders() });
return response.data;
}
async detectCourier(trackingNumber) {
const response = await this.client.post("/couriers/detect", {
tracking_number: trackingNumber, limit: 1
}, { headers: this._getHeaders() });
return response.data;
}
async registerTracking(trackingNumber, courierHandle) {
const response = await this.client.post("/trackings", {
tracking_number: trackingNumber, courier: courierHandle, title: "Bot Tracker"
}, { headers: this._getHeaders() });
return response.data;
}
async getTrackingDetails(id) {
const response = await this.client.get(`/trackings/${id}`, { headers: this._getHeaders() });
return response.data;
}
async _triggerWSSUpdate(trackingNumber, courierHandle, verification, requestedAt) {
return new Promise((resolve) => {
const ws = new WebSocket("wss://appapi.tracking.my/websocket", {
headers: {
"User-Agent": "Mozilla/5.0 (Linux; Android 15; 23127PN0CC) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/139.0.7258.143 Mobile Safari/537.36",
"Origin": "https://localhost"
}
});
const timeoutId = setTimeout(() => {
ws.close();
resolve(false);
}, 8000);
ws.on('open', () => {
ws.send(JSON.stringify({ type: "auth", api_key: this.apiKey }));
});
ws.on('message', (data) => {
const msg = JSON.parse(data.toString());
if (msg.type === "auth_success") {
ws.send(JSON.stringify({
type: "tracking",
trackingNumber: trackingNumber,
courier: courierHandle,
platform: "app",
verification: verification,
requestedAt: requestedAt
}));
}
if (msg.cid === `tracking_update:${trackingNumber}.${courierHandle}`) {
clearTimeout(timeoutId);
ws.close();
resolve(true); 
}
});
ws.on('error', () => {
clearTimeout(timeoutId);
resolve(false);
});
});
}
async trackParcel(trackingNumber) {
const courierData = await this.detectCourier(trackingNumber);
const courierHandle = courierData?.courier?.handle;
if (!courierHandle) return null;
const registerData = await this.registerTracking(trackingNumber, courierHandle);
const trackingId = registerData?.tracking?.id;
if (!trackingId) return null;
let details = await this.getTrackingDetails(trackingId);
if (!details?.tracking?.checkpoints || details?.tracking?.status === "pending") {
const verification = details?.verification;
const requestedAt = details?.requested_at;
if (verification && requestedAt) {
await this._triggerWSSUpdate(trackingNumber, courierHandle, verification, requestedAt);
details = await this.getTrackingDetails(trackingId);
}
}
return details;
}
}
//=================
const dir = "./system/database";
fs.ensureDirSync(dir);
const getTrackingDbPath = (botId) => path.join(dir, botId === "main" ? "trackingauth.json" : `trackingauth_${botId}.json`);
const loadTrackingToken = (botId) => {
const p = getTrackingDbPath(botId);
if (fs.existsSync(p)) {
try {
const data = fs.readJsonSync(p);
return data.token || null;
} catch { return null; }
}
return null;
};
const saveTrackingToken = (botId, token) => {
const p = getTrackingDbPath(botId);
fs.writeJsonSync(p, { token }, { spaces: 2 });
};
const deleteTrackingToken = (botId) => {
const p = getTrackingDbPath(botId);
if (fs.existsSync(p)) fs.unlinkSync(p);
};
const formatUnixTime = (unixTimestamp) => {
if (!unixTimestamp) return "-";
const date = new Date(unixTimestamp * 1000);
return date.toLocaleString("en-US", { timeZone: "Asia/Kuala_Lumpur", hour12: false }).replace(/\//g, "-");
};
//=================
const handler = async (m, { conn, isBotAdmins, isAdmins, command, args, text, isAccess, prefix }) => {
const botNumberJid = conn.decodeJid(conn.user.id);
const botNumber = botNumberJid.replace(/[^0-9]/g, "");
const dbId = !conn.isClone ? "main" : botNumber;
const inputFirst = args[0]?.toLowerCase();
if (!text) return m.reply(`-Example: 

${prefix + command} login (email/phone)
${prefix + command} verify (kodeotp)
${prefix + command} logout
${prefix + command} (idparcel)`);
const currentToken = loadTrackingToken(dbId);
//=================
if (inputFirst === "login") {
if (!isAccess) return m.reply(mess.owner);
if (currentToken && !currentToken.startsWith("TEMP_AUTH:")) return m.reply(mess.wrong);
const identity = args[1];
if (!identity) return m.reply(`-Example: ${prefix + command} login (email/phone)`);
await m.reply(mess.wait);
try {
const tracker = new AuthTrackingMY();
const res = await tracker.requestOtp(identity);
if (res.identity) {
saveTrackingToken(dbId, `TEMP_AUTH:${identity}`);
const caption = `*⌗ TrackMy Auth Info*
> *Identity:* ${identity}
> *Status:* OTP Sent`.trim();
return m.reply(caption);
}
m.reply(mess.error);
} catch (err) {
console.error("Handler:", err.message);
m.reply(mess.error);
}
return;
}
//=================
if (inputFirst === "verify") {
if (!isAccess) return m.reply(mess.owner);
const otpCode = args[1];
if (!otpCode) return m.reply(`-Example: ${prefix + command} verify (otp_code)`);
if (!currentToken || !currentToken.startsWith("TEMP_AUTH:")) return m.reply(mess.wrong);
const identity = currentToken.split("TEMP_AUTH:")[1];
await m.reply(mess.wait);
try {
const tracker = new AuthTrackingMY();
const res = await tracker.verifyOtpAndLogin(identity, otpCode);
if (res.user?.token) {
saveTrackingToken(dbId, res.user.token);
if (!res.user.name || res.user.name === "User" || res.user.name.includes("@")) {
try {
await tracker.setupUser(res.user);
} catch (setupErr) {
console.error(setupErr);
}
}
return m.reply(mess.success);
}
m.reply(mess.wrong);
} catch (err) {
console.error("Handler:", err.message);
m.reply(mess.error);
}
return;
}
//=================
if (inputFirst === "logout") {
if (!isAccess) return m.reply(mess.owner);
deleteTrackingToken(dbId);
m.reply(mess.success);
return;
}
//=================
if (!currentToken || currentToken.startsWith("TEMP_AUTH:")) return m.reply(mess.wrong);
await m.reply(mess.wait); 
try {
const tracker = new AuthTrackingMY(currentToken);
const res = await tracker.trackParcel(text.trim());
if (!res || !res.tracking) return m.reply(mess.error);
const t = res.tracking;
let caption = `*⌗ Tracking Parcel Info*
> *Number:* ${t.tracking_number || "-"}
> *Courier:* ${t.courier?.title || t.courier?.name || "-"}
> *Status:* ${t.status?.toUpperCase() || "-"}`.trim();
if (t.checkpoints && t.checkpoints.length > 0) {
caption += `\n\n*⌗ History:*`;
t.checkpoints.forEach((cp, index) => {
caption += `\n\n*${index + 1}. [${cp.status?.toUpperCase() || "LOG"}]*
> *Time:* ${formatUnixTime(cp.time)}
> *Location:* ${cp.location || "-"}
> *Detail:* ${cp.content || cp.message || "-"}`;
});
}
await conn.sendMessage(m.chat, { text: caption.trim() }, { quoted: m });
} catch (err) {
console.error("Handler:", err.message);
m.reply(mess.error);
}
};
//=================
handler.command = ["trackmy"];
export default handler;
