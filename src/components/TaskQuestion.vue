<script setup lang="ts">
import { computed } from 'vue'
import type { Card } from '../domain/types'
import { shuffled } from '../domain/tasks'
import MathContent from './MathContent.vue'
import { useI18n } from '../i18n'
const props = defineProps<{ card: Pick<Card, 'front' | 'task'>; interactive?: boolean }>()
const { t } = useI18n()
const items = computed(() => {
  const task = props.card.task
  if (task?.kind === 'single_choice' || task?.kind === 'multiple_choice') return shuffled(task.options.map(o => o.text))
  if (task?.kind === 'ordering') return shuffled(task.items.map(o => o.text))
  return []
})
const matching = computed(() => props.card.task?.kind === 'matching' ? { left: props.card.task.pairs.map(p => p.left), right: shuffled(props.card.task.pairs.map(p => p.right)) } : null)
</script>
<template>
  <div class="task-question">
    <MathContent :text="card.task?.kind === 'cloze' ? card.front.replace(/\{\{[\w-]+\}\}/g, '___') : card.front" />
    <template v-if="!interactive">
      <ul v-if="items.length" class="task-readonly-items"><li v-for="(item, i) in items" :key="i"><MathContent :text="item" /></li></ul>
      <div v-if="matching" class="task-matching-readonly"><ul><li v-for="(item, i) in matching.left" :key="i"><MathContent :text="item" /></li></ul><ul><li v-for="(item, i) in matching.right" :key="i"><MathContent :text="item" /></li></ul></div>
      <p v-if="card.task?.kind === 'true_false'">{{ t('task.true') }} / {{ t('task.false') }}</p>
    </template>
  </div>
</template>
