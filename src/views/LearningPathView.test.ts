import { codeFingerprint } from '../domain/pathCode'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import example from '../../docs/learning-path.example.json'
import roundsExample from '../../docs/learning-path.rounds.example.json'
import { freshProgress, normalizePath, normalizePaths, pathKey, type WrittenCheck } from '../../shared/learning-paths.mjs'
import { useLibraryStore } from '../stores/library'
import { useUiStore } from '../stores/ui'
import { advance, gradeLocal } from '../domain/learningPath'
import type { StudyResponse, TaskDefinition } from '../domain/types'
import { setLanguage } from '../i18n'
import { BrowserStorage } from '../services/storage/browserStorage'
import { practiceBackupKey, readDraftBackup, reviewBackupKey } from '../services/storage/pathDraftBackup'
import LearningPathView from './LearningPathView.vue'
import LearningPathsView from './LearningPathsView.vue'
import * as ai from '../services/ai'

vi.mock('mathlive', () => {
  class FakeField extends HTMLElement {
    value = ''
    readOnly = false
  }
  customElements.define('test-path-math-field', FakeField)
  return { MathfieldElement: FakeField }
})

let wrapper: VueWrapper
const setup = () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({history:createMemoryHistory(),routes:[
    {path:'/learn',name:'learning-paths',component:LearningPathsView},
    {path:'/learn/:key',name:'learning-path',component:LearningPathView},
  ]})
  const library = useLibraryStore()
  const open = async (url: string) => {
    await router.push(url)
    await router.isReady()
    wrapper = mount(RouterView,{attachTo:document.body,global:{plugins:[pinia,router],stubs:{AppBar:true}}})
    await flushPromises()
  }
  return {pinia,router,library,open}
}
let ctx: ReturnType<typeof setup>
beforeEach(() => { localStorage.clear(); setLanguage('de'); ctx = setup() })
afterEach(() => { wrapper?.unmount(); disposePinia(ctx.pinia); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); setLanguage('system') })
async function click(label: string) {
  await vi.waitFor(() => expect(wrapper.findAll('button').some(b => b.text() === label && !b.element.disabled), label).toBe(true))
  await wrapper.findAll('button').find(b=>b.text() === label)!.trigger('click')
  await flushPromises()
}
async function chooseTopic(id: string) {
  await click('Themen')
  const option = wrapper.get(`.path-topic[data-objective="${id}"]`)
  const chapter = option.element.closest('details')!
  chapter.open = true
  await option.trigger('click')
  await vi.waitFor(() => expect(wrapper.get('.path-topic-index').attributes('open')).toBeUndefined())
}
const saved = () => ctx.library.data.learningPaths![0]!.progress
async function reopenPath() {
  const previous = ctx, previousView = wrapper
  const url = previous.router.currentRoute.value.fullPath
  ctx = setup()
  await ctx.library.hydrate()
  await ctx.open(url)
  return async () => {
    previousView.unmount()
    await flushPromises()
    disposePinia(previous.pinia)
  }
}
const configured = { available: true, configured: true, credentialSource: null, model: 'test/model' }
function mockAi(evaluateCriteria = vi.fn(), getAiStatus = vi.fn().mockResolvedValue(configured)) {
  vi.spyOn(ai, 'getAiBridge').mockReturnValue({ evaluateCriteria, getAiStatus } as unknown as ReturnType<typeof ai.getAiBridge>)
  return { evaluateCriteria, getAiStatus }
}
async function prepareSecondCheck(input?: WrittenCheck['input'], overrides: Partial<WrittenCheck> = {}) {
  const content = normalizePath(example)
  Object.assign(content.chapters[1]!.objectives[0]!.checks[0]!.written!, { input, ...overrides })
  const key = await ctx.library.installPath(content)
  if (input === 'code') {
    const activity = content.chapters[1]!.objectives[0]!.checks[0]!
    await ctx.library.updatePath(key, row => ({ ...row.progress, codeValidations: [{ activityId: activity.id, model: 'test/model', fingerprint: codeFingerprint(activity.written!) }] }))
  }
  await ctx.library.updatePath(key,advance)
  await ctx.library.updatePath(key,r=>gradeLocal(r,{kind:'text',value:'6'}))
  await ctx.library.updatePath(key,advance)
  await ctx.library.updatePath(key,r=>gradeLocal(r,{kind:'text',value:'15'}))
  await ctx.library.updatePath(key,advance)
  await ctx.library.updatePath(key,r=>gradeLocal(r,{kind:'fields',values:{basis:'50',prozent:'20'}}))
  await ctx.library.updatePath(key,advance)
  return key
}
async function openWritten(evaluateCriteria = vi.fn()) {
  mockAi(evaluateCriteria)
  const key = await prepareSecondCheck()
  await ctx.open('/learn/'+key)
  await click('In eigenen Worten mit KI beantworten')
  await vi.waitFor(()=>expect(wrapper.find('textarea').exists()).toBe(true))
  await wrapper.get('textarea').setValue('Der Grundwert ist 80 und der Anstieg ist ein Viertel.')
}

it('gives actionable practice feedback and keeps self-check details until the saved round summary', async () => {
  const provider = vi.fn().mockResolvedValueOnce({ ok: false, reason: 'timeout' }).mockResolvedValueOnce({
    ok: true, result: { criteria: [
      { id: 'basis', status: 'satisfied', reason: 'Du rekonstruierst den alten Preis.' },
      { id: 'rate', status: 'missing', reason: 'Der Prozentsatz fehlt.' },
    ] },
  })
  mockAi(provider)
  const key = await ctx.library.installPath(roundsExample)
  await ctx.open('/learn/' + key)
  await click('Übung beginnen')
  await vi.waitFor(() => expect(wrapper.find('input[aria-label="basis"]').exists()).toBe(true))
  const base = wrapper.get<HTMLInputElement>('input[aria-label="basis"]')
  const share = wrapper.get<HTMLInputElement>('input[aria-label="prozent"]')
  expect(wrapper.get('.path-round-progress').text()).toContain('Aufgabe 1 von 3')
  expect(wrapper.findAll('button').some(button => button.text() === 'Lösung ansehen')).toBe(false)
  await base.setValue('80')
  share.element.focus()
  await share.setValue('20')
  await click('Antwort prüfen')
  await vi.waitFor(() => expect(wrapper.get('.path-answer-feedback h3').text()).toBe('Teilweise richtig'))
  expect(document.activeElement).toBe(wrapper.get('.path-answer-feedback h3').element)
  expect(wrapper.get('.path-feedback-list [data-correct="true"]').text()).toContain('Basis')
  expect(wrapper.get('.path-feedback-list [data-correct="false"]').text()).toContain('Prozent')
  expect(wrapper.get('.path-answer-feedback').text()).toContain('Nächster Denkschritt')
  await click('Antwort bearbeiten')
  expect(document.activeElement).toBe(share.element)
  expect(share.element.value).toBe('20')
  await click('Lösung ansehen')
  await vi.waitFor(() => expect(wrapper.get('.path-feedback-solution').attributes('open')).toBeDefined())

  async function answerNumber(value: string) {
    await vi.waitFor(() => expect(wrapper.find('.task-number-input input:not([disabled])').exists()).toBe(true))
    await wrapper.get('.task-number-input input:not([disabled])').setValue(value)
    await click('Antwort prüfen')
  }
  for (const value of ['25', '20']) {
    await click('Nächste Übung')
    await answerNumber(value)
  }
  await vi.waitFor(() => expect(wrapper.get('.path-round-brief').text()).toContain('4 von 5'))
  await click('Selbstkontrolle starten')
  await click('In eigenen Worten mit KI beantworten')
  await vi.waitFor(() => expect(wrapper.find('#written-answer').exists()).toBe(true))
  await wrapper.get('#written-answer').setValue('Der Ausgangspreis betrug 72 Euro.')
  await click('Antwort prüfen')
  await vi.waitFor(() => expect(wrapper.text()).toContain('Die KI-Prüfung ist nicht verfügbar'))
  expect(saved()).toMatchObject({ mode: 'local', prose: 'Der Ausgangspreis betrug 72 Euro.', selfCheck: { answers: [] } })
  await click('In eigenen Worten mit KI beantworten')
  await vi.waitFor(() => expect(wrapper.find('#written-answer').exists()).toBe(true))
  await click('Antwort prüfen')
  await vi.waitFor(() => expect(saved().selfCheck?.answers).toHaveLength(1))
  expect(wrapper.get('.path-answer-feedback h3').text()).toBe('Teilweise richtig')
  expect(wrapper.find('.path-feedback-list').exists()).toBe(false)
  expect(wrapper.find('.path-feedback-solution').exists()).toBe(false)

  const closeOldView = await reopenPath()
  try {
    expect(wrapper.get('.path-round-progress').text()).toContain('Aufgabe 1 von 5')
    for (const value of ['15', '10', '37,5', '15']) {
      await click('Nächste Aufgabe')
      await answerNumber(value)
    }
    await vi.waitFor(() => expect(wrapper.get('.path-round-summary h2').text()).toBe('Selbstkontrolle bestanden'))
    expect(document.activeElement).toBe(wrapper.get('.path-round-summary h2').element)
    expect(wrapper.get('.path-round-score').text()).toBe('4 von 5 selbstständig richtig')
    const first = wrapper.findAll('.path-round-results > li > details')[0]!
    first.element.setAttribute('open', '')
    expect(first.get('.path-feedback-answer').text()).toContain('Der Ausgangspreis betrug 72 Euro.')
    expect(first.get('.path-feedback-list').text()).toContain('Der Prozentsatz fehlt.')
    await click('Lernpfad abschließen')
    await vi.waitFor(() => expect(wrapper.get('.path-study h2').text()).toBe('Lernpfad abgeschlossen'))
    expect(saved().passed).toEqual(['aenderung'])
    await chooseTopic('aenderung')
    expect(wrapper.get('.path-completed-round .path-round-score').text()).toBe('4 von 5 selbstständig richtig')
  } finally { await closeOldView() }
})

