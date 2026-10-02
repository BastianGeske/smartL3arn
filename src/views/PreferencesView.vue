<script setup lang="ts">
import AppBar from '../components/AppBar.vue'
import AppIcon from '../components/AppIcon.vue'
import { useI18n, type LanguagePreference } from '../i18n'
import { useSettingsStore } from '../stores/settings'

const { t, locale, languagePreference, setLanguage } = useI18n()

const settings = useSettingsStore()
function changeLanguage(event: Event): void {
  setLanguage((event.target as HTMLSelectElement).value as LanguagePreference)
}
</script>

<template>
  <div class="app-shell">
    <AppBar active="preferences" />
    <main class="workspace preferences-workspace">
      <header class="page-heading">
        <div>
          <p class="page-kicker">{{ t('preferences.kicker') }}</p>
          <h1>{{ t('nav.preferences') }}</h1>
          <p class="page-subtitle">{{ t('preferences.subtitle') }}</p>
        </div>
      </header>
      <section class="config-section preference-section" aria-labelledby="language-heading">
        <div class="preference-icon"><AppIcon name="languages" :size="22" /></div>
        <div class="preference-content">
          <h2 id="language-heading">{{ t('preferences.language') }}</h2>
          <p>{{ t('preferences.languageDescription') }}</p>
          <label class="field-label" for="language-preference">{{ t('preferences.language') }}</label>
          <select id="language-preference" class="select-input" :value="languagePreference" @change="changeLanguage">
            <option value="system">{{ t('preferences.system') }}</option>
            <option value="de" lang="de">{{ t('preferences.german') }}</option>
            <option value="en" lang="en">{{ t('preferences.english') }}</option>
          </select>
          <p class="preference-status" role="status">{{ t('preferences.currentLanguage', { language: t(locale === 'de' ? 'preferences.german' : 'preferences.english') }) }}</p>
          <p class="preference-note">{{ t('preferences.contentNote') }}</p>
        </div>
      </section>
      <section class="config-section preference-section" aria-labelledby="appearance-heading">
        <div class="preference-icon"><AppIcon :name="settings.dark ? 'moon' : 'sun'" :size="22" /></div>
        <div class="preference-content">
          <h2 id="appearance-heading">{{ t('common.appearance') }}</h2>
          <p>{{ t('preferences.appearanceDescription') }}</p>
          <div class="segmented-control appearance-options" role="group" :aria-label="t('common.appearance')">
            <button class="segment-button" :class="{ 'is-selected': !settings.dark }" :aria-pressed="!settings.dark" type="button" @click="settings.dark = false"><AppIcon name="sun" :size="16" />{{ t('common.light') }}</button>
            <button class="segment-button" :class="{ 'is-selected': settings.dark }" :aria-pressed="settings.dark" type="button" @click="settings.dark = true"><AppIcon name="moon" :size="16" />{{ t('common.dark') }}</button>
          </div>
        </div>
      </section>
      <p class="preferences-storage-note"><AppIcon name="check-circle-2" :size="15" />{{ t('preferences.storageNote') }}</p>
    </main>
  </div>
</template>
