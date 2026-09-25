import axios from "axios";
//=================
async function getWaifu(){
try{
const {data}=await axios.get(
"https://api.waifu.im/images",
{
params:{
IsNsfw:"false",
OrderBy:"Random",
PageSize:5
},
headers:{
Accept:"application/json"
},
timeout:20000
}
);
const items=Array.isArray(data?.items)?data.items:[];
if(!items.length)return null;
const item=items[Math.floor(Math.random()*items.length)];
return{
url:item.url||null,
id:item.id||null,
width:item.width||null,
height:item.height||null,
tags:Array.isArray(item.tags)
?item.tags.map(tag=>tag?.name).filter(Boolean)
:[]
};
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
{conn,command}
)=>{
try{
await m.reply(mess.wait);
const result=await getWaifu();
if(!result?.url)return m.reply(mess.error);
const caption=`*⌗ Waifu.im*
> *ID:* ${result.id||"-"}
> *Size:* ${result.width||"-"}x${result.height||"-"}
> *Tags:* ${result.tags.length?result.tags.join(", "):"-"}`;
await conn.sendMessage(
m.chat,
{
image:{
url:result.url
},
caption:caption.trim()
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
handler.command=["waifuim"];
export default handler;