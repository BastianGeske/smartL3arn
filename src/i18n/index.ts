import { computed, ref, watchEffect } from 'vue'
import { en } from './en'
import { de } from './de'

export type TranslationKey = keyof typeof en
export type Language = 'en' | 'de'
export type LanguagePreference = Language | 'system'
type Params = Record<string, string | number>
const STORAGE_KEY = 'smartl3arn_language'

function loadPreference(): LanguagePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'en' || value === 'de' ? value : 'system'
  } catch { return 'system' }
}

const preference = ref<LanguagePreference>(loadPreference())
const systemLanguage = ref<Language>(detectSystemLanguage())
function detectSystemLanguage(): Language {
  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('de') ? 'de' : 'en'
}
export const locale = computed<Language>(() => preference.value === 'system' ? systemLanguage.value : preference.value)
export const languagePreference = computed(() => preference.value)
export function setLanguage(value: LanguagePreference): void {
  if (!['system', 'de', 'en'].includes(value)) return
  preference.value = value
  try { localStorage.setItem(STORAGE_KEY, value) } catch { /* Session preference still applies. */ }
}
if (typeof window !== 'undefined') {
  window.addEventListener('languagechange', () => { systemLanguage.value = detectSystemLanguage() })
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY || event.key === null) preference.value = loadPreference()
  })
}
watchEffect(() => {
  if (typeof document !== 'undefined') document.documentElement.lang = locale.value
})

/** Keys are checked by TypeScript. Plurals select one/other before interpolation. */
export function t(key: TranslationKey, params: Params = {}): string {
  const message: string = (locale.value === 'de' ? de : en)[key] ?? en[key] ?? key
  const forms = message.split(' || ')
  const template = forms.length > 1
    ? forms[new Intl.PluralRules(locale.value).select(Number(params.count ?? 0)) === 'one' ? 0 : 1]!
    : message
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name]
    return value === undefined ? match : typeof value === 'number' ? formatNumber(value) : value
  })
}
export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale.value, options).format(value)
}
export function formatCurrency(value: number): string {
  return formatNumber(value, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 6 })
}
export function formatStudyInterval(interval: string): string {
  const match = /^(\d+)(d|mo)$/.exec(interval)
  return match ? t(match[2] === 'd' ? 'common.daysShort' : 'common.monthsShort', { count: Number(match[1]) }) : interval
}
export function useI18n() { return { t, locale, languagePreference, setLanguage, formatNumber, formatCurrency, formatStudyInterval } }
