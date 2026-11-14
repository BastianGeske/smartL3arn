<script setup lang="ts">
import { taskQuality } from '../domain/taskQuality'
import type { SplitDraft } from '../domain/splitMatching'
import SplitMatchingEditor from './SplitMatchingEditor.vue'
import type { Card } from '../domain/types'
import { useI18n } from '../i18n'
import { computed, nextTick, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { useDialogKeyboard } from '../composables/useDialogKeyboard'
import { useLibraryStore } from '../stores/library'
import { useUiStore } from '../stores/ui'
import type { TaskDefinition, StudyResponse, TaskKind } from '../domain/types'
import { newTask, taskKinds, taskLabel, initialResponse, cardContent, calculationAiError } from '../domain/tasks'
import { TaskValidationError } from '../../shared/tasks.mjs'
import type { TranslationKey } from '../i18n'
import TaskConfigEditor from './TaskConfigEditor.vue'
import TaskQuestion from './TaskQuestion.vue'
import TaskResponse from './TaskResponse.vue'
import MathContent from './MathContent.vue'

const { t } = useI18n()

const library = useLibraryStore()
const ui = useUiStore()
const front = ref('')
const back = ref('')
const error = ref(false)
const saving = ref(false)
const saveError = ref(false)
const frontInput = ref<HTMLTextAreaElement>()
const task = ref<TaskDefinition>(newTask('short_text'))
const taskError = ref<TranslationKey | null>(null)
const previewResponse = ref<StudyResponse>(initialResponse())
const previewSolution = ref(false)
const splitSource = ref<Card | null>(null)
const splitError = ref(false)
const splitTrigger = ref<HTMLButtonElement>()
const qualityHints = computed(() => {
  if (!front.value.trim() || (textTask.value && !back.value.trim())) return []
  try { return taskQuality({ id: existingCard.value?.id || 'draft', ...cardContent(front.value.trim(), back.value.trim(), task.value) }) } catch { return [] }
})
const textTask = computed(() => task.value.kind === 'short_text' || task.value.kind === 'long_text')
const previewCard = computed(() => {
  try { return cardContent(front.value, back.value, task.value) }
  catch { return { front: front.value, back: back.value, task: task.value } }
})
watch(() => `${task.value.kind}:${task.value.kind === 'calculation' ? task.value.answer.kind : ''}`, () => { previewResponse.value = initialResponse(task.value); previewSolution.value = false; taskError.value = null })
watch(() => task.value.kind === 'ordering' ? task.value.items.map(item => item.id).join(':') : '', () => {
  if (task.value.kind !== 'ordering' || previewResponse.value.kind !== 'order') return
  const ids = task.value.items.map(item => item.id)
  const retained = previewResponse.value.ids.filter(id => ids.includes(id))
  previewResponse.value = { kind: 'order', ids: [...retained, ...ids.filter(id => !retained.includes(id))] }
})
function changeTask(event: Event) { task.value = newTask((event.target as HTMLSelectElement).value as TaskKind) }

const editor = computed(() => ui.cardEditor)
useDialogKeyboard(editor)
const existingCard = computed(() => {
  const value = editor.value
  if (!value?.cardId) return undefined
  return library.deckById(value.deckId)?.cards.find((card) => card.id === value.cardId)
})

watch(editor, async (value) => {
  document.body.classList.toggle('modal-open', Boolean(value))
  if (!value) return
  splitSource.value = null
  splitError.value = false
  front.value = existingCard.value?.front || ''
  back.value = existingCard.value?.back || ''
  task.value = existingCard.value?.task ? JSON.parse(JSON.stringify(existingCard.value.task)) : newTask('short_text')
  if (task.value.kind === 'ordering') task.value.items.sort((a, b) => task.value.kind === 'ordering' ? task.value.correctOrder.indexOf(a.id) - task.value.correctOrder.indexOf(b.id) : 0)
  previewResponse.value = initialResponse(task.value)
  previewSolution.value = false
  taskError.value = null
  error.value = false
  saveError.value = false
  await nextTick()
  frontInput.value?.focus()
}, { deep: true })

const sourceSignature = (card: Pick<Card, 'front' | 'back' | 'task'>) => JSON.stringify({ front: card.front, back: card.back, task: card.task })
const dirty = computed(() => {
  if (!existingCard.value) return true
  try { return sourceSignature(cardContent(front.value.trim(), back.value.trim(), task.value)) !== sourceSignature(cardContent(existingCard.value.front.trim(), existingCard.value.back.trim(), existingCard.value.task)) } catch { return true }
})
async function convertSingle() {
  if (task.value.kind === 'multiple_choice' && task.value.correctIds.length === 1) {
    task.value = { ...task.value, kind: 'single_choice' }
    await nextTick()
    document.getElementById('task-type')?.focus()
  }
}
function beginSplit() {
  if (dirty.value || ui.studyActive || saving.value || existingCard.value?.task?.kind !== 'matching') return
  splitSource.value = JSON.parse(JSON.stringify(existingCard.value))
  splitError.value = false
}
async function cancelSplit() {
  splitSource.value = null
  await nextTick()
  splitTrigger.value?.focus()
}
async function createSplit(drafts: SplitDraft[], replace: boolean) {
  if (!editor.value || !splitSource.value || saving.value) return
  saving.value = true
  splitError.value = false
  try {
    const cards = await library.splitMatchingCard(editor.value.deckId, splitSource.value.id, drafts, replace, sourceSignature(splitSource.value))
    ui.showToast('split.created', { count: cards.length })
    ui.closeCardEditor()
  } catch { splitError.value = true }
  finally { saving.value = false }
}

function close(): void {
  if (saving.value) return
  ui.closeCardEditor()
}

async function save(): Promise<void> {
  const value = editor.value
  if (!value || saving.value) return
  const nextFront = front.value.trim()
  const nextBack = back.value.trim()
  if (!nextFront || (textTask.value && !nextBack)) {
    error.value = true
    return
  }
  taskError.value = calculationAiError(task.value)
  if (taskError.value) return
  let content
  try { content = cardContent(nextFront, nextBack, existingCard.value && !existingCard.value.task && task.value.kind === 'short_text' ? undefined : task.value) }
  catch (failure) { taskError.value = failure instanceof TaskValidationError ? `task.${failure.code}` as TranslationKey : 'task.invalid'; return }
  saving.value = true
  saveError.value = false
  try {
    if (value.cardId) {
      await library.updateCard(value.deckId, value.cardId, {
        ...content,
        task: content.task,
      })
      ui.showToast('card.updated')
    } else {
      await library.addCard(value.deckId, content.front, content.back, content.task)
      ui.showToast('card.added')
    }
    ui.closeCardEditor()
  } catch { saveError.value = true }
  finally { saving.value = false }
}
</script>

<template>
  <div
    v-if="editor"
    class="modal-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="card-modal-title"
    @click.self="close"
    @keydown.esc="close"
  >
    <div class="modal card-editor-modal" tabindex="-1" :aria-busy="saving">
      <div class="modal-header">
        <h2 id="card-modal-title">{{ splitSource ? t('split.title') : existingCard ? t('card.edit') : t('card.add') }}</h2>
        <button class="btn-icon" type="button" :disabled="saving" :aria-label="t('card.closeEditor')" @click="close">
          <AppIcon name="x" />
        </button>
      </div>
      <SplitMatchingEditor v-if="splitSource" :source="splitSource" :busy="saving" :error="splitError" @cancel="cancelSplit" @create="createSplit" />
      <div v-else class="modal-body">
        <label class="field-label" for="task-type">{{ t('task.typeLabel') }}</label>
        <select id="task-type" class="select" aria-describedby="task-type-help" :value="task.kind" :disabled="saving" @change="changeTask"><option v-for="kind in taskKinds" :key="kind" :value="kind">{{ taskLabel(kind) }}</option></select>
        <p id="task-type-help" class="field-hint">{{ t(`quality.help.${task.kind}`) }}</p>
        <label class="field-label" for="modal-front">{{ t('common.front') }}</label>
        <textarea
          id="modal-front"
          ref="frontInput"
          v-model="front"
          class="textarea"
          rows="5"
          maxlength="20000"
          :disabled="saving"
          :placeholder="t('card.frontPlaceholder')"
          :aria-invalid="error && !front.trim()"
          @input="error = false"
        />
        <label v-if="textTask" class="field-label" for="modal-back">{{ t('common.back') }}</label>
        <textarea
          v-if="textTask"
          id="modal-back"
          v-model="back"
          class="textarea"
          rows="5"
          maxlength="20000"
          :disabled="saving"
          :placeholder="t('card.backPlaceholder')"
          :aria-invalid="error && !back.trim()"
          @input="error = false"
        />
        <fieldset class="task-editor-fields" :disabled="saving"><TaskConfigEditor v-model="task" :disabled="saving" :hints="qualityHints" @convert-single="convertSingle" /></fieldset>
        <p v-if="taskError" class="form-error" role="alert">{{ t(taskError) }}</p>
        <details class="task-details task-preview"><summary>{{ t('task.preview') }}</summary><TaskQuestion :card="previewCard" interactive /><TaskResponse :key="`${task.kind}:${task.kind === 'calculation' ? task.answer.kind : ''}`" :task="task" :front="front" :model-value="previewResponse" @update:model-value="previewResponse = $event" /><button class="btn btn-quiet btn-sm" type="button" @click="previewSolution = !previewSolution">{{ t('task.previewSolution') }}</button><MathContent v-if="previewSolution" :text="previewCard.back" /></details>
        <p v-if="error" class="form-error" aria-live="polite">
          {{ t('card.required') }}
        </p>
        <p v-if="saveError" class="form-error" role="alert">{{ t('card.saveFailed') }}</p>
      </div>
      <div v-if="!splitSource" class="modal-footer">
        <div v-if="existingCard?.task?.kind === 'matching' && task.kind === 'matching' && !ui.studyActive" class="split-entry">
          <button ref="splitTrigger" class="btn btn-secondary" type="button" :disabled="saving || dirty" @click="beginSplit">{{ t('split.title') }}</button>
          <span v-if="dirty" class="field-hint">{{ t('split.saveFirst') }}</span>
        </div>
        <button class="btn btn-secondary" type="button" :disabled="saving" @click="close">{{ t('common.cancel') }}</button>
        <button class="btn btn-primary" type="button" :disabled="saving" @click="save">
          {{ existingCard ? t('common.save') : t('card.add') }}
        </button>
      </div>
    </div>
  </div>
</template>
