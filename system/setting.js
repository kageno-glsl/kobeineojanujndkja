//=================
global.prefix = [".", "!", "/", "👙", "😹", "🗿"];
global.owner = "601112260297";
global.useOwnerToPair = true;
global.usePairingCode = true;
global.pairingcode = "KOBENIMD";
global.wmsw = "# Kage — aga stres tpi oke.";

//=================
// Admin Control Panel Configuration (Single Google Admin)
global.adminEmail = process.env.PANEL_ADMIN_EMAIL || "keeplazyy@gmail.com";
global.adminUsername = process.env.PANEL_ADMIN_USERNAME || "admin";
global.adminPassword = process.env.PANEL_ADMIN_PASSWORD || "kobeni2026!";

// Clone Bot Policy Defaults (Governed by Admin / Main Bot)
// Regular users (registered or Google login) operate Clone Bots whose features
// are customized by the Admin.
global.defaultCloneConfig = {
  allowedCategories: ["tools", "anime", "downloader", "ai", "group", "search"],
  restrictedPlugins: ["broadcast.js", "owner.js"],
  allowCustomPrefix: true,
  allowPublicModeToggle: true
};

//=================
global.mess = {
  owner: "You’re not allowed.",
  success: "Done.",
  error: "Something went wrong.",
  wait: "Hold on...",
  wrong: "Stupid.",
};
//=================

export const adminUsername = global.adminUsername;
export const adminPassword = global.adminPassword;
export const defaultCloneConfig = global.defaultCloneConfig;
