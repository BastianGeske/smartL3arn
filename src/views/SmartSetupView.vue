<script setup lang="ts">
import { useI18n, type TranslationKey } from '../i18n'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppBar from '../components/AppBar.vue'
import AppIcon from '../components/AppIcon.vue'
import { isDue } from '../domain/dates'
import { isSmartNeedsPracticeCard } from '../domain/study/smartQueue'
import type { SmartTechniques } from '../domain/types'
import { useLibraryStore } from '../stores/library'
import { useSettingsStore } from '../stores/settings'
import { useSmartStudyStore } from '../stores/smartStudy'
import { useUiStore } from '../stores/ui'
import { getAiBridge } from '../services/ai'
import { Capacitor } from '@capacitor/core'

const { t, formatNumber } = useI18n()

const router = useRouter()
const library = useLibraryStore()
const settings = useSettingsStore()
const smart = useSmartStudyStore()
const ui = useUiStore()
const ai = getAiBridge()
const aiStatus = ref<{
  available: boolean
  configured: boolean
  credentialSource: 'environment' | 'bundled' | 'stored' | null
  model?: string
}>({ available: Boolean(ai), configured: false, credentialSource: null })
const apiKey = ref('')
const aiBusy = ref(false)
const aiLoading = ref(Boolean(ai))
const aiMessage = ref<TranslationKey | ''>('')
const fixedKeyActive = computed(() => Capacitor.getPlatform() !== 'ios'
  && (aiStatus.value.credentialSource === 'environment' || aiStatus.value.credentialSource === 'bundled'))

const selectedDecks = computed(() => settings.smartConfig.deckIds
  .map((id) => library.deckById(id))
  .filter((deck) => Boolean(deck)))
const canStart = computed(() => selectedDecks.value.some((deck) => deck && deck.cards.length > 0))
const available = computed(() => canStart.value
  ? smart.availableQueue()
  : { queue: [], hasCore: false, mode: 'practice' as const })
const selectedDue = computed(() => selectedDecks.value.reduce(
  (sum, deck) => sum + (deck?.cards.filter((card) => isDue(card)).length || 0),
  0,
))

const techniques: {
  key: keyof SmartTechniques
  title: TranslationKey
  icon: string
  description: TranslationKey
}[] = [
  { key: 'typeRecall', title: 'smart.typeRecall', icon: 'keyboard', description: 'smart.typeRecallDescription' },
  { key: 'confidenceCheck', title: 'smart.confidenceCheck', icon: 'gauge', description: 'smart.confidenceDescription' },
  { key: 'whyPrompt', title: 'smart.whyPrompt', icon: 'message-square-text', description: 'smart.whyDescription' },
  { key: 'interleaving', title: 'smart.interleaving', icon: 'shuffle', description: 'smart.interleavingDescription' },
]
const durations: { value: number; label: TranslationKey }[] = [
  { value: 10, label: 'common.minutes' },
  { value: 25, label: 'smart.pomodoro' },
  { value: 0, label: 'common.noLimit' },
]

const aiFailureMessages: Record<string, TranslationKey> = {
  auth: 'ai.auth',
  forbidden: 'ai.forbidden',
  credits: 'ai.credits',
  'model-unavailable': 'ai.modelUnavailable',
  'rate-limit': 'ai.rateLimit',
  timeout: 'ai.timeout',
  'secure-storage-unavailable': 'ai.secureStorage',
  unavailable: 'ai.unavailable',
}

onMounted(async () => {
  settings.smartConfig.deckIds = settings.smartConfig.deckIds.filter(
    (id) => Boolean(library.deckById(id)),
  )
  if (!ai) return
  try {
    aiStatus.value = await ai.getAiStatus()
    if (Capacitor.getPlatform() === 'ios') {
      settings.initializeIosEvaluationMode(aiStatus.value.available && aiStatus.value.configured)
    }
  } catch {
    if (Capacitor.getPlatform() === 'ios') settings.initializeIosEvaluationMode(false)
    aiStatus.value = { available: false, configured: false, credentialSource: null }
    aiMessage.value = 'ai.unavailable'
  } finally {
    aiLoading.value = false
  }
})

