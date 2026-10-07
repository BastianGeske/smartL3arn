'use strict'
// Isolated UI verification: artificial decks, in-memory storage, no real user data.
const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const root = path.resolve(__dirname, '..')
const output = path.join(root, 'design-audit', 'deck-covers-2026-10-06')
let data = { decks: [
  { id: 'cover-test', name: 'Allgemeines Wissen', coverId: 'rose', cards: [] },
  { id: 'second', name: 'Biologie', cards: [] },
] }
ipcMain.handle('db:load', () => data)
ipcMain.handle('db:save', (_event, next) => { data = JSON.parse(JSON.stringify(next)) })
const pause = () => new Promise(resolve => setTimeout(resolve, 150))
app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  let code = 0
  const win = new BrowserWindow({ show: false, width: 393, height: 852,
    webPreferences: { preload: path.join(root, 'preload.js'), partition: `covers-check-${process.pid}` } })
  const js = source => win.webContents.executeJavaScript(source)
  const edit = async () => {
    await js(`document.querySelector('.deck-menu > button').click()`)
    await pause()
    await js(`document.querySelector('.floating-menu .menu-item').click()`)
    await pause()
  }
  try {
    fs.mkdirSync(output, { recursive: true })
    await win.loadFile(path.join(root, 'web-dist/index.html'))
    await js(`localStorage.setItem('smartl3arn_language','de'); location.reload()`)
    await pause()
    for (const [width, height] of [[320, 568], [393, 852], [852, 393], [1280, 900]]) {
      win.setContentSize(width, height)
      await edit()
      await js(`Promise.all([...document.querySelectorAll('.deck-editor-modal img')].map(image => image.decode()))`)
      const metrics = await js(`(() => {
        const dialog = document.querySelector('.deck-editor-modal'), footer = dialog.querySelector('.modal-footer');
        const rect = dialog.getBoundingClientRect(), bottom = footer.getBoundingClientRect();
        const images = [...dialog.querySelectorAll('img')];
        return { width: innerWidth, height: innerHeight, left: rect.left, right: rect.right, top: rect.top,
          bottom: rect.bottom, footerBottom: bottom.bottom, pageWidth: document.documentElement.scrollWidth,
          loaded: images.filter(image => image.complete && image.naturalWidth > 0).length, count: images.length };
      })()`)
      assert.equal(metrics.loaded, 13, 'All cover assets must load')
      assert.equal(metrics.count, 13)
      assert.ok(metrics.left >= 0 && metrics.right <= width && metrics.top >= 0 && metrics.bottom <= height)
      assert.ok(metrics.footerBottom <= height, 'Save action must stay visible')
      assert.ok(metrics.pageWidth <= width, 'No horizontal page overflow')
      fs.writeFileSync(path.join(output, `editor-${width}x${height}.png`), (await win.webContents.capturePage()).toPNG())
      await js(`document.querySelector('input[value="graphite"]').focus()`)
      await pause()
      fs.writeFileSync(path.join(output, `editor-${width}x${height}-last.png`), (await win.webContents.capturePage()).toPNG())
      await js(`document.querySelector('.modal-footer .btn-secondary').click()`)
      await pause()
      console.log(JSON.stringify(metrics))
    }
    await edit()
    await js(`document.querySelector('input[value="mint"]').click(); document.querySelector('.modal-footer .btn-primary').click()`)
    await pause()
    assert.equal(data.decks[0].coverId, 'mint')
    await js('location.reload()')
    await pause()
    assert.ok(await js(`document.querySelector('.deck-cover img').src.endsWith('deck-mint.png')`))
    await edit()
    await js(`document.querySelector('input[value="navy"]').click(); document.querySelector('.modal-footer .btn-secondary').click()`)
    await pause()
    assert.equal(data.decks[0].coverId, 'mint')
    await js(`window.confirm = () => false; document.querySelector('.deck-menu > button').click()`)
    await pause()
    await js(`document.querySelector('.floating-menu .is-danger').click()`)
    await pause()
    assert.equal(data.decks.length, 2, 'Declining deletion must preserve the deck')
    await js(`window.confirm = () => true; document.querySelector('.deck-menu > button').click()`)
    await pause()
    await js(`document.querySelector('.floating-menu .is-danger').click()`)
    await pause()
    assert.equal(data.decks.length, 1)
    assert.equal(data.decks[0].id, 'second')
    assert.equal(data.decks[0].coverId, 'teal')
    console.log('Cover selection, reload persistence, cancellation and confirmed deck deletion passed.')
  } catch (error) { console.error(error); code = 1 }
  finally { win.destroy(); app.exit(code) }
})
