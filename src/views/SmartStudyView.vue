<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import SessionStats from '../components/SessionStats.vue'
import StudyHeader from '../components/StudyHeader.vue'
import {
  calibrationMatch,
  similarityBand,
} from '../domain/study/answerSimilarity'
import type { ConfidenceLevel, Rating } from '../domain/types'
import { useSettingsStore } from '../stores/settings'
import { useSmartStudyStore } from '../stores/smartStudy'

const router = useRouter()
const settings = useSettingsStore()
const smart = useSmartStudyStore()

const ratings: { value: Rating; label: string }[] = [
  { value: 0, label: 'Again' },
  { value: 1, label: 'Hard' },
  { value: 2, label: 'Good' },
  { value: 3, label: 'Easy' },
]
const confidences: { value: ConfidenceLevel; label: string }[] = [
  { value: 'low', label: 'Not sure' },
  { value: 'medium', label: 'Maybe' },
  { value: 'high', label: 'Confident' },
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
  smart.session?.similarity === null || smart.session?.similarity === undefined
    ? null
    : similarityBand(smart.session.similarity)
))
const calibration = computed(() => {
  const session = smart.session
  if (!session?.confidenceLevel) return null
  return calibrationMatch(session.confidenceLevel, session.similarity)
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
      smart.checkAnswer()
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
      title="Smart Study"
      :progress="smart.isDone || smart.isBreak ? 100 : progress"
      :label="smart.isBreak ? 'Focus block complete' : (smart.isDone ? `${smart.session.sessionStats.reviewed} reviewed` : `${smart.session.index + 1} of ${smart.session.queue.length}`)"
      :smart-timer="timerLabel"
      @exit="exit"
    />

    <main v-if="smart.isBreak" class="smart-break-screen">
      <div class="break-icon"><AppIcon :name="smart.session.breakDone ? 'check' : 'coffee'" :size="22" /></div>
      <p class="completion-kicker">{{ smart.session.breakDone ? 'Ready' : 'Pomodoro break' }}</p>
      <h1 class="completion-title" tabindex="-1">
        {{ smart.session.breakDone ? 'Break complete' : 'Pause and reset' }}
      </h1>
      <div class="smart-break-timer-wrap">
        <span class="smart-break-timer">{{ formatMs(smart.breakRemainingMs) }}</span>
        <span class="smart-break-label">
          {{ smart.session.breakDone ? 'Ready for the next round' : 'Remaining' }}
        </span>
        <div
          class="smart-break-ring"
          role="progressbar"
          aria-label="Break progress"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="Math.round(breakProgress * 100)"
        >
          <div class="smart-break-ring-fill" :style="{ '--break-progress': breakProgress }" />
        </div>
      </div>
      <div class="smart-break-meta">
        {{ smart.session.sessionStats.reviewed }} card{{ smart.session.sessionStats.reviewed === 1 ? '' : 's' }} reviewed in this focus block.
      </div>
      <div class="smart-done-actions">
        <button class="btn btn-smart" type="button" :disabled="!smart.session.breakDone" @click="startNext">
          <AppIcon name="play" :size="17" />
          <span>{{ smart.session.breakDone ? 'Start next session' : 'Break in progress' }}</span>
        </button>
        <button class="btn btn-secondary" type="button" @click="router.push('/')">
          <AppIcon name="library" :size="17" /><span>Back to library</span>
        </button>
      </div>
    </main>

    <main v-else-if="smart.isDone" class="study-done" tabindex="-1">
      <div class="completion-mark"><AppIcon name="sparkles" :size="23" /></div>
      <p class="completion-kicker">Smart Study complete</p>
      <h1 class="completion-title" tabindex="-1">
        {{ smart.session.sessionStats.reviewed }} card{{ smart.session.sessionStats.reviewed === 1 ? '' : 's' }} reviewed
      </h1>
      <p class="completion-note">
        {{ smart.session.timeUp
          ? `Time's up after ${settings.smartConfig.duration} minutes.`
          : `You went through all ${smart.session.queue.length} cards.` }}
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
          <span>{{ nextAvailability.hasCore ? 'New Smart Session' : 'Practice Anyway' }}</span>
        </button>
        <button class="btn btn-secondary" type="button" @click="router.push('/smart')">
          <AppIcon name="settings-2" :size="17" /><span>Adjust setup</span>
        </button>
        <button class="btn btn-quiet" type="button" @click="router.push('/')">Back to library</button>
      </div>
    </main>

    <main v-else-if="smart.currentCard && smart.currentDeck" class="smart-study-main">
      <div class="smart-body">
        <div class="smart-session-meta">
          <span class="smart-deck-tag">
            <AppIcon name="book-open" :size="13" />{{ smart.currentDeck.name }}
          </span>
          <span>{{ smart.session.phase === 'asking'
            ? (smart.session.mode === 'practice' ? 'Practice' : 'Scheduled review')
            : 'Review answer' }}</span>
        </div>

        <template v-if="smart.session.phase === 'asking'">
          <section
            class="smart-card-block smart-card-front"
            tabindex="-1"
            aria-labelledby="smart-question-label"
            aria-describedby="smart-question-content"
          >
            <div id="smart-question-label" class="card-side-label">Question</div>
            <div id="smart-question-content" class="card-content">{{ smart.currentCard.front }}</div>
          </section>

          <div
            v-if="settings.smartConfig.techniques.confidenceCheck"
            class="smart-confidence"
            role="group"
            aria-labelledby="smart-confidence-label"
          >
            <p id="smart-confidence-label" class="smart-prompt">Confidence</p>
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
                {{ confidence.label }}
              </button>
            </div>
          </div>

          <div v-if="settings.smartConfig.techniques.typeRecall" class="smart-answer-area">
            <label class="field-label" for="smart-answer-input">Your answer</label>
            <textarea
              id="smart-answer-input"
              v-model="smart.session.typedAnswer"
              class="textarea smart-answer-input"
              rows="3"
              placeholder="Type your answer"
            />
            <div class="smart-answer-actions">
              <button class="btn btn-primary" type="button" @click="smart.checkAnswer">
                <AppIcon name="check" :size="17" /><span>Check answer</span>
              </button>
              <button class="btn btn-quiet btn-sm" type="button" @click="smart.skip">I don't know</button>
            </div>
          </div>
          <div v-else class="show-answer-wrap">
            <button class="btn btn-primary btn-lg" type="button" @click="smart.reveal">
              <AppIcon name="eye" /><span>Reveal answer</span>
            </button>
          </div>
        </template>

        <template v-else>
          <div class="smart-card-pair">
            <section class="smart-card-block smart-card-front compact" tabindex="-1" aria-label="Question">
              <div class="card-side-label">Question</div>
              <div class="card-content">{{ smart.currentCard.front }}</div>
            </section>
            <section class="smart-card-block smart-card-back" tabindex="-1" aria-label="Answer">
              <div class="card-side-label">Answer</div>
              <div class="card-content">{{ smart.currentCard.back }}</div>
            </section>
          </div>

          <div
            v-if="settings.smartConfig.techniques.typeRecall && feedbackBand && smart.session.similarity !== null"
            class="smart-feedback"
            :class="`smart-feedback-${feedbackBand.band}`"
          >
            <div class="smart-feedback-score">
              <span>{{ feedbackBand.label }}</span>
              <strong>{{ Math.round(smart.session.similarity * 100) }}% match</strong>
            </div>
            <div class="smart-feedback-row">
              <span class="smart-feedback-label">You wrote:</span>
              <span class="smart-feedback-text">
                <template v-if="smart.session.typedAnswer">{{ smart.session.typedAnswer }}</template>
                <em v-else class="muted">(skipped)</em>
              </span>
            </div>
            <div class="smart-feedback-row">
              <span class="smart-feedback-label">Correct:</span>
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
              Confidence: <strong>{{ smart.session.confidenceLevel }}</strong>
              <template v-if="calibration !== null">
                · {{ calibration ? 'well calibrated' : 'mismatch — recalibrate next time' }}
              </template>
            </span>
          </div>

          <div v-if="settings.smartConfig.techniques.whyPrompt" class="smart-why">
            <label class="field-label" for="smart-why-input">
              Why is this correct? <span class="muted">(optional)</span>
            </label>
            <textarea
              id="smart-why-input"
              v-model="smart.session.elaboration"
              class="textarea"
              rows="2"
              placeholder="Add a short explanation"
            />
          </div>

          <div class="rating-buttons smart-rating-buttons" role="group" aria-label="Rate this answer">
            <button
              v-for="rating in ratings"
              :key="rating.value"
              class="rating-button"
              :class="[
                `rating-${rating.label.toLowerCase()}`,
                { 'is-suggested': feedbackBand?.suggested === rating.value },
              ]"
              type="button"
              @click="rate(rating.value)"
            >
              <span>{{ rating.label }}</span>
              <strong :class="{ 'suggested-label': feedbackBand?.suggested === rating.value }">
                {{ feedbackBand?.suggested === rating.value ? 'Suggested' : 'Rate' }}
              </strong>
            </button>
          </div>
        </template>
      </div>
      <SessionStats :stats="smart.session.sessionStats" />
    </main>
  </div>
</template>
