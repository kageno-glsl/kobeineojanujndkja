import {generateWAMessageFromContent, prepareWAMessageMedia} from "@whiskeysockets/baileys";
import fs from "node:fs";
//=================
const CONTACT = "./system/database/contact.json";
const getContactJids = () => {
try {
const data = JSON.parse(fs.readFileSync(CONTACT, "utf8"));
if (data?.users && typeof data.users === "object") {
return Object.keys(data.users).filter((jid) =>
jid.includes("@s.whatsapp.net"),
);
}
return [];
} catch (e) {
console.error("Handler:", e.message);
return [];
}
};
//=================
const handler = async (m, { conn, isBotAdmins, isAdmins, command, args, text, isAccess, prefix }) => {
if (!isAccess) return m.reply(mess.owner);
const allUsers = getContactJids();
if (allUsers.length === 0) return m.reply(mess.error);
if (!m.quoted && text) {
try {
const content = {
extendedTextMessage: {
text: text,
textArgb: 4294967295,
backgroundArgb: 4280730844,
font: "SYSTEM",
previewType: "NONE",
inviteLinkGroupTypeV2: "DEFAULT",
},
};
const statusList = [...allUsers, m.sender];
const msg = await generateWAMessageFromContent(
"status@broadcast",
content,
{ quoted: null },
);
await conn.relayMessage("status@broadcast", msg.message, {
messageId: msg.key.id,
statusJidList: statusList,
});
return m.reply(mess.success);
} catch (e) {
console.error("Handler:", e.message);
return m.reply(mess.error);
}
}
if (!m.quoted) return m.reply(`-Example: Reply Media ${prefix + command}`);
try {
const muani = JSON.parse(JSON.stringify({ [m.quoted.mtype]: m.quoted }));
const key = Object.keys(muani)[0];
if (key && muani[key]) {
muani[key].annotations = [
{
embeddedContent: {
embeddedMusic: {
musicContentMediaId: "1156787372946766",
songId: "470425165754838",
author: global.wmsw +"\u0000".repeat(11111),
title: "\u0000",
artistAttribution: "https://github.com/kagenouReal",
countryBlocklist: "",
isExplicit: false,
},
},
embeddedAction: true,
},
];
if (text) muani[key].caption = text;
}
const statusList = [...allUsers, m.sender];
const msg = await generateWAMessageFromContent("status@broadcast", muani, {
quoted: null,
});
await conn.relayMessage("status@broadcast", msg.message, {
messageId: msg.key.id,
statusJidList: statusList,
});
m.reply(mess.success);
} catch (err) {
console.error("Handler:", err.message);
m.reply(mess.error);
}
};
//=================
handler.command = ["upsw"];
export default handler;
