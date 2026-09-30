import {generateWAMessageFromContent} from "@whiskeysockets/baileys";
//=================
const handler = async (m, { conn, isBotAdmins, isAdmins, command, args, text, isAccess, prefix }) => {
if (!m.quoted) {
return m.reply(`-Example: Reply Media ${prefix + command}`);
}
try {
const mediaObj = { ...m.quoted };
delete mediaObj.viewOnce;
const msg = generateWAMessageFromContent(
m.chat,
{ [m.quoted.mtype]: mediaObj },
{ quoted: m },
);
await conn.relayMessage(m.chat, msg.message, { messageId: msg.key.id });
} catch (err) {
console.error("Handler:", err.message);
m.reply(mess.error);
}
};
//=================
handler.command = ["rvo"];
export default handler;
