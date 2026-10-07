<script setup lang="ts">
import { useI18n } from '../i18n'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppBar from '../components/AppBar.vue'
import AppIcon from '../components/AppIcon.vue'
import AppMenu from '../components/AppMenu.vue'
import { calcBestStreak, formatDateLabel, isDue, todayStr } from '../domain/dates'
import type { Deck } from '../domain/types'
import { coverFor, coverUrl } from '../domain/deckCovers'
import { importErrorKey, importJsonFile, importTextFile } from '../services/importer'
import { saveExport } from '../services/native'
import { useLibraryStore } from '../stores/library'
import { useStudyStore } from '../stores/study'
import { useUiStore } from '../stores/ui'

const { t, locale, formatNumber } = useI18n()

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
const sortedDecks = computed(() => [...library.decks].sort((left, right) => {
  const dueDifference = right.cards.filter((card) => isDue(card)).length - left.cards.filter((card) => isDue(card)).length
  return dueDifference || left.name.localeCompare(right.name, locale.value)
}))

function deckDue(deck: Deck): number {
  return deck.cards.filter((card) => isDue(card)).length
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
  if (!window.confirm(t('deck.deleteConfirm', { name: deck.name }))) return
  try { await library.deleteDeck(deck.id); ui.showToast('deck.deleted') }
  catch { /* The persistent library notice reports failed saving. */ }
}

async function handleJson(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    let decks: Deck[]
    try { decks = await importJsonFile(file) }
    catch (error) { ui.showError(importErrorKey(error)); return }
    try { await library.addDecks(decks) }
    catch { return }
    ui.showToast('import.decks', { count: decks.length })
  } finally {
    input.value = ''
  }
}

async function handleText(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    let deck: Deck
    try { deck = await importTextFile(file) }
    catch (error) { ui.showError(importErrorKey(error)); return }
    try { await library.addDeck(deck) }
    catch { return }
    ui.showToast('import.created', { name: deck.name, count: deck.cards.length })
  } finally {
    input.value = ''
  }
}

async function exportAll(): Promise<void> {
  if (!library.decks.length) return
  try { await saveExport(
    `smartL3arn_backup_${todayStr()}.json`,
    JSON.stringify(library.data, null, 2),
    'application/json',
  ) } catch { ui.showError('notifications.exportFailed') }
}
</script>

