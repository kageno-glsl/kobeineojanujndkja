import fs from "fs-extra";
import path from "node:path";
//=================
const dir = "./system/database";
fs.ensureDirSync(dir); 
const dbCache = new Map();
const publicCache = new Map();
const getAccessPath = (id) =>
path.join(dir, id === "main" ? "access.json" : `access_${id}.json`);
const getPublicPath = (id) =>
path.join(dir, id === "main" ? "public.json" : `public_${id}.json`);
const load = (id) => {
if (dbCache.has(id)) return dbCache.get(id);
const p = getAccessPath(id);
const def = { access: [] };
try {
if (fs.existsSync(p)) {
const res = fs.readJsonSync(p);
if (Array.isArray(res.access)) {
dbCache.set(id, res);
return res;
}
}
} catch (_e) {}
fs.writeJsonSync(p, def, { spaces: 2 });
dbCache.set(id, def);
return def;
};
const save = (id, data) => {
dbCache.set(id, data);
fs.writeJson(getAccessPath(id), data, { spaces: 2 }).catch(() => {});
return true;
};
const addAccessUser = (id, botId) => {
const data = load(botId);
if (data.access.some((u) => u.id === id)) return false;
data.access.push({ id });
return save(botId, data);
};
const delAccessUser = (id, botId) => {
const data = load(botId);
const i = data.access.findIndex((u) => u.id === id);
if (i === -1) return false;
data.access.splice(i, 1);
return save(botId, data);
};
const setPublic = (val, botId) => {
const p = getPublicPath(botId);
const data = { public: !!val };
publicCache.set(botId, data);
fs.writeJson(p, data, { spaces: 2 }).catch(() => {});
return true;
};
const isPublic = (botId) => {
if (publicCache.has(botId)) return publicCache.get(botId).public;
const p = getPublicPath(botId);
try {
if (fs.existsSync(p)) {
const res = fs.readJsonSync(p);
if (typeof res.public === "boolean") {
publicCache.set(botId, res);
return res.public;
}
}
} catch (_e) {}
return true; 
};
const get = (botId) => load(botId);
//=================
export { addAccessUser, delAccessUser, setPublic, isPublic, get };
