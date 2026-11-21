<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, useId } from 'vue'
import { formatCountdown } from '../domain/study/timer'
import { useI18n } from '../i18n'
import { useUiStore } from '../stores/ui'
import AppIcon from './AppIcon.vue'

const duration = 25 * 60_000
const { t } = useI18n()
const ui = useUiStore()
const state = ref<'idle' | 'running' | 'paused' | 'finished'>('idle')
const remaining = ref(duration)
const trigger = ref<HTMLButtonElement>()
const dialog = ref<HTMLDialogElement>()
const action = ref<HTMLButtonElement>()
const open = ref(false)
const dialogId = useId()
const titleId = useId()
let deadline = 0
let interval: ReturnType<typeof setInterval> | undefined

const countdown = computed(() => formatCountdown(remaining.value))
const badgeLabel = computed(() => {
  if (state.value === 'idle') return t('path.timer.label')
  if (state.value === 'finished') return t('path.timer.finished')
  return t(state.value === 'paused' ? 'path.timer.pausedBadge' : 'path.timer.runningBadge', { time: countdown.value })
})
const actionLabel = computed(() => {
  if (state.value === 'running') return t('path.timer.pause')
  if (state.value === 'paused') return t('path.timer.resume')
  if (state.value === 'finished') return t('path.timer.restart')
  return t('path.timer.start')
})

function openPopup() {
  const popup = dialog.value
  if (!popup || open.value) return
  if (typeof popup.showModal === 'function') popup.showModal()
  else popup.setAttribute('open', '')
  open.value = true
  tick()
  action.value?.focus({ preventScroll: true })
}
function closePopup() {
  const popup = dialog.value
  if (!popup || !open.value) return
  if (typeof popup.close === 'function') popup.close()
  else popup.removeAttribute('open')
  open.value = false
  trigger.value?.focus({ preventScroll: true })
}
function stopTicking() {
  clearInterval(interval)
  interval = undefined
}
function tick() {
  if (state.value !== 'running' || document.hidden) return
  remaining.value = Math.max(0, deadline - Date.now())
  if (remaining.value === 0) {
    stopTicking()
    state.value = 'finished'
    if (!open.value) ui.showToast('path.timer.finished')
  }
}
function toggle() {
  if (state.value === 'running') {
    tick()
    if (remaining.value === 0) return
    stopTicking()
    state.value = 'paused'
    return
  }
  const starting = state.value !== 'paused'
  if (starting) remaining.value = duration
  deadline = Date.now() + remaining.value
  state.value = 'running'
  interval = setInterval(tick, 1000)
  if (starting) closePopup()
}
function reset() {
  stopTicking()
  remaining.value = duration
  state.value = 'idle'
  closePopup()
}
onMounted(() => document.addEventListener('visibilitychange', tick))
onUnmounted(() => {
  stopTicking()
  document.removeEventListener('visibilitychange', tick)
})
</script>

<template>
  <div class="path-focus-timer">
    <button ref="trigger" class="btn btn-quiet btn-sm path-focus-trigger" :class="'is-' + state"
      type="button" aria-haspopup="dialog" :aria-controls="dialogId" :aria-expanded="open" :aria-label="badgeLabel"
      @click="openPopup">
      <AppIcon :name="state === 'finished' ? 'check-circle-2' : 'timer'" :size="16" />
      <span v-if="state === 'idle'">{{ t('path.timer.label') }}</span>
      <span v-else-if="state === 'finished'">{{ t('path.timer.finished') }}</span>
      <template v-else>
        <span class="path-focus-digits">{{ countdown }}</span>
        <span v-if="state === 'paused'" class="path-focus-paused">{{ t('path.timer.paused') }}</span>
      </template>
    </button>

    <dialog :id="dialogId" ref="dialog" class="path-focus-dialog" :aria-labelledby="titleId"
      @cancel.prevent="closePopup" @click.self="closePopup">
      <div class="path-focus-panel">
        <header class="path-focus-panel-heading">
          <span class="path-focus-icon"><AppIcon name="timer" :size="18" /></span>
          <h2 :id="titleId">{{ t('path.timer.label') }}</h2>
          <button class="btn-icon path-focus-close" type="button" :aria-label="t('path.timer.close')" @click="closePopup">
            <AppIcon name="x" :size="19" />
          </button>
        </header>

        <div class="path-focus-clock" :class="'is-' + state" :style="{ '--timer-remaining': remaining / duration * 100 + '%' }">
          <div class="path-focus-clock-face">
            <span class="path-focus-digits" role="timer" :aria-label="t('path.timer.remaining')">{{ countdown }}</span>
            <span v-if="state === 'paused'" class="path-focus-paused">{{ t('path.timer.paused') }}</span>
            <span role="status" :class="{ 'visually-hidden': state !== 'finished' }">
              {{ state === 'finished' ? t('path.timer.finished') : '' }}
            </span>
          </div>
        </div>

        <div class="path-focus-actions">
          <button v-if="state !== 'idle'" class="btn btn-secondary" type="button" @click="reset">
            {{ t(state === 'finished' ? 'path.timer.done' : 'path.timer.reset') }}
          </button>
          <button ref="action" class="btn btn-primary" type="button" @click="toggle">{{ actionLabel }}</button>
        </div>
      </div>
    </dialog>
  </div>
</template>