it('revisits instruction after a failed self-check and retains seen cases after reloading', async () => {
  const content = normalizePath(roundsExample)
  content.chapters[0]!.objectives[0]!.selfCheckSize = 3
  const key = await ctx.library.installPath(content)
  async function finishPractice() {
    const responses: StudyResponse[] = [{ kind: 'fields', values: { basis: '80', prozent: '25' } },
      { kind: 'text', value: '25' }, { kind: 'text', value: '20' }]
    for (const answer of responses) {
      await ctx.library.updatePath(key, row => gradeLocal(row, answer))
      await ctx.library.updatePath(key, advance)
    }
  }
  await ctx.library.updatePath(key, advance)
  await finishPractice()
  for (let i = 0; i < 3; i++) {
    await ctx.library.updatePath(key, row => gradeLocal(row, i === 0
      ? { kind: 'fields', values: { basis: '90', prozent: '20' } }
      : { kind: 'text', value: i === 1 ? '15' : '10' }))
    if (i < 2) await ctx.library.updatePath(key, advance)
  }
  await ctx.open('/learn/' + key)
  expect(wrapper.get('.path-round-summary h2').text()).toBe('Selbstkontrolle noch nicht bestanden')
  await click('Erklärung und Übungen wiederholen')
  await vi.waitFor(() => expect(saved().phase).toBe('lesson'))
  expect(wrapper.get('.path-active-study .path-example').text()).toContain('50 Liter')
  expect(saved().seenChecks).toEqual(['k1', 'k2', 'k3'])
  expect(saved().passed).toEqual([])
  expect(saved().reviews).toBeUndefined()
  const closeOldView = await reopenPath()
  try {
    await click('Übung beginnen')
    await vi.waitFor(() => expect(saved().phase).toBe('practice'))
    expect(wrapper.get('.path-round-progress').text()).toContain('Aufgabe 1 von 3')
    expect(saved().seenChecks).toEqual(['k1', 'k2', 'k3'])
    await finishPractice()
    expect(saved().selfCheck?.queue).toEqual(['k4', 'k5', 'k6'])
    expect(saved().selfCheck?.repeated).toEqual([])
  } finally { await closeOldView() }
})

it('opens the timer setup and supports starting, pausing, resuming, and resetting from the badge', async () => {
  const key = await ctx.library.installPath(example)
  await ctx.open('/learn/' + key)
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
  const badge = wrapper.get('.path-focus-trigger')
  const dialog = wrapper.get('.path-focus-dialog')
  expect(badge.text()).toBe('Lerntimer')
  expect(dialog.attributes('open')).toBeUndefined()
  expect(vi.getTimerCount()).toBe(0)
  await badge.trigger('click')
  expect(dialog.attributes('open')).toBeDefined()
  expect(dialog.get('[role="timer"]').text()).toBe('25:00')
  expect(document.activeElement).toBe(dialog.get('.btn-primary').element)
  await dialog.trigger('cancel')
  expect(dialog.attributes('open')).toBeUndefined()
  expect(document.activeElement).toBe(badge.element)
  expect(vi.getTimerCount()).toBe(0)

  await badge.trigger('click')
  await click('Timer starten')
  expect(dialog.attributes('open')).toBeUndefined()
  expect(document.activeElement).toBe(badge.element)
  expect(badge.text()).toBe('25:00')
  await vi.advanceTimersByTimeAsync(1000)
  expect(badge.text()).toBe('24:59')

  await badge.trigger('click')
  await click('Pausieren')
  await dialog.trigger('cancel')
  await vi.advanceTimersByTimeAsync(10_000)
  expect(badge.text()).toContain('24:59')
  expect(badge.text()).toContain('Pausiert')
  expect(vi.getTimerCount()).toBe(0)
  await badge.trigger('click')
  await click('Fortsetzen')
  await vi.advanceTimersByTimeAsync(1000)
  expect(badge.text()).toBe('24:58')
  await click('Zurücksetzen')
  expect(dialog.attributes('open')).toBeUndefined()
  expect(badge.text()).toBe('Lerntimer')
  expect(document.activeElement).toBe(badge.element)
  expect(vi.getTimerCount()).toBe(0)
})

it('keeps the countdown within the path, announces expiry once, and preserves the focused review answer', async () => {
  const key = await ctx.library.installPath(example)
  const otherKey = await ctx.library.installPath({ ...example, id: 'anderer-lernpfad' })
  await ctx.library.updatePath(key, row => ({ ...row.progress, passed: ['anteil'] }))
  await ctx.open('/learn/' + key)
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
  const ui = useUiStore(ctx.pinia)
  const toast = vi.spyOn(ui, 'showToast')
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  const badge = wrapper.get('.path-focus-trigger')
  const start = Date.now()
  await badge.trigger('click')
  await click('Timer starten')
  await click('Übung beginnen')
  await vi.waitFor(() => expect(saved().phase).toBe('practice'))
  await click('Ein fälliges Lernziel wiederholen')
  await vi.waitFor(() => expect(wrapper.find('.path-review').exists()).toBe(true))
  expect(badge.text()).toBe('25:00')
  const answer = wrapper.get<HTMLInputElement>('.path-review input')
  answer.element.focus()
  await answer.setValue('8')

  hidden.mockReturnValue(true)
  vi.setSystemTime(start + 25 * 60_000)
  document.dispatchEvent(new Event('visibilitychange'))
  expect(toast).not.toHaveBeenCalled()
  hidden.mockReturnValue(false)
  document.dispatchEvent(new Event('visibilitychange'))
  document.dispatchEvent(new Event('visibilitychange'))
  await vi.waitFor(() => expect(badge.text()).toBe('Zeit abgelaufen'))
  expect(toast).toHaveBeenCalledExactlyOnceWith('path.timer.finished')
  expect(wrapper.get('.path-focus-dialog').attributes('open')).toBeUndefined()
  expect(document.activeElement).toBe(answer.element)
  expect(answer.element.value).toBe('8')
  expect(vi.getTimerCount()).toBe(0)
  await badge.trigger('click')
  await click('Erneut starten')
  expect(badge.text()).toBe('25:00')
  await ctx.router.push('/learn/' + otherKey)
  expect(wrapper.get('.path-focus-trigger').text()).toBe('Lerntimer')
  expect(vi.getTimerCount()).toBe(0)
})

it('updates the open timer dialog at expiry and keeps its primary action focused', async () => {
  const key = await ctx.library.installPath(example)
  await ctx.open('/learn/' + key)
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
  const toast = vi.spyOn(useUiStore(ctx.pinia), 'showToast')
  const badge = wrapper.get('.path-focus-trigger')
  const dialog = wrapper.get('.path-focus-dialog')
  await badge.trigger('click')
  await click('Timer starten')
  await badge.trigger('click')
  const primary = dialog.get('.btn-primary')
  expect(document.activeElement).toBe(primary.element)
  await vi.advanceTimersByTimeAsync(25 * 60_000)
  expect(badge.text()).toBe('Zeit abgelaufen')
  expect(dialog.attributes('open')).toBeDefined()
  expect(dialog.get('[role="status"]').text()).toBe('Zeit abgelaufen')
  expect(primary.text()).toBe('Erneut starten')
  expect(document.activeElement).toBe(primary.element)
  expect(toast).not.toHaveBeenCalled()
  await click('Fertig')
  expect(badge.text()).toBe('Lerntimer')
  expect(document.activeElement).toBe(badge.element)
})

