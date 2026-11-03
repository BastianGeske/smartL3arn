'use strict'

// Whole-app layout review in an isolated Electron profile. No user data or live AI.
const { app, BrowserWindow, ipcMain, nativeImage } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const root = path.join(__dirname, '..')
const stage = process.argv.includes('--baseline') ? 'before' : 'after'
const output = path.join(root, 'design-evidence', 'design-review', stage)
let fixture
const metrics = [], errors = []
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
app.disableHardwareAcceleration()
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'smartl3arn-design-review-')))
ipcMain.handle('db:load', () => structuredClone(fixture))
ipcMain.handle('db:save', () => undefined)
ipcMain.handle('ai:status', () => ({ available: true, configured: true, credentialSource: 'stored', model: 'test/long-model-name-for-responsive-layout' }))
ipcMain.handle('ai:usage', () => ({ model: 'test/long-model-name-for-responsive-layout', persistenceError: false, unreadableEntries: 0, groups: [
  { day: '2026-10-13', model: 'test/long-model-name-for-responsive-layout', requests: 12, successes: 11, failures: 1, inputTokens: 3450, outputTokens: 820, totalTokens: 4270, cachedTokens: 100, reasoningTokens: 0, tokenRequests: 12, costRequests: 12, costUsd: 0.00142 },
] }))
ipcMain.handle('ai:diagnostics', () => ({ filename: 'test.jsonl', content: '', persistenceError: false }))
ipcMain.handle('ai:evaluate', () => ({ ok: false, reason: 'timeout' }))
const profiles = [
  { name: 'desktop', width: 1280, height: 900, zoom: 1 },
  { name: 'tablet', width: 900, height: 1000, zoom: 1 },
  { name: 'phone', width: 390, height: 844, zoom: 1 },
  { name: 'small', width: 320, height: 700, zoom: 1 },
  { name: 'landscape', width: 844, height: 390, zoom: 1 },
  { name: 'zoom200', width: 1280, height: 900, zoom: 2 },
  { name: 'zoom400', width: 1280, height: 960, zoom: 4 },
]
app.whenReady().then(async () => {
  const { normalizeDeck } = await import('../shared/data-validation.mjs')
  const data = JSON.parse(fs.readFileSync(path.join(root, 'docs/task-types.example.json'), 'utf8'))
  const deck = normalizeDeck({ ...data, id: 'review-deck', name: 'Mathematik und Lernmethoden – Aufgaben, Formeln und Zusammenhänge' }, { today: '2000-01-01' })
  const formulaValue = deck.cards.find(card => card.id === 'formula').task.answer.value
  fixture = { decks: [deck] }
  fs.mkdirSync(output, { recursive: true })
  const win = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { preload: path.join(root, 'preload.js'), partition: `design-review-${process.pid}`, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } })
  win.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message) })
  win.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, callback) => callback({ cancel: true }))
  const run = code => win.webContents.executeJavaScript(code)
  const store = name => `document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get(${JSON.stringify(name)})`
  const route = async hash => { await run(`location.hash=${JSON.stringify(hash)};scrollTo(0,0)`); await wait(100) }
  const capture = async (profile, state) => {
    await wait(100)
    const filename = `${profile.name}-${state}.png`
    fs.writeFileSync(path.join(output, filename), (await win.webContents.capturePage()).toPNG())
    const geometry = await run(`(async()=>{
      const dialog=document.querySelector('.modal-overlay'),menu=document.querySelector('.floating-menu');
      const actionable=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e),closed=e.closest('details:not([open])');return !e.closest('[inert]')&&(!closed||closed.querySelector('summary')?.contains(e))&&r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.opacity!=='0'&&!e.disabled&&(!dialog||dialog.contains(e)||e.closest('.notification-stack'))&&(!menu||menu.contains(e))};
      const exposed=e=>{
        const r=e.getBoundingClientRect(),x=(r.left+r.right)/2,y=(r.top+r.bottom)/2;
        if(x<0||x>innerWidth||y<0||y>innerHeight)return false;
        for(let p=e.parentElement;p&&p!==document.body;p=p.parentElement){const s=getComputedStyle(p);if(/auto|scroll|hidden|clip/.test(s.overflowY)){const c=p.getBoundingClientRect();if(y<c.top||y>c.bottom)return false}}
        return true;
      };
      const covered=e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2);return hit&&hit!==e&&!e.contains(hit)&&!hit.contains(e)?hit:null};
      const blocked=[];
      const windowScroll=[scrollX,scrollY],scrollers=Array.from(document.querySelectorAll('.modal,.floating-menu')).map(e=>[e,e.scrollTop]);
      for(const e of Array.from(document.querySelectorAll('button,input,select,textarea,math-field,summary')).filter(e=>actionable(e)&&exposed(e))){
        const hit=covered(e);if(!hit)continue;
        const original={tag:e.tagName,label:(e.getAttribute('aria-label')||e.textContent||'').trim().slice(0,80),coveredBy:hit.className};
        // Reachability is checked by scrolling, without changing input values or focus.
        e.scrollIntoView({block:'center',behavior:'instant'});
        const r=e.getBoundingClientRect(),modal=e.closest('.modal'),notice=document.querySelector('.notification-stack')?.getBoundingClientRect();
        let top=modal?modal.getBoundingClientRect().top:0,bottom=modal?modal.getBoundingClientRect().bottom:innerHeight;
        const bar=document.querySelector('.app-bar'),nav=document.querySelector('.app-nav');
        if(!modal&&bar&&['fixed','sticky'].includes(getComputedStyle(bar).position))top=Math.max(top,bar.getBoundingClientRect().bottom);
        if(!modal&&nav&&getComputedStyle(nav).position==='fixed')bottom=Math.min(bottom,nav.getBoundingClientRect().top);
        if(window.mathVirtualKeyboard?.visible)bottom=Math.min(bottom,window.mathVirtualKeyboard.boundingRect.top);
        if(notice?.height&&!e.closest('.notification-stack'))bottom=Math.min(bottom,notice.top);
        const delta=(r.top+r.bottom)/2-(top+bottom)/2;
        if(modal)modal.scrollBy({top:delta,behavior:'instant'});else scrollBy({top:delta,behavior:'instant'});
        await new Promise(resolve=>requestAnimationFrame(resolve));
        blocked.push({...original,reachable:exposed(e)&&!covered(e)});
        scrollTo(...windowScroll);for(const [element,position]of scrollers)element.scrollTop=position;
      }
      return {viewport:[innerWidth,innerHeight],pageOverflow:document.documentElement.scrollWidth>innerWidth+1,modalOverflow:Array.from(document.querySelectorAll('.modal')).some(e=>e.scrollWidth>e.clientWidth+1),blocked,keyboard:window.mathVirtualKeyboard?.visible?{top:window.mathVirtualKeyboard.boundingRect.top,height:window.mathVirtualKeyboard.boundingRect.height,background:getComputedStyle(document.querySelector('.ML__keyboard')).getPropertyValue('--keyboard-background').trim()}:null};
    })()`)
    metrics.push({ profile: profile.name, state, filename, ...geometry })
  }
  const page = async (profile, hash, state) => {
    await route(hash); await capture(profile, `${state}-top`)
    await run('scrollTo(0,document.documentElement.scrollHeight)'); await capture(profile, `${state}-bottom`)
  }
  const setup = async () => {
    await route('#/smart')
    await run(`(()=>{const s=${store('settings')};s.smartConfig.deckIds=['review-deck'];s.smartConfig.duration=0;s.smartConfig.evaluationMode='local';s.smartConfig.techniques.typeRecall=true})()`)
  }
  const start = async (cardId, response) => {
    await run(`(async()=>{const s=${store('smart-study')};await s.start();s.session.queue=[{deckId:'review-deck',cardId:${JSON.stringify(cardId)}}];s.session.index=0;s.session.response=${JSON.stringify(response)};s.session.typedAnswer=''})()`)
    await route('#/smart/session')
    await run(`${store('smart-study')}.setResponse(${JSON.stringify(response)})`)
  }
  await win.loadFile(path.join(root, 'web-dist', 'index.html'))
  await wait(150)
  await run("(()=>{const style=document.createElement('style');style.textContent='*,*::before,*::after{animation:none!important;transition:none!important}';document.head.appendChild(style);localStorage.setItem('smartl3arn_language','de');window.dispatchEvent(new StorageEvent('storage',{key:'smartl3arn_language'}))})()")
  for (const profile of profiles) {
    win.setContentSize(profile.width, profile.height)
    win.webContents.setZoomFactor(profile.zoom)
    await run(`${store('settings')}.dark=false`)
    await page(profile, '#/', '01-library')
    await run("document.querySelector('.library-transfer .menu > button').click()")
    if (!(await run("Boolean(document.querySelector('.floating-menu'))"))) throw Error('Library menu did not open');
    await capture(profile, '02-library-menu');
    await run("document.querySelector('.library-transfer .menu > button').click()")
    await page(profile, '#/deck/review-deck', '03-browse')
    await setup(); await capture(profile, '04-smart-setup-top')
    await run('scrollTo(0,document.documentElement.scrollHeight)'); await capture(profile, '04-smart-setup-bottom')
    await page(profile, '#/preferences', '05-preferences')
    await page(profile, '#/usage', '06-usage')
    await route('#/deck/review-deck')
    await run(`${store('ui')}.editCard('review-deck','number')`)
    await capture(profile, '07-card-editor-top')
    await run("document.querySelector('.modal').scrollTop=document.querySelector('.modal').scrollHeight")
    await capture(profile, '07-card-editor-bottom')
    await run("document.querySelector('.modal-header button').click()")
    await run(`${store('ui')}.editDeck('review-deck')`); await capture(profile, '08-deck-editor')
    await run("document.querySelector('.modal-header button').click()")
    await run(`(()=>{const s=${store('study')};s.start('review-deck');s.mainQueue=['matching'];s.index=0;s.flipped=false})()`)
    await page(profile, '#/study/review-deck', '09-study-question')
    await run("document.querySelector('.show-answer-wrap button').click()")
    await capture(profile, '10-study-solution')
    await run(`${store('study')}.rate(2)`); await capture(profile, '11-study-complete')
    await setup(); await start('number', { kind: 'text', value: '' })
    await capture(profile, '12-smart-question')
    await run(`(()=>{const s=${store('smart-study')};s.setResponse({kind:'text',value:'36'});s.session.working=[{kind:'math',value:'12+12+12=36'}]})()`)
    await run("document.querySelector('.smart-answer-actions .btn-primary').click()")
    await capture(profile, '13-smart-feedback-top')
    await run('scrollTo(0,document.documentElement.scrollHeight)'); await capture(profile, '13-smart-feedback-bottom')
    await run(`${store('smart-study')}.rate(2)`); await capture(profile, '14-smart-complete')
    await setup(); await start('formula', { kind: 'text', value: formulaValue })
    await run(`${store('settings')}.smartConfig.evaluationMode='openrouter'`)
    await run("document.querySelector('.smart-answer-actions .btn-primary').click()")
    await run('scrollTo(0,document.documentElement.scrollHeight)'); await capture(profile, '15-ai-error')
    await run(`(()=>{const s=${store('smart-study')};s.session.phase='break';s.session.timeUp=true;s.session.breakStartTime=Date.now();s.session.breakDurationMs=420000;s.stopTimer()})()`)
    await capture(profile, '16-pomodoro-break')
    await route('#/')
    await run(`${store('library')}.data.decks=[]`); await capture(profile, '17-empty-library')
    await run(`${store('library')}.data=${JSON.stringify(fixture)}`)
    {
      await setup(); await start('formula', { kind: 'text', value: formulaValue })
      await wait(180)
      await run(`(()=>{const f=document.querySelector('math-field');f.value=${JSON.stringify(formulaValue)};f.dispatchEvent(new Event('input',{bubbles:true}));f.focus();window.mathVirtualKeyboard.show()})()`)
      await wait(250)
      await capture(profile, '18-keyboard-light')
      await run(`${store('settings')}.dark=true`); await capture(profile, '19-keyboard-dark')
      await run('window.mathVirtualKeyboard.hide()')
      await route('#/deck/review-deck')
      await run(`${store('ui')}.editCard('review-deck','formula')`)
      await wait(150)
      await run(`(()=>{const f=document.querySelector('math-field');f.value=${JSON.stringify(formulaValue)};f.dispatchEvent(new Event('input',{bubbles:true}));f.focus();window.mathVirtualKeyboard.show()})()`)
      await wait(250)
      await run(`${store('ui')}.showError('notifications.importFailed')`)
      await capture(profile, '20-editor-keyboard-notice');
      const overlap=await run("(()=>{const k=window.mathVirtualKeyboard.boundingRect;const f=document.querySelector('math-field').getBoundingClientRect();const n=document.querySelector('.notification-stack').getBoundingClientRect();const m=document.querySelector('.modal').getBoundingClientRect();return f.top<m.top||f.bottom>m.bottom||(window.mathVirtualKeyboard.visible&&(f.bottom>n.top-8||n.bottom>k.top-8))})()");
      if(overlap) throw Error('Editor, notice or keyboard overlap: '+profile.name)
      await run(`window.mathVirtualKeyboard.hide();${store('ui')}.closeCardEditor();${store('ui')}.notifications.forEach(n=>${store('ui')}.dismissNotification(n.id))`)
    }
  }
  fs.writeFileSync(path.join(output, 'metrics.json'), JSON.stringify({ stage, profiles, metrics, errors }, null, 2))
  // Contact sheets are only an inspection aid. Original, exact captures remain next to them.
  const board = new BrowserWindow({ show: false, width: 1800, height: 1800, webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } })
  await board.loadURL('data:text/html,<canvas id="c"></canvas>')
  for (const profile of profiles) {
    const images = metrics.filter(m => m.profile === profile.name).map(m => ({ label: m.state, url: nativeImage.createFromPath(path.join(output, m.filename)).toDataURL() }))
    const result = await board.webContents.executeJavaScript(`(async()=>{const items=${JSON.stringify(images)};const cols=4,cellW=450,cellH=480;const c=document.querySelector('#c');c.width=cols*cellW;c.height=Math.ceil(items.length/cols)*cellH;const ctx=c.getContext('2d');ctx.fillStyle='#ebe6f1';ctx.fillRect(0,0,c.width,c.height);ctx.font='16px sans-serif';for(let i=0;i<items.length;i++){const im=new Image();im.src=items[i].url;await im.decode();const scale=Math.min((cellW-20)/im.width,(cellH-35)/im.height);const w=im.width*scale,h=im.height*scale;const x=(i%cols)*cellW+(cellW-w)/2,y=Math.floor(i/cols)*cellH+30;ctx.fillStyle='#252235';ctx.fillText(items[i].label,(i%cols)*cellW+10,Math.floor(i/cols)*cellH+20);ctx.drawImage(im,x,y,w,h)}return c.toDataURL('image/png')})()`)
    fs.writeFileSync(path.join(output, `overview-${profile.name}.png`), Buffer.from(result.split(',')[1], 'base64'))
  }
  board.close()
  const issues = metrics.filter(m => m.pageOverflow || m.modalOverflow || m.blocked.some(b => !b.reachable))
  process.stdout.write(JSON.stringify({ stage, screenshots: metrics.length, issues: issues.map(m => ({ profile: m.profile, state: m.state, pageOverflow: m.pageOverflow, modalOverflow: m.modalOverflow, blocked: m.blocked })), errors, output }) + '\n')
  if(issues.length||errors.length)throw Error('Layout review found unreachable controls, overflow or renderer errors');
  app.quit()
}).catch(error => { process.stderr.write(error.stack + '\n'); app.exit(1) })
