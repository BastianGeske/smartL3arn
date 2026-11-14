<script setup lang="ts">
import { computed, useId } from 'vue'
import { useI18n } from '../i18n'
import type { Card } from '../domain/types'
import TaskQuestion from './TaskQuestion.vue'
import TaskSolution from './TaskSolution.vue'

const props = defineProps<{ card: Card; side: 'question' | 'answer'; interactive?: boolean; label?: string; labelId?: string; contentId?: string }>()
const { t } = useI18n()
const uid = useId()
const labelId = computed(() => props.labelId || `study-label-${uid}`)
const contentId = computed(() => props.contentId || `study-content-${uid}`)
const label = computed(() => props.label || t(props.side === 'question' ? 'study.question' : 'study.answer'))
const structured = computed(() => props.card.task && ['single_choice', 'multiple_choice', 'matching', 'ordering', 'cloze', 'true_false'].includes(props.card.task.kind))
</script>

<template>
  <div v-if="$slots.actions" class="card-side-row">
    <span :id="labelId" class="card-side-label">{{ label }}</span>
    <slot name="actions" />
  </div>
  <span v-else :id="labelId" class="card-side-label">{{ label }}</span>
  <div :id="contentId" class="card-content" :class="{ 'card-content-structured': structured }">
    <slot name="content">
      <TaskQuestion v-if="side === 'question'" :key="card.id" :card="card" :interactive="interactive" />
      <TaskSolution v-else :card="card" />
    </slot>
  </div>
</template>
