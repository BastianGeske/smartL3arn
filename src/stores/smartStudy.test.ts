import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useLibraryStore } from './library'
import { useSettingsStore } from './settings'
import { useSmartStudyStore } from './smartStudy'

const bridge = vi.hoisted(() => ({ available: true, evaluateAnswer: vi.fn() }))
vi.mock('../services/ai', () => ({ getAiBridge: () => bridge.available ? bridge : undefined }))
vi.mock('../services/native', () => ({ syncStatusBar: vi.fn(async () => undefined) }))

let smart: ReturnType<typeof useSmartStudyStore>
beforeEach(async () => {
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  })
  delete window.smartL3arn
  bridge.available = true
  bridge.evaluateAnswer.mockReset()
  setActivePinia(createPinia())
  const library = useLibraryStore()
  const deck = await library.createDeck('Biologie')
  await library.addCard(deck.id, 'Was ist Photosynthese?', 'Licht wird in chemische Energie umgewandelt.')
  const settings = useSettingsStore()
  settings.smartConfig.deckIds = [deck.id]
  settings.smartConfig.duration = 0
  settings.smartConfig.evaluationMode = 'openrouter'
  smart = useSmartStudyStore()
  await smart.start()
  smart.session!.typedAnswer = 'Pflanzen erzeugen Zucker mithilfe von Licht.'
})
afterEach(() => { smart?.stopTimer(); vi.unstubAllGlobals() })

describe('AI evaluation selection', () => {
  it('uses the AI result instead of local string similarity', async () => {
    bridge.evaluateAnswer.mockResolvedValue({ ok: true,
      result: { verdict: 'correct', feedback: 'Richtig.', model: 'test/model' } })
    await smart.checkAnswer()
    expect(bridge.evaluateAnswer).toHaveBeenCalledOnce()
    expect(smart.session!.evaluation?.source).toBe('openrouter')
    expect(smart.session!.phase).toBe('reviewing')
  })
  it.each(['auth', 'timeout', 'not-configured'])('preserves the answer and never grades locally on %s', async reason => {
    bridge.evaluateAnswer.mockResolvedValue({ ok: false, reason })
    await smart.checkAnswer()
    expect(smart.session!.phase).toBe('asking')
    expect(smart.session!.evaluation).toBeNull()
    expect(smart.session!.typedAnswer).toContain('Zucker')
    expect(smart.evaluationError).toBeTruthy()
    expect(smart.session!.isEvaluating).toBe(false)
  })
  it('supports a successful retry after an AI error', async () => {
    bridge.evaluateAnswer.mockResolvedValueOnce({ ok: false, reason: 'timeout' })
      .mockResolvedValueOnce({ ok: true, result: { verdict: 'correct', feedback: 'Richtig.' } })
    await smart.checkAnswer()
    await smart.checkAnswer()
    expect(smart.evaluationError).toBeNull()
    expect(smart.session!.evaluation?.source).toBe('openrouter')
  })
  it('reports a missing platform bridge instead of grading locally', async () => {
    bridge.available = false
    await smart.checkAnswer()
    expect(smart.session!.evaluation).toBeNull()
    expect(smart.evaluationError).toBe('ai.unavailable')
  })
  it('uses local grading only when explicitly selected', async () => {
    useSettingsStore().smartConfig.evaluationMode = 'local'
    await smart.checkAnswer()
    expect(smart.session!.evaluation?.source).toBe('local')
    expect(bridge.evaluateAnswer).not.toHaveBeenCalled()
  })
})
