'use strict';

const { app, BrowserWindow, ipcMain, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const { createCredentialResolver } = require('./electron/credentials.cjs');
const { createUsageStore } = require('./electron/usage.cjs');
const { createDiagnosticStore } = require('./electron/diagnostics.cjs');
const {
  createCredentialStore,
  createOpenRouterClient,
  publicError,
} = require('./electron/openrouter.cjs');

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

let openRouter;
let diagnosticStore;
function getDiagnosticStore() {
  if (!diagnosticStore) {
    diagnosticStore = createDiagnosticStore(
      path.join(app.getPath('userData'), 'openrouter-debug.jsonl'),
      { appVersion: app.getVersion() },
    );
  }
  return diagnosticStore;
}

function recordDiagnostic(entry) {
  return getDiagnosticStore().record(entry)
    .catch(() => console.warn('Could not save OpenRouter diagnostics.'));
}

function getOpenRouterClient() {
  if (!openRouter) {
    openRouter = createOpenRouterClient({
      model: getCredentialResolver().model,
      onDiagnostic: recordDiagnostic,
    });
  }
  return openRouter;
}

function getCredentialStore() {
  return createCredentialStore({
    safeStorage,
    fs,
    filePath: path.join(app.getPath('userData'), 'openrouter-key.bin'),
  });
}

let credentialResolver;
function getCredentialResolver() {
  if (!credentialResolver) {
    credentialResolver = createCredentialResolver({
      envPath: path.join(app.isPackaged ? app.getPath('userData') : __dirname, '.env'),
      buildConfigPath: app.isPackaged
        ? path.join(process.resourcesPath, 'openrouter-build-config.json') : undefined,
      store: getCredentialStore(),
    });
  }
  return credentialResolver;
}

ipcMain.handle('ai:status', async () => {
  if (process.platform !== 'darwin') {
    return { available: false, configured: false, credentialSource: null };
  }
  return { available: true, ...await getCredentialResolver().status() };
});

ipcMain.handle('ai:save-key', async (_event, apiKey) => {
  try {
    await getOpenRouterClient().validateKey(apiKey, { credentialSource: 'provided' });
    await getCredentialStore().write(String(apiKey).trim());
    return { ok: true };
  } catch (error) {
    await recordDiagnostic({
      event: 'credential-failure', operation: 'validate-key', reason: publicError(error).reason,
    });
    return publicError(error);
  } finally {
    if (diagnosticStore) await diagnosticStore.flush();
  }
});

ipcMain.handle('ai:remove-key', async () => {
  try {
    await getCredentialStore().remove();
    return { ok: true };
  } catch (error) {
    return publicError(error);
  }
});

let usageStore;
function getUsageStore() {
  if (!usageStore) {
    usageStore = createUsageStore(path.join(app.getPath('userData'), 'api-usage.jsonl'));
  }
  return usageStore;
}

ipcMain.handle('ai:usage', async () => ({
  ...await getUsageStore().report(),
  model: getCredentialResolver().model,
}));

ipcMain.handle('ai:diagnostics', () => getDiagnosticStore().snapshot());

ipcMain.handle('ai:evaluate', async (_event, input) => {
  let attempted = false;
  let responseMetadata;
  let outcome = 'failure';
  try {
    const resolver = getCredentialResolver();
    const { credentialSource } = await resolver.status();
    const apiKey = await resolver.read();
    if (!apiKey) {
      await recordDiagnostic({ event: 'evaluation-skipped', reason: 'not-configured', model: resolver.model });
      return { ok: false, reason: 'not-configured' };
    }
    attempted = true;
    const result = await getOpenRouterClient().evaluate(apiKey, input, (body) => {
      responseMetadata = body;
    }, { credentialSource });
    outcome = 'success';
    return { ok: true, result };
  } catch (error) {
    if (error?.code === 'invalid-input') {
      attempted = false;
      await recordDiagnostic({ event: 'evaluation-skipped', reason: 'invalid-input' });
    } else if (!attempted) {
      await recordDiagnostic({ event: 'credential-failure', reason: publicError(error).reason });
    }
    return publicError(error);
  } finally {
    if (diagnosticStore) await diagnosticStore.flush();
    if (attempted) {
      await getUsageStore().record({
        model: typeof responseMetadata?.model === 'string'
          ? responseMetadata.model : getCredentialResolver().model,
        outcome,
        usage: responseMetadata?.usage,
      }).catch(() => console.warn('Could not save API usage.'));
    }
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

  win.loadFile(path.join(__dirname, 'web-dist', 'index.html'));
  win.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    try { app.dock.setIcon(path.join(__dirname, 'build', 'icon.png')); } catch (_) {}
  }
  createWindow();
  getCredentialResolver().status().then((status) => recordDiagnostic({
    event: 'configuration', model: getCredentialResolver().model, ...status,
  })).catch(() => recordDiagnostic({ event: 'credential-failure', reason: 'unavailable' }));
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
