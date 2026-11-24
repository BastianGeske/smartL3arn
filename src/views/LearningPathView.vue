<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { codeEdit } from '../domain/codeEditor'
import { codeFingerprint, codeValidated, validateCodeRubric } from '../domain/pathCode'
import { recordContact, correctionCases } from '../domain/pathEvidence'
import { pathQuality } from '../domain/pathQuality'
import AppIcon from '../components/AppIcon.vue'
import PathFocusTimer from '../components/PathFocusTimer.vue'
import PathPractice from '../components/PathPractice.vue'
import PathFeedback from '../components/PathFeedback.vue'
import PathRoundSummary from '../components/PathRoundSummary.vue'
import PathTopics from '../components/PathTopics.vue'
import PathReview from '../components/PathReview.vue'
import { dueObjectives, revisitCompleted, startReview } from '../domain/pathReview'
import { useCalendarStore } from '../stores/calendar'
import AppBar from '../components/AppBar.vue'
import MathContent from '../components/MathContent.vue'
import MathInput from '../components/MathInput.vue'
import PathAnswerContent from '../components/PathAnswerContent.vue'
import TaskResponse from '../components/TaskResponse.vue'
import TaskQuestion from '../components/TaskQuestion.vue'
import { useI18n } from '../i18n'
import { useLibraryStore } from '../stores/library'
import { pathKey, practiceCases, selfCheckRequired, type Activity, type Progress, type SavedPath } from '../../shared/learning-paths.mjs'
import { parseNumeric } from '../../shared/tasks.mjs'
import { advance, assist, attemptKey, completeOrderingCheck, gradeLocal, gradeWritten, position, relearnObjective, switchObjective } from '../domain/learningPath'
import { AI_TEXT_LIMIT, fieldValue, responseError } from '../domain/tasks'
import type { StudyResponse } from '../domain/types'
import { getAiBridge } from '../services/ai'
import { saveExport } from '../services/native'
import { clearDraftBackup, isCurrentBackup, matchesBackupBase, matchesDraft, readDraftBackup, writeDraftBackup,
  type DraftBackup, type DraftPatch } from '../services/storage/pathDraftBackup'

const { t, locale } = useI18n(), library = useLibraryStore(), route = useRoute(), router = useRouter()
const key = computed(() => String(route.params.key))
const row = computed(() => library.data.learningPaths?.find(entry => pathKey(entry.content) === key.value))
const pos = computed(() => row.value && position(row.value))
const p = computed(() => row.value?.progress)
const calendar = useCalendarStore()
const dueCount = computed(() => row.value ? Math.min(3, dueObjectives(row.value, calendar.today).length) : 0)
const revealed = ref(false), openingAnswer = ref<HTMLElement>(), resultAcknowledged = ref(false)
const wantsReview = computed(() => route.query.review === '1')
const hasReview = computed(() => Boolean(p.value?.reviewSession))
const reviewing = computed(() => wantsReview.value && hasReview.value)
const reviews = computed(() => new Map(p.value?.reviews?.map(r => [r.objectiveId, r])))
const showPass = computed(() => !!p.value?.lastPass || (p.value?.phase === 'lesson' && p.value.feedback && !resultAcknowledged.value))
const passFeedback = computed(() => p.value?.lastPass?.feedback ?? p.value?.feedback ?? '')
const passGoal = computed(() => row.value?.content.chapters.flatMap(chapter => chapter.objectives)
  .find(goal => goal.id === p.value?.lastPass?.objectiveId))
const passAnswer = computed(() => p.value?.lastPass?.result)
const passActivity = computed(() => passGoal.value?.checks.find(activity => activity.id === passAnswer.value?.activityId))
const practiceSet = computed(() => pos.value?.goal?.practiceExtras ? practiceCases(pos.value.goal) : undefined)
const round = computed(() => p.value?.selfCheck)
const completedRounds = computed(() => new Map(p.value?.completedChecks?.map(entry => [entry.objectiveId, entry.round])))
const passRound = computed(() => completedRounds.value.get(passGoal.value?.id ?? ''))
const visitedRound = computed(() => completedRounds.value.get(completedTopic.value?.id ?? ''))
const finishedRound = computed(() => passGoal.value ? passRound.value
  : round.value?.answers.length === round.value?.queue.length ? round.value : undefined)
const activeAnswer = computed(() => round.value
  ? p.value?.outcome === 'retry' ? round.value.answers.at(-1) : undefined
  : p.value?.result)
const roundPosition = computed(() => round.value ? round.value.answers.length + Number(p.value?.outcome === 'open') : 0)
const practiceLast = computed(() => !!practiceSet.value && p.value?.phase === 'practice' && p.value.variant === practiceSet.value.length - 1)
const afterPractice = computed(() => p.value?.phase === 'practice' && practiceSet.value && !practiceLast.value ? 'path.round.nextPractice'
  : practiceLast.value ? 'path.round.start' : 'path.toCheck')
const topics = ref<InstanceType<typeof PathTopics>>()
const repeat = ref<InstanceType<typeof PathPractice>>()
const topicError = ref('')
const visitedId = ref<string>()
const repeatActivity = ref<Activity>()
const completedTopic = computed(() => row.value?.content.chapters.flatMap(chapter => chapter.objectives).find(goal => goal.id === visitedId.value))
const explanationOpen = ref(false), explanationHeading = ref<HTMLElement>(), taskPanel = ref<HTMLElement>()
const lastAnswerControl = ref<HTMLElement>()
watch([key, () => pos.value?.goal?.id], () => {
  revealed.value = false
  resultAcknowledged.value = false
})
watch(key, () => { visitedId.value = undefined; repeatActivity.value = undefined; topicError.value = '' })
async function continueFromResult() {
  if (p.value?.lastPass && !await change(({ progress }) => {
    const { lastPass, ...next } = progress
    return next
  })) return
  resultAcknowledged.value = true
  await nextTick()
  heading.value?.focus()
}
async function revealOpening() {
  revealed.value = true
  await nextTick()
  openingAnswer.value?.focus()
}
function setReviewRoute(open: boolean) {
  const query = { ...route.query }
  if (open) query.review = '1'
  else delete query.review
  return router.replace({ query })
}
async function openReview() {
  if (saving.value || waiting.value || !await savePracticeDraft()) return
  if (wantsReview.value) await change(row => startReview(row))
  else await setReviewRoute(true)
}
const independent = computed(() => p.value?.phase === 'check' && p.value.help === 'none'
  && (p.value.mode === 'local' || (!pos.value?.activity?.written?.practiceOnly && !p.value.practiceOnly.includes(pos.value!.activity!.id))))
