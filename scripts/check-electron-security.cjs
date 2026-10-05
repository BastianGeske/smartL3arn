'use strict'
// Exercise the real main-process handlers with a temporary userData directory.
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const assert = require('node:assert/strict')
const root = path.resolve(__dirname, '..')
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'smartl3arn-ipc-check-'))
app.setPath('userData', directory)
app.on('browser-window-created', (_event, win) => win.hide())
require('../main.js')
const pause = () => new Promise(resolve => setTimeout(resolve, 100))
app.whenReady().then(async () => {
  try {
    const win = BrowserWindow.getAllWindows()[0]
    while (win.webContents.isLoading()) await pause()
    const evaluate = source => win.webContents.executeJavaScript(source)
    assert.deepEqual(await evaluate('window.smartL3arn.loadData()'), { decks: [] })
    const fixture = { decks: [{ id: 'test', name: 'Test', cards: [{ id: '__proto__', front: 'Question', back: 'Answer', dueDate: '2000-01-01' }] }] }
    await evaluate(`window.smartL3arn.saveData(${JSON.stringify(fixture)})`)
    const loaded = await evaluate('window.smartL3arn.loadData()')
    assert.notEqual(loaded.decks[0].cards[0].id, '__proto__')
    const rejected = await evaluate(`window.smartL3arn.saveData({decks:[{name:'bad',cards:'bad'}]}).then(()=>false,()=>true)`)
    assert.equal(rejected, true)
    assert.deepEqual(await evaluate('window.smartL3arn.loadData()'), loaded)
    const other = new BrowserWindow({ show: false, webPreferences: { preload: path.join(root, 'preload.js') } })
    await other.loadFile(path.join(root, 'web-dist/index.html'))
    assert.equal(await other.webContents.executeJavaScript('window.smartL3arn.loadData().then(()=>false,()=>true)'), true)
    console.log('Real Electron IPC: trusted loading/saving, schema validation, original preservation and foreign-window rejection passed.')
    app.exit(0)
  } catch (error) { console.error(error); app.exit(1) }
}).finally(() => { fs.rmSync(directory, { recursive: true, force: true }) })
