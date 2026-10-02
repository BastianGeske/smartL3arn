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

export function loadSmartConfig(): SmartConfig {
  try {
    const raw = localStorage.getItem(SMART_CONFIG_KEY)
    if (!raw) return defaultSmartConfig()
    const parsed = JSON.parse(raw) as Partial<SmartConfig>
    return {
      deckIds: Array.isArray(parsed.deckIds) ? parsed.deckIds : [],
      techniques: {
        typeRecall: parsed.techniques?.typeRecall ?? true,
        confidenceCheck: parsed.techniques?.confidenceCheck ?? true,
        whyPrompt: parsed.techniques?.whyPrompt ?? false,
        interleaving: parsed.techniques?.interleaving ?? true,
      },
      duration: typeof parsed.duration === 'number' ? parsed.duration : 25,
      evaluationMode: parsed.evaluationMode === 'openrouter' ? 'openrouter' : 'local',
    }
  } catch {
    return defaultSmartConfig()
  }
}

export function saveSmartConfig(config: SmartConfig): void {
  localStorage.setItem(SMART_CONFIG_KEY, JSON.stringify(config))
}

export function loadDarkMode(): boolean {
  return localStorage.getItem(DARK_MODE_KEY) === '1'
}

export function saveDarkMode(dark: boolean): void {
  localStorage.setItem(DARK_MODE_KEY, dark ? '1' : '0')
}

export function getPomodoroBreakUntil(): number {
  return Number.parseInt(localStorage.getItem(POMODORO_BREAK_UNTIL_KEY) || '', 10) || 0
}

export function setPomodoroBreakUntil(timestamp: number): void {
  if (timestamp > Date.now()) {
    localStorage.setItem(POMODORO_BREAK_UNTIL_KEY, String(timestamp))
  } else {
    localStorage.removeItem(POMODORO_BREAK_UNTIL_KEY)
  }
}
