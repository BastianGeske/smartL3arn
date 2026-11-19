'use strict';

const { app, BrowserWindow, ipcMain, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('node:url');
const { isTrustedSender, configureWindowSecurity } = require('./electron/security.cjs');
const { configureDraftUnload } = require('./electron/draft-unload.cjs');
const validation = import('./shared/data-validation.mjs');
const appUrl = pathToFileURL(path.join(__dirname, 'web-dist', 'index.html')).href;
let mainWindow;
function handle(channel, callback) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedSender(event, mainWindow?.webContents, appUrl)) throw new Error('Untrusted IPC request.');
    return callback(event, ...args);
  });
}
function localToday() {
  const date = new Date();
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}
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

const { loadLibrary } = require('./electron/library.cjs');

let pendingLoad;
function dbLoad() {
  if (pendingLoad) return pendingLoad;
  const target = getDbPath();
  const legacy = path.join(path.dirname(app.getPath('userData')), 'Anki Web', path.basename(target));
  pendingLoad = loadLibrary(target, legacy, localToday()).finally(() => { pendingLoad = undefined; });
  return pendingLoad;
}

async function dbSave(data) {
  const validator = await validation;
  const raw = JSON.stringify(validator.normalizeAppData(data, localToday()));
  validator.checkDataSize(raw);
  const target = getDbPath();
  const temporary = `${target}.tmp`;
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  await fs.promises.writeFile(temporary, raw, { encoding: 'utf8', mode: 0o600 });
  await fs.promises.rename(temporary, target);
}

handle('db:load', () => dbLoad());
handle('db:save', async (_event, data) => {
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

handle('ai:status', async () => {
  if (process.platform !== 'darwin') {
    return { available: false, configured: false, credentialSource: null };
  }
  return { available: true, ...await getCredentialResolver().status(), model: getCredentialResolver().model };
});

let testingConnection = false;
handle('ai:test-connection', async () => {
  if (process.platform !== 'darwin') return { ok: false, reason: 'unavailable' };
  if (testingConnection) return { ok: false, reason: 'rate-limit' };
  testingConnection = true;
  try {
    const resolver = getCredentialResolver();
    const { credentialSource } = await resolver.status();
    const apiKey = await resolver.read();
    if (!apiKey) return { ok: false, reason: 'not-configured' };
    await getOpenRouterClient().validateKey(apiKey, { credentialSource });
    return { ok: true };
  } catch (error) {
    return publicError(error);
  } finally {
    testingConnection = false;
    if (diagnosticStore) await diagnosticStore.flush();
  }
});

handle('ai:save-key', async (_event, apiKey) => {
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

handle('ai:remove-key', async () => {
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

handle('ai:usage', async () => ({
  ...await getUsageStore().report(),
  model: getCredentialResolver().model,
}));

handle('ai:diagnostics', () => getDiagnosticStore().snapshot());

let activeEvaluations = 0;
handle('ai:evaluate', async (_event, input) => {
  if (activeEvaluations >= 2) return { ok: false, reason: 'rate-limit' };
  activeEvaluations += 1;
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
    activeEvaluations -= 1;
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
      sandbox: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow = win;
  configureWindowSecurity(win, appUrl);
  configureDraftUnload(win);
  win.loadFile(path.join(__dirname, 'web-dist', 'index.html'));
  win.setMenuBarVisibility(false);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      if (app.isReady()) createWindow();
      return;
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  app.whenReady().then(() => {
    if (process.platform === 'darwin') {
      try { app.dock.setIcon(path.join(__dirname, 'build', 'icon.png')); } catch (_) {}
    }
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
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
}
