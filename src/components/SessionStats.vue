<script setup lang="ts">
import { useI18n } from '../i18n'
import type { SessionStats } from '../domain/types'

const { t, formatNumber } = useI18n()

defineProps<{ stats: SessionStats; extraClass?: string; compact?: boolean }>()

const items = [
  ['again', 'rating.again'],
  ['hard', 'rating.hard'],
  ['good', 'rating.good'],
  ['easy', 'rating.easy'],
] as const
</script>

<template>
  <div class="session-stats" :class="[extraClass, { 'session-stats-compact': compact }]" role="group" :aria-label="t('study.ratings')">
    <span v-if="!compact" class="session-stats-label">{{ t('study.ratings') }}</span>
    <div
      v-for="[key, label] in items"
      :key="key"
      class="sstat"
      :class="`sstat-${key}`"
    >
      <strong>{{ formatNumber(stats[key] || 0) }}</strong>
      <span>{{ t(label) }}</span>
    </div>
  </div>
</template>
