<script setup lang="ts">
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
        <h2 id="card-modal-title">{{ existingCard ? t('card.edit') : t('card.add') }}</h2>
        <button class="btn-icon" type="button" :disabled="saving" :aria-label="t('card.closeEditor')" @click="close">
          <AppIcon name="x" />
        </button>
      </div>
      <div class="modal-body">
        <label class="field-label" for="task-type">{{ t('task.typeLabel') }}</label>
        <select id="task-type" class="select" :value="task.kind" :disabled="saving" @change="changeTask"><option v-for="kind in taskKinds" :key="kind" :value="kind">{{ taskLabel(kind) }}</option></select>
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
        <fieldset class="task-editor-fields" :disabled="saving"><TaskConfigEditor v-model="task" :disabled="saving" /></fieldset>
        <p v-if="taskError" class="form-error" role="alert">{{ t(taskError) }}</p>
        <details class="task-details task-preview"><summary>{{ t('task.preview') }}</summary><TaskQuestion :card="previewCard" interactive /><TaskResponse :key="`${task.kind}:${task.kind === 'calculation' ? task.answer.kind : ''}`" :task="task" :front="front" :model-value="previewResponse" @update:model-value="previewResponse = $event" /><button class="btn btn-quiet btn-sm" type="button" @click="previewSolution = !previewSolution">{{ t('task.previewSolution') }}</button><MathContent v-if="previewSolution" :text="previewCard.back" /></details>
        <p v-if="error" class="form-error" aria-live="polite">
          {{ t('card.required') }}
        </p>
        <p v-if="saveError" class="form-error" role="alert">{{ t('card.saveFailed') }}</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" type="button" :disabled="saving" @click="close">{{ t('common.cancel') }}</button>
        <button class="btn btn-primary" type="button" :disabled="saving" @click="save">
          {{ existingCard ? t('common.save') : t('card.add') }}
        </button>
      </div>
    </div>
  </div>
</template>
