const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

let browserWindow = null;
let resolvePromise = null;
let handlersRegistered = false;

// Кэш папок — сбрасывается при создании/удалении/переименовании
const globalCache = new Map();

// Кроссплатформенный путь к Desktop
const DESKTOP_PATH = path.join(os.homedir(), 'Desktop');
const HOME_PATH = os.homedir();

// Системные пути для быстрого доступа
function getSystemPaths() {
  const isMac = process.platform === 'darwin';
  const isWin = process.platform === 'win32';

  if (isMac) {
    return [
      { name: '🖥️ Desktop', path: DESKTOP_PATH },
      { name: '🏠 Home', path: HOME_PATH },
      { name: '🎵 Music', path: path.join(HOME_PATH, 'Music') },
      { name: '📥 Downloads', path: path.join(HOME_PATH, 'Downloads') },
      { name: '📄 Documents', path: path.join(HOME_PATH, 'Documents') },
    ];
  } else if (isWin) {
    return [
      { name: '🖥️ Desktop', path: DESKTOP_PATH },
      { name: '🏠 Home', path: HOME_PATH },
      { name: '🎵 Music', path: path.join(HOME_PATH, 'Music') },
      { name: '📥 Downloads', path: path.join(HOME_PATH, 'Downloads') },
    ];
  }
  return [
    { name: '🖥️ Desktop', path: DESKTOP_PATH },
    { name: '🏠 Home', path: HOME_PATH },
  ];
}

async function getDrives() {
  const items = [];

  // Всегда добавляем быстрые пути
  for (const sp of getSystemPaths()) {
    try {
      await fs.access(sp.path);
      items.push({ name: sp.name, path: sp.path, isDirectory: true });
    } catch (e) {}
  }

  // На Windows добавляем диски
  if (process.platform === 'win32') {
    const letters = 'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    for (const letter of letters) {
      try {
        const drivePath = letter + ':\\';
        await fs.access(drivePath);
        items.push({ name: `💿 ${letter}:`, path: drivePath, isDirectory: true });
      } catch (e) {}
    }
  }

  // На macOS добавляем /Volumes
  if (process.platform === 'darwin') {
    try {
      const volumes = await fs.readdir('/Volumes', { withFileTypes: true });
      for (const v of volumes) {
        if (v.isDirectory() && !v.name.startsWith('.')) {
          items.push({ name: `💿 ${v.name}`, path: `/Volumes/${v.name}`, isDirectory: true });
        }
      }
    } catch (e) {}
  }

  return items;
}

async function scanDirectoryFast(dirPath) {
  // Возвращаем кэш только если он свежий
  if (globalCache.has(dirPath)) {
    return globalCache.get(dirPath);
  }

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const items = [];

    const skipFiles = new Set(['Thumbs.db', '.DS_Store', 'desktop.ini', '._.DS_Store', '.localized']);
    const audioExts = new Set(['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'mp4', 'opus', 'wma', 'flac', 'aiff']);

    for (const entry of entries) {
      if (skipFiles.has(entry.name)) continue;
      if (entry.name.startsWith('._')) continue;
      if (entry.name.startsWith('.')) continue;

      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        items.push({
          name: entry.name,
          path: fullPath,
          isDirectory: true,
          isShortcut: false,
          isAudio: false,
          size: 0,
        });
        continue;
      }

      // Windows .lnk shortcuts
      if (process.platform === 'win32' && entry.name.toLowerCase().endsWith('.lnk')) {
        try {
          const { exec } = require('child_process');
          const util = require('util');
          const execP = util.promisify(exec);
          const escaped = fullPath.replace(/\\/g, '\\\\');
          const ps = `(New-Object -ComObject WScript.Shell).CreateShortcut('${escaped}').TargetPath`;
          const { stdout } = await execP(`powershell -Command "${ps}"`, { timeout: 2000 });
          const target = stdout.trim();
          if (target) {
            try {
              const stat = await fs.stat(target);
              if (stat.isDirectory()) {
                items.push({
                  name: entry.name.replace(/\.lnk$/i, ''),
                  path: target,
                  isDirectory: true,
                  isShortcut: true,
                  isAudio: false,
                  size: 0,
                });
              }
            } catch (e) {}
          }
        } catch (e) {}
        continue;
      }

      const ext = entry.name.split('.').pop()?.toLowerCase() || '';
      if (audioExts.has(ext)) {
        items.push({
          name: entry.name,
          path: fullPath,
          isDirectory: false,
          isShortcut: false,
          isAudio: true,
          size: 0,
        });
      }
    }

    items.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

    globalCache.set(dirPath, items);
    return items;
  } catch (error) {
    console.error('Error scanning directory:', error);
    return [];
  }
}

