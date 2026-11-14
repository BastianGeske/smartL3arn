<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from '../i18n'
import type { Card } from '../domain/types'
import { matchingDrafts, type SplitDraft } from '../domain/splitMatching'
import MathContent from './MathContent.vue'
import TaskSolution from './TaskSolution.vue'
const props = defineProps<{ source: Card; busy: boolean; error: boolean }>()
const emit = defineEmits<{ cancel: []; create: [drafts: SplitDraft[], replaceOriginal: boolean] }>()
const { t } = useI18n()
const drafts = ref(matchingDrafts(props.source))
const context = ref(''), contextInput = ref<HTMLInputElement>()
const replaceOriginal = ref(false)
const automatic = new Set(drafts.value.map(draft => draft.pairId))
const pairText = (id: string) => props.source.task?.kind === 'matching' ? props.source.task.pairs.find(pair => pair.id === id)?.left || '' : ''
watch(context, value => {
  for (const draft of drafts.value) if (automatic.has(draft.pairId)) draft.front = value.trim() ? t('split.question', { context: value.trim(), term: pairText(draft.pairId) }) : ''
})
const selected = computed(() => drafts.value.filter(draft => draft.selected))
const valid = computed(() => selected.value.length > 0 && selected.value.every(draft => draft.front.trim() && draft.back.trim()))
onMounted(async () => { await nextTick(); contextInput.value?.focus() })
</script>
<template>
  <div class="modal-body split-matching-editor">
    <p>{{ t('split.intro') }}</p>
    <p v-if="source.task?.explanation" class="field-hint">{{ t('split.explanationHint') }}</p>
    <details class="task-details"><summary>{{ t('split.original') }}</summary><MathContent :text="source.front" /><TaskSolution :card="source" /></details>
    <fieldset class="task-editor-fields split-drafts" :disabled="busy">
      <label class="field-label" for="split-context">{{ t('split.context') }}</label>
      <input id="split-context" ref="contextInput" v-model="context" class="input" maxlength="1000" :placeholder="t('split.contextPlaceholder')" />
      <p class="field-hint">{{ t('split.contextHint') }}</p>
      <fieldset v-for="(draft, i) in drafts" :key="draft.pairId" class="split-draft">
        <legend><label><input v-model="draft.selected" type="checkbox" /> {{ pairText(draft.pairId) }}</label></legend>
        <label class="field-label" :for="`split-front-${i}`">{{ t('common.front') }}</label>
        <textarea :id="`split-front-${i}`" v-model="draft.front" class="textarea" rows="2" maxlength="20000" :disabled="!draft.selected || busy" @input="automatic.delete(draft.pairId)" />
        <label class="field-label" :for="`split-back-${i}`">{{ t('common.back') }}</label>
        <textarea :id="`split-back-${i}`" v-model="draft.back" class="textarea" rows="3" maxlength="20000" :disabled="!draft.selected || busy" />
      </fieldset>
      <label class="split-replace"><input v-model="replaceOriginal" type="checkbox" /> {{ t('split.replace') }}</label>
      <p class="field-hint">{{ t(replaceOriginal ? 'split.replaceHint' : 'split.keepHint') }}</p>
    </fieldset>
    <p v-if="!valid" class="field-hint">{{ t('split.incomplete') }}</p>
    <p v-if="error" class="form-error" role="alert">{{ t('split.failed') }}</p>
  </div>
  <div class="modal-footer">
    <button class="btn btn-secondary" type="button" :disabled="busy" @click="emit('cancel')">{{ t('common.cancel') }}</button>
    <button class="btn btn-primary" type="button" :disabled="busy || !valid" @click="emit('create', drafts, replaceOriginal)">{{ t('split.create', { count: selected.length }) }}</button>
  </div>
</template>
