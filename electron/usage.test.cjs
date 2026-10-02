'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { extractUsage, summarizeUsage, createUsageStore } = require('./usage.cjs')
const { createOpenRouterClient } = require('./openrouter.cjs')

test('extracts reported usage without double-counting cached or reasoning tokens', () => {
  const usage = extractUsage({ usage: {
    prompt_tokens: 400, completion_tokens: 80, total_tokens: 480, cost: 0.000176,
    prompt_tokens_details: { cached_tokens: 100 }, completion_tokens_details: { reasoning_tokens: 30 },
  } })
  assert.equal(usage.totalTokens, 480)
  assert.equal(usage.reasoningTokens, 30)
  assert.equal(usage.cachedTokens, 100)
  assert.equal(usage.costUsd, 0.000176)
  assert.equal(extractUsage({}).costUsd, null)
  assert.equal(extractUsage({ usage: { cost: 0 } }).costUsd, 0)
  assert.equal(extractUsage({ usage: { cost: '0', prompt_tokens: -1 } }).costUsd, null)
})

test('summarizes each day and model, distinguishing unknown cost from free calls', () => {
  const timestamp = new Date(2026, 9, 2, 12).toISOString()
  const groups = summarizeUsage([
    { timestamp, model: 'paid/model', outcome: 'success', ...extractUsage({ usage: { prompt_tokens: 400, completion_tokens: 80, cost: 0.000176 } }) },
    { timestamp, model: 'paid/model', outcome: 'failure', ...extractUsage({}) },
    { timestamp, model: 'free/model', outcome: 'success', ...extractUsage({ usage: { prompt_tokens: 400, completion_tokens: 80, cost: 0 } }) },
  ])
  const paid = groups.find((group) => group.model === 'paid/model')
  assert.equal(paid.day, '2026-10-02')
  assert.equal(paid.requests, 2)
  assert.equal(paid.failures, 1)
  assert.equal(paid.tokenRequests, 1)
  assert.equal(paid.costRequests, 1)
  assert.equal(paid.totalTokens, 480)
  assert.equal(paid.costUsd / paid.costRequests * 10_000, 1.76)
  assert.equal(groups.find((group) => group.model === 'free/model').costRequests, 1)
})

test('persists concurrent entries, survives reopening, and excludes sensitive content', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'smartl3arn-usage-test-'))
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const filePath = path.join(directory, 'api-usage.jsonl')
  const store = createUsageStore(filePath)
  assert.deepEqual((await store.report()).groups, [])
  await Promise.all(Array.from({ length: 20 }, () => store.record({
    model: 'model', outcome: 'success', usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0 },
    apiKey: 'secret-key', question: 'private-question', userAnswer: 'private-answer',
  })))
  const raw = fs.readFileSync(filePath, 'utf8')
  assert.equal(raw.includes('secret-key'), false)
  assert.equal(raw.includes('private-question'), false)
  assert.equal(raw.includes('private-answer'), false)
  const reopened = createUsageStore(filePath)
  assert.equal((await reopened.report()).groups[0].requests, 20)
  fs.appendFileSync(filePath, 'incomplete-record\n')
  const report = await reopened.report()
  assert.equal(report.unreadableEntries, 1)
  assert.equal(report.groups[0].totalTokens, 300)
})

test('captures billable usage even when the evaluation result is malformed', async () => {
  let metadata
  const client = createOpenRouterClient({ fetchImpl: async () => ({
    ok: true, status: 200,
    json: async () => ({ model: 'model', usage: { cost: 0.01 }, choices: [] }),
  }) })
  await assert.rejects(client.evaluate('key', {
    deckName: 'Deck', question: 'Question', referenceAnswer: 'Answer', userAnswer: 'Answer',
  }, (body) => { metadata = body }), { code: 'invalid-response' })
  assert.equal(extractUsage(metadata).costUsd, 0.01)
})
