'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const {
  OpenRouterError,
  createCredentialStore,
  createOpenRouterClient,
  parseEvaluation,
} = require('./openrouter.cjs')

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

test('sends only the current card context and requests a strict schema', async () => {
  let request
  const client = createOpenRouterClient({
    fetchImpl: async (_url, options) => {
      request = JSON.parse(options.body)
      return jsonResponse({
        model: 'free/test-model',
        choices: [{ message: { content: JSON.stringify({
          verdict: 'correct',
          feedback: 'Correct.',
        }) } }],
      })
    },
  })

  const result = await client.evaluate('secret', {
    deckName: 'Geography',
    question: 'Capital of Germany?',
    referenceAnswer: 'Berlin',
    userAnswer: 'The capital is Berlin.',
  })

  assert.equal(request.model, 'openrouter/free')
  assert.equal(request.response_format.json_schema.strict, true)
  assert.deepEqual(JSON.parse(request.messages[1].content), {
    deck: 'Geography',
    question: 'Capital of Germany?',
    reference_answer: 'Berlin',
    learner_answer: 'The capital is Berlin.',
  })
  assert.deepEqual(result, {
    verdict: 'correct',
    feedback: 'Correct.',
    model: 'free/test-model',
  })
})

test('maps authentication and rate limit failures', async () => {
  const auth = createOpenRouterClient({ fetchImpl: async () => jsonResponse({}, 401) })
  await assert.rejects(
    auth.validateKey('bad-key'),
    (error) => error instanceof OpenRouterError && error.code === 'auth',
  )

  const limited = createOpenRouterClient({ fetchImpl: async () => jsonResponse({}, 429) })
  await assert.rejects(
    limited.evaluate('key', {
      deckName: 'Deck',
      question: 'Question',
      referenceAnswer: 'Answer',
      userAnswer: 'Attempt',
    }),
    (error) => error instanceof OpenRouterError && error.code === 'rate-limit',
  )
})

test('sends the configured model in answer evaluation requests', async () => {
  let requestedModel
  const client = createOpenRouterClient({
    model: 'provider/custom-model',
    fetchImpl: async (_url, options) => {
      requestedModel = JSON.parse(options.body).model
      return jsonResponse({ choices: [{ message: { content: JSON.stringify({
        verdict: 'correct', feedback: 'Correct.',
      }) } }] })
    },
  })
  await client.evaluate('key', {
    deckName: 'Deck', question: 'Question', referenceAnswer: 'Answer', userAnswer: 'Answer',
  })
  assert.equal(requestedModel, 'provider/custom-model')
})

test('rejects malformed evaluation output', () => {
  assert.throws(
    () => parseEvaluation({ choices: [{ message: { content: '{"verdict":"maybe"}' } }] }),
    (error) => error instanceof OpenRouterError && error.code === 'invalid-response',
  )
})

test('times out a stalled request', async () => {
  const client = createOpenRouterClient({
    timeoutMs: 5,
    fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('aborted')
        error.name = 'AbortError'
        reject(error)
      })
    }),
  })
  await assert.rejects(
    client.validateKey('key'),
    (error) => error instanceof OpenRouterError && error.code === 'timeout',
  )
})

test('stores credentials encrypted and removes them', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'smartl3arn-key-test-'))
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const filePath = path.join(directory, 'key.bin')
  const safeStorage = {
    isAsyncEncryptionAvailable: async () => true,
    encryptStringAsync: async (value) => Buffer.from(`encrypted:${value}`).reverse(),
    decryptStringAsync: async (value) => ({
      result: Buffer.from(value).reverse().toString().replace(/^encrypted:/, ''),
      shouldReEncrypt: false,
    }),
  }
  const store = createCredentialStore({ safeStorage, fs, filePath })

  await store.write('sk-or-secret')
  assert.equal((await fs.promises.readFile(filePath, 'utf8')).includes('sk-or-secret'), false)
  assert.equal(await store.read(), 'sk-or-secret')
  assert.equal(await store.has(), true)
  await store.remove()
  assert.equal(await store.has(), false)
})
