'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { embedIosOpenRouterConfig } = require('../scripts/embed-ios-openrouter-config.cjs')

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'smartl3arn-ios-config-test-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  return { projectDir: root, resourcesDir: path.join(root, 'App.app'), configuration: 'Debug', env: {} }
}

test('private Debug build includes only the key and model from .env', async t => {
  const options = await fixture(t)
  await fs.writeFile(path.join(options.projectDir, '.env'), 'OPENROUTER_API_KEY="test-key"\nOPENROUTER_MODEL=test/model\nOTHER_SECRET=do-not-include\n')
  assert.deepEqual(await embedIosOpenRouterConfig(options), { configured: true })
  const config = JSON.parse(await fs.readFile(path.join(options.resourcesDir, 'openrouter-private-build.json'), 'utf8'))
  assert.deepEqual(config, { OPENROUTER_API_KEY: 'test-key', OPENROUTER_MODEL: 'test/model' })
})

test('environment overrides .env and missing model defaults to free routing', async t => {
  const options = await fixture(t)
  await fs.writeFile(path.join(options.projectDir, '.env'), 'OPENROUTER_API_KEY=file-key\n')
  options.env = { OPENROUTER_API_KEY: ' env-key ' }
  await embedIosOpenRouterConfig(options)
  const config = JSON.parse(await fs.readFile(path.join(options.resourcesDir, 'openrouter-private-build.json'), 'utf8'))
  assert.deepEqual(config, { OPENROUTER_API_KEY: 'env-key', OPENROUTER_MODEL: 'openrouter/free' })
})

test('Release removes an existing Debug credential even when a key is configured', async t => {
  const options = await fixture(t)
  options.env = { OPENROUTER_API_KEY: 'test-key' }
  await embedIosOpenRouterConfig(options)
  assert.deepEqual(await embedIosOpenRouterConfig({ ...options, configuration: 'Release' }), { configured: false })
  await assert.rejects(fs.access(path.join(options.resourcesDir, 'openrouter-private-build.json')), { code: 'ENOENT' })
})

test('missing key removes stale configuration and missing .env is allowed', async t => {
  const options = await fixture(t)
  await embedIosOpenRouterConfig({ ...options, env: { OPENROUTER_API_KEY: 'old-test-key' } })
  assert.deepEqual(await embedIosOpenRouterConfig(options), { configured: false })
  await assert.rejects(fs.access(path.join(options.resourcesDir, 'openrouter-private-build.json')), { code: 'ENOENT' })
})
