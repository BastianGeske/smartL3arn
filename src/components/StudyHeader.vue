<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import ThemeButton from './ThemeButton.vue'

defineProps<{
  title: string
  progress: number
  label: string
  smartTimer?: string
}>()
defineEmits<{ exit: [] }>()
</script>

<template>
  <header class="study-header">
    <div class="study-header-top">
      <button class="btn btn-quiet btn-sm" type="button" @click="$emit('exit')">
        <AppIcon name="x" :size="16" /><span>Exit</span>
      </button>
      <div class="study-context">
        <span class="study-context-label">Study session</span>
        <strong :title="title">{{ title }}</strong>
      </div>
      <ThemeButton />
    </div>
    <div class="study-progress-row">
      <div
        class="progress-bar-wrap"
        role="progressbar"
        aria-label="Session progress"
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
  </header>
</template>
