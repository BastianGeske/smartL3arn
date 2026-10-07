import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type { SmartConfig } from '../domain/types'
import {
  loadDarkMode,
  loadSmartConfigState,
  wasIosEvaluationModeInitialized,
  markIosEvaluationModeInitialized,
  saveDarkMode,
  saveSmartConfig,
} from '../services/settings'
import { syncStatusBar } from '../services/native'
import { useUiStore } from './ui'

export const useSettingsStore = defineStore('settings', () => {
  const ui = useUiStore()
  const dark = ref(loadDarkMode())
  const initialConfig = loadSmartConfigState()
  const smartConfig = ref<SmartConfig>(initialConfig.config)
  let evaluationModeInitialized = initialConfig.hasStoredEvaluationMode || wasIosEvaluationModeInitialized()

  function setEvaluationMode(mode: SmartConfig['evaluationMode']): void {
    evaluationModeInitialized = true
    smartConfig.value.evaluationMode = mode
  }

  function initializeIosEvaluationMode(configured: boolean): void {
    if (evaluationModeInitialized) return
    evaluationModeInitialized = true
    smartConfig.value.evaluationMode = configured ? 'openrouter' : 'local'
    try { markIosEvaluationModeInitialized() }
    catch { ui.showError('notifications.smartConfigFailed') }
  }

  watch(dark, (value) => {
    try { saveDarkMode(value) }
    catch { ui.showError('notifications.appearanceFailed') }
    document.body.classList.toggle('dark', value)
    void syncStatusBar(value).catch(() => undefined)
  }, { immediate: true })

  watch(smartConfig, (value) => {
    try { saveSmartConfig(value) }
    catch { ui.showError('notifications.smartConfigFailed') }
  }, { deep: true })

  function toggleDark(): void {
    dark.value = !dark.value
  }

  return { dark, smartConfig, toggleDark, setEvaluationMode, initializeIosEvaluationMode }
})