async function saveApiKey(): Promise<void> {
  const key = apiKey.value.trim()
  if (!key || !ai) return
  aiBusy.value = true
  aiMessage.value = 'ai.validating'
  const result = await ai.saveOpenRouterKey(key).catch(
    () => ({ ok: false, reason: 'unavailable' }),
  )
  aiBusy.value = false
  if (result.ok) {
    apiKey.value = ''
    aiStatus.value = await ai.getAiStatus()
    settings.setEvaluationMode('openrouter')
    aiMessage.value = aiStatus.value.credentialSource === 'environment'
      ? 'ai.savedFallback'
      : aiStatus.value.credentialSource === 'bundled' ? 'ai.savedBundledFallback' : 'ai.saved'
  } else {
    aiMessage.value = aiFailureMessages[result.reason || ''] || 'ai.saveFailed'
  }
}

async function removeApiKey(): Promise<void> {
  if (!ai) return
  aiBusy.value = true
  const result = await ai.removeOpenRouterKey().catch(
    () => ({ ok: false, reason: 'unavailable' }),
  )
  aiBusy.value = false
  if (result.ok) {
    aiStatus.value = await ai.getAiStatus()
    if (!aiStatus.value.configured) settings.setEvaluationMode('local')
    aiMessage.value = aiStatus.value.credentialSource === 'environment'
      ? 'ai.removedFallback'
      : aiStatus.value.credentialSource === 'bundled' ? 'ai.removedBundledFallback' : 'ai.removed'
  } else {
    aiMessage.value = 'ai.removeFailed'
  }
}

function isSelected(deckId: string): boolean {
  return settings.smartConfig.deckIds.includes(deckId)
}

function toggleDeck(deckId: string, checked: boolean): void {
  if (checked && !isSelected(deckId)) settings.smartConfig.deckIds.push(deckId)
  if (!checked) {
    settings.smartConfig.deckIds = settings.smartConfig.deckIds.filter((id) => id !== deckId)
  }
}

async function start(): Promise<void> {
  if (aiLoading.value) return
  if (settings.smartConfig.evaluationMode === 'openrouter' && !aiStatus.value.configured) {
    aiMessage.value = 'ai.notConfigured'
    document.querySelector('#openrouter-key')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    document.querySelector<HTMLInputElement>('#openrouter-key')?.focus()
    return
  }
  if (await smart.start()) {
    await router.push({ name: 'smart-study' })
  } else {
    window.alert(t('smart.noCards'))
  }
}
</script>

