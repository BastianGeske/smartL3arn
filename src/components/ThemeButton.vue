<script setup lang="ts">
import { useI18n } from '../i18n'
import AppIcon from './AppIcon.vue'
import { useSettingsStore } from '../stores/settings'

const { t } = useI18n()

withDefaults(defineProps<{ iconOnly?: boolean }>(), { iconOnly: true })
const settings = useSettingsStore()
</script>

<template>
  <button
    :class="iconOnly ? 'btn-icon' : 'btn btn-secondary btn-sm'"
    class="theme-button"
    type="button"
    :aria-label="t(settings.dark ? 'common.switchLight' : 'common.switchDark')"
    :title="t(settings.dark ? 'common.lightTheme' : 'common.darkTheme')"
    @click="settings.toggleDark"
  >
    <AppIcon :name="settings.dark ? 'sun' : 'moon'" :size="17" />
    <span v-if="!iconOnly">{{ settings.dark ? t('common.light') : t('common.dark') }}</span>
  </button>
</template>
