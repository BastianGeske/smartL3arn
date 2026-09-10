<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import AppBar from '../components/AppBar.vue'
import AppIcon from '../components/AppIcon.vue'
import { isDue } from '../domain/dates'
import { isSmartNeedsPracticeCard } from '../domain/study/smartQueue'
import type { SmartTechniques } from '../domain/types'
import { useLibraryStore } from '../stores/library'
import { useSettingsStore } from '../stores/settings'
import { useSmartStudyStore } from '../stores/smartStudy'
import { useUiStore } from '../stores/ui'

const router = useRouter()
const library = useLibraryStore()
const settings = useSettingsStore()
const smart = useSmartStudyStore()
const ui = useUiStore()

const selectedDecks = computed(() => settings.smartConfig.deckIds
  .map((id) => library.deckById(id))
  .filter((deck) => Boolean(deck)))
const canStart = computed(() => selectedDecks.value.some((deck) => deck && deck.cards.length > 0))
const available = computed(() => canStart.value
  ? smart.availableQueue()
  : { queue: [], hasCore: false, mode: 'practice' as const })
const selectedDue = computed(() => selectedDecks.value.reduce(
  (sum, deck) => sum + (deck?.cards.filter(isDue).length || 0),
  0,
))

const techniques: {
  key: keyof SmartTechniques
  title: string
  icon: string
}[] = [
  { key: 'typeRecall', title: 'Typed recall', icon: 'keyboard' },
  { key: 'confidenceCheck', title: 'Confidence check', icon: 'gauge' },
  { key: 'whyPrompt', title: 'Elaboration prompt', icon: 'message-square-text' },
  { key: 'interleaving', title: 'Interleaving', icon: 'shuffle' },
]
const durations = [
  { value: 10, label: '10 min' },
  { value: 25, label: '25 min (Pomodoro)' },
  { value: 0, label: 'No limit' },
]

onMounted(() => {
  settings.smartConfig.deckIds = settings.smartConfig.deckIds.filter(
    (id) => Boolean(library.deckById(id)),
  )
})

function isSelected(deckId: string): boolean {
  return settings.smartConfig.deckIds.includes(deckId)
}

function toggleDeck(deckId: string, checked: boolean): void {
  if (checked && !isSelected(deckId)) settings.smartConfig.deckIds.push(deckId)
  if (!checked) {
    settings.smartConfig.deckIds = settings.smartConfig.deckIds.filter((id) => id !== deckId)
  }
}

async function start(): Promise<void> {
  if (await smart.start()) {
    await router.push({ name: 'smart-study' })
  } else {
    window.alert('No cards in the selected decks.')
  }
}
</script>

<template>
  <div class="app-shell">
    <AppBar active="smart" />
    <main class="workspace smart-workspace">
      <header class="page-heading">
        <div>
          <p class="page-kicker">Session planner</p>
          <h1>Smart Study</h1>
          <p class="page-subtitle">
            {{ settings.smartConfig.deckIds.length > 0
              ? `${settings.smartConfig.deckIds.length} deck${settings.smartConfig.deckIds.length === 1 ? '' : 's'} selected.`
              : 'Select the decks for this session.' }}
          </p>
        </div>
      </header>

      <div class="smart-config-grid">
        <section class="config-section" aria-labelledby="smart-decks-title">
          <div class="config-heading">
            <div><span class="config-step">1</span><h2 id="smart-decks-title">Choose decks</h2></div>
            <span>{{ settings.smartConfig.deckIds.length }} selected</span>
          </div>
          <div class="smart-deck-list">
            <div v-if="!library.decks.length" class="smart-empty">
              <AppIcon name="layers-3" :size="24" />
              <strong>No decks available</strong>
              <button class="btn btn-secondary btn-sm" type="button" @click="ui.editDeck()">
                <AppIcon name="plus" :size="15" /><span>Create deck</span>
              </button>
            </div>
            <label
              v-for="deck in library.decks"
              v-else
              :key="deck.id"
              class="smart-deck-row"
              :class="{
                'is-selected': isSelected(deck.id),
                'is-disabled': !deck.cards.length,
              }"
            >
              <input
                class="check-input"
                type="checkbox"
                :checked="isSelected(deck.id)"
                :disabled="!deck.cards.length"
                @change="toggleDeck(deck.id, ($event.target as HTMLInputElement).checked)"
              >
              <span class="check-control"><AppIcon name="check" :size="13" /></span>
              <span class="smart-row-body">
                <span class="smart-row-title">{{ deck.name }}</span>
                <span class="smart-row-meta">
                  <span>{{ deck.cards.length }} total</span>
                  <span v-if="deck.cards.filter(isDue).length" class="is-emphasis">
                    {{ deck.cards.filter(isDue).length }} due
                  </span>
                  <span v-else>Caught up</span>
                  <span v-if="deck.cards.filter((card) => !isDue(card) && isSmartNeedsPracticeCard(deck, card.id)).length">
                    {{ deck.cards.filter((card) => !isDue(card) && isSmartNeedsPracticeCard(deck, card.id)).length }} practice
                  </span>
                </span>
              </span>
            </label>
          </div>
        </section>

        <div class="smart-options">
          <aside class="session-plan" aria-label="Session plan">
            <div class="session-plan-heading">
              <span><AppIcon name="sparkles" /></span>
              <div>
                <strong>{{ canStart ? 'Session ready' : 'Session plan' }}</strong>
                <span>{{ canStart ? (available.hasCore ? 'Scheduled review' : 'Practice round') : 'Choose decks to begin' }}</span>
              </div>
            </div>
            <dl class="session-plan-stats">
              <div><dt>Decks</dt><dd>{{ selectedDecks.length }}</dd></div>
              <div><dt>Cards</dt><dd>{{ available.queue.length }}</dd></div>
              <div><dt>Due</dt><dd>{{ selectedDue }}</dd></div>
              <div><dt>Length</dt><dd>{{ settings.smartConfig.duration ? `${settings.smartConfig.duration} min` : 'No limit' }}</dd></div>
            </dl>
            <button class="btn btn-smart btn-lg" type="button" :disabled="!canStart" @click="start">
              <AppIcon name="play" /><span>Start session</span>
            </button>
            <p v-if="!canStart" class="smart-hint">Select at least one deck with cards.</p>
          </aside>

          <section class="config-section" aria-labelledby="smart-techniques-title">
            <div class="config-heading">
              <div><span class="config-step">2</span><h2 id="smart-techniques-title">Techniques</h2></div>
            </div>
            <div class="technique-list">
              <label v-for="technique in techniques" :key="technique.key" class="technique-row">
                <span class="technique-icon"><AppIcon :name="technique.icon" :size="17" /></span>
                <span class="smart-row-title">{{ technique.title }}</span>
                <input
                  v-model="settings.smartConfig.techniques[technique.key]"
                  class="switch-input"
                  type="checkbox"
                >
                <span class="switch-control" aria-hidden="true" />
              </label>
            </div>
          </section>

          <section class="config-section" aria-labelledby="smart-duration-title">
            <div class="config-heading">
              <div><span class="config-step">3</span><h2 id="smart-duration-title">Session length</h2></div>
            </div>
            <div class="segmented-control" aria-label="Session length">
              <button
                v-for="duration in durations"
                :key="duration.value"
                class="segment-button"
                :class="{ 'is-selected': settings.smartConfig.duration === duration.value }"
                type="button"
                :aria-pressed="settings.smartConfig.duration === duration.value"
                @click="settings.smartConfig.duration = duration.value"
              >
                {{ duration.label }}
              </button>
            </div>
          </section>
        </div>
      </div>
    </main>
  </div>
</template>
