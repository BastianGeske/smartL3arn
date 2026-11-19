import { describe, expect, it } from 'vitest'
import example from '../../docs/learning-path.example.json'
import { freshProgress, normalizePath, normalizePaths, type SavedPath } from '../../shared/learning-paths.mjs'
import { criterionResults } from '../../shared/rubric.mjs'
import { advance, assist, attemptKey, gradeLocal, gradeWritten, position } from './learningPath'

function start(): SavedPath { return { content: normalizePath(example), progress: freshProgress() } }
function firstCheck() {
  const row = start()
  row.progress = advance(row)
  row.progress = gradeLocal(row, { kind: 'text', value: '6' })
  row.progress = advance(row)
  return row
}
function secondCheck() {
  const row = firstCheck()
  row.progress = gradeLocal(row, { kind: 'text', value: '15' })
  row.progress = advance(row)
  row.progress = gradeLocal(row, { kind: 'fields', values: { basis: '50', prozent:'20' } })
  row.progress = advance(row)
  return row
}
describe('source and offline contract', () => {
  it('requires distinct variants, local evidence, valid links and bounded unique IDs', () => {
    for (const change of [
      (r: ReturnType<typeof normalizePath>) => { r.reviewCards[0]!.objectiveId = 'unknown' },
      (r: ReturnType<typeof normalizePath>) => { r.chapters[0]!.objectives[0]!.source = ' ' },
      (r: ReturnType<typeof normalizePath>) => { r.chapters[0]!.objectives[0]!.checks.pop() },
      (r: ReturnType<typeof normalizePath>) => { const [a,b] = r.chapters[0]!.objectives[0]!.checks; b!.question = a!.question },
      (r: ReturnType<typeof normalizePath>) => { r.chapters[0]!.objectives[0]!.checks[0]!.task = {kind:'true_false',correct:true} },
      (r: ReturnType<typeof normalizePath>) => { r.chapters[0]!.objectives[0]!.checks[0]!.task = {kind:'long_text'} },
      (r: ReturnType<typeof normalizePath>) => { r.chapters[0]!.id = r.chapters[1]!.id },
    ]) {
      const content = normalizePath(example)
      change(content)
      expect(() => normalizePath(content)).toThrow()
    }
  })
  it('can assess conceptual transfer through two independently answerable matching tasks', () => {
    const row = start()
    const goal = row.content.chapters[0]!.objectives[0]!
    Object.assign(goal, {goal:'Fakten und Werturteile unterscheiden',source:'Ein Fakt ist überprüfbar. Ein Werturteil drückt eine Bewertung aus.',
      explanation:'Prüfe, ob Beobachtung oder Bewertung vorliegt.', example:'Die Tür ist zwei Meter hoch ist messbar. Die Tür ist schön ist eine Bewertung.'})
    for (const [i, activity] of [goal.practice,...goal.checks].entries()) {
      const cases = [['Der Saal hat 20 Plätze.','Der Saal ist gemütlich.'],['Der See ist vier Meter tief.','Der See ist wunderschön.'],['Der Zug hält dreimal.','Der Zug fährt angenehm.']][i]!
      activity.question = 'Ordne die Aussagen ein. ' + cases.join(' ')
      activity.task = {kind:'matching',pairs:[{id:'f',left:cases[0]!,right:'überprüfbare Angabe'},{id:'w',left:cases[1]!,right:'Bewertung'}]}
    }
    row.content = normalizePath(row.content)
    row.progress = advance(row)
    row.progress = gradeLocal(row, {kind:'fields',values:{f:'f',w:'w'}})
    row.progress = advance(row)
    expect(gradeLocal(row, {kind:'fields',values:{f:'w',w:'f'}}).passed).toEqual([])
    expect(gradeLocal(row, {kind:'fields',values:{f:'f',w:'w'}}).passed).toEqual(['anteil'])
  })
})
describe('independent evidence', () => {
  it('requires a complete constructed sequence and resets a legacy open order', () => {
    const row = start()
    const check = row.content.chapters[0]!.objectives[0]!.checks[0]!
    check.task = { kind: 'ordering', items: [{ id: 'a', text: 'First' }, { id: 'b', text: 'Second' }], correctOrder: ['a', 'b'] }
    row.progress = advance(row)
    row.progress = gradeLocal(row, { kind: 'text', value: '6' })
    row.progress = advance(row)
    expect(row.progress.draft).toEqual({ kind: 'order', ids: [] })
    for (const ids of [[], ['a'], ['a', 'a'], ['a', 'alien']]) {
      expect(gradeLocal(row, { kind: 'order', ids })).toBe(row.progress)
    }
    const answer = { kind: 'order', ids: ['a', 'b'] } as const
    const legacy = { ...row, progress: { ...row.progress, orderingInput: undefined, draft: answer, prose: 'Saved prose' } }
    expect(normalizePaths([legacy])[0]!.progress).toMatchObject({
      orderingInput: 'construct', draft: { kind: 'order', ids: [] }, prose: 'Saved prose',
    })
    const partial = { kind: 'order', ids: ['a'] }
    expect(normalizePaths([{ ...row, progress: { ...row.progress, draft: partial } }])[0]!.progress.draft).toEqual(partial)
    expect(gradeLocal(row, { kind: 'order', ids: ['a', 'b'] }).passed).toEqual(['anteil'])
  })
  it.each(['hint','solution','lesson'] as const)('converts %s to practice through restart, then offers a new variant', help => {
    const row = firstCheck()
    row.progress = assist(row, help)
    row.progress = normalizePaths([JSON.parse(JSON.stringify(row))])[0]!.progress
    row.progress = gradeLocal(row, { kind: 'text', value: '15' })
    expect(row.progress.passed).toEqual([])
    expect(row.progress.outcome).toBe('retry')
    row.progress = advance(row)
    expect(position(row).activity?.id).toBe('a-check2')
    row.progress = gradeLocal(row, { kind: 'text', value: '27' })
    expect(position(row).chapter?.id).toBe('bezugswechsel')
  })
  it('preserves past objectives and requires both the base and the rate for the next objective', () => {
    const row = secondCheck()
    row.progress = gradeLocal(row, {kind:'fields',values:{basis:'100',prozent:'25'}})
    expect(row.progress.passed).toEqual(['anteil'])
    row.progress = advance(row)
    row.progress = gradeLocal(row, {kind:'fields',values:{basis:'30',prozent:'40'}})
    expect(position(row).goal).toBeUndefined()
    expect(normalizePaths([row])[0]?.progress.passed).toEqual(['anteil','wechsel'])
  })
  it('only opens the next chapter after every objective in a multi-objective chapter', () => {
    const row = firstCheck()
    const next = row.content.chapters[1]!.objectives[0]!
    row.content.chapters[0]!.objectives.push({...next,id:'extra'})
    row.progress = gradeLocal(row, {kind:'text',value:'15'})
    expect(position(row).chapter?.id).toBe('grundwert')
    expect(position(row).goal?.id).toBe('extra')
  })
})
describe('criterion-based free text', () => {
  const trial = () => {
    const row = secondCheck(), written = position(row).activity!.written!
    Object.assign(row.progress, {mode:'written',prose:written.paraphrase})
    return { row, written, all: written.criteria.map(c => ({id:c.id,status:'satisfied',reason:'Demonstrated.'})) }
  }
  it('accepts a paraphrase only when every criterion is satisfied and ignores duplicate completion', () => {
    const { row, all } = trial(), token = attemptKey(row), text = row.progress.prose
    row.progress = gradeWritten(row, token, text, all.reverse())
    expect(row.progress.passed).toContain('wechsel')
    expect(gradeWritten(row, token, text, all)).toBe(row.progress)
  })
  it('retains the draft for unclear evidence and rejects partial or fluent wrong answers', () => {
    const {row,all,written} = trial()
    expect(gradeWritten(row,attemptKey(row),row.progress.prose,[all[0],{...all[1],status:'unclear'}])).toMatchObject({mode:'local',prose:written.paraphrase,passed:['anteil']})
    for (const prose of [written.partial,written.misconception]) {
      row.progress.prose = prose
      expect(gradeWritten(row,attemptKey(row),prose,[all[0],{...all[1],status:'missing'}])).toMatchObject({outcome:'retry',passed:['anteil']})
      expect(gradeWritten(row,attemptKey(row),prose,all)).toMatchObject({outcome:'retry',practiceOnly:['w-check1'],passed:['anteil']})
    }
  })
  it('keeps an author-marked unreliable rubric available as practice while its local alternative unlocks the chapter', () => {
    const {row,all,written} = trial()
    written.practiceOnly = true
    expect(gradeWritten(row,attemptKey(row),row.progress.prose,all)).toMatchObject({outcome:'retry',passed:['anteil']})
    row.progress.mode = 'local'
    expect(gradeLocal(row,{kind:'fields',values:{basis:'80',prozent:'25'}}).passed).toEqual(['anteil','wechsel'])
  })
  it('ignores stale answers, edits, switched versions, missing or duplicated criteria', () => {
    const {row,all,written} = trial(), token = attemptKey(row)
    expect(gradeWritten(row,token,'earlier answer',all)).toBe(row.progress)
    for (const invalid of [[all[0]], [all[0],all[0]], [{...all[0],id:'alien'},all[1]], [all[0],{...all[1],reason:''}]]) {
      expect(criterionResults(invalid,written.criteria)).toBeNull()
      expect(gradeWritten(row,token,row.progress.prose,invalid)).toBe(row.progress)
    }
    row.content.version++
    expect(gradeWritten(row,token,row.progress.prose,all)).toBe(row.progress)
  })
})
