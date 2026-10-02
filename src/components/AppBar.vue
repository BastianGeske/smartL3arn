<script setup lang="ts">
import { useI18n } from '../i18n'
import { useRouter } from 'vue-router'
import AppIcon from './AppIcon.vue'
import ThemeButton from './ThemeButton.vue'

const { t } = useI18n()

defineProps<{ active: 'library' | 'smart' | 'usage' | 'preferences'; title?: string }>()
const router = useRouter()
</script>

<template>
  <aside class="app-bar">
    <div class="app-bar-inner">
      <button class="brand-button" type="button" :aria-label="t('nav.openLibrary')" @click="router.push('/')">
        <img src="/icon.png" alt="" class="brand-mark">
        <span class="brand-name">smart<span>L3arn</span></span>
      </button>
      <nav class="app-nav" :aria-label="t('nav.primary')">
        <RouterLink class="app-nav-item" :class="{ 'is-active': active === 'library' }" to="/">
          <AppIcon name="library" :size="17" />
          <span>{{ t('nav.library') }}</span>
        </RouterLink>
        <RouterLink class="app-nav-item" :class="{ 'is-active': active === 'smart' }" to="/smart">
          <AppIcon name="sparkles" :size="17" />
          <span>{{ t('nav.smart') }}</span>
        </RouterLink>
        <RouterLink class="app-nav-item" :class="{ 'is-active': active === 'usage' }" to="/usage">
          <AppIcon name="gauge" :size="17" />
          <span>{{ t('nav.usage') }}</span>
        </RouterLink>
        <RouterLink class="app-nav-item" :class="{ 'is-active': active === 'preferences' }" to="/preferences">
          <AppIcon name="settings-2" :size="17" />
          <span>{{ t('nav.preferences') }}</span>
        </RouterLink>
      </nav>
      <div class="app-bar-actions"><span>{{ t('common.appearance') }}</span><ThemeButton /></div>
    </div>
  </aside>
  <header class="workspace-toolbar"><strong>{{ title || (active === 'library' ? t('nav.library') : active === 'smart' ? t('nav.smart') : active === 'usage' ? t('nav.usage') : t('nav.preferences')) }}</strong><div class="toolbar-actions"><slot /></div></header>
</template>
