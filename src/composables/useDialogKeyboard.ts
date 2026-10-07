import { onBeforeUnmount, watch, type ComputedRef } from 'vue'

/** Keep keyboard navigation inside the open dialog and restore its trigger. */
export function useDialogKeyboard(editor: ComputedRef<unknown>) {
  let trigger: HTMLElement | null = null
  const trap = (event: KeyboardEvent) => {
    if (event.key !== 'Tab') return
    const dialog = document.querySelector<HTMLElement>('.modal-overlay .modal')
    const controls = [
      ...Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]') || []),
      ...document.querySelectorAll<HTMLElement>('.notification-stack button'),
    ]
    const first = controls[0]
    const last = controls.at(-1)
    const inside = controls.includes(document.activeElement as HTMLElement)
    if (event.shiftKey && (document.activeElement === first || !inside)) {
      event.preventDefault(); last?.focus()
    } else if (!event.shiftKey && (document.activeElement === last || !inside)) {
      event.preventDefault(); first?.focus()
    }
  }
  watch(editor, (value) => {
    if (value) {
      trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
      document.addEventListener('keydown', trap)
    } else {
      document.removeEventListener('keydown', trap)
      if (trigger?.isConnected) trigger.focus()
    }
  }, { flush: 'sync' })
  onBeforeUnmount(() => document.removeEventListener('keydown', trap))
}
