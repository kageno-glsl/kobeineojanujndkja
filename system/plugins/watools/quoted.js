import fs from "node:fs";
//=================
const handler = async (m, { conn, isBotAdmins, isAdmins, command, args, text, isAccess, prefix }) => {
if (!m.quoted) {
return m.reply(`-Example: Reply Chat ${prefix + command}`);
}
await m.reply(mess.wait);
const penis = JSON.stringify({ [m.quoted.mtype]: m.quoted }, null, 2);
const jeneng = `quotedjson.json`;
fs.writeFileSync(jeneng, penis);
await m.reply(penis);
await conn.sendMessage(
m.chat,
{ document: { url: `./${jeneng}` }, fileName: jeneng, mimetype: "*/*" },
{ quoted: m },
);
fs.unlinkSync(jeneng);
};
//=================
handler.command = ["quoted"];
export default handler;
