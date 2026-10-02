<script setup lang="ts">
import { useI18n, type TranslationKey } from '../i18n'
import { computed, nextTick, onBeforeUnmount, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import SessionStats from '../components/SessionStats.vue'
import StudyHeader from '../components/StudyHeader.vue'
import {
  calibrationMatch,
  evaluationBand,
} from '../domain/study/answerSimilarity'
import type { ConfidenceLevel, Rating } from '../domain/types'
import { useSettingsStore } from '../stores/settings'
import { useSmartStudyStore } from '../stores/smartStudy'

const { t } = useI18n()

const router = useRouter()
const settings = useSettingsStore()
const smart = useSmartStudyStore()

const ratings: { value: Rating; key: string; label: TranslationKey }[] = [
  { value: 0, key: 'again', label: 'rating.again' },
  { value: 1, key: 'hard', label: 'rating.hard' },
  { value: 2, key: 'good', label: 'rating.good' },
  { value: 3, key: 'easy', label: 'rating.easy' },
]
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
  if (session.phase === 'asking' && event.key === 'Enter' && !event.shiftKey) {
    if (target.id === 'smart-answer-input') {
      event.preventDefault()
      void smart.checkAnswer()
    }
    return
  }
  if (session.phase === 'reviewing' && ['1', '2', '3', '4'].includes(event.key)) {
    if (target.closest('textarea, input')) return
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
  if (settings.smartConfig.techniques.typeRecall) {
    document.querySelector<HTMLTextAreaElement>('#smart-answer-input')?.focus()
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

    <main v-else-if="smart.isDone" class="study-done" tabindex="-1">
      <div class="completion-mark"><AppIcon name="sparkles" :size="23" /></div>
      <p class="completion-kicker">{{ t('smart.complete') }}</p>
      <h1 class="completion-title" tabindex="-1">
        {{ t('study.cardReviewed', { count: smart.session.sessionStats.reviewed }) }}
      </h1>
      <p class="completion-note">
        {{ smart.session.timeUp
          ? t('smart.timeUp', { count: settings.smartConfig.duration })
          : t('smart.allCards', { count: smart.session.queue.length }) }}
      </p>
      <SessionStats :stats="smart.session.sessionStats" extra-class="session-stats-done" />
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
    </main>

    <main v-else-if="smart.currentCard && smart.currentDeck" class="smart-study-main">
      <div class="smart-body">
        <div class="smart-session-meta">
          <span class="smart-deck-tag">
            <AppIcon name="book-open" :size="13" />{{ smart.currentDeck.name }}
          </span>
          <span>{{ smart.session.phase === 'asking'
            ? (smart.session.mode === 'practice' ? t('study.practice') : t('smart.scheduled'))
            : t('smart.reviewAnswer') }}</span>
        </div>

        <template v-if="smart.session.phase === 'asking'">
          <section
            class="smart-card-block smart-card-front"
            tabindex="-1"
            aria-labelledby="smart-question-label"
            aria-describedby="smart-question-content"
          >
            <div id="smart-question-label" class="card-side-label">{{ t('study.question') }}</div>
            <div id="smart-question-content" class="card-content">{{ smart.currentCard.front }}</div>
          </section>

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

          <div v-if="settings.smartConfig.techniques.typeRecall" class="smart-answer-area">
            <label class="field-label" for="smart-answer-input">{{ t('smart.yourAnswer') }}</label>
            <textarea
              id="smart-answer-input"
              v-model="smart.session.typedAnswer"
              class="textarea smart-answer-input"
              rows="3"
              :placeholder="t('smart.answerPlaceholder')"
              :disabled="smart.session.isEvaluating"
            />
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
              <div class="card-side-label">{{ t('study.question') }}</div>
              <div class="card-content">{{ smart.currentCard.front }}</div>
            </section>
            <section class="smart-card-block smart-card-back" tabindex="-1" :aria-label="t('study.answer')">
              <div class="card-side-label">{{ t('study.answer') }}</div>
              <div class="card-content">{{ smart.currentCard.back }}</div>
            </section>
          </div>

          <div
            v-if="settings.smartConfig.techniques.typeRecall && feedbackBand && smart.session.evaluation"
            class="smart-feedback"
            :class="`smart-feedback-${feedbackBand.band}`"
          >
            <div class="smart-feedback-score">
              <span>{{ t(`verdict.${feedbackBand.verdict}`) }}</span>
              <strong v-if="smart.session.evaluation.source === 'local'">
                {{ t('smart.localMatch', { value: Math.round((smart.session.evaluation.localSimilarity || 0) * 100) }) }}
              </strong>
              <strong v-else>{{ t('smart.aiReview') }}</strong>
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
                <template v-if="smart.session.typedAnswer">{{ smart.session.typedAnswer }}</template>
                <em v-else class="muted">{{ t('smart.skipped') }}</em>
              </span>
            </div>
            <div class="smart-feedback-row">
              <span class="smart-feedback-label">{{ t('smart.correctAnswer') }}</span>
              <span class="smart-feedback-text smart-feedback-correct">{{ smart.currentCard.back }}</span>
            </div>
          </div>

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

          <div class="rating-buttons smart-rating-buttons" role="group" :aria-label="t('study.rateAnswer')">
            <button
              v-for="rating in ratings"
              :key="rating.value"
              class="rating-button"
              :class="`rating-${rating.key}`"
              type="button"
              :aria-keyshortcuts="String(rating.value + 1)"
              @click="rate(rating.value)"
            >
              <span>{{ t(rating.label) }} <kbd>{{ rating.value + 1 }}</kbd></span>
              <strong>{{ t('rating.rate') }}</strong>
            </button>
          </div>
        </template>
      </div>
      <SessionStats :stats="smart.session.sessionStats" />
    </main>
  </div>
</template>
