<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import { useI18n } from '../i18n'
import type { CalculationAnswer, TaskDefinition } from '../domain/types'
import { calculationLabel } from '../domain/tasks'
import { genId } from '../domain/importExport'
import MathInput from './MathInput.vue'
import WorkingSteps from './WorkingSteps.vue'
import NumberInput from './NumberInput.vue'
const task = defineModel<TaskDefinition>({ required: true })
defineProps<{ disabled?: boolean }>()
const { t } = useI18n()
function changeFormat(event: Event) {
  if (task.value.kind !== 'calculation') return
  const kind = (event.target as HTMLSelectElement).value as CalculationAnswer['kind']
  task.value.answer = kind === 'number' ? { kind, value: '' } : kind === 'fraction' ? { kind, numerator: '', denominator: '' } : kind === 'quantity' ? { kind, pairs: [{ value: '', unit: '' }] } : { kind, value: '' }
}
function correct(id: string, checked: boolean) {
  if (task.value.kind !== 'single_choice' && task.value.kind !== 'multiple_choice') return
  task.value.correctIds = task.value.kind === 'single_choice' ? [id] : checked ? [...task.value.correctIds.filter(v => v !== id), id] : task.value.correctIds.filter(v => v !== id)
}
function removeOption(id: string) {
  if (task.value.kind !== 'single_choice' && task.value.kind !== 'multiple_choice') return
  task.value.options = task.value.options.filter(o => o.id !== id)
  task.value.correctIds = task.value.correctIds.filter(v => v !== id)
}
function addGap() {
  if (task.value.kind !== 'cloze') return
  let n = 1; while (task.value.gaps.some(g => g.id === `gap${n}`)) n++
  task.value.gaps.push({ id: `gap${n}`, kind: 'text', answer: '' })
}
function reorder(i: number, d: number) {
  if (task.value.kind !== 'ordering') return
  const items = [...task.value.items], j = i + d
  if (j < 0 || j >= items.length) return
  ;[items[i], items[j]] = [items[j]!, items[i]!]
  task.value.items = items; task.value.correctOrder = items.map(o => o.id)
}
function removeItem(id: string) {
  if (task.value.kind !== 'ordering') return
  task.value.items = task.value.items.filter(o => o.id !== id)
  task.value.correctOrder = task.value.items.map(o => o.id)
}
function addItem() {
  if (task.value.kind !== 'ordering') return
  const item = { id: genId(), text: '' }; task.value.items.push(item); task.value.correctOrder.push(item.id)
}
</script>
<template>
  <div class="task-config">
    <template v-if="task.kind === 'calculation'">
      <label class="field-label" for="task-answer-format">{{ t('task.answerFormat') }}</label>
      <select id="task-answer-format" class="select" :value="task.answer.kind" @change="changeFormat"><option v-for="kind in (['number', 'fraction', 'quantity', 'formula'] as const)" :key="kind" :value="kind">{{ calculationLabel(kind) }}</option></select>
      <label class="field-label">{{ t('task.correctOption') }}</label>
      <NumberInput v-if="task.answer.kind === 'number'" v-model="task.answer.value" :label="t('task.correctOption')" :disabled="disabled" />
      <div v-else-if="task.answer.kind === 'fraction'" class="task-pair-row"><NumberInput v-model="task.answer.numerator" integer :label="t('task.numerator')" :placeholder="t('task.numerator')" :disabled="disabled" /><NumberInput v-model="task.answer.denominator" integer :label="t('task.denominator')" :placeholder="t('task.denominator')" :disabled="disabled" /></div>
      <MathInput v-else-if="task.answer.kind === 'formula'" v-model="task.answer.value" :label="t('task.correctOption')" :disabled="disabled" />
      <template v-else-if="task.answer.kind === 'quantity'">
        <p class="field-label">{{ t('task.validPairs') }}</p>
        <div v-for="(pair, i) in task.answer.pairs" :key="i" class="task-edit-row"><NumberInput v-model="pair.value" :label="`${t('task.value')} ${i + 1}`" :placeholder="t('task.value')" :disabled="disabled" /><input v-model="pair.unit" class="input" :aria-label="`${t('task.unit')} ${i + 1}`" :placeholder="t('task.unit')" maxlength="120" /><button class="btn btn-quiet" type="button" :disabled="task.answer.pairs.length <= 1" :aria-label="t('task.remove')" @click="task.answer.pairs.splice(i, 1)"><AppIcon name="x" :size="18" /></button></div>
        <button class="btn btn-secondary btn-sm" type="button" :disabled="task.answer.pairs.length >= 50" @click="task.answer.pairs.push({ value: '', unit: '' })">{{ t('task.addPair') }}</button>
      </template>
      <template v-if="task.answer.kind === 'number' || task.answer.kind === 'quantity'"><label class="field-label" for="task-tolerance">{{ t('task.tolerance') }}</label><input id="task-tolerance" class="input" inputmode="decimal" :value="task.answer.tolerance || ''" placeholder="0" maxlength="2048" @input="task.answer.tolerance = ($event.target as HTMLInputElement).value || undefined" /><p class="field-hint">{{ t('task.toleranceHint') }}</p></template>
      <details class="task-details"><summary>{{ t('task.solutionSteps') }}</summary><WorkingSteps :model-value="task.solutionSteps || []" :label="t('task.solutionSteps')" :disabled="disabled" @update:model-value="task.solutionSteps = $event" /></details>
    </template>
    <template v-else-if="task.kind === 'single_choice' || task.kind === 'multiple_choice'">
      <p class="field-label">{{ t('task.options') }}</p>
      <div v-for="(option, i) in task.options" :key="option.id" class="task-edit-row"><input :type="task.kind === 'single_choice' ? 'radio' : 'checkbox'" name="task-correct" :checked="task.correctIds.includes(option.id)" :aria-label="`${t('task.correctOption')} ${i + 1}`" @change="correct(option.id, ($event.target as HTMLInputElement).checked)" /><input v-model="option.text" class="input" :aria-label="`${t('task.options')} ${i + 1}`" maxlength="4000" /><button class="btn btn-quiet" type="button" :disabled="task.options.length <= 2" :aria-label="t('task.remove')" @click="removeOption(option.id)"><AppIcon name="x" :size="18" /></button></div>
      <button class="btn btn-secondary btn-sm" type="button" :disabled="task.options.length >= 50" @click="task.options.push({ id: genId(), text: '' })">{{ t('task.addOption') }}</button>
    </template>
    <template v-else-if="task.kind === 'true_false'"><label class="field-label" for="task-correct-boolean">{{ t('task.correctOption') }}</label><select id="task-correct-boolean" class="select" :value="String(task.correct)" @change="task.correct = ($event.target as HTMLSelectElement).value === 'true'"><option value="true">{{ t('task.true') }}</option><option value="false">{{ t('task.false') }}</option></select></template>
    <template v-else-if="task.kind === 'cloze'">
      <p class="field-hint">{{ t('task.gapHint') }}</p>
      <div v-for="(gap, i) in task.gaps" :key="i" class="task-gap-config">
        <div class="task-edit-row"><input v-model="gap.id" class="input" :aria-label="`${t('task.gapId')} ${i + 1}`" :placeholder="t('task.gapId')" maxlength="128" /><select v-model="gap.kind" class="select" :aria-label="t('task.answerFormat')"><option value="text">{{ t('task.type.short_text') }}</option><option value="number">{{ t('task.format.number') }}</option></select><button class="btn btn-quiet" type="button" :disabled="task.gaps.length <= 1" :aria-label="t('task.remove')" @click="task.gaps.splice(i, 1)"><AppIcon name="x" :size="18" /></button></div>
        <input v-model="gap.answer" class="input" :aria-label="`${t('task.correctOption')} ${gap.id}`" :placeholder="t('task.correctOption')" maxlength="4000" />
        <textarea class="textarea" rows="2" :value="(gap.alternatives || []).join('\n')" :aria-label="`${t('task.alternatives')} ${gap.id}`" :placeholder="t('task.alternatives')" @input="gap.alternatives = ($event.target as HTMLTextAreaElement).value.split('\n')" />
      </div><button class="btn btn-secondary btn-sm" type="button" :disabled="task.gaps.length >= 50" @click="addGap">{{ t('task.addGap') }}</button>
    </template>
    <template v-else-if="task.kind === 'matching'">
      <p class="field-label">{{ t('task.pairs') }}</p>
      <div v-for="(pair, i) in task.pairs" :key="pair.id" class="task-edit-row"><input v-model="pair.left" class="input" :aria-label="`${t('task.left')} ${i + 1}`" :placeholder="t('task.left')" maxlength="4000" /><input v-model="pair.right" class="input" :aria-label="`${t('task.right')} ${i + 1}`" :placeholder="t('task.right')" maxlength="4000" /><button class="btn btn-quiet" type="button" :disabled="task.pairs.length <= 2" :aria-label="t('task.remove')" @click="task.pairs.splice(i, 1)"><AppIcon name="x" :size="18" /></button></div><button class="btn btn-secondary btn-sm" type="button" :disabled="task.pairs.length >= 50" @click="task.pairs.push({ id: genId(), left: '', right: '' })">{{ t('task.addItem') }}</button>
    </template>
    <template v-else-if="task.kind === 'ordering'">
      <p class="field-label">{{ t('task.items') }}</p>
      <div v-for="(item, i) in task.items" :key="item.id" class="task-edit-row"><span>{{ i + 1 }}.</span><input v-model="item.text" class="input" :aria-label="`${t('task.left')} ${i + 1}`" maxlength="4000" /><button class="btn btn-secondary btn-sm" type="button" :disabled="i === 0" :aria-label="t('task.up')" @click="reorder(i, -1)"><AppIcon name="chevron-up" :size="18" /></button><button class="btn btn-secondary btn-sm" type="button" :disabled="i === task.items.length - 1" :aria-label="t('task.down')" @click="reorder(i, 1)"><AppIcon name="chevron-down" :size="18" /></button><button class="btn btn-quiet" type="button" :disabled="task.items.length <= 2" :aria-label="t('task.remove')" @click="removeItem(item.id)"><AppIcon name="x" :size="18" /></button></div><button class="btn btn-secondary btn-sm" type="button" :disabled="task.items.length >= 50" @click="addItem">{{ t('task.addItem') }}</button>
    </template>
    <template v-if="task.kind !== 'short_text' && task.kind !== 'long_text'"><label class="field-label" for="task-explanation">{{ t('task.explanation') }}</label><textarea id="task-explanation" class="textarea" :value="task.explanation || ''" rows="2" maxlength="4000" @input="task.explanation = ($event.target as HTMLTextAreaElement).value || undefined" /></template>
  </div>
</template>
