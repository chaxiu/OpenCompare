// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PlatformPort } from '@shared/platform/types'
import { App } from './App'
import { en, zh } from './i18n/messages'
import type { MessageKey } from './i18n/messages'
import { createWebPlatformPort } from './platform/web-platform'

const originalWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
const originalHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => 1200
  })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 640
  })
})

afterAll(() => {
  if (originalWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalWidth)
  else Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth')
  if (originalHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalHeight)
  else Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight')
})

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  delete window.openComparePlatform
})

function setRecord(language: 'zh' | 'en'): void {
  localStorage.setItem('opencompare.userSettings', JSON.stringify({ language }))
}

function installPlatform(port: PlatformPort): void {
  window.openComparePlatform = port
}

const DIRECTORY_FILTER_KEYS = [
  'directory.filter.all',
  'directory.filter.differences',
  'directory.filter.leftOnly',
  'directory.filter.rightOnly',
  'directory.filter.same'
] as const

/** Every zh value that has no en twin, and every en sentence with no zh twin. */
const ZH_ONLY = (Object.keys(zh) as MessageKey[])
  .filter((key) => key !== 'settings.language.name' && zh[key] !== en[key])
  .map((key) => zh[key])
  .filter((value) => /\p{Script=Han}/u.test(value))

const EN_ONLY_SENTENCES = (Object.keys(en) as MessageKey[])
  .filter(
    (key) =>
      en[key] !== zh[key] &&
      en[key].length > 10 &&
      en[key].includes(' ') &&
      !en[key].includes('{')
  )
  .map((key) => en[key])

function assertNoHan(element: HTMLElement): void {
  expect(element.textContent ?? '').not.toMatch(/\p{Script=Han}/u)
}

function assertNoCopy(element: HTMLElement, foreign: readonly string[]): void {
  const text = element.textContent ?? ''
  for (const value of foreign) {
    expect(text, `unexpected foreign copy: ${value}`).not.toContain(value)
  }
}

function assertNoPlaceholder(element: HTMLElement): void {
  const text = element.textContent ?? ''
  expect(text).not.toMatch(/未翻译|TODO|\{[a-zA-Z]+\}/)
}

function viewSwitcher(copy: Record<MessageKey, string>): HTMLElement {
  return screen.getByRole('tablist', { name: copy['shell.viewSwitcher.label'] })
}

function selectView(copy: Record<MessageKey, string>, key: MessageKey): void {
  fireEvent.click(within(viewSwitcher(copy)).getByRole('tab', { name: copy[key] }))
}

/**
 * One bilingual run over the six close-out surfaces. The caller decides how the
 * start-up language is derived, so the same walk proves the default English
 * first launch and the stored Chinese choice.
 */