// Инвалидируем кэш папки и её родителя
function invalidateCache(dirPath) {
  globalCache.delete(dirPath);
  const parent = path.dirname(dirPath);
  if (parent !== dirPath) globalCache.delete(parent);
}

async function createFolder(parentPath, folderName) {
  const newPath = path.join(parentPath, folderName);
  try {
    await fs.mkdir(newPath, { recursive: true });
    invalidateCache(parentPath); // Сбрасываем кэш — новая папка должна появиться
    return { success: true, path: newPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function renameFolder(oldPath, newName) {
  const dir = path.dirname(oldPath);
  const newPath = path.join(dir, newName);
  try {
    await fs.rename(oldPath, newPath);
    invalidateCache(dir);
    invalidateCache(oldPath);
    return { success: true, newPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function deleteFolder(folderPath) {
  try {
    await fs.rm(folderPath, { recursive: true, force: true });
    invalidateCache(path.dirname(folderPath));
    invalidateCache(folderPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function registerHandlers() {
  if (handlersRegistered) return;

  ipcMain.handle('folder-browser:get-drives', async () => {
    return await getDrives();
  });

  ipcMain.handle('folder-browser:scan', async (event, dirPath) => {
    const items = await scanDirectoryFast(dirPath);
    return { success: true, items };
  });

  // Принудительное сканирование без кэша (для кнопки Refresh)
  ipcMain.handle('folder-browser:scan-fresh', async (event, dirPath) => {
    invalidateCache(dirPath);
    const items = await scanDirectoryFast(dirPath);
    return { success: true, items };
  });

  ipcMain.handle('folder-browser:create-folder', async (event, parentPath, folderName) => {
    return await createFolder(parentPath, folderName);
  });

  ipcMain.handle('folder-browser:rename-folder', async (event, oldPath, newName) => {
    return await renameFolder(oldPath, newName);
  });

  ipcMain.handle('folder-browser:delete-folder', async (event, folderPath) => {
    return await deleteFolder(folderPath);
  });

  ipcMain.on('folder-browser:select', (event, folderPath) => {
    if (resolvePromise) {
      resolvePromise(folderPath);
      resolvePromise = null;
    }
    if (browserWindow) browserWindow.close();
  });

  ipcMain.on('folder-browser:cancel', () => {
    if (resolvePromise) {
      resolvePromise(null);
      resolvePromise = null;
    }
    if (browserWindow) browserWindow.close();
  });

  handlersRegistered = true;
}

function createFolderBrowser() {
  registerHandlers();

  if (browserWindow) {
    browserWindow.focus();
    return new Promise((resolve) => { resolvePromise = resolve; });
  }

  const parentWindow = BrowserWindow.getFocusedWindow();
  const isMac = process.platform === 'darwin';

  browserWindow = new BrowserWindow({
    width: 850,
    height: 650,
    parent: parentWindow || undefined,
    modal: !!parentWindow,
    show: false,
    movable: true,
    // macOS: hiddenInset чтобы traffic lights были внутри окна
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    title: 'Select Music Folder',
  });

  // Кроссплатформенный путь — используем JSON чтобы безопасно передать в HTML
  const desktopPathJson = JSON.stringify(DESKTOP_PATH);
  const homePathJson = JSON.stringify(HOME_PATH);
  const isMacJson = JSON.stringify(isMac);
  const sepJson = JSON.stringify(path.sep);

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Select Music Folder</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, 'Segoe UI', system-ui, sans-serif;
      background: #1e1e2e;
      color: #cdd6f4;
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .title-bar {
      -webkit-app-region: drag;
      background: #313244;
      padding: ${isMac ? '12px 12px 12px 80px' : '12px'};
      text-align: center;
      font-weight: bold;
      border-bottom: 1px solid #45475a;
      user-select: none;
      font-size: 14px;
    }
    .toolbar {
      padding: 10px 12px;
      background: #313244;
      border-bottom: 1px solid #45475a;
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: nowrap;
      -webkit-app-region: no-drag;
    }
    select {
      flex: 1;
      padding: 7px 10px;
      background: #1e1e2e;
      color: #cdd6f4;
      border: 1px solid #45475a;
      border-radius: 6px;
      font-size: 13px;
      cursor: pointer;
      min-width: 0;
    }
    select:hover { background: #45475a; }
    .action-btn {
      background: #45475a;
      padding: 7px 11px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      white-space: nowrap;
      border: none;
      color: #cdd6f4;
      flex-shrink: 0;
    }
    .action-btn:hover { background: #585b70; }
    .path-bar {
      padding: 6px 12px;
      background: #1e1e2e;
      font-size: 11px;
      font-family: monospace;
      color: #89b4fa;
      border-bottom: 1px solid #45475a;
      word-break: break-all;
      min-height: 28px;
    }
    .stats {
      padding: 5px 12px;
      background: #313244;
      font-size: 11px;
      color: #a6adc8;
      border-bottom: 1px solid #45475a;
    }
    .content {
      flex: 1;
      overflow-y: auto;
      padding: 6px;
    }
    .item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 7px 12px;
      cursor: pointer;
      border-radius: 6px;
      margin-bottom: 2px;
      transition: background 0.1s;
    }
    .item:hover { background: #313244; }
    .item.selected { background: #89b4fa; color: #1e1e2e; }
    .item.disabled { opacity: 0.45; cursor: default; pointer-events: none; }
    .icon { font-size: 16px; width: 24px; flex-shrink: 0; }
    .name { flex: 1; font-size: 13px; word-break: break-word; }
    .info { font-size: 10px; color: #6c7086; flex-shrink: 0; }
    .item.selected .info { color: #1e1e2e; }
    .empty { text-align: center; padding: 40px; color: #6c7086; }
    .footer {
      padding: 10px 12px;
      border-top: 1px solid #45475a;
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      background: #313244;
      -webkit-app-region: no-drag;
    }
    button.cancel {
      padding: 8px 16px; border: none; border-radius: 6px;
      cursor: pointer; font-weight: bold; font-size: 13px;
      background: #45475a; color: #cdd6f4;
    }
    button.cancel:hover { background: #585b70; }
    button.select-btn {
      padding: 8px 16px; border: none; border-radius: 6px;
      cursor: pointer; font-weight: bold; font-size: 13px;
      background: #89b4fa; color: #1e1e2e;
    }
    button.select-btn:hover { background: #b4befe; }
    .modal {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.65);
      display: flex; justify-content: center; align-items: center;
      z-index: 1000;
    }
    .modal-content {
      background: #313244; padding: 22px; border-radius: 10px; min-width: 320px;
    }
    .modal-content h3 { margin-bottom: 12px; font-size: 15px; }
    .modal-content input {
      width: 100%; padding: 9px 10px;
      background: #1e1e2e; border: 1px solid #45475a; border-radius: 6px;
      color: #cdd6f4; font-size: 13px; margin-bottom: 14px;
    }
    .modal-buttons { display: flex; gap: 8px; justify-content: flex-end; }
    .modal-buttons button {
      padding: 7px 14px; border: none; border-radius: 6px;
      cursor: pointer; font-size: 13px; font-weight: bold;
      background: #45475a; color: #cdd6f4;
    }
    .modal-buttons button.ok { background: #89b4fa; color: #1e1e2e; }
    .modal-buttons button:hover { opacity: 0.85; }
    .context-menu {
      position: fixed; background: #313244;
      border: 1px solid #45475a; border-radius: 8px;
      padding: 4px 0; min-width: 140px; z-index: 1000;
      box-shadow: 0 4px 14px rgba(0,0,0,0.35);
    }
    .context-menu-item {
      padding: 8px 14px; cursor: pointer; font-size: 13px;
    }
    .context-menu-item:hover { background: #89b4fa; color: #1e1e2e; }
  </style>
</head>
<body>
  <div class="title-bar">📁 Select Music Folder</div>
  <div class="toolbar">
    <select id="driveSelect">
      <option value="">📁 Quick access...</option>
    </select>
    <button class="action-btn" id="upBtn">⬆ Up</button>
    <button class="action-btn" id="desktopBtn">🖥️ Desktop</button>
    <button class="action-btn" id="refreshBtn">🔄</button>
    <button class="action-btn" id="newFolderBtn">📁 New</button>
  </div>
  <div class="path-bar" id="currentPath"></div>
  <div class="stats" id="stats">Loading...</div>
  <div class="content" id="content"></div>
  <div class="footer">
    <button id="cancelBtn" class="cancel">Cancel</button>
    <button id="selectBtn" class="select-btn">✅ Select This Folder</button>
  </div>

  <script>
    const { ipcRenderer } = require('electron');
    const pathModule = require('path');

    // Пути переданы из Node.js — кроссплатформенно корректны
    const DESKTOP_PATH = ${desktopPathJson};
    const HOME_PATH = ${homePathJson};
    const IS_MAC = ${isMacJson};
    const SEP = ${sepJson};

    let currentPath = '';
    let items = [];
    let selectedPath = '';
    let isLoading = false;

    function escapeHtml(text) {
      const d = document.createElement('div');
      d.textContent = text;
      return d.innerHTML;
    }

    function getParentPath(p) {
      const parent = pathModule.dirname(p);
      if (parent === p) return null; // корень
      return parent;
    }

    function showModal(title, defaultValue, callback) {
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = \`
        <div class="modal-content">
          <h3>\${escapeHtml(title)}</h3>
          <input type="text" id="modalInput" value="\${escapeHtml(defaultValue)}">
          <div class="modal-buttons">
            <button id="modalCancel">Cancel</button>
            <button class="ok" id="modalOk">OK</button>
          </div>
        </div>
      \`;
      document.body.appendChild(modal);
      const input = modal.querySelector('#modalInput');
      setTimeout(() => { input.focus(); input.select(); }, 50);
      const confirm = () => {
        const v = input.value.trim();
        if (v) callback(v);
        modal.remove();
      };
      modal.querySelector('#modalOk').onclick = confirm;
      modal.querySelector('#modalCancel').onclick = () => modal.remove();
      input.onkeydown = (e) => {
        if (e.key === 'Enter') confirm();
        if (e.key === 'Escape') modal.remove();
      };
    }

    function showConfirm(title, callback) {
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = \`
        <div class="modal-content">
          <h3>\${escapeHtml(title)}</h3>
          <div class="modal-buttons">
            <button id="modalNo">No</button>
            <button class="ok" id="modalYes">Yes</button>
          </div>
        </div>
      \`;
      document.body.appendChild(modal);
      modal.querySelector('#modalYes').onclick = () => { callback(true); modal.remove(); };
      modal.querySelector('#modalNo').onclick = () => { callback(false); modal.remove(); };
    }

    async function loadDrives() {
      const drives = await ipcRenderer.invoke('folder-browser:get-drives');
      const select = document.getElementById('driveSelect');
      select.innerHTML = '<option value="">📁 Quick access...</option>';
      for (const d of drives) {
        const opt = document.createElement('option');
        opt.value = d.path;
        opt.textContent = d.name;
        select.appendChild(opt);
      }
    }

    function updateStats() {
      const folders = items.filter(i => i.isDirectory).length;
      const audio = items.filter(i => i.isAudio).length;
      document.getElementById('stats').textContent =
        '📁 Folders: ' + folders + '   🎵 Audio: ' + audio;
    }

    function highlightSelected() {
      const container = document.getElementById('content');
      for (const child of container.children) {
        const p = child.getAttribute('data-path');
        child.classList.toggle('selected', p === selectedPath);
      }
    }

    function createFolderElement(folder) {
      const div = document.createElement('div');
      div.className = 'item' + (selectedPath === folder.path ? ' selected' : '');
      div.setAttribute('data-path', folder.path);
      div.innerHTML = \`
        <div class="icon">\${folder.isShortcut ? '🔗' : '📁'}</div>
        <div class="name">\${escapeHtml(folder.name)}</div>
        <div class="info">\${folder.isShortcut ? 'shortcut' : ''}</div>
      \`;
      div.onclick = (e) => {
        e.stopPropagation();
        selectedPath = folder.path;
        highlightSelected();
      };
      div.ondblclick = (e) => {
        e.stopPropagation();
        loadDirectory(folder.path);
      };
      div.oncontextmenu = (e) => {
        e.preventDefault();
        selectedPath = folder.path;
        highlightSelected();
        showContextMenu(e.clientX, e.clientY, folder);
      };
      return div;
    }

    function showContextMenu(x, y, folder) {
      document.querySelector('.context-menu')?.remove();
      const menu = document.createElement('div');
      menu.className = 'context-menu';
      menu.style.left = x + 'px';
      menu.style.top = y + 'px';
      menu.innerHTML = \`
        <div class="context-menu-item" data-action="rename">✏️ Rename</div>
        <div class="context-menu-item" data-action="delete">🗑️ Delete</div>
      \`;
      document.body.appendChild(menu);
      menu.querySelector('[data-action="rename"]').onclick = () => {
        renameFolderItem(folder.path, folder.name);
        menu.remove();
      };
      menu.querySelector('[data-action="delete"]').onclick = () => {
        deleteFolderItem(folder.path, folder.name);
        menu.remove();
      };
      setTimeout(() => {
        const close = (e) => {
          if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', close); }
        };
        document.addEventListener('click', close);
      }, 100);
    }

    async function loadDirectory(dirPath, fresh) {
      if (!dirPath || isLoading) return;
      isLoading = true;
      currentPath = dirPath;
      document.getElementById('currentPath').textContent = dirPath;
      document.getElementById('content').innerHTML = '<div class="empty">Loading...</div>';

      try {
        const channel = fresh ? 'folder-browser:scan-fresh' : 'folder-browser:scan';
        const result = await ipcRenderer.invoke(channel, dirPath);
        if (result.success) {
          items = result.items;
          renderItems();
          updateStats();
        } else {
          document.getElementById('content').innerHTML = '<div class="empty">❌ Cannot read this folder</div>';
        }
      } catch (err) {
        document.getElementById('content').innerHTML = '<div class="empty">❌ ' + escapeHtml(err.message) + '</div>';
      } finally {
        isLoading = false;
      }
    }

    function renderItems() {
      const container = document.getElementById('content');
      if (items.length === 0) {
        container.innerHTML = '<div class="empty">📁 Empty folder</div>';
        return;
      }
      container.innerHTML = '';
      for (const item of items) {
        if (item.isDirectory) {
          container.appendChild(createFolderElement(item));
        } else if (item.isAudio) {
          const div = document.createElement('div');
          div.className = 'item disabled';
          div.innerHTML = '<div class="icon">🎵</div><div class="name">' + escapeHtml(item.name) + '</div><div class="info">audio</div>';
          container.appendChild(div);
        }
      }
    }

    async function createNewFolder() {
      const names = items.filter(i => i.isDirectory).map(i => i.name);
      let base = 'New Folder';
      let n = 1;
      while (names.includes(base)) { n++; base = 'New Folder (' + n + ')'; }

      showModal('New Folder Name', base, async (folderName) => {
        const result = await ipcRenderer.invoke('folder-browser:create-folder', currentPath, folderName);
        if (result.success) {
          // Перезагружаем папку без кэша чтобы увидеть новую папку
          await loadDirectory(currentPath, true);
          selectedPath = result.path;
          highlightSelected();
        } else {
          alert('Failed to create folder: ' + result.error);
        }
      });
    }

    async function renameFolderItem(itemPath, currentName) {
      showModal('Rename Folder', currentName, async (newName) => {
        if (newName === currentName) return;
        const result = await ipcRenderer.invoke('folder-browser:rename-folder', itemPath, newName);
        if (result.success) {
          // Перезагружаем без кэша
          await loadDirectory(currentPath, true);
          if (selectedPath === itemPath) selectedPath = result.newPath;
          highlightSelected();
        } else {
          alert('Failed to rename: ' + result.error);
        }
      });
    }

    async function deleteFolderItem(itemPath, itemName) {
      showConfirm('Delete "' + itemName + '"? This cannot be undone.', async (confirmed) => {
        if (!confirmed) return;
        const result = await ipcRenderer.invoke('folder-browser:delete-folder', itemPath);
        if (result.success) {
          await loadDirectory(currentPath, true);
          if (selectedPath === itemPath) selectedPath = '';
        } else {
          alert('Failed to delete: ' + result.error);
        }
      });
    }

    // Кнопки
    document.getElementById('driveSelect').onchange = (e) => {
      if (e.target.value) {
        selectedPath = '';
        loadDirectory(e.target.value);
        e.target.value = ''; // сбрасываем select чтобы можно было выбрать тот же пункт снова
      }
    };

    document.getElementById('upBtn').onclick = () => {
      const parent = getParentPath(currentPath);
      if (parent) { selectedPath = ''; loadDirectory(parent); }
    };

    document.getElementById('desktopBtn').onclick = () => {
      selectedPath = '';
      loadDirectory(DESKTOP_PATH);
    };

    document.getElementById('refreshBtn').onclick = () => {
      loadDirectory(currentPath, true); // принудительно без кэша
    };

    document.getElementById('newFolderBtn').onclick = () => createNewFolder();

    document.getElementById('selectBtn').onclick = () => {
      const folder = selectedPath || currentPath;
      if (folder) {
        ipcRenderer.send('folder-browser:select', folder);
      } else {
        alert('Select a folder first');
      }
    };

    document.getElementById('cancelBtn').onclick = () => {
      ipcRenderer.send('folder-browser:cancel');
    };

    // Клик по пустому месту — снимаем выделение
    document.getElementById('content').onclick = (e) => {
      if (e.target === e.currentTarget) {
        selectedPath = '';
        highlightSelected();
      }
    };

    // Запуск — открываем Desktop
    window.onload = async () => {
      await loadDrives();
      loadDirectory(DESKTOP_PATH);
    };
  </script>
</body>
</html>`;

  browserWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  browserWindow.once('ready-to-show', () => browserWindow.show());

  browserWindow.on('closed', () => {
    browserWindow = null;
    if (resolvePromise) {
      resolvePromise(null);
      resolvePromise = null;
    }
  });

  return new Promise((resolve) => { resolvePromise = resolve; });
}

module.exports = { createFolderBrowser };
