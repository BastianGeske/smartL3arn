<script setup lang="ts">
import { nextTick, onMounted, onBeforeUnmount, ref, useId, watch } from 'vue'
import type { Chapter, ObjectiveReview, Progress } from '../../shared/learning-paths.mjs'
import { formatDateLabel } from '../domain/dates'
import { useI18n } from '../i18n'
import AppIcon from './AppIcon.vue'

const props = defineProps<{
  chapters: Chapter[]
  progress: Progress
  selected?: string
  active?: string
  reviews: Map<string, ObjectiveReview>
  busy: boolean
  error: string
}>()
const emit = defineEmits<{ select: [id: string] }>()
const { t } = useI18n()
const title = useId()
const desktop = ref(false), dialogOpen = ref(false)
const list = ref<HTMLElement>()
const picker = ref<HTMLElement>(), trigger = ref<HTMLButtonElement>(), closeButton = ref<HTMLButtonElement>()
const expanded = ref(new Set<string>())
const viewport = window.matchMedia?.('(min-width: 1100px)')
function syncLayout() {
  if (viewport?.matches && dialogOpen.value) close(false)
  desktop.value = viewport?.matches ?? false
}
syncLayout()
onMounted(async () => {
  viewport?.addEventListener('change', syncLayout)
  await scrollToSelection()
})
onBeforeUnmount(() => viewport?.removeEventListener('change', syncLayout))
watch(desktop, scrollToSelection)
watch(() => props.selected, scrollToSelection)
async function scrollToSelection() {
  const chapter = props.chapters.find(c => c.objectives.some(g => g.id === props.selected)) ?? props.chapters[0]
  if (chapter) expanded.value.add(chapter.id)
  await nextTick()
  if (desktop.value || dialogOpen.value) {
    const selected = list.value?.querySelector('[aria-current="location"]')
    if (!list.value || !selected) return
    const bounds = list.value.getBoundingClientRect()
    const item = selected.getBoundingClientRect()
    if (item.top < bounds.top) list.value.scrollTop -= bounds.top - item.top
    else if (item.bottom > bounds.bottom) list.value.scrollTop += item.bottom - bounds.bottom
  }
}
function toggle(chapterId: string, event: Event) {
  if ((event.currentTarget as HTMLDetailsElement).open) expanded.value.add(chapterId)
  else expanded.value.delete(chapterId)
}
async function open() {
  const dialog = picker.value as HTMLDialogElement | undefined
  if (!dialog || dialog.open) return
  dialogOpen.value = true
  if (typeof dialog.showModal === 'function') dialog.showModal()
  else dialog.setAttribute('open', '')
  await scrollToSelection()
  closeButton.value?.focus({ preventScroll: true })
}
function close(restoreFocus = true) {
  if (!dialogOpen.value) return
  const dialog = picker.value as HTMLDialogElement | undefined
  if (typeof dialog?.close === 'function') dialog.close()
  else dialog?.removeAttribute('open')
  dialogOpen.value = false
  if (restoreFocus) trigger.value?.focus()
}
defineExpose({ close })
</script>

<template>
  <div class="path-topic-navigation" :class="{ 'is-desktop': desktop }">
    <div v-if="!desktop" class="path-topic-bar">
      <span>{{ chapters.find(c => c.objectives.some(g => g.id === selected))?.title || t('path.outline') }}</span>
      <button ref="trigger" class="btn btn-secondary btn-sm" type="button" aria-haspopup="dialog" :aria-expanded="dialogOpen" @click="open">
        <AppIcon name="rows-3" :size="16" />{{ t('path.topics') }}
      </button>
    </div>
    <component :is="desktop ? 'nav' : 'dialog'" ref="picker" class="path-outline path-chapters path-topic-index"
      :aria-labelledby="title" @cancel.prevent="close()">
      <div class="path-topic-header">
        <h2 :id="title">{{ t('path.outline') }}</h2>
        <button v-if="!desktop" ref="closeButton" type="button" class="btn btn-quiet btn-sm" @click="close()">{{ t('path.closeTopics') }}</button>
      </div>
      <p v-if="error" class="path-notice" role="alert">{{ error }}</p>
      <div ref="list" class="path-topic-list">
        <details v-for="chapter in chapters" :key="chapter.id" class="path-topic-chapter" :open="expanded.has(chapter.id)" @toggle="toggle(chapter.id, $event)">
          <summary>{{ chapter.title }}</summary>
          <ul>
            <li v-for="goal in chapter.objectives" :key="goal.id">
              <button type="button" class="path-topic" :aria-current="selected === goal.id ? 'location' : undefined" :disabled="busy"
                :data-objective="goal.id" @click="emit('select', goal.id)">
                <AppIcon :name="progress.passed.includes(goal.id) ? 'check-circle-2' : 'book-open'" :size="16" />
                <span>
                  {{ goal.goal }}
                  <small>{{ t(progress.passed.includes(goal.id) ? 'path.retention.initial'
                    : active === goal.id || progress.pausedObjectives?.some(entry => entry.objectiveId === goal.id) ? 'path.inProgress' : 'path.notStarted') }}</small>
                </span>
              </button>
              <template v-for="record in [reviews.get(goal.id)]" :key="goal.id">
                <p v-if="record?.retention">{{ t(`path.retention.${record.retention}`) }}</p>
                <p v-if="record?.lastReview && record.lastResult && record.lastCase">
                  {{ formatDateLabel(record.lastReview) }} · {{ t(`path.result.${record.lastResult}`) }}
                  <span v-if="record.gapDays !== undefined">{{ t('path.afterDays', { count: record.gapDays }) }}</span>
                  · {{ t(`path.case.${record.lastCase}`) }}
                </p>
                <p v-if="record">{{ t('path.dueOn', { date: formatDateLabel(record.dueDate) }) }}</p>
              </template>
            </li>
          </ul>
        </details>
      </div>
    </component>
  </div>
</template>
