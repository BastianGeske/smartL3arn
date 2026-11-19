import { beforeEach, expect, it } from 'vitest'
import example from '../../../docs/learning-path.example.json'
import { freshProgress, normalizePath, pathKey } from '../../../shared/learning-paths.mjs'
import { advance, gradeLocal } from '../../domain/learningPath'
import { clearDraftBackup, isCurrentBackup, readDraftBackup, writeDraftBackup, type DraftPatch } from './pathDraftBackup'

function openCheck() {
  const row = { content: normalizePath(example), progress: freshProgress() }
  row.progress = advance(row)
  row.progress = gradeLocal(row, { kind: 'text', value: '6' })
  row.progress = advance(row)
  return { row, key: pathKey(row.content) }
}
const patch = (value: string): DraftPatch => ({ prose: '', draft: { kind: 'text', value } })
beforeEach(() => localStorage.clear())

it('recovers the latest edit whether the previous write committed or was interrupted', () => {
  const { row, key } = openCheck()
  const previous = patch('1'), latest = patch('15')
  const inFlight = writeDraftBackup(key, row, previous)
  const backup = writeDraftBackup(key, row, latest, previous)
  clearDraftBackup(key, inFlight.id)
  expect(isCurrentBackup(key, inFlight.id)).toBe(false)
  expect(readDraftBackup(key, row)).toMatchObject({ id: backup.id, patch: latest })
  row.progress = { ...row.progress, ...previous }
  expect(readDraftBackup(key, row)).toMatchObject({ id: backup.id, patch: latest })
  row.progress = { ...row.progress, ...latest }
  expect(readDraftBackup(key, row)).toBeUndefined()
})

it.each(['changed attempt', 'closed attempt', 'competing commit'] as const)('does not replay a backup after a %s', change => {
  const { row, key } = openCheck()
  writeDraftBackup(key, row, patch('15'))
  if (change === 'changed attempt') row.progress.attempt++
  if (change === 'closed attempt') row.progress.outcome = 'retry'
  if (change === 'competing commit') row.progress = { ...row.progress, ...patch('12') }
  expect(readDraftBackup(key, row)).toBeUndefined()
})

it('rejects a malformed backup without changing the committed answer', () => {
  const { row, key } = openCheck()
  writeDraftBackup(key, row, { prose: '', draft: { kind: 'fields', values: {} } })
  expect(readDraftBackup(key, row)).toBeUndefined()
  expect(row.progress.draft).toEqual({ kind: 'text', value: '' })
})
