import { locale as appLocale } from '../i18n'
import type { Card, StudySession } from './types'

export function localDateStr(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function todayStr(): string {
  return localDateStr()
}

export function isoDateToDayNumber(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number)
  return Date.UTC(year, month - 1, day) / 86_400_000
}

export function addDaysToIsoDate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + days)
  return localDateStr(date)
}

export function daysBetweenIsoDates(start: string, end: string): number {
  return isoDateToDayNumber(end) - isoDateToDayNumber(start)
}

export function isDue(card: Card): boolean
export function isDue(card: Card, today: string): boolean
export function isDue(card: Card, today = todayStr()): boolean {
  return !card.dueDate || card.dueDate <= today
}

export function formatDateLabel(
  isoDate: string,
  locale: string = appLocale.value,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' },
): string {
  if (!isoDate) return ''
  const date = new Date(`${isoDate}T12:00:00`)
  if (Number.isNaN(date.getTime())) return isoDate
  return new Intl.DateTimeFormat(locale, options).format(date)
}

export function calcStreak(sessions: StudySession[] = [], today = todayStr()): number {
  const sessionDates = new Set(sessions.map((session) => session.date).filter(Boolean))
  let streak = 0
  let expected = today
  while (sessionDates.has(expected)) {
    streak += 1
    expected = addDaysToIsoDate(expected, -1)
  }
  return streak
}

export function calcBestStreak(sessions: StudySession[] = []): number {
  const dates = [...new Set(sessions.map((session) => session.date).filter(Boolean))].sort()
  if (!dates.length) return 0
  let best = 1
  let current = 1
  for (let index = 1; index < dates.length; index += 1) {
    if (daysBetweenIsoDates(dates[index - 1], dates[index]) === 1) {
      current += 1
      best = Math.max(best, current)
    } else {
      current = 1
    }
  }
  return best
}
