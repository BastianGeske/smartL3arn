'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')
const { parseEnv } = require('node:util')

const nonEmpty = value => typeof value === 'string' ? value.trim() : ''

async function embedIosOpenRouterConfig({ projectDir, resourcesDir, configuration, env = process.env }) {
  const target = path.join(resourcesDir, 'openrouter-private-build.json')
  // Never carry a previous Debug credential into a Release/archive build.
  if (configuration !== 'Debug') {
    await fs.rm(target, { force: true })
    return { configured: false }
  }
  let fileEnv = {}
  try {
    fileEnv = parseEnv(await fs.readFile(path.join(projectDir, '.env'), 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const config = {
    OPENROUTER_API_KEY: nonEmpty(env.OPENROUTER_API_KEY) || nonEmpty(fileEnv.OPENROUTER_API_KEY),
    OPENROUTER_MODEL: nonEmpty(env.OPENROUTER_MODEL) || nonEmpty(fileEnv.OPENROUTER_MODEL) || 'openrouter/free',
  }
  if (!config.OPENROUTER_API_KEY) {
    await fs.rm(target, { force: true })
    return { configured: false }
  }
  await fs.mkdir(resourcesDir, { recursive: true })
  await fs.writeFile(target, JSON.stringify(config) + '\n', { mode: 0o600 })
  return { configured: true }
}

module.exports = { embedIosOpenRouterConfig }

if (require.main === module) {
  embedIosOpenRouterConfig({
    projectDir: path.resolve(process.env.SRCROOT, '../..'),
    resourcesDir: path.join(process.env.TARGET_BUILD_DIR, process.env.UNLOCALIZED_RESOURCES_FOLDER_PATH),
    configuration: process.env.CONFIGURATION,
  }).then(result => {
    console.log(result.configured ? 'Private iOS AI configuration included (key hidden).'
      : 'No private iOS AI credential included.')
  }).catch(() => {
    console.error('Could not prepare private iOS AI configuration; check .env and build paths.')
    process.exitCode = 1
  })
}
