<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import { useI18n } from '../i18n'
import type { WorkingStep } from '../domain/types'
import MathInput from './MathInput.vue'
import { AI_TEXT_LIMIT, workingText } from '../domain/tasks'
const props = withDefaults(defineProps<{ modelValue: WorkingStep[]; disabled?: boolean; label: string }>(), { disabled: false })
const emit = defineEmits<{ 'update:modelValue': [steps: WorkingStep[]]; submit: [] }>()
const { t } = useI18n()
function update(i: number, value: string) { emit('update:modelValue', props.modelValue.map((s, n) => n === i ? { ...s, value } : s)) }
function add(kind: WorkingStep['kind']) { emit('update:modelValue', [...props.modelValue, { kind, value: '' }]) }
</script>
<template>
  <div class="working-steps" :aria-label="label">
    <div v-for="(step, i) in modelValue" :key="i" class="working-step">
      <div class="task-row-heading"><span>{{ i + 1 }}. {{ t(step.kind === 'math' ? 'task.mathStep' : 'task.textStep') }}</span><button class="btn btn-quiet btn-sm" type="button" :disabled="disabled" :aria-label="`${t('task.remove')} ${i + 1}`" @click="emit('update:modelValue', modelValue.filter((_, n) => n !== i))"><AppIcon name="x" :size="18" /></button></div>
      <MathInput v-if="step.kind === 'math'" :model-value="step.value" :label="`${label} ${i + 1}`" :disabled="disabled" @update:model-value="update(i, $event)" @submit="emit('submit')" />
      <textarea v-else class="textarea" :value="step.value" :aria-label="`${label} ${i + 1}`" :disabled="disabled" maxlength="4000" rows="2" @input="update(i, ($event.target as HTMLTextAreaElement).value)" />
    </div>
    <p v-if="workingText(modelValue).length > AI_TEXT_LIMIT" class="form-error" role="alert">{{ t('task.aiWorkingTooLong') }}</p>
    <div class="task-row-actions"><button class="btn btn-secondary btn-sm" type="button" :disabled="disabled || modelValue.length >= 50" @click="add('text')">{{ t('task.addTextStep') }}</button><button class="btn btn-secondary btn-sm" type="button" :disabled="disabled || modelValue.length >= 50" @click="add('math')">{{ t('task.addMathStep') }}</button></div>
  </div>
</template>
