'use strict'

const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')

const root = path.join(__dirname, '..')
const fixture = {
  decks: [{
    id: 'smoke-deck',
    name: 'Smoke Test',
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
ipcMain.handle('db:load', () => structuredClone(fixture))
ipcMain.handle('db:save', () => undefined)
ipcMain.handle('ai:status', () => ({ available: false, configured: false }))
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
ipcMain.handle('ai:save-key', () => ({ ok: false, reason: 'unavailable' }))
ipcMain.handle('ai:remove-key', () => ({ ok: true }))
ipcMain.handle('ai:evaluate', () => ({ ok: false, reason: 'unavailable' }))

app.whenReady().then(async () => {
  const errors = []
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

  window.webContents.on('console-message', (event) => {
    if (event.level === 'error') errors.push(event.message)
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
  assert(home.decks === 1 && home.title === 'Smoke Test', 'Library data did not render')
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
    label: document.querySelector('.smart-feedback-score span')?.textContent,
    source: document.querySelector('.smart-feedback-score strong')?.textContent?.trim(),
    suggested: document.querySelectorAll('.rating-button.is-suggested').length
  })`)
  assert(evaluation.label === 'Correct', `Local answer evaluation failed: ${JSON.stringify(evaluation)}`)
  assert(evaluation.source === '100% local match', 'Local evaluation source was not shown')
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
  assert(errors.length === 0, `Renderer errors: ${errors.join('; ')}`)

  process.stdout.write(`${JSON.stringify({ home, study, smart, evaluation, usage, errors })}\n`)
  app.quit()
}).catch((error) => {
  process.stderr.write(`${error.stack || error}\n`)
  app.exit(1)
})
