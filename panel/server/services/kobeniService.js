import fs from "fs-extra";
import path from "node:path";
import vm from "node:vm";
import { config } from "../config.js";
import { logService } from "./logService.js";
import { addAccessUser, delAccessUser, setPublic, isPublic, get } from "../../../system/lib/access.js";
import { addBot, delBot, listBot, startAllBot } from "../../../outdex.js";

export function checkModuleSyntax(code) {
  if (!code || typeof code !== "string" || !code.trim()) {
    return { valid: false, error: "Empty code content" };
  }

  try {
    if (typeof vm.SourceTextModule === "function") {
      new vm.SourceTextModule(code);
      return { valid: true, error: null };
    }
  } catch (e) {
    return { valid: false, error: e.message };
  }

  // Fallback: Test syntax with vm.Script after masking module keywords
  try {
    let transformed = code
      .replace(/import\s+([\s\S]*?)\s+from\s+['"][^'"]+['"]/g, "/* import $1 */")
      .replace(/import\s+['"][^'"]+['"]/g, "/* import */")
      .replace(/export\s+default\s+/g, "let __default_export__ = ")
      .replace(/export\s+(const|let|var|function|class|async\s+function)\s+/g, "$1 ")
      .replace(/export\s*\{[^}]*\}\s*;?/g, "/* export */");

    new vm.Script(transformed);
    return { valid: true, error: null };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

export const kobeniService = {
  // --- Public / Self Mode ---
  getMode(botId = "main") {
    const cleanId = botId === "main" ? "main" : botId.replace(/[^0-9]/g, "");
    const publicState = isPublic(cleanId);
    return {
      botId: cleanId,
      isPublic: publicState,
      mode: publicState ? "PUBLIC" : "SELF",
    };
  },

  setMode(botId = "main", isPublicValue) {
    const cleanId = botId === "main" ? "main" : botId.replace(/[^0-9]/g, "");
    setPublic(!!isPublicValue, cleanId);
    logService.add("INFO", "SYSTEM", `Bot [${cleanId}] mode set to ${isPublicValue ? "PUBLIC" : "SELF"}`);
    return this.getMode(cleanId);
  },

  // --- Access Control ---
  getAccess(botId = "main") {
    const cleanId = botId === "main" ? "main" : botId.replace(/[^0-9]/g, "");
    const data = get(cleanId);
    const users = Array.isArray(data?.access) ? data.access.map(u => ({ id: u.id })) : [];
    return {
      botId: cleanId,
      total: users.length,
      users,
    };
  },

  addUser(botId = "main", number) {
    const cleanId = botId === "main" ? "main" : botId.replace(/[^0-9]/g, "");
    const cleanNumber = String(number).replace(/[^0-9]/g, "");
    if (!cleanNumber || cleanNumber.length < 5 || cleanNumber.length > 20) {
      throw new Error("Invalid WhatsApp phone number format");
    }

    const ok = addAccessUser(cleanNumber, cleanId);
    if (!ok) {
      throw new Error(`User ${cleanNumber} already has access or failed to add`);
    }

    logService.add("INFO", "SYSTEM", `Added access user ${cleanNumber} for bot [${cleanId}]`);
    return this.getAccess(cleanId);
  },

  removeUser(botId = "main", number) {
    const cleanId = botId === "main" ? "main" : botId.replace(/[^0-9]/g, "");
    const cleanNumber = String(number).replace(/[^0-9]/g, "");
    if (!cleanNumber) {
      throw new Error("Invalid phone number");
    }

    const ok = delAccessUser(cleanNumber, cleanId);
    if (!ok) {
      throw new Error(`User ${cleanNumber} not found in access list`);
    }

    logService.add("INFO", "SYSTEM", `Removed access user ${cleanNumber} from bot [${cleanId}]`);
    return this.getAccess(cleanId);
  },

  // --- Plugin Manager ---
  async getPlugins() {
    const pluginsDir = config.pluginsDir;
    if (!fs.existsSync(pluginsDir)) {
      return { totalCategories: 0, totalPlugins: 0, totalCommands: 0, syntaxErrorCount: 0, categories: [], plugins: [] };
    }

    const categories = [];
    const allPlugins = [];
    let totalPlugins = 0;
    let totalCommands = 0;
    let syntaxErrorCount = 0;

    const folders = (await fs.promises.readdir(pluginsDir, { withFileTypes: true }))
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const folder of folders) {
      const folderPath = path.join(pluginsDir, folder);
      const files = (await fs.promises.readdir(folderPath, { withFileTypes: true }))
        .filter(f => f.isFile() && f.name.endsWith(".js"))
        .map(f => f.name);

      const pluginItems = [];
      for (const file of files) {
        totalPlugins++;
        const filePath = path.join(folderPath, file);
        let commands = [];
        let mtime = null;
        let size = 0;
        let hasSyntaxError = false;
        let syntaxError = null;

        try {
          const stats = await fs.promises.stat(filePath);
          mtime = stats.mtime;
          size = stats.size;

          const content = await fs.promises.readFile(filePath, "utf-8");
          const check = checkModuleSyntax(content);
          if (!check.valid) {
            hasSyntaxError = true;
            syntaxError = check.error;
            syntaxErrorCount++;
          }

          // Check if loaded in global.plugins or read content regex safely
          if (global.plugins) {
            for (const [cmd, pInfo] of Object.entries(global.plugins)) {
              if (pInfo.name === file) {
                commands.push(cmd);
              }
            }
          }

          // Fallback static regex search if not in global.plugins yet
          if (commands.length === 0) {
            const match = content.match(/handler\.command\s*=\s*\[([^\]]+)\]/);
            if (match && match[1]) {
              commands = match[1]
                .split(",")
                .map(s => s.replace(/["'\s]/g, ""))
                .filter(Boolean);
            }
          }
        } catch (err) {
          hasSyntaxError = true;
          syntaxError = err.message;
          syntaxErrorCount++;
        }

        // Fallback default command name if commands array is empty
        if (commands.length === 0) {
          commands.push(file.replace(".js", ""));
        }

        if (!hasSyntaxError) {
          totalCommands += commands.length;
        }

        const item = {
          name: file.replace(".js", ""),
          filename: file,
          category: folder.toLowerCase(),
          commands: Array.from(new Set(commands)),
          lastModified: mtime ? mtime.toISOString() : null,
          isLoaded: !hasSyntaxError && (Object.keys(global.plugins || {}).some(k => global.plugins[k]?.name === file)),
          hasSyntaxError,
          syntaxError,
          sizeFormatted: `${(size / 1024).toFixed(1)} KB`
        };

        pluginItems.push(item);
        allPlugins.push(item);
      }

      categories.push({
        category: folder.toLowerCase(),
        displayName: folder,
        pluginCount: pluginItems.length,
        plugins: pluginItems,
      });
    }

    return {
      totalCategories: categories.length,
      totalPlugins,
      totalCommands: Math.max(totalCommands, Object.keys(global.plugins || {}).length),
      syntaxErrorCount,
      categories,
      plugins: allPlugins,
    };
  },

  async getPluginContent(category, filename) {
    const cleanCat = category.replace(/[^a-zA-Z0-9_-]/g, "");
    const cleanFile = filename.replace(/[^a-zA-Z0-9_.-]/g, "");
    const filePath = path.join(config.pluginsDir, cleanCat, cleanFile);

    if (!fs.existsSync(filePath)) {
      throw new Error(`Plugin file not found: ${cleanCat}/${cleanFile}`);
    }

    const code = await fs.promises.readFile(filePath, "utf-8");
    const check = checkModuleSyntax(code);

    return {
      category: cleanCat,
      filename: cleanFile,
      code,
      hasSyntaxError: !check.valid,
      syntaxError: check.error,
    };
  },

  async createPlugin(category, filename, code) {
    let cleanCat = (category || "tools").trim().toLowerCase().replace(/[^a-zA-Z0-9_-]/g, "");
    if (!cleanCat) cleanCat = "tools";

    let cleanFile = (filename || "newplugin.js").trim().replace(/[^a-zA-Z0-9_.-]/g, "");
    if (!cleanFile.endsWith(".js")) cleanFile += ".js";

    const targetDir = path.join(config.pluginsDir, cleanCat);
    fs.ensureDirSync(targetDir);
    const filePath = path.join(targetDir, cleanFile);

    if (fs.existsSync(filePath)) {
      throw new Error(`Plugin ${cleanCat}/${cleanFile} already exists. Use edit to update it.`);
    }

    const check = checkModuleSyntax(code);
    await fs.promises.writeFile(filePath, code, "utf-8");
    logService.add("INFO", "SYSTEM", `Created new plugin ${cleanCat}/${cleanFile}`);

    // If syntax is valid, load it dynamically into memory
    if (check.valid) {
      try {
        const plugin = await import(`file://${filePath}?t=${Date.now()}`);
        const pluginObj = plugin.default || plugin;
        const handlerFunc = typeof pluginObj === "function" ? pluginObj : pluginObj?.handler;
        const commands = pluginObj?.command;
        if (typeof handlerFunc === "function" && Array.isArray(commands)) {
          for (const cmd of commands) {
            if (!global.plugins) global.plugins = {};
            global.plugins[cmd.toLowerCase()] = {
              name: cleanFile,
              category: cleanCat,
              handler: handlerFunc,
            };
          }
        }
      } catch (e) {
        logService.add("WARN", "SYSTEM", `Runtime notice when loading new plugin ${cleanFile}: ${e.message}`);
      }
    } else {
      logService.add("WARN", "SYSTEM", `Plugin ${cleanCat}/${cleanFile} saved with syntax error: ${check.error}`);
    }

    return {
      success: true,
      category: cleanCat,
      filename: cleanFile,
      hasSyntaxError: !check.valid,
      syntaxError: check.error,
      message: check.valid 
        ? `Plugin ${cleanCat}/${cleanFile} created and loaded successfully!`
        : `Plugin ${cleanCat}/${cleanFile} created but contains syntax errors. Marked for fixing.`
    };
  },

  async savePlugin(category, filename, code) {
    const cleanCat = category.trim().toLowerCase().replace(/[^a-zA-Z0-9_-]/g, "");
    let cleanFile = filename.trim().replace(/[^a-zA-Z0-9_.-]/g, "");
    if (!cleanFile.endsWith(".js")) cleanFile += ".js";

    const targetDir = path.join(config.pluginsDir, cleanCat);
    fs.ensureDirSync(targetDir);
    const filePath = path.join(targetDir, cleanFile);

    const check = checkModuleSyntax(code);
    await fs.promises.writeFile(filePath, code, "utf-8");
    logService.add("INFO", "SYSTEM", `Updated plugin ${cleanCat}/${cleanFile}`);

    // Unregister old commands for this file
    if (global.plugins) {
      for (const [cmd, pInfo] of Object.entries(global.plugins)) {
        if (pInfo.name === cleanFile && pInfo.category === cleanCat) {
          delete global.plugins[cmd];
        }
      }
    }

    // If syntax is valid, load into memory
    if (check.valid) {
      try {
        const plugin = await import(`file://${filePath}?t=${Date.now()}`);
        const pluginObj = plugin.default || plugin;
        const handlerFunc = typeof pluginObj === "function" ? pluginObj : pluginObj?.handler;
        const commands = pluginObj?.command;
        if (typeof handlerFunc === "function" && Array.isArray(commands)) {
          for (const cmd of commands) {
            if (!global.plugins) global.plugins = {};
            global.plugins[cmd.toLowerCase()] = {
              name: cleanFile,
              category: cleanCat,
              handler: handlerFunc,
            };
          }
        }
      } catch (e) {
        logService.add("WARN", "SYSTEM", `Runtime notice when loading plugin ${cleanFile}: ${e.message}`);
      }
    } else {
      logService.add("WARN", "SYSTEM", `Plugin ${cleanCat}/${cleanFile} saved with syntax error: ${check.error}`);
    }

    return {
      success: true,
      category: cleanCat,
      filename: cleanFile,
      hasSyntaxError: !check.valid,
      syntaxError: check.error,
      message: check.valid
        ? `Plugin ${cleanCat}/${cleanFile} saved and reloaded successfully!`
        : `Plugin saved with syntax error. Marked with error tag.`
    };
  },

  async deletePlugin(category, filename) {
    const cleanCat = category.trim().toLowerCase().replace(/[^a-zA-Z0-9_-]/g, "");
    const cleanFile = filename.trim().replace(/[^a-zA-Z0-9_.-]/g, "");
    const filePath = path.join(config.pluginsDir, cleanCat, cleanFile);

    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      logService.add("WARN", "SYSTEM", `Deleted plugin ${cleanCat}/${cleanFile}`);
    }

    // Remove from global.plugins
    if (global.plugins) {
      for (const [cmd, pInfo] of Object.entries(global.plugins)) {
        if (pInfo.name === cleanFile && pInfo.category === cleanCat) {
          delete global.plugins[cmd];
        }
      }
    }

    return { success: true, message: `Plugin ${cleanCat}/${cleanFile} deleted successfully` };
  },

  async deletePluginCategory(category) {
    const cleanCat = String(category || "").trim().toLowerCase();
    if (!/^[a-z0-9_-]+$/.test(cleanCat)) {
      throw new Error("Invalid plugin category name");
    }

    const categoryPath = path.join(config.pluginsDir, cleanCat);
    const pluginsRoot = path.resolve(config.pluginsDir);
    const resolvedCategoryPath = path.resolve(categoryPath);

    if (!resolvedCategoryPath.startsWith(`${pluginsRoot}${path.sep}`)) {
      throw new Error("Invalid plugin category path");
    }
    if (!fs.existsSync(categoryPath)) {
      throw new Error(`Plugin category not found: ${cleanCat}`);
    }

    const stats = await fs.promises.stat(categoryPath);
    if (!stats.isDirectory()) {
      throw new Error(`Plugin category is not a directory: ${cleanCat}`);
    }

    await fs.promises.rm(categoryPath, { recursive: true, force: true });

    if (global.plugins) {
      for (const [command, pluginInfo] of Object.entries(global.plugins)) {
        if (pluginInfo.category === cleanCat) {
          delete global.plugins[command];
        }
      }
    }

    logService.add("WARN", "SYSTEM", `Deleted plugin category ${cleanCat}`);
    return { success: true, category: cleanCat, message: `Plugin category ${cleanCat} deleted successfully` };
  },

  async reloadPlugins() {
    logService.add("INFO", "SYSTEM", "Reloading all bot plugins into memory...");
    const pluginDir = config.pluginsDir;
    global.plugins = {};
    try {
      const folders = (await fs.promises.readdir(pluginDir, { withFileTypes: true }))
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name);
      await Promise.all(folders.map(async (folder) => {
        const folderPath = path.join(pluginDir, folder);
        const files = (await fs.promises.readdir(folderPath, { withFileTypes: true }))
          .filter((dirent) => dirent.isFile() && dirent.name.endsWith(".js"))
          .map((dirent) => dirent.name);
        await Promise.all(files.map(async (file) => {
          const filePath = path.join(folderPath, file);
          try {
            const content = await fs.promises.readFile(filePath, "utf-8");
            const check = checkModuleSyntax(content);
            if (!check.valid) {
              console.warn(`[PLUGIN SYNTAX ERROR] ${folder}/${file}: ${check.error}`);
              return;
            }

            const plugin = await import(`file://${filePath}?t=${Date.now()}`);
            const pluginObj = plugin.default || plugin;
            const handlerFunc = typeof pluginObj === "function" ? pluginObj : pluginObj?.handler;
            const commands = pluginObj?.command;
            if (typeof handlerFunc === "function" && Array.isArray(commands)) {
              const categoryName = folder.toLowerCase();
              for (const cmd of commands) {
                global.plugins[cmd.toLowerCase()] = {
                  name: file,
                  category: categoryName,
                  handler: handlerFunc,
                };
              }
            }
          } catch (e) {
            console.error(`Error reloading plugin ${file}:`, e.message);
          }
        }));
      }));
      logService.add("INFO", "SYSTEM", `Successfully reloaded ${Object.keys(global.plugins).length} command hooks.`);
      return await this.getPlugins();
    } catch (err) {
      logService.add("ERROR", "SYSTEM", `Plugin reload error: ${err.message}`);
      throw err;
    }
  },

  // --- Bot Clones Management ---
  getCloneList() {
    const activeIds = typeof listBot === "function" ? listBot() : [];
    const botsDir = config.botsDir;
    const allClones = [];

    // Check disk sessions in session/bots/
    let diskFolders = [];
    if (fs.existsSync(botsDir)) {
      diskFolders = fs.readdirSync(botsDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
    }

    const uniqueIds = Array.from(new Set([...activeIds, ...diskFolders]));

    for (const id of uniqueIds) {
      const sessionPath = path.join(botsDir, id);
      const hasCreds = fs.existsSync(path.join(sessionPath, "creds.json"));
      const isActive = activeIds.includes(id);

      allClones.push({
        id,
        number: id,
        status: isActive ? "ONLINE" : (hasCreds ? "STOPPED" : "PAIRING"),
        hasSession: hasCreds,
        uptime: isActive ? 120 : 0, // In seconds or runtime
      });
    }

    return allClones;
  },

  async createClone(number) {
    const cleanNumber = String(number).replace(/[^0-9]/g, "");
    if (!cleanNumber || cleanNumber.length < 8 || cleanNumber.length > 18) {
      throw new Error("Invalid clone phone number. Must be between 8 and 18 digits.");
    }

    logService.add("INFO", "CLONE", `Starting clone creation process for ${cleanNumber}...`);
    const result = await addBot(cleanNumber, true);

    if (result?.error) {
      throw new Error(result.message || "Failed to create clone bot");
    }

    return {
      id: cleanNumber,
      number: cleanNumber,
      isNew: result?.isNew ?? true,
      pairingCode: result?.code || null,
      status: result?.code ? "PAIRING" : "ONLINE",
    };
  },

  async removeClone(id) {
    const cleanId = String(id).replace(/[^0-9]/g, "");
    if (!cleanId) {
      throw new Error("Invalid clone ID");
    }

    logService.add("WARN", "CLONE", `Deleting clone bot ${cleanId}...`);
    const ok = delBot(cleanId, false);
    return { id: cleanId, deleted: ok };
  },

  // --- Configuration ---
  getSettings() {
    return {
      owner: global.owner || "601112260297",
      prefix: global.prefix || [".", "!", "/"],
      useOwnerToPair: !!global.useOwnerToPair,
      usePairingCode: !!global.usePairingCode,
      pairingcode: global.pairingcode || "KOBENIMD",
      wmsw: global.wmsw || "",
    };
  }
};
