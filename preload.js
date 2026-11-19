'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('smartL3arn', {
  loadData: () => ipcRenderer.invoke('db:load'),
  saveData: (data) => ipcRenderer.invoke('db:save', data),
  getAiStatus: () => ipcRenderer.invoke('ai:status'),
  testOpenRouterConnection: () => ipcRenderer.invoke('ai:test-connection'),
  getApiUsage: () => ipcRenderer.invoke('ai:usage'),
  getAiDiagnostics: () => ipcRenderer.invoke('ai:diagnostics'),
  saveOpenRouterKey: (apiKey) => ipcRenderer.invoke('ai:save-key', apiKey),
  removeOpenRouterKey: () => ipcRenderer.invoke('ai:remove-key'),
  evaluateCriteria: (input) => ipcRenderer.invoke('ai:evaluate', { ...input, evaluationScope: 'criteria' }),
  evaluateAnswer: (input) => ipcRenderer.invoke('ai:evaluate', input)
});
