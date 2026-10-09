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

const evaluationInput = {
  deckName: 'Private deck', question: 'Private question',
  referenceAnswer: 'Private reference', userAnswer: 'Private answer',
}

function evaluationBody() {
  return {
    id: 'gen-test123', model: 'provider/test-model',
    choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({
      verdict: 'correct', feedback: 'Private feedback',
    }) } }],
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
    max_tokens: 999999,
  })

  assert.equal(request.model, 'openrouter/free')
  assert.equal(request.max_tokens, 4096)
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

for (const status of [200, 429]) {
  test(`times out a stalled response body after HTTP ${status}`, { timeout: 1000 }, async () => {
    let receivedBody = false
    const client = createOpenRouterClient({
      timeoutMs: 5,
      fetchImpl: async (_url, options) => ({
        ok: status === 200,
        status,
        json: () => new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => {
            const error = new Error('aborted')
            error.name = 'AbortError'
            reject(error)
          })
        }),
      }),
    })

    await assert.rejects(
      client.evaluate('key', {
        deckName: 'Deck', question: 'Question', referenceAnswer: 'Answer', userAnswer: 'Answer',
      }, () => { receivedBody = true }),
      (error) => error instanceof OpenRouterError && error.code === 'timeout',
    )
    assert.equal(receivedBody, false)
  })
}

for (const [status, expectedCode] of [[200, 'invalid-response'], [401, 'auth']]) {
  test(`maps malformed response JSON after HTTP ${status}`, async () => {
    const client = createOpenRouterClient({
      fetchImpl: async () => ({
        ok: status === 200,
        status,
        json: async () => { throw new SyntaxError('Invalid JSON') },
      }),
    })

    await assert.rejects(
      client.evaluate('key', {
        deckName: 'Deck', question: 'Question', referenceAnswer: 'Answer', userAnswer: 'Answer',
      }),
      (error) => error instanceof OpenRouterError && error.code === expectedCode,
    )
  })
}

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

test('uses documented endpoints and emits correlated diagnostics without private content', async () => {
  const calls = []
  const diagnostics = []
  const client = createOpenRouterClient({
    model: 'provider/test-model',
    onDiagnostic: (entry) => diagnostics.push(entry),
    fetchImpl: async (url, options) => {
      calls.push([url, options.method])
      return jsonResponse(options.method === 'GET'
        ? { data: { label: 'Private key label' } } : evaluationBody())
    },
  })
  await client.validateKey('sk-or-v1-private-key', { credentialSource: 'provided' })
  await client.evaluate('sk-or-v1-private-key', evaluationInput, () => {}, { credentialSource: 'bundled' })
  assert.deepEqual(calls, [
    ['https://openrouter.ai/api/v1/key', 'GET'],
    ['https://openrouter.ai/api/v1/chat/completions', 'POST'],
  ])
  assert.equal(JSON.stringify(diagnostics).includes('Private'), false)
  assert.equal(JSON.stringify(diagnostics).includes('sk-or-v1-private-key'), false)
  for (const operation of ['validate-key', 'evaluate']) {
    const events = diagnostics.filter((entry) => entry.operation === operation)
    assert.deepEqual(events.map((entry) => entry.event),
      ['request-start', 'response-headers', 'response-body', 'request-success'])
    assert.equal(new Set(events.map((entry) => entry.requestId)).size, 1)
    assert.ok(events.every((entry) => Number.isInteger(entry.durationMs) && entry.durationMs >= 0))
    assert.equal(events.at(-1).status, 200)
    assert.equal(events.at(-1).timeoutMs, 60000)
  }
  assert.equal(diagnostics.at(-1).generationId, 'gen-test123')
  assert.equal(diagnostics.at(-1).credentialSource, 'bundled')
})

for (const [status, reason] of [[401, 'auth'], [402, 'credits'], [403, 'forbidden'], [404, 'model-unavailable'], [408, 'timeout'], [429, 'rate-limit'], [502, 'unavailable'], [504, 'timeout']]) {
  test(`distinguishes and logs HTTP ${status} as ${reason}`, async () => {
    const diagnostics = []
    const client = createOpenRouterClient({
      onDiagnostic: (entry) => diagnostics.push(entry),
      fetchImpl: async () => ({
        ...jsonResponse({ error: { code: status, message: 'Private provider message' } }, status),
        headers: { get: () => status === 429 ? '12' : null },
      }),
    })
    await assert.rejects(client.validateKey('key'), (error) => error.code === reason)
    assert.equal(diagnostics.at(-1).event, 'request-failure')
    assert.equal(diagnostics.at(-1).reason, reason)
    assert.equal(diagnostics.at(-1).status, status)
    assert.equal(diagnostics.at(-1).apiErrorCode, status)
    assert.equal(diagnostics.some((entry) => entry.event === 'request-success'), false)
    if (status === 429) assert.equal(diagnostics[1].retryAfterMs, 12000)
    assert.equal(JSON.stringify(diagnostics).includes('Private'), false)
  })
}