it('renders bold markers in imported lesson and practice text', async () => {
  const content = normalizePath(example)
  const goal = content.chapters[0]!.objectives[0]!
  delete goal.opening
  goal.explanation = '**Bereiche der Arduino IDE 2.x**\n- **Überprüfen (Häkchen):** übersetzt den Sketch.\n\n**Was technisch passiert**\n1. **Überprüfen = Kompilieren:** Der Compiler übersetzt den Sketch.'
  goal.example = '**Formel \\(x^2\\)**\n**Ohne Endmarker\n**<em>Text</em>**'
  goal.practice.question = '**Aufgabe:** Wie viele Personen singen im Bass?'
  goal.practice.hint = 'Addiere **10 % und 5 %**.'
  goal.practice.solution = '**6 Personen** singen im Bass.'

  const key = await ctx.library.installPath(content)
  await ctx.open('/learn/' + key)
  const lesson = wrapper.get('.path-active-study')
  const explanation = lesson.get('.math-content')
  expect(explanation.findAll('strong').map(node => node.text())).toEqual([
    'Bereiche der Arduino IDE 2.x', 'Überprüfen (Häkchen):', 'Was technisch passiert', 'Überprüfen = Kompilieren:',
  ])
  expect(explanation.element.textContent).toBe(goal.explanation.replaceAll('**', ''))
  const workedExample = lesson.get('.path-example')
  expect(workedExample.find('strong .katex').exists()).toBe(true)
  expect(workedExample.text()).toContain('**Ohne Endmarker')
  expect(workedExample.findAll('strong').at(-1)?.text()).toBe('<em>Text</em>')
  expect(workedExample.find('em').exists()).toBe(false)

  await click('Übung beginnen')
  await vi.waitFor(() => expect(wrapper.find('.task-question strong').element?.textContent).toBe('Aufgabe:'))
  await click('Hinweis anzeigen')
  await vi.waitFor(() => expect(wrapper.find('.path-example strong').element?.textContent).toBe('10 % und 5 %'))
  await click('Lösung ansehen')
  await vi.waitFor(() => expect(wrapper.find('.path-example strong').element?.textContent).toBe('6 Personen'))
})

it('opens a completed explanation from the topic picker and closes the picker on Escape', async () => {
  const passed = example.chapters.flatMap(chapter => chapter.objectives.map(goal => goal.id))
  const rows = normalizePaths([{ content: example, progress: { ...freshProgress(), passed } }])
  await ctx.library.addDecks([], rows)
  await ctx.open('/learn/' + pathKey(rows[0]!.content))

  await click('Themen')
  const topics = wrapper.get('.path-topic-index')
  expect(topics.attributes('open')).toBeDefined()
  await topics.trigger('cancel')
  expect(topics.attributes('open')).toBeUndefined()
  expect(document.activeElement?.textContent).toContain('Themen')

  await chooseTopic('wechsel')
  const lesson = wrapper.get('.path-completed-topic')
  expect(lesson.findAll('.math-content')).toHaveLength(2)
  expect(document.activeElement).toBe(lesson.get('h2').element)
  await click('Zurück zum Lernpfad')
  expect(wrapper.get('.path-pass').text()).toContain('Lernpfad abgeschlossen')
})

it('confirms deletion from the path list and reports failed writes before allowing retry', async () => {
  const key = await ctx.library.installPath(example)
  await ctx.library.updatePath(key, advance)
  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValue(true)
  await ctx.open('/learn')

  await click('Löschen')
  expect(confirm).toHaveBeenLastCalledWith(expect.stringContaining(example.title + '“ (Version ' + example.version + ')'))
  expect(saved().phase).toBe('practice')

  vi.spyOn(BrowserStorage.prototype, 'save').mockRejectedValueOnce(new Error('full'))
  await click('Löschen')
  expect(wrapper.get('[role="status"]').text()).toBe('Der Lernpfad konnte nicht gelöscht werden.')
  expect(saved().phase).toBe('practice')

  await click('Löschen')
  await vi.waitFor(() => expect(wrapper.get('[role="status"]').text()).toBe('Lernpfad gelöscht.'))
  expect(wrapper.findAll('button').some(button => button.text() === 'Löschen')).toBe(false)
  expect((await new BrowserStorage().load()).learningPaths).toEqual([])
  expect(wrapper.text()).toContain('Noch keine Lernpfade')
  expect(wrapper.text()).not.toContain(example.title)
})

it('marks each malformed numeric blank and lets the learner correct the same attempt', async () => {
  const key = await prepareSecondCheck()
  await ctx.open('/learn/' + key)
  const attempt = saved().attempt
  const base = wrapper.get('input[aria-label="basis"]')
  const percentage = wrapper.get('input[aria-label="prozent"]')
  await base.setValue('1/0')
  await percentage.setValue('25%')
  await percentage.trigger('keydown', { key: 'Enter' })
  await flushPromises()
  expect(saved()).toMatchObject({ attempt, outcome: 'open', passed: ['anteil'] })
  for (const field of [base, percentage]) {
    expect(field.attributes('aria-invalid')).toBe('true')
    expect(document.getElementById(field.attributes('aria-describedby') ?? '')?.textContent).toContain('ohne Einheit')
    expect(field.attributes('disabled')).toBeUndefined()
  }
  expect(document.activeElement).toBe(base.element)
  await base.setValue('80,0')
  expect(base.attributes('aria-invalid')).toBeUndefined()
  expect(percentage.attributes('aria-invalid')).toBe('true')
  await percentage.setValue('100/4')
  await click('Antwort prüfen')
  await vi.waitFor(() => expect(saved().passed).toEqual(['anteil', 'wechsel']))
})

it('shows the failed check solution without changing progress or the next check', async () => {
  const key = await prepareSecondCheck()
  await ctx.open('/learn/' + key)
  await wrapper.get('input[aria-label="basis"]').setValue('80')
  await wrapper.get('input[aria-label="prozent"]').setValue('20')
  await click('Antwort prüfen')
  await vi.waitFor(() => expect(saved().outcome).toBe('retry'))
  const summary = wrapper.get('.path-study details.path-example summary')
  const progress = JSON.parse(JSON.stringify(saved()))
  expect(progress).toMatchObject({ help: 'none', outcome: 'retry', passed: ['anteil'] })
  expect(summary.text()).toBe('Lösung ansehen')
  expect(summary.element.parentElement).toHaveProperty('open', false)
  await summary.trigger('click')
  expect(summary.element.parentElement).toHaveProperty('open', true)
  expect(summary.element.parentElement?.textContent).toContain(example.chapters[1]!.objectives[0]!.checks[0]!.solution)
  expect(saved()).toEqual(progress)
  await click('Andere Prüfaufgabe versuchen')
  await vi.waitFor(() => expect(saved()).toMatchObject({ variant: 1, outcome: 'open', passed: ['anteil'] }))
  expect(wrapper.find('.path-study details.path-example').exists()).toBe(false)
})

const items = [{ id: 'a', text: 'Erster Eintrag' }, { id: 'b', text: 'Zweiter Eintrag' }]
const stableResponseCases: [TaskDefinition, string][] = [
  [{ kind: 'single_choice', options: items, correctIds: ['a'] }, '.task-choice input[type="radio"]'],
  [{ kind: 'matching', pairs: items.map(item => ({ id: item.id, left: item.text, right: `Antwort ${item.id}` })) }, '.task-matching select option'],
  [{ kind: 'ordering', items, correctOrder: ['a', 'b'] }, '.task-order-pool button'],
]
it.each(stableResponseCases)('keeps $kind controls mounted through hint and lesson review', async (task, selector) => {
  const content = structuredClone(example)
  Object.assign(content.chapters[0]!.objectives[0]!.checks[0]!, { task })
  const key = await ctx.library.installPath(content)
  await ctx.library.updatePath(key, advance)
  await ctx.library.updatePath(key, row => gradeLocal(row, { kind: 'text', value: '6' }))
  await ctx.library.updatePath(key, advance)
  await ctx.open('/learn/' + key)
  const elements = () => wrapper.findAll(selector).map(control => control.element)
  const original = elements()
  expect(original.length).toBeGreaterThan(1)
  for (const [action, help] of [['Hinweis anzeigen', 'hint'], ['Erklärung nachlesen', 'lesson']]) {
    await click(action)
    await vi.waitFor(() => expect(saved().help).toBe(help))
    const current = elements()
    expect(current).toHaveLength(original.length)
    expect(current.every((element, index) => element === original[index])).toBe(true)
  }
  await click('Zur Aufgabe zurück')
  await click('Lösung ansehen')
  await click('Andere Prüfaufgabe versuchen')
  await vi.waitFor(() => expect(saved().variant).toBe(1))
  expect(elements()).toHaveLength(0)
})

