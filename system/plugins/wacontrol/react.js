const handler = async (m, { conn, isBotAdmins, isAdmins, command, args, text, isAccess, prefix }) => {
if (!isAccess) return m.reply(mess.owner);
if (!m.quoted) return m.reply(`-Example: Reply Chat ${prefix + command} 😜`);
try {
await conn.sendMessage(m.chat, {
react: {
text: text || "🤭",
key: m.quoted.key,
},
});
m.reply(mess.success);
} catch (err) {
console.error("Handler:", err.message);
m.reply(mess.error);
}
};
//=================
handler.command = ["react"];
export default handler;
