<script setup lang="ts">
import { nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import type { MathfieldElement } from 'mathlive'
import 'mathlive/fonts.css'
import MathContent from './MathContent.vue'
import { MATH_SOURCE_LIMIT } from '../domain/tasks'
import { useI18n } from '../i18n'
const props = withDefaults(defineProps<{ modelValue: string; label: string; disabled?: boolean; maxlength?: number }>(), { disabled: false, maxlength: MATH_SOURCE_LIMIT })
const emit = defineEmits<{ 'update:modelValue': [value: string]; submit: [] }>()
const { t, locale } = useI18n()
const mode = ref<'visual' | 'latex'>('visual')
const keyboardLimited = ref(false)
const container = ref<HTMLElement>()
let field: MathfieldElement | undefined
let alive = true
let cleanupKeyboard: (() => void) | undefined
function shortcut(e: KeyboardEvent) {
  if (e.isComposing || props.disabled || e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return
  e.preventDefault(); e.stopPropagation(); emit('submit')
}
const showKeyboard = () => { keyboardLimited.value = false; field?.focus(); window.mathVirtualKeyboard?.show() }
onMounted(async () => {
  try {
    const { MathfieldElement } = await import('mathlive')
    if (!alive || !container.value) return
    MathfieldElement.fontsDirectory = null // fonts.css is bundled by Vite; never use a CDN.
    MathfieldElement.soundsDirectory = null
    MathfieldElement.keypressSound = null
    MathfieldElement.plonkSound = null
    field = new MathfieldElement()
    field.value = props.modelValue
    field.readOnly = props.disabled
    field.setAttribute('aria-label', props.label)
    field.mathVirtualKeyboardPolicy = 'auto'
    field.addEventListener('input', () => { if (!props.disabled && mode.value === 'visual') emit('update:modelValue', field!.value) })
    field.addEventListener('keydown', shortcut)
    container.value.appendChild(field)
    field.menuItems = []
    const keyboard = window.mathVirtualKeyboard
    const keepVisible = () => {
      if (document.activeElement === field) requestAnimationFrame(() => {
        if (!alive || !field || document.activeElement !== field) return
        field.scrollIntoView({ block: 'nearest' })
        const rect = field.getBoundingClientRect()
        const notice = document.querySelector('.notification-stack')?.getBoundingClientRect()
        const modal = field.closest<HTMLElement>('.modal')
        const top = modal?.getBoundingClientRect().top || 0
        const viewport = window.visualViewport
        const bottom = Math.min(
          modal?.getBoundingClientRect().bottom || (viewport?.offsetTop || 0) + (viewport?.height || innerHeight),
          keyboard.visible ? keyboard.boundingRect.top : Infinity,
          notice?.height ? notice.top : Infinity,
        ) - 16
        if (keyboard.visible && bottom - top < rect.height + 16) {
          keyboardLimited.value = true
          keyboard.hide()
          void nextTick(keepVisible)
          return
        }
        const delta = rect.top < top ? rect.top - top : Math.max(0, rect.bottom - bottom)
        if (delta) {
          if (modal) modal.scrollBy({ top: delta, behavior: 'instant' })
          else window.scrollBy({ top: delta, behavior: 'instant' })
        }
      })
    }
    const geometry = () => {
      document.documentElement.style.setProperty('--math-keyboard-height', `${keyboard.visible ? keyboard.boundingRect.height : 0}px`)
      window.dispatchEvent(new Event('math-keyboard-geometrychange'))
      keepVisible()
    }
    keyboard.alphabeticLayout = locale.value === 'de' ? 'qwertz' : 'qwerty'
    keyboard.addEventListener('geometrychange', geometry)
    window.addEventListener('notification-geometrychange', keepVisible)
    window.addEventListener('resize', geometry)
    cleanupKeyboard = () => {
      keyboard.removeEventListener('geometrychange', geometry)
      window.removeEventListener('notification-geometrychange', keepVisible)
      window.removeEventListener('resize', geometry)
    }
  } catch { mode.value = 'latex' }
})
watch(() => props.modelValue, value => { if (field && field.value !== value && mode.value === 'visual') field.value = value })
watch(() => props.disabled, value => { if (field) field.readOnly = value; if (value) window.mathVirtualKeyboard?.hide() })
watch(() => props.label, label => field?.setAttribute('aria-label', label))
watch(locale, language => { if (window.mathVirtualKeyboard) window.mathVirtualKeyboard.alphabeticLayout = language === 'de' ? 'qwertz' : 'qwerty' })
watch(mode, value => {
  keyboardLimited.value = false
  window.mathVirtualKeyboard?.hide()
  if (value === 'visual' && field) field.value = props.modelValue
})
onBeforeUnmount(() => {
  alive = false
  cleanupKeyboard?.()
  if (field && document.activeElement === field) window.mathVirtualKeyboard?.hide()
  field?.remove()
  if (!window.mathVirtualKeyboard?.visible) document.documentElement.style.setProperty('--math-keyboard-height', '0px')
})
</script>
<template>
  <div class="math-input">
    <div class="math-input-modes" role="group" :aria-label="label">
      <button class="segment-button" :class="{ 'is-selected': mode === 'visual' }" type="button" :disabled="disabled" :aria-pressed="mode === 'visual'" @click="mode = 'visual'">{{ t('task.visual') }}</button>
      <button class="segment-button" :class="{ 'is-selected': mode === 'latex' }" type="button" :disabled="disabled" :aria-pressed="mode === 'latex'" @click="mode = 'latex'">{{ t('task.latex') }}</button>
    </div>
    <div v-show="mode === 'visual'" ref="container" class="mathfield-container" />
    <button v-if="mode === 'visual'" class="btn btn-quiet btn-sm" type="button" :disabled="disabled" @click="showKeyboard">{{ t('task.mathKeyboard') }}</button>
    <p v-if="keyboardLimited && mode === 'visual'" class="field-hint" role="status">{{ t('task.keyboardLimited') }}</p>
    <textarea v-if="mode === 'latex'" class="textarea latex-input" :aria-label="label" :value="modelValue" :disabled="disabled" :maxlength="maxlength" rows="2" @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)" @keydown="shortcut" />
    <p v-if="modelValue.length > maxlength" class="form-error" role="alert">{{ t('task.aiFormulaTooLong') }}</p>
    <div v-if="mode === 'latex' && modelValue" class="math-input-preview"><MathContent :text="modelValue" formula /></div>
  </div>
</template>