it.each(['unconfigured', 'unavailable', 'error'] as const)('keeps local checking available when AI status is %s', async scenario => {
  const getAiStatus = vi.fn()
  if (scenario === 'error') getAiStatus.mockRejectedValue(new Error('Bridge unavailable'))
  else getAiStatus.mockResolvedValue({ available: scenario !== 'unavailable', configured: scenario !== 'unconfigured' })
  const { evaluateCriteria } = mockAi(vi.fn(), getAiStatus)
  const key = await prepareSecondCheck()
  await ctx.open('/learn/' + key)
  expect(getAiStatus).toHaveBeenCalledTimes(1)
  expect(evaluateCriteria).not.toHaveBeenCalled()
  expect(wrapper.text()).not.toContain('In eigenen Worten mit KI beantworten')
  expect(wrapper.find('textarea').exists()).toBe(false)
  expect(wrapper.get('input[aria-label="basis"]').attributes('disabled')).toBeUndefined()
})

it('keeps a saved written draft when AI setup is pending or unavailable', async () => {
  let resolveStatus!: (status: typeof configured) => void
  mockAi(vi.fn(), vi.fn(() => new Promise(resolve => { resolveStatus = resolve })))
  const key = await prepareSecondCheck()
  const prose = 'Gespeicherte schriftliche Antwort'
  await ctx.library.updatePath(key, ({ progress }) => ({ ...progress, mode: 'written', prose }))
  await ctx.open('/learn/' + key)
  expect(wrapper.find('textarea').exists()).toBe(false)
  expect(wrapper.text()).toContain('KI-Einrichtung wird geprüft')
  resolveStatus({ ...configured, configured: false })
  await flushPromises()
  expect(wrapper.find('textarea').exists()).toBe(false)
  expect(wrapper.text()).toContain('Die KI-Prüfung ist nicht verfügbar')
  await click('Zur lokalen Aufgabe')
  await vi.waitFor(() => expect(saved()).toMatchObject({ mode: 'local', prose }))
  expect(wrapper.get('.path-local-response details').text()).toContain(prose)
})

it('finishes a delayed import without interrupting the chosen path', async () => {
  const selected = await ctx.library.installPath({ ...example, id: 'chosen-path' })
  const content = { ...example, id: 'imported-path' }
  await ctx.open('/learn')
  let finishSave!: () => void
  const originalSave = BrowserStorage.prototype.save
  const save = vi.spyOn(BrowserStorage.prototype, 'save').mockImplementationOnce(async function (this: BrowserStorage, data) {
    await new Promise<void>(resolve => { finishSave = resolve })
    await originalSave.call(this, data)
  })
  const input = wrapper.get('input[type=file]')
  Object.defineProperty(input.element, 'files', { value: [new File([JSON.stringify(content)], 'path.json')] })
  await input.trigger('change')
  await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1))
  let finishNavigation!: () => void
  ctx.router.beforeEach(to => {
    if (to.params.key === selected) return new Promise<void>(resolve => { finishNavigation = resolve })
  })
  await click('Lernpfad fortsetzen')
  await vi.waitFor(() => expect(finishNavigation).toBeTypeOf('function'))
  finishSave()
  await vi.waitFor(() => expect(ctx.library.data.learningPaths?.map(row => pathKey(row.content))).toContain(pathKey(content)))
  expect(ctx.router.currentRoute.value.name).toBe('learning-paths')
  finishNavigation()
  await vi.waitFor(() => expect(ctx.router.currentRoute.value.params.key).toBe(selected))
  await ctx.router.push('/learn')
  expect(wrapper.findAll('.path-panel')).toHaveLength(2)
})
it('shows missing source material and walks from catalogue through assistance to an unlocked chapter',async () => {
  await ctx.open('/learn')
  const input = wrapper.get('input[type=file]')
  Object.defineProperty(input.element,'files',{configurable:true,value:[new File([JSON.stringify({format:'smartL3arn.needsSource',schemaVersion:1,missing:['Definition des Grundwerts']})],'fehlend.json')]})
  await input.trigger('change')
  await vi.waitFor(()=>expect(wrapper.text()).toContain('Definition des Grundwerts'))
  expect(ctx.library.data.learningPaths).toBeUndefined()
  expect(wrapper.text()).toContain('Noch keine Lernpfade')
  Object.defineProperty(input.element, 'files', { configurable: true, value: [new File([JSON.stringify(example)], 'path.json')] })
  await input.trigger('change')
  await click('Übung beginnen')
  await vi.waitFor(()=>expect(wrapper.find('.task-number-input input').exists()).toBe(true))
  await wrapper.get('.task-number-input input').setValue('6')
  await click('Antwort prüfen')
  await click('Selbstständig anwenden')
  await click('Hinweis anzeigen')
  await vi.waitFor(()=>expect(wrapper.text()).toContain('Dieser Versuch zählt als Übung'))
  await wrapper.get('.task-number-input input').setValue('15')
  await click('Antwort prüfen')
  await click('Andere Prüfaufgabe versuchen')
  await vi.waitFor(()=>expect(wrapper.text()).toContain('180 km'))
  await wrapper.get('.task-number-input input').setValue('27')
  await click('Antwort prüfen')
  await vi.waitFor(()=>expect(saved().passed).toEqual(['anteil']))
  expect(document.activeElement?.tagName).toBe('H2')
  expect(wrapper.get('.path-pass').text()).toContain('Lernziel erreicht')
  await click('Weiter zum nächsten Lernziel')
  await click('Antwort und Erklärung anzeigen')
  expect(wrapper.get('.path-study').text()).toContain('80 € auf 60 €')
})
it('returns to the equivalent local task and keeps the written draft when a provider fails', async () => {
  const evaluateCriteria = vi.fn(async () => ({ok:false,reason:'timeout'}))
  await openWritten(evaluateCriteria)
  await click('Antwort prüfen')
  await vi.waitFor(()=>expect(wrapper.text()).toContain('Die KI-Prüfung ist nicht verfügbar'))
  expect(evaluateCriteria).toHaveBeenCalledTimes(1)
  expect(saved()).toMatchObject({mode:'local',passed:['anteil'],prose:'Der Grundwert ist 80 und der Anstieg ist ein Viertel.'})
})

it.each([
  ['code', 'help'], ['code', 'retry'], ['formula', 'help'], ['formula', 'retry'],
] as const)('shows the %s reference after %s', async (input, via) => {
  const reference = input === 'code' ? 'def percent(n):\n    return (n - 80) / 80' : '\\frac{100-80}{80}'
  const localSolution = example.chapters[1]!.objectives[0]!.checks[0]!.solution
  const evaluate = vi.fn().mockResolvedValue({ ok: true, result: {
    criteria: ['bezug', 'rechnung'].map(id => ({ id, status: 'missing', reason: localSolution })),
  } })
  mockAi(evaluate)
  const key = await prepareSecondCheck(input, { reference })
  await ctx.library.updatePath(key, ({ progress }) => ({ ...progress, mode: 'written', prose: 'attempt' }))
  await ctx.open('/learn/' + key)
  await click(via === 'help' ? 'Lösung ansehen' : input === 'code' ? 'KI-Codeprüfung starten' : 'Antwort prüfen')
  await vi.waitFor(() => expect(saved().outcome).toBe('retry'))
  if (via === 'retry') await wrapper.get('details.path-example summary').trigger('click')
  const selector = input === 'code' ? 'pre' : '.math-display annotation'
  expect(wrapper.get('.path-study .path-example ' + selector).element.textContent).toBe(reference)
  expect(saved().passed).toEqual(['anteil'])
})

it('shows the local solution after switching away from a code task', async () => {
  mockAi()
  const key = await prepareSecondCheck('code', { reference: 'return value' })
  await ctx.library.updatePath(key, ({ progress }) => ({ ...progress, mode: 'written' }))
  await ctx.open('/learn/' + key)
  await click('Zur lokalen Aufgabe')
  await vi.waitFor(() => expect(saved().mode).toBe('local'))
  await click('Lösung ansehen')
  await vi.waitFor(() => expect(wrapper.get('.path-study .path-example').text()).toBe(example.chapters[1]!.objectives[0]!.checks[0]!.solution))
})

it('rejects an oversized code paste before truncation and allows replacements up to the limit', async () => {
  mockAi()
  const key = await prepareSecondCheck('code')
  const draft = 'x'.repeat(3996) + 'abc'
  await ctx.library.updatePath(key, ({ progress }) => ({ ...progress, mode: 'written', prose: draft }))
  await ctx.open('/learn/' + key)
  const editor = wrapper.get('textarea')
  editor.element.setSelectionRange(3996, 3998)
  const paste = (source: string) => {
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: { getData: () => source } })
    editor.element.dispatchEvent(event)
    return event.defaultPrevented
  }
  expect(paste('X\r\nYZ')).toBe(true)
  await flushPromises()
  expect(wrapper.get('.form-error[role="alert"]').text()).toContain('4.000')
  expect(editor.element.value).toBe(draft)
  expect([editor.element.selectionStart, editor.element.selectionEnd]).toEqual([3996, 3998])
  expect(saved().prose).toBe(draft)
  expect(paste('X')).toBe(false)
  expect(paste('X\r\nZ')).toBe(false)
  await flushPromises()
  expect(wrapper.find('.form-error').exists()).toBe(false)
})

