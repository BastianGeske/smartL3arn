<script setup lang="ts">
import { useI18n } from '../i18n'
import type { Rating } from '../domain/types'

defineProps<{ intervals?: string[]; disabled?: boolean }>()
defineEmits<{ rate: [rating: Rating] }>()
const { t, formatStudyInterval } = useI18n()
const ratings = [{ value: 0, key: 'again' }, { value: 1, key: 'hard' }, { value: 2, key: 'good' }, { value: 3, key: 'easy' }] as const
</script>

<template>
  <div class="rating-buttons" role="group" :aria-label="t('study.rateAnswer')">
    <button v-for="rating in ratings" :key="rating.key" class="rating-button" :class="`rating-${rating.key}`" type="button" :disabled="disabled" :aria-keyshortcuts="String(rating.value + 1)" @click="$emit('rate', rating.value)">
      <span>{{ t(`rating.${rating.key}`) }} <kbd>{{ rating.value + 1 }}</kbd></span>
      <strong>{{ intervals ? formatStudyInterval(intervals[rating.value] || '') : t('rating.rate') }}</strong>
    </button>
  </div>
</template>
