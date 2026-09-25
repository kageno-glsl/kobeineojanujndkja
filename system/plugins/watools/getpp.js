const handler = async (m, { conn, isBotAdmins, isAdmins, command, args, text, isAccess, prefix }) => {
let targetJid;
if (m.quoted) {
targetJid = m.quoted.sender;
} else if (text) {
const nomor = text.replace(/[^0-9]/g, "");
targetJid = `${nomor}@s.whatsapp.net`;
} else {
targetJid = m.chat;
}
try {
await m.reply(mess.wait);
const ppUrl = await conn.profilePictureUrl(targetJid, "image");
await conn.sendMessage(
m.chat,
{
image: { url: ppUrl }
},
{
quoted: m,
},
);
} catch (error) {
console.error("Handler:", error.message);
m.reply(mess.error);
}
};
//=================
handler.command = ["getpp"];
export default handler;
