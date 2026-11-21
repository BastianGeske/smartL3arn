import { beforeEach, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import example from '../../docs/learning-path.example.json'
import { useLibraryStore } from './library'
import { advance, gradeLocal, switchObjective } from '../domain/learningPath'
import { BrowserStorage } from '../services/storage/browserStorage'
import { isCurrentBackup, readDraftBackup, writeDraftBackup } from '../services/storage/pathDraftBackup'
import { backupJson, createCard } from '../domain/importExport'
import { importLibraryFile } from '../services/importer'
import { normalizePath, normalizePaths } from '../../shared/learning-paths.mjs'
beforeEach(() => { localStorage.clear(); delete window.smartL3arn; setActivePinia(createPinia()) })
it('resumes persisted drafts, imports versions alongside each other and keeps shared content separate', async () => {
  let library = useLibraryStore()
  const key = await library.installPath(example)
  await library.updatePath(key,advance)
  await library.updatePath(key,row => ({...row.progress, draft:{kind:'text',value:'6'}}))
  setActivePinia(createPinia()); library = useLibraryStore(); await library.hydrate()
  await library.installPath(example)
  expect(library.data.learningPaths).toHaveLength(1)
  expect(library.data.learningPaths?.[0]?.progress.draft).toEqual({kind:'text',value:'6'})
  await expect(library.installPath({...example,title:'Changed title'})).rejects.toThrow()
  await library.installPath({...example,version:example.version+1})
  expect(library.data.learningPaths?.map(p => p.progress.phase)).toEqual(['practice','lesson'])
  const restored = await importLibraryFile(new File([backupJson(library.data)],'backup.json'))
  const rows = restored.learningPaths!
  expect(rows).toEqual(library.data.learningPaths)
  expect(JSON.stringify(rows[0]!.content)).not.toContain('"draft"')
  expect(()=>normalizePaths([{...rows[0],progress:{...rows[0]!.progress,passed:['missing']}}])).toThrow()
  setActivePinia(createPinia()); globalThis.indexedDB = new (await import('fake-indexeddb')).IDBFactory()
  library = useLibraryStore()
  await library.addDecks(restored.decks,rows)
  await library.hydrate()
  expect(library.data.learningPaths).toEqual(rows)
})

it('keeps code and formula input settings and answers through backup restore', async () => {
  const library = useLibraryStore()
  const answers = { code: '    return value\n', formula: '\\frac{100-80}{80}' }
  for (const [index, input] of (['code', 'formula'] as const).entries()) {
    const path = normalizePath({ ...example, version: index + 2 })
    const goal = path.chapters[0]!.objectives[0]!
    goal.checks[0]!.written = { ...path.chapters[1]!.objectives[0]!.checks[0]!.written!, input }
    const key = await library.installPath(path)
    await library.updatePath(key, advance)
    await library.updatePath(key, row => gradeLocal(row, { kind: 'text', value: '6' }))
    await library.updatePath(key, advance)
    await library.updatePath(key, row => ({ ...row.progress, mode: 'written', prose: answers[input] }))
  }
  const restored = await importLibraryFile(new File([backupJson(library.data)], 'backup.json'))
  setActivePinia(createPinia())
  globalThis.indexedDB = new (await import('fake-indexeddb')).IDBFactory()
  await useLibraryStore().addDecks(restored.decks, restored.learningPaths!)
  const { learningPaths } = await new BrowserStorage().load()
  expect(learningPaths?.map(row => [row.content.chapters[0]!.objectives[0]!.checks[0]!.written?.input, row.progress.prose]))
    .toEqual(Object.entries(answers))
})
it('keeps unlocks and selected transfers atomic across failure, retries, and duplicate clicks',async () => {
  const library = useLibraryStore(), key = await library.installPath(example)
  const row = () => library.data.learningPaths![0]!
  await library.updatePath(key,advance)
  await library.updatePath(key,r=>gradeLocal(r,{kind:'text',value:'6'}))
  await library.updatePath(key,advance)
  const grade = () => library.updatePath(key,r=>gradeLocal(r,{kind:'text',value:'15'}))
  vi.spyOn(BrowserStorage.prototype,'save').mockRejectedValueOnce(new Error('full'))
  await expect(grade()).rejects.toThrow()
  expect(row().progress.passed).toEqual([])
  await grade()
  expect(library.decks).toHaveLength(0)
  const transfer = () => library.transferCards(key,['wieder-anteil','wieder-wechsel'],'')
  vi.spyOn(BrowserStorage.prototype,'save').mockRejectedValueOnce(new Error('full'))
  await expect(transfer()).rejects.toThrow()
  expect(row().progress.transferred).toEqual([])
  await Promise.all([transfer(),transfer()])
  expect(library.decks).toHaveLength(1)
  expect(library.decks[0]?.cards).toHaveLength(1)
  expect(library.decks[0]?.cards[0]?.repetitions).toBe(0)
  expect(row().progress.transferred).toEqual(['wieder-anteil'])
  vi.restoreAllMocks()
})
it('protects a newer path attempt from changes in a stale browser tab',async () => {
  const first = useLibraryStore()
  const key = await first.installPath(example)
  setActivePinia(createPinia())
  const other = useLibraryStore()
  await other.hydrate()
  await first.updatePath(key,advance)
  await expect(other.updatePath(key,advance)).rejects.toThrow()
  expect(other.persistenceIssue).toBe('conflict')
  expect(other.data.learningPaths?.[0]?.progress.phase).toBe('lesson')
  setActivePinia(createPinia())
  const reopened = useLibraryStore()
  await reopened.hydrate()
  expect(reopened.data.learningPaths?.[0]?.progress.phase).toBe('practice')
})

it('deletes only the selected version and clears its draft recovery after the write commits', async () => {
  const library = useLibraryStore()
  const key = await library.installPath(example)
  const other = await library.installPath({ ...example, version: example.version + 1 })
  await library.updatePath(key, advance)
  await library.updatePath(key, row => gradeLocal(row, { kind: 'text', value: '6' }))
  await library.updatePath(key, advance)
  await library.updatePath(key, row => gradeLocal(row, { kind: 'text', value: '15' }))
  await library.transferCards(key, ['wieder-anteil'], '')
  await library.updatePath(key, advance)
  const row = library.data.learningPaths![0]!
  const backup = writeDraftBackup(key, row, { prose: 'Unsaved work', draft: row.progress.draft! })

  const save = vi.spyOn(BrowserStorage.prototype, 'save').mockRejectedValueOnce(new Error('full'))
  try {
    await expect(library.deletePath(key)).rejects.toThrow('full')
    expect(library.data.learningPaths?.[0]).toEqual(row)
    expect(readDraftBackup(key, row)?.id).toBe(backup.id)
    await library.deletePath(key)
    expect(isCurrentBackup(key, backup.id)).toBe(false)
    expect(localStorage.length).toBe(0)
    const saved = await new BrowserStorage().load()
    expect(saved.learningPaths?.map(({ content }) => content.id + '@' + content.version)).toEqual([other])
    expect(saved.decks[0]?.cards).toHaveLength(1)
  } finally { save.mockRestore() }
})

it('reclaims snapshot space for deck writes by deleting an installed path', async () => {
  const library = useLibraryStore()
  const template = example.chapters[0]!.objectives[0]!
  const text = '数'.repeat(8000)
  const chapters = Array.from({ length: 20 }, (_, chapter) => ({
    id: 'chapter-' + chapter,
    title: 'Chapter',
    objectives: Array.from({ length: 10 }, (_, objective) => {
      const id = `goal-${chapter}-${objective}`
      return { ...template, reviewChecks: undefined, id, explanation: text, example: text,
        practice: { ...template.practice, id: id + '-practice' },
        checks: template.checks.map((check, index) => ({ ...check, id: id + '-check-' + index })) }
    }),
  }))
  const key = await library.installPath({ ...example, chapters, reviewCards: [] })
  const cardText = 'A'.repeat(20_000)
  const cards = Array.from({ length: 24 }, () => createCard(cardText, cardText))
  const deck = await library.createDeck('Deck')

  await expect(library.addCards(deck.id, cards)).rejects.toThrow()
  expect(library.deckById(deck.id)?.cards).toHaveLength(0)
  await library.deletePath(key)
  await expect(library.addCards(deck.id, cards)).resolves.toBe(true)
  expect((await new BrowserStorage().load()).decks[0]?.cards).toHaveLength(cards.length)
})

it('round-trips out-of-order completion and topic and practice drafts in a personal backup', async () => {
  const library = useLibraryStore()
  const key = await library.installPath(example)
  await library.updatePath(key, advance)
  await library.updatePath(key, ({ progress }) => ({ ...progress, draft: { kind: 'text', value: '6' } }))
  await library.updatePath(key, row => switchObjective(row, 'wechsel'))
  await library.updatePath(key, advance)
  await library.updatePath(key, row => gradeLocal(row, { kind: 'fields', values: { basis: '50', prozent: '20' } }))
  await library.updatePath(key, advance)
  await library.updatePath(key, row => gradeLocal(row, { kind: 'fields', values: { basis: '80', prozent: '25' } }))
  await library.updatePath(key, ({ progress }) => ({ ...progress, practiceDrafts: [
    { activityId: 'w-uebung', draft: { kind: 'fields', values: { basis: '50' } } },
  ] }))
  const recovered = await importLibraryFile(new File([backupJson(library.data)], 'backup.json'))
  expect(recovered.learningPaths).toEqual(library.data.learningPaths)
  expect(recovered.learningPaths?.[0]?.progress).toMatchObject({
    passed: ['wechsel'], activeObjectiveId: 'anteil', phase: 'practice', draft: { value: '6' },
    reviews: [{ objectiveId: 'wechsel' }], practiceDrafts: [{ activityId: 'w-uebung', draft: { values: { basis: '50' } } }],
  })
})
