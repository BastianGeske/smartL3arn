<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppBar from '../components/AppBar.vue'
import AppIcon from '../components/AppIcon.vue'
import { calcBestStreak, calcStreak, formatDateLabel, isDue, todayStr } from '../domain/dates'
import type { Deck } from '../domain/types'
import { importJsonFile, importTextFile } from '../services/importer'
import { saveExport } from '../services/native'
import { useLibraryStore } from '../stores/library'
import { useStudyStore } from '../stores/study'
import { useUiStore } from '../stores/ui'

const router = useRouter()
const library = useLibraryStore()
const study = useStudyStore()
const ui = useUiStore()
const jsonInput = ref<HTMLInputElement>()
const textInput = ref<HTMLInputElement>()

const totalCards = computed(() => library.decks.reduce((sum, deck) => sum + deck.cards.length, 0))
const totalDue = computed(() => library.decks.reduce(
  (sum, deck) => sum + deck.cards.filter((card) => isDue(card)).length,
  0,
))
const activeDecks = computed(() => library.decks.filter((deck) => deck.cards.length > 0).length)
const bestStreak = computed(() => Math.max(
  0,
  ...library.decks.map((deck) => calcBestStreak(deck.sessions)),
))
const nextReview = computed(() => library.decks
  .flatMap((deck) => deck.cards.map((card) => card.dueDate))
  .filter((date) => date && date > todayStr())
  .sort()[0] || null)
const todayLabel = new Intl.DateTimeFormat(document.documentElement.lang || 'en', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
}).format(new Date())
const sortedDecks = computed(() => [...library.decks].sort((left, right) => {
  const dueDifference = right.cards.filter(isDue).length - left.cards.filter(isDue).length
  return dueDifference || left.name.localeCompare(right.name)
}))

function deckDue(deck: Deck): number {
  return deck.cards.filter(isDue).length
}

function nextDueDate(deck: Deck): string | null {
  return deck.cards
    .map((card) => card.dueDate)
    .filter((date) => date && date > todayStr())
    .sort()[0] || null
}

function browse(deckId: string): void {
  void router.push({ name: 'browse', params: { deckId } })
}

function start(deck: Deck): void {
  if (study.start(deck.id)) {
    void router.push({ name: 'study', params: { deckId: deck.id } })
  }
}

async function removeDeck(deck: Deck): Promise<void> {
  if (!window.confirm(`Delete deck "${deck.name}" and all its cards?`)) return
  await library.deleteDeck(deck.id)
  ui.showToast('Deck deleted.')
}

async function handleJson(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const decks = await importJsonFile(file)
    await library.addDecks(decks)
    ui.showToast(`Imported ${decks.length} deck${decks.length === 1 ? '' : 's'}.`)
  } catch (error) {
    window.alert(`Failed to import: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    input.value = ''
  }
}

async function handleText(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const deck = await importTextFile(file)
    await library.addDeck(deck)
    ui.showToast(`Created "${deck.name}" with ${deck.cards.length} cards.`)
  } catch (error) {
    window.alert(`Failed to import: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    input.value = ''
  }
}

async function exportAll(): Promise<void> {
  if (!library.decks.length) return
  await saveExport(
    `smartL3arn_backup_${todayStr()}.json`,
    JSON.stringify(library.data, null, 2),
    'application/json',
  )
}
</script>

