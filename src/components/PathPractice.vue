<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { pathKey, type Activity, type Objective, type SavedPath } from '../../shared/learning-paths.mjs'
import { usePathDraftWrite } from '../composables/usePathDraftWrite'
import { reviewAnswerError } from '../domain/pathReview'
import { initialResponse } from '../domain/tasks'
import { localPathResult } from '../domain/pathFeedback'
import type { StudyResponse } from '../domain/types'
import { useI18n } from '../i18n'
import { useLibraryStore } from '../stores/library'
import {
  clearDraftBackup, clearPathDraftBackup, isCurrentBackup, matchesBackupBase, practiceBackupKey, readDraftBackup, writeDraftBackup,
  type DraftBackup, type DraftPatch,
} from '../services/storage/pathDraftBackup'
import PathFeedback from './PathFeedback.vue'
import TaskQuestion from './TaskQuestion.vue'
import TaskResponse from './TaskResponse.vue'

const props = defineProps<{ row: SavedPath; objective: Objective; activity: Activity }>()
const emit = defineEmits<{ back: [] }>()
const { t } = useI18n(), library = useLibraryStore()
const path = pathKey(props.row.content), activityId = props.activity.id
const scope = { activityId }
const backupKey = practiceBackupKey(path, activityId)
const constructOrder = props.activity.task.kind === 'ordering' && props.objective.checks.some(check => check.id === activityId)
const blank = (): StudyResponse => constructOrder ? { kind: 'order', ids: [] } : initialResponse(props.activity.task)
const answer = ref(props.row.progress.practiceDrafts?.find(draft => draft.activityId === activityId)?.draft ?? blank())
const heading = ref<HTMLElement>(), resultView = ref<InstanceType<typeof PathFeedback>>()
const error = ref(''), busy = ref(false), result = ref<ReturnType<typeof localPathResult>>()
const inputVersion = ref(0)

interface Edit { patch: DraftPatch; backup?: DraftBackup; recovered?: boolean }
function report(reason: unknown) { error.value = reason instanceof Error ? reason.message : t('path.saveFailed') }

const { flush, queue, recover, writingEdit } = usePathDraftWrite<Edit>(async edit => {
  await library.updatePath(path, row => {
    if (edit.recovered && edit.backup && (!isCurrentBackup(backupKey, edit.backup.id) || !matchesBackupBase(row, edit.backup, scope))) return row.progress
    const drafts = row.progress.practiceDrafts ?? []
    return { ...row.progress, practiceDrafts: [...drafts.filter(draft => draft.activityId !== activityId), { activityId, draft: edit.patch.draft }] }
  })
  if (edit.backup) clearDraftBackup(backupKey, edit.backup.id)
}, report)
async function saveBeforeLeaving() {
  try { await flush(); return true } catch (reason) { report(reason); return false }
}
defineExpose({ saveBeforeLeaving })
onBeforeRouteLeave(saveBeforeLeaving)
onBeforeRouteUpdate(saveBeforeLeaving)

onMounted(() => {
  heading.value?.focus()
  const recovered = readDraftBackup(backupKey, props.row, scope)
  if (recovered) {
    answer.value = recovered.patch.draft
    recover({ patch: recovered.patch, backup: recovered, recovered: true })
  }
})
function edit(value: StudyResponse) {
  answer.value = value
  result.value = undefined
  error.value = ''
  const patch = { prose: '', draft: value }
  let backup: DraftBackup | undefined
  try { backup = writeDraftBackup(backupKey, props.row, patch, writingEdit()?.patch, scope) }
  catch { /* The draft writer warns before unload while the edit is unsafe. */ }
  queue({ patch, backup })
}
async function check() {
  if (busy.value) return
  const invalid = reviewAnswerError(props.activity.task, answer.value)
  if (invalid) { error.value = t(invalid); return }
  busy.value = true
  try {
    if (!await saveBeforeLeaving()) return
    error.value = ''
    result.value = localPathResult(props.activity, answer.value)
    await nextTick()
    resultView.value?.focus()
  } finally { busy.value = false }
}
async function reset() {
  if (busy.value) return
  busy.value = true
  try {
    await flush()
    await library.updatePath(path, ({ progress }) => ({ ...progress,
      practiceDrafts: progress.practiceDrafts?.filter(draft => draft.activityId !== activityId) }))
    clearPathDraftBackup(backupKey)
    answer.value = blank()
    inputVersion.value++
    result.value = undefined
    error.value = ''
  } catch (reason) { report(reason) }
  finally { busy.value = false }
}
</script>

<template>
  <section class="path-study path-repeat">
    <header class="path-step-heading">
      <p class="page-kicker">{{ t('path.voluntaryPractice') }}</p>
      <h2 ref="heading" tabindex="-1">{{ objective.goal }}</h2>
    </header>
    <TaskQuestion v-if="activity.task.kind !== 'cloze'" :card="{ front: activity.question, task: activity.task }" interactive format-bold />
    <TaskResponse :key="inputVersion" :front="activity.question" :task="activity.task" :model-value="answer"
      :construct-order="constructOrder" :disabled="busy" format-bold @update:model-value="edit" @submit="check" />
    <PathFeedback v-if="result" ref="resultView" :activity="activity" :result="result" />
    <p v-if="error" class="path-notice" role="status">{{ error }}</p>
    <div class="path-actions">
      <button class="btn btn-primary" :disabled="busy" @click="check">{{ t('path.submit') }}</button>
      <button class="btn btn-secondary" :disabled="busy" @click="emit('back')">{{ t('path.backToPath') }}</button>
      <button class="btn btn-quiet" :disabled="busy" @click="reset">{{ t('path.resetAnswer') }}</button>
    </div>
  </section>
</template>
