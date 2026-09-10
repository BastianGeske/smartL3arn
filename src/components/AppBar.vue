<script setup lang="ts">
import { useRouter } from 'vue-router'
import AppIcon from './AppIcon.vue'
import ThemeButton from './ThemeButton.vue'

defineProps<{ active: 'library' | 'smart' }>()
const router = useRouter()
</script>

<template>
  <header class="app-bar">
    <div class="app-bar-inner">
      <button class="brand-button" type="button" aria-label="Open library" @click="router.push('/')">
        <img src="/icon.png" alt="" class="brand-mark">
        <span class="brand-name">smart<span>L3arn</span></span>
      </button>
      <nav class="app-nav" aria-label="Primary navigation">
        <RouterLink class="app-nav-item" :class="{ 'is-active': active === 'library' }" to="/">
          <AppIcon name="library" :size="17" />
          <span>Library</span>
        </RouterLink>
        <RouterLink class="app-nav-item" :class="{ 'is-active': active === 'smart' }" to="/smart">
          <AppIcon name="sparkles" :size="17" />
          <span>Smart Study</span>
        </RouterLink>
      </nav>
      <div class="app-bar-actions"><ThemeButton /></div>
    </div>
  </header>
</template>
