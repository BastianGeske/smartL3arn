import { normalizePathDraft, type Progress, type SavedPath } from '../../../shared/learning-paths.mjs'
import { attemptKey } from '../../domain/learningPath'

export type DraftPatch = Required<Pick<Progress, 'prose' | 'draft'>>
const storageKey = (path: string) => 'smartL3arn:path-draft:' + path
const editKey = (path: string, id: string) => storageKey(path) + ':' + id

function fingerprint({ draft, prose }: Pick<Progress, 'draft' | 'prose'>): string {
  // Field input order can differ without changing the answer.
  const response = draft?.kind === 'fields'
    ? { ...draft, values: Object.fromEntries(Object.keys(draft.values).sort().map(key => [key, draft.values[key]])) }
    : draft
  return JSON.stringify([prose, response])
}

export interface DraftBackup {
  id: string
  bases: string[]
}

export function writeDraftBackup(path: string, row: SavedPath, patch: DraftPatch, pending?: DraftPatch): DraftBackup {
  const bases = [fingerprint(row.progress)]
  if (pending) bases.push(fingerprint(pending))
  const id = crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16).padStart(8, '0')).join('')
  const previous = localStorage.getItem(storageKey(path))
  localStorage.setItem(editKey(path, id), JSON.stringify({ attempt: attemptKey(row), bases, patch }))
  try { localStorage.setItem(storageKey(path), id) }
  catch (error) { clearDraftBackup(path, id); throw error }
  if (previous) clearDraftBackup(path, previous)
  return { id, bases }
}

export function isCurrentBackup(path: string, id: string): boolean {
  try { return localStorage.getItem(storageKey(path)) === id }
  catch { return false }
}

export function clearDraftBackup(path: string, id: string): void {
  // The head may now belong to another tab. Remove only this edit's data.
  if (!/^[a-z0-9-]+$/i.test(id)) return
  try {
    localStorage.removeItem(editKey(path, id))
  } catch { /* A committed draft can also be recognized on reopen. */ }
}

export function clearPathDraftBackup(path: string): void {
  try {
    const key = storageKey(path)
    const id = localStorage.getItem(key)
    if (id === null) return
    clearDraftBackup(path, id)
    if (isCurrentBackup(path, id)) localStorage.removeItem(key)
  } catch { /* Recovery storage may be unavailable. */ }
}

export function matchesDraft(left: Pick<Progress, 'draft' | 'prose'>, right: DraftPatch): boolean {
  return fingerprint(left) === fingerprint(right)
}

export function matchesBackupBase(row: SavedPath, backup: DraftBackup): boolean {
  return backup.bases.includes(fingerprint(row.progress))
}

export function readDraftBackup(path: string, row: SavedPath): (DraftBackup & { patch: DraftPatch }) | undefined {
  let id: string | null
  let raw: string | null
  try {
    id = localStorage.getItem(storageKey(path))
    if (!id) return
    raw = localStorage.getItem(editKey(path, id))
  } catch { return }
  if (raw === null || !isCurrentBackup(path, id)) return
  try {
    const { attempt, bases, patch } = JSON.parse(raw)
    if (attempt === attemptKey(row) && Array.isArray(bases)
      && bases.length >= 1 && bases.length <= 2 && bases.every(base => typeof base === 'string')) {
      const backup = { id, bases, patch: normalizePathDraft(row, patch) }
      if (matchesBackupBase(row, backup) && !matchesDraft(row.progress, backup.patch)) return backup
    }
  } catch { /* Ignore malformed or obsolete recovery data. */ }
  clearDraftBackup(path, id)
}
