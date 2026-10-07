<script setup lang="ts">
import { useI18n, type TranslationKey } from '../i18n'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppBar from '../components/AppBar.vue'
import AppIcon from '../components/AppIcon.vue'
import AppMenu from '../components/AppMenu.vue'
import { calcStreak, isDue, todayStr } from '../domain/dates'
import {
  deckFilename,
  deckToAnkiText,
  deckToCsv,
} from '../domain/importExport'
import type { Card } from '../domain/types'
import { importErrorKey, cardsFromTextFile } from '../services/importer'
import { saveExport } from '../services/native'
import { useLibraryStore } from '../stores/library'
import { useStudyStore } from '../stores/study'
import { useUiStore } from '../stores/ui'

const { t, formatNumber, locale } = useI18n()

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
const dueCount = computed(() => deck.value?.cards.filter((card) => isDue(card)).length || 0)
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
    return String(leftValue).localeCompare(String(rightValue), locale.value) * direction
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
  try { await library.updateCard(deckId.value, card.id, {
    front: field === 'front' ? value : card.front,
    back: field === 'back' ? value : card.back,
  }) } catch { element.textContent = card[field] }
}

async function removeCard(card: Card): Promise<void> {
  if (!window.confirm(t('card.deleteConfirm'))) return
  try { await library.deleteCard(deckId.value, card.id); ui.showToast('card.deleted') }
  catch { /* The persistent library notice reports failed saving. */ }
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
    let imported: Card[]
    try { imported = await cardsFromTextFile(file) }
    catch (error) { ui.showError(importErrorKey(error)); return }
    try { await library.addCards(deckId.value, imported) }
    catch { return }
    ui.showToast('import.cards', { count: imported.length })
  } finally {
    input.value = ''
  }
}

async function exportDeck(format: 'json' | 'csv' | 'txt'): Promise<void> {
  const value = deck.value
  if (!value) return
  const base = deckFilename(value.name)
  try {
    if (format === 'json') {
      await saveExport(`${base}.json`, JSON.stringify(value, null, 2), 'application/json')
    } else if (format === 'csv') {
      await saveExport(`${base}.csv`, deckToCsv(value), 'text/csv')
    } else {
      await saveExport(`${base}.txt`, deckToAnkiText(value), 'text/plain')
    }
  } catch { ui.showError('notifications.exportFailed') }
}

const sortFields: [SortColumn, TranslationKey][] = [
  ['front', 'common.front'],
  ['back', 'common.back'],
  ['dueDate', 'common.due'],
  ['interval', 'browse.interval'],
  ['difficulty', 'browse.difficulty'],
]
</script>