it('recovers code with its indentation and submits the exact source for grading', async () => {
  const evaluateCriteria = vi.fn().mockResolvedValue({ ok: true, result: {
    criteria: ['bezug', 'rechnung'].map(id => ({ id, status: 'satisfied', reason: 'Nachgewiesen.' })),
  } })
  mockAi(evaluateCriteria)
  vi.useFakeTimers()
  const question = 'Implement a match for the regex \\(cat\\).\n    Return <match> on success.'
  const key = await prepareSecondCheck('code', { question })
  await ctx.open('/learn/' + key)
  await click('Code schreiben und mit KI prüfen')
  const code = '    basis = 80\n    return (100 - basis) / basis\n'
  await vi.waitFor(() => expect(wrapper.get('textarea').attributes('spellcheck')).toBe('false'))
  expect(wrapper.get('label[for="written-answer"]').element.textContent).toBe(question)
  await wrapper.get('textarea').setValue(code)
  expect((await new BrowserStorage().load()).learningPaths?.[0]?.progress.prose).toBe('')
  const closePrevious = await reopenPath()
  try {
    expect(wrapper.get('textarea').element.value).toBe(code)
    await click('KI-Codeprüfung starten')
    await vi.waitFor(() => expect(saved().passed).toEqual(['anteil', 'wechsel']))
    expect(evaluateCriteria).toHaveBeenCalledWith(expect.objectContaining({ question, userAnswer: code }))
  } finally { await closePrevious() }
})

it('recovers a formula across input modes and keeps it after an unclear evaluation', async () => {
  const keyboard = Object.assign(new EventTarget(), { visible: false, show: vi.fn(), hide: vi.fn() })
  vi.stubGlobal('mathVirtualKeyboard', keyboard)
  const evaluateCriteria = vi.fn().mockResolvedValue({ ok: true, result: {
    criteria: ['bezug', 'rechnung'].map(id => ({ id, status: 'unclear', reason: 'Nicht eindeutig.' })),
  } })
  mockAi(evaluateCriteria)
  vi.useFakeTimers()
  const question = 'Gib den relativen Zuwachs an. Nimm einen positiven Anfangswert an.'
  const key = await prepareSecondCheck('formula', { question })
  await ctx.open('/learn/' + key)
  await click('Formel eingeben und mit KI prüfen')
  await click('Symboltastatur anzeigen')
  expect(keyboard.show).toHaveBeenCalledOnce()
  const formula = '\\frac{100-80}{80}'
  const field = wrapper.get<HTMLElement & { value: string }>('test-path-math-field')
  const description = (id?: string) => document.getElementById(id ?? '')?.textContent
  expect(description(field.attributes('aria-describedby'))).toBe(question)
  field.element.value = formula
  await field.trigger('input')
  const closePrevious = await reopenPath()
  try {
    await click('LaTeX')
    expect(wrapper.get('textarea').element.value).toBe(formula)
    expect(description(wrapper.get('textarea').attributes('aria-describedby'))).toBe(question)
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter', ctrlKey: true })
    await vi.waitFor(() => expect(saved()).toMatchObject({ mode: 'local', passed: ['anteil'], prose: formula }))
    expect(evaluateCriteria).toHaveBeenCalledWith(expect.objectContaining({ userAnswer: formula }))
    expect(wrapper.text()).toContain('Die KI konnte die Antwort nicht eindeutig einordnen')
    expect(wrapper.get('.path-local-response details .math-display annotation').element.textContent).toBe(formula)
    await click('Formel eingeben und mit KI prüfen')
    await click('LaTeX')
    expect(wrapper.get('textarea').element.value).toBe(formula)
  } finally { await closePrevious() }
})
it('ignores a delayed provider reply after the learner switches back to local checking', async () => {
  let resolve!: (v: unknown)=>void
  const evaluateCriteria = vi.fn(()=>new Promise(r=>{resolve=r}))
  await openWritten(evaluateCriteria)
  await click('Antwort prüfen')
  await vi.waitFor(()=>expect(evaluateCriteria).toHaveBeenCalledTimes(1))
  await click('Zur lokalen Aufgabe')
  await vi.waitFor(()=>expect(saved().mode).toBe('local'))
  resolve({ok:true,result:{criteria:['bezug','rechnung'].map(id=>({id,status:'satisfied',reason:'Ja.'}))}})
  await flushPromises()
  expect(saved().passed).toEqual(['anteil'])
})

it('waits for an in-flight write and a newer draft before leaving', async () => {
  vi.useFakeTimers()
  await openWritten()
  const originalSave = BrowserStorage.prototype.save
  let finishFirst!: () => void
  let finishSecond!: () => void
  const first = new Promise<void>(resolve => { finishFirst = resolve })
  const second = new Promise<void>(resolve => { finishSecond = resolve })
  const save = vi.spyOn(BrowserStorage.prototype, 'save')
    .mockImplementationOnce(async function (this: BrowserStorage, data) {
      await first
      await originalSave.call(this, data)
    })
    .mockImplementationOnce(async function (this: BrowserStorage, data) {
      await second
      await originalSave.call(this, data)
    })

  vi.advanceTimersByTime(300)
  expect(save).toHaveBeenCalledTimes(1)
  const leaving = ctx.router.push('/learn')
  await flushPromises()
  expect(ctx.router.currentRoute.value.name).toBe('learning-path')

  await wrapper.get('textarea').setValue('Neueste Antwort')
  finishFirst()
  await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2))
  expect(ctx.router.currentRoute.value.name).toBe('learning-path')
  finishSecond()
  await leaving
  expect(ctx.router.currentRoute.value.name).toBe('learning-paths')
  expect((await new BrowserStorage().load()).learningPaths?.[0]?.progress.prose).toBe('Neueste Antwort')
})

it('recovers an uncommitted written answer when the path is reopened', async () => {
  vi.useFakeTimers()
  await openWritten()
  const newest = 'Entwurf direkt vor dem Neuladen'
  await wrapper.get('textarea').setValue(newest)
  expect((await new BrowserStorage().load()).learningPaths?.[0]?.progress.prose).toBe('')

  const closePrevious = await reopenPath()
  try {
    expect(wrapper.get('textarea').element.value).toBe(newest)
    await ctx.router.push('/learn')
    expect((await new BrowserStorage().load()).learningPaths?.[0]?.progress.prose).toBe(newest)
  } finally { await closePrevious() }
})

it('requires learner ordering input and recovers a partial sequence', async () => {
  vi.useFakeTimers()
  const content = structuredClone(example)
  const goal = content.chapters[0]!.objectives[0]!
  Object.assign(goal.checks[0]!, { task: { kind: 'ordering',
    items: [{ id: 'a', text: 'Erster Eintrag' }, { id: 'b', text: 'Zweiter Eintrag' }], correctOrder: ['a', 'b'] } })
  const key = await ctx.library.installPath(content)
  await ctx.library.updatePath(key, advance)
  await ctx.library.updatePath(key, row => gradeLocal(row, { kind: 'text', value: '6' }))
  const random = vi.spyOn(Math, 'random').mockReturnValue(0.99)
  await ctx.library.updatePath(key, advance)
  await ctx.open('/learn/' + key)
  random.mockRestore()

  const pool = () => wrapper.findAll('.task-order-pool button')
  const order = () => wrapper.findAll('.task-ordering li > .math-content').map(item => item.text())
  expect(pool().map(button => button.text())).toEqual(['Erster Eintrag', 'Zweiter Eintrag'])
  expect(order()).toEqual([])
  await click('Antwort prüfen')
  expect(wrapper.text()).toContain('Vervollständige zuerst deine Antwort.')
  await pool()[1]!.trigger('click')
  await click('Antwort prüfen')
  expect(saved().passed).toEqual([])
  expect((await new BrowserStorage().load()).learningPaths?.[0]?.progress.draft).toEqual({ kind: 'order', ids: [] })

  const closePrevious = await reopenPath()
  try {
    expect(order()).toEqual(['Zweiter Eintrag'])
    const first = pool().find(button => button.text() === 'Erster Eintrag')!
    await first.trigger('click')
    await first.trigger('click')
    expect(order()).toEqual(['Zweiter Eintrag'])
    await first.trigger('click')
    await wrapper.get('button[aria-label="Nach oben 2"]').trigger('click')
    expect(order()).toEqual(['Erster Eintrag', 'Zweiter Eintrag'])
    await click('Antwort prüfen')
    await vi.waitFor(() => expect(saved().passed).toEqual(['anteil']))
  } finally { await closePrevious() }
})

