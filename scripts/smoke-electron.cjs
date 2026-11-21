'use strict'

const { app, BrowserWindow, dialog, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const { configureDraftUnload } = require('../electron/draft-unload.cjs')

const root = path.join(__dirname, '..')
const pathFixture = fs.readFileSync(path.join(root, 'docs', 'learning-path.example.json'), 'utf8')
const roundsFixture = fs.readFileSync(path.join(root, 'docs', 'learning-path.rounds.example.json'), 'utf8')
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

async function pressKey(contents, key, keyCode, modifiers = 0) {
  const devtools = contents.debugger
  devtools.attach('1.3')
  try {
    const event = { key, code: key, windowsVirtualKeyCode: keyCode, modifiers }
    const text = key === 'Enter' ? '\r' : undefined
    await devtools.sendCommand('Input.dispatchKeyEvent', { ...event, type: text ? 'keyDown' : 'rawKeyDown', text })
    await devtools.sendCommand('Input.dispatchKeyEvent', { ...event, type: 'keyUp' })
  } finally { devtools.detach() }
}

async function checkLearningRounds(window, directory) {
  const run = script => window.webContents.executeJavaScript(script)
  const helpers = `${until.toString()}
    async function click(label) {
      const button = await until(() => [...document.querySelectorAll('button')].find(b =>
        !b.disabled && b.getClientRects().length && b.textContent.trim() === label))
      button.click()
    }
    async function fill(value, name) {
      const selector = '.path-local-response .task-number-input input:not(:disabled)' + (name ? '[aria-label="' + name + '"]' : '')
      const input = await until(() => document.querySelector(selector))
      input.value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    async function answer(value) {
      await fill(value)
      await click('Antwort prüfen')
    }`
  const checkLayout = async stage => {
    for (const [width, height] of [[390, 760], [1100, 750]]) {
      window.setSize(width, height)
      for (const dark of [false, true]) {
        await run(`document.body.classList.toggle('dark', ${dark})`)
        await wait(75)
        const fits = await run(`(() => {
          const panel = document.querySelector('.path-answer-feedback, .path-round-summary')
          const bounds = panel.getBoundingClientRect()
          return bounds.width > 0 && bounds.left >= 0 && bounds.right <= innerWidth &&
            panel.scrollWidth <= panel.clientWidth && document.documentElement.scrollWidth <= innerWidth
        })()`)
        assert(fits, 'Learning-path ' + stage + ' overflows at ' + width + 'px')
        if (directory) {
          await run(`document.querySelector('.path-round-summary h2, .path-answer-feedback h3').scrollIntoView({ block: 'start' })`)
          await wait(75)
          const name = 'round-' + stage + '-' + width + (dark ? '-dark' : '-light') + '.png'
          fs.writeFileSync(path.join(directory, name), (await window.webContents.capturePage()).toPNG())
        }
      }
    }
    window.setSize(390, 760)
  }

  await run(`(async () => {
    ${helpers}
    location.hash = '#/learn'
    const input = await until(() => document.querySelector('input[type="file"][accept=".json,application/json"]'))
    const transfer = new DataTransfer()
    transfer.items.add(new File([${JSON.stringify(roundsFixture)}], 'learning-path.rounds.example.json', { type: 'application/json' }))
    input.files = transfer.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await until(() => location.hash.startsWith('#/learn/prozentuale-aenderung'))
    await click('Übung beginnen')
    await fill('80', 'basis')
    await fill('20', 'prozent')
    await click('Antwort prüfen')
    await until(() => document.querySelector('.path-feedback-list [data-correct="true"]'))
    await until(() => document.activeElement === document.querySelector('.path-answer-feedback h3'))
    if (!document.querySelector('.path-feedback-list [data-correct="false"]')) throw new Error('Partial feedback omitted the missed blank')
    if (document.querySelector('.path-feedback-solution')) throw new Error('Practice solution was exposed before asking for it')
  })()`)
  await checkLayout('feedback')

  await run(`(async () => {
    ${helpers}
    await click('Lösung ansehen')
    await until(() => document.querySelector('.path-feedback-solution[open]'))
    for (const value of ['25', '20']) {
      await click('Nächste Übung')
      await answer(value)
    }
    await until(() => document.querySelector('.path-round-brief')?.textContent.includes('4 von 5'))
    await click('Selbstkontrolle starten')
    await fill('72', 'basis')
    await fill('20', 'prozent')
    await click('Antwort prüfen')
    await until(() => document.querySelector('.path-answer-feedback[data-verdict="partial"] .path-result-title'))
    if (document.querySelector('.path-feedback-solution, .path-feedback-list')) throw new Error('Self-check details were exposed mid-round')
    for (const value of ['15', '10', '37,5', '15']) {
      await click('Nächste Aufgabe')
      await answer(value)
    }
    await until(() => document.querySelector('.path-round-score')?.textContent.trim() === '4 von 5 selbstständig richtig')
    await until(() => document.activeElement === document.querySelector('.path-round-summary h2'))
    document.querySelector('.path-round-results summary').focus()
  })()`)
  await pressKey(window.webContents, 'Enter', 13)
  assert(await run(`document.querySelector('.path-round-results details[open] .path-feedback-part strong')?.textContent.trim() === '72'`),
    'Keyboard activation did not show the submitted answer in the round summary')
  await checkLayout('summary')
  await run(`(async () => {
    ${helpers}
    await click('Lernpfad abschließen')
    await until(() => document.querySelector('.path-study h2')?.textContent === 'Lernpfad abgeschlossen')
  })()`)
}

// Serialized into the renderer when waiting for the learning-path flow.
async function until(read) {
  const end = Date.now() + 5000
  while (Date.now() < end) {
    const value = read()
    if (value) return value
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error('Learning path step did not complete: ' + location.hash + ' ' + document.querySelector('.path-study h2')?.textContent)
}

async function checkPathTimer(window, captureDirectory) {
  const contents = window.webContents
  const run = script => contents.executeJavaScript(script)
  const badge = 'document.querySelector(".path-focus-trigger")'
  const popup = 'document.querySelector(".path-focus-dialog")'
  const initialDark = await run('document.body.classList.contains("dark")')
  const capture = async name => {
    if (captureDirectory) fs.writeFileSync(path.join(captureDirectory, name + '.png'), (await contents.capturePage()).toPNG())
  }
  for (const phone of [false, true]) {
    window.setSize(...(phone ? [390, 760] : [1100, 750]))
    for (const dark of [false, true]) {
      const variant = (phone ? 'phone' : 'desktop') + (dark ? '-dark' : '-light')
      const initial = await run(`(() => {
        document.body.classList.toggle('dark', ${dark})
        const badge = ${badge}
        const popup = ${popup}
        badge.click()
        return popup.matches(':modal') &&
          popup.querySelector('[role="timer"]').textContent.trim() === '25:00' &&
          document.activeElement === popup.querySelector('.btn-primary')
      })()`)
      assert(initial, 'Timer setup did not open as a focused 25-minute dialog on ' + variant)
      await wait(180)
      const fits = await run(`(() => {
        const popup = ${popup}
        const bounds = popup.getBoundingClientRect()
        const buttons = [...popup.querySelectorAll('button')].filter(button => button.getClientRects().length)
        const aligned = ${phone} ? Math.abs(innerHeight - bounds.bottom) < 2 :
          Math.abs((bounds.top + bounds.bottom) / 2 - innerHeight / 2) < 2
        return aligned && bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 &&
          popup.scrollWidth <= popup.clientWidth && document.documentElement.scrollWidth <= innerWidth &&
          buttons.every(button => button.getBoundingClientRect().height >= 44 && button.scrollWidth <= button.clientWidth)
      })()`)
      assert(fits, 'Timer layout or touch targets do not fit on ' + variant)
      await capture('timer-setup-' + variant)
      if (!phone && !dark) {
        await pressKey(contents, 'Tab', 9, 8)
        assert(await run(`document.activeElement === ${popup}.querySelector('.path-focus-close')`), 'Shift+Tab did not move within the timer dialog')
        await pressKey(contents, 'Escape', 27)
        assert(await run(`!${popup}.open && document.activeElement === ${badge}`), 'Escape did not close the timer dialog and restore its trigger')
        await run(`${badge}.click()`)
      }
      await run(`${popup}.querySelector('.btn-primary').click()`)
      await wait(50)
      assert(await run(`!${popup}.open && document.activeElement === ${badge} &&
        /^2[45]:/.test(${badge}.textContent.trim()) && document.documentElement.scrollWidth <= innerWidth`),
      'Timer did not become a countdown badge on ' + variant)
      if (phone && dark) {
        await capture('timer-running-phone-dark')
        const finished = await run(`(() => {
          const task = document.querySelector('.path-active-study .path-actions .btn')
          task.focus()
          const now = Date.now
          try {
            Date.now = () => now() + 25 * 60_000
            document.dispatchEvent(new Event('visibilitychange'))
          } finally { Date.now = now }
          return document.activeElement === task && !${popup}.open
        })()`)
        assert(finished, 'Timer expiry moved focus or opened the popup')
        await wait(100)
        assert(await run(`${badge}.textContent.trim() === 'Zeit abgelaufen' &&
          document.querySelector('.notification-stack [role="status"]')?.textContent.includes('Zeit abgelaufen')`),
        'Timer expiry did not update the badge and banner')
        await capture('timer-finished-phone-dark')
        await run(`document.querySelector('.notification-stack .notification-dismiss').click()`)
      }
      await run(`${badge}.click()`)
      if (phone && !dark) {
        await run(`${popup}.querySelector('.btn-primary').click()`)
        await wait(180)
        await capture('timer-paused-phone-light')
      }
      await run(`${popup}.querySelector('.path-focus-actions .btn-secondary').click()`)
      assert(await run(`!${popup}.open && ${badge}.textContent.trim() === 'Lerntimer'`),
        'Clearing the timer did not return to its idle state on ' + variant)
    }
  }
  await run(`document.body.classList.toggle('dark', ${initialDark})`)
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

  const directory = process.env.SMARTL3ARN_SMOKE_CAPTURE_DIR
  if (directory) {
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
    ${until.toString()}
    const importInput = await until(() => document.querySelector('input[type="file"][accept=".json,application/json"]'))
    const transfer = new DataTransfer()
    transfer.items.add(new File([${JSON.stringify(pathFixture)}], 'learning-path.example.json', { type: 'application/json' }))
    importInput.files = transfer.files
    importInput.dispatchEvent(new Event('change', { bubbles: true }))
    await until(() => location.hash.startsWith('#/learn/') && document.querySelector('.path-active-study'))
  })()`)
  await checkPathTimer(window, directory)
  await window.webContents.executeJavaScript(`(async () => {
    ${until.toString()}
    async function click(label) {
      const button = await until(() => [...document.querySelectorAll('button')].find(b => !b.disabled && b.textContent.trim() === label))
      button.click()
    }
    async function answer(value) {
      const input = await until(() => document.querySelector('.task-number-input input:not(:disabled)'))
      input.value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await click('Antwort prüfen')
    }
    await click('Übung beginnen')
    await answer('6')
    await click('Selbstständig anwenden')
    await until(() => document.querySelector('.task-question')?.textContent.includes('75 Bücher'))
    await answer('15')
    await until(() => document.querySelector('#path-pass-heading')?.textContent === 'Lernziel erreicht')
    await until(() => document.activeElement === document.querySelector('#path-pass-heading'))
    await click('Weiter zum nächsten Lernziel')
    const nextHeading = await until(() => document.querySelector('.path-active-study h2'))
    await until(() => document.activeElement === nextHeading)
    await click('Antwort und Erklärung anzeigen')
    await until(() => document.querySelector('.path-active-study .path-example')?.textContent.includes('80 € auf 60 €'))
    if (document.documentElement.scrollWidth > innerWidth) throw new Error('Learning path overflows mobile window')
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
    await fill('#written-answer', '80 ist der Ausgangswert, der Anstieg beträgt 25 Prozent.')
    await click('Antwort prüfen')
    await until(() => document.querySelector('.path-task-panel .path-notice')?.textContent.includes('Deine Antwort ist gespeichert'))
    await until(() => document.querySelector('.path-local-response input[aria-label="basis"]:not(:disabled)'))
    const tools = await until(() => document.querySelector('.path-tools'))
    tools.open = true
    tools.querySelector('.path-transfer').open = true
    const target = await until(() => tools.querySelector('#path-target'))
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
      window.restoreSmokeStorage = () => { Storage.prototype.setItem = original }
      const input = document.querySelector('.task-cloze input[aria-label="prozent"]')
      input.value = '25%'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      document.querySelector('.path-response-actions .btn-primary').click()
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
    document.querySelector('.path-response-actions .btn-primary').click()
    for (let i = 0; i < 250; i++) {
      if (document.querySelector('.path-study h2')?.textContent === 'Lernpfad abgeschlossen') return
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    throw new Error('Valid correction did not complete the path')
  })()`)
  await window.webContents.executeJavaScript('window.restoreSmokeStorage()')
  await checkLearningRounds(window, directory)
  assert(errors.length === 0, `Renderer errors: ${errors.join('; ')}`)

  process.stdout.write(`${JSON.stringify({ home, study, smart, evaluation, usage, downloads, errors })}\n`)
  app.quit()
}).catch((error) => {
  process.stderr.write(`${error.stack || error}\n`)
  app.exit(1)
})
