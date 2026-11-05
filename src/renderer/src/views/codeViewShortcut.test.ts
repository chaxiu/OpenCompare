import { describe, expect, it } from 'vitest'
import { CODE_SWAP_SHORTCUT, isCodeSwapShortcut, isEditableTarget } from './codeViewShortcut'

interface EventInput {
  readonly key?: string
  readonly metaKey?: boolean
  readonly ctrlKey?: boolean
  readonly shiftKey?: boolean
  readonly altKey?: boolean
  readonly repeat?: boolean
  readonly target?: EventTarget | null
}

function keyEvent(input: EventInput = {}): Parameters<typeof isCodeSwapShortcut>[0] {
  return {
    key: 's',
    metaKey: false,
    ctrlKey: false,
    shiftKey: true,
    altKey: false,
    repeat: false,
    target: null,
    ...input
  }
}

function element(tagName: string, isContentEditable = false): EventTarget {
  return { tagName, isContentEditable } as unknown as EventTarget
}

describe('isCodeSwapShortcut', () => {
  it('formats the single shortcut binding', () => {
    expect(CODE_SWAP_SHORTCUT).toBe('Cmd/Ctrl+Shift+S')
  })

  it('accepts Cmd+Shift+S and Ctrl+Shift+S in either letter case', () => {
    expect(isCodeSwapShortcut(keyEvent({ metaKey: true }))).toBe(true)
    expect(isCodeSwapShortcut(keyEvent({ ctrlKey: true }))).toBe(true)
    expect(isCodeSwapShortcut(keyEvent({ metaKey: true, key: 'S' }))).toBe(true)
  })

  it('rejects a missing modifier, Alt, auto-repeat and other keys', () => {
    expect(isCodeSwapShortcut(keyEvent({ shiftKey: false }))).toBe(false)
    expect(isCodeSwapShortcut(keyEvent({ metaKey: true, shiftKey: false }))).toBe(false)
    expect(isCodeSwapShortcut(keyEvent({ metaKey: true, altKey: true }))).toBe(false)
    expect(isCodeSwapShortcut(keyEvent({ metaKey: true, repeat: true }))).toBe(false)
    expect(isCodeSwapShortcut(keyEvent({ metaKey: true, key: 'n' }))).toBe(false)
  })

  it('keeps typing surfaces unhandled', () => {
    for (const target of [element('INPUT'), element('TEXTAREA'), element('SELECT')]) {
      expect(isEditableTarget(target)).toBe(true)
      expect(isCodeSwapShortcut(keyEvent({ metaKey: true, target }))).toBe(false)
    }
    const editable = element('DIV', true)
    expect(isEditableTarget(editable)).toBe(true)
    expect(isCodeSwapShortcut(keyEvent({ metaKey: true, target: editable }))).toBe(false)
  })

  it('allows a non-editable element target', () => {
    expect(isEditableTarget(element('DIV'))).toBe(false)
    expect(isCodeSwapShortcut(keyEvent({ metaKey: true, target: element('DIV') }))).toBe(true)
  })
})
