<script setup lang="ts">
import type { WrittenCheck } from '../../shared/learning-paths.mjs'
import MathContent from './MathContent.vue'

defineProps<{ text: string; format?: WrittenCheck['input']; formatBold?: boolean }>()
</script>

<template>
  <pre v-if="format === 'code'" class="path-code-answer">{{ text }}</pre>
  <MathContent v-else-if="format === 'formula'" :text="text" formula block />
  <MathContent v-else :text="text" :format-bold="formatBold" />
</template>
