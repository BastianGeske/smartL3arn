<script setup lang="ts">
import { computed, ref } from 'vue'
import { selfCheckRequired, selfCheckScore, type Objective, type SelfCheckRound } from '../../shared/learning-paths.mjs'
import { useI18n } from '../i18n'
import AppIcon from './AppIcon.vue'
import MathContent from './MathContent.vue'
import PathFeedback from './PathFeedback.vue'

const props = defineProps<{ goal: Objective; round: SelfCheckRound }>()
const emit = defineEmits<{ solution: [] }>()
const { t } = useI18n()
const score = computed(() => selfCheckScore(props.round))
const size = computed(() => props.round.queue.length)
const required = computed(() => selfCheckRequired(size.value))
const passed = computed(() => score.value >= required.value)
const outcomes = computed(() => props.round.answers.map(result => ({
  result, activity: props.goal.checks.find(activity => activity.id === result.activityId)!,
})))
const heading = ref<HTMLElement>()
defineExpose({ focus: () => heading.value?.focus() })
</script>

<template>
  <section class="path-round-summary">
    <div class="path-result-title">
      <AppIcon :name="passed ? 'check-circle-2' : 'lightbulb'" />
      <h2 ref="heading" tabindex="-1">{{ t(passed ? 'path.round.passed' : 'path.round.notPassed') }}</h2>
    </div>
    <p class="path-round-score">{{ t('path.round.score', { correct: score, total: size }) }}</p>
    <p v-if="!passed">{{ t('path.round.required', { required, total: size }) }}</p>
    <ol class="path-round-results">
      <li v-for="({ result, activity }, index) in outcomes" :key="activity.id">
        <details>
          <summary>
            <AppIcon :name="result.verdict === 'correct' && !result.assisted ? 'check-circle-2' : 'alert-circle'" :size="18" />
            <span>{{ t('path.round.taskLabel', { number: index + 1 }) }}</span>
            <span>{{ t(result.assisted ? 'path.result.assisted' : result.verdict === 'correct' ? 'path.correct' : result.verdict === 'partial' ? 'path.feedback.partial' : 'path.feedback.incorrect') }}</span>
            <span v-if="round.repeated.includes(activity.id)">{{ t('path.round.repeated') }}</span>
          </summary>
          <MathContent :text="(result.prose !== undefined ? activity.written?.question ?? activity.question : activity.question).replace(/\{\{[\w-]+\}\}/g, '___')"
            :format-bold="result.prose === undefined || activity.written?.input !== 'code'" />
          <PathFeedback @solution="emit('solution')" :activity="activity" :result="result" />
        </details>
      </li>
    </ol>
  </section>
</template>
