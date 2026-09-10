'use strict'

const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')

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
  await wait(250)

  const home = await window.webContents.executeJavaScript(`({
    heading: document.querySelector('h1')?.textContent,
    decks: document.querySelectorAll('.deck-row').length,
    title: document.querySelector('.deck-name')?.textContent,
    bridge: typeof window.smartL3arn?.loadData
  })`)
  assert(home.heading === 'Library', 'Library view did not render')
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
  assert(errors.length === 0, `Renderer errors: ${errors.join('; ')}`)

  process.stdout.write(`${JSON.stringify({ home, study, smart, errors })}\n`)
  app.quit()
}).catch((error) => {
  process.stderr.write(`${error.stack || error}\n`)
  app.exit(1)
})
