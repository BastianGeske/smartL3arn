import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type { SmartConfig } from '../domain/types'
import {
  loadDarkMode,
  loadSmartConfig,
  saveDarkMode,
  saveSmartConfig,
} from '../services/settings'
import { syncStatusBar } from '../services/native'

export const useSettingsStore = defineStore('settings', () => {
  const dark = ref(loadDarkMode())
  const smartConfig = ref<SmartConfig>(loadSmartConfig())

  watch(dark, (value) => {
    saveDarkMode(value)
    document.body.classList.toggle('dark', value)
    void syncStatusBar(value)
  }, { immediate: true })

  watch(smartConfig, (value) => {
    saveSmartConfig(value)
  }, { deep: true })

  function toggleDark(): void {
    dark.value = !dark.value
  }

  return { dark, smartConfig, toggleDark }
})
