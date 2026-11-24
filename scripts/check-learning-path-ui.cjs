'use strict'
// Isolated, synthetic learning-path audit. No personal database or provider requests.
const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const root = path.join(__dirname, '..')
const stage = process.argv.includes('--before') ? 'before' : 'after'
const output = path.join(root, 'design-audit/learning-path-2026-11-23', stage)
app.disableHardwareAcceleration()
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'smartl3arn-path-audit-')))
let fixture
ipcMain.handle('db:load', () => structuredClone(fixture))
ipcMain.handle('db:save', (_event, data) => { fixture = structuredClone(data) })
ipcMain.handle('ai:status', () => ({ available: true, configured: true, credentialSource: 'stored', model: 'synthetic/audit' }))
ipcMain.handle('ai:evaluate', () => ({ ok: false, reason: 'timeout' }))
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
app.whenReady().then(async () => {
  fs.mkdirSync(output, { recursive: true })
  const { freshProgress, normalizePath } = await import('../shared/learning-paths.mjs')
  const content = normalizePath(JSON.parse(fs.readFileSync(path.join(root, 'docs/learning-path.rounds.example.json'), 'utf8')))
  const code = normalizePath(JSON.parse(fs.readFileSync(path.join(root, 'docs/learning-path.example.json'), 'utf8')))
  code.id = 'code-audit'; code.version = 1; code.title = 'Programmieren: Listen auswerten'
  const goal = code.chapters[0].objectives[0]
  goal.goal = 'Gerade Zahlen in einer Liste mit Python zählen.'; goal.requiredEvidence = 'code'
  for (const activity of goal.checks) activity.written = {
    input: 'code', language: 'Python', question: 'Implementiere count_even(values). Zähle gerade Ganzzahlen, auch null und negative Werte. Eine leere Liste liefert 0. Die Eingabe bleibt unverändert.',
    reference: 'def count_even(values):\n    return sum(1 for v in values if v % 2 == 0)',
    criteria: [{ id: 'behavior', description: 'Zählt gerade Zahlen auch bei leerer Liste, null und negativen Werten, ohne die Eingabe zu verändern.' }],
    paraphrase: 'def count_even(values):\n    n = 0\n    for v in values:\n        if v % 2 == 0:\n            n += 1\n    return n',
    partial: 'def count_even(values):\n    return 0', misconception: 'def count_even(values):\n    return len(values)'
  }
  const metrics = [], errors = []
  const win = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { preload: path.join(root, 'preload.js'), partition: 'path-audit-' + process.pid, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } })
  win.webContents.on('console-message', e => { if (e.level === 'error') errors.push(e.message) })
  win.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_d, cb) => cb({ cancel: true }))
  const run = js => win.webContents.executeJavaScript(js)
  const snapshot = () => run(`Array.from(document.querySelectorAll('button,input,textarea,summary')).filter(e=>e.getClientRects().length).map(e=>({tag:e.tagName,label:e.getAttribute('aria-label')||e.textContent?.trim(),disabled:e.disabled})).filter(e=>e.label)`)
  const click = async label => {
    const state = await snapshot()
    if (!state.some(e => e.tag === 'BUTTON' && e.label === label && !e.disabled)) throw new Error('Missing enabled control: ' + label + ' state=' + JSON.stringify(state) + ' errors=' + JSON.stringify(errors))
    await run(`Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()===${JSON.stringify(label)}&&!e.disabled).click()`)
    await wait(180)
    return snapshot()
  }
  const field = async (label, value) => {
    await snapshot()
    await run(`(()=>{const e=document.querySelector('input[aria-label='+${JSON.stringify(JSON.stringify(label))}+']') || (${JSON.stringify(label)}==='Ergebnis' ? document.querySelector('.path-task-panel input') : null);if(!e)throw new Error('Missing input');e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`)
    await wait(50)
  }
  let counter = 0
  const capture = async (profile, name, focus = '.path-study') => {
    if (focus) await run(`document.querySelector(${JSON.stringify(focus)})?.scrollIntoView({block:'start'})`)
    await wait(130)
    const filename = String(++counter).padStart(2, '0') + '-' + profile + '-' + name + '.png'
    fs.writeFileSync(path.join(output, filename), (await win.webContents.capturePage()).toPNG())
    const state = await snapshot()
    const geometry = await run(`({width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth+1,focus:document.activeElement?.outerHTML.slice(0,250),focusTop:document.activeElement?.getBoundingClientRect().top})`)
    metrics.push({ filename, ...geometry, controls: state })
    console.log(filename, JSON.stringify({overflow:geometry.overflow,explanation:state.some(e=>e.label==='Erklärung nachlesen')}))
  }
  const load = async (rows, route) => {
    fixture = { decks: [], learningPaths: rows }
    await win.loadURL('about:blank')
    await win.webContents.session.clearStorageData()
    await win.loadFile(path.join(root, 'web-dist/index.html'), { hash: route })
    await wait(250)
    await run(`(()=>{localStorage.setItem('smartl3arn_language','de');window.dispatchEvent(new StorageEvent('storage',{key:'smartl3arn_language',newValue:'de'}))})()`)
    await snapshot()
  }
  const codeRow = () => ({ content: code, progress: { ...freshProgress(), phase: 'check', variant: 0, draft: {kind:'text',value:''}, seenChecks: [goal.checks[0].id] } })
  for (const [profile, width, height] of [['desktop',1280,900], ['phone',390,844]]) {
    win.setContentSize(width, height)
    await load([{ content, progress: freshProgress() }], '/learn/' + content.id + '@1')
    await capture(profile, 'lesson', null)
    await click('Übung beginnen')
    await capture(profile, 'practice')
    await field('basis','80'); await field('prozent','20'); await click('Antwort prüfen')
    await capture(profile, 'incorrect')
    await field('prozent','25'); await click('Antwort prüfen')
    await capture(profile, 'correct')
    // Baseline records the blocked return; revised UI exercises the working return.
    if ((await snapshot()).some(e=>e.label==='Erklärung nachlesen')) {
      await click('Erklärung nachlesen'); await capture(profile, 'explanation'); await click('Zur Aufgabe zurück')
    }
    await click('Nächste Übung')
    await field('Ergebnis','25'); await click('Antwort prüfen'); await click('Nächste Übung')
    await field('Ergebnis','20'); await click('Antwort prüfen'); await click('Selbstkontrolle starten')
    await capture(profile, 'self-check')
    await field('basis','90'); await field('prozent','20'); await click('Antwort prüfen')
    await capture(profile, 'self-check-feedback')
    const past = { ...freshProgress(), passed: [content.chapters[0].objectives[0].id], reviews: [{objectiveId:content.chapters[0].objectives[0].id, learnedOn:'2026-11-01',dueDate:'2026-11-02',seen:[]}] }
    await load([{content,progress:past}], '/learn/' + content.id + '@1?review=1')
    await capture(profile, 'review')
    if (stage === 'after') {
      await click('Erklärung nachlesen'); await capture(profile, 'review-explanation'); await click('Zur Aufgabe zurück')
    }
    await load([codeRow()], '/learn/' + code.id + '@1')
    await capture(profile, 'code-local')
    if ((await snapshot()).some(e=>e.label==='Code schreiben und mit KI prüfen')) {
      await click('Code schreiben und mit KI prüfen'); await capture(profile, 'code')
    } else console.log('CODE SETUP', JSON.stringify(await snapshot()), JSON.stringify(errors))
  }
  fs.writeFileSync(path.join(output, 'metrics.json'), JSON.stringify({metrics,errors}, null, 2))
  console.log('audit captured', metrics.length, 'screens;', errors.length, 'console errors')
  app.quit()
}).catch(error => { console.error(error); app.exit(1) })
