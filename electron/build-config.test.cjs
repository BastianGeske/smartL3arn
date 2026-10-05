'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const embedOpenRouterConfig = require('../scripts/embed-openrouter-config.cjs')
const { createCredentialResolver } = require('./credentials.cjs')

function setup(context, content, env = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'smartl3arn-build-config-test-'))
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  for (const name of ['OPENROUTER_API_KEY', 'OPENROUTER_MODEL']) {
    const previous = process.env[name]
    context.after(() => {
      if (previous === undefined) delete process.env[name]
      else process.env[name] = previous
    })
    if (env[name] === undefined) delete process.env[name]
    else process.env[name] = env[name]
  }
  if (content !== undefined) fs.writeFileSync(path.join(directory, '.env'), content)
  const appOutDir = path.join(directory, 'mac-arm64')
  const resources = path.join(appOutDir, 'smartL3arn.app', 'Contents', 'Resources')
  const buildConfigPath = path.join(resources, 'openrouter-build-config.json')
  const packContext = {
    appOutDir,
    packager: {
      projectDir: directory,
      getResourcesDir: (output) => {
        assert.equal(output, appOutDir)
        return resources
      },
    },
  }
  return { directory, buildConfigPath, packContext }
}

test('packages only the model and never embeds private credentials', async (context) => {
  const { directory, buildConfigPath, packContext } = setup(context,
    'OPENROUTER_API_KEY=" file-key " # private build\nOPENROUTER_MODEL=" provider/model "\nUNRELATED_SECRET=not-for-the-app\n')
  await embedOpenRouterConfig(packContext)
  assert.deepEqual(JSON.parse(fs.readFileSync(buildConfigPath, 'utf8')), {
    OPENROUTER_MODEL: 'provider/model',
  })
  assert.equal(fs.existsSync(path.join(directory, 'web-dist')), false)
  const resolver = createCredentialResolver({
    env: {},
    envPath: path.join(directory, 'installed-user-data', '.env'),
    buildConfigPath,
    store: { has: async () => true, read: async () => 'old-settings-key' },
  })
  assert.equal(await resolver.read(), 'old-settings-key')
  assert.equal(resolver.model, 'provider/model')
  assert.deepEqual(await resolver.status(), { configured: true, credentialSource: 'stored' })
})

test('build environment can override the model without packaging either key', async (context) => {
  const { buildConfigPath, packContext } = setup(context,
    'OPENROUTER_API_KEY=file-key\nOPENROUTER_MODEL=file/model',
    { OPENROUTER_API_KEY: ' process-key ', OPENROUTER_MODEL: ' process/model ' })
  await embedOpenRouterConfig(packContext)
  assert.deepEqual(JSON.parse(fs.readFileSync(buildConfigPath, 'utf8')), {
    OPENROUTER_MODEL: 'process/model',
  })
})

test('a build without .env remains usable with local or stored credentials', async (context) => {
  const { buildConfigPath, packContext } = setup(context)
  await embedOpenRouterConfig(packContext)
  assert.deepEqual(JSON.parse(fs.readFileSync(buildConfigPath, 'utf8')), {
    OPENROUTER_MODEL: 'openrouter/free',
  })
})

test('each build replaces the previous packaged key and model', async (context) => {
  const { directory, buildConfigPath, packContext } = setup(context,
    'OPENROUTER_API_KEY=old-key\nOPENROUTER_MODEL=old/model')
  await embedOpenRouterConfig(packContext)
  fs.writeFileSync(buildConfigPath, JSON.stringify({ OPENROUTER_API_KEY: 'legacy-secret', OPENROUTER_MODEL: 'old/model' }))
  fs.writeFileSync(path.join(directory, '.env'), 'OPENROUTER_API_KEY=new-key\nOPENROUTER_MODEL=new/model')
  await embedOpenRouterConfig(packContext)
  assert.deepEqual(JSON.parse(fs.readFileSync(buildConfigPath, 'utf8')), {
    OPENROUTER_MODEL: 'new/model',
  })
})
