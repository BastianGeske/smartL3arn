<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { pathKey, type Progress, type SavedPath } from '../../shared/learning-paths.mjs'
import { usePathDraftWrite } from '../composables/usePathDraftWrite'
import { recordContact } from '../domain/pathEvidence'
import { gradeReview, nextReview, reviewAnswerError, reviewPosition } from '../domain/pathReview'
import { localPathResult } from '../domain/pathFeedback'
import type { StudyResponse } from '../domain/types'
import { useI18n } from '../i18n'
import { useLibraryStore } from '../stores/library'
import { clearDraftBackup, isCurrentBackup, matchesBackupBase, readDraftBackup, reviewBackupKey, writeDraftBackup,
  type DraftBackup, type DraftPatch } from '../services/storage/pathDraftBackup'
import PathFeedback from './PathFeedback.vue'
import MathContent from './MathContent.vue'
import TaskQuestion from './TaskQuestion.vue'
import TaskResponse from './TaskResponse.vue'

const emit = defineEmits<{pause: []}>()
const props = defineProps<{ row: SavedPath }>()
const { t } = useI18n(), library = useLibraryStore()
const pos = computed(() => reviewPosition(props.row))
const session = computed(() => pos.value.session!)
const activity = computed(() => pos.value.activity!)
const answer = ref<StudyResponse>(session.value.draft)
const busy = ref(false), message = ref(''), explanationOpen = ref(false)
const explanationHeading = ref<HTMLElement>(), taskArea = ref<HTMLElement>()
let previousAnswerControl: HTMLElement | undefined
const heading = ref<HTMLHeadingElement>(), result = ref<InstanceType<typeof PathFeedback>>()
const feedback = computed(() => session.value?.outcome !== 'open' && activity.value
  ? localPathResult(activity.value, session.value.draft, session.value.assisted, session.value.revealed) : undefined)
