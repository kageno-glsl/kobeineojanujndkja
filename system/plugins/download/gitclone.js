//=================
const handler=async(
m,
{conn,isBotAdmins,isAdmins,command,args,text,isAccess,prefix},
)=>{
if(!text)return m.reply(`-Example: ${prefix+command} (url)`);
await m.reply(mess.wait);
const regex=/(?:https|git)(?::\/\/|@)github\.com[/:]([^/:]+)\/([^/]+)(?:\/|$)/i;
const match=text.match(regex);
if(!match)return m.reply(mess.wrong);
const user=match[1];
const repo=match[2].replace(/\.git$/,"");
const url=`https://api.github.com/repos/${user}/${repo}/zipball`;
const head=await fetch(url,{method:"HEAD"});
const content=head.headers.get("content-disposition");
const filename=content?.match(/filename="?(.+?)"?$/)?.[1]||`${repo}.zip`;
await conn.sendMessage(
m.chat,
{
document:{url},
fileName:filename,
mimetype:"application/zip"
},
{quoted:m},
).catch((err)=>m.reply(String(err)));
};
//=================
handler.command=["gitclone"];
export default handler;