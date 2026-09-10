<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppBar from '../components/AppBar.vue'
import AppIcon from '../components/AppIcon.vue'
import { calcStreak, isDue, todayStr } from '../domain/dates'
import {
  deckFilename,
  deckToAnkiText,
  deckToCsv,
} from '../domain/importExport'
import type { Card } from '../domain/types'
import { cardsFromTextFile } from '../services/importer'
import { saveExport } from '../services/native'
import { useLibraryStore } from '../stores/library'
import { useStudyStore } from '../stores/study'
import { useUiStore } from '../stores/ui'

type SortColumn = 'front' | 'back' | 'dueDate' | 'interval' | 'difficulty'

const route = useRoute()
const router = useRouter()
const library = useLibraryStore()
const study = useStudyStore()
const ui = useUiStore()
const filter = ref('')
const sortColumn = ref<SortColumn>('dueDate')
const sortDirection = ref<'asc' | 'desc'>('asc')
const importInput = ref<HTMLInputElement>()

const deckId = computed(() => String(route.params.deckId || ''))
const deck = computed(() => library.deckById(deckId.value))
const dueCount = computed(() => deck.value?.cards.filter(isDue).length || 0)
const newCount = computed(() => deck.value?.cards.filter(
  (card) => !card.lastReview && !card.stability && !card.repetitions,
).length || 0)

const cards = computed(() => {
  const query = filter.value.toLowerCase()
  const source = (deck.value?.cards || []).filter((card) => (
    !query
    || card.front.toLowerCase().includes(query)
    || card.back.toLowerCase().includes(query)
  ))
  const direction = sortDirection.value === 'asc' ? 1 : -1
  return [...source].sort((left, right) => {
    const leftValue = sortValue(left, sortColumn.value)
    const rightValue = sortValue(right, sortColumn.value)
    if (typeof leftValue === 'number' && typeof rightValue === 'number') {
      return (leftValue - rightValue) * direction
    }
    return String(leftValue).localeCompare(String(rightValue)) * direction
  })
})

onMounted(() => {
  if (!deck.value) void router.replace('/')
})

function sortValue(card: Card, column: SortColumn): string | number {
  if (column === 'difficulty') return card.difficulty || 0
  return card[column]
}

function setSort(column: SortColumn): void {
  if (sortColumn.value === column) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortColumn.value = column
    sortDirection.value = 'asc'
  }
}

function applyMobileSort(event: Event): void {
  const [column, direction] = (event.target as HTMLSelectElement).value.split('|')
  sortColumn.value = column as SortColumn
  sortDirection.value = direction === 'desc' ? 'desc' : 'asc'
}

function diffLevel(difficulty: number): string {
  if (difficulty <= 3) return 'easy'
  if (difficulty <= 6) return 'medium'
  return 'hard'
}

async function inlineEdit(card: Card, field: 'front' | 'back', event: FocusEvent): Promise<void> {
  const element = event.currentTarget as HTMLElement
  const value = element.textContent?.trim() || ''
  if (!value) {
    element.textContent = card[field]
    return
  }
  await library.updateCard(deckId.value, card.id, {
    front: field === 'front' ? value : card.front,
    back: field === 'back' ? value : card.back,
  })
}

async function removeCard(card: Card): Promise<void> {
  if (!window.confirm('Delete this card?')) return
  await library.deleteCard(deckId.value, card.id)
  ui.showToast('Card deleted.')
}

function startStudy(): void {
  if (study.start(deckId.value)) {
    void router.push({ name: 'study', params: { deckId: deckId.value } })
  }
}

