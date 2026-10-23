// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { JSX } from 'react'
import { I18nProvider } from './I18nProvider'
import { useI18n } from './context'
import { interpolate } from './interpolate'
import { renderWithI18n } from './testing'

afterEach(cleanup)

function Probe(): JSX.Element {
  const { language, setLanguage, t } = useI18n()
  return (
    <div>
      <span data-testid="language">{language}</span>
      <span data-testid="confirm">{t('common.confirm')}</span>
      <span data-testid="files">{t('directory.summary.files', { count: 3 })}</span>
      <span data-testid="missing">{t('common.itemCount')}</span>
      <button type="button" onClick={() => setLanguage('en')}>
        switch
      </button>
    </div>
  )
}

describe('I18nProvider', () => {
  it('starts in the language it is given', () => {
    render(
      <I18nProvider initialLanguage="en">
        <Probe />
      </I18nProvider>
    )

    expect(screen.getByTestId('language').textContent).toBe('en')
    expect(screen.getByTestId('confirm').textContent).toBe('Confirm')
  })

  it('switches language and translator together on a re-render', () => {
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>
    )
    expect(screen.getByTestId('language').textContent).toBe('zh')
    expect(screen.getByTestId('confirm').textContent).toBe('确定')

    fireEvent.click(screen.getByRole('button', { name: 'switch' }))

    expect(screen.getByTestId('language').textContent).toBe('en')
    expect(screen.getByTestId('confirm').textContent).toBe('Confirm')
    expect(screen.getByTestId('files').textContent).toBe('3 files')
  })

  it('falls back to the zh dictionary outside a provider', () => {
    expect(() => render(<Probe />)).not.toThrow()

    expect(screen.getByTestId('language').textContent).toBe('zh')
    expect(screen.getByTestId('confirm').textContent).toBe('确定')
  })

  it('leaves an unknown placeholder untouched', () => {
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>
    )

    // `common.itemCount` is `{count} 项`; no params means the placeholder stays.
    expect(screen.getByTestId('missing').textContent).toBe('{count} 项')
  })
})

describe('interpolation', () => {
  it('replaces every occurrence of a known placeholder', () => {
    expect(interpolate('{name} / {name}', { name: 'x' })).toBe('x / x')
    expect(interpolate('{count} items', { count: 4 })).toBe('4 items')
  })

  it('keeps a placeholder whose value is missing', () => {
    expect(interpolate('{count} of {total}', { count: 1 })).toBe('1 of {total}')
  })

  it('returns markup as plain text', () => {
    expect(interpolate('<b>{name}</b>', { name: 'x' })).toBe('<b>x</b>')
    expect(typeof interpolate('<b>{name}</b>', { name: 'x' })).toBe('string')
  })
})

describe('renderWithI18n', () => {
  it('forces the requested language', () => {
    renderWithI18n(<Probe />, 'en')

    expect(screen.getByTestId('language').textContent).toBe('en')
    expect(screen.getByTestId('confirm').textContent).toBe('Confirm')
  })

  it('defaults to zh', () => {
    renderWithI18n(<Probe />)

    expect(screen.getByTestId('language').textContent).toBe('zh')
    expect(screen.getByTestId('confirm').textContent).toBe('确定')
  })
})
