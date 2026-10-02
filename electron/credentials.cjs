'use strict'

const fs = require('node:fs')
const { parseEnv } = require('node:util')

function nonEmpty(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function createCredentialResolver({ env = process.env, envPath, store }) {
  let fileEnv = {}
  try {
    fileEnv = parseEnv(fs.readFileSync(envPath, 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('Could not read local API configuration; using other credential sources.')
    }
  }
  const environmentKey = nonEmpty(env.OPENROUTER_API_KEY) || nonEmpty(fileEnv.OPENROUTER_API_KEY)
  const model = nonEmpty(env.OPENROUTER_MODEL) || nonEmpty(fileEnv.OPENROUTER_MODEL) || 'openrouter/free'

  async function status() {
    const credentialSource = environmentKey ? 'environment' : await store.has() ? 'stored' : null
    return { configured: credentialSource !== null, credentialSource }
  }

  async function read() {
    return environmentKey || await store.read()
  }

  return { status, read, model }
}

module.exports = { createCredentialResolver }
