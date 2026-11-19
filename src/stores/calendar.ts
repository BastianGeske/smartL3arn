import { onScopeDispose, ref } from 'vue'
import { defineStore } from 'pinia'
import { localDateStr } from '../domain/dates'

export const useCalendarStore = defineStore('calendar', () => {
  const today = ref(localDateStr())
  let timer: ReturnType<typeof setTimeout>
  function refresh() {
    const now = new Date()
    today.value = localDateStr(now)
    const midnight = new Date(now)
    midnight.setHours(24, 0, 0, 0)
    clearTimeout(timer)
    timer = setTimeout(refresh, midnight.getTime() - now.getTime())
  }
  refresh()
  document.addEventListener('visibilitychange', refresh)
  window.addEventListener('focus', refresh)
  window.addEventListener('pageshow', refresh)
  onScopeDispose(() => {
    clearTimeout(timer)
    document.removeEventListener('visibilitychange', refresh)
    window.removeEventListener('focus', refresh)
    window.removeEventListener('pageshow', refresh)
  })
  return { today }
})
