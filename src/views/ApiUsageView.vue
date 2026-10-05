<script setup lang="ts">
import { useI18n, type TranslationKey } from '../i18n'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import AppBar from '../components/AppBar.vue'
import AppIcon from '../components/AppIcon.vue'
import { sumApiUsage, type ApiUsageReport } from '../domain/apiUsage'
import { todayStr } from '../domain/dates'
import { saveExport } from '../services/native'
import { getAiBridge } from '../services/ai'

const { t, locale, formatNumber, formatCurrency } = useI18n()

const ai = getAiBridge()
const available = Boolean(ai?.getApiUsage)
const diagnosticsAvailable = Boolean(ai?.getAiDiagnostics)
const aiStatus = ref<Awaited<ReturnType<NonNullable<typeof ai>['getAiStatus']>> | null>(null)
const exportingLogs = ref(false)
const diagnosticMessage = ref<TranslationKey | ''>('')
const diagnosticError = ref(false)
const report = ref<ApiUsageReport | null>(null)
const loading = ref(false)
const error = ref<TranslationKey | ''>('')
const period = ref('all')
const model = ref('all')
const models = computed(() => [...new Set(report.value?.groups.map((group) => group.model) || [])].sort())
const filtered = computed(() => {
  let earliest = ''
  if (period.value !== 'all') {
    const date = new Date()
    date.setDate(date.getDate() - (Number(period.value) - 1))
    earliest = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }
  return (report.value?.groups || []).filter((group) =>
    (model.value === 'all' || group.model === model.value)
    && (!earliest || (group.day >= earliest && group.day <= todayStr())),
  )
})
const totals = computed(() => sumApiUsage(filtered.value))
const today = computed(() => sumApiUsage((report.value?.groups || []).filter((group) =>
  group.day === todayStr() && (model.value === 'all' || group.model === model.value),
)))
const averageCost = computed(() => totals.value.costRequests ? totals.value.costUsd / totals.value.costRequests : null)

async function refresh() {
  if (!available || !ai || loading.value) return
  loading.value = true
  error.value = ''
  try {
    const [usage, status] = await Promise.all([ai.getApiUsage(), ai.getAiStatus()])
    report.value = usage
    aiStatus.value = status
    if (model.value !== 'all' && !usage.groups.some(group => group.model === model.value)) model.value = 'all'
  } catch {
    error.value = 'usage.loadError'
  } finally {
    loading.value = false
  }
}

async function exportLogs() {
  if (!ai?.getAiDiagnostics) return
  exportingLogs.value = true
  diagnosticMessage.value = ''
  diagnosticError.value = false
  try {
    const logs = await ai.getAiDiagnostics()
    if (!logs.content) {
      diagnosticMessage.value = logs.persistenceError ? 'usage.logsIncomplete' : 'usage.logsEmpty'
      diagnosticError.value = logs.persistenceError
      return
    }
    await saveExport(logs.filename, logs.content, 'application/x-ndjson')
    diagnosticMessage.value = logs.persistenceError ? 'usage.logsIncomplete' : 'usage.logsExported'
    diagnosticError.value = logs.persistenceError
  } catch {
    diagnosticMessage.value = 'usage.logsError'
    diagnosticError.value = true
  } finally {
    exportingLogs.value = false
  }
}

function dayLabel(day: string) {
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }).format(new Date(`${day}T12:00:00`))
}

function resume() { if (document.visibilityState === 'visible') void refresh() }
onMounted(() => { void refresh(); document.addEventListener('visibilitychange', resume) })
onUnmounted(() => document.removeEventListener('visibilitychange', resume))
</script>