<template>
  <div v-if="deck" class="app-shell">
    <AppBar active="library" :title="t('browse.title')" />
    <main class="workspace">
      <button class="back-link" type="button" @click="router.push('/')">
        <AppIcon name="arrow-left" :size="16" /><span>{{ t('nav.library') }}</span>
      </button>
      <header class="page-heading browse-heading">
        <div>
          <p class="page-kicker">{{ t('common.deck') }}</p>
          <h1 :title="deck.name">{{ deck.name }}</h1>
          <p class="page-subtitle">
            {{ t('browse.inDeck', { count: deck.cards.length }) }}
          </p>
        </div>
        <div class="page-heading-actions">
          <button v-if="deck.cards.length" class="btn btn-secondary" type="button" @click="startStudy">
            <AppIcon name="play" :size="17" />
            <span>{{ dueCount > 0 ? t('browse.study', { count: dueCount }) : t('study.practice') }}</span>
          </button>
          <button class="btn btn-primary" type="button" @click="ui.editCard(deck.id)">
            <AppIcon name="plus" :size="17" /><span>{{ t('card.add') }}</span>
          </button>
        </div>
      </header>

      <section class="deck-summary" :aria-label="t('browse.summary')">
        <div><strong>{{ formatNumber(deck.cards.length) }}</strong><span>{{ t('common.total') }}</span></div>
        <div><strong>{{ formatNumber(dueCount) }}</strong><span>{{ t('common.dueNow') }}</span></div>
        <div><strong>{{ formatNumber(newCount) }}</strong><span>{{ t('common.new') }}</span></div>
        <div><strong>{{ t('common.daysShort', { count: calcStreak(deck.sessions) }) }}</strong><span>{{ t('browse.streak') }}</span></div>
      </section>

      <div class="browse-toolbar">
        <label class="search-field">
          <AppIcon name="search" :size="17" />
          <span class="visually-hidden">{{ t('browse.search') }}</span>
          <input v-model="filter" class="search-input" type="search" :placeholder="t('browse.search')" autocomplete="off">
        </label>
        <span class="browse-count" aria-live="polite">{{ t('common.of', { current: cards.length, total: deck.cards.length }) }}</span>
        <div class="mobile-sort">
          <label class="visually-hidden" for="mobile-sort-select">{{ t('browse.sort') }}</label>
          <select
            id="mobile-sort-select"
            class="select-input"
            :value="`${sortColumn}|${sortDirection}`"
            @change="applyMobileSort"
          >
            <template v-for="[value, label] in sortFields" :key="value">
              <option :value="`${value}|asc`">{{ t('browse.ascending', { label: t(label) }) }}</option>
              <option :value="`${value}|desc`">{{ t('browse.descending', { label: t(label) }) }}</option>
            </template>
          </select>
        </div>
        <AppMenu class="menu" trigger-class="btn btn-secondary btn-sm" :label="t('browse.actions')" wide>
              <template #trigger>
            <AppIcon name="more-horizontal" :size="16" /><span class="deck-actions-label">{{ t('browse.actions') }}</span><AppIcon name="chevron-down" :size="14" />
          </template>

            <button class="menu-item" type="button" @click="importInput?.click()">
              <AppIcon name="upload" :size="16" /><span>{{ t('import.text') }}</span>
            </button>
            <div class="menu-divider" />
            <button class="menu-item" type="button" @click="exportDeck('json')">
              <AppIcon name="file-json" :size="16" /><span>{{ t('import.exportJson') }}</span>
            </button>
            <button class="menu-item" type="button" @click="exportDeck('csv')">
              <AppIcon name="sheet" :size="16" /><span>{{ t('import.exportCsv') }}</span>
            </button>
            <button class="menu-item" type="button" @click="exportDeck('txt')">
              <AppIcon name="file-text" :size="16" /><span>{{ t('import.exportTxt') }}</span>
            </button>
            <div class="menu-divider" />
            <button class="menu-item" type="button" @click="ui.editDeck(deck.id)">
              <AppIcon name="pencil" :size="16" /><span>{{ t('deck.rename') }}</span>
            </button>

            </AppMenu>
        <input ref="importInput" class="file-input" type="file" accept=".txt,.csv,.tsv" @change="importCards">
      </div>

      <div class="table-wrapper">
        <table class="browse-table" :aria-label="t('browse.table', { name: deck.name })">
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
                {{ t(label) }}
                <span v-if="sortColumn === column" class="sort-arrow">
                  <AppIcon :name="sortDirection === 'asc' ? 'chevron-up' : 'chevron-down'" :size="13" />
                </span>
              </th>
              <th>{{ t('browse.failPercent') }}</th>
              <th>{{ t('common.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="card in cards" :key="card.id">
              <td class="td-front" :data-label="t('common.front')">
                <span
                  class="cell-edit"
                  contenteditable="true"
                  role="textbox"
                  :aria-label="t('browse.editFront')"
                  :title="card.front"
                  @blur="inlineEdit(card, 'front', $event)"
                >{{ card.front }}</span>
              </td>
              <td class="td-back" :data-label="t('common.back')">
                <span
                  class="cell-edit"
                  contenteditable="true"
                  role="textbox"
                  :aria-label="t('browse.editBack')"
                  :title="card.back"
                  @blur="inlineEdit(card, 'back', $event)"
                >{{ card.back }}</span>
              </td>
              <td class="td-meta" :data-label="t('common.due')">
                <span v-if="!card.lastReview && !card.stability && !card.repetitions" class="tag-new">{{ t('common.new') }}</span>
                <span v-else :class="{ overdue: card.dueDate && card.dueDate < todayStr() }">{{ card.dueDate }}</span>
              </td>
              <td class="td-meta" :data-label="t('browse.interval')">{{ card.interval > 0 ? t('common.daysShort', { count: card.interval }) : '-' }}</td>
              <td class="td-meta" :data-label="t('browse.difficulty')">
                <span
                  v-if="card.difficulty"
                  class="diff-pill"
                  :class="`diff-${diffLevel(card.difficulty)}`"
                  :title="t('browse.fsrsDifficulty', { value: formatNumber(card.difficulty, { maximumFractionDigits: 1, minimumFractionDigits: 1 }) })"
                >{{ formatNumber(card.difficulty, { maximumFractionDigits: 1, minimumFractionDigits: 1 }) }}</span>
                <span v-else class="muted">-</span>
              </td>
              <td class="td-meta" :data-label="t('browse.failRate')">
                {{ deck.cardStats?.[card.id]?.reviews ? `${Math.round((deck.cardStats[card.id].again / deck.cardStats[card.id].reviews) * 100)}%` : '-' }}
              </td>
              <td class="td-actions" :data-label="t('common.actions')">
                <button class="btn-icon" type="button" :aria-label="t('browse.edit', { text: card.front })" :title="t('card.edit')" @click="ui.editCard(deck.id, card.id)"><AppIcon name="pencil" :size="15" /></button>
                <button class="btn-icon is-danger" type="button" :aria-label="t('browse.delete', { text: card.front })" :title="t('card.delete')" @click="removeCard(card)"><AppIcon name="trash-2" :size="15" /></button>
              </td>
            </tr>
            <tr v-if="!cards.length" class="table-empty-row">
              <td colspan="7">{{ filter ? t('browse.noMatches') : t('browse.noCards') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </main>
  </div>
</template>