const token = computed(() => row.value ? attemptKey(row.value) : '')
const questionKey = computed(() => JSON.stringify([key.value, pos.value?.goal?.id, pos.value?.activity?.id]))
const answer = ref<StudyResponse>(), prose = ref(''), notice = ref(''), saving = ref(false), waiting = ref(false)
const invalidNumericGaps = ref<string[]>([])
const localResponse = ref<HTMLElement>()
const actionNotice = ref('')
const aiReadiness = ref<'checking' | 'ready' | 'unavailable'>('unavailable')
const aiModel = ref('')
const validationBusy = ref(false)
const codePracticeOnly = computed(() => !!pos.value?.activity && (!!pos.value.activity.written?.practiceOnly || !!p.value?.practiceOnly.includes(pos.value.activity.id)))
const validCode = computed(() => !!p.value && !!pos.value?.activity?.written && codeValidated(p.value, pos.value.activity.id, pos.value.activity.written, aiModel.value))
const writtenReady = computed(() => aiReadiness.value === 'ready')
const roundWrittenRestricted = computed(() => !!round.value && !!pos.value?.activity &&
  (pos.value.activity.written?.practiceOnly || p.value?.practiceOnly.includes(pos.value.activity.id)))
const writtenInput = computed(() => pos.value?.activity?.written?.input ?? 'text')
const formulaPromptId = useId()
const codePasteRejected = ref(false)
const solution = computed(() => {
  const activity = pos.value?.activity
  if (p.value?.mode === 'written' && activity?.written) {
    return { text: activity.written.reference, format: writtenInput.value }
  }
  return { text: activity?.solution ?? '', format: 'text' as const }
})
const feedbackContainsSolution = computed(() => {
  const feedback = p.value?.feedback
  return feedback === solution.value.text || feedback?.endsWith('\n' + solution.value.text)
})
const resultBox = ref<HTMLElement>()
const answerFeedback = ref<InstanceType<typeof PathFeedback>>()
const roundSummaryView = ref<InstanceType<typeof PathRoundSummary>>()
const heading = ref<HTMLElement>(), chosen = ref<string[]>([]), target = ref('')
const availableCards = computed(() => row.value?.content.reviewCards.filter(c => p.value!.passed.includes(c.objectiveId) && !p.value!.transferred.includes(c.id)) || [])
let request = 0
interface PendingDraft { path: string; attempt: string; patch: DraftPatch; backup?: DraftBackup; recovered?: boolean }
let draftSave: PendingDraft | undefined
let draftInFlight: { draft: PendingDraft; promise: Promise<void> } | undefined
let unsafeDraft: PendingDraft | undefined
let timer: ReturnType<typeof setTimeout> | undefined
function warnBeforeUnload(event: BeforeUnloadEvent) {
  event.preventDefault()
  event.returnValue = true
}
function setUnsafeDraft(draft?: PendingDraft) {
  unsafeDraft = draft
  if (draft) window.addEventListener('beforeunload', warnBeforeUnload)
  else window.removeEventListener('beforeunload', warnBeforeUnload)
}
function cancelDraftTimer() { clearTimeout(timer); timer = undefined }
async function persistDraft(save: PendingDraft) {
  const { path, attempt, patch, backup, recovered } = save
  await library.updatePath(path, current => {
    if (attemptKey(current) !== attempt || current.progress.outcome !== 'open' || matchesDraft(current.progress, patch)) return current.progress
    if (recovered && backup && (!isCurrentBackup(path, backup.id) || !matchesBackupBase(current, backup))) return current.progress
    return { ...current.progress, ...patch }
  })
  if (backup) clearDraftBackup(path, backup.id)
  if (unsafeDraft === save) setUnsafeDraft()
}
async function flushDraft() {
  cancelDraftTimer()
  while (draftInFlight || draftSave) {
    if (!draftInFlight && draftSave) {
      const save = draftSave
      draftSave = undefined
      const promise = persistDraft(save).catch(error => {
        draftSave ??= save
        throw error
      }).finally(() => { draftInFlight = undefined })
      draftInFlight = { draft: save, promise }
    }
    await draftInFlight?.promise
    cancelDraftTimer()
  }
}
function queueDraft(save: PendingDraft) {
  draftSave = save
  cancelDraftTimer()
  timer = setTimeout(() => { void flushDraft().catch(report) }, 300)
}
function scheduleDraft() {
  const current = row.value
  if (!current || current.progress.outcome !== 'open' || !answer.value) return
  const save: PendingDraft = { path: key.value, attempt: token.value, patch: { prose: prose.value, draft: answer.value } }
  const inFlight = draftInFlight?.draft
  try {
    save.backup = writeDraftBackup(save.path, current, save.patch, inFlight?.attempt === save.attempt ? inFlight.patch : undefined)
    setUnsafeDraft()
  } catch { setUnsafeDraft(save) }
  queueDraft(save)
}
function setProse(value: string) {
  prose.value = value
  scheduleDraft()
}
function checkCodePaste(event: ClipboardEvent) {
  if (writtenInput.value !== 'code' || !event.clipboardData) return
  const field = event.currentTarget as HTMLTextAreaElement
  const inserted = event.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n')
  const selected = field.selectionEnd - field.selectionStart
  codePasteRejected.value = field.value.length - selected + inserted.length > AI_TEXT_LIMIT
  if (codePasteRejected.value) event.preventDefault()
}
function setAnswer(value: StudyResponse) {
  if (invalidNumericGaps.value.length && value.kind === 'fields' && answer.value?.kind === 'fields') {
    const previous = answer.value.values
    invalidNumericGaps.value = invalidNumericGaps.value.filter(id => fieldValue(previous, id) === fieldValue(value.values, id))
  }
  answer.value = value
  scheduleDraft()
}
function report(error: unknown) { notice.value = error instanceof Error ? error.message : t('path.saveFailed') }
watch(token, () => {
  request++
  codePasteRejected.value = false
  waiting.value = false
  answer.value = p.value?.draft
  prose.value = p.value?.prose ?? ''
  if (row.value) {
    const backup = readDraftBackup(key.value, row.value)
    if (backup) {
      answer.value = backup.patch.draft
      prose.value = backup.patch.prose
      queueDraft({ path: key.value, attempt: token.value, patch: backup.patch, backup, recovered: true })
    }
  }
  notice.value = ''
}, { immediate: true, flush: 'sync' })
watch(questionKey, () => {
  invalidNumericGaps.value = []
  explanationOpen.value = false
  lastAnswerControl.value = undefined
}, { flush: 'sync' })
watch(questionKey, async () => { await nextTick(); heading.value?.focus() })
watch(questionKey, async (_, _previous, onCleanup) => {
  const ai = getAiBridge()
  aiReadiness.value = 'unavailable'
  aiModel.value = ''
  if (!pos.value?.activity?.written || !ai?.evaluateCriteria) return
  let active = true
  onCleanup(() => { active = false })
  aiReadiness.value = 'checking'
  try {
    const status = await ai.getAiStatus()
    if (active) { aiReadiness.value = status.available && status.configured ? 'ready' : 'unavailable'; aiModel.value = status.model ?? '' }
  } catch {
    if (active) aiReadiness.value = 'unavailable'
  }
}, { immediate: true, flush: 'sync' })
watch(() => p.value?.outcome, async outcome => {
  if (outcome && outcome !== 'open') { await nextTick(); resultBox.value?.focus() }
})
watch([activeAnswer, finishedRound, passAnswer], async ([answer, summary, passedAnswer]) => {
  await nextTick()
  if (summary) roundSummaryView.value?.focus()
  else if (passedAnswer) heading.value?.focus()
  else if (answer) answerFeedback.value?.focus()
})
watch(reviewing, async active => {
  if (active) {
    explanationOpen.value = false
    visitedId.value = undefined
    repeatActivity.value = undefined
  }
  if (!active) { await nextTick(); heading.value?.focus() }
})
watch(key, () => { chosen.value = []; target.value = ''; actionNotice.value = '' })
const onHide = () => { if (document.visibilityState === 'hidden') void flushDraft().catch(report) }
function onPageHide() { void flushDraft().catch(report) }
window.addEventListener('pagehide', onPageHide)
async function saveBeforeNavigating() {
  try { await flushDraft() } catch (error) { report(error); return false }
}
onBeforeRouteLeave(saveBeforeNavigating)
onBeforeRouteUpdate((to, from) => {
  if (to.params.key !== from.params.key || to.query.review !== from.query.review) return saveBeforeNavigating()
})
document.addEventListener('visibilitychange', onHide)
onBeforeUnmount(() => {
  request++
  window.removeEventListener('pagehide', onPageHide)
  document.removeEventListener('visibilitychange', onHide)
  setUnsafeDraft()
  void flushDraft().catch(report)
})