<template>
  <div class="app-shell">
    <AppBar active="usage" />
    <main class="workspace usage-workspace">
      <header class="page-heading">
        <div>
          <p class="page-kicker">{{ t('usage.kicker') }}</p>
          <h1>{{ t('nav.usage') }}</h1>
          <p class="page-subtitle">{{ t('usage.subtitle') }}</p>
        </div>
        <div class="usage-actions">
          <button v-if="diagnosticsAvailable" class="btn btn-secondary" type="button" :disabled="exportingLogs" @click="exportLogs">
            <AppIcon name="file-text" :size="16" />{{ exportingLogs ? t('usage.logsExporting') : t('usage.exportLogs') }}
          </button>
          <button v-if="available" class="btn btn-secondary" type="button" :disabled="loading" @click="refresh">
            <AppIcon name="rotate-ccw" :size="16" />{{ loading ? t('usage.refreshing') : t('usage.refresh') }}
          </button>
        </div>
      </header>

      <p v-if="!available" class="usage-notice" role="status">
        {{ t('usage.desktopOnly') }}
      </p>
      <p v-else-if="error" class="usage-notice" role="alert">{{ t(error) }}</p>
      <p v-if="loading && !report" role="status">{{ t('usage.loading') }}</p>
      <p v-if="diagnosticMessage" class="usage-notice" :role="diagnosticError ? 'alert' : 'status'">{{ t(diagnosticMessage) }}</p>
      <p v-if="aiStatus" class="usage-connection" role="status">
        {{ aiStatus.configured ? t('ai.configured') : t('ai.notConfigured') }}
        <span v-if="aiStatus.configured"> · {{ aiStatus.credentialSource === 'bundled' ? t('ai.bundledKey') : aiStatus.credentialSource === 'environment' ? t('ai.environmentKey') : t('ai.storedKey') }}</span>
      </p>

      <template v-if="report">
        <p v-if="report.persistenceError || report.unreadableEntries" class="usage-notice" role="alert">
          {{ t('usage.incomplete') }}
        </p>
        <div class="usage-filters">
          <label>{{ t('usage.period') }}
            <select v-model="period" class="text-input">
              <option value="all">{{ t('usage.allTime') }}</option>
              <option value="1">{{ t('usage.today') }}</option>
              <option value="7">{{ t('usage.lastDays', { count: 7 }) }}</option>
              <option value="30">{{ t('usage.lastDays', { count: 30 }) }}</option>
            </select>
          </label>
          <label>{{ t('usage.model') }}
            <select v-model="model" class="text-input">
              <option value="all">{{ t('usage.allModels') }}</option>
              <option v-for="name in models" :key="name" :value="name">{{ name }}</option>
            </select>
          </label>
          <p class="usage-current-model">{{ t('usage.configured') }} <strong>{{ report.model }}</strong></p>
        </div>

        <section class="summary-strip" :aria-label="t('usage.summary')">
          <div class="summary-item"><span class="summary-icon"><AppIcon name="sparkles" /></span>
            <div><strong>{{ formatNumber(totals.requests) }}</strong><span>{{ t('usage.requests') }}</span></div>
          </div>
          <div class="summary-item"><span class="summary-icon"><AppIcon name="layers-3" /></span>
            <div><strong>{{ totals.tokenRequests ? formatNumber(totals.totalTokens) : '—' }}</strong><span>{{ t('usage.tokens') }}</span></div>
          </div>
          <div class="summary-item"><span class="summary-icon"><AppIcon name="gauge" /></span>
            <div><strong>{{ totals.costRequests ? formatCurrency(totals.costUsd) : '—' }}</strong><span>{{ t('usage.cost') }}</span></div>
          </div>
          <div class="summary-item"><span class="summary-icon"><AppIcon name="calendar-days" /></span>
            <div><strong>{{ formatNumber(today.requests) }}</strong><span>{{ t('usage.todayRequests') }}</span></div>
          </div>
        </section>

        <section class="usage-details" :aria-label="t('usage.detailsRegion')">
          <div>
            <h2>{{ t('usage.details') }}</h2>
            <dl class="usage-breakdown">
              <div><dt>{{ t('usage.input') }}</dt><dd>{{ totals.tokenRequests ? formatNumber(totals.inputTokens) : '—' }}</dd></div>
              <div><dt>{{ t('usage.output') }}</dt><dd>{{ totals.tokenRequests ? formatNumber(totals.outputTokens) : '—' }}</dd></div>
              <div><dt>{{ t('usage.cacheReasoning') }}</dt><dd>{{ formatNumber(totals.cachedTokens) }} / {{ formatNumber(totals.reasoningTokens) }}</dd></div>
              <div><dt>{{ t('usage.outcomes') }}</dt><dd>{{ formatNumber(totals.successes) }} / {{ formatNumber(totals.failures) }}</dd></div>
            </dl>
            <p class="usage-caption">{{ t('usage.subsets') }}</p>
          </div>
          <div class="usage-projection">
            <p class="page-kicker">{{ t('usage.projection') }}</p>
            <h2>{{ t('usage.projectionTitle', { count: 10_000 }) }}</h2>
            <strong class="usage-projection-value">{{ averageCost !== null ? formatCurrency(averageCost * 10_000) : t('usage.noCost') }}</strong>
            <p class="usage-caption">
              {{ averageCost !== null
                ? t('usage.estimate', { count: totals.costRequests, average: formatCurrency(averageCost) })
                : t('usage.futureEstimate') }}
              {{ t('usage.estimateNote') }}
            </p>
          </div>
        </section>

        <section class="library-section" aria-labelledby="usage-history-title">
          <div class="section-heading"><h2 id="usage-history-title">{{ t('usage.history') }}</h2></div>
          <p v-if="!filtered.length" class="usage-notice">
            {{ report.groups.length ? t('usage.noMatches') : t('usage.empty') }}
          </p>
          <div v-else class="table-wrapper usage-table-wrapper" role="region" :aria-label="t('usage.table')" tabindex="0">
            <table class="usage-table">
              <thead><tr><th scope="col">{{ t('usage.day') }}</th><th scope="col">{{ t('usage.model') }}</th><th scope="col">{{ t('usage.requests') }}</th><th scope="col">{{ t('usage.input') }}</th><th scope="col">{{ t('usage.output') }}</th><th scope="col">{{ t('usage.usd') }}</th></tr></thead>
              <tbody><tr v-for="group in filtered" :key="`${group.day}:${group.model}`">
                <td :data-label="t('usage.day')">{{ dayLabel(group.day) }}</td><td class="usage-model-cell" :data-label="t('usage.model')">{{ group.model }}</td>
                <td :data-label="t('usage.requests')">{{ formatNumber(group.requests) }}<small v-if="group.failures">{{ t('usage.failures', { count: group.failures }) }}</small></td>
                <td :data-label="t('usage.input')">{{ group.tokenRequests ? formatNumber(group.inputTokens) : '—' }}</td>
                <td :data-label="t('usage.output')">{{ group.tokenRequests ? formatNumber(group.outputTokens) : '—' }}</td>
                <td :data-label="t('usage.usd')">{{ group.costRequests ? formatCurrency(group.costUsd) : '—' }}<small v-if="group.costRequests < group.requests">{{ t('usage.coverage', { known: group.costRequests, total: group.requests }) }}</small></td>
              </tr></tbody>
            </table>
          </div>
          <p class="usage-caption usage-footnote">
            {{ t('usage.footnote', { tokens: totals.tokenRequests, total: totals.requests, costs: totals.costRequests }) }}
          </p>
        </section>
      </template>
      <p v-if="available" class="usage-caption usage-device-note">{{ t('usage.deviceScope') }}</p>
      <p v-if="diagnosticsAvailable" class="usage-caption usage-log-note">{{ t('usage.logsPrivacy') }}</p>
    </main>
  </div>
