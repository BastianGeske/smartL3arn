<script setup lang="ts">
import type { SessionStats as Stats } from '../domain/types'
import AppIcon from './AppIcon.vue'
import SessionStats from './SessionStats.vue'

withDefaults(defineProps<{ kicker: string; title: string; note?: string; stats: Stats; icon?: string }>(), { icon: 'check' })
</script>

<template>
  <main class="study-done" tabindex="-1">
    <div class="completion-mark"><AppIcon :name="icon" :size="23" /></div>
    <p class="completion-kicker">{{ kicker }}</p>
    <h1 class="completion-title" tabindex="-1">{{ title }}</h1>
    <p v-if="note || $slots.note" class="completion-note"><slot name="note">{{ note }}</slot></p>
    <SessionStats :stats="stats" extra-class="session-stats-done" />
    <slot />
  </main>
</template>
