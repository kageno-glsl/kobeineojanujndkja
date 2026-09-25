//=================
const handler = async (
m,
{ conn, command, text, prefix },
) => {
if (!m.quoted) {
return  m.reply(`-Example: Reply Media ${prefix + command} pack name|author name`);
}
const separatorIndex = text.indexOf("|");
const packname = separatorIndex === -1 ? "" : text.slice(0, separatorIndex).trim();
const author = separatorIndex === -1 ? "" : text.slice(separatorIndex + 1).trim();
if (!packname || !author) {
return m.reply(`-Example: Reply Media ${prefix + command} pack name|author name`);
}
try {
await m.reply(mess.wait);
const buffer = await m.quoted.download();
await conn.sendMediaAsSticker(m.chat, buffer, m, {
packname,
author,
});
} catch (error) {
console.error("Handler:", error.message);
m.reply(mess.error);
}
};
//=================
handler.command = ["swm"];
export default handler;