</template>

<style scoped>
.usage-actions { display: flex; flex-wrap: wrap; gap: 10px; }
.usage-log-note { margin: 0 0 20px; }
.usage-device-note { margin: 0 0 12px; }
.usage-connection { padding: 14px; border: 1px solid var(--border); border-radius: var(--radius); font-size: 13px; line-height: 1.6; margin-bottom: 20px; }
.usage-filters { display: flex; align-items: end; flex-wrap: wrap; gap: 20px; margin: 0 0 24px; }
.usage-filters label { display: grid; gap: 8px; color: var(--text-muted); font-size: 13px; font-weight: 650; }
.usage-filters select { min-width: 180px; max-width: 100%; }
.usage-current-model { margin-left: auto; padding-bottom: 10px; font-size: 12px; color: var(--text-muted); overflow-wrap: anywhere; }
.usage-current-model strong { color: var(--text); }
.usage-notice { padding: 20px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); line-height: 1.6; margin-bottom: 20px; }
.usage-details { display: grid; grid-template-columns: 1fr 1fr; gap: 36px; margin: 32px 0; }
.usage-details h2 { font-size: 18px; }
.usage-breakdown { padding: 18px; border: 1px solid var(--border); display: grid; gap: 12px; margin-top: 20px; }
.usage-breakdown > div { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; }
.usage-breakdown dt { color: var(--text-muted); }
.usage-breakdown dd { font-weight: 700; font-variant-numeric: tabular-nums; }
.usage-caption { color: var(--text-muted); font-size: 12px; line-height: 1.7; margin-top: 16px; }
.usage-projection { background: var(--primary-soft); border-radius: var(--radius); padding: 24px; }
.usage-projection-value { display: block; margin-top: 16px; font-size: 26px; color: var(--primary); overflow-wrap: anywhere; }
.usage-model-cell { max-width: 240px; overflow-wrap: anywhere; }
.usage-table-wrapper { overflow: auto; border: 1px solid var(--border); background: var(--surface); }
.usage-table { min-width: 720px; display: table; }
.usage-table thead { display: table-header-group; }
.usage-table tbody { display: table-row-group; }
.usage-table tr { display: table-row; }
.usage-table td { display: table-cell; padding: 9px 13px; border-bottom: 1px solid var(--border); font-variant-numeric: tabular-nums; }
.usage-table td::before { display: none; }
.usage-table td small { display: block; color: var(--text-muted); margin-top: 4px; font-size: 11px; }
.usage-footnote { margin-top: 20px; }
@media (max-width: 600px) {
  .usage-actions { width: 100%; display: grid; grid-template-columns: 1fr; }
  .usage-actions .btn { width: 100%; }
  .usage-table-wrapper { border: 0; overflow: visible; background: transparent; }
  .usage-table, .usage-table tbody { display: block; min-width: 0; }
  .usage-table thead { display: none; }
  .usage-table tr { display: grid; grid-template-columns: 1fr 1fr; padding: 14px; margin-bottom: 12px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); gap: 14px; }
  .usage-table td { display: block; min-width: 0; padding: 0; border: 0; }
  .usage-table td:nth-child(2) { grid-column: 1 / -1; grid-row: 2; max-width: none; }
  .usage-table td::before { display: block; content: attr(data-label); margin-bottom: 5px; color: var(--text-muted); font-size: 11px; font-weight: 600; }
  .usage-table td small { white-space: normal; }
}
.summary-item strong { font-size: 22px; overflow-wrap: anywhere; }
@media (max-width: 800px) {
  .usage-details { grid-template-columns: 1fr; gap: 24px; }
  .usage-current-model { width: 100%; margin-left: 0; }
  .usage-filters label { flex: 1; min-width: 0; }
  .usage-filters select { min-width: 0; width: 100%; }
  .summary-item { min-width: 0; }
  .summary-item strong { font-size: 18px; }
}
@media (max-width: 420px) {
  .usage-filters { flex-direction: column; align-items: stretch; gap: 14px; }
  .usage-filters label { flex: auto; width: 100%; }
  .usage-filters select { padding-right: 32px; font-size: 16px; }
  .usage-current-model { margin-left: 0; }
}
</style>
