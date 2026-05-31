const { contextBridge, ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', () => {
  if (process.platform === 'darwin') {
    document.body.classList.add('is-mac');
  }
});

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  selectFolderWithPreview: () => ipcRenderer.invoke('dialog:selectFolderWithPreview'),
  selectFiles: () => ipcRenderer.invoke('dialog:selectFiles'),
  scanFolder: (folder) => ipcRenderer.invoke('fs:scanFolder', folder),
  readFileAsBuffer: (path) => ipcRenderer.invoke('fs:readFile', path),
  getFileUrl: (path) => ipcRenderer.invoke('fs:getFileUrl', path),
  checkFile: (path) => ipcRenderer.invoke('fs:checkFile', path),
  checkFolderExists: (folderPath) => ipcRenderer.invoke('fs:checkFolderExists', folderPath),
  getDroppedPath: (filePath) => ipcRenderer.invoke('fs:getDroppedPath', filePath),
  getDesktopPath: () => ipcRenderer.invoke('fs:getDesktopPath'),
  renameFile: (oldPath, newNameWithoutExt) => ipcRenderer.invoke('fs:renameFile', oldPath, newNameWithoutExt),
  readTags: (filePath) => ipcRenderer.invoke('fs:readTags', filePath),
  updateTitle: (filePath, newTitle) => ipcRenderer.invoke('fs:updateTitle', filePath, newTitle),
  updateCover: (filePath, coverBase64) => ipcRenderer.invoke('fs:updateCover', filePath, coverBase64),
  updateCoverOnAccept: (targetFolder, fileName, coverBase64) => ipcRenderer.invoke('fs:updateCoverOnAccept', targetFolder, fileName, coverBase64),
  saveBrokenList: (folderPath, brokenFiles) => ipcRenderer.invoke('fs:saveBrokenList', folderPath, brokenFiles),
  acceptTrack: (src, targetFolder, mode) => ipcRenderer.invoke('fs:accept', src, targetFolder, mode),
  rejectTrack: (src, mode, rejectedFolder) => ipcRenderer.invoke('fs:reject', src, mode, rejectedFolder),
  // Удаление папок — новые методы
  trashFolder: (folderPath) => ipcRenderer.invoke('folder-browser:trash-folder', folderPath),
  deleteFolder: (folderPath) => ipcRenderer.invoke('folder-browser:delete-folder', folderPath),
});
