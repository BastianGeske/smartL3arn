import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useLibraryStore } from './library'
import { useSettingsStore } from './settings'
import { useSmartStudyStore } from './smartStudy'
import type { CalculationAnswer, StudyResponse, TaskDefinition } from '../domain/types'
import { createCard } from '../domain/importExport'
import * as tasks from '../domain/tasks'
import * as similarity from '../domain/study/answerSimilarity'

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
afterEach(() => { smart?.stopTimer(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('AI evaluation selection', () => {
  it.each([undefined, 'short_text', 'long_text'] as const)('skips local text comparison for AI %s cards', async kind => {
    const deck = useLibraryStore().decks[0]!
    deck.cards = [createCard('Explain', 'b'.repeat(4000), kind ? { kind } : undefined)]
    await smart.start()
    smart.setResponse({ kind: 'text', value: 'a'.repeat(4000) })
    const evaluate = vi.spyOn(tasks, 'evaluateResponse')
    const compare = vi.spyOn(similarity, 'localEvaluation')
    bridge.evaluateAnswer.mockResolvedValue({ ok: true, result: { verdict: 'incorrect', feedback: 'Try again.' } })
    await smart.checkAnswer()
    expect(evaluate).not.toHaveBeenCalled()
    expect(compare).not.toHaveBeenCalled()
    expect(bridge.evaluateAnswer).toHaveBeenCalledOnce()
  })
  it.each([undefined, 'short_text', 'long_text'] as const)('retains local text comparison for local %s cards', async kind => {
    useSettingsStore().smartConfig.evaluationMode = 'local'
    useLibraryStore().decks[0]!.cards = [createCard('Explain', 'Expected answer', kind ? { kind } : undefined)]
    await smart.start()
    smart.setResponse({ kind: 'text', value: 'Expected answer' })
    const compare = vi.spyOn(similarity, 'localEvaluation')
    await smart.checkAnswer()
    expect(compare).toHaveBeenCalledOnce()
    expect(smart.session!.evaluation).toMatchObject({ source: 'local', verdict: 'correct' })
    expect(bridge.evaluateAnswer).not.toHaveBeenCalled()
  })
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

describe('typed task evaluation', () => {
  describe.each(['local', 'openrouter'] as const)('%s unanswered tasks', mode => {
    it.each(['single_choice', 'multiple_choice'] as const)('grades empty %s punctuation choices as incorrect', async kind => {
      useSettingsStore().smartConfig.evaluationMode = mode
      const deck = useLibraryStore().decks[0]!
      deck.cards = [createCard('Operator?', '/', { kind, options: [{ id: 'divide', text: '/' }, { id: 'multiply', text: '*' }], correctIds: ['divide'] })]
      await smart.start()
      await smart.checkAnswer()
      expect(smart.session!.evaluation?.verdict).toBe('incorrect')
      expect(smart.session!.phase).toBe('reviewing')
      await smart.start()
      smart.setResponse({ kind: 'selection', ids: ['divide'] })
      smart.skip()
      expect(smart.session!.evaluation?.verdict).toBe('incorrect')
      await smart.start()
      smart.setResponse({ kind: 'selection', ids: ['divide'] })
      await smart.checkAnswer()
      expect(smart.session!.evaluation?.verdict).toBe('correct')
      expect(bridge.evaluateAnswer).not.toHaveBeenCalled()
    })
    it('gives no credit when skipping an already correct ordering', async () => {
      useSettingsStore().smartConfig.evaluationMode = mode
      useLibraryStore().decks[0]!.cards = [createCard('Sort', 'A B', { kind: 'ordering', items: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctOrder: ['a', 'b'] })]
      await smart.start()
      smart.setResponse({ kind: 'order', ids: ['a', 'b'] })
      smart.skip()
      expect(smart.session!.evaluation?.verdict).toBe('incorrect')
      expect(bridge.evaluateAnswer).not.toHaveBeenCalled()
    })
  })
  async function calculation(task: TaskDefinition) {
    const deck = useLibraryStore().decks[0]!
    deck.cards = [createCard('Berechne \\(2+2\\).', '4', task)]
    await smart.start()
  }
  it.each<{ answer: CalculationAnswer; response: StudyResponse; reference: string }>([
    { answer: { kind: 'number', value: '4' }, response: { kind: 'text', value: '4' }, reference: '4' },
    { answer: { kind: 'fraction', numerator: '1', denominator: '2' }, response: { kind: 'fraction', numerator: '1', denominator: '2' }, reference: '\\(\\frac{1}{2}\\)' },
    { answer: { kind: 'quantity', pairs: [{ value: '5', unit: 'm' }, { value: '500', unit: 'cm' }] }, response: { kind: 'quantity', value: '5', unit: 'm' }, reference: '5 m / 500 cm' },
    { answer: { kind: 'formula', value: 'x^2' }, response: { kind: 'text', value: 'x*x' }, reference: '\\(x^2\\)' },
  ])('sends only the $answer.kind result as reference with long solution steps', async ({ answer, response, reference }) => {
    const steps = 's'.repeat(3999)
    await calculation({ kind: 'calculation', answer, solutionSteps: [{ kind: 'text', value: steps }], explanation: 'Erklärung' })
    const back = smart.currentCard!.back
    expect(back.length).toBeGreaterThan(4000)
    smart.setResponse(response)
    smart.session!.working = [{ kind: 'text', value: 'Mein Rechenweg' }]
    bridge.evaluateAnswer.mockImplementation(async (input: Parameters<NonNullable<Window['smartL3arn']>['evaluateAnswer']>[0]) => {
      if (input.referenceAnswer.length > 4000 || (input.referenceWorking?.length ?? 0) > 4000) return { ok: false, reason: 'invalid-input' }
      return { ok: true, result: { verdict: 'correct', feedback: 'Richtig.', working: { verdict: 'correct', feedback: 'Rechenweg richtig.' } } }
    })
    await smart.checkAnswer()
    expect(bridge.evaluateAnswer).toHaveBeenCalledOnce()
    expect(bridge.evaluateAnswer.mock.calls[0]![0]).toMatchObject({
      referenceAnswer: reference, referenceWorking: steps, userWorking: 'Mein Rechenweg',
      evaluationScope: answer.kind === 'formula' ? 'answer_and_working' : 'working',
    })
    expect(smart.session!.phase).toBe('reviewing')
    expect(smart.evaluationError).toBeNull()
    expect(smart.currentCard!.back).toBe(back)
  })
  it('excludes solution steps and explanation from formula evaluation without user working', async () => {
    await calculation({ kind: 'calculation', answer: { kind: 'formula', value: 'x^2' }, solutionSteps: [{ kind: 'math', value: 'x*x' }], explanation: 'Erklärung' })
    smart.setResponse({ kind: 'text', value: 'x*x' })
    bridge.evaluateAnswer.mockResolvedValue({ ok: true, result: { verdict: 'correct', feedback: 'Richtig.' } })
    await smart.checkAnswer()
    expect(bridge.evaluateAnswer.mock.calls[0]![0].referenceAnswer).toBe('\\(x^2\\)')
    expect(smart.session!.phase).toBe('reviewing')
  })
  it('checks numbers locally even when AI is selected, preserving exact signs', async () => {
    await calculation({ kind: 'calculation', answer: { kind: 'number', value: '-4' } })
    smart.setResponse({ kind: 'text', value: '4' })
    await smart.checkAnswer()
    expect(bridge.evaluateAnswer).not.toHaveBeenCalled()
    expect(smart.session!.evaluation).toMatchObject({ source: 'local', verdict: 'incorrect' })
  })
  it('keeps invalid fractions in the asking phase without evaluating them', async () => {
    await calculation({ kind: 'calculation', answer: { kind: 'fraction', numerator: '1', denominator: '2' } })
    smart.setResponse({ kind: 'fraction', numerator: '1', denominator: '0' })
    await smart.checkAnswer()
    expect(smart.inputError).toBe('task.invalidMath')
    expect(smart.session!.phase).toBe('asking')
    expect(bridge.evaluateAnswer).not.toHaveBeenCalled()
  })
  it('leaves free formulas for self-assessment in local mode', async () => {
    await calculation({ kind: 'calculation', answer: { kind: 'formula', value: '4' } })
    useSettingsStore().smartConfig.evaluationMode = 'local'
    smart.setResponse({ kind: 'text', value: '2+2' })
    await smart.checkAnswer()
    expect(smart.session!.selfAssessment).toBe(true)
    expect(smart.session!.evaluation).toBeNull()
    expect(smart.session!.phase).toBe('reviewing')
  })
  it('keeps a correct numerical result separate from an incorrect working evaluation', async () => {
    await calculation({ kind: 'calculation', answer: { kind: 'number', value: '4' } })
    smart.setResponse({ kind: 'text', value: '4' })
    smart.session!.working = [{ kind: 'math', value: '2+2=5=4' }]
    bridge.evaluateAnswer.mockResolvedValue({ ok: true, result: { verdict: 'incorrect', feedback: 'Der Zwischenschritt ist falsch.' } })
    await smart.checkAnswer()
    expect(bridge.evaluateAnswer).toHaveBeenCalledOnce()
    expect(bridge.evaluateAnswer.mock.calls[0]![0]).toMatchObject({ evaluationScope: 'working', userWorking: '\\[2+2=5=4\\]' })
    expect(smart.session!.evaluation?.verdict).toBe('correct')
    expect(smart.session!.workingEvaluation?.verdict).toBe('incorrect')
  })
  it('checks a formula and working with one request and independent feedback', async () => {
    await calculation({ kind: 'calculation', answer: { kind: 'formula', value: '4' } })
    smart.setResponse({ kind: 'text', value: '2+2' })
    smart.session!.working = [{ kind: 'text', value: 'Ich addiere zwei und zwei.' }]
    bridge.evaluateAnswer.mockResolvedValue({ ok: true, result: { verdict: 'correct', feedback: 'Ergebnis richtig.', working: { verdict: 'correct', feedback: 'Rechenweg richtig.' } } })
    await smart.checkAnswer()
    expect(bridge.evaluateAnswer).toHaveBeenCalledOnce()
    expect(bridge.evaluateAnswer.mock.calls[0]![0].evaluationScope).toBe('answer_and_working')
    expect(smart.session!.evaluation?.feedback).toBe('Ergebnis richtig.')
    expect(smart.session!.workingEvaluation?.feedback).toBe('Rechenweg richtig.')
  })
  it('preserves the numerical answer and all working on AI errors and resets them after a manual rating', async () => {
    await calculation({ kind: 'calculation', answer: { kind: 'number', value: '4' } })
    smart.setResponse({ kind: 'text', value: '4' })
    smart.session!.working = [{ kind: 'text', value: 'Zwei plus zwei.' }]
    bridge.evaluateAnswer.mockResolvedValueOnce({ ok: false, reason: 'timeout' }).mockResolvedValueOnce({ ok: true, result: { verdict: 'correct', feedback: 'Richtig.' } })
    await smart.checkAnswer()
    expect(smart.session!.phase).toBe('asking')
    expect(smart.session!.working).toHaveLength(1)
    expect(smart.session!.response).toEqual({ kind: 'text', value: '4' })
    await smart.checkAnswer()
    await smart.rate(0)
    expect(smart.session!.working).toEqual([])
    expect(smart.session!.workingEvaluation).toBeNull()
    expect(smart.session!.response).toEqual({ kind: 'text', value: '' })
    expect(smart.currentCard!.task!.kind).toBe('calculation')
  })
})

describe('serialized AI length validation', () => {
  it.each(['reference', 'referenceWorking', 'working'] as const)('identifies oversized %s before requesting AI and preserves the draft', async field => {
    const task: TaskDefinition = { kind: 'calculation', answer: { kind: 'formula', value: field === 'reference' ? 'x'.repeat(3997) : 'x' },
      solutionSteps: field === 'referenceWorking' ? [{ kind: 'math', value: 'x'.repeat(3997) }] : [] }
    useLibraryStore().decks[0]!.cards = [createCard('Calculate', '', task)]
    await smart.start()
    smart.setResponse({ kind: 'text', value: 'x' })
    smart.session!.working = [{ kind: 'math', value: field === 'working' ? 'x'.repeat(3997) : 'x' }]
    const working = structuredClone(smart.session!.working.map(s => ({ ...s })))
    await smart.checkAnswer()
    expect(smart.inputError).toBe(field === 'reference' ? 'task.aiReferenceTooLong' : field === 'referenceWorking' ? 'task.aiReferenceWorkingTooLong' : 'task.aiWorkingTooLong')
    expect(smart.session!.phase).toBe('asking')
    expect(smart.session!.isEvaluating).toBe(false)
    expect(smart.session!.working).toEqual(working)
    expect(smart.session!.response).toEqual({ kind: 'text', value: 'x' })
    expect(bridge.evaluateAnswer).not.toHaveBeenCalled()
  })
  it('allows a formula whose serialized reference is exactly 4,000 characters', async () => {
    useLibraryStore().decks[0]!.cards = [createCard('Calculate', '', { kind: 'calculation', answer: { kind: 'formula', value: 'x'.repeat(3996) } })]
    await smart.start()
    smart.setResponse({ kind: 'text', value: 'x' })
    bridge.evaluateAnswer.mockResolvedValue({ ok: true, result: { verdict: 'correct', feedback: 'Correct.' } })
    await smart.checkAnswer()
    expect(bridge.evaluateAnswer).toHaveBeenCalledOnce()
    expect(bridge.evaluateAnswer.mock.calls[0]![0].referenceAnswer).toHaveLength(4000)
    expect(smart.inputError).toBeNull()
  })
})