async function importCards(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !deck.value) return
  try {
    const imported = await cardsFromTextFile(file)
    deck.value.cards.push(...imported)
    await library.persist()
    ui.showToast(`Imported ${imported.length} card${imported.length === 1 ? '' : 's'}.`)
  } catch (error) {
    window.alert(`Failed to import: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    input.value = ''
  }
}

async function exportDeck(format: 'json' | 'csv' | 'txt'): Promise<void> {
  const value = deck.value
  if (!value) return
  const base = deckFilename(value.name)
  if (format === 'json') {
    await saveExport(`${base}.json`, JSON.stringify(value, null, 2), 'application/json')
  } else if (format === 'csv') {
    await saveExport(`${base}.csv`, deckToCsv(value), 'text/csv')
  } else {
    await saveExport(`${base}.txt`, deckToAnkiText(value), 'text/plain')
  }
}

const sortFields: [SortColumn, string][] = [
  ['dueDate', 'Due date'],
  ['front', 'Front'],
  ['back', 'Back'],
  ['interval', 'Interval'],
  ['difficulty', 'Difficulty'],
]
</script>

<template>
  <div v-if="deck" class="app-shell">
    <AppBar active="library" />
    <main class="workspace">
      <button class="back-link" type="button" @click="router.push('/')">
        <AppIcon name="arrow-left" :size="16" /><span>Library</span>
      </button>
      <header class="page-heading browse-heading">
        <div>
          <p class="page-kicker">Deck</p>
          <h1 :title="deck.name">{{ deck.name }}</h1>
          <p class="page-subtitle">
            {{ deck.cards.length }} card{{ deck.cards.length === 1 ? '' : 's' }} in this deck.
          </p>
        </div>
        <div class="page-heading-actions">
          <button v-if="deck.cards.length" class="btn btn-secondary" type="button" @click="startStudy">
            <AppIcon name="play" :size="17" />
            <span>{{ dueCount > 0 ? `Study ${dueCount}` : 'Practice' }}</span>
          </button>
          <button class="btn btn-primary" type="button" @click="ui.editCard(deck.id)">
            <AppIcon name="plus" :size="17" /><span>Add card</span>
          </button>
        </div>
      </header>

      <section class="deck-summary" aria-label="Deck summary">
        <div><strong>{{ deck.cards.length }}</strong><span>Total</span></div>
        <div><strong>{{ dueCount }}</strong><span>Due now</span></div>
        <div><strong>{{ newCount }}</strong><span>New</span></div>
        <div><strong>{{ calcStreak(deck.sessions) }}d</strong><span>Streak</span></div>
      </section>

      <div class="browse-toolbar">
        <label class="search-field">
          <AppIcon name="search" :size="17" />
          <span class="visually-hidden">Search cards</span>
          <input v-model="filter" class="search-input" type="search" placeholder="Search cards" autocomplete="off">
        </label>
        <span class="browse-count" aria-live="polite">{{ cards.length }} of {{ deck.cards.length }}</span>
        <div class="mobile-sort">
          <label class="visually-hidden" for="mobile-sort-select">Sort cards</label>
          <select
            id="mobile-sort-select"
            class="select-input"
            :value="`${sortColumn}|${sortDirection}`"
            @change="applyMobileSort"
          >
            <template v-for="[value, label] in sortFields" :key="value">
              <option :value="`${value}|asc`">{{ label }}: ascending</option>
              <option :value="`${value}|desc`">{{ label }}: descending</option>
            </template>
          </select>
        </div>
        <details class="menu">
          <summary class="btn btn-secondary btn-sm" aria-label="Deck actions">
            <AppIcon name="more-horizontal" :size="16" /><span class="deck-actions-label">Deck actions</span><AppIcon name="chevron-down" :size="14" />
          </summary>
          <div class="menu-popover menu-popover-right menu-popover-wide">
            <button class="menu-item" type="button" @click="importInput?.click()">
              <AppIcon name="upload" :size="16" /><span>Import TXT / CSV</span>
            </button>
            <div class="menu-divider" />
            <button class="menu-item" type="button" @click="exportDeck('json')">
              <AppIcon name="file-json" :size="16" /><span>Export JSON</span>
            </button>
            <button class="menu-item" type="button" @click="exportDeck('csv')">
              <AppIcon name="sheet" :size="16" /><span>Export CSV</span>
            </button>
            <button class="menu-item" type="button" @click="exportDeck('txt')">
              <AppIcon name="file-text" :size="16" /><span>Export TXT</span>
            </button>
            <div class="menu-divider" />
            <button class="menu-item" type="button" @click="ui.editDeck(deck.id)">
              <AppIcon name="pencil" :size="16" /><span>Rename deck</span>
            </button>
          </div>
        </details>
        <input ref="importInput" class="file-input" type="file" accept=".txt,.csv,.tsv" @change="importCards">
      </div>

      <div class="table-wrapper">
        <table :aria-label="`Cards in ${deck.name}`">
          <thead>
            <tr>
              <th
                v-for="[column, label] in sortFields"
                :key="column"
                :class="{ sorted: sortColumn === column }"
                tabindex="0"
                :aria-sort="sortColumn === column ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'"
                @click="setSort(column)"
                @keydown.enter="setSort(column)"
              >
                {{ label === 'Due date' ? 'Due' : label }}
                <span v-if="sortColumn === column" class="sort-arrow">
                  <AppIcon :name="sortDirection === 'asc' ? 'chevron-up' : 'chevron-down'" :size="13" />
                </span>
              </th>
              <th>Fail %</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="card in cards" :key="card.id">
              <td class="td-front" data-label="Front">
                <span
                  class="cell-edit"
                  contenteditable="true"
                  role="textbox"
                  aria-label="Edit front of card"
                  :title="card.front"
                  @blur="inlineEdit(card, 'front', $event)"
                >{{ card.front }}</span>
              </td>
              <td class="td-back" data-label="Back">
                <span
                  class="cell-edit"
                  contenteditable="true"
                  role="textbox"
                  aria-label="Edit back of card"
                  :title="card.back"
                  @blur="inlineEdit(card, 'back', $event)"
                >{{ card.back }}</span>
              </td>
              <td class="td-meta" data-label="Due">
                <span v-if="!card.lastReview && !card.stability && !card.repetitions" class="tag-new">New</span>
                <span v-else :class="{ overdue: card.dueDate && card.dueDate < todayStr() }">{{ card.dueDate }}</span>
              </td>
              <td class="td-meta" data-label="Interval">{{ card.interval > 0 ? `${card.interval}d` : '-' }}</td>
              <td class="td-meta" data-label="Difficulty">
                <span
                  v-if="card.difficulty"
                  class="diff-pill"
                  :class="`diff-${diffLevel(card.difficulty)}`"
                  :title="`FSRS difficulty ${card.difficulty.toFixed(1)}`"
                >{{ card.difficulty.toFixed(1) }}</span>
                <span v-else class="muted">-</span>
              </td>
              <td class="td-meta" data-label="Fail rate">
                {{ deck.cardStats?.[card.id]?.reviews ? `${Math.round((deck.cardStats[card.id].again / deck.cardStats[card.id].reviews) * 100)}%` : '-' }}
              </td>
              <td class="td-actions" data-label="Actions">
                <details class="menu card-actions-menu">
                  <summary class="btn-icon" :aria-label="`Actions for ${card.front}`">
                    <AppIcon name="more-horizontal" :size="17" />
                  </summary>
                  <div class="menu-popover menu-popover-right card-actions-popover">
                    <button class="menu-item" type="button" @click="ui.editCard(deck.id, card.id)">
                      <AppIcon name="pencil" :size="16" /><span>Edit card</span>
                    </button>
                    <button class="menu-item is-danger" type="button" @click="removeCard(card)">
                      <AppIcon name="trash-2" :size="16" /><span>Delete card</span>
                    </button>
                  </div>
                </details>
              </td>
            </tr>
            <tr v-if="!cards.length" class="table-empty-row">
              <td colspan="7">{{ filter ? 'No cards match your search.' : 'No cards yet. Add your first card.' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </main>
  </div>
</template>
