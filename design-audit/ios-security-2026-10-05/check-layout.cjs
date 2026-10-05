'use strict'
// Isolated rendering audit; never reads personal data or contacts the AI service.
const path = require('node:path')
const fs = require('node:fs')
const root = path.resolve(__dirname, '../..')
const iosAssets = process.argv.includes('--ios-assets')
const webDir = path.join(root, iosAssets ? 'ios/App/App/public' : 'web-dist')
const output = process.argv.includes('--fixed') ? path.join(__dirname, iosAssets ? 'fixed-ios-assets' : 'fixed') : iosAssets ? path.join(__dirname, 'ios-assets') : __dirname
fs.mkdirSync(output, { recursive: true })
const { app, BrowserWindow, ipcMain } = require('electron')
const fixture = { decks: [{ id: 'audit', name: 'Biologie – Grundlagen der Photosynthese', cards: [
  { id: 'card', front: 'Wie wandeln Pflanzen Sonnenlicht in nutzbare Energie um?', back: 'Durch Photosynthese wird Lichtenergie in chemische Energie umgewandelt.', interval: 0, repetitions: 0, easeFactor: 2.5, dueDate: '2000-01-01' },
] }] }
ipcMain.handle('db:load', () => structuredClone(fixture))
ipcMain.handle('db:save', () => undefined)
ipcMain.handle('ai:status', () => ({ available: true, configured: false }))
ipcMain.handle('ai:usage', () => ({ model: 'openrouter/free', groups: [] }))
app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { preload: path.join(root, 'preload.js'), partition: `audit-${process.pid}` } })
  const js = source => win.webContents.executeJavaScript(source).catch(error => { console.error('Audit action failed:', source.slice(0,140)); throw error })
  const pause = () => new Promise(resolve => setTimeout(resolve, 220))
  const results = []
  try {
    await win.loadFile(path.join(webDir, 'index.html'))
    await js(`localStorage.setItem('smartl3arn_language','de'); localStorage.setItem('ankiweb_smart_config',JSON.stringify({deckIds:['audit'],evaluationMode:'local',duration:0,techniques:{typeRecall:true,confidenceCheck:true,whyPrompt:false,interleaving:true}}));location.reload()`)
    await pause()
    for (const device of [{ name: 'small', w: 320, h: 568, left: 0, right: 0, bottom: 0 }, { name: 'phone', w: 393, h: 852, left: 0, right: 0, bottom: 34 }, { name: 'landscape', w: 852, h: 393, left: 59, right: 59, bottom: 21 }]) {
      win.setContentSize(device.w, device.h)
      // CSS inset approximation only: Chromium is not an iOS WKWebView.
      const css = fs.readdirSync(path.join(webDir,'assets')).filter(name=>name.endsWith('.css')).map(name=>fs.readFileSync(path.join(webDir,'assets',name),'utf8')).join('\n')
      const adjusted = css.replace(/env\(safe-area-inset-(top|bottom|left|right)\)/g, (_, side) => `${device[side] || 0}px`)
      await js(`(() => { const style=document.createElement('style');style.id='audit-safe-areas';style.textContent=${JSON.stringify(adjusted)};document.head.appendChild(style) })()`)
      async function capture(name, action) {
        if (action) await js(action)
        await pause()
        const metrics = await js(`(() => {
          const rect = e => { const r=e.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom} };
          const overlaps=[];
          for(const parent of document.querySelectorAll('.study-header-top,.page-heading-actions,.modal-footer,.section-heading,.config-heading')) {
            const children=[...parent.children].filter(e=>e.getBoundingClientRect().width && getComputedStyle(e).display!=='none');
            children.forEach((a,i)=>children.slice(i+1).forEach(b=>{const x=rect(a),y=rect(b);if(Math.min(x.right,y.right)-Math.max(x.x,y.x)>1&&Math.min(x.bottom,y.bottom)-Math.max(x.y,y.y)>1)overlaps.push([a.className,b.className])}));
          }
          const unsafeControls=[...document.querySelectorAll('button,input,textarea,select,a.app-nav-item')].filter(e=>{const r=rect(e);return r.w&&r.h&&r.bottom>0&&r.y<innerHeight&&(r.x<${device.left}-1||r.right>innerWidth-${device.right}+1)}).map(e=>({label:(e.textContent||e.getAttribute('aria-label')||e.id).trim().slice(0,80),...rect(e)}));
          const modal=document.querySelector('.modal');
          const menu=document.querySelector('.floating-menu');
          return {menu:menu?rect(menu):null,width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,overlaps,unsafeControls,modal:modal?rect(modal):null,nav:document.querySelector('.app-nav')?rect(document.querySelector('.app-nav')):null};
        })()`)
        if (metrics.menu) {
          const r=metrics.menu;const navTop=metrics.nav&&device.w<720?metrics.nav.y:device.h;
          if (r.x<device.left-1||r.right>device.w-device.right+1||r.y<0||r.bottom>Math.min(device.h-device.bottom,navTop)+1) throw new Error('Menu outside usable viewport: '+JSON.stringify(metrics));
        }
        const filename = `${device.name}-${name}.png`
        fs.writeFileSync(path.join(output, filename), (await win.webContents.capturePage()).toPNG())
        results.push({ device: device.name, screen: name, filename, ...metrics })
      }
      for (const [name, route] of [['home','/'],['browse','/deck/audit'],['study','/study/audit'],['smart','/smart'],['smart-session','/smart/session'],['preferences','/preferences'],['usage','/usage']]) {
        await capture(name, `location.hash=${JSON.stringify('#'+route)};scrollTo(0,0)`)
        await capture(name+'-bottom', `scrollTo(0,document.documentElement.scrollHeight)`)
      }
      await js(`location.hash='#/';scrollTo(0,0)`); await pause()
      await capture('transfer-menu', `document.querySelector('.library-transfer .menu').scrollIntoView({block:'center'});document.querySelector('.library-transfer .menu > button').click()`)
      await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`)
      await capture('deck-menu', `document.querySelector('.deck-menu').scrollIntoView({block:'center'});document.querySelector('.deck-menu > button').click()`)
      await capture('deck-menu-bottom', `scrollTo(0,document.documentElement.scrollHeight)`)
      await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));location.hash='#/deck/audit';scrollTo(0,0)`); await pause()
      await capture('browse-menu', `document.querySelector('.browse-toolbar .menu').scrollIntoView({block:'center'});document.querySelector('.browse-toolbar .menu > button').click()`)
      await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`)
      await js(`location.hash='#/';scrollTo(0,0)`); await pause()
      await capture('deck-editor', `document.querySelector('.workspace-toolbar .btn-primary').click()`)
      await js(`document.querySelector('.modal-header .btn-icon').click();location.hash='#/deck/audit';scrollTo(0,0)`); await pause()
      await capture('card-editor', `document.querySelector('.page-heading-actions .btn-primary').click()`)
      await js(`document.querySelector('.modal-header .btn-icon').click()`)
      await js(`document.querySelector('#audit-safe-areas').remove()`)
    }
    fs.writeFileSync(path.join(output, 'layout-metrics.json'), JSON.stringify(results, null, 2))
    console.log(JSON.stringify({assets:iosAssets?'existing-ios':'current-source',screenshots:results.length,overlaps:results.filter(r=>r.overlaps.length),safeAreaCandidates:results.filter(r=>r.unsafeControls.length).length}))
    app.exit(0)
  } catch(error) { console.error(error); app.exit(1) }
})
