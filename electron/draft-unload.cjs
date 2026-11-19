'use strict';

const { app, dialog } = require('electron');

function configureDraftUnload(win) {
  win.webContents.on('will-prevent-unload', (event) => {
    const german = app.getLocale().startsWith('de');
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      message: german ? 'Dein Lernentwurf ist noch nicht gespeichert.' : 'Your learning draft is still unsaved.',
      buttons: german ? ['Weiter bearbeiten', 'Entwurf verwerfen'] : ['Keep editing', 'Discard draft'],
      defaultId: 0,
      cancelId: 0,
    });
    // On this Electron event, preventDefault overrides the renderer's veto.
    if (choice === 1) event.preventDefault();
  });
}

module.exports = { configureDraftUnload };
