import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAiBridge } from './ai'

const native = vi.hoisted(() => ({ request: vi.fn(), getAiStatus: vi.fn(),
  saveOpenRouterKey: vi.fn(), removeOpenRouterKey: vi.fn(), getApiUsage: vi.fn(), getAiDiagnostics: vi.fn() }))
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'ios' }, registerPlugin: () => native,
}))

const input = { deckName: 'Biologie', question: 'Was ist Photosynthese?',
  referenceAnswer: 'Umwandlung von Lichtenergie in chemische Energie',
  userAnswer: 'Pflanzen nutzen Licht, um Zucker zu bilden.', language: 'de' as const }

beforeEach(() => { vi.clearAllMocks(); delete window.smartL3arn })

describe('iOS AI bridge', () => {
  it('loads persistent native usage and diagnostics', async () => {
    const usage = { model: 'test/model', groups: [], persistenceError: false, unreadableEntries: 0 }
    const logs = { filename: 'test.jsonl', content: '', persistenceError: false }
    native.getApiUsage.mockResolvedValue(usage)
    native.getAiDiagnostics.mockResolvedValue(logs)
    expect(await getAiBridge()!.getApiUsage()).toEqual(usage)
    expect(await getAiBridge()!.getAiDiagnostics()).toEqual(logs)
  })
  it('sends a structured evaluation through the native transport and accepts valid feedback', async () => {
    native.request.mockResolvedValue({ ok: true, body: { model: 'provider/model', choices: [
      { message: { content: JSON.stringify({ verdict: 'correct', feedback: 'Richtig.' }) } },
    ] } })
    const result = await getAiBridge()!.evaluateAnswer(input)
    expect(result).toEqual({ ok: true, result: {
      verdict: 'correct', feedback: 'Richtig.', model: 'provider/model',
    } })
    const body = native.request.mock.calls[0][0].body
    expect(body.messages[0].content).toContain('German')
    expect(JSON.parse(body.messages[1].content).learner_answer).toBe(input.userAnswer)
    expect(body.response_format.json_schema.strict).toBe(true)
    expect(body).not.toHaveProperty('apiKey')
  })

  it.each(['not json', '{"verdict":"invented","feedback":"OK"}',
    '{"verdict":"correct","feedback":""}'])('rejects invalid model output: %s', async content => {
    native.request.mockResolvedValue({ ok: true, body: { choices: [{ message: { content } }] } })
    expect(await getAiBridge()!.evaluateAnswer(input)).toEqual({ ok: false, reason: 'invalid-response' })
  })

  it('preserves authentication errors for the existing fallback UI', async () => {
    native.request.mockResolvedValue({ ok: false, reason: 'auth' })
    expect(await getAiBridge()!.evaluateAnswer(input)).toEqual({ ok: false, reason: 'auth' })
  })

  it('does not send oversized card data', async () => {
    expect(await getAiBridge()!.evaluateAnswer({ ...input, question: 'x'.repeat(4001) }))
      .toEqual({ ok: false, reason: 'invalid-input' })
    expect(native.request).not.toHaveBeenCalled()
  })

  it('validates and stores keys through the native plugin', async () => {
    native.saveOpenRouterKey.mockResolvedValue({ ok: true })
    await getAiBridge()!.saveOpenRouterKey('test-key')
    expect(native.saveOpenRouterKey).toHaveBeenCalledWith({ apiKey: 'test-key' })
  })
})
