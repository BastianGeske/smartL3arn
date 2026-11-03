<script setup lang="ts">
import { useI18n, type TranslationKey } from '../i18n'
import { computed, nextTick, onBeforeUnmount, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import StudyCardBody from '../components/StudyCardBody.vue'
import StudyRatingButtons from '../components/StudyRatingButtons.vue'
import StudyCompletion from '../components/StudyCompletion.vue'
import StudyHeader from '../components/StudyHeader.vue'
import SmartCardMeta from '../components/SmartCardMeta.vue'
import {
  calibrationMatch,
  evaluationBand,
} from '../domain/study/answerSimilarity'
import type { ConfidenceLevel, Rating } from '../domain/types'
import { useSettingsStore } from '../stores/settings'
import { useSmartStudyStore } from '../stores/smartStudy'
import { Capacitor } from '@capacitor/core'
import TaskResponse from '../components/TaskResponse.vue'
import WorkingSteps from '../components/WorkingSteps.vue'
import MathContent from '../components/MathContent.vue'
import { workingText } from '../domain/tasks'

const { t } = useI18n()

const router = useRouter()
const settings = useSettingsStore()
const smart = useSmartStudyStore()

const confidences: { value: ConfidenceLevel; label: TranslationKey }[] = [
  { value: 'low', label: 'confidence.low' },
  { value: 'medium', label: 'confidence.medium' },
  { value: 'high', label: 'confidence.high' },
]

const progress = computed(() => {
  const session = smart.session
  if (!session?.queue.length) return 100
  return Math.round((session.index / session.queue.length) * 100)
})
const timerLabel = computed(() => (
  smart.session?.durationMs && !smart.isDone ? formatMs(smart.remainingMs) : undefined
))
const feedbackBand = computed(() => (
  !smart.session?.evaluation
    ? null
    : evaluationBand(smart.session.evaluation)
))
const calibration = computed(() => {
  const session = smart.session
  if (!session?.confidenceLevel) return null
  return calibrationMatch(session.confidenceLevel, session.evaluation?.verdict || null)
})
const breakProgress = computed(() => {
  const duration = smart.session?.breakDurationMs || 0
  return duration ? Math.min(1, Math.max(0, 1 - smart.breakRemainingMs / duration)) : 1
})
const nextAvailability = computed(() => smart.availableQueue())
const hasWorking = computed(() => Boolean(workingText(smart.session?.working || [])))
const workingBand = computed(() => smart.session?.workingEvaluation ? evaluationBand(smart.session.workingEvaluation) : null)
const usesAI = computed(() => {
  if (settings.smartConfig.evaluationMode !== 'openrouter') return false
  const task = smart.currentCard?.task
  return !task || ['short_text', 'long_text'].includes(task.kind) || (task.kind === 'calculation' && (task.answer.kind === 'formula' || hasWorking.value))
})
const answerDisplay = computed(() => smart.currentCard?.task?.kind === 'calculation' && smart.currentCard.task.answer.kind === 'formula' && smart.session?.typedAnswer ? `\\(${smart.session.typedAnswer}\\)` : smart.session?.typedAnswer || '')

onMounted(async () => {
  if (!smart.session && !(await smart.start())) {
    await router.replace({ name: 'smart-setup' })
    return
  }
  smart.startTimer()
  window.addEventListener('keydown', handleKeydown)
  await nextTick(focusCurrentInput)
})

onBeforeUnmount(() => {
  smart.stopTimer()
  window.removeEventListener('keydown', handleKeydown)
})

function handleKeydown(event: KeyboardEvent): void {
  const session = smart.session
  if (!session || smart.isDone || smart.isBreak) return
  const target = event.target as HTMLElement
  if (session.phase === 'asking' && event.key === 'Enter' && !event.isComposing && (event.ctrlKey || event.metaKey)) {
    if (target.closest('.smart-answer-area')) {
      event.preventDefault()
      void smart.checkAnswer()
    }
    return
  }
  if (session.phase === 'reviewing' && ['1', '2', '3', '4'].includes(event.key)) {
    if (target.closest('textarea, input, select, math-field, [contenteditable="true"]')) return
    event.preventDefault()
    void rate((Number(event.key) - 1) as Rating)
  }
}

function formatMs(milliseconds: number): string {
  const totalSeconds = Math.ceil(Math.max(0, milliseconds) / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function focusCurrentInput(): void {
  if (Capacitor.isNativePlatform() || window.matchMedia('(pointer: coarse)').matches) return
  if (settings.smartConfig.techniques.typeRecall) {
    document.querySelector<HTMLElement>('.task-response input, .task-response textarea, .task-response math-field, .task-response select')?.focus()
  } else {
    document.querySelector<HTMLElement>('.smart-card-front')?.focus()
  }
}

async function rate(rating: Rating): Promise<void> {
  await smart.rate(rating)
  await nextTick(focusCurrentInput)
}

async function startNext(): Promise<void> {
  if (await smart.start()) {
    await nextTick(focusCurrentInput)
  }
}

async function exit(): Promise<void> {
  smart.stopTimer()
  await router.push('/')
}
</script>

<template>
  <div v-if="smart.session" class="study-shell" :class="{ 'smart-study-shell': !smart.isDone && !smart.isBreak }">
    <StudyHeader
      :title="t('nav.smart')"
      :progress="smart.isDone || smart.isBreak ? 100 : progress"
      :label="smart.isBreak ? t('smart.focusComplete') : (smart.isDone ? t('study.reviewed', { count: smart.session.sessionStats.reviewed }) : t('common.of', { current: smart.session.index + 1, total: smart.session.queue.length }))"
      :smart-timer="timerLabel"
      :compact="!smart.isDone && !smart.isBreak"
      :session-stats="smart.isDone || smart.isBreak ? undefined : smart.session.sessionStats"
      @exit="exit"
    />

    <main v-if="smart.isBreak" class="smart-break-screen">
      <div class="break-icon"><AppIcon :name="smart.session.breakDone ? 'check' : 'coffee'" :size="22" /></div>
      <p class="completion-kicker">{{ smart.session.breakDone ? t('smart.breakReady') : t('smart.pomodoroBreak') }}</p>
      <h1 class="completion-title" tabindex="-1">
        {{ smart.session.breakDone ? t('smart.breakComplete') : t('smart.pause') }}
      </h1>
      <div class="smart-break-timer-wrap">
        <span class="smart-break-timer">{{ formatMs(smart.breakRemainingMs) }}</span>
        <span class="smart-break-label">
          {{ smart.session.breakDone ? t('smart.nextReady') : t('smart.remaining') }}
        </span>
        <div
          class="smart-break-ring"
          role="progressbar"
          :aria-label="t('smart.breakProgress')"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="Math.round(breakProgress * 100)"
        >
          <div class="smart-break-ring-fill" :style="{ '--break-progress': breakProgress }" />
        </div>
      </div>
      <div class="smart-break-meta">
        {{ t('smart.focusReviewed', { count: smart.session.sessionStats.reviewed }) }}
      </div>
      <div class="smart-done-actions">
        <button class="btn btn-smart" type="button" :disabled="!smart.session.breakDone" @click="startNext">
          <AppIcon name="play" :size="17" />
          <span>{{ smart.session.breakDone ? t('smart.startNext') : t('smart.breakRunning') }}</span>
        </button>
        <button class="btn btn-secondary" type="button" @click="router.push('/')">
          <AppIcon name="library" :size="17" /><span>{{ t('study.backLibrary') }}</span>
        </button>
      </div>
    </main>

    <StudyCompletion
      v-else-if="smart.isDone"
      icon="sparkles"
      :kicker="t('smart.complete')"
      :title="t('study.cardReviewed', { count: smart.session.sessionStats.reviewed })"
      :note="smart.session.timeUp ? t('smart.timeUp', { count: settings.smartConfig.duration }) : t('smart.allCards', { count: smart.session.queue.length })"
      :stats="smart.session.sessionStats"
    >
      <div class="smart-done-actions">
        <button
          v-if="nextAvailability.queue.length"
          class="btn btn-smart"
          type="button"
          @click="startNext"
        >
          <AppIcon name="rotate-ccw" :size="17" />
          <span>{{ nextAvailability.hasCore ? t('smart.newSession') : t('smart.practiceAnyway') }}</span>
        </button>
        <button class="btn btn-secondary" type="button" @click="router.push('/smart')">
          <AppIcon name="settings-2" :size="17" /><span>{{ t('smart.adjust') }}</span>
        </button>
        <button class="btn btn-quiet" type="button" @click="router.push('/')">{{ t('study.backLibrary') }}</button>
      </div>
    </StudyCompletion>

    <main v-else-if="smart.currentCard && smart.currentDeck" class="smart-study-main">
      <div class="smart-body">
        <template v-if="smart.session.phase === 'asking'">
          <section
            class="smart-card-block smart-card-front"
            tabindex="-1"
            aria-labelledby="smart-question-label"
            aria-describedby="smart-question-content"
          >
            <SmartCardMeta
              :deck-name="smart.currentDeck.name"
              :ai="usesAI"
              :mode-label="t(smart.session.mode === 'practice' ? 'study.practice' : 'smart.scheduled')"
            />
            <StudyCardBody :key="`${smart.currentCard.id}:${smart.session.index}`" :card="smart.currentCard" side="question" :interactive="settings.smartConfig.techniques.typeRecall" label-id="smart-question-label" content-id="smart-question-content">
              <template v-if="smart.currentCard.task?.kind === 'cloze' && settings.smartConfig.techniques.typeRecall" #content>
                <TaskResponse :task="smart.currentCard.task" :front="smart.currentCard.front" :model-value="smart.session.response || { kind: 'fields', values: {} }" :disabled="smart.session.isEvaluating" @update:model-value="smart.setResponse" @submit="smart.checkAnswer" />
              </template>
            </StudyCardBody>

            <div
              v-if="settings.smartConfig.techniques.confidenceCheck"
              class="smart-confidence"
              role="group"
              aria-labelledby="smart-confidence-label"
            >
              <p id="smart-confidence-label" class="smart-prompt">{{ t('smart.confidence') }}</p>
              <div class="smart-conf-buttons">
                <button
                  v-for="confidence in confidences"
                  :key="confidence.value"
                  class="segment-button"
                  :class="{ 'is-selected': smart.session.confidenceLevel === confidence.value }"
                  type="button"
                  :aria-pressed="smart.session.confidenceLevel === confidence.value"
                  @click="smart.setConfidence(confidence.value)"
                >
                  {{ t(confidence.label) }}
                </button>
              </div>
            </div>
          </section>

          <div v-if="settings.smartConfig.techniques.typeRecall" class="smart-answer-area">
            <TaskResponse
              v-if="smart.currentCard.task?.kind !== 'cloze'"
              :key="`${smart.currentCard.id}:${smart.session.index}`"
              input-id="smart-answer-input"
              :task="smart.currentCard.task"
              :front="smart.currentCard.front"
              :model-value="smart.session.response || { kind: 'text', value: smart.session.typedAnswer }"
              :disabled="smart.session.isEvaluating"
              @update:model-value="smart.setResponse"
              @submit="smart.checkAnswer"
            />
            <p v-if="smart.inputError" class="form-error" role="alert">{{ t(smart.inputError) }}</p>
            <details v-if="smart.currentCard.task?.kind === 'calculation'" class="task-details"><summary>{{ t('task.working') }} <span class="muted">{{ t('common.optional') }}</span></summary><p class="field-hint">{{ t(settings.smartConfig.evaluationMode === 'openrouter' ? 'task.workingHint' : 'task.workingLocal') }}</p><WorkingSteps v-model="smart.session.working" :disabled="smart.session.isEvaluating" :label="t('task.working')" @submit="smart.checkAnswer" /></details>
            <div class="smart-answer-actions">
              <button
                class="btn btn-primary"
                type="button"
                :disabled="smart.session.isEvaluating"
                @click="smart.checkAnswer"
              >
                <AppIcon name="check" :size="17" />
                <span>{{ smart.session.isEvaluating ? t('smart.evaluating') : t('smart.checkAnswer') }}</span>
              </button>
              <button
                class="btn btn-quiet btn-sm"
                type="button"
                :disabled="smart.session.isEvaluating"
                @click="smart.skip"
              >{{ t('smart.dontKnow') }}</button>
            </div>
            <p v-if="smart.session.isEvaluating" class="smart-evaluation-status" role="status">
              {{ t('smart.checking') }}
            </p>
            <div v-if="smart.evaluationError" class="ai-request-error" role="alert">
              <strong>{{ t('ai.requestFailed') }}</strong>
              <p>{{ t(smart.evaluationError) }}</p>
              <p v-if="smart.session.evaluation">{{ t('task.workingRetry') }} · {{ t(`verdict.${smart.session.evaluation.verdict}`) }}</p>
              <p v-else>{{ t('ai.noLocalFallback') }}</p>
              <button class="btn btn-secondary" type="button" @click="router.push('/smart')">{{ t('smart.adjust') }}</button>
            </div>
          </div>
          <div v-else class="show-answer-wrap">
            <button class="btn btn-primary btn-lg" type="button" @click="smart.reveal">
              <AppIcon name="eye" /><span>{{ t('study.reveal') }}</span>
            </button>
          </div>
        </template>

        <template v-else>
          <div class="smart-card-pair">
            <section class="smart-card-block smart-card-front compact" tabindex="-1" :aria-label="t('study.question')">
              <SmartCardMeta
                :deck-name="smart.currentDeck.name"
                :ai="usesAI"
                :mode-label="t('smart.reviewAnswer')"
              />
              <StudyCardBody :card="smart.currentCard" side="question" />
            </section>
            <section class="smart-card-block smart-card-back" tabindex="-1" :aria-label="t('study.answer')">
              <StudyCardBody :card="smart.currentCard" side="answer" :label="t('smart.correctAnswer')" />
            </section>
          </div>

          <div
            v-if="settings.smartConfig.techniques.typeRecall && feedbackBand && smart.session.evaluation"
            class="smart-feedback"
            :class="`smart-feedback-${feedbackBand.band}`"
          >
            <div class="smart-feedback-score">
              <span>{{ t(`verdict.${feedbackBand.verdict}`) }}</span>
              <strong v-if="smart.session.evaluation.source === 'local' && smart.session.evaluation.localSimilarity !== undefined">
                {{ t('smart.localMatch', { value: Math.round((smart.session.evaluation.localSimilarity || 0) * 100) }) }}
              </strong>
              <strong v-else>{{ t(smart.session.evaluation.source === 'local' ? 'task.localChecked' : 'smart.aiReview') }}</strong>
            </div>
            <p v-if="smart.session.evaluation.fallbackReason" class="smart-feedback-fallback">
              {{ t('smart.localFallback', { reason: t(smart.session.evaluation.fallbackReason as TranslationKey) }) }}
            </p>
            <div v-if="smart.session.evaluation.source === 'openrouter'" class="smart-feedback-row">
              <span class="smart-feedback-label">{{ t('smart.feedback') }}</span>
              <span class="smart-feedback-text">{{ smart.session.evaluation.feedback }}</span>
            </div>
            <div class="smart-feedback-row">
              <span class="smart-feedback-label">{{ t('smart.youWrote') }}</span>
              <span class="smart-feedback-text">
                <MathContent v-if="smart.session.typedAnswer" :text="answerDisplay" />
                <em v-else class="muted">{{ t('smart.skipped') }}</em>
              </span>
            </div>
            <template v-if="smart.session.evaluation.parts?.length"><p>{{ smart.session.evaluation.feedback }}</p><ul class="task-part-feedback"><li v-for="(part, i) in smart.session.evaluation.parts" :key="i" :class="part.correct ? 'is-correct' : 'is-incorrect'"><span>{{ part.correct ? '✓' : '✗' }} <MathContent :text="part.label" /></span><span>{{ t('task.received') }}: <MathContent :text="part.actual || '—'" /><template v-if="!part.correct"> · {{ t('task.expected') }}: <MathContent :text="part.expected" /></template></span></li></ul></template>
          </div>
          <section v-if="settings.smartConfig.techniques.typeRecall && smart.session.selfAssessment" class="smart-feedback task-self-assessment"><strong>{{ t('task.selfAssessment') }}</strong><p>{{ t('task.formulaLocal') }}</p><div class="smart-feedback-row"><span class="smart-feedback-label">{{ t('smart.youWrote') }}</span><MathContent :text="answerDisplay" /></div></section>
          <section v-if="settings.smartConfig.techniques.typeRecall && hasWorking && smart.currentCard.task?.kind === 'calculation'" class="smart-feedback" :class="workingBand ? `smart-feedback-${workingBand.band}` : 'task-self-assessment'"><strong>{{ t('task.workingFeedback') }}<template v-if="workingBand"> · {{ workingBand.label }}</template></strong><MathContent :text="workingText(smart.session.working)" /><p v-if="smart.session.workingEvaluation">{{ smart.session.workingEvaluation.feedback }}</p><p v-else>{{ t('task.workingLocal') }}</p></section>

          <div
            v-if="settings.smartConfig.techniques.confidenceCheck && smart.session.confidenceLevel"
            class="smart-calibration"
            :class="calibration === null ? '' : (calibration ? 'is-good' : 'is-off')"
          >
            <AppIcon :name="calibration ? 'check-circle-2' : 'gauge'" :size="16" />
            <span>
              {{ t('smart.confidenceLabel') }} <strong>{{ t(`confidence.${smart.session.confidenceLevel}`) }}</strong>
              <template v-if="calibration !== null">
                · {{ calibration ? t('smart.calibrated') : t('smart.mismatch') }}
              </template>
            </span>
          </div>

          <div v-if="settings.smartConfig.techniques.whyPrompt" class="smart-why">
            <label class="field-label" for="smart-why-input">
              {{ t('smart.why') }} <span class="muted">{{ t('common.optional') }}</span>
            </label>
            <textarea
              id="smart-why-input"
              v-model="smart.session.elaboration"
              class="textarea"
              rows="2"
              :placeholder="t('smart.explanationPlaceholder')"
            />
          </div>

          <StudyRatingButtons class="smart-rating-buttons" @rate="rate" />
        </template>
      </div>
    </main>
  </div>
</template>