for (const location of ['top-level', 'choice']) {
  test(`handles a ${location} provider error inside HTTP 200 and retains usage`, async () => {
    const diagnostics = []
    let usage
    const apiError = { code: 502, metadata: { error_type: 'rate_limit_exceeded' }, message: 'Private' }
    const body = {
      ...evaluationBody(), usage: { total_tokens: 25 },
      ...(location === 'top-level' ? { error: apiError } : {
        choices: [{ ...evaluationBody().choices[0], finish_reason: 'error', error: apiError }],
      }),
    }
    const client = createOpenRouterClient({
      onDiagnostic: (entry) => diagnostics.push(entry), fetchImpl: async () => jsonResponse(body),
    })
    await assert.rejects(client.evaluate('key', evaluationInput, (response) => { usage = response.usage }),
      (error) => error.code === 'rate-limit')
    assert.equal(usage.total_tokens, 25)
    assert.equal(diagnostics.at(-1).status, 200)
    assert.equal(diagnostics.at(-1).apiErrorCode, 502)
    assert.equal(diagnostics.at(-1).apiErrorType, 'rate_limit_exceeded')
    assert.equal(diagnostics.at(-1).phase, 'read-body')
    assert.equal(diagnostics.at(-1).reason, 'rate-limit')
  })
}

for (const phase of ['connect', 'read-body']) {
  test(`logs a network disconnect during ${phase} without leaking exception text`, async () => {
    const diagnostics = []
    const disconnected = new TypeError('Private key or card content', {
      cause: Object.assign(new Error('Private provider detail'), { code: 'ECONNRESET' }),
    })
    const client = createOpenRouterClient({
      onDiagnostic: (entry) => diagnostics.push(entry),
      fetchImpl: async () => {
        if (phase === 'connect') throw disconnected
        return { ...jsonResponse({}), json: async () => { throw disconnected } }
      },
    })
    await assert.rejects(client.evaluate('key', evaluationInput), (error) => error.code === 'unavailable')
    assert.equal(diagnostics.at(-1).networkCode, 'ECONNRESET')
    assert.equal(diagnostics.at(-1).phase, phase)
    assert.equal(JSON.stringify(diagnostics).includes('Private'), false)
  })
}

for (const phase of ['connect', 'read-body']) {
  test(`logs a timeout during ${phase}`, async () => {
    const diagnostics = []
    const client = createOpenRouterClient({
      timeoutMs: 5, onDiagnostic: (entry) => diagnostics.push(entry),
      fetchImpl: (_url, options) => {
        const stalled = () => new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => {
            reject(Object.assign(new Error('Private timeout detail'), { name: 'AbortError' }))
          })
        })
        return phase === 'connect' ? stalled() : Promise.resolve({ ...jsonResponse({}), json: stalled })
      },
    })
    await assert.rejects(client.validateKey('key'), (error) => error.code === 'timeout')
    assert.equal(diagnostics.at(-1).phase, phase)
    assert.equal(diagnostics.at(-1).reason, 'timeout')
    assert.equal(diagnostics.at(-1).timeoutMs, 5)
    assert.equal(diagnostics.at(-1).status, phase === 'read-body' ? 200 : undefined)
  })
}

test('logs invalid evaluation output separately from a connection failure', async () => {
  const diagnostics = []
  const client = createOpenRouterClient({
    onDiagnostic: (entry) => diagnostics.push(entry),
    fetchImpl: async () => jsonResponse({ choices: [{
      finish_reason: 'length', message: { content: 'Private incomplete JSON' },
    }] }),
  })
  await assert.rejects(client.evaluate('key', evaluationInput), (error) => error.code === 'invalid-response')
  assert.equal(diagnostics.at(-1).phase, 'parse-evaluation')
  assert.equal(diagnostics.at(-1).finishReason, 'length')
  assert.equal(diagnostics.at(-1).reason, 'invalid-response')
  assert.equal(JSON.stringify(diagnostics).includes('Private'), false)
})

test('a failed diagnostic sink cannot break a successful evaluation', async () => {
  for (const asyncFailure of [false, true]) {
    const client = createOpenRouterClient({
      onDiagnostic: () => {
        if (asyncFailure) return Promise.reject(new Error('Disk full'))
        throw new Error('Disk full')
      },
      fetchImpl: async () => jsonResponse(evaluationBody()),
    })
    assert.equal((await client.evaluate('key', evaluationInput)).verdict, 'correct')
  }
})

test('can route to a structured-output provider that does not support temperature', async () => {
  const client = createOpenRouterClient({
    model: 'provider/reasoning-model',
    fetchImpl: async (_url, options) => {
      const request = JSON.parse(options.body)
      assert.equal(request.provider.require_parameters, true)
      assert.equal(request.response_format.type, 'json_schema')
      const supported = new Set(['max_tokens', 'response_format'])
      const optionalParameters = ['temperature', 'max_tokens', 'response_format']
      const unsupported = optionalParameters.some((parameter) =>
        Object.hasOwn(request, parameter) && !supported.has(parameter))
      return unsupported
        ? jsonResponse({ error: { code: 404, message: 'No compatible endpoints' } }, 404)
        : jsonResponse(evaluationBody())
    },
  })
  assert.equal((await client.evaluate('key', evaluationInput)).verdict, 'correct')
})
