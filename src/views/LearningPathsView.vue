<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRouter } from 'vue-router'
import AppBar from '../components/AppBar.vue'
import AppIcon from '../components/AppIcon.vue'
import { useI18n } from '../i18n'
import { useLibraryStore } from '../stores/library'
import { readJsonSupplement } from '../services/importer'
import { missingSource, pathKey, type SavedPath } from '../../shared/learning-paths.mjs'
import { position } from '../domain/learningPath'
import example from '../../docs/learning-path.example.json'
import prompt from '../../docs/learning-path-prompt.md?raw'

const library = useLibraryStore(), router = useRouter(), { t } = useI18n()
const paths = computed(() => library.data.learningPaths || [])
const input = ref<HTMLInputElement>(), promptBox = ref<HTMLTextAreaElement>()
const busy = ref(false), message = ref(''), showPrompt = ref(false)
let navigationIntent = 0
function cancelInstallRedirect() { navigationIntent++ }
onBeforeRouteLeave(cancelInstallRedirect)
onBeforeRouteUpdate(cancelInstallRedirect)
function openPath(key: string) {
  cancelInstallRedirect()
  return router.push({ name: 'learning-path', params: { key } })
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
async function startExample() {
  if (busy.value) return
  busy.value = true
  try { await install(example, navigationIntent) } catch (e) { message.value = String(e) }
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
      <header class="page-heading"><div><h1>{{ t('path.learn') }}</h1><p class="page-subtitle">{{ t('path.intro') }}</p></div></header>
      <div class="path-actions">
        <button class="btn btn-primary" :disabled="busy" @click="input?.click()"><AppIcon name="file-json" />{{ t('path.import') }}</button>
        <button class="btn btn-secondary" @click="copyPrompt">{{ t('path.copy') }}</button>
        <input ref="input" class="file-input" type="file" accept=".json,application/json" @change="importFile">
      </div>
      <textarea v-if="showPrompt" ref="promptBox" class="textarea" rows="6" readonly :aria-label="t('path.copy')" :value="prompt" />
      <p v-if="message" role="status">{{ message }}</p>
      <section class="path-list" :aria-label="t('path.paths')">
        <article v-for="row in paths" :key="pathKey(row.content)" class="path-panel">
          <div><h2>{{ row.content.title }}</h2><p>{{ t('path.version', { version: row.content.version }) }} · {{ t('path.count', { done: row.progress.passed.length, total: position(row).total }) }}</p></div>
          <div class="path-actions">
            <button class="btn btn-secondary" @click="openPath(pathKey(row.content))">{{ position(row).goal ? t('path.resume') : t('path.open') }}</button>
            <button class="btn btn-danger" type="button" :disabled="busy || library.transactionBusy"
              :aria-label="t('path.deleteLabel', { title: row.content.title, version: row.content.version })"
              @click="removePath(row)">{{ t('path.delete') }}</button>
          </div>
        </article>
        <article v-if="!paths.some(row => pathKey(row.content) === pathKey(example))" class="path-panel">
          <div><h2>{{ example.title }}</h2><p>{{ t('path.exampleIntro') }}</p></div>
          <button class="btn btn-secondary" :disabled="busy" @click="startExample">{{ t('path.tryExample') }}</button>
        </article>
      </section>
    </main>
  </div>
</template>