it('warns on unload only while an edit lacks both a backup and a committed save', async () => {
  vi.useFakeTimers()
  await openWritten()
  const beforeUnload = () => window.dispatchEvent(new Event('beforeunload', { cancelable: true }))
  expect(beforeUnload()).toBe(true)
  const setItem = Storage.prototype.setItem
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (key.startsWith('smartL3arn:path-draft:')) throw new DOMException('Storage full', 'QuotaExceededError')
    setItem.call(this, key, value)
  })
  await wrapper.get('textarea').setValue('Kein Platz für die Sicherung')
  expect(beforeUnload()).toBe(false)
  vi.advanceTimersByTime(300)
  await vi.waitFor(() => expect(saved().prose).toBe('Kein Platz für die Sicherung'))
  expect(beforeUnload()).toBe(true)
})

it.each(['leave', 'switch'] as const)('blocks a %s when the active write fails and retries the latest draft', async navigation => {
  vi.useFakeTimers()
  await openWritten()
  const source = ctx.router.currentRoute.value.fullPath
  const destination = navigation === 'leave' ? '/learn'
    : '/learn/' + await ctx.library.installPath({ ...example, id: 'zweiter-pfad' })
  let fail!: (error: Error) => void
  const save = vi.spyOn(BrowserStorage.prototype, 'save')
    .mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { fail = reject }))

  vi.advanceTimersByTime(300)
  expect(save).toHaveBeenCalledTimes(1)
  await wrapper.get('textarea').setValue('Neueste Antwort')
  const leaving = ctx.router.push(destination)
  await flushPromises()
  fail(new Error('Disk full'))
  await leaving
  expect(ctx.router.currentRoute.value.fullPath).toBe(source)
  expect(wrapper.get('.path-notice[role="status"]').text()).toBe('Disk full')
  expect(wrapper.get('textarea').element.value).toBe('Neueste Antwort')

  await ctx.router.push(destination)
  expect(ctx.router.currentRoute.value.fullPath).toBe(destination)
  expect((await new BrowserStorage().load()).learningPaths?.[0]?.progress.prose).toBe('Neueste Antwort')
})

it('restores an in-path review, grades offline, and returns to the saved lesson', async () => {
  const key = await ctx.library.installPath(example)
  await ctx.library.updatePath(key, row => ({...row.progress, passed:['anteil']}))
  await ctx.library.updatePath(key, advance)
  await ctx.open('/learn/' + key)
  await click('Ein fälliges Lernziel wiederholen')
  await vi.waitFor(() => expect(wrapper.find('.path-outline').exists()).toBe(false))
  await wrapper.get('.path-study input').setValue('8')
  await flushPromises()
  const closeOldView = await reopenPath()
  expect((wrapper.get('.path-study input').element as HTMLInputElement).value).toBe('8')
  await closeOldView()
  await click('Antwort prüfen')
  await vi.waitFor(() => expect(saved().reviews?.[0]?.lastResult).toBe('independent'))
  await click('Wiederholung abschließen')
  await vi.waitFor(() => expect(saved().reviewSession).toBeUndefined())
  expect(saved().phase).toBe('practice')
  expect(saved().passed).toEqual(['anteil'])
  expect(wrapper.get('.path-topic-index').text()).toContain('Selbstständig richtig beantwortet')
})

async function openClozeDraft(mode: 'review' | 'practice') {
  const key = await ctx.library.installPath(example)
  await ctx.library.updatePath(key, row => ({ ...row.progress, passed: ['wechsel'] }))
  await ctx.open('/learn/' + key)
  const activityId = example.chapters[1]!.objectives[0]!.practice.id
  if (mode === 'review') {
    await click('Ein fälliges Lernziel wiederholen')
  } else {
    await chooseTopic('wechsel')
    const options = wrapper.get<HTMLDetailsElement>('.path-practice-options')
    options.element.open = true
    await options.get('button').trigger('click')
  }
  const panel = mode === 'review' ? '.path-review' : '.path-repeat'
  await vi.waitFor(() => expect(wrapper.find(panel).exists()).toBe(true))
  const backup = () => {
    const row = ctx.library.data.learningPaths![0]!
    return mode === 'review' ? readDraftBackup(reviewBackupKey(key), row, true)
      : readDraftBackup(practiceBackupKey(key, activityId), row, { activityId })
  }
  const draft = () => mode === 'review' ? saved().reviewSession?.draft
    : saved().practiceDrafts?.find(entry => entry.activityId === activityId)?.draft
  return {
    basis: wrapper.get<HTMLInputElement>(panel + ' input[aria-label="basis"]'),
    percent: wrapper.get<HTMLInputElement>(panel + ' input[aria-label="prozent"]'),
    backup, draft,
  }
}

it.each(['review', 'practice'] as const)('backs up each %s edit, coalesces writes, and flushes before grading', async mode => {
  const { basis, percent, backup, draft } = await openClozeDraft(mode)
  vi.useFakeTimers()
  const save = vi.spyOn(BrowserStorage.prototype, 'save')
  const base = mode === 'review' ? '200' : '50'
  const ratio = mode === 'review' ? '25' : '20'

  const firstDigit = base.slice(0, 1)
  await basis.setValue(firstDigit)
  expect(backup()?.patch.draft).toMatchObject({ values: { basis: firstDigit } })
  await vi.advanceTimersByTimeAsync(200)
  await basis.setValue(base)
  expect(backup()?.patch.draft).toMatchObject({ values: { basis: base } })
  await vi.advanceTimersByTimeAsync(299)
  expect(save).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  await vi.waitFor(() => expect(draft()).toMatchObject({ values: { basis: base } }))
  expect(save).toHaveBeenCalledTimes(1)
  expect(backup()).toBeUndefined()

  await percent.setValue(ratio)
  expect(save).toHaveBeenCalledTimes(1)
  await click('Antwort prüfen')
  await vi.waitFor(() => expect(wrapper.get('.path-feedback').text()).toContain('Richtig'))
  expect(draft()).toEqual({ kind: 'fields', values: { basis: base, prozent: ratio } })
  expect(save).toHaveBeenCalledTimes(3)
})

it.each(['review', 'practice'] as const)('blocks leaving %s after a failed write and retries the newest edit', async mode => {
  const { basis, backup, draft } = await openClozeDraft(mode)
  vi.useFakeTimers()
  const source = ctx.router.currentRoute.value.fullPath
  let fail!: (error: Error) => void
  const save = vi.spyOn(BrowserStorage.prototype, 'save')
    .mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { fail = reject }))
  await basis.setValue('5')
  await vi.advanceTimersByTimeAsync(300)
  expect(save).toHaveBeenCalledTimes(1)
  await basis.setValue('50')
  expect(backup()?.patch.draft).toMatchObject({ values: { basis: '50' } })
  const leaving = ctx.router.push('/learn')
  await flushPromises()
  fail(new Error('Disk full'))
  await leaving
  expect(ctx.router.currentRoute.value.fullPath).toBe(source)
  await vi.waitFor(() => expect(wrapper.text()).toContain('Disk full'))
  expect(basis.element.value).toBe('50')

  await ctx.router.push('/learn')
  expect(ctx.router.currentRoute.value.fullPath).toBe('/learn')
  expect(draft()).toMatchObject({ values: { basis: '50' } })
  expect(save).toHaveBeenCalledTimes(2)
  expect(backup()).toBeUndefined()
})

it('keeps a paused review assisted after the learner consults its lesson', async () => {
  const key = await ctx.library.installPath(example)
  const passed = example.chapters.flatMap(c => c.objectives.map(g => g.id))
  await ctx.library.updatePath(key, row => ({ ...row.progress, passed }))
  await ctx.open('/learn/' + key)
  await click('2 fällige Lernziele wiederholen')
  await click('Wiederholung pausieren')
  await chooseTopic('anteil')
  await vi.waitFor(() => expect(saved().reviewSession?.assisted).toBe(true))
  await click('Wiederholung fortsetzen')
  await wrapper.get('.path-study input').setValue('8')
  await click('Antwort prüfen')
  await vi.waitFor(() => expect(saved().reviews?.[0]?.lastResult).toBe('assisted'))
  await click('Anderen Fall üben')
  await vi.waitFor(() => expect(saved().reviewSession?.retry).toBe(true))
  await click('Lösung ansehen')
  await click('Nächstes Lernziel')
  await vi.waitFor(() => expect(saved().reviewSession?.queue).toEqual(['wechsel']))
  expect(saved().passed).toEqual(passed)
})

