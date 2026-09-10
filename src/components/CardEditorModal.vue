<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { useLibraryStore } from '../stores/library'
import { useUiStore } from '../stores/ui'

const library = useLibraryStore()
const ui = useUiStore()
const front = ref('')
const back = ref('')
const error = ref(false)
const frontInput = ref<HTMLTextAreaElement>()

const editor = computed(() => ui.cardEditor)
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
  await nextTick()
  frontInput.value?.focus()
}, { deep: true })

function close(): void {
  ui.closeCardEditor()
}

async function save(): Promise<void> {
  const value = editor.value
  if (!value) return
  const nextFront = front.value.trim()
  const nextBack = back.value.trim()
  if (!nextFront || !nextBack) {
    error.value = true
    return
  }
  if (value.cardId) {
    await library.updateCard(value.deckId, value.cardId, {
      front: nextFront,
      back: nextBack,
    })
    ui.showToast('Card updated.')
  } else {
    await library.addCard(value.deckId, nextFront, nextBack)
    ui.showToast('Card added.')
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
    aria-labelledby="card-modal-title"
    @click.self="close"
    @keydown.esc="close"
  >
    <div class="modal" tabindex="-1">
      <div class="modal-header">
        <h2 id="card-modal-title">{{ existingCard ? 'Edit Card' : 'Add Card' }}</h2>
        <button class="btn-icon" type="button" aria-label="Close card editor" @click="close">
          <AppIcon name="x" />
        </button>
      </div>
      <div class="modal-body">
        <label class="field-label" for="modal-front">Front</label>
        <textarea
          id="modal-front"
          ref="frontInput"
          v-model="front"
          class="textarea"
          rows="5"
          placeholder="Front side of card"
          :aria-invalid="error && !front.trim()"
          @input="error = false"
        />
        <label class="field-label" for="modal-back">Back</label>
        <textarea
          id="modal-back"
          v-model="back"
          class="textarea"
          rows="5"
          placeholder="Back side of card"
          :aria-invalid="error && !back.trim()"
          @input="error = false"
        />
        <p v-if="error" class="form-error" aria-live="polite">
          Add text to both sides of the card.
        </p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" type="button" @click="close">Cancel</button>
        <button class="btn btn-primary" type="button" @click="save">
          {{ existingCard ? 'Save changes' : 'Add card' }}
        </button>
      </div>
    </div>
  </div>
</template>
