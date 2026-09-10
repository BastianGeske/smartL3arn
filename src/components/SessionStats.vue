<script setup lang="ts">
import type { SessionStats } from '../domain/types'

defineProps<{ stats: SessionStats; extraClass?: string }>()

const items = [
  ['again', 'Again'],
  ['hard', 'Hard'],
  ['good', 'Good'],
  ['easy', 'Easy'],
] as const
</script>

<template>
  <div class="session-stats" :class="extraClass" aria-label="Session ratings">
    <span class="session-stats-label">Session ratings</span>
    <div
      v-for="[key, label] in items"
      :key="key"
      class="sstat"
      :class="`sstat-${key}`"
    >
      <strong>{{ stats[key] || 0 }}</strong>
      <span>{{ label }}</span>
    </div>
  </div>
</template>
