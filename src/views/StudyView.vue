<script setup lang="ts">
import { useI18n } from '../i18n'
import { computed, nextTick, onBeforeUnmount, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import StudyHeader from '../components/StudyHeader.vue'
import { formatDateLabel, isDue } from '../domain/dates'
import { previewIntervals } from '../domain/scheduling/fsrs'
import type { Rating } from '../domain/types'
import { useStudyStore } from '../stores/study'
import StudyCardBody from '../components/StudyCardBody.vue'
import StudyRatingButtons from '../components/StudyRatingButtons.vue'
import StudyCompletion from '../components/StudyCompletion.vue'

const { t, formatNumber } = useI18n()

const route = useRoute()
const router = useRouter()
const study = useStudyStore()
const routeDeckId = computed(() => String(route.params.deckId || ''))

watch(() => study.complete, (done, _previous, onCleanup) => {
  if (!done) return
  study.refreshAvailability()
  const timer = setInterval(study.refreshAvailability, 1000)
  onCleanup(() => clearInterval(timer))
}, { immediate: true })

async function exit() {
  await study.end()
  await router.push('/')
}

const progress = computed(() => {
  if (!study.mainQueue.length) return 100
  const completed = study.phase === 'main' ? study.index : study.mainQueue.length
  return Math.round((completed / study.mainQueue.length) * 100)
})
const progressLabel = computed(() => (
  study.phase === 'main'
    ? `${formatNumber(study.index)} / ${formatNumber(study.mainQueue.length)}${study.learningQueue.length ? ` +${formatNumber(study.learningQueue.length)}` : ''}`
    : t('study.relearning', { current: study.index + 1, total: study.learningQueue.length })
))
const intervals = computed(() => (
  study.currentCard ? previewIntervals(study.currentCard) : []
))
const upcomingDate = computed(() => {
  if (!study.deck || study.deck.cards.some((card) => isDue(card))) return null
  return [...study.deck.cards]
    .filter((card) => card.dueDate)
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate))[0]?.dueDate || null
})

onMounted(async () => {
  const cardIds = new Set(study.deck?.cards.map(card => card.id))
  const staleQueue = study.deckId === routeDeckId.value
    && [...study.mainQueue, ...study.learningQueue].some(id => !cardIds.has(id))
  if (staleQueue) await study.saveSessions()
  if ((study.deckId !== routeDeckId.value || staleQueue) && !study.start(routeDeckId.value)) {
    void router.replace('/')
    return
  }
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('resize', adjustFlashcardHeight)
  void nextTick(adjustFlashcardHeight)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', adjustFlashcardHeight)
})

watch(
  () => [study.currentCard?.id, study.flipped],
  () => void nextTick(adjustFlashcardHeight),
)

function handleKeydown(event: KeyboardEvent): void {
  if ((event.target as HTMLElement)?.closest('button, input, textarea, select, [contenteditable="true"]')) {
    return
  }
  if (!study.flipped && (event.key === ' ' || event.key === 'Enter')) {
    event.preventDefault()
    study.flip()
  } else if (study.flipped && ['1', '2', '3', '4'].includes(event.key)) {
    event.preventDefault()
    void study.rate((Number(event.key) - 1) as Rating)
  }
}

function adjustFlashcardHeight(): void {
  const card = document.querySelector<HTMLElement>('.flashcard')
  if (!card) return
  const cardWidth = card.offsetWidth
  let contentHeight = 0
  card.querySelectorAll<HTMLElement>('.flashcard-face').forEach((face) => {
    const clone = face.cloneNode(true) as HTMLElement
    clone.style.cssText = `position:fixed;inset:auto auto auto -9999px;width:${cardWidth}px;height:auto;min-height:0;overflow:visible;opacity:1;transform:none;visibility:hidden;backface-visibility:visible;`
    document.body.appendChild(clone)
    contentHeight = Math.max(contentHeight, clone.scrollHeight + 18)
    clone.remove()
  })
  const mobile = window.matchMedia('(max-width: 719px)').matches
  const minimum = mobile ? 290 : 310
  const viewportLimit = Math.max(minimum, Math.round(window.innerHeight * (mobile ? 0.5 : 0.62)))
  const height = Math.min(Math.max(contentHeight, minimum), viewportLimit)
  card.style.height = `${height}px`
  card.style.minHeight = `${height}px`
  card.classList.toggle('is-scrollable', contentHeight > viewportLimit)
}
</script>

