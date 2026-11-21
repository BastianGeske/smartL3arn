<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRouter } from 'vue-router'
import AppBar from '../components/AppBar.vue'
import AppIcon from '../components/AppIcon.vue'
import { useI18n } from '../i18n'
import { useLibraryStore } from '../stores/library'
import { readJsonSupplement } from '../services/importer'
import { missingSource, pathKey, type SavedPath } from '../../shared/learning-paths.mjs'
import { useCalendarStore } from '../stores/calendar'
import { dueObjectives } from '../domain/pathReview'
import { position } from '../domain/learningPath'
import prompt from '../../docs/learning-path-prompt.md?raw'

const library = useLibraryStore(), router = useRouter(), { t } = useI18n()
const calendar = useCalendarStore()
const paths = computed(() => library.data.learningPaths || [])
const entries = computed(() => paths.value.map(row => {
  const due = dueObjectives(row, calendar.today).length
  const reviewing = Boolean(row.progress.reviewSession)
  return { row, key: pathKey(row.content), due, reviewing, total: position(row).total }
}).sort((a, b) => Number(b.reviewing) - Number(a.reviewing) || Number(b.due > 0) - Number(a.due > 0)))
const input = ref<HTMLInputElement>(), promptBox = ref<HTMLTextAreaElement>()
const busy = ref(false), message = ref(''), showPrompt = ref(false)
let navigationIntent = 0
function cancelInstallRedirect() { navigationIntent++ }
onBeforeRouteLeave(cancelInstallRedirect)
onBeforeRouteUpdate(cancelInstallRedirect)
function openPath(key: string, review = false) {
  cancelInstallRedirect()
  return router.push({ name: 'learning-path', params: { key }, query: review ? { review: '1' } : {} })
}
async function install(value: unknown, intent: number) {
  const key = await library.installPath(value)
  if (navigationIntent === intent) await openPath(key)
}
async function removePath(row: SavedPath) {
  if (busy.value || library.transactionBusy) return
  const { title, version } = row.content
  if (!window.confirm(t('path.deleteConfirm', { title, version }))) return
  busy.value = true
  message.value = ''
  try { await library.deletePath(pathKey(row.content)); message.value = t('path.deleted') }
  catch { message.value = t('path.deleteFailed') }
  finally { busy.value = false }
}
async function importFile(event: Event) {
  const target = event.target as HTMLInputElement, file = target.files?.[0]
  if (!file || busy.value) return
  busy.value = true
  message.value = ''
  const intent = navigationIntent
  try {
    const value = await readJsonSupplement(file)
    const missing = missingSource(value)
    if (missing) message.value = t('path.needsSource') + ' ' + missing.join(' · ')
    else await install(value, intent)
  } catch (error) { message.value = t('path.invalid') + ' ' + (error instanceof Error ? error.message : '') }
  finally { busy.value = false; target.value = '' }
}
async function copyPrompt() {
  try { await navigator.clipboard.writeText(prompt); message.value = t('path.copied') }
  catch {
    showPrompt.value = true
    await nextTick()
    promptBox.value?.focus()
    promptBox.value?.select()
    message.value = t('path.copyManually')
  }
}
</script>
<template>
  <div class="app-shell">
    <AppBar active="library" :title="t('path.learn')" />
    <main class="workspace path-workspace">
      <header class="page-heading"><div><h1>{{ t('library.pathsMode') }}</h1><p class="page-subtitle">{{ t('path.intro') }}</p></div></header>
      <div class="path-actions">
        <button class="btn btn-primary" :disabled="busy" @click="input?.click()"><AppIcon name="file-json" />{{ t('path.import') }}</button>
        <input ref="input" class="file-input" type="file" accept=".json,application/json" @change="importFile">
      </div>
      <p v-if="message" role="status">{{ message }}</p>
      <section class="path-list" :aria-label="t('path.paths')">
        <article v-for="{row, key, due, reviewing, total} in entries" :key="key" class="path-panel">
          <div class="path-panel-info">
            <h2>{{ row.content.title }}</h2>
            <p>{{ t('path.count', { done: row.progress.passed.length, total }) }} · {{ t('path.version', { version: row.content.version }) }}</p>
            <progress class="path-progress" :value="row.progress.passed.length" :max="total"
              :aria-label="t('path.count', { done: row.progress.passed.length, total })" />
            <p v-if="reviewing || due" class="path-panel-status">{{ reviewing ? t('path.inReview') : t('path.dueCount', { count: due }) }}</p>
          </div>
          <div class="path-panel-actions">
            <button class="btn btn-primary" type="button" @click="openPath(key, reviewing || due > 0)">
              {{ reviewing ? t('path.resumeReview') : due ? t('path.reviewDue', { count: Math.min(due, 3) }) : row.progress.passed.length < total ? t('path.resume') : t('path.openCompleted') }}
            </button>
            <button v-if="reviewing || due" class="btn btn-quiet" type="button" @click="openPath(key)">
              {{ row.progress.passed.length < total ? t('path.resume') : t('path.openCompleted') }}
            </button>
            <button class="btn btn-quiet path-remove" type="button" :disabled="busy || library.transactionBusy"
              :aria-label="t('path.deleteLabel', { title: row.content.title, version: row.content.version })"
              @click="removePath(row)">{{ t('path.delete') }}</button>
          </div>
        </article>
        <div v-if="!entries.length" class="path-panel">
          <div class="path-panel-info"><h2>{{ t('path.empty') }}</h2><p>{{ t('path.emptyDescription') }}</p></div>
        </div>
      </section>
      <details class="path-outline path-authoring">
        <summary>{{ t('path.createFromMaterial') }}</summary>
        <p>{{ t('path.createInstructions') }}</p>
        <button class="btn btn-secondary" @click="copyPrompt">{{ t('path.copy') }}</button>
        <textarea v-if="showPrompt" ref="promptBox" class="textarea" rows="6" readonly :aria-label="t('path.copy')" :value="prompt" />
      </details>
    </main>
  </div>
</template>
