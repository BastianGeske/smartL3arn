'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { createCredentialResolver } = require('./credentials.cjs')

function setup(context, content, env = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'smartl3arn-env-test-'))
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const envPath = path.join(directory, '.env')
  if (content !== undefined) fs.writeFileSync(envPath, content)
  let stored = 'encrypted-settings-key'
  const store = {
    has: async () => Boolean(stored),
    read: async () => stored,
    remove: async () => { stored = null },
  }
  return { resolver: createCredentialResolver({ env, envPath, store }), store }
}

test('process environment wins over .env and encrypted storage without exposing the key in status', async (context) => {
  const { resolver } = setup(context, 'OPENROUTER_API_KEY=file-key', { OPENROUTER_API_KEY: ' process-key ' })
  assert.equal(await resolver.read(), 'process-key')
  assert.deepEqual(await resolver.status(), { configured: true, credentialSource: 'environment' })
})

test('loads quoted .env values with comments, ahead of encrypted storage', async (context) => {
  const { resolver } = setup(context, '# Local configuration\nOPENROUTER_API_KEY="file-key" # comment\n', { OPENROUTER_API_KEY: ' ' })
  assert.equal(await resolver.read(), 'file-key')
  assert.equal((await resolver.status()).credentialSource, 'environment')
})

test('missing and blank .env fall back to encrypted storage', async (context) => {
  for (const content of [undefined, 'OPENROUTER_API_KEY=\n', 'OPENROUTER_API_KEY="   "']) {
    const { resolver, store } = setup(context, content)
    assert.equal(await resolver.read(), 'encrypted-settings-key')
    assert.deepEqual(await resolver.status(), { configured: true, credentialSource: 'stored' })
    await store.remove()
    assert.equal(await resolver.read(), null)
    assert.deepEqual(await resolver.status(), { configured: false, credentialSource: null })
  }
})

test('removing a stored key leaves an environment key configured', async (context) => {
  const { resolver, store } = setup(context, 'OPENROUTER_API_KEY=file-key')
  await store.remove()
  assert.equal(await resolver.read(), 'file-key')
  assert.deepEqual(await resolver.status(), { configured: true, credentialSource: 'environment' })
})

test('resolves model from process environment, then .env, then default', (context) => {
  const cases = [
    ['OPENROUTER_MODEL=file/model', { OPENROUTER_MODEL: ' process/model ' }, 'process/model'],
    ['OPENROUTER_MODEL=" file/model "', { OPENROUTER_MODEL: ' ' }, 'file/model'],
    ['OPENROUTER_MODEL=" "', {}, 'openrouter/free'],
    [undefined, {}, 'openrouter/free'],
  ]
  for (const [content, env, expected] of cases) {
    assert.equal(setup(context, content, env).resolver.model, expected)
  }
})
