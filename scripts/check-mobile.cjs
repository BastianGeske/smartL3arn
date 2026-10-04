'use strict'
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const root = path.join(__dirname, '..')
const fixture = { decks: [{ id: 'mobile-deck', name: 'Biologie – Grundlagen der Photosynthese', cards: [
  { id: 'mobile-card', front: 'Wie wandeln Pflanzen Sonnenlicht in nutzbare Energie um?',
    back: 'Durch Photosynthese wird Lichtenergie in chemische Energie umgewandelt.',
    interval: 0, repetitions: 0, easeFactor: 2.5, dueDate: '2000-01-01' },
] }] }
ipcMain.handle('db:load', () => fixture)
ipcMain.handle('db:save', () => undefined)
ipcMain.handle('ai:status', () => ({ available: true, configured: true, credentialSource: 'bundled', model: 'configured/model' }))
let evaluationCount = 0
ipcMain.handle('ai:evaluate', () => ++evaluationCount === 1
  ? { ok: false, reason: 'timeout' }
  : { ok: true, result: { verdict: 'correct', feedback: 'Richtig: Pflanzen wandeln Licht in chemische Energie um.', model: 'test/model' } })
ipcMain.handle('ai:usage', () => ({ model: 'configured/model', groups: [{
  day: '2026-10-04', model: 'provider/a-very-long-configured-model-name-for-responsive-testing',
  requests: 12, successes: 10, failures: 2, inputTokens: 4200, outputTokens: 800, totalTokens: 5000,
  cachedTokens: 1000, reasoningTokens: 200, tokenRequests: 10, costRequests: 11, costUsd: 0.01234,
}], persistenceError: false, unreadableEntries: 0 }))
ipcMain.handle('ai:diagnostics', () => ({ filename: 'test.jsonl', content: '', persistenceError: false }))
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 393, height: 852,
    webPreferences: { preload: path.join(root, 'preload.js'), partition: `mobile-check-${process.pid}` } })
  const js = source => win.webContents.executeJavaScript(source)
  try {
    await win.loadFile(path.join(root, 'web-dist/index.html'))
    await js(`localStorage.setItem('smartl3arn_language', 'de'); localStorage.setItem('ankiweb_smart_config', JSON.stringify({deckIds:['mobile-deck'], evaluationMode:'openrouter', duration:0, techniques:{typeRecall:true,confidenceCheck:true,whyPrompt:false,interleaving:true}})); location.reload()`)
    await pause(500)
    for (const width of [393, 320, 768, 1280]) {
      win.setContentSize(width, 852)
      for (const route of ['/', '/smart', '/smart/session', '/preferences', '/usage']) {
        await js(`location.hash = ${JSON.stringify('#' + route)}`)
        await pause(300)
        const metrics = await js(`({route:location.hash,width:innerWidth,scroll:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1&&getComputedStyle(e).position!=='fixed').slice(0,8).map(e=>e.className)})`)
        console.log(JSON.stringify(metrics))
        if (metrics.scroll > metrics.width) throw new Error(`Horizontal overflow: ${JSON.stringify(metrics)}`)
        const shot = await win.webContents.capturePage()
        require('node:fs').writeFileSync(`/tmp/smartl3arn-mobile-${width}-${route.replace(/\W+/g,'-') || 'home'}.png`, shot.toPNG())
        if (route === '/usage' && width <= 393) {
          await js(`document.querySelector('#usage-history-title').scrollIntoView({block:'start'})`)
          await pause(100)
          require('node:fs').writeFileSync(`/tmp/smartl3arn-mobile-${width}-usage-history.png`, (await win.webContents.capturePage()).toPNG())
          await js(`scrollTo(0,0)`)
        }
        if (width === 393 && route === '/smart/session') {
          await js(`(() => { const input = document.querySelector('#smart-answer-input'); input.value = 'Pflanzen erzeugen Zucker mithilfe von Licht.'; input.dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('.smart-answer-actions .btn-primary').click(); })()`)
          await pause(150)
          const failure = await js(`({error:!!document.querySelector('.ai-request-error'),input:document.querySelector('#smart-answer-input')?.value,graded:!!document.querySelector('.smart-feedback')})`)
          if (!failure.error || !failure.input || failure.graded) throw new Error(`AI failure silently graded: ${JSON.stringify(failure)}`)
          require('node:fs').writeFileSync('/tmp/smartl3arn-mobile-ai-error.png', (await win.webContents.capturePage()).toPNG())
          await js(`document.querySelector('.smart-answer-actions .btn-primary').click()`)
          await pause(150)
          const success = await js(`document.querySelector('.smart-feedback-score strong')?.textContent`)
          if (!success?.includes('KI')) throw new Error(`AI retry not rendered: ${success}`)
          console.log('AI failure preserves answer; successful retry displays AI evaluation.')
        }
      }
    }
    app.exit(0)
  } catch (error) { console.error(error); app.exit(1) }
})
