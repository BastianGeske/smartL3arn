'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { createPackage } = require('@electron/asar')
const { checkArtifact } = require('../scripts/check-artifacts.cjs')

async function fixture(context, { config = { OPENROUTER_MODEL: 'test/model' }, env = false, missingCover = false } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'smartl3arn-artifact-test-'))
  context.after(() => fs.rm(root, { recursive: true, force: true }))
  const source = path.join(root, 'source'), resources = path.join(root, 'resources')
  const { DECK_COVERS } = await import('../shared/deck-covers.mjs')
  const files = ['main.js', 'preload.js', 'electron/security.cjs', 'electron/openrouter.cjs',
    'electron/credentials.cjs', 'electron/usage.cjs', 'electron/diagnostics.cjs',
    'shared/data-validation.mjs', 'shared/deck-covers.mjs', 'web-dist/index.html', 'build/icon.png',
    ...DECK_COVERS.slice(missingCover ? 1 : 0).map(cover => `web-dist/design/deck-${cover.id}.png`)]
  if (env) files.push('.env.local')
  for (const name of files) {
    await fs.mkdir(path.dirname(path.join(source, name)), { recursive: true })
    await fs.writeFile(path.join(source, name), env && name === '.env.local' ? 'PRIVATE_SENTINEL' : 'fixture')
  }
  await fs.mkdir(resources)
  await createPackage(source, path.join(resources, 'app.asar'))
  await fs.writeFile(path.join(resources, 'openrouter-build-config.json'), JSON.stringify(config))
  return resources
}
test('accepts a complete model-only desktop artifact', async context => {
  const resources = await fixture(context)
  assert.equal((await checkArtifact(resources)).coverCount, 13)
})
test('rejects legacy packaged credentials without revealing their value', async context => {
  const resources = await fixture(context, { config: { OPENROUTER_MODEL: 'test', OPENROUTER_API_KEY: 'PRIVATE_SENTINEL' } })
  await assert.rejects(checkArtifact(resources), error => /Unexpected fields/.test(error.message) && !error.message.includes('PRIVATE_SENTINEL'))
})
test('rejects hidden environment files in a real app archive', async context => {
  const resources = await fixture(context, { env: true })
  await assert.rejects(checkArtifact(resources), error => /Environment file/.test(error.message) && !error.message.includes('PRIVATE_SENTINEL'))
})
test('rejects an incomplete set of cover images', async context => {
  const resources = await fixture(context, { missingCover: true })
  await assert.rejects(checkArtifact(resources), /cover assets are incomplete/)
})
