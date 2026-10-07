'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')
const { listPackage } = require('@electron/asar')

const required = ['main.js', 'preload.js', 'electron/security.cjs', 'electron/openrouter.cjs',
  'electron/credentials.cjs', 'electron/usage.cjs', 'electron/diagnostics.cjs',
  'shared/data-validation.mjs', 'shared/deck-covers.mjs', 'web-dist/index.html', 'build/icon.png']

async function checkArtifact(resources) {
  const config = JSON.parse(await fs.readFile(path.join(resources, 'openrouter-build-config.json'), 'utf8'))
  if (Object.keys(config).some(key => key !== 'OPENROUTER_MODEL') || typeof config.OPENROUTER_MODEL !== 'string') {
    throw new Error('Unexpected fields in packaged model configuration; values hidden.')
  }
  const files = listPackage(path.join(resources, 'app.asar')).map(name => name.replace(/^[/\\]/, '').replaceAll('\\', '/'))
  if (files.some(name => /(^|\/)\.env($|\.)/.test(name))) throw new Error('Environment file found in app archive; contents hidden.')
  const missing = required.filter(name => !files.includes(name))
  if (missing.length) throw new Error(`Missing runtime files: ${missing.join(', ')}`)
  const { DECK_COVERS } = await import('../shared/deck-covers.mjs')
  if (DECK_COVERS.some(cover => !files.includes(`web-dist/design/deck-${cover.id}.png`))) {
    throw new Error('Deck cover assets are incomplete.')
  }
  const loose = await fs.readdir(resources)
  if (loose.some(name => /^\.env($|\.)/.test(name))) throw new Error('Environment file found beside app archive; contents hidden.')
  return { resources, runtimeFiles: required.length, coverCount: DECK_COVERS.length, embeddedKey: false }
}

module.exports = { checkArtifact }

if (require.main === module) {
  const roots = process.argv.slice(2)
  if (!roots.length) {
    console.error('Usage: check-artifacts.cjs <mac Contents/Resources or Windows resources> [...]')
    process.exitCode = 1
  } else {
    Promise.all(roots.map(checkArtifact)).then(results => results.forEach(result => console.log(JSON.stringify(result))))
      .catch(error => { console.error(error.message); process.exitCode = 1 })
  }
}
