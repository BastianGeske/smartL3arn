'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('db', {
  load: () => ipcRenderer.sendSync('db:load'),
  save: (data) => ipcRenderer.sendSync('db:save', data)
});
