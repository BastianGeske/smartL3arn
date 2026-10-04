'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('smartL3arn', {
  loadData: () => ipcRenderer.invoke('db:load'),
  saveData: (data) => ipcRenderer.invoke('db:save', data),
  getAiStatus: () => ipcRenderer.invoke('ai:status'),
  getApiUsage: () => ipcRenderer.invoke('ai:usage'),
  getAiDiagnostics: () => ipcRenderer.invoke('ai:diagnostics'),
  saveOpenRouterKey: (apiKey) => ipcRenderer.invoke('ai:save-key', apiKey),
  removeOpenRouterKey: () => ipcRenderer.invoke('ai:remove-key'),
  evaluateAnswer: (input) => ipcRenderer.invoke('ai:evaluate', input)
});
