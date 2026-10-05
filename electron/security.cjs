'use strict'

function isAppUrl(url, expectedUrl) {
  return typeof url === 'string' && url.split('#')[0] === expectedUrl
}
function isTrustedSender(event, webContents, appUrl) {
  return Boolean(webContents && event.sender === webContents
    && event.senderFrame === webContents.mainFrame && isAppUrl(event.senderFrame?.url, appUrl))
}
function configureWindowSecurity(win, appUrl) {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  for (const event of ['will-navigate', 'will-frame-navigate', 'will-redirect']) {
    win.webContents.on(event, (navigation, url) => {
      if (!isAppUrl(url, appUrl)) navigation.preventDefault()
    })
  }
  win.webContents.on('will-attach-webview', event => event.preventDefault())
  win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  win.webContents.session.setPermissionCheckHandler(() => false)
}
module.exports = { isTrustedSender, configureWindowSecurity }
