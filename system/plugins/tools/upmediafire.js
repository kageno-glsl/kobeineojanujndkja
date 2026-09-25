import axios from "axios";
import FormData from "form-data";
import crypto from "node:crypto";
//=================
const defaultAccounts = [
{ email: "zqwis1@kage.my", password: "zqwis1" },
{ email: "zqwis2@kage.my", password: "zqwis2" },
{ email: "zqwis3@kage.my", password: "zqwis3" },
{ email: "zqwis4@kage.my", password: "zqwis4" },
{ email: "zqwis5@kage.my", password: "zqwis5" },
];
class MediaFireUpload {
constructor(email, password) {
this.email = email;
this.password = password;
this.base = "https://www.mediafire.com";
this.headers = { "User-Agent": "okhttp/4.12.0" };
this.cookie = "";
this.session = "";
this.token = "";
}
async request(url, data, headers = {}) {
return axios.post(url, data, {
maxBodyLength: Infinity,
maxContentLength: Infinity,
headers: { ...(data?.getHeaders?.() || {}), ...headers, ...this.headers },
});
}
async authenticate() {
if (this.session && this.token) return;
let form = new FormData();
form.append("email", this.email);
form.append("password", this.password);
form.append("return_user_cookie", "true");
form.append("remember", "true");
const login = await this.request(`${this.base}/application/login.php`, form);
this.session = login.data?.response?.session_token;
if (!this.session) throw new Error(login.data?.response?.message || "MediaFire login gagal");
this.cookie = login.headers["set-cookie"]?.map((value) => value.split(";")[0]).join("; ") || "";
form = new FormData();
form.append("type", "upload");
form.append("lifespan", "1440");
form.append("response_format", "json");
form.append("session_token", this.session);
const token = await this.request(`${this.base}/api/1.5/user/get_action_token.php`, form, { Cookie: this.cookie });
this.token = token.data?.response?.action_token;
if (!this.token) throw new Error(token.data?.response?.message || "Token MediaFire tidak valid");
}
async upload(buffer, name = `${Date.now()}`) {
if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error("Media tidak valid");
await this.authenticate();
const size = buffer.length;
const hash = crypto.createHash("sha256").update(buffer).digest("hex");
let form = new FormData();
form.append("uploads", JSON.stringify([{ filename: name, folder_key: "myfiles", size, hash, resumable: "yes", preemptive: "yes" }]));
form.append("response_format", "json");
form.append("session_token", this.token);
const check = await this.request(`${this.base}/api/1.5/upload/check.php`, form, { Cookie: this.cookie });
const uploadUrl = check.data?.response?.upload_url?.simple;
if (!uploadUrl) throw new Error(check.data?.response?.message || "Upload URL tidak ditemukan");
const upload = await this.request(`${uploadUrl}?folder_key=myfiles&response_format=json&session_token=${this.token}`, buffer, {
Cookie: this.cookie,
"x-filesize": size,
"x-filehash": hash,
"x-filename": encodeURIComponent(name),
"Content-Type": "application/octet-stream",
});
const key = upload.data?.response?.doupload?.key;
if (!key) throw new Error(upload.data?.response?.message || "Upload MediaFire gagal");
form = new FormData();
form.append("key", key);
form.append("response_format", "json");
form.append("session_token", this.token);
const poll = await this.request(`${this.base}/api/1.5/upload/poll_upload.php`, form, { Cookie: this.cookie });
const data = poll.data?.response?.doupload;
if (!data) throw new Error(poll.data?.response?.message || "Respons MediaFire tidak valid");
const links = await this.request(`${this.base}/api/1.5/file/get_links.php`, new URLSearchParams({ session_token: this.session, quick_key: data.quickkey, link_type: "direct_download", response_format: "json" }), { Cookie: this.cookie, "Content-Type": "application/x-www-form-urlencoded" });
return {
filename: data.filename,
size: Number(data.size),
link: `${this.base}/file/${data.quickkey}`,
direct: links.data?.response?.links?.[0]?.direct_download || null,
};
}
}
const clients = () => defaultAccounts.map((account) => new MediaFireUpload(account.email, account.password));
const extension = (mimetype = "") => ({ "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "video/mp4": ".mp4", "video/webm": ".webm", "audio/mpeg": ".mp3" }[mimetype] || "");
//=================
const handler = async (m, { prefix, command }) => {
if (!m.quoted?.mimetype) return m.reply(`-Example: Reply Media ${prefix + command}`);
const accounts = clients();
try {
await m.reply(mess.wait);
const buffer = await m.quoted.download();
const name = m.quoted.fileName || `${Date.now()}${extension(m.quoted.mimetype)}`;
const client = accounts[Math.floor(Math.random() * accounts.length)];
const result = await client.upload(buffer, name);
const output = `*⌗ MediaFire Upload*
> *Name:* ${result.filename || name}
> *Size:* ${result.size || 0} bytes
> *File URL:* ${result.link}
> *Direct URL:* ${result.direct || "-"}`;
return m.reply(output);
} catch (error) {
console.error("Handler:", error.message);
m.reply(mess.error);
}
};
//=================
handler.command = ["upmediafire"];
export default handler;