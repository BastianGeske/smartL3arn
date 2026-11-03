<script setup lang="ts">
import { computed } from 'vue'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { useI18n } from '../i18n'
const props = defineProps<{ text: string; formula?: boolean; block?: boolean }>()
const { t } = useI18n()
const segments = computed(() => {
  const tokens: { text: string; html?: string; error?: boolean; block?: boolean }[] = []
  const math = (text: string, block: boolean) => {
    try { return { text, block, html: katex.renderToString(text, { displayMode: block, trust: false, strict: 'ignore', maxSize: 10, maxExpand: 1000, output: 'htmlAndMathml' }) } }
    catch { return { text, block, error: true } }
  }
  if (props.formula) return [math(props.text, Boolean(props.block))]
  const expression = /\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g
  let start = 0
  for (const match of props.text.matchAll(expression)) {
    if (match.index! > start) tokens.push({ text: props.text.slice(start, match.index) })
    tokens.push(math(match[1] ?? match[2]!, match[2] !== undefined))
    start = match.index! + match[0].length
  }
  if (start < props.text.length) tokens.push({ text: props.text.slice(start) })
  return tokens
})
const hasError = computed(() => segments.value.some(segment => segment.error))
</script>
<template>
  <span class="math-content">
    <template v-for="(segment, i) in segments" :key="i">
      <!-- Only KaTeX-generated, untrusted-mode HTML is inserted. Plain content is escaped by Vue. -->
      <span v-if="segment.html" :class="{ 'math-display': segment.block }" v-html="segment.html" />
      <span v-else :class="{ 'math-source-error': segment.error }" :title="segment.error ? t('task.mathError') : undefined">{{ segment.text }}</span>
    </template>
    <span v-if="hasError" class="math-render-error" role="status">{{ t('task.mathError') }}</span>
  </span>
</template>
