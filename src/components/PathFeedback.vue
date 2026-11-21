<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Activity, PathAnswerResult } from '../../shared/learning-paths.mjs'
import { evaluateResponse, responseText } from '../domain/tasks'
import { useI18n, type TranslationKey } from '../i18n'
import AppIcon from './AppIcon.vue'
import MathContent from './MathContent.vue'
import PathAnswerContent from './PathAnswerContent.vue'

const props = withDefaults(defineProps<{ activity: Activity; result: PathAnswerResult; detailed?: boolean; showSolution?: boolean }>(),
  { detailed: true, showSolution: true })
const { t } = useI18n()
const heading = ref<HTMLElement>()
defineExpose({ focus: () => heading.value?.focus() })
const titles: Record<PathAnswerResult['verdict'], TranslationKey> = {
  correct: 'path.correct', partial: 'path.feedback.partial', incorrect: 'path.feedback.incorrect', revealed: 'path.feedback.revealed',
}
const written = computed(() => props.result.prose !== undefined ? props.activity.written : undefined)
const answer = computed(() => props.result.prose ?? responseText(props.result.response ?? null, props.activity.task))
const parts = computed(() => props.detailed && props.result.response && props.result.verdict !== 'revealed'
  ? evaluateResponse(props.activity, props.result.response)?.parts : undefined)
const inlineAnswers = computed(() => !!parts.value?.length && ['cloze', 'matching', 'ordering'].includes(props.activity.task.kind))
function partLabel(label: string) {
  if (props.activity.task.kind === 'ordering') return t('path.feedback.position', { number: label })
  if (props.activity.task.kind !== 'cloze') return label
  const words = label.replace(/[_-]+/g, ' ')
  return /^[a-z0-9 ]+$/.test(words) ? words.charAt(0).toUpperCase() + words.slice(1) : words
}
</script>

<template>
  <section class="path-feedback path-answer-feedback" :data-verdict="result.verdict">
    <div class="path-result-title">
      <AppIcon :name="result.verdict === 'correct' ? 'check-circle-2' : 'lightbulb'" />
      <h3 ref="heading" tabindex="-1">{{ t(titles[result.verdict]) }}</h3>
    </div>
    <p v-if="result.assisted" class="path-feedback-assistance">{{ t('path.result.assisted') }}</p>
    <template v-if="detailed">
      <div v-if="answer.trim() || parts?.length" class="path-feedback-answer">
        <strong>{{ t('smart.yourAnswer') }}</strong>
        <PathAnswerContent v-if="!inlineAnswers" :text="answer" :format="written?.input" />
        <ul v-if="parts?.length" class="path-feedback-list path-feedback-parts">
          <li v-for="(part, index) in parts" :key="index" :data-correct="part.correct">
            <div class="path-feedback-part">
              <MathContent :text="partLabel(part.label)" />
              <strong v-if="inlineAnswers"><MathContent :text="part.actual || '—'" /></strong>
            </div>
            <span class="path-feedback-mark"><AppIcon :name="part.correct ? 'check' : 'alert-circle'" :size="16" />
              {{ t(part.correct ? 'path.feedback.partCorrect' : 'path.feedback.partRevisit') }}</span>
          </li>
        </ul>
      </div>
      <ul v-if="result.criteria?.length" class="path-feedback-list">
        <li v-for="criterion in result.criteria" :key="criterion.id" :data-correct="criterion.status === 'satisfied'">
          <span class="path-feedback-mark"><AppIcon :name="criterion.status === 'satisfied' ? 'check' : 'alert-circle'" :size="16" />
            {{ t(criterion.status === 'satisfied' ? 'path.satisfied' : criterion.status === 'missing' ? 'path.notYet' : 'path.ambiguous') }}</span>
          <div><strong>{{ written?.criteria.find(c => c.id === criterion.id)?.description }}</strong>
            <p>{{ criterion.reason }}</p></div>
        </li>
      </ul>
      <div v-if="!written && (result.verdict === 'partial' || result.verdict === 'incorrect')" class="path-feedback-answer">
        <strong>{{ t('path.feedback.nextStep') }}</strong>
        <MathContent :text="activity.feedback" format-bold />
      </div>
      <details v-if="showSolution" class="path-example path-feedback-solution" :open="result.verdict === 'revealed' || undefined">
        <summary>{{ t('path.solution') }}</summary>
        <PathAnswerContent :text="written?.reference ?? activity.solution" :format="written?.input" format-bold />
        <ol v-if="!written && activity.task.kind === 'calculation' && activity.task.solutionSteps?.length">
          <li v-for="(step, index) in activity.task.solutionSteps" :key="index">
            <MathContent :text="step.value" :formula="step.kind === 'math'" :block="step.kind === 'math'" format-bold />
          </li>
        </ol>
      </details>
    </template>
  </section>
</template>
