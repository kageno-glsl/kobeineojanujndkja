import fs from "fs-extra";
import path from "node:path";
import axios from "axios";
import {
generateWAMessageFromContent,
prepareWAMessageMedia
} from "@whiskeysockets/baileys";
//=================
const FIREBASE_KEY="AIzaSyBJN3ZYdzTmjyQJ-9TdpikbsZDT9JUAYFk";
const ttsCache = new Map();
const actorCache = new Map();
const TTS_CACHE_TIME = 10 * 60 * 1000;
const ACTOR_CACHE_TIME = 10 * 60 * 1000;
const dir="./system/database";
const AUTO_REFRESH = 50*60*1000;
fs.ensureDirSync(dir);
//=================
class Typecast{
constructor(botId){
this.botId=botId;
this.dir=dir;
this.firebaseKey=FIREBASE_KEY;
this.auth=this.loadAuth();
}
//=================
sleep(ms){
return new Promise(r=>setTimeout(r,ms));
}
//=================
getDbPath(){
return path.join(
this.dir,
this.botId==="main"?"typecastauth.json":`typecastauth_${this.botId}.json`
);
}
//=================
loadAuth(){
const p=this.getDbPath();
if(!fs.existsSync(p))return null;
try{return fs.readJsonSync(p)}catch{return null}
}
//=================
saveAuth(data){
fs.writeJsonSync(
this.getDbPath(),
data,
{spaces:2}
);
}
//=================
deleteAuth(){
const p=this.getDbPath();
if(fs.existsSync(p))fs.unlinkSync(p);
}
//=================
firebaseHeaders(origin){
return{
Accept:"application/json, text/plain, */*",
"Content-Type":"application/json",
Origin:origin,
Referer:`${origin}/`,
"User-Agent":"Mozilla/5.0"
};
}
//=================
async firebaseLogin(email,password){
const {data}=await axios.post(
`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${this.firebaseKey}`,
{
returnSecureToken:true,
email,
password,
clientType:"CLIENT_TYPE_WEB"
},
{
headers:this.firebaseHeaders("https://accounts.typecast.ai"),
timeout:30000
}
);
return data;
}
//=================
async lookup(idToken){
const {data}=await axios.post(
`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${this.firebaseKey}`,
{idToken},
{
headers:this.firebaseHeaders("https://accounts.typecast.ai"),
timeout:30000
}
);
return data?.users?.[0]||null;
}
//=================
async sendVerify(idToken){
const {data}=await axios.post(
"https://typecast.ai/api/auth-fb/email/verify-email",
{
from:"wizard",
from_platform:true,
token:idToken
},
{
headers:this.firebaseHeaders("https://accounts.typecast.ai"),
timeout:30000
}
);
return data;
}
//=================
async getCustomToken(idToken){
const {data}=await axios.post(
"https://typecast.ai/api/auth-fb/custom-token",
{token:idToken},
{
headers:this.firebaseHeaders("https://accounts.typecast.ai"),
timeout:30000
}
);
return data?.result?.access_token||null;
}
//=================
async signInCustom(token){
const {data}=await axios.post(
`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${this.firebaseKey}`,
{
token,
returnSecureToken:true
},
{
headers:{
...this.firebaseHeaders("https://studio.typecast.ai"),
"x-client-version":"Chrome/JsCore/11.3.1/FirebaseCore-web"
},
timeout:30000
}
);
return data;
}
//=================
async getMe(idToken){
const {data}=await axios.get(
"https://typecast.ai/api/me",
{
headers:{
Accept:"application/json, text/plain, */*",
Authorization:`Bearer ${idToken}`,
Origin:"https://studio.typecast.ai",
Referer:"https://studio.typecast.ai/",
"User-Agent":"Mozilla/5.0"
},
timeout:30000
}
);
return data?.result||null;
}
//=================
async createApiToken(idToken){
const {data}=await axios.post(
"https://typecast.ai/api/user/tokens",
{
service_type:"global_api"
},
{
headers:{
Accept:"application/json, text/plain, */*",
Authorization:`Bearer ${idToken}`,
"Content-Type":"application/json",
Origin:"https://studio.typecast.ai",
Referer:"https://studio.typecast.ai/",
"User-Agent":"Mozilla/5.0"
},
timeout:30000
}
);
return data?.token||null;
}
//=================
async ensureApiToken(idToken,me){
if(me?.api_token)return me;
const tokenData=await this.createApiToken(idToken);
if(!tokenData)throw new Error("API token generation error");
for(let i=0;i<5;i++){
await this.sleep(1000);
const updated=await this.getMe(idToken);
if(updated?.api_token)return updated;
}
throw new Error("api error missing token");
}
//=================
async saveSession(final,me,refreshToken){
const data={
idToken:final.idToken,
refreshToken:refreshToken||final.refreshToken||"",
expiresAt:Date.now()+(Number(final.expiresIn||3600)*1000),
uid:me?.uid||"",
email:me?.email||"",
username:me?.username||"",
apiToken:me?.api_token||"",
profile:me||null,
updatedAt:Date.now()
};
this.saveAuth(data);
const check=this.loadAuth();
}
//=================
async refreshFirebase(refreshToken){
const body=new URLSearchParams({
grant_type:"refresh_token",
refresh_token:refreshToken
});
try{
const {data}=await axios.post(
`https://securetoken.googleapis.com/v1/token?key=${this.firebaseKey}`,
body.toString(),
{
headers:{
Accept:"application/json",
"Content-Type":"application/x-www-form-urlencoded",
"User-Agent":"Mozilla/5.0"
},
timeout:30000
}
);
if(!data?.id_token)throw new Error("Firebase cannot return token");
return data;
}catch(e){
const error=e?.response?.data?.error;
throw new Error(error?.message||"Firebase refresh failed");
}
}
//=================
async refresh(){
const auth=this.loadAuth();
if(!auth?.refreshToken)return null;
try{
const firebase=await this.refreshFirebase(
auth.refreshToken
);
const firebaseToken=firebase.id_token;
const newRefreshToken=
firebase.refresh_token||auth.refreshToken;
const customToken=await this.getCustomToken(
firebaseToken
);
if(!customToken){
throw new Error("Custom token failed");
}
const final=await this.signInCustom(
customToken
);
if(!final?.idToken){
throw new Error("Custom sign in failed");
}
let me=await this.getMe(
final.idToken
);
if(!me){
throw new Error("API /me failed");
}
if(!me.api_token){
me=await this.ensureApiToken(
final.idToken,
me
);
}
await this.saveSession(
final,
me,
final.refreshToken||newRefreshToken
);
return me;
}catch(e){
console.error(
"Handler:",
e?.response?.data||e.message
);
return null;
}
}
//=================
async ensureAuth(){
const auth=this.loadAuth();
if(!auth?.refreshToken)return null;
if(auth.expiresAt&&Date.now()<auth.expiresAt-5*60*1000)return auth;
const me=await this.refresh();
if(!me)return null;
return this.loadAuth();
}
//=================
async getActors(idToken){
const cached=actorCache.get(this.botId);
if(cached&&Date.now()-cached.createdAt<ACTOR_CACHE_TIME)return cached.actors;
const {data}=await axios.get(
"https://typecast.ai/api/actor/v2?only_dots=true",
{
headers:{
Accept:"application/json, text/plain, */*",
Authorization:`Bearer ${idToken}`,
Origin:"https://studio.typecast.ai",
Referer:"https://studio.typecast.ai/",
"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36"
},
timeout:30000
}
);
const actors=Array.isArray(data?.result)?data.result:[];
if(!actors.length){
throw new Error("Typecast actor list is empty");
}
const normalized=actors
.filter(v=>v?.actor_id)
.map(v=>({
actor_id:String(v.actor_id),
name:String(v.name?.en||v.name?.ko||v.actor_id),
language:v.language||"-",
age:v.age||"-"
}));
actorCache.set(
this.botId,
{
createdAt:Date.now(),
actors:normalized
}
);
return normalized;
}
//=================
async tts(idToken,text,actorId){
const headers={
Accept:"application/json, text/plain, */*",
Authorization:`Bearer ${idToken}`,
"Content-Type":"application/json",
Origin:"https://studio.typecast.ai",
Referer:"https://studio.typecast.ai/",
"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36"
};
const {data}=await axios.post(
"https://typecast.ai/api/speak/batch/post",
[
{
text,
actor_id:actorId,
expressivity:0,
tempo:1,
pitch:0,
style_label:"normal-1",
style_label_version:"v1",
emotion_scale:1,
lang:"auto",
mode:"one-vocoder",
retake:true,
bp_c_l:true,
adjust_lastword:0
}
],
{
headers,
timeout:30000
}
);
const speakUrl=data?.result?.speak_urls?.[0];
if(!speakUrl){
throw new Error("Speak URL missing");
}
let result=null;
for(let i=0;i<30;i++){
const {data}=await axios.post(
"https://typecast.ai/api/speak/batch/get",
[speakUrl],
{
headers,
timeout:30000
}
);
result=data?.result?.[0];
if(result?.status==="done")break;
if(result?.status==="error"){
throw new Error(
result?.error_message||"Typecast generation failed"
);
}
await this.sleep(2000);
}
if(result?.status!=="done"){
throw new Error("Typecast generation timeout");
}
const audioUrl=
result.audio?.high?.url||
result.audio?.hd1?.url||
result.audio?.url;
if(!audioUrl){
throw new Error("Audio URL missing");
}
const {data:audio}=await axios.get(
audioUrl,
{
headers:{
Authorization:`Bearer ${idToken}`,
"User-Agent":"Mozilla/5.0"
},
responseType:"arraybuffer",
timeout:60000
}
);
const buffer=Buffer.from(audio);
if(!buffer.length){
throw new Error("Empty audio");
}
return buffer;
}
//=================
async autoRefresh(){
try{
const auth=this.loadAuth();
if(!auth?.refreshToken){
return false;
}
const remaining=auth.expiresAt
?auth.expiresAt-Date.now()
:0;
if(
!auth.expiresAt||
remaining<=10*60*1000
){
const result=await this.refresh();
if(!result){
return false;
}
return true;
}
return false;
}catch(e){
console.error(
"Handler:",
e?.message
);
return false;
}
}
//=================
async completeLogin(email,password){
const login=await this.firebaseLogin(
email,
password
);
let user=await this.lookup(login.idToken);
if(user?.emailVerified!==true){
await this.sendVerify(login.idToken);
for(let i=1;i<=180;i++){
if(i>1)await this.sleep(5000);
user=await this.lookup(login.idToken);
if(user?.emailVerified===true)break;
}
if(user?.emailVerified!==true){
throw new Error("Email verification timeout");
}
const relogin=await this.firebaseLogin(
email,
password
);
login.idToken=relogin.idToken;
login.refreshToken=relogin.refreshToken;
login.expiresIn=relogin.expiresIn;
}
const customToken=await this.getCustomToken(
login.idToken
);
if(!customToken){
throw new Error("Custom token failed");
}
const final=await this.signInCustom(
customToken
);
if(!final?.idToken){
throw new Error("Final login failed");
}
let me=await this.getMe(final.idToken);
if(!me){
throw new Error("API /me failed");
}
if(!me.api_token){
me=await this.ensureApiToken(
final.idToken,
me
);
}
await this.saveSession(
final,
me,
final.refreshToken||login.refreshToken
);
return me;
}
//=================
async signup(email,password){
const name="ZConTC"+Date.now();
const birth="19971214";
const {data}=await axios.post(
"https://typecast.ai/api/auth-fb/v4/signup",
{
auth:{
provider:"password",
email,
password
},
user:{
name,
phone:"",
country_phone_code:"+60",
birth,
underage:false,
organization:"",
settings:{
language:"en",
country:"MY"
},
marketing_usage_consent:true,
subscribe_email:true,
sms_marketing_consent:true,
push_marketing_consent:false,
storage_period:"termination",
signup_device:"web"
}
},
{
headers:this.firebaseHeaders(
"https://accounts.typecast.ai"
),
timeout:30000
}
);
if(!data?.result?.uid){
throw new Error("Signup gagal");
}
const login=await this.firebaseLogin(
email,
password
);
await this.sendVerify(login.idToken);
return{
login,
email
};
}
//=================
async completeSignup(email,password,m){
const signup=await this.signup(
email,
password
);
await m.reply(
`*⌗ Typecast Signup*
> *Email:* ${signup.email}
> *Status:* Verification email sent`
);
let verified=false;
let idToken=signup.login.idToken;
for(let i=1;i<=180;i++){
const user=await this.lookup(idToken);
if(user?.emailVerified===true){
verified=true;
break;
}
await this.sleep(5000);
}
if(!verified){
throw new Error("Email verification timeout");
}
const relogin=await this.firebaseLogin(
email,
password
);
idToken=relogin.idToken;
const customToken=await this.getCustomToken(
idToken
);
if(!customToken){
throw new Error("Custom token gagal");
}
const final=await this.signInCustom(
customToken
);
if(!final?.idToken){
throw new Error("Final login gagal");
}
let me=await this.getMe(
final.idToken
);
if(!me){
throw new Error("API /me gagal");
}
if(!me.api_token){
me=await this.ensureApiToken(
final.idToken,
me
);
}
await this.saveSession(
final,
me,
final.refreshToken||relogin.refreshToken
);
return me;
}
}
//=================
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
//=================
const getBotId=conn=>{
const jid=conn.decodeJid(conn.user.id);
const num=jid.replace(/[^0-9]/g,"");
return !conn.isClone?"main":num;
};
//=================
const handler=async(
m,
{conn,args,text,isAccess,command,prefix}
)=>{
const botId=getBotId(conn);
const tc=new Typecast(botId);
const sub=(args[0]||"").toLowerCase();
//=================
if(sub==="voice"){
const actorId=(args[1]||"").trim();
if(!actorId){
return m.reply(mess.error);
}
const current=await tc.ensureAuth();
if(!current){
return m.reply(mess.wrong);
}
const cached=ttsCache.get(m.sender);
if(!cached){
return m.reply(
`-Example: ${prefix+command} (text)`
);
}
if(Date.now()-cached.createdAt>TTS_CACHE_TIME){
ttsCache.delete(m.sender);
return m.reply(
`-Example: ${prefix+command} (text)`
);
}
try{
const actors=await tc.getActors(
current.idToken
);
const actor=actors.find(
v=>v.actor_id===actorId
);
if(!actor){
return m.reply(mess.error);
}
await m.reply(
`*⌗ Typecast TTS*
> *Voice:* ${actor.name}
> *Status:* Generating...`
);
const audio=await tc.tts(
current.idToken,
cached.text,
actor.actor_id
);
if(!audio){
return m.reply(mess.error);
}
await conn.sendMessage(
m.chat,
{
audio,
mimetype:"audio/mpeg"
},
{
quoted:m
}
);
ttsCache.delete(m.sender);
}catch(e){
console.error(
"Handler:",
e?.response?.data||e.message
);
return m.reply(
mess.error
);
}
return;
}
//=================
if(sub==="signin"){
if(!isAccess){
return m.reply(mess.owner);
}
const email=args[1];
const password=args[2];
if(!email||!password){
return m.reply(
`-Example: ${prefix+command} signin (gmail) (pass)`
);
}
if(tc.loadAuth()?.refreshToken){
return m.reply(mess.wrong);
}
await m.reply(mess.wait);
try{
const me=await tc.completeLogin(
email,
password
);
return m.reply(
`*⌗ Typecast Login*
> *Username:* ${me.username||"-"}
> *Email:* ${me.email||"-"}
> *UID:* ${me.uid||"-"}
> *Package:* ${me.package?.name||"-"}
> *API:* ${me.api_token?"Generated":"Unavailable"}`
);

}catch(e){
console.error(
"Handler:",
e?.response?.data||e.message
);
return m.reply(
mess.error
);
}
}
//=================
if(sub==="signup"){
if(!isAccess){
return m.reply(mess.owner);
}
const email=args[1];
const password=args[2];
if(!email||!password){
return m.reply(
`-Example: ${prefix+command} signup (gmail) (pass)`
);
}
if(tc.loadAuth()?.refreshToken){
return m.reply(mess.wrong);
}
await m.reply(mess.wait);
try{
const me=await tc.completeSignup(
email,
password,
m
);
return m.reply(
`*⌗ Typecast Signup Complete*
> *Username:* ${me.username||"-"}
> *Email:* ${me.email||"-"}
> *UID:* ${me.uid||"-"}
> *Package:* ${me.package?.name||"-"}
> *API:* ${me.api_token?"Generated":"Unavailable"}`
);
}catch(e){
console.error(
"Handler:",
e?.response?.data||e.message
);
return m.reply(
mess.error
);
}
}
//=================
if(sub==="profile"){
if(!isAccess){
return m.reply(mess.owner);
}
let current=await tc.ensureAuth();
if(!current){
return m.reply(mess.wrong);
}
await m.reply(mess.wait);
try{
let me=await tc.getMe(
current.idToken
);
if(!me){
return m.reply(mess.error);
}
if(!me.api_token){
me=await tc.ensureApiToken(
current.idToken,
me
);
}
tc.saveAuth({
...current,
profile:me,
uid:me.uid||current.uid,
email:me.email||current.email,
username:me.username||current.username,
apiToken:me.api_token||current.apiToken||"",
updatedAt:Date.now()
});
const packageInfo=me.package||{};
const caption=
`*⌗ Typecast Profile*
> *Username:* ${me.username||"-"}
> *Email:* ${me.email||"-"}
> *Country Code:* ${me.country_phone_code||"-"}
> *UID:* ${me.uid||"-"}

*⌗ API Info*
> *API:* ${me.api_token?"Enabled":"Disabled"}
> *API Token:* ${me.api_token||"-"}

*⌗ Package*
> *Name:* ${packageInfo.name||"-"}
> *ID:* ${packageInfo._id||"-"}
> *Subscription:* ${me.subscription?"Active":"Inactive"}`;
return m.reply(
caption
);
}catch(e){
console.error(
"Handler:",
e?.response?.data||e.message
);
return m.reply(
mess.error
);
}
}
//=================
if(sub==="logout"){
if(!isAccess){
return m.reply(mess.owner);
}
tc.deleteAuth();
return m.reply(
mess.success
);
}
//=================
const ttsText = text.trim();
if(!ttsText){
return m.reply(
`-Example: ${prefix + command} (text)`
);
}
const current=await tc.ensureAuth();
if(!current){
return m.reply(mess.wrong);
}
try{
const actors=await tc.getActors(
current.idToken
);
ttsCache.set(
m.sender,
{
text:ttsText,
createdAt:Date.now()
}
);
const sections=[];
for(let i=0;i<actors.length;i+=10){
const chunk=actors.slice(i,i+10);
sections.push({
title:`Voices ${i+1}-${Math.min(i+10,actors.length)}`,
rows:chunk.map(actor=>({
title:actor.name,
description:`${actor.language} • ${actor.age}`,
id:`${prefix+command} voice ${actor.actor_id}`
}))
});
}
const cap=
`*⌗ Typecast Text To Voice*
> *Text:* ${ttsText}
> *Voices:* ${actors.length}`;
const contextInfo={
stanzaId:m.key.id,
participant:m.sender||m.key.participant||m.key.remoteJid,
quotedMessage:m.message||{
conversation:""
}
};
const msgData={
interactiveMessage:{
body:{
text:cap
},
footer:{
text:"© ᴋᴏʙᴇɴɪ-ᴍᴅ"
},
nativeFlowMessage:{
buttons:[{
name:"single_select",
buttonParamsJson:JSON.stringify({
title:"Select Voice",
sections
})
}]
},
contextInfo
}
};
const msg=generateWAMessageFromContent(
m.chat,
msgData,
{
userJid:conn.user?.id
}
);
const INTERACTIVE_NODES=[{
tag:"biz",
attrs:{},
content:[{
tag:"interactive",
attrs:{
type:"native_flow",
v:"1"
},
content:[{
tag:"native_flow",
attrs:{
v:"9",
name:"mixed"
}
}]
}]
}];
await conn.relayMessage(
m.chat,
msg.message,
{
messageId:msg.key.id,
additionalNodes:INTERACTIVE_NODES
}
);
return;
}catch(e){
console.error(
"Handler:",
e?.response?.data||e.message
);
return m.reply(
mess.error
);
}
//=================
return m.reply(
`-Example:

${prefix+command} signin (gmail) (pass)
${prefix+command} signup (gmail) (pass)
${prefix+command} profile
${prefix+command} logout
${prefix+command} (text)`
);
};
//=================
const refreshTimer=setInterval(
async()=>{
try{
for(const file of fs.readdirSync(dir)){
if(!/^typecastauth(?:_[0-9]+)?\.json$/.test(file)){
continue;
}
const botId=
file==="typecastauth.json"
?"main"
:file.replace(
/^typecastauth_|\.json$/g,
""
);
const tc=new Typecast(botId);
await tc.autoRefresh();
}
}catch(e){
console.error(
"Handler:",
e?.message
);
}
},
AUTO_REFRESH
);
refreshTimer.unref?.();
//=================
handler.command=["typecast"];
export default handler;