import { generateWAMessageFromContent, prepareWAMessageMedia } from "@whiskeysockets/baileys";
//=================
const cache = new Map();
//=================
const handler = async (m, { conn, isBotAdmins, isAdmins, command, args, text, isAccess, prefix }) => {
if (!isAccess) return m.reply(mess.owner);
try {
if (text && text.endsWith("@g.us")) {
const targetJid = text.trim();
const dataCache = cache.get(m.sender);
if (!dataCache) return m.reply(mess.wrong);
let messageContent = {};
if (dataCache.type === "text") {
messageContent = {
extendedTextMessage: {
text: dataCache.content,
textArgb: 4294967295,
backgroundArgb: 4280730844,
font: "SYSTEM",
previewType: 0,
contextInfo: {
featureEligibilities: {
canReceiveMultiReact: true
},
statusSourceType: 4,
statusAttributions: [
{ type: 10 }
],
isGroupStatus: true,
statusAudienceMetadata: {
audienceType: 1
}
},
inviteLinkGroupTypeV2: 0
}
};
} 
else {
const quotedType = dataCache.content.mtype;
const mediaObj = dataCache.content.message?.[quotedType] || dataCache.content;
messageContent = {
[quotedType]: {
...JSON.parse(JSON.stringify(mediaObj)),
contextInfo: {
...(mediaObj.contextInfo || {}),
featureEligibilities: {
canReceiveMultiReact: true
},
statusSourceType: 4,
statusAttributions: [
{ type: 10 }
],
isGroupStatus: true,
statusAudienceMetadata: {
audienceType: 1
}
}
}
};
}
await conn.relayMessage(targetJid, messageContent, {});
cache.delete(m.sender);
return m.reply(mess.success);
}
let contentToCache;
if (m.quoted) contentToCache = { type: "media", content: m.quoted };
else if (text) contentToCache = { type: "text", content: text };
else return m.reply(`-Example: Reply Media/Text ${prefix + command}`);
cache.set(m.sender, contentToCache);
const groups = await conn.groupFetchAllParticipating();
const groupRows = Object.values(groups).map((g) => ({
title: g.subject || "Group",
id: `${prefix + command} ${g.id}`
}));
if (!groupRows.length) return m.reply(mess.wrong);
const cap = `*⌗ Broadcast Group*
> *Status:* Media saved`;
const sections = [
{
title: "Group List",
rows: groupRows
}
];
const contextInfo = { 
stanzaId: m.key.id, 
participant: m.sender || m.key.participant || m.key.remoteJid, 
quotedMessage: m.message || { conversation: "" } 
};
const msgData = {
interactiveMessage: {
body: { text: cap },
footer: { text: "© ᴋᴏʙᴇɴɪ-ᴍᴅ" },
header: {
hasMediaAttachment: false
},
nativeFlowMessage: {
buttons: [
{
name: "single_select",
buttonParamsJson: JSON.stringify({
title: "\u0000",
sections: sections
})
}
]
},
contextInfo
}
};
const msg = generateWAMessageFromContent(m.chat, msgData, { userJid: conn.user?.id });
const INTERACTIVE_NODES = [
{
tag: "biz",
attrs: {},
content: [
{
tag: "interactive",
attrs: { type: "native_flow", v: "1" },
content: [{ tag: "native_flow", attrs: { v: "9", name: "mixed" } }],
}
]
}
];
await conn.relayMessage(m.chat, msg.message, { 
messageId: msg.key.id,
additionalNodes: INTERACTIVE_NODES
});
} catch (error) {
console.error("Handler:", error.message);
m.reply(mess.error);
}
};
//=================
handler.command = ["upswgc"];
export default handler;