it('prioritizes a due legacy path and opens its review directly from the catalogue', async () => {
  const legacy = normalizePath({ ...example, id: 'legacy', title: 'Älterer Lernpfad' })
  for (const chapter of legacy.chapters) {
    for (const goal of chapter.objectives) {
      delete goal.reviewChecks
      delete goal.opening
    }
  }
  await ctx.library.installPath(example)
  const key = await ctx.library.installPath(legacy)
  await ctx.library.updatePath(key, row => ({ ...row.progress, passed: ['anteil'] }))
  await ctx.library.updatePath(key, advance)
  const lessonDraft = { kind: 'fields', values: { basis: '50' } } as const
  await ctx.library.updatePath(key, row => ({ ...row.progress, draft: lessonDraft }))
  await ctx.open('/learn')
  expect(wrapper.findAll('.path-panel h2')[0]?.text()).toBe(legacy.title)
  await click('Ein fälliges Lernziel wiederholen')
  await vi.waitFor(() => expect(wrapper.find('.path-review').exists()).toBe(true))
  expect(ctx.router.currentRoute.value.query.review).toBe('1')
  expect(wrapper.get('.path-review').text()).not.toContain(legacy.chapters[0]!.objectives[0]!.goal)
  expect(document.activeElement).toBe(wrapper.get('.path-review h2').element)

  await wrapper.get('.path-review input').setValue('15')
  await click('Wiederholung pausieren')
  await vi.waitFor(() => expect(ctx.router.currentRoute.value.query.review).toBeUndefined())
  expect((wrapper.get('input[aria-label="basis"]').element as HTMLInputElement).value).toBe('50')
  await ctx.router.push('/learn')

  await wrapper.findAll('.path-panel')[0]!.get('.btn-quiet:not(.path-remove)').trigger('click')
  await vi.waitFor(() => expect(ctx.router.currentRoute.value.params.key).toBe(key))
  expect(ctx.router.currentRoute.value.query.review).toBeUndefined()
  expect(wrapper.find('.path-review').exists()).toBe(false)
  await click('Wiederholung fortsetzen')
  await vi.waitFor(() => expect((wrapper.get('.path-review input').element as HTMLInputElement).value).toBe('15'))
  await click('Antwort prüfen')
  await click('Wiederholung abschließen')
  await vi.waitFor(() => expect(ctx.router.currentRoute.value.query.review).toBeUndefined())
  expect((wrapper.get('input[aria-label="basis"]').element as HTMLInputElement).value).toBe('50')
})

it('passes a future topic and returns to an earlier draft without losing its place', async () => {
  const key = await ctx.library.installPath(example)
  await ctx.library.updatePath(key, advance)
  await ctx.open('/learn/' + key)
  await wrapper.get('.task-number-input input').setValue('6')
  await chooseTopic('wechsel')
  expect(saved().pausedObjectives?.[0]?.step.draft).toEqual({ kind: 'text', value: '6' })
  await click('Übung beginnen')
  await vi.waitFor(() => expect(saved().phase).toBe('practice'))
  await wrapper.get('input[aria-label="basis"]').setValue('50')
  await wrapper.get('input[aria-label="prozent"]').setValue('20')
  await click('Antwort prüfen')
  await click('Selbstständig anwenden')
  await vi.waitFor(() => expect(saved().phase).toBe('check'))
  await wrapper.get('input[aria-label="basis"]').setValue('80')
  await wrapper.get('input[aria-label="prozent"]').setValue('25')
  await click('Antwort prüfen')
  await vi.waitFor(() => expect(saved().passed).toEqual(['wechsel']))
  expect(saved().reviews?.map(record => record.objectiveId)).toEqual(['wechsel'])
  await click('Weiter zum nächsten Lernziel')
  expect(saved().activeObjectiveId).toBe('anteil')
  await vi.waitFor(() => expect(wrapper.find('.task-number-input input').exists()).toBe(true))
  expect((wrapper.get('.task-number-input input').element as HTMLInputElement).value).toBe('6')
  const closeOld = await reopenPath()
  try {
    expect(saved().passed).toEqual(['wechsel'])
    expect((wrapper.get('.task-number-input input').element as HTMLInputElement).value).toBe('6')
  } finally { await closeOld() }
})

it('opens the explanation only after saving help and returns focus to the written draft', async () => {
  await openWritten()
  const draft = wrapper.get('textarea')
  draft.element.focus()
  vi.spyOn(BrowserStorage.prototype, 'save').mockRejectedValueOnce(new Error('Disk full'))
  await click('Erklärung nachlesen')
  await vi.waitFor(() => expect(wrapper.text()).toContain('Disk full'))
  expect(wrapper.find('.path-explanation').exists()).toBe(false)
  expect(saved().help).toBe('none')
  await click('Erklärung nachlesen')
  await click('Zur Aufgabe zurück')
  expect(document.activeElement).toBe(draft.element)
  expect(draft.element.value).toContain('80')
  expect(saved()).toMatchObject({ help: 'lesson', mode: 'written' })
  const closeOld = await reopenPath()
  try {
    expect(saved().help).toBe('lesson')
    expect(wrapper.get('textarea').element.value).toContain('80')
  } finally { await closeOld() }
})

it.each([true, false])('restores focus to the visible LaTeX editor (previously focused: %s)', async previouslyFocused => {
  vi.stubGlobal('mathVirtualKeyboard', Object.assign(new EventTarget(), { visible: false, hide: vi.fn() }))
  mockAi()
  const key = await prepareSecondCheck('formula')
  await ctx.open('/learn/' + key)
  await click('Formel eingeben und mit KI prüfen')
  await vi.waitFor(() => expect(wrapper.find('test-path-math-field').exists()).toBe(true))
  // The mock uses a different tag. Include the production tag in the hidden visual editor.
  const visual = document.createElement('math-field')
  visual.tabIndex = 0
  wrapper.get('.mathfield-container').element.append(visual)
  const focusVisual = vi.spyOn(visual, 'focus')
  await click('LaTeX')
  const draft = wrapper.get<HTMLTextAreaElement>('.latex-input')
  if (previouslyFocused) draft.element.focus()
  await draft.setValue('\\frac{1}{4}')
  await click('Erklärung nachlesen')
  await vi.waitFor(() => expect(document.activeElement).toBe(wrapper.get('.path-explanation h3').element))
  await click('Zur Aufgabe zurück')
  expect(document.activeElement).toBe(draft.element)
  expect(draft.element.value).toBe('\\frac{1}{4}')
  expect(focusVisual).not.toHaveBeenCalled()
})

it('ignores an AI result from an objective the learner leaves', async () => {
  let resolve!: (value: unknown) => void
  const evaluate = vi.fn(() => new Promise(done => { resolve = done }))
  mockAi(evaluate)
  const content = normalizePath(example)
  content.chapters[0]!.objectives[0]!.checks[0]!.written = content.chapters[1]!.objectives[0]!.checks[0]!.written
  const key = await ctx.library.installPath(content)
  await ctx.library.updatePath(key, advance)
  await ctx.library.updatePath(key, row => gradeLocal(row, { kind: 'text', value: '6' }))
  await ctx.library.updatePath(key, advance)
  await ctx.library.updatePath(key, ({ progress }) => ({ ...progress, mode: 'written', prose: 'Meine Antwort' }))
  await ctx.open('/learn/' + key)
  await click('Antwort prüfen')
  await vi.waitFor(() => expect(evaluate).toHaveBeenCalledOnce())
  await chooseTopic('wechsel')
  resolve({ ok: true, result: { criteria: ['bezug','rechnung'].map(id => ({ id, status: 'satisfied', reason: 'Ja.' })) } })
  await flushPromises()
  expect(saved().passed).toEqual([])
  expect(saved().activeObjectiveId).toBe('wechsel')
  await chooseTopic('anteil')
  expect(wrapper.get('textarea').element.value).toBe('Meine Antwort')
})

it('keeps voluntary practice drafts separate from each other and from the saved lesson', async () => {
  const key = await prepareSecondCheck()
  const original = saved()
  await ctx.open('/learn/' + key)
  const openPractice = async (index: number) => {
    await chooseTopic('anteil')
    const options = wrapper.get<HTMLDetailsElement>('.path-practice-options')
    options.element.open = true
    expect(options.findAll('li')).toHaveLength(3)
    await options.findAll('button')[index]!.trigger('click')
    await vi.waitFor(() => expect(wrapper.find('.path-repeat').exists()).toBe(true))
    return wrapper.get<HTMLInputElement>('.path-repeat input')
  }
  await (await openPractice(0)).setValue('6')
  await click('Zurück zum Lernpfad')
  await vi.waitFor(() => expect(wrapper.find('.path-repeat').exists()).toBe(false))
  await (await openPractice(1)).setValue('15')
  await click('Antwort prüfen')
  await vi.waitFor(() => expect(wrapper.get('.path-repeat .path-feedback').text()).toContain('Richtig'))
  const closeOld = await reopenPath()
  try {
    expect((await openPractice(0)).element.value).toBe('6')
    await click('Zurück zum Lernpfad')
    await vi.waitFor(() => expect(wrapper.find('.path-repeat').exists()).toBe(false))
    expect((await openPractice(1)).element.value).toBe('15')
    await click('Antwort zurücksetzen')
    await vi.waitFor(() => expect(saved().practiceDrafts?.map(record => record.activityId)).toEqual(['a-uebung']))
    expect(saved().reviews).toEqual(original.reviews)
    expect(saved().passed).toEqual(original.passed)
    expect(saved().draft).toEqual(original.draft)
  } finally { await closeOld() }
})