async function walkSurfaces(language: 'zh' | 'en'): Promise<void> {
  const copy: Record<MessageKey, string> = language === 'zh' ? zh : en
  const foreign = language === 'zh' ? EN_ONLY_SENTENCES : ZH_ONLY

  render(<App />)
  await screen.findByRole('heading', { name: copy['shell.empty.title'] })

  // 1. First screen.
  const main = screen.getByRole('main')
  expect(screen.getByText(copy['shell.header.brandSubtitle'])).toBeDefined()
  expect(screen.getByText(copy['shell.empty.description'])).toBeDefined()
  expect(screen.getAllByRole('button', { name: copy['shell.toolbar.newCompare'] }).length).toBe(2)
  expect(screen.getByRole('button', { name: copy['shell.toolbar.openFile'] })).toBeDefined()
  expect(screen.getByRole('button', { name: copy['shell.toolbar.openFolder'] })).toBeDefined()
  assertNoPlaceholder(main)
  assertNoCopy(main, foreign)
  if (language === 'en') assertNoHan(main)

  // 2. New comparison dialog.
  fireEvent.click(screen.getAllByRole('button', { name: copy['shell.toolbar.newCompare'] })[0])
  const dialog = screen.getByRole('dialog', { name: copy['shell.compare.title'] })
  const left = within(dialog).getByLabelText(copy['shell.compare.leftPath'])
  const right = within(dialog).getByLabelText(copy['shell.compare.rightPath'])
  expect((left as HTMLInputElement).placeholder).toBe(copy['shell.compare.leftPlaceholder'])
  expect((right as HTMLInputElement).placeholder).toBe(copy['shell.compare.rightPlaceholder'])
  expect(dialog.textContent).toContain(copy['shell.compare.hint'])
  expect(within(dialog).getByRole('button', { name: copy['shell.compare.submit'] })).toBeDefined()
  expect(within(dialog).getByRole('button', { name: copy['common.cancel'] })).toBeDefined()
  assertNoPlaceholder(dialog)
  assertNoCopy(dialog, foreign)
  if (language === 'en') assertNoHan(dialog)
  fireEvent.click(within(dialog).getByRole('button', { name: copy['common.cancel'] }))

  // 3. Directory filters, five levels and the group name.
  fireEvent.click(screen.getByRole('button', { name: copy['shell.toolbar.loadSamples'] }))
  await screen.findByRole('tablist', { name: copy['common.sessions'] }, { timeout: 4000 })
  selectView(copy, 'shell.view.directory')
  const filterGroup = screen.getByRole('tablist', { name: copy['directory.filter.group'] })
  for (const key of DIRECTORY_FILTER_KEYS) {
    expect(within(filterGroup).getByRole('tab', { name: copy[key] })).toBeDefined()
  }
  assertNoPlaceholder(main)
  if (language === 'en') assertNoHan(main)

  // 4. Code view.
  selectView(copy, 'shell.view.code')
  const codeModes = screen.getByRole('tablist', { name: copy['files.code.modeLabel'] })
  expect(within(codeModes).getByRole('tab', { name: copy['files.code.mode.diff'] })).toBeDefined()
  expect(within(codeModes).getByRole('tab', { name: copy['files.code.mode.merge'] })).toBeDefined()
  expect(screen.getByRole('button', { name: copy['files.merge.export'] })).toBeDefined()
  expect(screen.getByRole('button', { name: copy['files.action.copy'] })).toBeDefined()
  assertNoCopy(main, foreign)
  if (language === 'en') assertNoHan(main)

  // 5. CSV view.
  selectView(copy, 'shell.view.csv')
  expect(
    screen.getByRole('tablist', { name: copy['files.csv.filterLabel'] })
  ).toBeDefined()
  expect(screen.getByRole('button', { name: copy['files.action.openLeft'] })).toBeDefined()
  expect(screen.getByRole('button', { name: copy['files.action.openRight'] })).toBeDefined()
  if (language === 'en') assertNoHan(main)

  // 6. Structured view.
  selectView(copy, 'shell.view.structured')
  expect(
    screen.getByRole('tablist', { name: copy['files.structured.formatLabel'] })
  ).toBeDefined()
  expect(
    screen.getByRole('tablist', { name: copy['files.structured.filterLabel'] })
  ).toBeDefined()
  expect(screen.getByText(copy['files.structured.changes'])).toBeDefined()
  if (language === 'en') assertNoHan(main)

  // 7. Settings panel: title, section and close name.
  fireEvent.click(screen.getByRole('button', { name: copy['shell.settings.open'] }))
  const settings = screen.getByRole('dialog', { name: copy['settings.title'] })
  expect(within(settings).getByText(copy['settings.language'])).toBeDefined()
  const languageGroup = within(settings).getByRole('tablist', {
    name: copy['settings.language']
  })
  expect(within(languageGroup).getByRole('tab', { name: en['settings.language.name'] })).toBeDefined()
  expect(within(languageGroup).getByRole('tab', { name: zh['settings.language.name'] })).toBeDefined()
  expect(within(settings).getByRole('button', { name: copy['common.close'] })).toBeDefined()
  expect(within(settings).getByText(copy['settings.title'])).toBeDefined()
  assertNoPlaceholder(settings)
  if (language === 'en') {
    const heading = within(settings).getByRole('heading', { name: copy['settings.title'] })
    const section = within(settings).getByText(copy['settings.language'])
    const close = within(settings).getByRole('button', { name: copy['common.close'] })
    for (const element of [heading, section, close]) assertNoHan(element)
  }
}

describe('bilingual close-out smoke', () => {
  it('renders the default English surfaces from the en dictionary', async () => {
    installPlatform({ ...createWebPlatformPort(), systemLocale: async () => 'en-US' })
    await walkSurfaces('en')
  })

  it('renders the same surfaces from the zh dictionary once zh is stored', async () => {
    setRecord('zh')
    installPlatform({ ...createWebPlatformPort(), systemLocale: async () => 'en-US' })
    await walkSurfaces('zh')
  })
})
