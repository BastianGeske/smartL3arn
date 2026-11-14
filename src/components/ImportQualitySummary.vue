<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from '../i18n'
import { useLibraryStore } from '../stores/library'
import { useUiStore } from '../stores/ui'
import { taskQuality } from '../domain/taskQuality'
const props = defineProps<{ deckIds: string[] }>()
defineEmits<{ dismiss: [] }>()
const { t } = useI18n()
const library = useLibraryStore(), ui = useUiStore()
const page = ref(0)
const entries = computed(() => library.decks.filter(deck => props.deckIds.includes(deck.id)).flatMap(deck => deck.cards.flatMap(card => {
  const hints = taskQuality(card)
  return hints.length ? [{ deckId: deck.id, deckName: deck.name, cardId: card.id, front: card.front, hints }] : []
})))
const pages = computed(() => Math.max(1, Math.ceil(entries.value.length / 20)))
watch(pages, count => { page.value = Math.min(page.value, count - 1) })
watch(() => props.deckIds, () => { page.value = 0 })
const visible = computed(() => entries.value.slice(page.value * 20, (page.value + 1) * 20))
</script>
<template>
  <section class="import-quality-summary" aria-labelledby="import-quality-title">
    <div class="section-heading"><h2 id="import-quality-title" tabindex="-1">{{ t('quality.importTitle') }}</h2><button class="btn btn-quiet btn-sm" type="button" @click="$emit('dismiss')">{{ t('quality.dismiss') }}</button></div>
    <p role="status">{{ t(entries.length ? 'quality.importCount' : 'quality.resolved', { count: entries.length }) }}</p>
    <details v-if="entries.length">
      <summary>{{ t('quality.showCards') }}</summary>
      <p class="field-hint">{{ t('quality.editorial') }}</p>
      <ul class="quality-import-cards">
        <li v-for="entry in visible" :key="`${entry.deckId}:${entry.cardId}`">
          <span class="field-hint">{{ entry.deckName }}</span>
          <button class="btn btn-secondary quality-card-link" type="button" @click="ui.editCard(entry.deckId, entry.cardId)">{{ entry.front }}</button>
          <ul><li v-for="hint in entry.hints" :key="hint.code">{{ t(`quality.${hint.code}`) }}</li></ul>
        </li>
      </ul>
      <div v-if="pages > 1" class="task-row-actions"><button class="btn btn-secondary btn-sm" type="button" :disabled="page === 0" @click="page--">{{ t('quality.previous') }}</button><span>{{ t('quality.page', { page: page + 1, pages }) }}</span><button class="btn btn-secondary btn-sm" type="button" :disabled="page + 1 >= pages" @click="page++">{{ t('quality.next') }}</button></div>
    </details>
  </section>
</template>
