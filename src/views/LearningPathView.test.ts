import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import example from '../../docs/learning-path.example.json'
import { freshProgress, normalizePaths, pathKey } from '../../shared/learning-paths.mjs'
import { useLibraryStore } from '../stores/library'
import { advance, gradeLocal } from '../domain/learningPath'
import type { TaskDefinition } from '../domain/types'
import { setLanguage } from '../i18n'
import { BrowserStorage } from '../services/storage/browserStorage'
import LearningPathView from './LearningPathView.vue'
import LearningPathsView from './LearningPathsView.vue'
import * as ai from '../services/ai'

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
afterEach(() => { wrapper?.unmount(); disposePinia(ctx.pinia); vi.useRealTimers(); vi.restoreAllMocks(); setLanguage('system') })
async function click(label: string) {
  await vi.waitFor(() => expect(wrapper.findAll('button').some(b => b.text() === label && !b.element.disabled)).toBe(true))
  await wrapper.findAll('button').find(b=>b.text() === label)!.trigger('click')
  await flushPromises()
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
const configured = { available: true, configured: true, credentialSource: null }
function mockAi(evaluateCriteria = vi.fn(), getAiStatus = vi.fn().mockResolvedValue(configured)) {
  vi.spyOn(ai, 'getAiBridge').mockReturnValue({ evaluateCriteria, getAiStatus } as unknown as ReturnType<typeof ai.getAiBridge>)
  return { evaluateCriteria, getAiStatus }
}
async function prepareSecondCheck() {
  const key = await ctx.library.installPath(example)
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

it('mounts completed lesson math only while each lesson disclosure is open', async () => {
  const passed = example.chapters.flatMap(chapter => chapter.objectives.map(goal => goal.id))
  const progress = { ...freshProgress(), passed }
  const rows = normalizePaths([{ content: example, progress }, { content: { ...example, version: 2 }, progress }])
  await ctx.library.addDecks([], rows)
  await ctx.open('/learn/' + pathKey(rows[0]!.content))

  const outline = () => wrapper.get('details.path-outline')
  const lessons = outline().findAll<HTMLDetailsElement>('details')
  expect(lessons.length).toBeGreaterThanOrEqual(2)
  expect(outline().findAll('.math-content')).toHaveLength(0)

  outline().element.setAttribute('open', '')
  lessons[0]!.element.open = true
  await lessons[0]!.trigger('toggle')
  expect(lessons[0]!.findAll('.math-content')).toHaveLength(2)
  expect(lessons[1]!.findAll('.math-content')).toHaveLength(0)
  lessons[1]!.element.open = true
  await lessons[1]!.trigger('toggle')
  lessons[0]!.element.open = false
  await lessons[0]!.trigger('toggle')
  expect(lessons[0]!.findAll('.math-content')).toHaveLength(0)
  expect(lessons[1]!.findAll('.math-content')).toHaveLength(2)

  await ctx.router.push('/learn/' + pathKey(rows[1]!.content))
  expect(outline().findAll('.math-content')).toHaveLength(0)
  expect(outline().findAll('details[open]')).toHaveLength(0)
})

it('confirms deletion from the path list and reports failed writes before allowing retry', async () => {
  const key = await ctx.library.installPath(example)
  await ctx.library.updatePath(key, advance)
  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValue(true)
  await ctx.open('/learn')

  await click('Löschen')
  expect(confirm).toHaveBeenLastCalledWith(expect.stringContaining(example.title + '“ (Version 1)'))
  expect(saved().phase).toBe('practice')

  vi.spyOn(BrowserStorage.prototype, 'save').mockRejectedValueOnce(new Error('full'))
  await click('Löschen')
  expect(wrapper.get('[role="status"]').text()).toBe('Der Lernpfad konnte nicht gelöscht werden.')
  expect(saved().phase).toBe('practice')

  await click('Löschen')
  await vi.waitFor(() => expect(wrapper.get('[role="status"]').text()).toBe('Lernpfad gelöscht.'))
  expect(wrapper.findAll('button').some(button => button.text() === 'Löschen')).toBe(false)
  expect((await new BrowserStorage().load()).learningPaths).toEqual([])
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

it.each(['example', 'file'] as const)('finishes a delayed %s install without interrupting the chosen path', async kind => {
  const selected = await ctx.library.installPath({ ...example, id: 'chosen-path' })
  const content = kind === 'example' ? example : { ...example, id: 'imported-path' }
  await ctx.open('/learn')
  let finishSave!: () => void
  const originalSave = BrowserStorage.prototype.save
  const save = vi.spyOn(BrowserStorage.prototype, 'save').mockImplementationOnce(async function (this: BrowserStorage, data) {
    await new Promise<void>(resolve => { finishSave = resolve })
    await originalSave.call(this, data)
  })
  if (kind === 'example') await click('Beispiel starten')
  else {
    const input = wrapper.get('input[type=file]')
    Object.defineProperty(input.element, 'files', { value: [new File([JSON.stringify(content)], 'path.json')] })
    await input.trigger('change')
  }
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
  expect(wrapper.findAll('.path-panel')).toHaveLength(kind === 'example' ? 2 : 3)
})
it('shows missing source material and walks from catalogue through assistance to an unlocked chapter',async () => {
  await ctx.open('/learn')
  const input = wrapper.get('input[type=file]')
  Object.defineProperty(input.element,'files',{value:[new File([JSON.stringify({format:'smartL3arn.needsSource',schemaVersion:1,missing:['Definition des Grundwerts']})],'fehlend.json')]})
  await input.trigger('change')
  await vi.waitFor(()=>expect(wrapper.text()).toContain('Definition des Grundwerts'))
  expect(ctx.library.data.learningPaths).toBeUndefined()
  await click('Beispiel starten')
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
  expect(wrapper.get('.path-study').text()).toContain('80 € auf 60 €')
  expect(document.activeElement?.tagName).toBe('H2')
})
it('returns to the equivalent local task and keeps the written draft when a provider fails', async () => {
  const evaluateCriteria = vi.fn(async () => ({ok:false,reason:'timeout'}))
  await openWritten(evaluateCriteria)
  await click('Antwort prüfen')
  await vi.waitFor(()=>expect(wrapper.text()).toContain('Die KI-Prüfung ist nicht verfügbar'))
  expect(evaluateCriteria).toHaveBeenCalledTimes(1)
  expect(saved()).toMatchObject({mode:'local',passed:['anteil'],prose:'Der Grundwert ist 80 und der Anstieg ist ein Viertel.'})
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
  expect(wrapper.get('[role="status"]').text()).toBe('Disk full')
  expect(wrapper.get('textarea').element.value).toBe('Neueste Antwort')

  await ctx.router.push(destination)
  expect(ctx.router.currentRoute.value.fullPath).toBe(destination)
  expect((await new BrowserStorage().load()).learningPaths?.[0]?.progress.prose).toBe('Neueste Antwort')
})
