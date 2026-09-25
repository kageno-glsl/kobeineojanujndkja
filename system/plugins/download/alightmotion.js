import axios from "axios";
//=================
async function getAMProject(url,meta=true){
try{
const m=url.match(/\/share\/u\/([^\/]+)\/p\/([^\/?]+)/)
if(!m)throw Error("Invalid Alight Motion share link")
const uid=m[1]
const pid=m[2]
const r={
success:true,
uid,
pid,
directUrl:`https://firebasestorage.googleapis.com/v0/b/alight-creative.appspot.com/o/share%2Fu%2F${uid}%2Fp%2F${pid}%2Fprojectfiles.zip?alt=media`
}
if(meta){
try{
const {data}=await axios.post(
"https://us-central1-alight-creative.cloudfunctions.net/getProjectMetadata",
{
data:{
uid,
pid,
platform:"android",
appBuild:1028417,
acctTestMode:"normal"
}
},
{
headers:{
"Content-Type":"application/json",
"User-Agent":"okhttp/4.12.0"
},
timeout:20000
}
)
const i=data?.result?.info||{}
r.metadata={
title:i.title||"Alight Motion Project",
size:i.size||null,
downloads:i.downloads||0,
likes:i.likes||0,
version:i.amVersionString||"-",
thumb:i.largeThumbUrl||i.medThumbUrl||i.smallThumbUrl||null
}
}catch(e){
r.metadataError=e?.response?.data||e.message
}
}
return r
}catch(e){
return{
success:false,
error:e.message
}
}
}
//=================
async function downloadProject(url){
try{
const res=await axios.get(
url,
{
responseType:"arraybuffer",
headers:{
"User-Agent":"Mozilla/5.0"
},
timeout:120000,
maxRedirects:10
}
)
return Buffer.from(res.data)
}catch(e){
console.error("Handler:" ,
e?.response?.data||e.message
)
return null
}
}
//=================
const handler=async(
m,
{conn,command,text,prefix}
)=>{
try{
if(!text){
return m.reply(
`-Example: ${prefix+command} (link)`
)
}
await m.reply(mess.wait)
const project=await getAMProject(
text.trim(),
true
)
if(
!project?.success||
!project?.directUrl
){
return m.reply(mess.error)
}
const buffer=await downloadProject(
project.directUrl
)
if(
!buffer||
!Buffer.isBuffer(buffer)||
!buffer.length
){
return m.reply(mess.error)
}
const title=
project.metadata?.title||
"Alight-Motion-Project"
const safeName=
title
.replace(/[<>:"/\\|?*\x00-\x1F]/g,"")
.trim()
.slice(0,80)||
"Alight-Motion-Project"
const fileName=
`${safeName}.zip`
let caption=`*⌗ Alight Motion Project*
> *Title:* ${title}
> *Project ID:* ${project.pid}
> *User ID:* ${project.uid}
> *Version:* ${project.metadata?.version||"-"}
> *Downloads:* ${project.metadata?.downloads||0}`
if(project.metadata?.size){
caption+=
`\n> *Size:* ${project.metadata.size}`
}
await conn.sendMessage(
m.chat,
{
document:buffer,
fileName,
mimetype:"application/zip",
caption:caption.trim()
},
{
quoted:m
}
)
}catch(e){
console.error(
"Handler:",
e.message
)
m.reply(mess.error)
}
}
//=================
handler.command=["alightmotion"]
export default handler
