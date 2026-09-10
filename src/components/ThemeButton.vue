<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import { useSettingsStore } from '../stores/settings'

withDefaults(defineProps<{ iconOnly?: boolean }>(), { iconOnly: true })
const settings = useSettingsStore()
</script>

<template>
  <button
    :class="iconOnly ? 'btn-icon' : 'btn btn-secondary btn-sm'"
    class="theme-button"
    type="button"
    :aria-label="`Switch to ${settings.dark ? 'light' : 'dark'} theme`"
    :title="`${settings.dark ? 'Light' : 'Dark'} theme`"
    @click="settings.toggleDark"
  >
    <AppIcon :name="settings.dark ? 'sun' : 'moon'" :size="17" />
    <span v-if="!iconOnly">{{ settings.dark ? 'Light' : 'Dark' }}</span>
  </button>
</template>
