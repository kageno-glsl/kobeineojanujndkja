//=================
const handler = async (m, { conn, isBotAdmins, isAdmins, command, args, text, isAccess, prefix }) => {
if (!isAccess) return m.reply(mess.owner);
try {
if (command === "setpp") {
if (!m.quoted || !/image/.test(m.quoted.mimetype))
return m.reply(`-Example: Reply Media ${prefix + command}`);
await m.reply(mess.wait);
const buffer = await m.quoted.download();
await conn.updatePFPMod(buffer);
await m.reply(mess.success);
} else if (command === "setname") {
if (!text) return m.reply(`-Example: ${prefix + command} (text)`);
await m.reply(mess.wait);
await conn.updateProfileName(text);
await m.reply(mess.success);
}
} catch (err) {
console.error("Handler:", err.message);
m.reply(mess.error);
}
};
//=================
handler.command = ["setpp", "setname"];
export default handler;
