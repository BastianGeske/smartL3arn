'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

function getDbPath() {
  return path.join(app.getPath('userData'), 'ankiweb_data.json');
}

// One-time migration from the pre-rename "Anki Web" userData folder.
async function migrateLegacyDataIfNeeded() {
  try {
    const newPath = getDbPath();
    if (fs.existsSync(newPath)) return;
    const legacyDir = path.join(path.dirname(app.getPath('userData')), 'Anki Web');
    const legacyPath = path.join(legacyDir, 'ankiweb_data.json');
    if (fs.existsSync(legacyPath)) {
      await fs.promises.mkdir(path.dirname(newPath), { recursive: true });
      await fs.promises.copyFile(legacyPath, newPath);
    }
  } catch (_) {}
}

async function dbLoad() {
  await migrateLegacyDataIfNeeded();
  try {
    const raw = await fs.promises.readFile(getDbPath(), 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return { decks: [] };
  }
}

async function dbSave(data) {
  const target = getDbPath();
  const temporary = `${target}.tmp`;
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  await fs.promises.writeFile(temporary, JSON.stringify(data), 'utf8');
  await fs.promises.rename(temporary, target);
}

ipcMain.handle('db:load', () => dbLoad());
ipcMain.handle('db:save', async (_event, data) => {
  await dbSave(data);
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

  win.loadFile(path.join(__dirname, 'web-dist', 'index.html'));
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
