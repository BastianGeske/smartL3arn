'use strict'
// Artificial data and in-memory IPC only; never opens or changes the real library.
const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const root = path.resolve(__dirname, '..')
const output = path.join(root, 'design-audit', 'notifications-2026-10-06')
let failSave = false
let data = { decks: [{ id: 'test', name: 'Allgemeines Wissen', coverId: 'sage', cards: [] }] }
ipcMain.handle('db:load', () => data)
ipcMain.handle('db:save', (_event, next) => {
  if (failSave) throw new Error('PRIVATE_STORAGE_PATH_AND_KEY')
  data = JSON.parse(JSON.stringify(next))
})
const pause = () => new Promise(resolve => setTimeout(resolve, 200))
const cssFile = fs.readdirSync(path.join(root, 'web-dist/assets')).find(name => /^index-.*\.css$/.test(name))
const css = fs.readFileSync(path.join(root, 'web-dist/assets', cssFile), 'utf8')
app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  let code = 0
  const errors = []
  const win = new BrowserWindow({ show: false, width: 393, height: 852,
    webPreferences: { preload: path.join(root, 'preload.js'), partition: `notifications-check-${process.pid}` } })
  win.webContents.on('console-message', (_event, details) => { if (details.level === 'error') errors.push(details.message) })
  const js = source => win.webContents.executeJavaScript(source)
  const freeze = () => js(`document.querySelectorAll('.notification:not(.notification-persistent)').forEach(node => node.dispatchEvent(new MouseEvent('mouseenter')))`)
  const menu = async () => { await js(`document.querySelector('.deck-menu > button').click()`); await pause() }
  try {
    fs.mkdirSync(output, { recursive: true })
    await win.loadFile(path.join(root, 'web-dist/index.html'))
    await js(`localStorage.setItem('smartl3arn_language','de'); location.reload()`)
    await pause()
    await js(`(() => {
      const transfer = new DataTransfer(); transfer.items.add(new File(['invalid json'], 'broken.json'));
      const input = document.querySelector('input[type=file]'); input.files = transfer.files;
      input.dispatchEvent(new Event('change', {bubbles:true}));
    })()`)
    await pause(); await freeze()
    assert.ok(await js(`document.querySelector('.notification-error')?.textContent.includes('JSON')`))
    await js(`location.hash='#/preferences'`); await pause()
    await js(`(() => {
      window.originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) { throw new Error('PRIVATE_STORAGE_PATH_AND_KEY') };
      const input = document.querySelector('#language-preference'); input.value='en'; input.dispatchEvent(new Event('change',{bubbles:true}));
      document.querySelectorAll('.appearance-options button')[1].click();
    })()`)
    await pause(); await freeze()
    assert.equal(await js(`document.querySelectorAll('.notification-error').length`), 3)
    await js(`Storage.prototype.setItem=window.originalSetItem; location.hash='#/'`); await pause()
    failSave = true
    await js(`void (window.confirm = () => true)`)
    await menu()
    await js(`document.querySelector('.floating-menu .is-danger').click()`); await pause()
    assert.equal(data.decks.length, 1)
    assert.equal(await js(`document.querySelectorAll('.deck-row').length`), 1, 'Failed deletion must preserve the visible deck')
    const metrics = []
    for (const [width, height] of [[320, 568], [393, 852], [852, 393], [1280, 900]]) {
      const safe = width === 852 ? { left: 59, right: 59, top: 0, bottom: 21 }
        : { left: 0, right: 0, top: 0, bottom: width === 1280 ? 0 : 34 }
      win.setContentSize(width, height)
      const simulatedCss = css.replace(/env\(safe-area-inset-(left|right|top|bottom)\)/g, (_match, edge) => `${safe[edge]}px`)
      await js(`(() => { let style=document.querySelector('#simulated-insets'); if(!style){style=document.createElement('style');style.id='simulated-insets';document.head.appendChild(style)} style.textContent=${JSON.stringify(simulatedCss)}; })()`)
      await pause()
      for (const editor of [false, true]) {
        if (editor) { await menu(); await js(`document.querySelector('.floating-menu .menu-item').click()`); await pause() }
        const state = await js(`(() => {
          const rect = node => { const r=node?.getBoundingClientRect(); return r ? {left:r.left,right:r.right,top:r.top,bottom:r.bottom,height:r.height}:null };
          return { stack:rect(document.querySelector('.notification-stack')), modal:rect(document.querySelector('.modal')),
            nav: getComputedStyle(document.querySelector('.app-nav')).position==='fixed' ? rect(document.querySelector('.app-nav')) : null,
            count:document.querySelectorAll('.notification').length, pageWidth:document.documentElement.scrollWidth,
            leaks:document.body.textContent.includes('PRIVATE_STORAGE_PATH_AND_KEY') };
        })()`)
        assert.ok(state.stack.left >= safe.left && state.stack.right <= width - safe.right)
        assert.ok(state.stack.top >= safe.top && state.stack.bottom <= height - safe.bottom)
        if (state.nav && state.nav.top > height / 2) assert.ok(state.stack.bottom < state.nav.top)
        if (state.modal) assert.ok(state.modal.bottom + 5 <= state.stack.top, 'Notifications must not cover dialog actions')
        assert.ok(state.count <= 3)
        assert.equal(state.leaks, false)
        assert.ok(state.pageWidth <= width)
        const name = `${width}x${height}${editor ? '-editor' : ''}`
        fs.writeFileSync(path.join(output, `${name}.png`), (await win.webContents.capturePage()).toPNG())
        metrics.push({ name, ...state })
        if (editor) { await js(`document.querySelector('.modal-footer .btn-secondary').click()`); await pause() }
      }
    }
    failSave = false
    await menu(); await js(`document.querySelector('.floating-menu .menu-item').click()`); await pause()
    await js(`document.querySelector('.modal-footer .btn-primary').click()`); await pause()
    assert.equal(await js(`document.querySelectorAll('.notification-persistent').length`), 0, 'Successful saving clears the persistent failure')
    assert.equal(errors.length, 0, errors.join('\n'))
    fs.writeFileSync(path.join(output, 'metrics.json'), JSON.stringify(metrics, null, 2))
    console.log('Import and settings errors, failed deletion, persistence recovery and eight layout states passed.')
  } catch (error) { console.error(error); code = 1 }
  finally { win.destroy(); app.exit(code) }
})
