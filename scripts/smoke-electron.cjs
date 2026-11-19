'use strict'

const { app, BrowserWindow, dialog, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const { configureDraftUnload } = require('../electron/draft-unload.cjs')

const root = path.join(__dirname, '..')
const longDeckName = 'A long destination deck name '.repeat(4).trim()
const fixture = {
  decks: [{
    id: 'smoke-deck',
    name: longDeckName,
    cards: [{
      id: 'smoke-card',
      front: 'What is 2 + 2?',
      back: '4',
      interval: 0,
      repetitions: 0,
      easeFactor: 2.5,
      dueDate: '2000-01-01',
    }],
  }],
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

app.disableHardwareAcceleration()
let savedData = fixture
let failSave
let aiConfigured = false
ipcMain.handle('db:load', () => structuredClone(savedData))
ipcMain.handle('db:save', (_event, data) => {
  if (failSave) {
    failSave()
    throw new Error('Simulated disk write failure')
  }
  savedData = data
})
ipcMain.handle('ai:status', () => ({ available: aiConfigured, configured: aiConfigured }))
ipcMain.handle('ai:usage', () => {
  const now = new Date()
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return {
    model: 'test/paid-model', persistenceError: false, unreadableEntries: 0,
    groups: [{
      day, model: 'test/paid-model', requests: 3, successes: 2, failures: 1,
      inputTokens: 800, outputTokens: 160, totalTokens: 960, cachedTokens: 200,
      reasoningTokens: 60, tokenRequests: 2, costRequests: 2, costUsd: 0.000352,
    }],
  }
})
ipcMain.handle('ai:diagnostics', () => ({
  filename: 'smartL3arn-openrouter-smoke.jsonl', persistenceError: false,
  content: `${JSON.stringify({ event: 'request-failure', reason: 'timeout', durationMs: 8000 })}\n`,
}))
ipcMain.handle('ai:save-key', () => ({ ok: false, reason: 'unavailable' }))
ipcMain.handle('ai:remove-key', () => ({ ok: true }))
ipcMain.handle('ai:evaluate', () => ({ ok: false, reason: 'unavailable' }))

app.whenReady().then(async () => {
  const errors = []
  const downloads = []
  const window = new BrowserWindow({
    show: false,
    width: 1100,
    height: 750,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(root, 'preload.js'),
      partition: `smartl3arn-smoke-${process.pid}`,
    },
  })

  configureDraftUnload(window)
  window.webContents.on('console-message', (event) => {
    if (event.level === 'error') errors.push(event.message)
  })
  window.webContents.session.on('will-download', (event, item) => {
    downloads.push(item.getFilename())
    event.preventDefault()
  })
  await window.loadFile(path.join(root, 'web-dist', 'index.html'))
  await window.webContents.executeJavaScript(`localStorage.setItem('smartl3arn_language', 'en');window.dispatchEvent(new StorageEvent('storage', { key: 'smartl3arn_language' }))`)
  await wait(250)

  const home = await window.webContents.executeJavaScript(`({
    heading: document.querySelector('h1')?.textContent,
    decks: document.querySelectorAll('.deck-row').length,
    title: document.querySelector('.deck-name')?.textContent,
    bridge: typeof window.smartL3arn?.loadData
  })`)
  assert(home.heading?.includes('what matters.'), 'Library view did not render')
  assert(home.decks === 1 && home.title === longDeckName, 'Library data did not render')
  assert(home.bridge === 'function', 'Electron preload bridge is unavailable')

  await window.webContents.executeJavaScript(
    `document.querySelector('.deck-row-actions .btn')?.click()`,
  )
  await wait(150)
  const study = await window.webContents.executeJavaScript(`({
    route: location.hash,
    question: document.querySelector('.flashcard-front .card-content')?.textContent
  })`)
  assert(study.route === '#/study/smoke-deck', 'Standard Study route did not open')
  assert(study.question === 'What is 2 + 2?', 'Standard Study card did not render')

  await window.webContents.executeJavaScript(`location.hash = '#/smart'`)
  await wait(150)
  await window.webContents.executeJavaScript(
    `document.querySelector('.smart-deck-row input')?.click()`,
  )
  await wait(50)
  const setup = await window.webContents.executeJavaScript(`({
    rows: document.querySelectorAll('.smart-deck-row').length,
    checked: document.querySelector('.smart-deck-row input')?.checked,
    selected: document.querySelector('.smart-deck-row')?.classList.contains('is-selected'),
    disabled: document.querySelector('.session-plan .btn-smart')?.disabled
  })`)
  await window.webContents.executeJavaScript(
    `document.querySelector('.session-plan .btn-smart')?.click()`,
  )
  await wait(1000)
  const smart = await window.webContents.executeJavaScript(`({
    route: location.hash,
    question: document.querySelector('.smart-card-front .card-content')?.textContent,
    answerInput: Boolean(document.querySelector('#smart-answer-input'))
  })`)
  assert(smart.route === '#/smart/session', `Smart Study route did not open: ${JSON.stringify({ setup, smart, errors })}`)
  assert(smart.question === 'What is 2 + 2?', 'Smart Study card did not render')
  assert(smart.answerInput, 'Smart Study answer input is unavailable')

  await window.webContents.executeJavaScript(`(() => {
    const input = document.querySelector('#smart-answer-input')
    input.value = '4'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    document.querySelector('.smart-answer-actions .btn-primary')?.click()
  })()`)
  await wait(100)
  const evaluation = await window.webContents.executeJavaScript(`({
    selfAssessment: document.querySelector('.task-self-assessment strong')?.textContent,
    answer: document.querySelector('.task-self-assessment .smart-feedback-row')?.textContent,
    ratings: document.querySelectorAll('.rating-button').length,
    suggested: document.querySelectorAll('.rating-button.is-suggested').length
  })`)
  assert(evaluation.selfAssessment === 'Self-assessment required' && evaluation.answer?.includes('4'), 'Local free-text review did not show the learner response for self-assessment')
  assert(evaluation.ratings === 4, 'Manual rating controls are missing')
  assert(evaluation.suggested === 0, 'A rating was suggested even though ratings must remain manual')

  await window.webContents.executeJavaScript(`localStorage.setItem('smartl3arn_language', 'de');window.dispatchEvent(new StorageEvent('storage', { key: 'smartl3arn_language' }));location.hash = '#/usage'`)
  await wait(150)
  const usage = await window.webContents.executeJavaScript(`({
    heading: document.querySelector('h1')?.textContent,
    rows: document.querySelectorAll('.usage-table tbody tr').length,
    projection: document.querySelector('.usage-projection-value')?.textContent,
    coverage: document.querySelector('.usage-footnote')?.textContent,
    configuredModel: document.querySelector('.usage-current-model strong')?.textContent
  })`)
  assert(usage.heading === 'API-Verbrauch', 'Usage route did not render')
  assert(usage.rows === 1 && usage.configuredModel === 'test/paid-model', 'Usage report did not render')
  assert(usage.projection.includes('1,76'), 'Usage projection incorrectly counts unknown costs as free')
  assert(usage.coverage.includes('2/3'), 'Unknown usage coverage was not displayed')
  await window.webContents.executeJavaScript(`(() => {
    const button = [...document.querySelectorAll('.usage-actions button')]
      .find((element) => element.textContent.includes('Verbindungslogs exportieren'))
    if (!button) throw new Error('Connection log export button is missing')
    button.click()
  })()`)
  await wait(150)
  assert(downloads.includes('smartL3arn-openrouter-smoke.jsonl'), 'Connection logs were not downloaded')
  assert(await window.webContents.executeJavaScript(`document.querySelector('.usage-notice[role="status"]')?.textContent.includes('Verbindungslogs exportiert')`), 'Connection log export confirmation is missing')
  await window.webContents.executeJavaScript(`(() => {
    const select = document.querySelector('.usage-filters select')
    select.value = '1'
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })()`)
  await wait(50)
  assert(await window.webContents.executeJavaScript(`document.querySelectorAll('.usage-table tbody tr').length === 1`), 'Today filter excludes today')

  if (process.env.SMARTL3ARN_SMOKE_CAPTURE_DIR) {
    const directory = process.env.SMARTL3ARN_SMOKE_CAPTURE_DIR
    fs.mkdirSync(directory, { recursive: true })
    fs.writeFileSync(path.join(directory, 'usage-light.png'), (await window.webContents.capturePage()).toPNG())
    window.setSize(600, 500)
    await window.webContents.executeJavaScript(`document.body.classList.add('dark')`)
    await wait(100)
    fs.writeFileSync(path.join(directory, 'usage-dark-small.png'), (await window.webContents.capturePage()).toPNG())
    await window.webContents.executeJavaScript(`scrollTo(0, document.body.scrollHeight)`)
    await wait(50)
    fs.writeFileSync(path.join(directory, 'usage-dark-small-table.png'), (await window.webContents.capturePage()).toPNG())
    assert(await window.webContents.executeJavaScript(`document.documentElement.scrollWidth <= innerWidth`), 'Usage view overflows the small window')
  }
  window.setSize(390, 760)
  aiConfigured = true
  await window.webContents.executeJavaScript("location.hash = '#/learn'")
  // Exercise the production hash routes, lazy chunks, native bridge and mobile layout.
  await window.webContents.executeJavaScript(`(async () => {
    async function until(read) {
      const end = Date.now() + 5000
      while (Date.now() < end) {
        const value = read()
        if (value) return value
        await new Promise(resolve => setTimeout(resolve, 20))
      }
      throw new Error('Learning path control did not appear')
    }
    async function click(label) {
      const button = await until(() => [...document.querySelectorAll('button')].find(b => !b.disabled && b.textContent.trim() === label))
      button.click()
    }
    async function answer(value) {
      const input = await until(() => document.querySelector('.task-number-input input:not(:disabled)'))
      input.value = value
      input.dispatchEvent(new Event('input', {bubbles:true}))
      await click('Antwort prüfen')
    }
    await click('Beispiel starten')
    await click('Übung beginnen')
    await answer('6')
    await click('Selbstständig anwenden')
    await until(() => document.querySelector('.task-question')?.textContent.includes('75 Bücher'))
    await answer('15')
    await until(() => document.querySelector('.path-study')?.textContent.includes('80 € auf 60 €'))
    if (document.documentElement.scrollWidth > innerWidth) throw new Error('Learning path overflows mobile window')
    if (document.activeElement?.tagName !== 'H2') throw new Error('Focus did not follow chapter unlock')
    async function fill(selector, value) {
      const input = await until(() => document.querySelector(selector))
      input.value = value
      input.dispatchEvent(new Event('input', {bubbles:true}))
    }
    await click('Übung beginnen')
    await fill('.task-cloze input[aria-label="basis"]', '50')
    await fill('.task-cloze input[aria-label="prozent"]', '20')
    await click('Antwort prüfen')
    await click('Selbstständig anwenden')
    await click('In eigenen Worten mit KI beantworten')
    await fill('textarea', '80 ist der Ausgangswert, der Anstieg beträgt 25 Prozent.')
    await click('Antwort prüfen')
    await until(() => document.body.textContent.includes('Die KI-Prüfung ist nicht verfügbar'))
    const target = document.querySelector('#path-target')
    target.closest('details').open = true
    target.value = 'smoke-deck'
    target.dispatchEvent(new Event('change', { bubbles: true }))
    if (innerWidth > 400 || target.getBoundingClientRect().right > innerWidth || document.documentElement.scrollWidth > innerWidth) {
      throw new Error('Destination deck selector overflows the phone viewport')
    }
  })()`)

  const failedWrite = new Promise(resolve => { failSave = resolve })
  await window.webContents.executeJavaScript(`(() => {
    const input = document.querySelector('.task-cloze input[aria-label="basis"]')
    input.value = '80'
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })()`)
  await Promise.race([failedWrite, wait(5000).then(() => { throw new Error('Expected a failed draft write') })])
  const reloaded = new Promise(resolve => window.webContents.once('did-finish-load', resolve))
  window.reload()
  await reloaded
  await window.webContents.executeJavaScript(`(async () => {
    for (let i = 0; i < 250; i++) {
      if (document.querySelector('.task-cloze input[aria-label="basis"]')?.value === '80') return
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    throw new Error('Electron draft was not recovered after a failed disk write')
  })()`)

  let closeOptions
  const originalDialog = dialog.showMessageBoxSync
  dialog.showMessageBoxSync = (_parent, options) => {
    closeOptions = options
    return options.defaultId
  }
  try {
    await window.webContents.executeJavaScript(`(() => {
      const original = Storage.prototype.setItem
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith('smartL3arn:path-draft:')) throw new DOMException('Storage full', 'QuotaExceededError')
        return original.call(this, key, value)
      }
      const input = document.querySelector('.task-cloze input[aria-label="prozent"]')
      input.value = '25%'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      document.querySelector('.path-actions .btn-primary').click()
    })()`, true)
    window.close()
    const deadline = Date.now() + 5000
    while (!closeOptions && !window.isDestroyed() && Date.now() < deadline) await wait(20)
    assert(closeOptions?.defaultId === 0 && closeOptions?.cancelId === 0 && !window.isDestroyed(), 'Unsafe Electron draft did not default to keeping the window open')
  } finally {
    dialog.showMessageBoxSync = originalDialog
  }
  failSave = undefined
  await window.webContents.executeJavaScript(`(async () => {
    const input = document.querySelector('.task-cloze input[aria-label="prozent"]')
    if (input.value !== '25%' || input.disabled || input.getAttribute('aria-invalid') !== 'true') throw new Error('Malformed blank consumed the check')
    input.value = '25'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    document.querySelector('.path-actions .btn-primary').click()
    for (let i = 0; i < 250; i++) {
      if (document.querySelector('.path-study h2')?.textContent === 'Lernpfad abgeschlossen') return
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    throw new Error('Valid correction did not complete the path')
  })()`)
  assert(errors.length === 0, `Renderer errors: ${errors.join('; ')}`)

  process.stdout.write(`${JSON.stringify({ home, study, smart, evaluation, usage, downloads, errors })}\n`)
  app.quit()
}).catch((error) => {
  process.stderr.write(`${error.stack || error}\n`)
  app.exit(1)
})
