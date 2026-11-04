import { fireEvent, screen, within } from '@testing-library/react'

/** The active view's single toolbar overflow trigger. */
export function moreTrigger(): HTMLElement {
  const trigger = document.querySelector<HTMLElement>('[data-shell-entry="more"]')
  if (trigger === null) throw new Error('missing more trigger')
  return trigger
}

/** Opens the overflow menu idempotently and returns it. */
export function openMore(): HTMLElement {
  const trigger = moreTrigger()
  if (trigger.getAttribute('aria-expanded') !== 'true') fireEvent.click(trigger)
  const menu = screen.queryByRole('menu')
  if (menu === null) throw new Error('more menu did not open')
  return menu
}

/** Closes the overflow menu when it is still open. */
export function closeMore(): void {
  if (moreTrigger().getAttribute('aria-expanded') === 'true') {
    fireEvent.keyDown(document, { key: 'Escape' })
  }
}

/** One overflow item, matched by its visible label inside the accessible name. */
export function moreItem(label: string | RegExp): HTMLElement {
  return within(openMore()).getByRole('menuitem', {
    name: typeof label === 'string' ? (name: string) => name.includes(label) : label
  })
}

/** Runs one secondary action through the overflow menu. */
export function clickMore(label: string | RegExp): void {
  fireEvent.click(moreItem(label))
}
