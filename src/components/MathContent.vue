<script setup lang="ts">
import { computed } from 'vue'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { useI18n } from '../i18n'
const props = defineProps<{ text: string; formula?: boolean; block?: boolean; formatBold?: boolean }>()
const { t } = useI18n()
type Segment = { text: string; html?: string; error?: boolean; block?: boolean }
type Group = { segments: Segment[]; bold?: boolean }

const mathPattern = /\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g
const prosePattern = new RegExp([mathPattern.source, /(\*\*+)/.source, /\r?\n/.source].join('|'), 'g')

function math(text: string, block: boolean): Segment {
  try { return { text, block, html: katex.renderToString(text, { displayMode: block, trust: false, strict: 'ignore', maxSize: 10, maxExpand: 1000, output: 'htmlAndMathml' }) } }
  catch { return { text, block, error: true } }
}

const groups = computed<Group[]>(() => {
  const { text, formula, block, formatBold } = props
  if (formula) return [{ segments: [math(text, Boolean(block))] }]

  let plain: Segment[] = []
  const result: Group[] = [{ segments: plain }]
  let pending: Segment[] | undefined
  function preserveUnclosedMarker() {
    if (!pending) return
    plain.push({ text: '**' }, ...pending)
    pending = undefined
  }
  let start = 0
  for (const match of text.matchAll(formatBold ? prosePattern : mathPattern)) {
    const index = match.index!
    const [token, inlineMath, displayMath, marker] = match
    if (index > start) (pending ?? plain).push({ text: text.slice(start, index) })
    start = index + token.length

    if (marker) {
      const previous = text.charAt(index - 1)
      if (marker !== '**' || previous === '\\') {
        (pending ?? plain).push({ text: token })
      } else if (pending?.length && /\S/.test(previous)) {
        result.push({ bold: true, segments: pending })
        pending = undefined
        plain = []
        result.push({ segments: plain })
      } else if (/\S/.test(text.charAt(start))) {
        preserveUnclosedMarker()
        pending = []
      } else {
        (pending ?? plain).push({ text: token })
      }
    } else if (inlineMath !== undefined || displayMath !== undefined) {
      (pending ?? plain).push(math(inlineMath ?? displayMath!, displayMath !== undefined))
    } else {
      preserveUnclosedMarker()
      plain.push({ text: token })
    }
  }
  preserveUnclosedMarker()
  if (start < text.length) plain.push({ text: text.slice(start) })
  return result
})
const hasError = computed(() => groups.value.some(group => group.segments.some(segment => segment.error)))
</script>
<template>
  <span class="math-content">
    <component :is="group.bold ? 'strong' : 'span'" v-for="(group, i) in groups" :key="i">
      <template v-for="(segment, j) in group.segments" :key="j">
        <!-- Only KaTeX-generated, untrusted-mode HTML is inserted. Plain content is escaped by Vue. -->
        <span v-if="segment.html" :class="{ 'math-display': segment.block }" v-html="segment.html" />
        <span v-else :class="{ 'math-source-error': segment.error }" :title="segment.error ? t('task.mathError') : undefined">{{ segment.text }}</span>
      </template>
    </component>
    <span v-if="hasError" class="math-render-error" role="status">{{ t('task.mathError') }}</span>
  </span>
</template>