async function change(action: (current: SavedPath) => Progress): Promise<boolean> {
  if (saving.value || validationBusy.value || !row.value) return false
  const path = key.value, expected = token.value
  notice.value = ''
  saving.value = true
  let applied = false
  try {
    await flushDraft()
    await library.updatePath(path, current => {
      if (key.value !== path || attemptKey(current) !== expected) return current.progress
      applied = true
      return action(current)
    })
    return applied && key.value === path
  } catch (e) { report(e); return false }
  finally { saving.value = false }
}
watch([key, wantsReview, () => Boolean(row.value)], async ([path, open, available]) => {
  if (!open || !available || hasReview.value) return
  await nextTick()
  if (key.value !== path || !wantsReview.value || hasReview.value) return
  if (dueCount.value) await change(row => startReview(row))
  else await setReviewRoute(false)
}, { immediate: true })
watch([key, hasReview], ([path, active], [previousPath, wasActive]) => {
  if (path === previousPath && wasActive && !active && wantsReview.value) void setReviewRoute(false)
})
function cancelWritten() {
  request++
  waiting.value = false
}
async function savePracticeDraft() {
  return !repeat.value || await repeat.value.saveBeforeLeaving()
}
async function selectTopic(id: string) {
  if (saving.value || !p.value || !await savePracticeDraft()) return
  topicError.value = ''
  cancelWritten()
  const completed = p.value.passed.includes(id)
  if (!await change(current => completed ? revisitCompleted(current, id) : switchObjective(current, id))) {
    topicError.value = notice.value
    return
  }
  if (completed && visitedId.value === id && !repeatActivity.value) {
    topics.value?.close(false)
    heading.value?.focus()
    return
  }
  visitedId.value = completed ? id : undefined
  repeatActivity.value = undefined
  explanationOpen.value = false
  topics.value?.close(false)
  await nextTick()
  heading.value?.focus()
}
async function repeatTask(activity: Activity) {
  const topic = completedTopic.value
  if (!topic || saving.value || !await change(current => revisitCompleted(current, topic.id, activity.id))) return
  repeatActivity.value = activity
}
async function backToPath() {
  if (!await savePracticeDraft()) return
  repeatActivity.value = undefined
  visitedId.value = undefined
  await nextTick()
  heading.value?.focus()
}
async function revisitExplanation() {
  cancelWritten()
  if (!await change(current => current.progress.outcome === 'open' ? assist(current, 'lesson')
    : recordContact(current.progress, position(current).goal!.id, 'lesson'))) return
  explanationOpen.value = true
  await nextTick()
  explanationHeading.value?.focus()
}
function rememberAnswerFocus(event: FocusEvent) {
  const target = event.target
  if (target instanceof HTMLElement && target.closest('.task-response, #written-answer, math-field, .latex-input')) lastAnswerControl.value = target
}
function canRestoreFocus(control: HTMLElement) {
  if (control.matches(':disabled, [readonly], input[type="hidden"]') || control.closest('[hidden], [inert], [aria-hidden="true"], [aria-disabled="true"]')) return false
  if (['hidden', 'collapse'].includes(getComputedStyle(control).visibility)) return false
  for (let element: HTMLElement | null = control; element; element = element.parentElement) {
    if (getComputedStyle(element).display === 'none') return false
  }
  return true
}
async function backToTask() {
  explanationOpen.value = false
  await nextTick()
  const scope = p.value?.mode === 'written' ? taskPanel.value?.querySelector('.path-written-response') : localResponse.value
  const preferred = lastAnswerControl.value
  if (preferred && scope?.contains(preferred) && canRestoreFocus(preferred)) {
    preferred.focus()
    return
  }
  const visibleControl = (selector: string) => Array.from(scope?.querySelectorAll<HTMLElement>(selector) ?? []).find(canRestoreFocus)
  const target = visibleControl('textarea, input, math-field, select') ?? visibleControl('button') ?? heading.value
  target?.focus()
}
function useHelp(help: Exclude<Progress['help'],'none'>) {
  cancelWritten()
  return change(current => assist(current, help))
}
function switchMode(mode: Progress['mode']) {
  if (mode === p.value?.mode || (mode === 'written' && (!writtenReady.value || roundWrittenRestricted.value))) return
  request++
  waiting.value = false
  return change(({ progress }) => ({ ...progress, mode, attempt: progress.attempt + 1 }))
}
async function localCheck() {
  const value = answer.value, activity = pos.value?.activity, active = row.value
  if (!value || !activity || !active || explanationOpen.value || saving.value || active.progress.mode !== 'local' || active.progress.outcome !== 'open') return
  const invalid = responseError(activity.task, value)
  if (invalid) { notice.value = t(invalid); return }
  const task = activity.task
  if (task.kind === 'cloze' && value.kind === 'fields') {
    invalidNumericGaps.value = task.gaps.filter(gap => {
      const input = fieldValue(value.values, gap.id)
      return gap.kind === 'number' && input.trim() && !parseNumeric(input)
    }).map(gap => gap.id)
    if (invalidNumericGaps.value.length) {
      notice.value = ''
      await nextTick()
      localResponse.value?.querySelector<HTMLInputElement>('input[aria-invalid="true"]')?.focus()
      return
    }
  }
  const fields = task.kind === 'matching' ? task.pairs : task.kind === 'cloze' ? task.gaps : []
  if (!completeOrderingCheck(active, value)
    || (value.kind === 'selection' && !value.ids.length) || (value.kind === 'boolean' && value.value === null)
    || (value.kind === 'fields' && fields.some(field => !fieldValue(value.values, field.id).trim()))) {
    notice.value = t('path.answerFirst')
    return
  }
  return change(current => gradeLocal(current, value))
}
async function writtenCheck() {
  const active = row.value, written = pos.value?.activity?.written, evaluate = getAiBridge()?.evaluateCriteria
  if (!active || !written || !writtenReady.value || !prose.value.trim() || prose.value.length > AI_TEXT_LIMIT
    || explanationOpen.value || waiting.value || saving.value || active.progress.mode !== 'written' || active.progress.outcome !== 'open') return
  const submitted = prose.value, expected = token.value, path = key.value, serial = ++request
  waiting.value = true
  notice.value = ''
  try {
    await flushDraft()
    if (request !== serial) return
    if (!evaluate) throw new Error()
    const status = await getAiBridge()!.getAiStatus()
    if (request !== serial) return
    aiModel.value = status.model ?? ''
    if (written.input === 'code' && !codePracticeOnly.value && !codeValidated(row.value!.progress, pos.value!.activity!.id, written, aiModel.value)) {
      notice.value = t('path.code.validationRequired'); return
    }
    const result = await evaluate({ deckName: active.content.title, question: written.question, language: locale.value,
      referenceAnswer: written.reference, userAnswer: submitted, answerFormat: written.input ?? 'text', codeLanguage: written.language, criteria: written.criteria.map(({id, description}) => ({id, description})) })
    if (request !== serial) return
    if (!result.ok || !result.result) throw new Error()
    if (written.input === 'code' && (await getAiBridge()!.getAiStatus()).model !== aiModel.value) {
      if (request === serial) { aiModel.value = ''; notice.value = t('path.code.validationRequired') }; return
    }
    const criteria = result.result.criteria
    await library.updatePath(path, current => {
      if (request !== serial) return current.progress
      const next = gradeWritten(current, expected, submitted, criteria, aiModel.value)
      if (next === current.progress) throw new Error()
      return next
    })
  } catch {
    if (request !== serial) return
    if (library.persistenceIssue) { notice.value = library.saveError || t('path.saveFailed'); return }
    await switchMode('local')
    if (key.value === path && !library.persistenceIssue) notice.value = t('path.aiFallback')
  } finally { if (request === serial) waiting.value = false }
}
async function share() {
  if (!row.value) return
  const content = row.value.content
  try { await saveExport(content.id + '-v' + content.version + '.json', JSON.stringify(content), 'application/json') }
  catch (e) { actionNotice.value = e instanceof Error ? e.message : t('path.saveFailed') }
}
async function transfer() {
  if (saving.value) return
  saving.value = true
  try { await library.transferCards(key.value, chosen.value, target.value); chosen.value = []; actionNotice.value = t('path.transferred') }
  catch (e) { actionNotice.value = e instanceof Error ? e.message : t('path.saveFailed') } finally { saving.value = false }
}