<template>
  <div class="app-shell">
    <AppBar active="library" />
    <main class="workspace">
      <header class="page-heading">
        <div>
          <p class="page-kicker">{{ todayLabel }}</p>
          <h1>Library</h1>
          <p class="page-subtitle">
            {{ totalDue > 0 ? `${totalDue} card${totalDue === 1 ? '' : 's'} ready for review.` : 'Your scheduled reviews are complete.' }}
          </p>
        </div>
        <div class="page-heading-actions">
          <button class="btn btn-primary" type="button" @click="ui.editDeck()">
            <AppIcon name="plus" :size="17" /><span>New deck</span>
          </button>
        </div>
      </header>

      <section class="summary-strip" aria-label="Collection summary">
        <div class="summary-item">
          <span class="summary-icon"><AppIcon name="calendar-days" /></span>
          <div><strong>{{ totalDue }}</strong><span>Due now</span></div>
        </div>
        <div class="summary-item">
          <span class="summary-icon"><AppIcon name="layers-3" /></span>
          <div><strong>{{ totalCards }}</strong><span>Total cards</span></div>
        </div>
        <div class="summary-item">
          <span class="summary-icon"><AppIcon name="book-open" /></span>
          <div><strong>{{ activeDecks }}</strong><span>Active decks</span></div>
        </div>
        <div class="summary-item">
          <span class="summary-icon">
            <AppIcon :name="bestStreak > 0 ? 'flame' : 'clock-3'" />
          </span>
          <div>
            <strong>{{ bestStreak > 0 ? `${bestStreak}d` : (nextReview ? formatDateLabel(nextReview) : 'Clear') }}</strong>
            <span>{{ bestStreak > 0 ? 'Best streak' : 'Next review' }}</span>
          </div>
        </div>
      </section>

      <section class="library-section" aria-labelledby="deck-list-title">
        <div class="section-heading">
          <div>
            <h2 id="deck-list-title">Your decks</h2>
            <span class="section-count">{{ library.decks.length }}</span>
          </div>
          <details class="menu">
            <summary class="btn btn-secondary btn-sm">
              <AppIcon name="folder-open" :size="15" /><span>Import / export</span><AppIcon name="chevron-down" :size="14" />
            </summary>
            <div class="menu-popover menu-popover-right menu-popover-wide">
              <button class="menu-item" type="button" @click="jsonInput?.click()">
                <AppIcon name="file-json" :size="16" /><span>Import JSON</span>
              </button>
              <button class="menu-item" type="button" @click="textInput?.click()">
                <AppIcon name="file-text" :size="16" /><span>Import TXT / CSV</span>
              </button>
              <template v-if="library.decks.length">
                <div class="menu-divider" />
                <button class="menu-item" type="button" @click="exportAll">
                  <AppIcon name="archive" :size="16" /><span>Export full backup</span>
                </button>
              </template>
            </div>
          </details>
          <input ref="jsonInput" class="file-input" type="file" accept=".json" @change="handleJson">
          <input ref="textInput" class="file-input" type="file" accept=".txt,.csv,.tsv" @change="handleText">
        </div>

        <div v-if="!library.decks.length" class="empty-state">
          <img src="/icon.png" alt="" class="empty-state-mark">
          <h2>Build your first deck</h2>
          <p>Add cards one by one or import an existing collection.</p>
          <button class="btn btn-primary" type="button" @click="ui.editDeck()">
            <AppIcon name="plus" :size="17" /><span>Create deck</span>
          </button>
        </div>

        <div v-else class="deck-list">
          <article v-for="deck in sortedDecks" :key="deck.id" class="deck-row">
            <div class="deck-row-icon"><AppIcon name="book-open" :size="20" /></div>
            <div class="deck-row-main">
              <h3 class="deck-name" :title="deck.name">{{ deck.name }}</h3>
              <div class="deck-meta">
                <span>{{ deck.cards.length }} card{{ deck.cards.length === 1 ? '' : 's' }}</span>
                <span v-if="deck.sessions?.length">
                  <AppIcon name="history" :size="14" />
                  Last reviewed {{ formatDateLabel(deck.sessions.at(-1)?.date || '') }}
                </span>
                <span v-else>Not studied yet</span>
                <span v-if="calcStreak(deck.sessions) > 0">
                  <AppIcon name="flame" :size="14" /> {{ calcStreak(deck.sessions) }} day streak
                </span>
              </div>
            </div>
            <div class="deck-row-status">
              <template v-if="deckDue(deck) > 0">
                <span class="deck-due is-due">{{ deckDue(deck) }} due</span>
                <span class="deck-status-label">Ready now</span>
              </template>
              <template v-else>
                <span class="deck-due is-clear"><AppIcon name="check" :size="14" /> Caught up</span>
                <span class="deck-status-label">
                  {{ nextDueDate(deck) ? `Next ${formatDateLabel(nextDueDate(deck) || '')}` : 'No reviews scheduled' }}
                </span>
              </template>
            </div>
            <div class="deck-row-actions">
              <button
                class="btn btn-sm"
                :class="deckDue(deck) ? 'btn-primary' : (deck.cards.length ? 'btn-quiet' : 'btn-secondary')"
                type="button"
                @click="deck.cards.length ? start(deck) : browse(deck.id)"
              >
                <AppIcon :name="deckDue(deck) ? 'play' : 'book-open'" :size="15" />
                <span>{{ !deck.cards.length ? 'Add cards' : (deckDue(deck) ? `Study ${deckDue(deck)}` : 'Practice') }}</span>
              </button>
              <button class="btn btn-quiet btn-sm" type="button" @click="browse(deck.id)">
                <AppIcon name="rows-3" :size="15" /><span>Browse</span>
              </button>
              <details class="menu deck-menu">
                <summary class="btn-icon" :aria-label="`More actions for ${deck.name}`">
                  <AppIcon name="more-horizontal" />
                </summary>
                <div class="menu-popover menu-popover-right">
                  <button class="menu-item" type="button" @click="ui.editDeck(deck.id)">
                    <AppIcon name="pencil" :size="16" /><span>Rename</span>
                  </button>
                  <button class="menu-item is-danger" type="button" @click="removeDeck(deck)">
                    <AppIcon name="trash-2" :size="16" /><span>Delete deck</span>
                  </button>
                </div>
              </details>
            </div>
          </article>
        </div>
      </section>
    </main>
  </div>
</template>
