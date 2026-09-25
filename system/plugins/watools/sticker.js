//=================
const handler = async (
m,
{ conn, isBotAdmins, isAdmins, command, args, text, isAccess, prefix },
) => {
if (!m.quoted) {
return m.reply(`-Example: Reply Media ${prefix + command}`);
}
try {
await m.reply(mess.wait);
const buffer = await m.quoted.download();
await conn.sendMediaAsSticker(m.chat, buffer, m, {
packname: m.pushName,
author: "©Kobeni-MD",
});
} catch (error) {
console.error("Handler:", error.message);
m.reply(mess.error);
}
};
//=================
handler.command = ["sticker"];
export default handler;