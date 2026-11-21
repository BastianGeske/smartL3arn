import { normalizePathDraft, normalizePracticeDraft, normalizeReviewDraft, type Progress, type SavedPath } from '../../../shared/learning-paths.mjs'
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

export const reviewBackupKey = (path: string) => path + ':review'
export const practiceBackupKey = (path: string, id: string) => path + ':practice:' + id

type DraftScope = false | true | { activityId: string }

function draftSource(row: SavedPath, scope: DraftScope) {
  if (typeof scope === 'object') {
    const saved = row.progress.practiceDrafts?.find(entry => entry.activityId === scope.activityId)
    return { attempt: scope.activityId, saved: { prose: '', draft: saved?.draft } }
  }
  if (!scope) return { attempt: attemptKey(row), saved: row.progress }
  const session = row.progress.reviewSession!
  const due = row.progress.reviews?.find(r => r.objectiveId === session.queue[0])?.dueDate
  return { attempt: JSON.stringify([session.activityId, session.retry, due]), saved: { prose: '', draft: session.draft } }
}

export function writeDraftBackup(path: string, row: SavedPath, patch: DraftPatch, pending?: DraftPatch, scope: DraftScope = false): DraftBackup {
  const source = draftSource(row, scope)
  const bases = [fingerprint(source.saved)]
  if (pending) bases.push(fingerprint(pending))
  const id = crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16).padStart(8, '0')).join('')
  const previous = localStorage.getItem(storageKey(path))
  localStorage.setItem(editKey(path, id), JSON.stringify({ attempt: source.attempt, bases, patch }))
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

export function matchesBackupBase(row: SavedPath, backup: DraftBackup, scope: DraftScope = false): boolean {
  return backup.bases.includes(fingerprint(draftSource(row, scope).saved))
}

export function readDraftBackup(path: string, row: SavedPath, scope: DraftScope = false): (DraftBackup & { patch: DraftPatch }) | undefined {
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
    const source = draftSource(row, scope)
    if (attempt === source.attempt && Array.isArray(bases)
      && bases.length >= 1 && bases.length <= 2 && bases.every(base => typeof base === 'string')) {
      const validated = typeof scope === 'object'
        ? { prose: '', draft: normalizePracticeDraft(row, scope.activityId, patch.draft) }
        : scope ? { prose: '', draft: normalizeReviewDraft(row, patch.draft) } : normalizePathDraft(row, patch)
      const backup = { id, bases, patch: validated }
      if (matchesBackupBase(row, backup, scope) && !matchesDraft(source.saved, backup.patch)) return backup
    }
  } catch { /* Ignore malformed or obsolete recovery data. */ }
  clearDraftBackup(path, id)
}
