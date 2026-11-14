<script setup lang="ts">
import type { Card } from '../domain/types'
import { useI18n } from '../i18n'
import MathContent from './MathContent.vue'
defineProps<{ card: Pick<Card, 'back' | 'task'> }>()
const { t } = useI18n()
</script>
<template>
  <div v-if="card.task?.kind === 'matching'" class="task-solution">
    <dl class="task-solution-pairs">
      <div v-for="pair in card.task.pairs" :key="pair.id">
        <dt><MathContent :text="pair.left" /></dt>
        <dd><MathContent :text="pair.right" /></dd>
      </div>
    </dl>
    <MathContent v-if="card.task.explanation" class="task-solution-explanation" :text="card.task.explanation" />
  </div>
  <div v-else-if="card.task?.kind === 'ordering'" class="task-solution">
    <ol class="task-solution-list"><li v-for="id in card.task.correctOrder" :key="id"><MathContent :text="card.task.items.find(item => item.id === id)?.text || ''" /></li></ol>
    <MathContent v-if="card.task.explanation" class="task-solution-explanation" :text="card.task.explanation" />
  </div>
  <span v-else-if="card.task?.kind === 'true_false'" class="math-content">{{ t(card.task.correct ? 'task.true' : 'task.false') }}<MathContent v-if="card.task.explanation" :text="'\n\n' + card.task.explanation" /></span>
  <MathContent v-else :text="card.back" />
</template>
