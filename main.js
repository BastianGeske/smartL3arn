'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

function getDbPath() {
  return path.join(app.getPath('userData'), 'ankiweb_data.json');
}

// One-time migration from the pre-rename "Anki Web" userData folder.
function migrateLegacyDataIfNeeded() {
  try {
    const newPath = getDbPath();
    if (fs.existsSync(newPath)) return;
    const legacyDir = path.join(path.dirname(app.getPath('userData')), 'Anki Web');
    const legacyPath = path.join(legacyDir, 'ankiweb_data.json');
    if (fs.existsSync(legacyPath)) {
      fs.mkdirSync(path.dirname(newPath), { recursive: true });
      fs.copyFileSync(legacyPath, newPath);
    }
  } catch (_) {}
}

function dbLoad() {
  migrateLegacyDataIfNeeded();
  try {
    const raw = fs.readFileSync(getDbPath(), 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return { decks: [] };
  }
}

function dbSave(data) {
  fs.writeFileSync(getDbPath(), JSON.stringify(data), 'utf8');
}

ipcMain.on('db:load', (event) => {
  event.returnValue = dbLoad();
});

ipcMain.on('db:save', (event, data) => {
  try {
    dbSave(data);
    event.returnValue = true;
  } catch (err) {
    event.returnValue = false;
  }
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 600,
    minHeight: 500,
    title: 'smartL3arn',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  win.loadFile(path.join(__dirname, 'index.html'));
  win.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    try { app.dock.setIcon(path.join(__dirname, 'build', 'icon.png')); } catch (_) {}
  }
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
