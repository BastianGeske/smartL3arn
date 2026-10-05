<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'

defineProps<{ label?: string; triggerClass?: string; wide?: boolean }>()
const open = ref(false)
const trigger = ref<HTMLButtonElement>()
const panel = ref<HTMLDivElement>()
const menuId = useId()
const instanceToken = Symbol('app-menu')
const placement = ref<Record<string, string>>({ visibility: 'hidden' })
let frame = 0
let insets: HTMLDivElement | undefined

function controls(): HTMLButtonElement[] {
  return Array.from(panel.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || [])
}
function close(restore = false): void {
  open.value = false
  if (restore) trigger.value?.focus()
}
function position(): void {
  const button = trigger.value
  const menu = panel.value
  if (!button || !menu || !insets) return
  const safe = getComputedStyle(insets)
  const viewport = window.visualViewport
  const left = (viewport?.offsetLeft || 0) + (parseFloat(safe.paddingLeft) || 0) + 8
  const right = (viewport?.offsetLeft || 0) + (viewport?.width || innerWidth) - (parseFloat(safe.paddingRight) || 0) - 8
  const top = (viewport?.offsetTop || 0) + (parseFloat(safe.paddingTop) || 0) + 8
  let bottom = (viewport?.offsetTop || 0) + (viewport?.height || innerHeight) - (parseFloat(safe.paddingBottom) || 0) - 8
  const nav = document.querySelector<HTMLElement>('.app-nav')
  if (nav && getComputedStyle(nav).position === 'fixed') bottom = Math.min(bottom, nav.getBoundingClientRect().top - 8)
  const rect = button.getBoundingClientRect()
  const menuWidth = Math.min(menu.offsetWidth, right - left)
  const below = Math.max(0, bottom - rect.bottom - 7)
  const above = Math.max(0, rect.top - top - 7)
  const goUp = menu.scrollHeight > below && above > below
  const available = Math.max(0, goUp ? above : below)
  const height = Math.min(menu.scrollHeight, available)
  placement.value = {
    visibility: 'visible', maxWidth: `${right - left}px`, maxHeight: `${available}px`,
    left: `${Math.max(left, Math.min(rect.right - menuWidth, right - menuWidth))}px`,
    top: `${Math.max(top, Math.min(goUp ? rect.top - height - 7 : rect.bottom + 7, bottom - height))}px`,
  }
}
function schedule(): void {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(position)
}
function outside(event: PointerEvent): void {
  const target = event.target as Node
  if (!trigger.value?.contains(target) && !panel.value?.contains(target)) close()
}
function keydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') { event.preventDefault(); close(true); return }
  if (event.key === 'Tab') { close(true); return }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const buttons = controls()
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
    : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
  buttons[next]?.focus()
}
function openedElsewhere(event: Event): void {
  if ((event as CustomEvent).detail !== instanceToken) close()
}
function cleanup(): void {
  cancelAnimationFrame(frame)
  document.removeEventListener('pointerdown', outside, true)
  document.removeEventListener('keydown', keydown)
  document.removeEventListener('app-menu-open', openedElsewhere)
  document.removeEventListener('scroll', schedule, true)
  window.removeEventListener('resize', schedule)
  window.visualViewport?.removeEventListener('resize', schedule)
  window.visualViewport?.removeEventListener('scroll', schedule)
  insets?.remove()
  insets = undefined
}
watch(open, async value => {
  cleanup()
  if (!value) return
  document.dispatchEvent(new CustomEvent('app-menu-open', { detail: instanceToken }))
  document.addEventListener('app-menu-open', openedElsewhere)
  document.addEventListener('pointerdown', outside, true)
  document.addEventListener('keydown', keydown)
  document.addEventListener('scroll', schedule, true)
  window.addEventListener('resize', schedule)
  window.visualViewport?.addEventListener('resize', schedule)
  window.visualViewport?.addEventListener('scroll', schedule)
  insets = document.createElement('div')
  insets.className = 'safe-area-probe'
  document.body.appendChild(insets)
  placement.value = { visibility: 'hidden' }
  await nextTick()
  if (!open.value) return
  position()
  controls()[0]?.focus()
})
onBeforeUnmount(cleanup)
</script>

<template>
  <div class="menu" :class="{ 'is-open': open }">
    <button ref="trigger" type="button" :class="triggerClass || 'btn btn-secondary btn-sm'"
      :aria-label="label" aria-haspopup="true" :aria-expanded="open" :aria-controls="open ? menuId : undefined"
      @click="open = !open" @keydown.down.prevent="open = true">
      <slot name="trigger" />
    </button>
    <Teleport to="body">
      <div v-if="open" :id="menuId" ref="panel" class="menu-popover floating-menu"
        :class="{ 'menu-popover-wide': wide }" :style="placement" role="group" :aria-label="label"
        @click="($event.target as HTMLElement).closest('button') && close(true)">
        <slot />
      </div>
    </Teleport>
  </div>
</template>
