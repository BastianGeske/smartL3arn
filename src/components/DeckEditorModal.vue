<script setup lang="ts">
import { useI18n } from '../i18n'
import { computed, nextTick, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { useDialogKeyboard } from '../composables/useDialogKeyboard'
import { useLibraryStore } from '../stores/library'
import { useUiStore } from '../stores/ui'
import { DECK_COVERS, coverFor, coverUrl, defaultCover } from '../domain/deckCovers'
import type { DeckCoverId } from '../../shared/deck-covers.mjs'

const { t, locale } = useI18n()

const library = useLibraryStore()
const ui = useUiStore()
const name = ref('')
const coverId = ref<DeckCoverId>('violet')
const error = ref(false)
const saving = ref(false)
const saveError = ref('')
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
  coverId.value = existingDeck.value ? coverFor(existingDeck.value).id : defaultCover(library.decks.length)
  error.value = false
  saveError.value = ''
  await nextTick()
  input.value?.focus()
  input.value?.select()
}, { deep: true })

function close(): void {
  if (saving.value) return
  ui.closeDeckEditor()
}

async function save(): Promise<void> {
  const value = editor.value
  const nextName = name.value.trim()
  if (!value || saving.value) return
  if (!nextName) {
    error.value = true
    return
  }
  saving.value = true
  saveError.value = ''
  try {
    if (value.deckId) {
      await library.updateDeck(value.deckId, nextName, coverId.value)
      ui.showToast('deck.updated')
    } else {
      await library.createDeck(nextName, coverId.value)
      ui.showToast('deck.created')
    }
    ui.closeDeckEditor()
  } catch {
    saveError.value = t('deck.saveFailed')
  } finally { saving.value = false }
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
    <div class="modal deck-editor-modal" tabindex="-1" :aria-busy="saving">
      <div class="modal-header">
        <h2 id="deck-modal-title">{{ existingDeck ? t('deck.edit') : t('deck.new') }}</h2>
        <button class="btn-icon" type="button" :disabled="saving" :aria-label="t('deck.closeEditor')" @click="close">
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
          :disabled="saving"
          :aria-invalid="error"
          @input="error = false"
          @keydown.enter="save"
        >
        <p v-if="error" class="form-error" aria-live="polite">{{ t('deck.nameRequired') }}</p>
        <fieldset class="deck-cover-picker" :disabled="saving">
          <legend class="field-label">{{ t('deck.cover') }}</legend>
          <p class="deck-cover-hint">{{ t('deck.coverHint') }}</p>
          <div class="deck-cover-options">
            <label v-for="cover in DECK_COVERS" :key="cover.id" class="deck-cover-option" :class="{ 'is-selected': coverId === cover.id }">
              <input v-model="coverId" type="radio" name="deck-cover" :value="cover.id">
              <span class="deck-cover-thumbnail">
                <img :src="coverUrl(cover.id)" alt="">
                <AppIcon :name="cover.icon" :size="26" />
                <span v-if="coverId === cover.id" class="deck-cover-check"><AppIcon name="check" :size="15" /></span>
              </span>
              <span class="deck-cover-caption">{{ locale === 'de' ? cover.de : cover.en }}</span>
            </label>
          </div>
        </fieldset>
        <p v-if="saveError" class="form-error" role="alert">{{ saveError }}</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" type="button" :disabled="saving" @click="close">{{ t('common.cancel') }}</button>
        <button class="btn btn-primary" type="button" :disabled="saving" @click="save">
          {{ existingDeck ? t('common.save') : t('deck.create') }}
        </button>
      </div>
    </div>
  </div>
</template>
