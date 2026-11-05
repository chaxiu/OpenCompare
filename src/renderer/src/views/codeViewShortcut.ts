/** Single source for the swap-sides binding shown in the toolbar and the menu. */
export const CODE_SWAP_SHORTCUT = 'Cmd/Ctrl+Shift+S'

interface ShortcutEventLike {
  readonly key: string
  readonly metaKey: boolean
  readonly ctrlKey: boolean
  readonly shiftKey: boolean
  readonly altKey: boolean
  readonly repeat: boolean
  readonly target: EventTarget | null
}

function isElementTarget(target: EventTarget | null): target is Element {
  return target !== null && typeof (target as Element).tagName === 'string'
}

/** Typing surfaces keep their native keys; the view never steals a swap keystroke there. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!isElementTarget(target)) return false
  const tag = target.tagName.toUpperCase()
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return (target as HTMLElement).isContentEditable === true
}

/**
 * `Cmd/Ctrl+Shift+S` only: Alt and auto-repeat are rejected, and editable
 * targets keep the event unhandled so no `preventDefault` fires.
 */
export function isCodeSwapShortcut(event: ShortcutEventLike): boolean {
  if (event.altKey || event.repeat) return false
  if (!event.shiftKey) return false
  if (!(event.metaKey || event.ctrlKey)) return false
  if (event.key.toLowerCase() !== 's') return false
  return !isEditableTarget(event.target)
}
