<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from '../i18n'
import { useUiStore } from '../stores/ui'
import { useLibraryStore } from '../stores/library'
import AppIcon from './AppIcon.vue'

const { t } = useI18n()
const ui = useUiStore()
const library = useLibraryStore()
const root = ref<HTMLElement>()
const modalOpen = computed(() => Boolean(ui.cardEditor || ui.deckEditor))
const visible = computed(() => [...ui.notifications]
  .sort((left, right) => Number(right.kind === 'error') - Number(left.kind === 'error'))
  .slice(0, modalOpen.value ? (library.persistenceIssue ? 0 : 1) : library.persistenceIssue ? 2 : 3))
watch(() => visible.value.map(message => message.id), ids => {
  for (const message of ui.notifications) {
    if (ids.includes(message.id)) ui.resumeNotification(message.id, 'hidden')
    else ui.pauseNotification(message.id, 'hidden')
  }
}, { immediate: true })
function measure(): void {
  const rect = root.value?.getBoundingClientRect()
  const viewport = window.visualViewport
  const bottom = (viewport?.offsetTop || 0) + (viewport?.height || innerHeight)
  const space = rect?.height ? Math.max(0, bottom - rect.top) + 12 : 0
  document.documentElement.style.setProperty('--notification-space', `${space}px`)
}
let observer: ResizeObserver | undefined
onMounted(() => {
  observer = new ResizeObserver(measure)
  if (root.value) observer.observe(root.value)
  window.addEventListener('resize', measure)
  window.visualViewport?.addEventListener('resize', measure)
  window.visualViewport?.addEventListener('scroll', measure)
  measure()
})
watch(() => [library.persistenceIssue, modalOpen.value, ...visible.value.map(message => message.id)], () => { void nextTick(measure) })
onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('resize', measure)
  window.visualViewport?.removeEventListener('resize', measure)
  window.visualViewport?.removeEventListener('scroll', measure)
  document.documentElement.style.removeProperty('--notification-space')
})
function focusOut(id: number, event: FocusEvent): void {
  if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) ui.resumeNotification(id, 'focus')
}
</script>

<template>
  <aside ref="root" class="notification-stack" :aria-label="t('notifications.region')">
    <div v-if="library.persistenceIssue" class="notification notification-error notification-persistent" role="alert" aria-atomic="true">
      <AppIcon name="alert-circle" :size="20" />
      <p>{{ t(library.persistenceIssue === 'load' ? 'common.loadError' : 'notifications.saveFailed') }}</p>
    </div>
    <div v-for="message in visible" :key="message.id" class="notification"
      :class="`notification-${message.kind}`" :role="message.kind === 'error' ? 'alert' : 'status'" aria-atomic="true"
      @mouseenter="ui.pauseNotification(message.id, 'hover')" @mouseleave="ui.resumeNotification(message.id, 'hover')"
      @focusin="ui.pauseNotification(message.id, 'focus')" @focusout="focusOut(message.id, $event)">
      <AppIcon :name="message.kind === 'error' ? 'alert-circle' : 'check-circle-2'" :size="20" />
      <p>{{ t(message.key, message.params) }}</p>
      <button type="button" class="notification-dismiss" :aria-label="t('notifications.dismiss')" @click="ui.dismissNotification(message.id)">
        <AppIcon name="x" :size="18" />
      </button>
    </div>
  </aside>
</template>
