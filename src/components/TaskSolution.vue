<script setup lang="ts">
import type { Card } from '../domain/types'
import { useI18n } from '../i18n'
import MathContent from './MathContent.vue'
defineProps<{ card: Pick<Card, 'back' | 'task'> }>()
const { t } = useI18n()
</script>
<template>
  <span v-if="card.task?.kind === 'true_false'" class="math-content">{{ t(card.task.correct ? 'task.true' : 'task.false') }}<MathContent v-if="card.task.explanation" :text="'\n\n' + card.task.explanation" /></span>
  <MathContent v-else :text="card.back" />
</template>