<template>
  <div v-if="study.deck" class="study-shell">
    <StudyHeader
      :title="study.currentPurpose === 'practice' ? `${study.deck.name} · ${t('study.practice')}` : study.deck.name"
      :progress="study.complete ? 100 : progress"
      :label="study.complete ? t('study.reviewed', { count: study.sessionStats.reviewed }) : progressLabel"
      :compact="!study.complete"
      :session-stats="study.complete ? undefined : study.sessionStats"
      @exit="exit"
    />

    <StudyCompletion v-if="study.complete" :kicker="t('study.complete')" :title="t('study.cardReviewed', { count: study.sessionStats.reviewed })" :stats="study.sessionStats">
      <template v-if="upcomingDate" #note>
        <AppIcon name="calendar-days" :size="16" />
        {{ t('study.nextReview', { date: formatDateLabel(upcomingDate, undefined, { weekday: 'short', month: 'short', day: 'numeric' }) }) }}
      </template>
      <p v-if="!study.availability.count && study.availability.nextPracticeAt">{{ t('study.availableAfter', { time: new Date(study.availability.nextPracticeAt).toLocaleString() }) }}</p>
      <div class="study-done-actions">
        <button v-if="study.deck.cards.length" class="btn btn-primary" type="button" :disabled="!study.availability.count" @click="study.start(study.deck.id)">
          <AppIcon name="rotate-ccw" :size="17" />
          <span>{{ study.deck.cards.some((card) => isDue(card)) ? t('study.studyAgain') : t('study.practiceAgain') }}</span>
        </button>
        <button class="btn btn-secondary" type="button" @click="router.push('/')">
          <AppIcon name="library" :size="17" /><span>{{ t('study.backLibrary') }}</span>
        </button>
      </div>
    </StudyCompletion>

    <template v-else-if="study.currentCard">
      <main class="study-main">
        <p v-if="study.currentPurpose === 'practice'" class="field-hint">{{ t('study.practiceNote') }}</p>
        <div class="flashcard-area">
          <div class="flashcard-scene">
            <div class="flashcard" :class="{ flipped: study.flipped }">
              <section
                class="flashcard-face flashcard-front"
                :tabindex="study.flipped ? -1 : 0"
                :aria-hidden="study.flipped"
                :inert="study.flipped || undefined"
                aria-labelledby="study-front-label"
                aria-describedby="study-front-content"
              >
                <StudyCardBody :card="study.currentCard" side="question" label-id="study-front-label" content-id="study-front-content" />
              </section>
              <section
                class="flashcard-face flashcard-back"
                :tabindex="study.flipped ? 0 : -1"
                :aria-hidden="!study.flipped"
                :inert="!study.flipped || undefined"
                aria-labelledby="study-back-label"
                aria-describedby="study-back-content"
              >
                <StudyCardBody :card="study.currentCard" side="answer" label-id="study-back-label" content-id="study-back-content">
                  <template #actions>
                  <button class="btn-icon card-return-button" type="button" :aria-label="t('study.returnQuestion')" @click="study.flip">
                    <AppIcon name="rotate-ccw" :size="16" />
                  </button>
                  </template>
                </StudyCardBody>
              </section>
            </div>
          </div>
        </div>
      </main>
      <div class="study-actions">
        <StudyRatingButtons v-if="study.flipped" :intervals="study.currentPurpose === 'practice' ? undefined : intervals" @rate="study.rate" />
        <div v-else class="show-answer-wrap">
          <button class="btn btn-primary btn-lg" type="button" @click="study.flip">
            <AppIcon name="eye" /><span>{{ t('study.reveal') }}</span><kbd>{{ t('common.space') }}</kbd>
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
