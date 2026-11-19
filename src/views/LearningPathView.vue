<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute } from 'vue-router'
import AppBar from '../components/AppBar.vue'
import MathContent from '../components/MathContent.vue'
import TaskResponse from '../components/TaskResponse.vue'
import TaskQuestion from '../components/TaskQuestion.vue'
import { useI18n } from '../i18n'
import { useLibraryStore } from '../stores/library'
import { pathKey, type Progress, type SavedPath } from '../../shared/learning-paths.mjs'
import { parseNumeric } from '../../shared/tasks.mjs'
import { advance, assist, attemptKey, completeOrderingCheck, gradeLocal, gradeWritten, position } from '../domain/learningPath'
import { fieldValue, responseError } from '../domain/tasks'
import type { StudyResponse } from '../domain/types'
import { getAiBridge } from '../services/ai'
import { saveExport } from '../services/native'
import { clearDraftBackup, isCurrentBackup, matchesBackupBase, matchesDraft, readDraftBackup, writeDraftBackup,
  type DraftBackup, type DraftPatch } from '../services/storage/pathDraftBackup'

const { t, locale } = useI18n(), library = useLibraryStore(), route = useRoute()
const key = computed(() => String(route.params.key))
const row = computed(() => library.data.learningPaths?.find(entry => pathKey(entry.content) === key.value))
const pos = computed(() => row.value && position(row.value))
const p = computed(() => row.value?.progress)
const independent = computed(() => p.value?.phase === 'check' && p.value.help === 'none'
  && (p.value.mode === 'local' || (!pos.value?.activity?.written?.practiceOnly && !p.value.practiceOnly.includes(pos.value!.activity!.id))))
const token = computed(() => row.value ? attemptKey(row.value) : '')
const questionKey = computed(() => JSON.stringify([key.value, pos.value?.goal?.id, pos.value?.activity?.id]))
const answer = ref<StudyResponse>(), prose = ref(''), notice = ref(''), saving = ref(false), waiting = ref(false)
const invalidNumericGaps = ref<string[]>([])
const localResponse = ref<HTMLElement>()
const aiReadiness = ref<'checking' | 'ready' | 'unavailable'>('unavailable')
const writtenReady = computed(() => aiReadiness.value === 'ready')
const resultBox = ref<HTMLElement>()
const heading = ref<HTMLElement>(), chosen = ref<string[]>([]), target = ref('')
const openLessons = ref(new Set<string>())
watch(key, () => openLessons.value.clear(), { flush: 'sync' })
function toggleLesson(id: string, event: Event) {
  const details = event.currentTarget as HTMLDetailsElement
  if (details.open) openLessons.value.add(id)
  else openLessons.value.delete(id)
}
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
watch(questionKey, () => { invalidNumericGaps.value = [] }, { flush: 'sync' })
watch([questionKey, () => p.value?.mode], async () => { await nextTick(); heading.value?.focus() })
watch(questionKey, async (_, _previous, onCleanup) => {
  const ai = getAiBridge()
  aiReadiness.value = 'unavailable'
  if (!pos.value?.activity?.written || !ai?.evaluateCriteria) return
  let active = true
  onCleanup(() => { active = false })
  aiReadiness.value = 'checking'
  try {
    const status = await ai.getAiStatus()
    if (active) aiReadiness.value = status.available && status.configured ? 'ready' : 'unavailable'
  } catch {
    if (active) aiReadiness.value = 'unavailable'
  }
}, { immediate: true, flush: 'sync' })
watch(() => p.value?.outcome, async outcome => {
  if (outcome && outcome !== 'open') { await nextTick(); resultBox.value?.focus() }
})
watch(key, () => { chosen.value = []; target.value = '' })
const onHide = () => { if (document.visibilityState === 'hidden') void flushDraft().catch(report) }
function onPageHide() { void flushDraft().catch(report) }
window.addEventListener('pagehide', onPageHide)
async function saveBeforeNavigating() {
  try { await flushDraft() } catch (error) { report(error); return false }
}
onBeforeRouteLeave(saveBeforeNavigating)
onBeforeRouteUpdate((to, from) => {
  if (to.params.key !== from.params.key) return saveBeforeNavigating()
})
document.addEventListener('visibilitychange', onHide)
onBeforeUnmount(() => {
  request++
  window.removeEventListener('pagehide', onPageHide)
  document.removeEventListener('visibilitychange', onHide)
  setUnsafeDraft()
  void flushDraft().catch(report)
})

