<script setup lang="ts">
import { useI18n } from './i18n'
import CardEditorModal from './components/CardEditorModal.vue'
import DeckEditorModal from './components/DeckEditorModal.vue'
import NotificationStack from './components/NotificationStack.vue'
import { useLibraryStore } from './stores/library'

const { t } = useI18n()

const library = useLibraryStore()
</script>

<template>
  <RouterView v-if="library.ready" />
  <div v-else class="app-loading" role="status">{{ t('common.loading') }}</div>
  <CardEditorModal />
  <DeckEditorModal />
  <NotificationStack />
</template>
