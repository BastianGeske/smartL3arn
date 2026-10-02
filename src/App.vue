<script setup lang="ts">
import { useI18n } from './i18n'
import CardEditorModal from './components/CardEditorModal.vue'
import DeckEditorModal from './components/DeckEditorModal.vue'
import { useLibraryStore } from './stores/library'
import { useUiStore } from './stores/ui'

const { t } = useI18n()

const library = useLibraryStore()
const ui = useUiStore()
</script>

<template>
  <RouterView v-if="library.ready" />
  <div v-else class="app-loading" role="status">{{ t('common.loading') }}</div>
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
    {{ t('common.saveError', { error: library.saveError }) }}
  </div>
</template>
