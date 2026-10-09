<script setup lang="ts">
import { useI18n } from '../i18n'
import AppIcon from './AppIcon.vue'
import ThemeButton from './ThemeButton.vue'
import SessionStats from './SessionStats.vue'
import type { SessionStats as SessionStatsData } from '../domain/types'

const { t } = useI18n()

defineProps<{
  title: string
  progress: number
  label: string
  smartTimer?: string
  compact?: boolean
  sessionStats?: SessionStatsData
}>()
defineEmits<{ exit: [] }>()
</script>

<template>
  <header class="study-header" :class="{ 'study-header-compact': compact }">
    <div class="study-header-top">
      <button class="btn btn-quiet btn-sm" type="button" @click="$emit('exit')">
        <AppIcon name="x" :size="16" /><span>{{ t('study.exit') }}</span>
      </button>
      <div class="study-context">
        <span v-if="!compact" class="study-context-label">{{ t('study.session') }}</span>
        <strong :title="title">{{ title }}</strong>
      </div>
      <ThemeButton />
    </div>
    <div class="study-progress-row">
      <div
        class="progress-bar-wrap"
        role="progressbar"
        :aria-label="t('study.progress')"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="Math.round(progress)"
      >
        <div class="progress-bar-fill" :style="{ width: `${Math.max(0, Math.min(100, progress))}%` }" />
      </div>
      <span class="progress-label">
        {{ label }}
        <span v-if="smartTimer" class="smart-timer">
          <AppIcon name="timer" :size="13" /><span>{{ smartTimer }}</span>
        </span>
      </span>
    </div>
    <SessionStats v-if="sessionStats" :stats="sessionStats" compact />
  </header>
</template>
