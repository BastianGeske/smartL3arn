import type { SmartConfig } from '../domain/types'

const SMART_CONFIG_KEY = 'ankiweb_smart_config'
const DARK_MODE_KEY = 'ankiweb_dark'
export const POMODORO_BREAK_UNTIL_KEY = 'ankiweb_smart_pomodoro_break_until'

export const defaultSmartConfig = (): SmartConfig => ({
  deckIds: [],
  techniques: {
    typeRecall: true,
    confidenceCheck: true,
    whyPrompt: false,
    interleaving: true,
  },
  duration: 25,
  evaluationMode: 'local',
})

export function loadSmartConfigState(): { config: SmartConfig; hasStoredEvaluationMode: boolean } {
  try {
    const raw = localStorage.getItem(SMART_CONFIG_KEY)
    if (!raw) return { config: defaultSmartConfig(), hasStoredEvaluationMode: false }
    const parsed = JSON.parse(raw) as Partial<SmartConfig>
    return { hasStoredEvaluationMode: parsed.evaluationMode === 'local' || parsed.evaluationMode === 'openrouter', config: {
      deckIds: Array.isArray(parsed.deckIds) ? parsed.deckIds : [],
      techniques: {
        typeRecall: parsed.techniques?.typeRecall ?? true,
        confidenceCheck: parsed.techniques?.confidenceCheck ?? true,
        whyPrompt: parsed.techniques?.whyPrompt ?? false,
        interleaving: parsed.techniques?.interleaving ?? true,
      },
      duration: typeof parsed.duration === 'number' ? parsed.duration : 25,
      evaluationMode: parsed.evaluationMode === 'openrouter' ? 'openrouter' : 'local',
    } }
  } catch {
    return { config: defaultSmartConfig(), hasStoredEvaluationMode: true }
  }
}

export function loadSmartConfig(): SmartConfig {
  return loadSmartConfigState().config
}

export function wasIosEvaluationModeInitialized(): boolean {
  try { return Boolean(localStorage.getItem('smartl3arn_ios_ai_mode_initialized')) }
  catch { return true }
}

export function markIosEvaluationModeInitialized(): void {
  localStorage.setItem('smartl3arn_ios_ai_mode_initialized', '1')
}

export function saveSmartConfig(config: SmartConfig): void {
  localStorage.setItem(SMART_CONFIG_KEY, JSON.stringify(config))
}

export function loadDarkMode(): boolean {
  try { return localStorage.getItem(DARK_MODE_KEY) === '1' }
  catch { return false }
}

export function saveDarkMode(dark: boolean): void {
  localStorage.setItem(DARK_MODE_KEY, dark ? '1' : '0')
}

export function getPomodoroBreakUntil(): number {
  try { return Number.parseInt(localStorage.getItem(POMODORO_BREAK_UNTIL_KEY) || '', 10) || 0 }
  catch { return 0 }
}

export function setPomodoroBreakUntil(timestamp: number): void {
  if (timestamp > Date.now()) {
    localStorage.setItem(POMODORO_BREAK_UNTIL_KEY, String(timestamp))
  } else {
    localStorage.removeItem(POMODORO_BREAK_UNTIL_KEY)
  }
}
