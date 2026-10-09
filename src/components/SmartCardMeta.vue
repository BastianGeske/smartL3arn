<script setup lang="ts">
import { useI18n } from '../i18n'
import AppIcon from './AppIcon.vue'

defineProps<{ deckName: string; ai: boolean; modeLabel: string }>()
const { t } = useI18n()
</script>

<template>
  <div class="smart-card-meta">
    <span class="smart-deck-tag">
      <AppIcon name="book-open" :size="14" /><span>{{ deckName }}</span>
    </span>
    <div class="smart-card-meta-status">
      <span class="evaluation-mode-badge" :class="{ 'is-ai': ai }">
        <AppIcon :name="ai ? 'sparkles' : 'check'" :size="14" />
        {{ t(ai ? 'ai.openrouter' : 'ai.local') }}
      </span>
      <span class="smart-card-mode">{{ modeLabel }}</span>
    </div>
  </div>
</template>
