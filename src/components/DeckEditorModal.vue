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
const name = ref('')
const error = ref(false)
const input = ref<HTMLInputElement>()

const editor = computed(() => ui.deckEditor)
useDialogKeyboard(editor)
const existingDeck = computed(() => {
  const deckId = editor.value?.deckId
  return deckId ? library.deckById(deckId) : undefined
})

watch(editor, async (value) => {
  document.body.classList.toggle('modal-open', Boolean(value))
  if (!value) return
  name.value = existingDeck.value?.name || ''
  error.value = false
  await nextTick()
  input.value?.focus()
  input.value?.select()
}, { deep: true })

function close(): void {
  ui.closeDeckEditor()
}

async function save(): Promise<void> {
  const value = editor.value
  const nextName = name.value.trim()
  if (!value) return
  if (!nextName) {
    error.value = true
    return
  }
  if (value.deckId) {
    await library.renameDeck(value.deckId, nextName)
    ui.showToast('deck.renamed')
  } else {
    await library.createDeck(nextName)
    ui.showToast('deck.created')
  }
  close()
}
</script>

<template>
  <div
    v-if="editor"
    class="modal-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="deck-modal-title"
    @click.self="close"
    @keydown.esc="close"
  >
    <div class="modal modal-compact" tabindex="-1">
      <div class="modal-header">
        <h2 id="deck-modal-title">{{ existingDeck ? t('deck.rename') : t('deck.new') }}</h2>
        <button class="btn-icon" type="button" :aria-label="t('deck.closeEditor')" @click="close">
          <AppIcon name="x" />
        </button>
      </div>
      <div class="modal-body">
        <label class="field-label" for="deck-modal-name">{{ t('deck.name') }}</label>
        <input
          id="deck-modal-name"
          ref="input"
          v-model="name"
          class="text-input"
          type="text"
          maxlength="120"
          :placeholder="t('deck.namePlaceholder')"
          autocomplete="off"
          :aria-invalid="error"
          @input="error = false"
          @keydown.enter="save"
        >
        <p v-if="error" class="form-error" aria-live="polite">{{ t('deck.nameRequired') }}</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" type="button" @click="close">{{ t('common.cancel') }}</button>
        <button class="btn btn-primary" type="button" @click="save">
          {{ existingDeck ? t('common.save') : t('deck.create') }}
        </button>
      </div>
    </div>
  </div>
</template>
