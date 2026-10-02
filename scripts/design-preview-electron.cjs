'use strict'
const { app, BrowserWindow, ipcMain, nativeImage } = require('electron')
const fs = require('fs')
const path = require('path')
const root = path.join(__dirname, '..')
const output = path.join(root, 'design-evidence')
const card = (id, front, back, due = true) => ({ id, front, back, interval: due ? 0 : 7, repetitions: 0, easeFactor: 2.5, dueDate: due ? '2000-01-01' : '2099-01-01' })
const fixture = { decks: [
  { id: 'psych', name: 'Spanish vocabulary', cards: [card('p1', 'What is cognitive dissonance?', 'The discomfort experienced when beliefs and actions conflict.'), card('p2','What is active recall?', 'Retrieving information from memory.'), card('p3', 'What helps a habit stick?', 'A consistent cue and a useful reward.'), card('p4', 'What is a growth mindset?', 'The belief that abilities can develop through practice.', false)], sessions: ['2026-09-29','2026-09-30','2026-10-01'].map(date=>({date,reviewed:1,again:0,hard:0,good:1,easy:0})) },
  { id: 'bio', name: 'Cell biology', cards: [card('b1', 'What is photosynthesis?', 'The conversion of light into chemical energy.'), card('b2','What does DNA encode?', 'Instructions for making proteins.'),card('b3','What is a cell?', 'A basic unit of life.',false)], sessions: [{date:'2026-10-01',reviewed:1,again:0,hard:0,good:1,easy:0}] },
  { id: 'ideas', name: 'Product strategy', cards: [card('i1','What makes a useful idea?', 'It addresses a real need.',false), card('i2','How can you get unstuck?', 'Try a smaller experiment.',false)], sessions: [{date:'2026-10-02',reviewed:1,again:0,hard:0,good:1,easy:0}] }
] }
app.disableHardwareAcceleration()
ipcMain.handle('db:load', () => structuredClone(fixture))
ipcMain.handle('db:save', () => undefined)
ipcMain.handle('ai:status', () => ({available: true, configured: true, credentialSource: 'environment'}))
ipcMain.handle('ai:usage', () => ({ model: 'openrouter/free', persistenceError: false, unreadableEntries: 0, groups: [] }))
ipcMain.handle('ai:save-key', () => ({ok: false, reason:'unavailable'}))
ipcMain.handle('ai:remove-key', () => ({ok: true}))
ipcMain.handle('ai:evaluate', () => ({ok:false,reason:'unavailable'}))
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms))
app.whenReady().then(async () => {
 fs.mkdirSync(output,{recursive:true})
 const win = new BrowserWindow({show:process.argv.includes('--preview'), width:1100,height:778, webPreferences:{contextIsolation:true,nodeIntegration:false,preload:path.join(root,'preload.js'),partition:`design-${process.pid}`}})
 const errors=[];win.webContents.on('console-message',e=>{if(e.level==='error')errors.push(e.message)})
 const run = (code) => win.webContents.executeJavaScript(code)
 const capture = async name => {await wait(200); fs.writeFileSync(path.join(output,`${name}.png`),(await win.webContents.capturePage()).toPNG());const overflow=await run('document.documentElement.scrollWidth > innerWidth');if(overflow)throw new Error(`Horizontal overflow: ${name}`)}
 const route = async hash => {await run(`location.hash = ${JSON.stringify(hash)}`);await wait(250);await run('scrollTo(0,0)')}
 await win.loadFile(path.join(root,'web-dist','index.html'));await run(`localStorage.setItem('smartl3arn_language','en');window.dispatchEvent(new StorageEvent('storage',{key:'smartl3arn_language'}))`);await wait(300)
 await capture('library-light')
 await run("document.querySelector('.toolbar-actions button').click()");await capture('deck-dialog');await run("document.querySelector('.modal-header button').click()")
 await route('#/deck/psych');await capture('browse-light')
 await run("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Add card')).click()");await capture('card-dialog');await run("document.querySelector('.modal-header button').click()")
 await route('#/');await run("document.querySelector('.deck-row-actions .btn').click()");await capture('study-question')
 await run("document.querySelector('.show-answer-wrap button').click()");await capture('study-answer')
 for(let i=0;i<3;i++){await run("document.querySelector('.show-answer-wrap button')?.click()");await wait(50);await run("document.querySelector('.rating-easy')?.click()");await wait(100)};await capture('study-complete')
 if(!await run("Boolean(document.querySelector('.study-done'))"))throw new Error('Completion view unavailable')
 await route('#/smart');await run("document.querySelector('.smart-deck-row input').click()");await capture('smart-setup')
 await run('scrollTo(0,document.body.scrollHeight)');await capture('smart-settings');await run('scrollTo(0,0)')
 await run("document.querySelector('.session-plan .btn-smart').click()");await wait(1000);await capture('smart-question')
 await run("(()=>{const t=document.querySelector('#smart-answer-input');t.value='A conflict between beliefs and actions';t.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.smart-answer-actions .btn-primary').click()})()");await capture('smart-feedback')
 await run('scrollTo(0,document.body.scrollHeight)');await capture('smart-feedback-actions')
 await run(`(()=>{const s=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('smart-study');s.session.durationMs=1;s.session.startTime=Date.now()-5000})()`);await wait(650);await capture('smart-break')
 await run(`(()=>{const s=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('smart-study');s.session.breakDone=true})()`);await capture('smart-break-complete')
 await run(`(()=>{const s=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('smart-study');s.session.phase='reviewing';s.session.breakStartTime=undefined;s.session.timeUp=true})()`);await capture('smart-complete')
 await route('#/usage');await capture('usage-empty')
 await route('#/');await run('document.body.classList.add("dark")');await capture('library-dark')
 win.setContentSize(600,750);await capture('library-small-dark')
 for(const [hash,name] of [['#/deck/psych','browse-small-dark'],['#/smart','smart-small-dark'],['#/usage','usage-small-dark']]){await route(hash);await capture(name)}
 win.setContentSize(390,750);await route('#/');await run('document.body.classList.remove("dark")');await capture('library-mobile')
 for(const [hash,name] of [['#/deck/psych','browse-mobile'],['#/smart','smart-mobile'],['#/usage','usage-mobile']]){await route(hash);await capture(name)}
 await route('#/');await run(`document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('library').data.decks=[]`);await capture('library-empty')
 if(fs.existsSync(path.join(output,'reference-original.png'))) {
 const comparison = new BrowserWindow({show:false,width:2200,height:800,webPreferences:{contextIsolation:true,nodeIntegration:false}})
 await comparison.loadURL('data:text/html,<canvas id="c"></canvas>')
 const source = nativeImage.createFromPath(path.join(output,'reference-original.png')).resize({width:1100,height:750})
 fs.writeFileSync(path.join(output,'reference-normalized.png'),source.toPNG())
 const target = nativeImage.createFromPath(path.join(output,'library-light.png')).resize({width:1100,height:750})
 for(const [name,box] of [['full',[0,0,1100,750]],['collection',[215,310,860,405]],['header',[0,0,1100,310]]]){
  const code = `async function compose(){const box=${JSON.stringify(box)};const c=document.querySelector('#c');c.width=box[2]*2;c.height=box[3]+26;const ctx=c.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#252235';ctx.font='13px sans-serif';ctx.fillText('Selected design',10,18);ctx.fillText('Electron implementation',box[2]+10,18);for(const [i,url] of ${JSON.stringify([source.toDataURL(),target.toDataURL()])}.entries()){const im=new Image();im.src=url;await im.decode();ctx.drawImage(im,...box,i*box[2],26,box[2],box[3])}return c.toDataURL('image/png')}compose()`
  const data=await comparison.webContents.executeJavaScript(code);fs.writeFileSync(path.join(output,name+'-comparison.png'),Buffer.from(data.split(',')[1],'base64'))
 }
 comparison.close()
 }
 if(errors.length)throw new Error(errors.join('; '))
 process.stdout.write(JSON.stringify({output,errors})+'\n')
 if(process.argv.includes('--preview')){await run(`document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('library').data=${JSON.stringify(fixture)}`);win.setContentSize(1100,750);await route('#/');win.show()}else app.quit()
}).catch(e=>{process.stderr.write(e.stack+'\n');app.exit(1)})
