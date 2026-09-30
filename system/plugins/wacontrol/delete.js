const handler = async (m, { conn, isBotAdmins, isAdmins, command, args, text, isAccess, prefix }) => {
if (!m.quoted) return m.reply(`-Example: Reply Chat ${prefix + command}`);
if (m.isGroup && !isAccess && !isAdmins) return m.reply(mess.owner);
if (!m.isGroup && !isAccess) return m.reply(mess.owner);
if (m.isGroup && !isBotAdmins) return m.reply(mess.wrong); 
try {
await conn.sendMessage(m.chat, { delete: m.quoted.key });
await m.reply(mess.success);
} catch (err) {
console.error("Handler:", err.message);
m.reply(mess.error);
}
};
//=================
handler.command = ["delete"];
export default handler;
