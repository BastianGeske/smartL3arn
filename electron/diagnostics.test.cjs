'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { createDiagnosticStore } = require('./diagnostics.cjs')

async function fixture(context, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'smartl3arn-logs-'))
  context.after(() => fs.rm(directory, { recursive: true, force: true }))
  const filePath = path.join(directory, 'openrouter-debug.jsonl')
  return { directory, filePath, store: createDiagnosticStore(filePath, { appVersion: '1.0.2', ...options }) }
}

function entries(snapshot) {
  return snapshot.content.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line))
}

test('persists useful metadata without credentials, card content, or arbitrary errors', async (context) => {
  const { filePath, store } = await fixture(context)
  const secret = 'sk-or-v1-private-key'
  await store.record({
    event: 'request-failure', operation: 'evaluate', method: 'POST',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'openrouter/free', credentialSource: 'bundled',
    phase: 'read-body', status: 200, apiErrorCode: 502,
    apiErrorType: 'provider_unavailable', networkCode: 'ECONNRESET',
    durationMs: 8000, timeoutMs: 8000, reason: 'unavailable',
    requestId: 'e1a44acf-2551-4eca-8fc1-68d9491f1ca5', generationId: 'gen-test123',
    apiKey: secret, headers: { Authorization: `Bearer ${secret}` },
    question: 'Private question', feedback: 'Private feedback',
    message: `Failed with ${secret}`, body: { answer: 'Private answer' },
  })
  const snapshot = await store.snapshot()
  assert.equal(snapshot.persistenceError, false)
  assert.equal(snapshot.content.includes(secret), false)
  assert.equal(snapshot.content.includes('Private'), false)
  const [entry] = entries(snapshot)
  assert.equal(entry.appVersion, '1.0.2')
  assert.equal(entry.networkCode, 'ECONNRESET')
  assert.equal(entry.apiErrorType, 'provider_unavailable')
  assert.equal(entry.generationId, 'gen-test123')
  assert.equal(entry.durationMs, 8000)
  assert.equal(Number.isFinite(Date.parse(entry.timestamp)), true)
  assert.equal((await fs.stat(filePath)).mode & 0o777, 0o600)

  await store.record({
    event: 'request-failure', model: `provider/${secret}`, reason: secret,
    endpoint: `https://openrouter.ai/api/v1/key?key=${secret}`, apiErrorType: secret,
    networkCode: secret, generationId: `gen-${secret}`,
  })
  assert.equal((await store.snapshot()).content.includes(secret), false)
})

test('serializes concurrent writes and exports complete lines in order', async (context) => {
  const { store } = await fixture(context)
  const writes = Array.from({ length: 20 }, (_, index) => store.record({
    event: 'request-start', durationMs: index, model: 'openrouter/free',
  }))
  const snapshot = store.snapshot()
  const lastWrite = store.record({ event: 'request-success', durationMs: 20 })
  await Promise.all([...writes, lastWrite])
  assert.deepEqual(entries(await snapshot).map((entry) => entry.durationMs),
    Array.from({ length: 20 }, (_, index) => index))
  assert.equal(entries(await store.snapshot()).length, 21)
})

test('rotates bounded logs and retains only the current and previous files', async (context) => {
  const { directory, filePath, store } = await fixture(context, { maxBytes: 1024 })
  for (let index = 0; index < 35; index++) {
    await store.record({
      event: 'request-failure', operation: 'evaluate', phase: 'read-body',
      model: 'provider/test-model', status: 200, reason: 'timeout', durationMs: index,
    })
  }
  assert.deepEqual((await fs.readdir(directory)).sort(), ['openrouter-debug.jsonl', 'openrouter-debug.jsonl.1'])
  assert.ok((await fs.stat(filePath)).size <= 1024)
  assert.ok((await fs.stat(`${filePath}.1`)).size <= 1024)
  const retained = entries(await store.snapshot())
  assert.ok(retained.length < 35)
  assert.equal(retained.at(-1).durationMs, 34)
  assert.ok(retained.every((entry, index) => !index || entry.durationMs > retained[index - 1].durationMs))
})

test('exports sanitize existing files and skip interrupted or malformed lines', async (context) => {
  const { filePath, store } = await fixture(context)
  await fs.writeFile(filePath, [
    JSON.stringify({ timestamp: '2026-10-04T10:00:00Z', event: 'configuration', model: 'openrouter/free', apiKey: 'PRIVATE-KEY' }),
    '{broken',
    JSON.stringify({ timestamp: 'invalid', event: 'request-failure' }),
    JSON.stringify({ timestamp: '2026-10-04T10:01:00Z', event: 'request-failure', reason: 'timeout', message: 'PRIVATE-ANSWER' }),
  ].join('\n'))
  const snapshot = await store.snapshot()
  assert.equal(entries(snapshot).length, 2)
  assert.equal(snapshot.content.includes('PRIVATE'), false)
})

test('reports persistence failures and continues recording after storage recovers', async (context) => {
  const { filePath, store } = await fixture(context)
  await fs.mkdir(filePath)
  await assert.rejects(store.record({ event: 'request-start' }))
  await store.flush()
  await fs.rmdir(filePath)
  assert.equal((await store.snapshot()).persistenceError, true)
  await store.record({ event: 'request-success' })
  assert.equal((await store.snapshot()).persistenceError, false)
  assert.equal(entries(await store.snapshot()).length, 1)
})
