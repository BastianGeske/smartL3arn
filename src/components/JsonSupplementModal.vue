<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from '../i18n'
import { SupplementError, type SupplementPlan } from '../domain/jsonSupplement'
import { useDialogKeyboard } from '../composables/useDialogKeyboard'
import { useLibraryStore } from '../stores/library'
import { useUiStore } from '../stores/ui'
import AppIcon from './AppIcon.vue'

const props = defineProps<{ deckId: string; preview: { payload: unknown; plan: SupplementPlan; filename: string } | null }>()
const emit = defineEmits<{ close: []; applied: [] }>()
const { t } = useI18n()
const library = useLibraryStore(), ui = useUiStore()
const saving = ref(false), error = ref(''), page = ref(0)
const closeButton = ref<HTMLButtonElement>()
const editor = computed(() => props.preview)
useDialogKeyboard(editor)
const pages = computed(() => Math.max(1, Math.ceil((props.preview?.plan.changes.length || 0) / 20)))
const visible = computed(() => props.preview?.plan.changes.slice(page.value * 20, (page.value + 1) * 20) || [])
watch(editor, async value => {
  document.body.classList.toggle('modal-open', Boolean(value))
  error.value = ''; page.value = 0
  if (value) { await nextTick(); closeButton.value?.focus() }
})
onBeforeUnmount(() => document.body.classList.remove('modal-open'))
function close() { if (!saving.value) emit('close') }
async function apply() {
  const preview = props.preview
  if (!preview || saving.value) return
  saving.value = true; error.value = ''
  try {
    await library.applyJsonSupplement(props.deckId, preview.payload, preview.plan.source)
    ui.showToast('supplement.saved', { added: preview.plan.added, updated: preview.plan.updated })
    emit('applied')
  } catch (cause) { error.value = t(cause instanceof SupplementError ? cause.key : 'supplement.saveFailed') }
  finally { saving.value = false }
}
</script>

<template>
  <div v-if="preview" class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="supplement-title" @click.self="close" @keydown.esc="close">
    <div class="modal deck-editor-modal json-supplement-modal" :aria-busy="saving">
      <div class="modal-header">
        <h2 id="supplement-title">{{ t('supplement.title') }}</h2>
        <button ref="closeButton" class="btn-icon" type="button" :disabled="saving" :aria-label="t('common.cancel')" @click="close"><AppIcon name="x" /></button>
      </div>
      <div class="modal-body">
        <p class="field-hint supplement-filename">{{ preview.filename }} · {{ library.deckById(deckId)?.name }}</p>
        <p role="status">{{ t('supplement.counts', { added: preview.plan.added, updated: preview.plan.updated, unchanged: preview.plan.unchanged }) }}</p>
        <p class="field-hint">{{ t('supplement.preserve') }}</p>
        <p class="field-hint">{{ t('supplement.matching') }}</p>
        <p v-if="!preview.plan.changes.length">{{ t('supplement.noChanges') }}</p>
        <ul class="supplement-changes">
          <li v-for="change in visible" :key="change.after.id">
            <strong>{{ t(change.before ? 'supplement.update' : 'supplement.add') }}</strong>
            <div v-if="change.before" class="supplement-content">
              <h3>{{ t('supplement.before') }}</h3>
              <p>{{ change.before.front }}</p><p>{{ change.before.back }}</p>
              <details v-if="change.before.task"><summary>{{ t('supplement.task') }}</summary><pre>{{ JSON.stringify(change.before.task, null, 2) }}</pre></details>
            </div>
            <div class="supplement-content">
              <h3>{{ t('supplement.after') }}</h3>
              <p>{{ change.after.front }}</p><p>{{ change.after.back }}</p>
              <details v-if="change.after.task"><summary>{{ t('supplement.task') }}</summary><pre>{{ JSON.stringify(change.after.task, null, 2) }}</pre></details>
            </div>
          </li>
        </ul>
        <div v-if="pages > 1" class="task-row-actions">
          <button class="btn btn-secondary btn-sm" type="button" :disabled="saving || page === 0" @click="page--">{{ t('quality.previous') }}</button>
          <span>{{ t('quality.page', { page: page + 1, pages }) }}</span>
          <button class="btn btn-secondary btn-sm" type="button" :disabled="saving || page + 1 >= pages" @click="page++">{{ t('quality.next') }}</button>
        </div>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" type="button" :disabled="saving" @click="close">{{ t('common.cancel') }}</button>
        <button class="btn btn-primary" type="button" :disabled="saving || !preview.plan.changes.length" @click="apply">{{ t('supplement.apply') }}</button>
      </div>
    </div>
  </div>
</template>
