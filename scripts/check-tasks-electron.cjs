'use strict'

// Isolated UI check: sample deck, in-memory partition, mock AI, no real database or API.
const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const assert = require('node:assert/strict')
const root = path.join(__dirname, '..')
const output = path.join(root, 'design-evidence', 'task-types')
const aiRequests = []
let fixture
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
app.disableHardwareAcceleration()
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'smartl3arn-task-ui-'))
app.setPath('userData', profile)
ipcMain.handle('db:load', () => structuredClone(fixture))
ipcMain.handle('db:save', () => undefined)
ipcMain.handle('ai:status', () => ({ available: true, configured: true, credentialSource: 'stored' }))
ipcMain.handle('ai:usage', () => ({ model: 'test/model', groups: [], persistenceError: false, unreadableEntries: 0 }))
ipcMain.handle('ai:diagnostics', () => ({ filename: 'test.jsonl', content: '', persistenceError: false }))
ipcMain.handle('ai:evaluate', (_event, input) => {
  aiRequests.push(input)
  return { ok: true, result: { verdict: input.evaluationScope === 'working' ? 'incorrect' : 'correct', feedback: 'Test feedback.',
    ...(input.evaluationScope === 'answer_and_working' ? { working: { verdict: 'correct', feedback: 'Working is correct.' } } : {}) } }
})
function emptyResponse(task) {
  if (task.kind === 'calculation' && task.answer.kind === 'fraction') return { kind: 'fraction', numerator: '', denominator: '' }
  if (task.kind === 'calculation' && task.answer.kind === 'quantity') return { kind: 'quantity', value: '', unit: '' }
  if (['single_choice', 'multiple_choice'].includes(task.kind)) return { kind: 'selection', ids: [] }
  if (task.kind === 'true_false') return { kind: 'boolean', value: null }
  if (['cloze', 'matching'].includes(task.kind)) return { kind: 'fields', values: {} }
  if (task.kind === 'ordering') return { kind: 'order', ids: [...task.correctOrder].reverse() }
  return { kind: 'text', value: '' }
}
app.whenReady().then(async () => {
  const { normalizeDeck } = await import('../shared/data-validation.mjs')
  const deck = normalizeDeck(JSON.parse(fs.readFileSync(path.join(root, 'docs/task-types.example.json'), 'utf8')), { today: '2000-01-01' })
  fixture = { decks: [deck] }
  fs.mkdirSync(output, { recursive: true })
  const win = new BrowserWindow({ show: false, width: 1100, height: 820, webPreferences: {
    preload: path.join(root, 'preload.js'), partition: `task-test-${process.pid}`, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false,
  } })
  const errors = [], external = [], logs = []
  win.webContents.on('console-message', event => { logs.push(`${event.level}: ${event.message}`); if (event.level === 'error') errors.push(event.message) })
  win.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => { external.push(details.url); callback({ cancel: true }) })
  const run = code => win.webContents.executeJavaScript(code)
  const store = name => `document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get(${JSON.stringify(name)})`
  const until = async (code, message) => {
    for (let n = 0; n < 80; n++) { if (await run(code)) return; await wait(50) }
    throw new Error(message + '\n' + logs.slice(-8).join('\n'))
  }
  const route = async hash => { await run(`location.hash = ${JSON.stringify(hash)}`); await wait(120) }
  const capture = async name => {
    await wait(120)
    fs.writeFileSync(path.join(output, `${name}.png`), (await win.webContents.capturePage()).toPNG())
    assert.equal(await run('document.documentElement.scrollWidth > innerWidth'), false, `Page overflow: ${name}`)
    const overflow = await run('Array.from(document.querySelectorAll(".modal")).some(e => e.scrollWidth > e.clientWidth + 1)')
    if (overflow) {
      const details = await run(`Array.from(document.querySelectorAll('.modal')).map(e=>({width:e.clientWidth,scroll:e.scrollWidth,children:Array.from(e.querySelectorAll('*')).filter(c=>{const r=c.getBoundingClientRect();return r.width>0&&r.right>e.getBoundingClientRect().right+1}).map(c=>({tag:c.tagName,cls:c.className,right:c.getBoundingClientRect().right})).slice(0,12)}))`)
      throw new Error(`Editor overflow: ${name}: ${JSON.stringify(details)}`)
    }
  }
  await win.loadFile(path.join(root, 'web-dist', 'index.html'))
  await until('Boolean(document.querySelector("#app").__vue_app__)', 'App did not mount')
  await run("(()=>{const style=document.createElement('style');style.textContent='*,*::before,*::after{animation:none!important;transition:none!important}';document.head.appendChild(style)})()")
  await run("localStorage.setItem('smartl3arn_language','de'); window.dispatchEvent(new StorageEvent('storage',{key:'smartl3arn_language'}))")
  await route('#/smart')
  await run(`(()=>{const s=${store('settings')};s.smartConfig.deckIds=[${JSON.stringify(deck.id)}];s.smartConfig.duration=0;s.smartConfig.evaluationMode='local';s.smartConfig.techniques.typeRecall=true})()`)
  const start = async card => {
    await run(`(async()=>{const s=${store('smart-study')};await s.start();s.session.queue=[{deckId:${JSON.stringify(deck.id)},cardId:${JSON.stringify(card.id)}}];s.session.index=0;s.session.response=${JSON.stringify(emptyResponse(card.task))};s.session.typedAnswer=''})()`)
    await route('#/smart/session')
    await until('Boolean(document.querySelector(".task-response"))', 'Answer control did not render')
  }
  const cards = process.argv.includes('--quick') ? deck.cards.filter(card => card.id === 'formula') : deck.cards
  for (const width of [1100, 390]) {
    win.setContentSize(width, 820)
    for (const card of cards) {
      await start(card)
      if (card.task.kind === 'calculation' && card.task.answer.kind === 'formula') await until('Boolean(document.querySelector("math-field"))', 'Mathfield did not initialize')
      await run('scrollTo(0,0)')
      await capture(`${width}-${card.id}-question`)
      await run(`(async()=>{
        const task=${JSON.stringify(card.task)}, back=${JSON.stringify(card.back)};
        const pause=()=>new Promise(resolve=>setTimeout(resolve,20));
        const input=async(element,value)=>{if(!element)throw new Error('Missing input');element.value=value;element.dispatchEvent(new Event('input',{bubbles:true}));element.dispatchEvent(new Event('change',{bubbles:true}));await pause()};
        const area=document.querySelector('.task-response');
        if(task.kind==='short_text'||task.kind==='long_text')await input(area.querySelector('input,textarea'),back);
        else if(task.kind==='calculation'){
          const a=task.answer;
          if(a.kind==='fraction'){const fields=area.querySelectorAll('input');await input(fields[0],a.numerator);await input(fields[1],a.denominator)}
          else if(a.kind==='quantity'){const fields=area.querySelectorAll('input');const p=a.pairs.at(-1);await input(fields[0],p.value);await input(fields[1],p.unit)}
          else if(a.kind==='formula')await input(area.querySelector('math-field'),a.value);
          else await input(area.querySelector('input'),a.value);
        }else if(task.kind==='single_choice'||task.kind==='multiple_choice'){
          for(const id of task.correctIds){const option=task.options.find(o=>o.id===id);Array.from(area.querySelectorAll('label')).find(l=>l.textContent.trim()===option.text).querySelector('input').click();await pause()}
        }else if(task.kind==='true_false')area.querySelectorAll('input')[task.correct?0:1].click();
        else if(task.kind==='cloze')for(const g of task.gaps)await input(area.querySelector('input[aria-label="'+g.id+'"]'),g.answer);
        else if(task.kind==='matching')for(const p of task.pairs)await input(Array.from(area.querySelectorAll('label')).find(l=>l.textContent.includes(p.left)).querySelector('select'),p.id);
      })()`)
      await wait(50)
      if (card.task.kind === 'ordering') {
        for (let target = 0; target < card.task.correctOrder.length; target++) {
          const expected = card.task.items.find(item => item.id === card.task.correctOrder[target]).text
          await run(`(()=>{const items=Array.from(document.querySelectorAll('.task-ordering li'));let i=items.findIndex(li=>li.querySelector('.math-content').textContent===${JSON.stringify(expected)});if(i>${target})items[i].querySelectorAll('button')[0].click()})()`)
          await wait(30)
          if (target === 0) { await run(`(()=>{const items=Array.from(document.querySelectorAll('.task-ordering li'));let i=items.findIndex(li=>li.querySelector('.math-content').textContent===${JSON.stringify(expected)});if(i>${target})items[i].querySelectorAll('button')[0].click()})()`); await wait(30) }
        }
      }
      await run("document.querySelector('.smart-answer-actions .btn-primary').click()")
      await until(`${store('smart-study')}.session.phase==='reviewing'`, `Answer not checked: ${card.id}`)
      const result = await run(`({verdict:${store('smart-study')}.session.evaluation?.verdict,self:${store('smart-study')}.session.selfAssessment})`)
      if (card.id === 'formula') assert.equal(result.self, true)
      else assert.equal(result.verdict, 'correct', `Incorrect evaluation: ${card.id}`)
      await capture(`${width}-${card.id}-feedback`)
      await route(`#/deck/${deck.id}`)
      await run(`${store('ui')}.editCard(${JSON.stringify(deck.id)},${JSON.stringify(card.id)})`)
      await until('Boolean(document.querySelector("#task-type"))', 'Editor did not open')
      if (card.id === 'formula') await until('Boolean(document.querySelector(".modal math-field"))', 'Editor mathfield did not initialize')
      await run("document.querySelector('.modal').scrollTop=0")
      await capture(`${width}-${card.id}-editor`)
      await run("document.querySelector('.modal-header button').click()")
    }
  }
  // Real MathLive mode switching and virtual keyboard on mobile, then the dark theme.
  const formula = deck.cards.find(card => card.id === 'formula')
  await start(formula)
  await until('Boolean(document.querySelector("math-field"))', 'Formula input missing')
  await run(`(()=>{const mf=document.querySelector('math-field');mf.value='\\\\frac{1}{2}';mf.dispatchEvent(new Event('input',{bubbles:true}))})()`)
  await wait(30)
  await run("document.querySelectorAll('.math-input-modes button')[1].click()")
  await wait(30)
  assert.equal(await run("document.querySelector('.latex-input').value"), '\\frac{1}{2}')
  await run("document.querySelectorAll('.math-input-modes button')[0].click()")
  await wait(30)
  assert.equal(await run("document.querySelector('math-field').value"), '\\frac{1}{2}')
  await run("document.querySelector('math-field').focus();window.mathVirtualKeyboard.show()")
  await until('window.mathVirtualKeyboard.visible', 'Symbol keyboard did not open')
  await until('document.querySelector("math-field").getBoundingClientRect().bottom < window.mathVirtualKeyboard.boundingRect.top', 'Formula field is covered by the symbol keyboard')
  await capture('390-formula-keyboard')
  await run('document.body.classList.add("dark")')
  await capture('390-formula-keyboard-dark')
  await run('window.mathVirtualKeyboard.hide()')
  // AI working uses one mock request and leaves the result independently correct.
  const number = deck.cards.find(card => card.id === 'number')
  await start(number)
  await run(`(()=>{const s=${store('smart-study')};${store('settings')}.smartConfig.evaluationMode='openrouter';s.setResponse({kind:'text',value:'36'});s.session.working=[{kind:'math',value:'12+3=36'}]})()`)
  await run("document.querySelector('.smart-answer-actions .btn-primary').click()")
  await until(`${store('smart-study')}.session.phase==='reviewing'`, 'Working was not checked')
  assert.equal(aiRequests.length, 1)
  assert.equal(aiRequests[0].evaluationScope, 'working')
  assert.equal(await run(`${store('smart-study')}.session.evaluation.verdict`), 'correct')
  assert.equal(await run(`${store('smart-study')}.session.workingEvaluation.verdict`), 'incorrect')
  await capture('390-working-feedback-dark')
  // Standard study displays every structured question and its solution without response controls.
  for (const card of cards) {
    await run(`(()=>{const s=${store('study')};s.start(${JSON.stringify(deck.id)});s.mainQueue=[${JSON.stringify(card.id)}];s.index=0;s.flipped=false})()`)
    await route(`#/study/${deck.id}`)
    assert.equal(await run('Boolean(document.querySelector(".task-response"))'), false)
    await capture(`390-standard-${card.id}-question`)
    await run("document.querySelector('.show-answer-wrap button').click()")
    assert.equal(await run(`${store('study')}.flipped`), true)
    await capture(`390-standard-${card.id}-solution`)
  }
  assert.deepEqual(external, [], 'Unexpected external asset request')
  assert.deepEqual(errors, [], 'Renderer errors')
  process.stdout.write(JSON.stringify({ taskFormats: cards.length, widths: [1100, 390], screenshots: fs.readdirSync(output).filter(f => f.endsWith('.png')).length, output, errors, external }) + '\n')
  app.quit()
}).catch(error => { process.stderr.write(error.stack + '\n'); app.exit(1) })
