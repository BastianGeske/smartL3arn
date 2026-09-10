<script setup lang="ts">
import CardEditorModal from './components/CardEditorModal.vue'
import DeckEditorModal from './components/DeckEditorModal.vue'
import { useLibraryStore } from './stores/library'
import { useUiStore } from './stores/ui'

const library = useLibraryStore()
const ui = useUiStore()
</script>

<template>
  <RouterView v-if="library.ready" />
  <div v-else class="app-loading" role="status">Loading smartL3arn…</div>
  <CardEditorModal />
  <DeckEditorModal />
  <div
    class="toast-region"
    :class="{ 'is-visible': ui.toast }"
    aria-live="polite"
    aria-atomic="true"
  >
    {{ ui.toast }}
  </div>
  <div v-if="library.saveError" class="save-error" role="alert">
    Could not save changes: {{ library.saveError }}
  </div>
</template>
