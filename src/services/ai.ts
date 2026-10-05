import { Capacitor, registerPlugin } from '@capacitor/core'

type AiBridge = Pick<NonNullable<Window['smartL3arn']>,
  'getAiStatus' | 'saveOpenRouterKey' | 'removeOpenRouterKey' | 'evaluateAnswer' | 'getApiUsage' | 'getAiDiagnostics'>

const nativeAi = registerPlugin<{
  getAiStatus: AiBridge['getAiStatus']
  getApiUsage: AiBridge['getApiUsage']
  getAiDiagnostics: AiBridge['getAiDiagnostics']
  saveOpenRouterKey: (options: { apiKey: string }) => ReturnType<AiBridge['saveOpenRouterKey']>
  removeOpenRouterKey: AiBridge['removeOpenRouterKey']
  evaluateAnswer: (input: Parameters<AiBridge['evaluateAnswer']>[0]) => Promise<{ ok: boolean; reason?: string; body?: any }>
}>('NativeAi')

const verdicts = ['correct', 'mostly_correct', 'partially_correct', 'incorrect']

const iosAi: AiBridge = {
  getAiStatus: () => nativeAi.getAiStatus(),
  getApiUsage: () => nativeAi.getApiUsage(),
  getAiDiagnostics: () => nativeAi.getAiDiagnostics(),
  saveOpenRouterKey: (apiKey) => nativeAi.saveOpenRouterKey({ apiKey }),
  removeOpenRouterKey: () => nativeAi.removeOpenRouterKey(),
  async evaluateAnswer(input) {
    if (!input || typeof input.deckName !== 'string' || input.deckName.length > 4000 || [input.question, input.referenceAnswer, input.userAnswer].some(
      value => typeof value !== 'string' || !value.trim() || value.length > 4000,
    )) return { ok: false, reason: 'invalid-input' }
    const response = await nativeAi.evaluateAnswer(input)
    if (!response.ok) return { ok: false, reason: response.reason || 'unavailable' }
    try {
      const parsed = JSON.parse(response.body?.choices?.[0]?.message?.content)
      if (!verdicts.includes(parsed?.verdict) || typeof parsed.feedback !== 'string'
        || !parsed.feedback.trim()) return { ok: false, reason: 'invalid-response' }
      return { ok: true, result: { verdict: parsed.verdict,
        feedback: parsed.feedback.trim().slice(0, 240), model: response.body?.model } }
    } catch { return { ok: false, reason: 'invalid-response' } }
  },
}

export function getAiBridge(): AiBridge | undefined {
  return window.smartL3arn ?? (Capacitor.getPlatform() === 'ios' ? iosAi : undefined)
}