async function contactResult(objectiveId: string) {
  await library.updatePath(key.value, row => recordContact(row.progress, objectiveId, 'solution')).catch(report)
}
async function correctPassed() {
  if (!passGoal.value || !row.value) return
  const goal = passGoal.value
  const activity = correctionCases(goal, row.value.progress)[0]
  if (!activity || !await change(current => revisitCompleted(current, goal.id, activity.id))) return
  visitedId.value = goal.id
  repeatActivity.value = activity
}
let escapeCodeTab = false
function codeKeydown(event: KeyboardEvent) {
  if (writtenInput.value !== 'code' || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return
  if (event.key === 'Escape') { escapeCodeTab = true; return }
  if (event.key === 'Tab' && escapeCodeTab) { escapeCodeTab = false; return }
  escapeCodeTab = false
  if (event.key !== 'Tab' && event.key !== 'Enter') return
  event.preventDefault()
  const field = event.currentTarget as HTMLTextAreaElement
  const edit = codeEdit(field.value, field.selectionStart, field.selectionEnd, event.key, event.shiftKey)
  if (edit.value.length > AI_TEXT_LIMIT) { codePasteRejected.value = true; return }
  setProse(edit.value)
  void nextTick(() => field.setSelectionRange(edit.start, edit.end))
}
async function validateCode() {
  const current = row.value, activity = pos.value?.activity, bridge = getAiBridge()
  if (!current || !activity?.written || !bridge?.evaluateCriteria || validationBusy.value || saving.value || waiting.value) return
  validationBusy.value = true
  const serial = ++request, expected = token.value, path = key.value
  const active = () => serial === request && expected === token.value && path === key.value
  try {
    await flushDraft()
    const status = await bridge.getAiStatus()
    if (!active()) return
    aiModel.value = status.model ?? ''
    if (!status.available || !status.configured || !aiModel.value) throw new Error(t('path.aiUnavailable'))
    const model = aiModel.value
    const valid = await validateCodeRubric(bridge.evaluateCriteria, activity.written, current.content.title, locale.value, active)
    const latest = await bridge.getAiStatus()
    if (!active() || latest.model !== model) return
    await library.updatePath(path, row => {
      if (!active()) return row.progress
      const codeValidations = (row.progress.codeValidations ?? []).filter(v => v.activityId !== activity.id)
      return valid ? { ...row.progress, codeValidations: [...codeValidations, { activityId: activity.id, model, fingerprint: codeFingerprint(activity.written!) }] }
        : { ...row.progress, codeValidations, practiceOnly: [...new Set([...row.progress.practiceOnly, activity.id])] }
    })
    notice.value = t(valid ? 'path.code.validated' : 'path.unreliable')
  } catch (error) { if (active()) report(error) }
  finally { validationBusy.value = false }
}
watch([key, () => pos.value?.goal?.id, () => p.value?.phase, revealed, showPass, reviewing], async () => {
  await nextTick()
  const current = row.value, goal = pos.value?.goal
  if (!current || !goal || current.progress.phase !== 'lesson' || reviewing.value || completedTopic.value || showPass.value
    || goal.opening && !revealed.value) return
  const path = key.value
  await library.updatePath(path, row => position(row).goal?.id === goal.id && row.progress.phase === 'lesson'
    ? recordContact(row.progress, goal.id, 'lesson') : row.progress).catch(report)
}, { immediate: true })

</script>
<template>
  <div class="app-shell">
    <AppBar active="library" :title="t('path.learn')"><RouterLink class="btn btn-secondary btn-sm" to="/learn">{{ t('path.paths') }}</RouterLink></AppBar>
    <main class="workspace path-workspace path-study-workspace">
      <template v-if="row && p && pos">
        <header class="page-heading path-title" :class="{ 'is-compact': reviewing || completedTopic }">
          <div>
            <h1>{{ row.content.title }}</h1>
            <p v-if="!reviewing && !completedTopic" class="page-subtitle">{{ t('path.count', { done: p.passed.length, total: pos.total }) }}</p>
            <progress v-if="!reviewing && !completedTopic" class="path-progress" :value="p.passed.length" :max="pos.total"
              :aria-label="t('path.count', { done: p.passed.length, total: pos.total })" />
          </div>
          <PathFocusTimer :key="key" />
        </header>
        <PathReview v-if="reviewing" :key="key" :row="row" @pause="setReviewRoute(false)" />
        <template v-else>
          <div v-if="hasReview || (!completedTopic && dueCount)" class="path-review-entry">
            <AppIcon name="calendar-days" :size="19" />
            <p>{{ hasReview ? t('path.inReview') : t('path.delayedReview') }}</p>
            <button class="btn btn-secondary btn-sm" :disabled="saving || waiting" @click="openReview">{{ hasReview ? t('path.resumeReview') : t('path.reviewDue', {count: dueCount}) }}</button>
          </div>
          <p v-if="notice && p.phase === 'lesson'" class="path-notice" role="status">{{ notice }}</p>
          <div class="path-layout">
            <PathTopics :key="key" ref="topics" :chapters="row.content.chapters" :progress="p"
              :selected="visitedId ?? pos.goal?.id" :active="pos.goal?.id" :reviews="reviews" :busy="saving"
              :error="topicError" @select="selectTopic" />
            <PathPractice v-if="completedTopic && repeatActivity" :key="repeatActivity.id" ref="repeat"
              :row="row" :objective="completedTopic" :activity="repeatActivity" @back="backToPath" />
            <section v-else-if="completedTopic" class="path-study path-completed-topic">
              <header class="path-step-heading">
                <p class="page-kicker">{{ t('path.passed') }}</p>
                <h2 ref="heading" tabindex="-1">{{ completedTopic.goal }}</h2>
              </header>
              <MathContent :text="completedTopic.explanation" format-bold />
              <div class="path-example"><h3>{{ t('path.worked') }}</h3><MathContent :text="completedTopic.example" format-bold /></div>
              <details v-if="visitedRound" class="path-completed-round">
                <summary>{{ t('path.round.reviewResult') }}</summary>
                <PathRoundSummary @solution="contactResult(completedTopic.id)" :goal="completedTopic" :round="visitedRound" />
              </details>
              <details class="path-practice-options">
                <summary>{{ t('path.practiseAgain') }}</summary>
                <ul>
                  <li v-for="(activity, index) in [...practiceCases(completedTopic), ...completedTopic.checks]" :key="activity.id">
                    <span>{{ index < practiceCases(completedTopic).length
                      ? completedTopic.practiceExtras ? t('path.round.practiceLabel', { number: index + 1 }) : t('path.practice')
                      : t('path.checkVariant', { count: index - practiceCases(completedTopic).length + 1 }) }}</span>
                    <button class="btn btn-secondary btn-sm" type="button" :disabled="saving" @click="repeatTask(activity)">
                      {{ p.practiceDrafts?.some(draft => draft.activityId === activity.id) ? t('path.resumePractice') : t('path.toPractice') }}
                    </button>
                  </li>
                </ul>
              </details>
              <p v-if="notice" class="path-notice" role="status">{{ notice }}</p>
              <button class="btn btn-secondary" @click="backToPath">{{ t('path.backToPath') }}</button>
            </section>
            <section v-else-if="finishedRound && (passGoal || pos.goal)" class="path-study path-round-result" :class="{ 'path-pass': !!passGoal }">
              <PathRoundSummary @solution="contactResult((passGoal || pos.goal)!.id)" ref="roundSummaryView" :goal="(passGoal || pos.goal)!" :round="finishedRound" />
              <details class="path-example" @toggle="($event.target as HTMLDetailsElement).open && contactResult((passGoal || pos.goal)!.id)">
                <summary>{{ t('path.reread') }}</summary>
                <MathContent :text="(passGoal || pos.goal)!.explanation" format-bold />
                <h3>{{ t('path.worked') }}</h3><MathContent :text="(passGoal || pos.goal)!.example" format-bold />
              </details>
              <p v-if="notice" class="path-notice" role="status">{{ notice }}</p>
              <div v-if="passGoal && correctionCases(passGoal, p).length" class="path-example">
                <p>{{ t('path.correction') }}</p>
                <button class="btn btn-secondary" @click="correctPassed">{{ t('path.correctGap') }}</button>
              </div>
              <div v-if="passGoal && pos.goal" class="path-next-objective"><span>{{ t('path.nextObjective') }}</span><strong>{{ pos.goal.goal }}</strong></div>
              <div class="path-actions">
                <button v-if="passGoal" class="btn btn-primary" :disabled="saving" @click="continueFromResult">
                  {{ t(pos.goal ? 'path.continueObjective' : 'path.round.finish') }}
                </button>
                <template v-else>
                  <button class="btn btn-primary" :disabled="saving" @click="change(relearnObjective)">{{ t('path.round.relearn') }}</button>
                  <button class="btn btn-secondary" :disabled="saving" @click="change(advance)">{{ t('path.round.retry') }}</button>
                </template>
              </div>
            </section>
            <section v-else-if="showPass && pos.goal" class="path-study path-pass" aria-labelledby="path-pass-heading">
              <div class="path-result-title"><AppIcon name="check-circle-2" /><h2 id="path-pass-heading" ref="heading" tabindex="-1">{{ t('path.passed') }}</h2></div>
              <PathFeedback @solution="passGoal && contactResult(passGoal.id)" v-if="passAnswer && passActivity" :activity="passActivity" :result="passAnswer" />
              <MathContent v-else :text="passFeedback" format-bold />
              <p v-if="notice" class="path-notice" role="status">{{ notice }}</p>
              <div class="path-next-objective"><span>{{ t('path.nextObjective') }}</span><strong>{{ pos.goal.goal }}</strong></div>
              <button class="btn btn-primary" @click="continueFromResult">{{ t('path.continueObjective') }}</button>
            </section>
            <section v-else-if="pos.goal" class="path-study path-active-study" :aria-label="pos.goal.goal">
              <header class="path-step-heading">
                <p class="page-kicker">{{ pos.chapter?.title }}</p>
                <h2 ref="heading" tabindex="-1">{{ pos.goal.goal }}</h2>
              </header>
              <ol class="path-steps" :aria-label="t('path.studySteps')">
                <li v-for="(phase, index) in (['lesson','practice','check'] as const)" :key="phase"
                  :aria-current="(explanationOpen ? 'lesson' : p.phase) === phase ? 'step' : undefined"
                  :class="{ 'is-done': p.phase === 'check' && phase !== 'check' || p.phase === 'practice' && phase === 'lesson' }">
                  <button v-if="phase === 'lesson' && p.phase !== 'lesson' && !explanationOpen" class="path-step-link" type="button"
                    :aria-label="t('path.reread')" :disabled="saving || validationBusy" @click="revisitExplanation"><span>{{ index + 1 }}</span>{{ t('path.step.lesson') }}</button>
                  <button v-else-if="explanationOpen && phase === p.phase" class="path-step-link" type="button" @click="backToTask">
                    <span>{{ index + 1 }}</span>{{ t(`path.step.${phase}`) }}</button>
                  <template v-else><span>{{ index + 1 }}</span>{{ t(`path.step.${phase}`) }}</template>
                </li>
              </ol>
              <div v-if="p.phase === 'practice' && practiceSet || round" class="path-round-progress">
                <strong>{{ round ? t('path.round.check') : t('path.practice') }}</strong>
                <span>{{ t('path.round.position', { current: round ? roundPosition : p.variant + 1, total: round?.queue.length ?? practiceSet?.length ?? 0 }) }}</span>
                <span v-if="round?.repeated.includes(pos.activity?.id ?? '')" class="path-round-repeat">{{ t('path.round.repeated') }}</span>
              </div>
              <template v-if="p.phase === 'lesson'">
                <div v-if="pos.goal.opening && !revealed" class="path-opening">
                  <h3>{{ t('path.optionalRecall') }}</h3>
                  <MathContent :text="pos.goal.opening.question" format-bold />
                </div>
                <template v-else>
                  <div v-if="pos.goal.opening" ref="openingAnswer" tabindex="-1" class="path-opening">
                    <h3>{{ t('path.openingAnswer') }}</h3>
                    <MathContent :text="pos.goal.opening.answer" format-bold />
                  </div>
                  <MathContent :text="pos.goal.explanation" format-bold />
                  <div class="path-example"><h3>{{ t('path.worked') }}</h3><MathContent :text="pos.goal.example" format-bold /></div>
                  <details><summary>{{ t('path.source') }}</summary><p><MathContent :text="pos.goal.source" format-bold /></p><p><MathContent :text="pos.goal.evidence" format-bold /></p></details>
                </template>
                <div class="path-actions">
                  <button v-if="pos.goal.opening && !revealed" class="btn btn-primary" @click="revealOpening">{{ t('path.showLesson') }}</button>
                  <button class="btn" :class="pos.goal.opening && !revealed ? 'btn-quiet' : 'btn-primary'" :disabled="saving" @click="change(advance)">
                    {{ t('path.toPractice') }}
                  </button>
                </div>
              </template>
              <template v-else-if="pos.activity">
                <section v-if="explanationOpen" class="path-explanation">
                  <h3 ref="explanationHeading" tabindex="-1">{{ t('path.lesson') }}</h3>
                  <MathContent :text="pos.goal.explanation" format-bold />
                  <div class="path-example"><h3>{{ t('path.worked') }}</h3><MathContent :text="pos.goal.example" format-bold /></div>
                  <p v-if="p.phase === 'check'" role="status">{{ t(round ? 'path.round.assisted' : 'path.assisted') }}</p>
                  <button class="btn btn-primary" @click="backToTask">{{ t('path.backToTask') }}</button>
                </section>
                <div v-show="!explanationOpen" ref="taskPanel" class="path-task-panel" @focusin="rememberAnswerFocus">
                  <p v-if="pos.goal.requiredEvidence === 'code'" role="status">{{ t('path.code.required') }}</p>
                  <p v-if="independent && p.outcome === 'open'">{{ t(round ? 'path.round.independent' : 'path.independent') }}</p>
                  <p v-if="p.phase === 'check' && p.help !== 'none' && !activeAnswer" role="status">{{ t(round ? 'path.round.assisted' : 'path.assisted') }}</p>
                  <div v-if="p.outcome === 'open' && (writtenReady && !roundWrittenRestricted || p.mode === 'written')" class="path-format" role="group" :aria-label="t('path.answerFormat')">
                    <span>{{ t('path.answerFormat') }}</span>
                    <div class="path-actions">
                      <button class="btn btn-secondary btn-sm" :aria-pressed="p.mode === 'local'" :disabled="saving"
                        @click="switchMode('local')">{{ t('path.local') }}</button>
                      <button v-if="writtenReady && !roundWrittenRestricted" class="btn btn-secondary btn-sm" :aria-pressed="p.mode === 'written'" :disabled="saving"
                        @click="switchMode('written')">{{ t(writtenInput === 'code' ? 'path.writtenCode' : writtenInput === 'formula' ? 'path.writtenFormula' : 'path.written') }}</button>
                    </div>
                  </div>
                  <div v-show="p.mode === 'local'" ref="localResponse" class="path-local-response">
                    <details v-if="p.prose">
                      <summary>{{ t('path.savedText') }}</summary>
                      <p v-if="writtenInput === 'text'">{{ p.prose }}</p>
                      <PathAnswerContent v-else :text="p.prose" :format="writtenInput" />
                    </details>
                    <TaskQuestion v-if="pos.activity.task.kind !== 'cloze'" :card="{front:pos.activity.question,task:pos.activity.task}" interactive format-bold />
                    <TaskResponse v-if="answer" :key="questionKey" :front="pos.activity.question" :task="pos.activity.task" :model-value="answer"
                      :construct-order="p.orderingInput === 'construct'" :disabled="p.mode !== 'local' || saving || p.outcome !== 'open'"
                      :invalid-numeric-gaps="invalidNumericGaps" format-bold @update:model-value="setAnswer" @submit="localCheck" />
                  </div>
                  <div v-if="p.mode === 'written' && pos.activity.written" class="path-written-response">
                    <template v-if="writtenReady || p.outcome !== 'open'">
                      <template v-if="writtenInput === 'formula'">
                        <p :id="formulaPromptId"><MathContent :text="pos.activity.written.question" format-bold /></p>
                        <MathInput :key="questionKey" :model-value="prose" :label="t('path.formulaAnswer')"
                          :described-by="formulaPromptId"
                          :maxlength="AI_TEXT_LIMIT" enforce-maxlength :disabled="waiting || saving || p.outcome !== 'open'"
                          @update:model-value="setProse" @submit="writtenCheck" />
                      </template>
                      <template v-else>
                        <label v-if="writtenInput === 'code'" for="written-answer" class="path-code-answer">{{ pos.activity.written.question }}</label>
                        <label v-else for="written-answer"><MathContent :text="pos.activity.written.question" format-bold /></label>
                        <textarea id="written-answer" v-model="prose" class="textarea" :class="{ 'path-code-answer': writtenInput === 'code' }"
                          :maxlength="AI_TEXT_LIMIT" :rows="writtenInput === 'code' ? 7 : 4"
                          :spellcheck="writtenInput === 'code' ? false : undefined" :autocapitalize="writtenInput === 'code' ? 'off' : undefined"
                          :disabled="waiting || saving || p.outcome !== 'open'" @keydown="codeKeydown" @paste="checkCodePaste" @input="codePasteRejected = false; scheduleDraft()" />
                        <p v-if="codePasteRejected" role="alert" class="form-error">{{ t('path.codePasteTooLong', { limit: AI_TEXT_LIMIT }) }}</p>
                      </template>
                      <template v-if="writtenInput === 'code'">
                        <p>{{ t('path.code.description') }} {{ pos.activity.written.language || t('path.code.unspecified') }}</p>
                        <p>{{ t('path.code.keyboard') }}</p>
                        <p v-if="!validCode && !codePracticeOnly">{{ t('path.code.validationConsent') }}</p>
                        <button v-if="!validCode && !codePracticeOnly" class="btn btn-secondary" :disabled="saving || waiting || validationBusy" @click="validateCode">{{ t(validationBusy ? 'path.waiting' : 'path.code.validate') }}</button>
                        <p v-else-if="validCode" role="status">{{ t('path.code.validated') }}</p>
                      </template>
                      <small>{{ t(writtenInput === 'code' ? 'path.aiConsentCode' : 'path.aiConsent') }}</small>
                      <p v-if="pos.activity.written.practiceOnly || p.practiceOnly.includes(pos.activity.id)">{{ t('path.unreliable') }}</p>
                    </template>
                    <p v-else role="status">{{ t(aiReadiness === 'checking' ? 'path.aiChecking' : 'path.aiUnavailable') }}</p>
                  </div>
                  <div v-if="p.help === 'hint' && (!round || !activeAnswer) || p.help === 'solution' && !activeAnswer" class="path-example">
                    <PathAnswerContent v-if="p.help === 'solution'" v-bind="solution" format-bold />
                    <MathContent v-else :text="pos.activity.hint" format-bold />
                  </div>
                  <PathFeedback @solution="contactResult(pos.goal.id)" v-if="activeAnswer" ref="answerFeedback" :activity="pos.activity" :result="activeAnswer"
                    :detailed="!round || activeAnswer.verdict === 'revealed'"
                    :show-solution="p.phase !== 'practice' || p.outcome === 'next'" />
                  <div v-else-if="p.feedback" ref="resultBox" class="path-feedback" role="status" tabindex="-1"><MathContent :text="p.feedback" format-bold /></div>
                  <p v-if="notice" class="path-notice" role="status">{{ notice }}</p>
                  <div v-if="p.outcome === 'open'" class="path-response-actions">
                    <button v-if="p.mode === 'local' || writtenReady" class="btn btn-primary" :disabled="saving || waiting || validationBusy || (p.mode === 'written' && (!prose.trim() || writtenInput === 'code' && !validCode && !codePracticeOnly))" @click="p.mode === 'local' ? localCheck() : writtenCheck()">{{ waiting ? t('path.waiting') : t(writtenInput === 'code' && p.mode === 'written' ? 'path.code.submit' : 'path.submit') }}</button>
                  </div>
                    <div class="path-actions path-help" role="group" :aria-label="t('path.help')">
                      <button v-if="p.outcome === 'open' && p.phase === 'practice' && activeAnswer" class="btn btn-secondary btn-sm" :disabled="saving"
                        @click="backToTask">{{ t('path.feedback.revise') }}</button>
                      <button v-if="p.outcome === 'open'" class="btn btn-quiet btn-sm" :disabled="saving" @click="useHelp('hint')">{{ t('path.hint') }}</button>
                      <button class="btn btn-secondary btn-sm" :disabled="saving" :aria-describedby="p.phase === 'check' && p.outcome === 'open' ? 'path-explanation-notice' : undefined"
                        @click="revisitExplanation">{{ t('path.reread') }}</button>
                      <button v-if="p.outcome === 'open' && (p.phase !== 'practice' || !practiceSet || activeAnswer)" class="btn btn-quiet btn-sm"
                        :disabled="saving" @click="useHelp('solution')">{{ t('path.solution') }}</button>
                    </div>
                  <p v-if="p.phase === 'check' && p.outcome === 'open'" id="path-explanation-notice" class="path-notice">
                    {{ t(round ? 'path.round.help' : 'path.helpBeforeCheck') }}
                  </p>
                  <template v-if="p.outcome !== 'open'">
                    <details v-if="!activeAnswer && p.outcome === 'retry' && p.help !== 'solution' && !feedbackContainsSolution" :key="token" class="path-example">
                      <summary>{{ t('path.solution') }}</summary>
                      <PathAnswerContent v-bind="solution" format-bold />
                    </details>
                    <p v-if="practiceLast && pos.goal.selfCheckSize" class="path-round-brief">
                      {{ t('path.round.required', { total: pos.goal.selfCheckSize, required: selfCheckRequired(pos.goal.selfCheckSize) }) }}
                    </p>
                    <button class="btn btn-primary" :disabled="saving" @click="change(advance)">
                      {{ t(round ? 'path.round.nextCheck' : p.outcome === 'next' ? afterPractice : 'path.retry') }}
                    </button>
                  </template>
                </div>
              </template>
            </section>
            <section v-else class="path-study path-pass">
              <div class="path-result-title"><AppIcon name="check-circle-2" /><h2 ref="heading" tabindex="-1">{{ t('path.complete') }}</h2></div>
              <PathFeedback @solution="passGoal && contactResult(passGoal.id)" v-if="passAnswer && passActivity" :activity="passActivity" :result="passAnswer" />
              <div v-else-if="passFeedback" class="path-feedback"><strong>{{ t('path.passed') }}</strong><MathContent :text="passFeedback" format-bold /></div>
              <RouterLink class="btn btn-secondary" to="/learn">{{ t('path.paths') }}</RouterLink>
            </section>
          </div>
          <details class="path-outline path-tools"><summary>{{ t('path.actions') }}</summary>
            <p v-if="actionNotice" class="path-notice" role="status">{{ actionNotice }}</p>
            <details class="path-quality"><summary>{{ t('path.quality.title') }} ({{ pathQuality(row.content).length }})</summary><p>{{ t('path.quality.note') }}</p>
              <ul><li v-for="issue in pathQuality(row.content)" :key="issue.objectiveId + issue.key">{{ issue.goal }}: {{ t(issue.key) }}</li></ul></details>
            <button class="btn btn-secondary btn-sm" @click="share">{{ t('path.share') }}</button>
            <details v-if="availableCards.length" class="path-transfer">
              <summary>{{ t('path.transfer') }} ({{ availableCards.length }})</summary>
              <label v-for="c in availableCards" :key="c.id" class="task-choice"><input v-model="chosen" type="checkbox" :value="c.id">{{ c.front }}</label>
              <label class="field-label" for="path-target">{{ t('path.target') }}</label>
              <select id="path-target" v-model="target" class="select-input"><option value="">{{ t('path.newDeck') }}</option><option v-for="d in library.decks" :key="d.id" :value="d.id">{{ d.name }}</option></select>
              <button class="btn btn-secondary" :disabled="saving || !chosen.length" @click="transfer">{{ t('path.addCards') }}</button>
            </details>
          </details>
        </template>
      </template>
      <p v-else>{{ t('path.missing') }}</p>
    </main>
  </div>
</template>
