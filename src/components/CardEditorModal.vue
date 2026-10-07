<script setup lang="ts">
import { useI18n } from '../i18n'
import { computed, nextTick, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { useDialogKeyboard } from '../composables/useDialogKeyboard'
import { useLibraryStore } from '../stores/library'
import { useUiStore } from '../stores/ui'

const { t } = useI18n()

const library = useLibraryStore()
const ui = useUiStore()
const front = ref('')
const back = ref('')
const error = ref(false)
const saving = ref(false)
const saveError = ref(false)
const frontInput = ref<HTMLTextAreaElement>()

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
  if (!nextFront || !nextBack) {
    error.value = true
    return
  }
  saving.value = true
  saveError.value = false
  try {
    if (value.cardId) {
      await library.updateCard(value.deckId, value.cardId, {
        front: nextFront,
        back: nextBack,
      })
      ui.showToast('card.updated')
    } else {
      await library.addCard(value.deckId, nextFront, nextBack)
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
    <div class="modal" tabindex="-1" :aria-busy="saving">
      <div class="modal-header">
        <h2 id="card-modal-title">{{ existingCard ? t('card.edit') : t('card.add') }}</h2>
        <button class="btn-icon" type="button" :disabled="saving" :aria-label="t('card.closeEditor')" @click="close">
          <AppIcon name="x" />
        </button>
      </div>
      <div class="modal-body">
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
        <label class="field-label" for="modal-back">{{ t('common.back') }}</label>
        <textarea
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
