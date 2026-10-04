'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')
const { parseEnv } = require('node:util')

const nonEmpty = (value) => typeof value === 'string' ? value.trim() : ''

module.exports = async function embedOpenRouterConfig(context) {
  let fileEnv = {}
  try {
    fileEnv = parseEnv(await fs.readFile(path.join(context.packager.projectDir, '.env'), 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const config = {
    OPENROUTER_API_KEY: nonEmpty(process.env.OPENROUTER_API_KEY) || nonEmpty(fileEnv.OPENROUTER_API_KEY),
    OPENROUTER_MODEL: nonEmpty(process.env.OPENROUTER_MODEL) || nonEmpty(fileEnv.OPENROUTER_MODEL) || 'openrouter/free',
  }
  const resources = context.packager.getResourcesDir(context.appOutDir)
  await fs.mkdir(resources, { recursive: true })
  await fs.writeFile(path.join(resources, 'openrouter-build-config.json'), JSON.stringify(config) + '\n')
}