<template>
  <div class="app-shell">
    <AppBar active="smart" />
    <main class="workspace smart-workspace">
      <header class="page-heading">
        <div>
          <p class="page-kicker">{{ t('smart.planner') }}</p>
          <h1>{{ t('nav.smart') }}</h1>
          <p class="page-subtitle">
            {{ settings.smartConfig.deckIds.length > 0
              ? t('smart.selectedDecks', { count: settings.smartConfig.deckIds.length })
              : t('smart.selectDecks') }}
          </p>
        </div>
      </header>

      <div class="smart-config-grid">
        <div class="smart-config-main">
        <section class="config-section" aria-labelledby="smart-decks-title">
          <div class="config-heading">
            <div><span class="config-step">1</span><h2 id="smart-decks-title">{{ t('smart.chooseDecks') }}</h2></div>
            <span>{{ t('smart.selectedCount', { count: settings.smartConfig.deckIds.length }) }}</span>
          </div>
          <div class="smart-deck-list">
            <div v-if="!library.decks.length" class="smart-empty">
              <AppIcon name="layers-3" :size="24" />
              <strong>{{ t('smart.noDecks') }}</strong>
              <button class="btn btn-secondary btn-sm" type="button" @click="ui.editDeck()">
                <AppIcon name="plus" :size="15" /><span>{{ t('deck.create') }}</span>
              </button>
            </div>
            <label
              v-for="deck in library.decks"
              v-else
              :key="deck.id"
              class="smart-deck-row"
              :class="{
                'is-selected': isSelected(deck.id),
                'is-disabled': !deck.cards.length,
              }"
            >
              <input
                class="check-input"
                type="checkbox"
                :checked="isSelected(deck.id)"
                :disabled="!deck.cards.length"
                @change="toggleDeck(deck.id, ($event.target as HTMLInputElement).checked)"
              >
              <span class="check-control"><AppIcon name="check" :size="13" /></span>
              <span class="smart-row-body">
                <span class="smart-row-title">{{ deck.name }}</span>
                <span class="smart-row-meta">
                  <span>{{ t('smart.totalCount', { count: deck.cards.length }) }}</span>
                  <span v-if="deck.cards.filter((card) => isDue(card)).length" class="is-emphasis">
                    {{ t('library.dueCount', { count: deck.cards.filter((card) => isDue(card)).length }) }}
                  </span>
                  <span v-else>{{ t('library.caughtUp') }}</span>
                  <span v-if="deck.cards.filter((card) => !isDue(card) && isSmartNeedsPracticeCard(deck, card.id)).length">
                    {{ t('smart.practiceCount', { count: deck.cards.filter((card) => !isDue(card) && isSmartNeedsPracticeCard(deck, card.id)).length }) }}
                  </span>
                </span>
              </span>
            </label>
          </div>
        </section>

        <div class="smart-options">


          <section class="config-section" aria-labelledby="smart-techniques-title">
            <div class="config-heading">
              <div><span class="config-step">2</span><h2 id="smart-techniques-title">{{ t('smart.techniques') }}</h2></div>
            </div>
            <div class="technique-list">
              <label v-for="technique in techniques" :key="technique.key" class="technique-row">
                <span class="technique-icon"><AppIcon :name="technique.icon" :size="17" /></span>
                <span class="technique-copy"><span class="smart-row-title">{{ t(technique.title) }}</span><span class="technique-description">{{ t(technique.description) }}</span></span>
                <input
                  v-model="settings.smartConfig.techniques[technique.key]"
                  class="switch-input"
                  type="checkbox"
                >
                <span class="switch-control" aria-hidden="true" />
              </label>
            </div>
          </section>

          <section class="config-section" aria-labelledby="smart-duration-title">
            <div class="config-heading">
              <div><span class="config-step">3</span><h2 id="smart-duration-title">{{ t('smart.length') }}</h2></div>
            </div>
            <div class="segmented-control" :aria-label="t('smart.length')">
              <button
                v-for="duration in durations"
                :key="duration.value"
                class="segment-button"
                :class="{ 'is-selected': settings.smartConfig.duration === duration.value }"
                type="button"
                :aria-pressed="settings.smartConfig.duration === duration.value"
                @click="settings.smartConfig.duration = duration.value"
              >
                {{ t(duration.label, { count: duration.value }) }}
              </button>
            </div>
          </section>

          <section class="config-section ai-config-section" aria-labelledby="smart-ai-title">
            <div class="config-heading">
              <div><span class="config-step">4</span><h2 id="smart-ai-title">{{ t('ai.evaluation') }}</h2></div>
              <span v-if="aiStatus.configured" class="ai-configured">{{ t('ai.configured') }}</span>
            </div>
            <div v-if="aiStatus.available" class="ai-settings">
              <div class="segmented-control" :aria-label="t('ai.mode')">
                <button
                  class="segment-button"
                  :class="{ 'is-selected': settings.smartConfig.evaluationMode === 'local' }"
                  type="button"
                  :aria-pressed="settings.smartConfig.evaluationMode === 'local'"
                  @click="settings.setEvaluationMode('local')"
                >{{ t('ai.local') }}</button>
                <button
                  class="segment-button"
                  :class="{ 'is-selected': settings.smartConfig.evaluationMode === 'openrouter' }"
                  type="button"
                  :aria-pressed="settings.smartConfig.evaluationMode === 'openrouter'"
                  @click="settings.setEvaluationMode('openrouter')"
                >{{ t('ai.openrouter') }}</button>
              </div>
              <p class="ai-privacy-note">
                {{ t('ai.privacy') }}
              </p>
              <p v-if="settings.smartConfig.evaluationMode === 'openrouter' && !aiStatus.configured" class="ai-status-message" role="status">{{ t('ai.notConfigured') }}</p>
              <p v-if="aiStatus.configured" class="ai-status-message">
                {{ aiStatus.credentialSource === 'environment'
                  ? t('ai.environmentKey')
                  : aiStatus.credentialSource === 'bundled' ? t('ai.bundledKey') : t('ai.storedKey') }}
              </p>
              <form class="ai-key-form" @submit.prevent="saveApiKey">
                <p v-if="aiStatus.model" class="ai-status-message">{{ t('usage.configured') }} <strong>{{ aiStatus.model }}</strong></p>
                <p v-if="Capacitor.getPlatform() === 'ios' && aiStatus.credentialSource === 'bundled'" class="ai-privacy-note">{{ t('ai.privateBuildHint') }}</p>
                <label class="field-label" for="openrouter-key">
                  {{ fixedKeyActive ? t('ai.fallbackKey') : aiStatus.configured ? t('ai.replaceKey') : t('ai.key') }}
                </label>
                <input
                  id="openrouter-key"
                  v-model="apiKey"
                  class="text-input"
                  type="password"
                  autocomplete="off"
                  :placeholder="t('ai.keyPlaceholder')"
                  :disabled="aiBusy"
                >
                <div class="ai-key-actions">
                  <button class="btn btn-secondary btn-sm" type="submit" :disabled="aiBusy || !apiKey.trim()">
                    {{ aiBusy ? t('common.wait') : t('ai.validateSave') }}
                  </button>
                  <button
                    v-if="aiStatus.configured && (Capacitor.getPlatform() !== 'ios' || aiStatus.credentialSource === 'stored')"
                    class="btn btn-quiet btn-sm"
                    type="button"
                    :disabled="aiBusy"
                    @click="removeApiKey"
                  >{{ t('ai.removeKey') }}</button>
                </div>
              </form>
              <p v-if="aiMessage" class="ai-status-message" role="status">{{ t(aiMessage) }}</p>
            </div>
            <p v-else class="ai-privacy-note">
              {{ t('ai.desktopOnly') }}
            </p>
          </section>
        </div>
        </div>
          <aside class="session-plan" :aria-label="t('smart.plan')">
            <div class="session-plan-heading">
              <span><AppIcon name="sparkles" /></span>
              <div>
                <strong>{{ canStart ? t('smart.ready') : t('smart.plan') }}</strong>
                <span>{{ canStart ? (available.hasCore ? t('smart.scheduled') : t('smart.practiceRound')) : t('smart.chooseBegin') }}</span>
              </div>
            </div>
            <dl class="session-plan-stats">
              <div><dt>{{ t('common.decks') }}</dt><dd>{{ formatNumber(selectedDecks.length) }}</dd></div>
              <div><dt>{{ t('common.cards') }}</dt><dd>{{ formatNumber(available.queue.length) }}</dd></div>
              <div><dt>{{ t('common.due') }}</dt><dd>{{ formatNumber(selectedDue) }}</dd></div>
              <div><dt>{{ t('smart.planLength') }}</dt><dd>{{ settings.smartConfig.duration ? t('common.minutes', { count: settings.smartConfig.duration }) : t('common.noLimit') }}</dd></div>
            </dl>
            <button class="btn btn-smart btn-lg" type="button" :disabled="!canStart || aiLoading" @click="start">
              <AppIcon name="play" /><span>{{ t('smart.start') }}</span>
            </button>
            <p v-if="!canStart" class="smart-hint">{{ t('smart.selectHint') }}</p>
          </aside>
      </div>
    </main>
  </div>
</template>
