import { onBeforeUnmount } from 'vue'
import type { DraftBackup } from '../services/storage/pathDraftBackup'

export function usePathDraftWrite<Edit extends { backup?: DraftBackup }>(
  persist: (edit: Edit) => Promise<void>,
  report: (error: unknown) => void,
) {
  let pending: Edit | undefined
  let inFlight: { edit: Edit; promise: Promise<void> } | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let disposed = false

  function warn(event: BeforeUnloadEvent) { event.preventDefault(); event.returnValue = true }
  function updateWarning() {
    const latest = pending ?? inFlight?.edit
    if (!disposed && latest && !latest.backup) window.addEventListener('beforeunload', warn)
    else window.removeEventListener('beforeunload', warn)
  }
  function cancelTimer() {
    clearTimeout(timer)
    timer = undefined
  }
  function writePending() {
    if (!inFlight && pending) {
      const edit = pending
      pending = undefined
      const promise = persist(edit).catch(error => {
        pending ??= edit
        throw error
      }).finally(() => {
        inFlight = undefined
        updateWarning()
      })
      inFlight = { edit, promise }
    }
    return inFlight?.promise
  }
  async function flush() {
    while (!disposed && (pending || inFlight)) {
      cancelTimer()
      await writePending()
    }
  }
  async function saveAfterPause(edit: Edit) {
    await inFlight?.promise.catch(() => { /* The write's caller reports its failure. */ })
    if (!disposed && pending === edit) await writePending()
  }
  function queue(edit: Edit) {
    pending = edit
    updateWarning()
    cancelTimer()
    timer = setTimeout(() => {
      timer = undefined
      void saveAfterPause(edit).catch(report)
    }, 300)
  }
  function recover(edit: Edit) {
    pending = edit
    void flush().catch(report)
  }
  function onPageHide() { void flush().catch(report) }
  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') onPageHide()
  }
  window.addEventListener('pagehide', onPageHide)
  document.addEventListener('visibilitychange', onVisibilityChange)
  onBeforeUnmount(() => {
    disposed = true
    cancelTimer()
    updateWarning()
    window.removeEventListener('pagehide', onPageHide)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  })
  return { flush, queue, recover, writingEdit: () => inFlight?.edit }
}