onMounted(() => heading.value?.focus())
const token = computed(() => JSON.stringify([pathKey(props.row.content), session.value?.queue, session.value?.activityId, session.value?.retry]))
watch(token, async () => {
  explanationOpen.value = false
  if (session.value) answer.value = session.value.draft
  message.value = ''
  await nextTick()
  heading.value?.focus()
})
watch(() => session.value?.outcome, async outcome => {
  if (!outcome || outcome === 'open') return
  await nextTick()
  result.value?.focus()
})
function update(action: (row: SavedPath) => Progress) {
  const expected = session.value
  return library.updatePath(pathKey(props.row.content), current => {
    const s = current.progress.reviewSession
    return s && s.activityId === expected.activityId && s.retry === expected.retry && s.outcome === expected.outcome
      ? action(current) : current.progress
  })
}
const backupKey = reviewBackupKey(pathKey(props.row.content))
interface Edit { patch: DraftPatch; backup?: DraftBackup; recovered?: boolean; token: string }
function report(error: unknown) { message.value = error instanceof Error ? error.message : t('path.saveFailed') }
const { flush, queue, recover, writingEdit } = usePathDraftWrite<Edit>(async edit => {
  await update(row => {
    const current = row.progress.reviewSession
    if (!current || current.outcome !== 'open' || token.value !== edit.token) return row.progress
    if (edit.recovered && edit.backup && (!isCurrentBackup(backupKey, edit.backup.id) || !matchesBackupBase(row, edit.backup, true))) return row.progress
    return { ...row.progress, reviewSession: { ...current, draft: edit.patch.draft } }
  })
  if (edit.backup) clearDraftBackup(backupKey, edit.backup.id)
}, report)
function edit(value: StudyResponse) {
  answer.value = value
  message.value = ''
  const patch = { prose: '', draft: value }
  const inFlight = writingEdit()
  let backup: DraftBackup | undefined
  try { backup = writeDraftBackup(backupKey, props.row, patch, inFlight?.token === token.value ? inFlight.patch : undefined, true) }
  catch { /* The draft writer warns before unload while the edit is unsafe. */ }
  queue({ patch, backup, token: token.value })
}
const recovered = readDraftBackup(backupKey, props.row, true)
if (recovered) {
  answer.value = recovered.patch.draft
  recover({ patch: recovered.patch, backup: recovered, recovered: true, token: token.value })
}
async function beforeLeave() {
  try { await flush() } catch (error) { report(error); return false }
}
async function pause() {
  if (await beforeLeave() !== false) emit('pause')
}
onBeforeRouteLeave(beforeLeave)
onBeforeRouteUpdate(beforeLeave)
async function change(action: (row: SavedPath) => Progress) {
  if (busy.value) return
  busy.value = true
  message.value = ''
  try { await flush(); await update(action) } catch (error) { report(error) }
  finally { busy.value = false }
}
function submit(reveal = false) {
  if (explanationOpen.value) return
  const value = answer.value
  const error = !reveal && reviewAnswerError(activity.value.task, value)
  if (error) { message.value = t(error); return }
  return change(row => gradeReview(row, value, reveal))
}
function hint() {
  return change(({progress}) => ({ ...recordContact(progress, session.value.queue[0]!, 'practice'), reviewSession: { ...progress.reviewSession!, assisted: true, hintRevealed: true } }))
}
async function consultLesson() {
  if (busy.value) return
  const before = document.activeElement
  if (before instanceof HTMLElement && taskArea.value?.contains(before) && before.matches('input,select,textarea')) previousAnswerControl = before
  busy.value = true
  message.value = ''
  try {
    await flush()
    await update(({ progress }) => ({ ...recordContact(progress, session.value.queue[0]!, 'lesson'),
      reviewSession: { ...progress.reviewSession!, assisted: progress.reviewSession!.outcome === 'open' || progress.reviewSession!.assisted } }))
    explanationOpen.value = true
    await nextTick()
    explanationHeading.value?.focus()
  } catch (error) { report(error) }
  finally { busy.value = false }
}
async function backToAnswer() {
  explanationOpen.value = false
  await nextTick()
  if (session.value.outcome !== 'open') { result.value?.focus(); return }
  const control = previousAnswerControl?.isConnected && !previousAnswerControl.matches(':disabled') ? previousAnswerControl
    : taskArea.value?.querySelector<HTMLElement>('input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')
  ;(control ?? heading.value)?.focus()
}
</script>
<template>
  <section v-if="session && activity" class="path-study path-review">
    <header class="path-review-heading">
      <div class="path-step-heading">
        <p class="page-kicker">{{ t('path.delayedReview') }}</p>
        <h2 ref="heading" tabindex="-1">{{ t(session.retry ? 'path.reviewPractice' : 'path.review') }}</h2>
        <p v-if="!session.retry">{{ t('path.remaining', {count: session.queue.length}) }}</p>
      </div>
      <button class="btn btn-quiet btn-sm" :disabled="busy" @click="pause">{{ t('path.pauseReview') }}</button>
    </header>
    <button v-if="!explanationOpen" class="btn btn-secondary btn-sm path-review-lesson" :disabled="busy" @click="consultLesson">{{ t('path.reread') }}</button>
    <section v-if="explanationOpen && pos.goal" class="path-explanation">
      <h3 ref="explanationHeading" tabindex="-1">{{ t('path.lesson') }}</h3>
      <MathContent :text="pos.goal.explanation" format-bold />
      <div class="path-example"><h3>{{ t('path.worked') }}</h3><MathContent :text="pos.goal.example" format-bold /></div>
      <p v-if="session.outcome === 'open'">{{ t('path.reviewAssisted') }}</p>
      <button class="btn btn-primary" @click="backToAnswer">{{ t('path.backToTask') }}</button>
    </section>
    <div v-show="!explanationOpen" ref="taskArea" class="path-task-panel">
    <p v-if="session.assisted">{{ t('path.retention.exposure') }}</p>
    <p v-if="pos.goal?.requiredEvidence === 'code'">{{ t('path.code.required') }}</p>
    <TaskQuestion v-if="activity.task.kind !== 'cloze'" :card="{front:activity.question, task:activity.task}" interactive format-bold />
    <TaskResponse :key="token" :front="activity.question" :task="activity.task" :model-value="answer" construct-order
      :disabled="busy || session.outcome !== 'open'" format-bold @update:model-value="edit" @submit="submit()" />
    <template v-if="session.outcome === 'open'">
      <div v-if="session.hintRevealed" class="path-opening">
        <strong>{{ t('path.reviewAssisted') }}</strong>
        <MathContent :text="activity.hint" format-bold />
      </div>
      <div class="path-response-actions">
        <button class="btn btn-primary" :disabled="busy" @click="submit()">{{ t('path.submit') }}</button>
        <div class="path-actions path-help" role="group" :aria-label="t('path.help')">
          <button class="btn btn-quiet btn-sm" :disabled="busy || session.hintRevealed" @click="hint">{{ t('path.hint') }}</button>
          <button class="btn btn-quiet btn-sm" :disabled="busy" @click="submit(true)">{{ t('path.solution') }}</button>
        </div>
      </div>
    </template>
    <template v-else>
      <p>{{ pos.goal?.goal }} · {{ t(`path.case.${session.caseType}`) }}</p>
      <PathFeedback v-if="feedback" ref="result" :activity="activity" :result="feedback" />
      <div class="path-actions">
        <button class="btn btn-primary" :disabled="busy" @click="change(row => nextReview(row))">{{ t(session.queue.length > 1 ? 'path.nextReview' : 'path.finishReview') }}</button>
        <button v-if="!session.retry && (session.assisted || session.outcome === 'incorrect')" class="btn btn-secondary" :disabled="busy"
          @click="change(row => nextReview(row, true))">{{ t('path.reviewPractice') }}</button>
      </div>
    </template>
    </div>
    <p v-if="message" role="alert">{{ message }}</p>
  </section>
</template>
