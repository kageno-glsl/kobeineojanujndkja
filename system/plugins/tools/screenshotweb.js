import axios from "axios";
//=================
async function ssweb(url){
try{
let target=url.trim();
if(!/^https?:\/\//i.test(target)){
target=`https://${target}`;
}
const parsed=new URL(target);
const finalUrl=parsed.href;
const apiUrl=`https://api.screenshotmachine.com?key=ddaff5&url=${encodeURIComponent(finalUrl)}&dimension=1280x720`;
const res=await axios.get(apiUrl,{
responseType:"arraybuffer",
timeout:60000,
headers:{
"User-Agent":"Mozilla/5.0"
}
});
if(!res.data?.length)return null;
return Buffer.from(res.data);
}catch(e){
console.error("Handler:" ,
e?.response?.data||e.message
);
return null;
}
}
//=================
const handler=async(
m,
{conn,command,text,prefix}
)=>{
try{
if(!text)return m.reply(`-Example: ${prefix+command} (url)`);
await m.reply(mess.wait);
let url=text.trim();
if(!/^https?:\/\//i.test(url)){
url=`https://${url}`;
}
try{
new URL(url);
}catch{
return m.reply(mess.wrong);
}
const image=await ssweb(url);
if(!image)return m.reply(mess.error);
await conn.sendMessage(
m.chat,
{
image,
caption:`*⌗ Web Screenshot*
> *URL:* ${url}
> *Resolution:* 1280x720`
},
{
quoted:m
}
);
}catch(e){
console.error(
"Handler:",
e.message
);
m.reply(mess.error);
}
};
//=================
handler.command = ["ssweb"];
export default handler;