<script setup lang="ts">
import { useI18n } from '../i18n'
import type { TaskQualityHint } from '../domain/taskQuality'
defineProps<{ hints: TaskQualityHint[]; disabled?: boolean }>()
defineEmits<{ convertSingle: []; explain: [] }>()
const { t } = useI18n()
</script>
<template>
  <ul v-if="hints.length" class="task-quality-hints">
    <li v-for="hint in hints" :key="hint.code" :data-quality-code="hint.code">
      <span>{{ t(`quality.${hint.code}`) }}</span>
      <button v-if="hint.code === 'missingExplanation'" class="btn btn-secondary btn-sm" type="button" :disabled="disabled" @click="$emit('explain')">{{ t('quality.addExplanation') }}</button>
      <button v-if="hint.code === 'singleCorrect'" class="btn btn-secondary btn-sm" type="button" :disabled="disabled" @click="$emit('convertSingle')">{{ t('quality.convertSingle') }}</button>
    </li>
  </ul>
</template>