it('explicitly validates three code probes before submitting code, and invalidates them on a model change', async () => {
  let model = 'test/model'
  const getAiStatus = vi.fn(async () => ({ ...configured, model }))
  const key = await prepareSecondCheck('code', { language: 'Python' })
  const activity = ctx.library.data.learningPaths![0]!.content.chapters[1]!.objectives[0]!.checks[0]!
  const written = activity.written!
  const evaluateCriteria = vi.fn(async (input: { userAnswer: string }) => ({ ok: true, result: {
    criteria: written.criteria.map(c => ({ id: c.id,
      status: input.userAnswer === written.partial || input.userAnswer === written.misconception ? 'missing' : 'satisfied', reason: 'Probe result.' })),
  } }))
  mockAi(evaluateCriteria, getAiStatus)
  await ctx.library.updatePath(key, row => ({ ...row.progress, codeValidations: [] }))
  await ctx.open('/learn/' + key)
  await click('Code schreiben und mit KI prüfen')
  await vi.waitFor(() => expect(saved().mode).toBe('written'))
  await vi.waitFor(() => expect(wrapper.find('textarea').exists()).toBe(true))
  await wrapper.get('textarea').setValue('def f(x):\n  return x')
  expect(evaluateCriteria).not.toHaveBeenCalled()
  expect(wrapper.findAll('button').find(b => b.text() === 'KI-Codeprüfung starten')!.attributes('disabled')).toBeDefined()
  await click('Bewertungsvariante mit KI prüfen')
  await vi.waitFor(() => expect(saved().codeValidations).toHaveLength(1))
  expect(evaluateCriteria).toHaveBeenCalledTimes(3)
  expect(evaluateCriteria).toHaveBeenCalledWith(expect.objectContaining({ answerFormat: 'code', codeLanguage: 'Python' }))
  model = 'other/model'
  await click('KI-Codeprüfung starten')
  expect(evaluateCriteria).toHaveBeenCalledTimes(3)
  expect(saved().passed).toEqual(['anteil'])
  expect(wrapper.text()).toContain('Prüfe zuerst die Bewertungsvariante')
})

it('retains a code draft and allows only practice feedback after invalid probes', async () => {
  const evaluateCriteria = vi.fn().mockResolvedValue({ ok: true, result: {
    criteria: ['bezug', 'rechnung'].map(id => ({ id, status: 'satisfied', reason: 'Everything accepted.' })),
  } })
  mockAi(evaluateCriteria)
  const key = await prepareSecondCheck('code')
  await ctx.library.updatePath(key, row => ({ ...row.progress, codeValidations: [] }))
  await ctx.open('/learn/' + key)
  await click('Code schreiben und mit KI prüfen')
  await vi.waitFor(() => expect(saved().mode).toBe('written'))
  await vi.waitFor(() => expect(wrapper.find('textarea').exists()).toBe(true))
  await wrapper.get('textarea').setValue('return 42')
  await click('Bewertungsvariante mit KI prüfen')
  await vi.waitFor(() => expect(saved().practiceOnly).toContain('w-check1'))
  expect(saved().prose).toBe('return 42')
  await click('KI-Codeprüfung starten')
  await vi.waitFor(() => expect(saved().outcome).toBe('retry'))
  expect(saved().passed).toEqual(['anteil'])
  expect(saved().result).toMatchObject({ assisted: true })
})

it('indents code, preserves new-line indentation and provides a keyboard exit', async () => {
  mockAi()
  const key = await prepareSecondCheck('code')
  await ctx.open('/learn/' + key)
  await click('Code schreiben und mit KI prüfen')
  await vi.waitFor(() => expect(saved().mode).toBe('written'))
  await vi.waitFor(() => expect(wrapper.find('textarea').exists()).toBe(true))
  const editor = wrapper.get<HTMLTextAreaElement>('textarea')
  await editor.setValue('  x')
  editor.element.setSelectionRange(3, 3)
  await editor.trigger('keydown', { key: 'Enter' })
  expect(editor.element.value).toBe('  x\n  ')
  await editor.trigger('keydown', { key: 'Tab' })
  expect(editor.element.value).toBe('  x\n    ')
  await editor.trigger('keydown', { key: 'Escape' })
  const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
  editor.element.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(false)
})

it('keeps the explanation available after a correct practice answer without resetting its result', async () => {
  const key = await ctx.library.installPath(roundsExample)
  await ctx.library.updatePath(key, advance)
  await ctx.open('/learn/' + key)
  await wrapper.get('input[aria-label="basis"]').setValue('80')
  await wrapper.get('input[aria-label="prozent"]').setValue('25')
  await click('Antwort prüfen')
  await vi.waitFor(() => expect(saved().outcome).toBe('next'))
  const result = JSON.parse(JSON.stringify(saved().result))
  await click('Erklärung nachlesen')
  await vi.waitFor(() => expect(wrapper.find('.path-explanation').exists()).toBe(true))
  expect(wrapper.get('.path-explanation').text()).toContain('50 Liter')
  expect(document.activeElement).toBe(wrapper.get('.path-explanation h3').element)
  expect(saved().result).toEqual(result)
  expect(saved()).toMatchObject({ phase: 'practice', variant: 0, outcome: 'next' })
  await click('Zur Aufgabe zurück')
  await click('Nächste Übung')
  await vi.waitFor(() => expect(saved().variant).toBe(1))
})

it('lets the learner consult the lesson after a submitted self-check answer and continue the same round', async () => {
  const key = await ctx.library.installPath(roundsExample)
  await ctx.library.updatePath(key, advance)
  for (const response of [{ kind: 'fields' as const, values: { basis: '80', prozent: '25' } },
    { kind: 'text' as const, value: '25' }, { kind: 'text' as const, value: '20' }]) {
    await ctx.library.updatePath(key, row => gradeLocal(row, response))
    await ctx.library.updatePath(key, advance)
  }
  await ctx.open('/learn/' + key)
  await wrapper.get('input[aria-label="basis"]').setValue('90')
  await wrapper.get('input[aria-label="prozent"]').setValue('20')
  await click('Antwort prüfen')
  await vi.waitFor(() => expect(saved().selfCheck?.answers).toHaveLength(1))
  const round = JSON.parse(JSON.stringify(saved().selfCheck))
  await click('Erklärung nachlesen')
  await vi.waitFor(() => expect(wrapper.find('.path-explanation').exists()).toBe(true))
  expect(saved().selfCheck).toEqual(round)
  await click('Zur Aufgabe zurück')
  await click('Nächste Aufgabe')
  await vi.waitFor(() => expect(saved().variant).toBe(1))
  expect(saved().selfCheck?.answers).toEqual(round!.answers)
})

it('opens the explanation from the first learning step with the current answer preserved', async () => {
  const key = await ctx.library.installPath(example)
  await ctx.library.updatePath(key, advance)
  await ctx.open('/learn/' + key)
  await wrapper.get('.task-number-input input').setValue('7')
  await wrapper.get('.path-step-link').trigger('click')
  await vi.waitFor(() => expect(wrapper.find('.path-explanation').exists()).toBe(true))
  await click('Zur Aufgabe zurück')
  expect(wrapper.get<HTMLInputElement>('.task-number-input input').element.value).toBe('7')
})

it('offers rereading before a delayed review without automatically revealing a hint', async () => {
  const key = await prepareSecondCheck()
  await ctx.open('/learn/' + key + '?review=1')
  // First objective is normally due tomorrow; this audit deliberately makes it due now.
  await ctx.library.updatePath(key, row => ({ ...row.progress, reviews: row.progress.reviews?.map(r => ({ ...r, dueDate: '2000-01-01' })) }))
  await ctx.router.replace('/learn/' + key)
  await ctx.router.replace('/learn/' + key + '?review=1')
  await vi.waitFor(() => expect(wrapper.find('.path-review').exists()).toBe(true))
  await click('Erklärung nachlesen')
  await vi.waitFor(() => expect(wrapper.find('.path-review .path-explanation').exists()).toBe(true))
  expect(wrapper.get('.path-review .path-explanation').text()).toContain('Gelöstes Beispiel')
  expect(saved().reviewSession?.assisted).toBe(true)
  await click('Zur Aufgabe zurück')
  expect(wrapper.find('.path-review .path-opening').exists()).toBe(false)
  await click('Hinweis anzeigen')
  await vi.waitFor(() => expect(saved().reviewSession?.hintRevealed).toBe(true))
  expect(wrapper.get('.path-review .path-opening').text()).toContain('Diese Wiederholung zählt als mit Hilfe bearbeitet.')
})
