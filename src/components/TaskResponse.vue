<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import { computed, useId, watch, ref } from 'vue'
import { useI18n } from '../i18n'
import type { StudyResponse, TaskDefinition, TaskItem } from '../domain/types'
import { shuffled, fieldValue } from '../domain/tasks'
import MathContent from './MathContent.vue'
import MathInput from './MathInput.vue'
import NumberInput from './NumberInput.vue'
const props = withDefaults(defineProps<{ task?: TaskDefinition; front: string; modelValue: StudyResponse; disabled?: boolean; inputId?: string }>(), { disabled: false })
const emit = defineEmits<{ 'update:modelValue': [response: StudyResponse]; submit: [] }>()
const { t } = useI18n()
const uid = useId()
const id = computed(() => props.inputId || `answer-${uid}`)
const optionOrder = ref<string[]>([])
watch(() => props.task?.kind === 'single_choice' || props.task?.kind === 'multiple_choice' ? props.task.options.map(o => o.id).join(':') : props.task?.kind === 'matching' ? props.task.pairs.map(p => p.id).join(':') : '', () => {
  const task = props.task
  optionOrder.value = task?.kind === 'single_choice' || task?.kind === 'multiple_choice' ? shuffled(task.options.map(o => o.id)) : task?.kind === 'matching' ? shuffled(task.pairs.map(p => p.id)) : []
})
// Initialize once per attempt; changing a draft or retrying never reshuffles controls.
optionOrder.value = props.task?.kind === 'single_choice' || props.task?.kind === 'multiple_choice' ? shuffled(props.task.options.map(o => o.id)) : props.task?.kind === 'matching' ? shuffled(props.task.pairs.map(p => p.id)) : []
const options = computed(() => {
  const task = props.task
  return task?.kind === 'single_choice' || task?.kind === 'multiple_choice' ? optionOrder.value.map(id => task.options.find(o => o.id === id)).filter((item): item is TaskItem => Boolean(item)) : []
})
let fractionDraft: Extract<StudyResponse, { kind: 'fraction' }> = { kind: 'fraction', numerator: '', denominator: '' }
let decimalDraft = ''
function fractionMode(kind: 'fraction' | 'text') {
  if (props.modelValue.kind === kind) return
  if (props.modelValue.kind === 'fraction') fractionDraft = { ...props.modelValue }
  if (props.modelValue.kind === 'text') decimalDraft = props.modelValue.value
  emit('update:modelValue', kind === 'fraction' ? { ...fractionDraft } : { kind: 'text', value: decimalDraft })
}
const gapSegments = computed(() => props.front.split(/(\{\{[\w-]+\}\})/g))
const answer = computed(() => props.task?.kind === 'calculation' ? props.task.answer : null)
function text(value: string) { emit('update:modelValue', { kind: 'text', value }) }
function field(key: string, value: string) { emit('update:modelValue', { kind: 'fields', values: { ...(props.modelValue.kind === 'fields' ? props.modelValue.values : {}), [key]: value } }) }
function select(optionId: string, checked: boolean) {
  const ids = props.modelValue.kind === 'selection' ? props.modelValue.ids : []
  emit('update:modelValue', { kind: 'selection', ids: props.task?.kind === 'single_choice' ? [optionId] : checked ? [...ids.filter(id => id !== optionId), optionId] : ids.filter(id => id !== optionId) })
}
function move(i: number, direction: number) {
  if (props.modelValue.kind !== 'order') return
  const ids = [...props.modelValue.ids], j = i + direction
  if (j < 0 || j >= ids.length) return
  ;[ids[i], ids[j]] = [ids[j]!, ids[i]!]
  emit('update:modelValue', { kind: 'order', ids })
}
function keydown(event: KeyboardEvent) {
  if (event.isComposing || event.key !== 'Enter' || props.disabled) return
  const target = event.target as HTMLElement
  if ((event.ctrlKey || event.metaKey) || (target.tagName === 'INPUT' && !['radio', 'checkbox'].includes((target as HTMLInputElement).type))) {
    event.preventDefault(); event.stopPropagation(); emit('submit')
  }
}
</script>
<template>
  <div class="task-response" @keydown="keydown">
    <template v-if="!task || task.kind === 'short_text' || task.kind === 'long_text'">
      <label class="field-label" :for="id">{{ t('smart.yourAnswer') }}</label>
      <textarea v-if="!task || task.kind === 'long_text'" :id="id" class="textarea smart-answer-input" :value="modelValue.kind === 'text' ? modelValue.value : ''" :disabled="disabled" maxlength="20000" rows="3" :placeholder="t('smart.answerPlaceholder')" @input="text(($event.target as HTMLTextAreaElement).value)" />
      <input v-else :id="id" class="input" :value="modelValue.kind === 'text' ? modelValue.value : ''" :disabled="disabled" maxlength="20000" @input="text(($event.target as HTMLInputElement).value)" />
    </template>
    <template v-else-if="task.kind === 'calculation' && answer">
      <label class="field-label" :for="answer.kind === 'formula' ? undefined : id">{{ t('task.result') }}</label>
      <MathInput v-if="answer.kind === 'formula'" :model-value="modelValue.kind === 'text' ? modelValue.value : ''" :disabled="disabled" :label="t('task.result')" @update:model-value="text" @submit="emit('submit')" />
      <template v-else-if="answer.kind === 'fraction'">
        <div class="task-row-actions" role="group" :aria-label="t('task.answerFormat')"><button class="segment-button" :class="{ 'is-selected': modelValue.kind === 'fraction' }" type="button" :disabled="disabled" @click="fractionMode('fraction')">{{ t('task.format.fraction') }}</button><button class="segment-button" :class="{ 'is-selected': modelValue.kind === 'text' }" type="button" :disabled="disabled" @click="fractionMode('text')">{{ t('task.decimal') }}</button></div>
        <div v-if="modelValue.kind === 'fraction'" class="fraction-input">
          <NumberInput :input-id="id" :model-value="modelValue.numerator" :disabled="disabled" integer :label="t('task.numerator')" :placeholder="t('task.numerator')" @update:model-value="emit('update:modelValue', { ...modelValue, numerator: $event })" />
          <span class="fraction-rule" />
          <NumberInput :model-value="modelValue.denominator" :disabled="disabled" integer :label="t('task.denominator')" :placeholder="t('task.denominator')" @update:model-value="emit('update:modelValue', { ...modelValue, denominator: $event })" />
        </div>
        <NumberInput v-else :input-id="id" :model-value="modelValue.kind === 'text' ? modelValue.value : ''" :disabled="disabled" :label="t('task.result')" @update:model-value="text" />
      </template>
      <div v-else-if="answer.kind === 'quantity' && modelValue.kind === 'quantity'" class="task-pair-row">
        <NumberInput :input-id="id" :model-value="modelValue.value" :disabled="disabled" :label="t('task.value')" :placeholder="t('task.value')" @update:model-value="emit('update:modelValue', { ...modelValue, value: $event })" />
        <input class="input" :value="modelValue.unit" :disabled="disabled" :aria-label="t('task.unit')" :placeholder="t('task.unit')" maxlength="120" @input="emit('update:modelValue', { ...modelValue, unit: ($event.target as HTMLInputElement).value })" />
      </div>
      <NumberInput v-else :input-id="id" :model-value="modelValue.kind === 'text' ? modelValue.value : ''" :disabled="disabled" :label="t('task.result')" @update:model-value="text" />
    </template>
    <fieldset v-else-if="task.kind === 'single_choice' || task.kind === 'multiple_choice'" class="task-choices"><legend class="field-label">{{ t('smart.yourAnswer') }}</legend><label v-for="option in options" :key="option.id" class="task-choice"><input :type="task.kind === 'single_choice' ? 'radio' : 'checkbox'" :name="id" :checked="modelValue.kind === 'selection' && modelValue.ids.includes(option.id)" :disabled="disabled" @change="select(option.id, ($event.target as HTMLInputElement).checked)" /><MathContent :text="option.text" /></label></fieldset>
    <fieldset v-else-if="task.kind === 'true_false'" class="task-choices"><legend class="field-label">{{ t('smart.yourAnswer') }}</legend><label v-for="value in [true, false]" :key="String(value)" class="task-choice"><input type="radio" :name="id" :checked="modelValue.kind === 'boolean' && modelValue.value === value" :disabled="disabled" @change="emit('update:modelValue', { kind: 'boolean', value })" />{{ t(value ? 'task.true' : 'task.false') }}</label></fieldset>
    <div v-else-if="task.kind === 'cloze'" class="task-cloze">
      <template v-for="(segment, i) in gapSegments" :key="i">
        <template v-if="/^\{\{[\w-]+\}\}$/.test(segment)">
          <NumberInput v-if="task.gaps.find(g => g.id === segment.slice(2, -2))?.kind === 'number'" class="gap-input" :label="segment.slice(2, -2)" :model-value="modelValue.kind === 'fields' ? fieldValue(modelValue.values, segment.slice(2, -2)) : ''" :disabled="disabled" @update:model-value="field(segment.slice(2, -2), $event)" />
          <input v-else class="input gap-input" :aria-label="segment.slice(2, -2)" :value="modelValue.kind === 'fields' ? fieldValue(modelValue.values, segment.slice(2, -2)) : ''" :disabled="disabled" maxlength="4000" @input="field(segment.slice(2, -2), ($event.target as HTMLInputElement).value)" />
        </template>
        <MathContent v-else :text="segment" />
      </template>
    </div>
    <div v-else-if="task.kind === 'matching'" class="task-matching">
      <label v-for="pair in task.pairs" :key="pair.id" class="task-match-row"><MathContent :text="pair.left" /><select class="select" :value="modelValue.kind === 'fields' ? fieldValue(modelValue.values, pair.id) : ''" :disabled="disabled" @change="field(pair.id, ($event.target as HTMLSelectElement).value)"><option value="">{{ t('task.select') }}</option><option v-for="optionId in optionOrder" :key="optionId" :value="optionId">{{ task.pairs.find(p => p.id === optionId)?.right }}</option></select></label>
    </div>
    <ol v-else-if="task.kind === 'ordering' && modelValue.kind === 'order'" class="task-ordering"><li v-for="(itemId, i) in modelValue.ids" :key="itemId"><MathContent :text="task.items.find(o => o.id === itemId)?.text || ''" /><div class="task-row-actions"><button class="btn btn-secondary btn-sm" type="button" :disabled="disabled || i === 0" :aria-label="`${t('task.up')} ${i + 1}`" @click="move(i, -1)"><AppIcon name="chevron-up" :size="18" /></button><button class="btn btn-secondary btn-sm" type="button" :disabled="disabled || i === modelValue.ids.length - 1" :aria-label="`${t('task.down')} ${i + 1}`" @click="move(i, 1)"><AppIcon name="chevron-down" :size="18" /></button></div></li></ol>
  </div>
</template>
