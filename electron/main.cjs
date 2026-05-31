// Electron main process — desktop wrapper for Sortify
const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const fsp = fs.promises;
const os = require("os");
const NodeID3 = require('node-id3');

const AUDIO_EXTS = new Set([
  "mp3", "wav", "flac", "aac", "ogg", "m4a", "m4b", "m4r", "m4p",
  "mp4", "mpeg", "mpga", "mp2", "mpa", "opus", "wma", "wmv",
  "aiff", "aif", "aifc", "caf", "alac", "ape", "dsf", "dff",
  "dvf", "gsm", "ircam", "m3u", "m4r", "mka", "mlp", "ra", "rm",
  "snd", "tak", "tta", "voc", "vox", "wv"
]);

const isDev = !app.isPackaged;
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#1a1d24",
    // macOS: hiddenInset даёт нативный вид с traffic lights поверх контента
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    // macOS: показываем нативные кнопки управления окном
    trafficLightPosition: process.platform === "darwin" ? { x: 16, y: 16 } : undefined,
    // macOS: иконка .icns, Windows: .ico
    icon: process.platform === "darwin"
      ? path.join(__dirname, "../build/icon.icns")
      : path.join(__dirname, "../build/icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  if (isDev) {
    const devUrl = "http://localhost:8080";
    console.log(`🔧 Trying to load: ${devUrl}`);
    mainWindow.loadURL(devUrl).catch((err) => {
      console.error(`❌ Failed to load ${devUrl}:`, err.message);
      mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<h1>Error: ${err.message}</h1>`)}`);
    });
  } else {
    let indexPath = "";
    const possiblePaths = [
      path.join(__dirname, "../dist/index.html"),
      path.join(process.resourcesPath, "dist/index.html"),
      path.join(process.resourcesPath, "app.asar", "dist", "index.html"),
      path.join(__dirname, "../dist/client/index.html"),
    ];
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        indexPath = p;
        console.log(`✅ Found index.html at: ${indexPath}`);
        break;
      }
    }
    if (indexPath) {
      mainWindow.loadFile(indexPath).catch(err => {
        console.error("❌ Failed to load file:", err);
        showErrorWindow(mainWindow, err.message);
      });
    } else {
      console.error("❌ Could not find index.html in any path!");
      showErrorWindow(mainWindow, "Could not find index.html");
    }
  }

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error(`❌ Failed to load: ${errorDescription} (${errorCode})`);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('✅ Page loaded successfully');
  });

  // macOS: убираем стандартное меню (оставляем только системное)
  if (process.platform === "darwin") {
    const { Menu } = require("electron");
    // Минимальное меню для macOS (без него Cmd+C/V не работают)
    const template = [
      {
        label: app.name,
        submenu: [
          { role: "about" },
          { type: "separator" },
          { role: "services" },
          { type: "separator" },
          { role: "hide" },
          { role: "hideOthers" },
          { role: "unhide" },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      {
        label: "Edit",
        submenu: [
          { role: "undo" },
          { role: "redo" },
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { role: "selectAll" },
        ],
      },
      {
        label: "Window",
        submenu: [
          { role: "minimize" },
          { role: "zoom" },
          { type: "separator" },
          { role: "front" },
        ],
      },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  }
}

function showErrorWindow(window, errorMessage) {
  window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
    <html>
      <head><title>Error</title></head>
      <body style="background:#1a1d24;color:white;display:flex;align-items:center;justify-content:center;height:100vh;font-family:monospace;flex-direction:column;">
        <h1>❌ Failed to load application</h1>
        <p>${errorMessage}</p>
        <p>__dirname: ${__dirname}</p>
        <p>resourcesPath: ${process.resourcesPath}</p>
        <p>isPackaged: ${app.isPackaged}</p>
      </body>
    </html>
  `)}`);
}

app.whenReady().then(() => {
  console.log('🚀 App is ready');
  console.log('📦 isPackaged:', app.isPackaged);
  console.log('📁 __dirname:', __dirname);
  console.log('📁 resourcesPath:', process.resourcesPath);
  console.log('💻 Platform:', process.platform);

  createWindow();
  registerIpcHandlers();
});

app.on("window-all-closed", () => {
  // macOS: приложение остаётся активным пока явно не закрыто через Cmd+Q
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

function decodeFileName(str) {
  try {
    if (str.includes('%')) return decodeURIComponent(str);
  } catch (e) {}
  return str;
}

function registerIpcHandlers() {
  ipcMain.handle("dialog:selectFolder", async () => {
    console.log('📁 selectFolder called');
    const r = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory", "createDirectory"],
    });
    if (r.canceled || r.filePaths.length === 0) return null;
    console.log('📁 Selected folder:', r.filePaths[0]);
    return r.filePaths[0];
  });

  ipcMain.handle("dialog:selectFolderWithPreview", async () => {
    console.log('📁 Custom folder browser with preview called');
    try {
      const { createFolderBrowser } = await import('./folderBrowser.cjs');
      const selectedFolder = await createFolderBrowser();
      console.log('📁 Selected folder:', selectedFolder);
      return selectedFolder;
    } catch (err) {
      console.error('Error in folder browser:', err);
      return null;
    }
  });

  ipcMain.handle("dialog:selectFiles", async () => {
    console.log('🎵 selectFiles called');
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "Audio Files", extensions: Array.from(AUDIO_EXTS) },
        { name: "All Files", extensions: ["*"] }
      ]
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const files = [];
    for (const filePath of result.filePaths) {
      const ext = path.extname(filePath).slice(1).toLowerCase();
      if (AUDIO_EXTS.has(ext)) {
        const stat = await fsp.stat(filePath);
        files.push({ path: filePath, name: path.basename(filePath), size: stat.size, ext });
      }
    }
    return files;
  });

  ipcMain.handle("fs:checkFile", async (_e, filePath) => {
    try {
      const stats = await fsp.stat(filePath);
      if (stats.size === 0) {
        console.log(`❌ Empty file: ${path.basename(filePath)}`);
        return false;
      }
      return true;
    } catch (err) {
      console.error(`❌ File check failed: ${path.basename(filePath)}`, err.message);
      return false;
    }
  });

  ipcMain.handle("fs:checkFolderExists", async (_e, folderPath) => {
    try {
      await fsp.access(folderPath);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle("fs:getDroppedPath", async (_e, filePath) => {
    try {
      const stats = await fsp.stat(filePath);
      if (stats.isDirectory()) return filePath;
      return path.dirname(filePath);
    } catch (err) {
      console.error('Error getting path:', err);
      return null;
    }
  });

  ipcMain.handle("fs:getDesktopPath", async () => {
    const desktopPath = path.join(os.homedir(), 'Desktop');
    return desktopPath;
  });

  ipcMain.handle("fs:getFileUrl", async (_e, filePath) => {
    try {
      let decodedPath = filePath;
      try { decodedPath = decodeURIComponent(filePath); } catch(e) {}
      decodedPath = path.normalize(decodedPath);
      return `file://${decodedPath}`;
    } catch (err) {
      return null;
    }
  });

  ipcMain.handle("fs:renameFile", async (_e, oldPath, newNameWithoutExt) => {
    try {
      const dir = path.dirname(oldPath);
      const ext = path.extname(oldPath);
      const newPath = path.join(dir, newNameWithoutExt + ext);
      const exists = await fsp.access(newPath).then(() => true).catch(() => false);
      if (exists) return { ok: false, error: "File already exists" };
      await fsp.rename(oldPath, newPath);
      return { ok: true, newPath };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("fs:readTags", async (_e, filePath) => {
    try {
      const tags = NodeID3.read(filePath);
      return {
        title: tags.title,
        artist: tags.artist,
        album: tags.album,
        year: tags.year,
        genre: tags.genre,
        cover: tags.image ? {
          mime: tags.image.mime,
          type: tags.image.type,
          description: tags.image.description,
          imageBuffer: tags.image.imageBuffer.toString('base64')
        } : null
      };
    } catch (err) {
      console.error('Failed to read tags:', err);
      return null;
    }
  });

  ipcMain.handle("fs:updateTitle", async (_e, filePath, newTitle) => {
    try {
      const tags = NodeID3.read(filePath);
      tags.title = newTitle;
      const success = NodeID3.update(tags, filePath);
      return { ok: success };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("fs:updateCover", async (_e, filePath, coverBase64) => {
    try {
      const tags = NodeID3.read(filePath);
      if (coverBase64) {
        const imageBuffer = Buffer.from(coverBase64.split(',')[1] || coverBase64, 'base64');
        tags.image = {
          mime: 'image/jpeg',
          type: { id: 3, name: 'front cover' },
          description: 'Cover',
          imageBuffer,
        };
      } else {
        tags.image = null;
      }
      const success = NodeID3.update(tags, filePath);
      return { ok: success };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("fs:updateCoverOnAccept", async (_e, targetFolder, fileName, coverBase64) => {
    try {
      const destPath = path.join(targetFolder, fileName);
      const tags = NodeID3.read(destPath);
      if (coverBase64) {
        const imageBuffer = Buffer.from(coverBase64.split(',')[1] || coverBase64, 'base64');
        tags.image = {
          mime: 'image/jpeg',
          type: { id: 3, name: 'front cover' },
          description: 'Cover',
          imageBuffer,
        };
      } else {
        tags.image = null;
      }
      const success = NodeID3.update(tags, destPath);
      return { ok: success };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("fs:saveBrokenList", async (_e, folderPath, brokenFiles) => {
    try {
      const fileName = "Broken Files.txt";
      const filePath = path.join(folderPath, fileName);
      const content = [
        `Rhythm Sort - Broken Files Report`,
        `===============================`,
        `Folder: ${folderPath}`,
        `Date: ${new Date().toLocaleString()}`,
        `Total broken files: ${brokenFiles.length}`,
        ``,
        `List of broken files:`,
        `---------------------`,
        ...brokenFiles.map((f, i) => `${i + 1}. ${f.name}`)
      ].join('\n');
      await fsp.writeFile(filePath, content, 'utf-8');
      return { ok: true, filePath };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("fs:scanFolder", async (_e, folder) => {
    console.log('🔍 Scanning folder:', folder);
    const out = [];
    const skipFiles = new Set(['Thumbs.db', 'desktop.ini', '.DS_Store']);

    async function* walk(dir) {
      let entries;
      try { entries = await fsp.readdir(dir, { withFileTypes: true }); }
      catch { return; }
      for (const e of entries) {
        // macOS: пропускаем скрытые файлы и служебные папки
        if (e.name.startsWith('.')) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          yield* walk(full);
        } else if (!skipFiles.has(e.name)) {
          yield full;
        }
      }
    }

    for await (const file of walk(folder)) {
      const ext = path.extname(file).slice(1).toLowerCase();
      const fileName = path.basename(file);
      try {
        const stat = await fsp.stat(file);
        out.push({ path: file, name: fileName, size: stat.size, ext: ext || 'unknown' });
      } catch (err) {
        console.error(`❌ Error reading file: ${fileName}`, err);
      }
    }

    console.log(`📊 Found ${out.length} files in ${folder}`);
    return out;
  });

  ipcMain.handle("fs:readFile", async (_e, p) => {
    try {
      let filePath = p;
      try { filePath = decodeURIComponent(p); } catch(e) { filePath = p; }
      filePath = path.normalize(filePath);
      console.log('📖 Reading file:', path.basename(filePath));
      const buf = await fsp.readFile(filePath);
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    } catch (err) {
      console.error('❌ Error reading file:', err);
      throw err;
    }
  });

  ipcMain.handle("fs:accept", async (_e, src, targetFolder, mode) => {
    const fileName = path.basename(src);
    console.log(`✅ Accepting track: ${fileName} -> ${mode} to ${targetFolder}`);
    try {
      const folderExists = await fsp.access(targetFolder).then(() => true).catch(() => false);
      if (!folderExists) {
        return { ok: false, error: "Target folder does not exist. Please select a valid folder." };
      }
      const dest = path.join(targetFolder, fileName);
      const fileExists = await fsp.access(dest).then(() => true).catch(() => false);
      if (fileExists) {
        console.log(`⚠️ File already exists, skipping: ${fileName}`);
        return { ok: true, skipped: true, message: "File already exists" };
      }
      if (mode === "move") {
        await fsp.rename(src, dest).catch(async () => {
          await fsp.copyFile(src, dest);
          await fsp.unlink(src);
        });
      } else {
        await fsp.copyFile(src, dest);
      }
      return { ok: true, skipped: false };
    } catch (err) {
      console.error('❌ Accept error:', err);
      return { ok: false, error: String(err && err.message || err) };
    }
  });

  ipcMain.handle("fs:reject", async (_e, src, mode, rejectedFolder) => {
    console.log(`⏭️ Skipping track: ${path.basename(src)}`);
    return { ok: true };
  });
}