async function change(action: (current: SavedPath) => Progress) {
  if (saving.value || !row.value) return
  const path = key.value, expected = token.value
  notice.value = ''
  saving.value = true
  try {
    await flushDraft()
    await library.updatePath(path, current => attemptKey(current) === expected ? action(current) : current.progress)
  } catch (e) { report(e) }
  finally { saving.value = false }
}
function useHelp(help: Exclude<Progress['help'],'none'>) {
  request++
  waiting.value = false
  return change(current => assist(current, help))
}
function switchMode(mode: Progress['mode']) {
  if (mode === 'written' && !writtenReady.value) return
  request++
  waiting.value = false
  return change(({ progress }) => ({ ...progress, mode, attempt: progress.attempt + 1 }))
}
async function localCheck() {
  const value = answer.value, activity = pos.value?.activity, active = row.value
  if (!value || !activity || !active || saving.value || active.progress.mode !== 'local' || active.progress.outcome !== 'open') return
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
  if (!active || !written || !writtenReady.value || !prose.value.trim() || waiting.value || saving.value) return
  const submitted = prose.value, expected = token.value, path = key.value, serial = ++request
  waiting.value = true
  notice.value = ''
  try {
    await flushDraft()
    if (request !== serial) return
    if (!evaluate) throw new Error()
    const result = await evaluate({ deckName: active.content.title, question: written.question, language: locale.value,
      referenceAnswer: written.reference, userAnswer: submitted, criteria: written.criteria.map(({id, description}) => ({id, description})) })
    if (request !== serial) return
    if (!result.ok || !result.result) throw new Error()
    const criteria = result.result.criteria
    await library.updatePath(path, current => {
      if (request !== serial) return current.progress
      const next = gradeWritten(current, expected, submitted, criteria)
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
  catch (e) { report(e) }
}
async function transfer() {
  if (saving.value) return
  saving.value = true
  try { await library.transferCards(key.value, chosen.value, target.value); chosen.value = []; notice.value = t('path.transferred') }
  catch (e) { report(e) } finally { saving.value = false }
}
</script>
<template>
  <div class="app-shell">
    <AppBar active="library" :title="t('path.learn')"><RouterLink class="btn btn-secondary btn-sm" to="/learn">{{ t('path.paths') }}</RouterLink></AppBar>
    <main class="workspace path-workspace">
      <template v-if="row && p && pos">
        <header class="page-heading"><div><h1>{{ row.content.title }}</h1><p class="page-subtitle">{{ t('path.count', { done:p.passed.length,total:pos.total }) }}</p></div>
          <button class="btn btn-secondary btn-sm" @click="share">{{ t('path.share') }}</button></header>
        <details :key="key" class="path-outline"><summary>{{ t('path.outline') }}</summary>
          <ol><li v-for="chapter in row.content.chapters" :key="chapter.id"><strong>{{ chapter.title }}</strong>
            <p v-if="!chapter.objectives.some(g => g.id === pos?.goal?.id || p!.passed.includes(g.id))">{{ t('path.locked') }}</p>
            <ul><li v-for="g in chapter.objectives" :key="g.id">{{ g.goal }} <span v-if="p.passed.includes(g.id)">✓ {{ t('path.passed') }}</span>
              <details v-if="p.passed.includes(g.id)" @toggle="toggleLesson(g.id, $event)">
                <summary>{{ t('path.lesson') }}</summary>
                <template v-if="openLessons.has(g.id)">
                  <MathContent :text="g.explanation" />
                  <MathContent :text="g.example" />
                </template>
              </details>
            </li></ul>
          </li></ol>
        </details>
        <section v-if="pos.goal" class="path-study" :aria-label="pos.goal.goal">
          <p class="page-kicker">{{ pos.chapter?.title }} · {{ t(p.phase === 'lesson' ? 'path.lesson' : independent ? 'path.check' : 'path.practice') }}</p>
          <h2 ref="heading" tabindex="-1">{{ pos.goal.goal }}</h2>
          <template v-if="p.phase === 'lesson'">
            <p v-if="p.feedback" role="status" class="path-feedback"><strong>{{ t('path.passed') }}</strong><br>{{ p.feedback }}</p>
            <MathContent :text="pos.goal.explanation" />
            <div class="path-example"><h3>{{ t('path.worked') }}</h3><MathContent :text="pos.goal.example" /></div>
            <details><summary>{{ t('path.source') }}</summary><p>{{ pos.goal.source }}</p><p>{{ pos.goal.evidence }}</p></details>
            <button class="btn btn-primary" :disabled="saving" @click="change(advance)">{{ t('path.toPractice') }}</button>
          </template>
          <template v-else-if="pos.activity">
            <p v-if="independent">{{ t('path.independent') }}</p>
            <p v-if="p.phase === 'check' && p.help !== 'none'" role="status">{{ t('path.assisted') }}</p>
            <div v-show="p.mode === 'local'" ref="localResponse" class="path-local-response">
              <details v-if="p.prose"><summary>{{ t('path.savedText') }}</summary><p>{{ p.prose }}</p></details>
              <TaskQuestion v-if="pos.activity.task.kind !== 'cloze'" :card="{front:pos.activity.question,task:pos.activity.task}" interactive />
              <TaskResponse v-if="answer" :key="questionKey" :front="pos.activity.question" :task="pos.activity.task" :model-value="answer"
                :construct-order="p.orderingInput === 'construct'" :disabled="p.mode !== 'local' || saving || p.outcome !== 'open'"
                :invalid-numeric-gaps="invalidNumericGaps" @update:model-value="setAnswer" @submit="localCheck" />
            </div>
            <template v-if="p.mode === 'written' && pos.activity.written">
              <template v-if="writtenReady || p.outcome !== 'open'">
                <label for="written-answer"><MathContent :text="pos.activity.written.question" /></label>
                <textarea id="written-answer" v-model="prose" class="textarea" maxlength="4000" rows="4" :disabled="waiting || saving || p.outcome !== 'open'" @input="scheduleDraft" />
                <small>{{ t('path.aiConsent') }}</small>
                <p v-if="pos.activity.written.practiceOnly || p.practiceOnly.includes(pos.activity.id)">{{ t('path.unreliable') }}</p>
              </template>
              <p v-else role="status">{{ t(aiReadiness === 'checking' ? 'path.aiChecking' : 'path.aiUnavailable') }}</p>
            </template>
            <div v-if="p.help !== 'none'" class="path-example"><MathContent :text="p.help === 'hint' ? pos.activity.hint : p.help === 'lesson' ? pos.goal.explanation + '\n\n' + pos.goal.example : pos.activity.solution" /></div>
            <div v-if="p.feedback" ref="resultBox" class="path-feedback" role="status" tabindex="-1"><MathContent :text="p.feedback" /></div>
            <div v-if="p.outcome === 'open'" class="path-actions">
              <button v-if="p.mode === 'local' || writtenReady" class="btn btn-primary" :disabled="saving || waiting || (p.mode === 'written' && !prose.trim())" @click="p.mode === 'local' ? localCheck() : writtenCheck()">{{ waiting ? t('path.waiting') : t('path.submit') }}</button>
              <button v-if="p.mode === 'written'" class="btn" :class="writtenReady ? 'btn-secondary' : 'btn-primary'" :disabled="saving" @click="switchMode('local')">{{ t('path.local') }}</button>
              <button v-else-if="writtenReady" class="btn btn-secondary" :disabled="saving" @click="switchMode('written')">{{ t('path.written') }}</button>
            </div>
            <div v-if="p.outcome === 'open'" class="path-actions">
              <button v-for="help in (['hint','lesson','solution'] as const)" :key="help" class="btn btn-secondary btn-sm" :disabled="saving" @click="useHelp(help)">{{ t(help === 'hint' ? 'path.hint' : help === 'lesson' ? 'path.reread' : 'path.solution') }}</button>
            </div>
            <template v-else>
              <details v-if="p.outcome === 'retry' && p.help !== 'solution' && !p.feedback.includes(pos.activity.solution)" :key="token" class="path-example">
                <summary>{{ t('path.solution') }}</summary>
                <MathContent :text="pos.activity.solution" />
              </details>
              <button class="btn btn-primary" :disabled="saving" @click="change(advance)">{{ t(p.outcome === 'next' ? 'path.toCheck' : 'path.retry') }}</button>
            </template>
          </template>
        </section>
        <section v-else class="path-study"><h2 ref="heading" tabindex="-1">{{ t('path.complete') }}</h2><MathContent v-if="p.feedback" :text="p.feedback" /></section>
        <details v-if="availableCards.length" class="path-outline"><summary>{{ t('path.transfer') }}</summary>
          <label v-for="c in availableCards" :key="c.id" class="task-choice"><input v-model="chosen" type="checkbox" :value="c.id">{{ c.front }}</label>
          <label class="field-label" for="path-target">{{ t('path.target') }}</label>
          <select id="path-target" v-model="target" class="select-input"><option value="">{{ t('path.newDeck') }}</option><option v-for="d in library.decks" :key="d.id" :value="d.id">{{ d.name }}</option></select>
          <button class="btn btn-secondary" :disabled="saving || !chosen.length" @click="transfer">{{ t('path.addCards') }}</button>
        </details>
      </template>
      <p v-else>{{ t('path.missing') }}</p>
      <p role="status" aria-live="polite">{{ notice }}</p>
    </main>
  </div>
</template>