<template>
  <div class="app-shell">
    <AppBar active="library"><button class="btn btn-primary btn-sm" type="button" @click="ui.editDeck()"><AppIcon name="plus" :size="16" />{{ t('deck.new') }}</button></AppBar>
    <main class="workspace library-workspace">
      <header class="page-heading">
        <div>
          <p class="page-kicker">{{ t('library.kicker') }}</p>
          <h1>{{ t('library.hero') }} <span>{{ t('library.heroAccent') }}</span></h1>
          <p class="page-subtitle">
            {{ totalDue > 0 ? t('library.ready', { count: totalDue }) : t('library.complete') }}
          </p>
        </div>
        <div class="page-heading-actions">
          <button class="btn btn-primary" type="button" :disabled="!totalCards" @click="router.push('/smart')">
            <AppIcon name="sparkles" :size="17" /><span>{{ t('library.startSmart') }}</span>
          </button>
        </div>
      </header>

      <div class="library-overview">
      <section class="summary-strip" :aria-label="t('library.summary')">
        <div class="summary-item">
          <span class="summary-icon"><AppIcon name="calendar-days" /></span>
          <div><strong>{{ formatNumber(totalDue) }}</strong><span>{{ t('common.dueNow') }}</span></div>
        </div>
        <div class="summary-item">
          <span class="summary-icon"><AppIcon name="layers-3" /></span>
          <div><strong>{{ formatNumber(totalCards) }}</strong><span>{{ t('library.totalCards') }}</span></div>
        </div>
        <div class="summary-item">
          <span class="summary-icon"><AppIcon name="book-open" /></span>
          <div><strong>{{ formatNumber(activeDecks) }}</strong><span>{{ t('library.activeDecks') }}</span></div>
        </div>
        <div class="summary-item">
          <span class="summary-icon">
            <AppIcon :name="bestStreak > 0 ? 'flame' : 'clock-3'" />
          </span>
          <div>
            <strong>{{ bestStreak > 0 ? t('common.daysShort', { count: bestStreak }) : (nextReview ? formatDateLabel(nextReview) : t('library.clear')) }}</strong>
            <span>{{ bestStreak > 0 ? t('library.bestStreak') : t('library.nextReview') }}</span>
          </div>
        </div>
      </section>
      <div class="library-transfer">
          <AppMenu class="menu" trigger-class="btn btn-secondary btn-sm" :label="t('import.menu')" wide>
              <template #trigger>
              <AppIcon name="folder-open" :size="15" /><span>{{ t('import.menu') }}</span><AppIcon name="chevron-down" :size="14" />
            </template>

              <button class="menu-item" type="button" @click="jsonInput?.click()">
                <AppIcon name="file-json" :size="16" /><span>{{ t('import.json') }}</span>
              </button>
              <button class="menu-item" type="button" @click="textInput?.click()">
                <AppIcon name="file-text" :size="16" /><span>{{ t('import.text') }}</span>
              </button>
              <template v-if="library.decks.length">
                <div class="menu-divider" />
                <button class="menu-item" type="button" @click="exportAll">
                  <AppIcon name="archive" :size="16" /><span>{{ t('import.backup') }}</span>
                </button>
              </template>

            </AppMenu>
          <input ref="jsonInput" class="file-input" type="file" accept=".json" @change="handleJson">
          <input ref="textInput" class="file-input" type="file" accept=".txt,.csv,.tsv" @change="handleText">
      </div>
      </div>

      <section class="library-section" aria-labelledby="deck-list-title">
        <div class="section-heading">
          <div>
            <h2 id="deck-list-title">{{ t('library.yourDecks') }}</h2>
            <span class="section-count">{{ formatNumber(library.decks.length) }}</span>
          </div>

        </div>

        <div v-if="!library.decks.length" class="empty-state">
          <img src="/icon.png" alt="" class="empty-state-mark">
          <h2>{{ t('library.firstDeck') }}</h2>
          <p>{{ t('library.emptyDescription') }}</p>
          <button class="btn btn-primary" type="button" @click="ui.editDeck()">
            <AppIcon name="plus" :size="17" /><span>{{ t('deck.create') }}</span>
          </button>
        </div>

        <div v-else class="deck-list">
          <article v-for="deck in sortedDecks" :key="deck.id" class="deck-row">
            <button class="deck-cover" type="button" :aria-label="t('library.browseDeck', { name: deck.name })" @click="browse(deck.id)"><img :src="coverUrl(coverFor(deck).id)" alt=""><AppIcon :name="coverFor(deck).icon" :size="58" /></button>
            <div class="deck-row-main">
              <h3 class="deck-name" :title="deck.name">{{ deck.name }}</h3>
              <div class="deck-meta">
                <span>{{ t('library.cardCount', { count: deck.cards.length }) }}</span>
                <span v-if="deck.sessions?.length">
                  <AppIcon name="history" :size="14" />
                  {{ t('library.lastReviewed', { date: formatDateLabel(deck.sessions.at(-1)?.date || '') }) }}
                </span>
                <span v-else>{{ t('library.notStudied') }}</span>
              </div>
            </div>
            <div class="deck-row-status">
              <template v-if="deckDue(deck) > 0">
                <span class="deck-due is-due">{{ t('library.dueCount', { count: deckDue(deck) }) }}</span>
                <span class="deck-status-label">{{ t('library.readyNow') }}</span>
              </template>
              <template v-else>
                <span class="deck-due is-clear"><AppIcon name="check" :size="14" /> {{ t('library.caughtUp') }}</span>
                <span class="deck-status-label">
                  {{ nextDueDate(deck) ? t('library.next', { date: formatDateLabel(nextDueDate(deck) || '') }) : t('library.noReviews') }}
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
                <span>{{ !deck.cards.length ? t('card.addMany') : (deckDue(deck) ? t('study.study') : t('study.practice')) }}</span>
              </button>
              <button class="btn btn-quiet btn-sm" type="button" @click="browse(deck.id)">
                <AppIcon name="rows-3" :size="15" /><span>{{ t('study.browse') }}</span>
              </button>
              <AppMenu class="menu deck-menu" trigger-class="btn-icon" :label="t('library.moreActions', { name: deck.name })">
              <template #trigger>
                  <AppIcon name="more-horizontal" />
                </template>

                  <button class="menu-item" type="button" @click="ui.editDeck(deck.id)">
                    <AppIcon name="pencil" :size="16" /><span>{{ t('deck.editShort') }}</span>
                  </button>
                  <button class="menu-item is-danger" type="button" @click="removeDeck(deck)">
                    <AppIcon name="trash-2" :size="16" /><span>{{ t('deck.delete') }}</span>
                  </button>

            </AppMenu>
            </div>
          </article>
        </div>
      </section>
    </main>
  </div>
</template>
