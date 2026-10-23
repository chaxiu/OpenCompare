// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { JSX } from 'react'
import { diffStructured } from '@core/structured/diff'
import { STRUCTURED_SCENE } from '@shared/fixtures'
import type { Language, PlatformPort } from '@shared/platform/types'
import { I18nProvider } from '@renderer/i18n/I18nProvider'
import { useI18n } from '@renderer/i18n/context'
import { renderWithI18n } from '@renderer/i18n/testing'
import { createWebPlatformPort } from '@renderer/platform/web-platform'
import { StructuredView } from './StructuredView'

afterEach(cleanup)

const platform = createWebPlatformPort()

/** Test-only probe: switches the provider language from inside the tree. */
function LanguageSwitch({ to }: { readonly to: Language }): JSX.Element {
  const { setLanguage } = useI18n()
  return (
    <button type="button" onClick={() => setLanguage(to)}>
      switch-language
    </button>
  )
}

/** Drives the web runtime's hidden file picker with a chosen local file. */
function chooseFile(name: string, text: string): void {
  const input = document.querySelector<HTMLInputElement>('input[data-opencompare-picker="file"]')
  if (!input) throw new Error('no open-file input was created')
  fireEvent.change(input, { target: { files: [new File([text], name, { type: 'text/plain' })] } })
}

const jsonCounts = diffStructured(
  STRUCTURED_SCENE.json.left.text,
  STRUCTURED_SCENE.json.right.text,
  'json'
).counts

function countsGroup(): HTMLElement {
  return screen.getByRole('group', { name: '结构化计数' })
}

describe('built-in structured scene', () => {
  it('lists path-level changes with old and new values', () => {
    render(<StructuredView fixture={STRUCTURED_SCENE} platform={platform} />)

    expect(screen.getByText('/service/features/limits/maxBytes')).toBeDefined()
    // the type change is labelled separately from a plain edit, with both values
    const row = screen.getByText('/service/version').parentElement as HTMLElement
    expect(within(row).getByText('类型变更')).toBeDefined()
    expect(within(row).getByText('2')).toBeDefined()
    expect(within(row).getByText('"2.0.0"')).toBeDefined()
    expect(within(countsGroup()).getByText('类型变更')).toBeDefined()
  })

  it('reports runtime counts that survive filtering', () => {
    render(<StructuredView fixture={STRUCTURED_SCENE} platform={platform} />)

    const counts = within(countsGroup())
    expect(counts.getByText(String(jsonCounts.typeChanged))).toBeDefined()
    expect(counts.getByText(String(jsonCounts.added))).toBeDefined()

    fireEvent.click(screen.getByRole('tab', { name: '类型变更' }))
    expect(screen.queryByText('/service/features/limits/maxBytes')).toBeNull()
    expect(screen.getByText('/service/version')).toBeDefined()
    // counts stay the runtime counts of the whole comparison
    expect(within(countsGroup()).getByText(String(jsonCounts.added))).toBeDefined()
  })

  it('restores the full list when the filter goes back to 全部', () => {
    render(<StructuredView fixture={STRUCTURED_SCENE} platform={platform} />)

    fireEvent.click(screen.getByRole('tab', { name: '新增' }))
    expect(screen.queryByText('/telemetry/enabled')).toBeNull()
    expect(screen.getByText('/service/features/limits/maxBytes')).toBeDefined()

    fireEvent.click(screen.getByRole('tab', { name: '全部' }))
    expect(screen.getByText('/telemetry/enabled')).toBeDefined()
    expect(screen.getByText('/service/features/limits/maxBytes')).toBeDefined()
  })

  it('switches between the JSON and YAML sample pairs', () => {
    render(<StructuredView fixture={STRUCTURED_SCENE} platform={platform} />)

    expect(screen.getByText('/service/features/limits/maxBytes')).toBeDefined()

    fireEvent.click(screen.getByRole('tab', { name: 'YAML' }))
    expect(screen.getByText('/service/health')).toBeDefined()
    expect(screen.queryByText('/service/features/limits/maxBytes')).toBeNull()
    expect(screen.getByText('/samples/structured/deploy.left.yaml')).toBeDefined()
  })

  it('keeps both raw originals visible next to the change list', () => {
    render(<StructuredView fixture={STRUCTURED_SCENE} platform={platform} />)

    expect(screen.getByText('/samples/structured/config.left.json')).toBeDefined()
    expect(screen.getByText('/samples/structured/config.right.json')).toBeDefined()
    expect(screen.getByText(/"updatedAt": "2026-09-01"/)).toBeDefined()
  })
})

describe('drilldown pair', () => {
  const pair = {
    left: { path: 'config/deploy.left.yaml', text: 'service:\n  replicas: 2\nprofile: production\n' },
    right: {
      path: 'config/deploy.right.yaml',
      text: 'profile: staging\nservice:\n  replicas: 4\n  health:\n    path: /healthz\n'
    }
  }

  it('renders the fixed format without a format switch', () => {
    render(<StructuredView pair={pair} format="yaml" platform={platform} />)

    expect(screen.getByText(/本地文件 · YAML 原文/)).toBeDefined()
    expect(screen.queryByRole('tablist', { name: '结构化格式' })).toBeNull()
    expect(screen.getByRole('tablist', { name: '状态过滤' })).toBeDefined()

    // shuffled keys are ignored: only the real edits show up
    expect(screen.getByText('/profile')).toBeDefined()
    expect(screen.getByText('/service/replicas')).toBeDefined()
    expect(screen.getByText('/service/health')).toBeDefined()
    expect(screen.queryByText('/service/name')).toBeNull()
  })

  it('shows a readable error state for an unparseable side', () => {
    render(
      <StructuredView
        pair={{ left: { path: 'broken.json', text: '{"a": 1' }, right: { path: 'right.json', text: '{}' } }}
        format="json"
        platform={platform}
      />
    )

    expect(screen.getByRole('heading', { name: '结构化解析失败' })).toBeDefined()
    expect(screen.getByText(/left side: JSON parse error/)).toBeDefined()
    // the raw text and the other session tabs stay usable
    expect(screen.getByText('broken.json')).toBeDefined()
  })
})

describe('local file entry points', () => {
  it('opens a local JSON file on one side and recomputes the semantic diff', async () => {
    render(<StructuredView fixture={STRUCTURED_SCENE} platform={platform} />)
    expect(screen.getByText('/samples/structured/config.right.json')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: '打开右文件' }))
    chooseFile('config.right.json', '{"service":{"version":"9.9.9"}}')

    await waitFor(() => expect(screen.getByText('/memory/config.right.json')).toBeDefined())
    // The opened body is the right side now: nothing else survives from the sample.
    expect(screen.getByText('/service/version')).toBeDefined()
    expect(screen.queryByText('/telemetry/enabled')).toBeNull()
    expect(await screen.findByText(/已打开 \/memory\/config\.right\.json/)).toBeDefined()
  })

  it('renders the parse-error state instead of crashing for a non-JSON / YAML pick', async () => {
    render(<StructuredView fixture={STRUCTURED_SCENE} platform={platform} />)

    fireEvent.click(screen.getByRole('button', { name: '打开左文件' }))
    chooseFile('notes.txt', 'plain text, not structured')

    expect(await screen.findByRole('heading', { name: '结构化解析失败' })).toBeDefined()
  })
})

const jsonEntries = diffStructured(
  STRUCTURED_SCENE.json.left.text,
  STRUCTURED_SCENE.json.right.text,
  'json'
).entries.length

const yamlResult = diffStructured(
  STRUCTURED_SCENE.yaml.left.text,
  STRUCTURED_SCENE.yaml.right.text,
  'yaml'
)

function diffPair(): { left: { path: string; text: string }; right: { path: string; text: string } } {
  return {
    left: { path: 'config/deploy.left.yaml', text: 'service:\n  replicas: 2\nprofile: production\n' },
    right: {
      path: 'config/deploy.right.yaml',
      text: 'profile: staging\nservice:\n  replicas: 4\n  health:\n    path: /healthz\n'
    }
  }
}

describe('English copy', () => {
  it('renders the format switch, filters, counts and panel copy in English', () => {
    const { container } = renderWithI18n(
      <StructuredView fixture={STRUCTURED_SCENE} platform={platform} />,
      'en'
    )

    expect(screen.getByRole('tablist', { name: 'Structured format' })).toBeDefined()
    expect(screen.getByRole('tablist', { name: 'Status filter' })).toBeDefined()
    for (const name of ['All', 'Added', 'Removed', 'Modified', 'Type changed', 'Same']) {
      expect(screen.getByRole('tab', { name })).toBeDefined()
    }
    expect(screen.getByRole('group', { name: 'structured counts' })).toBeDefined()
    expect(screen.getByText(`${jsonEntries} nodes · counts reflect the runtime comparison`)).toBeDefined()
    expect(screen.getByText('Node path changes')).toBeDefined()
    expect(screen.getByText(`Showing ${jsonEntries} / ${jsonEntries}`)).toBeDefined()
    expect(screen.getByText('Left source')).toBeDefined()
    expect(screen.getByText('Right source')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Open left file' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Open right file' })).toBeDefined()
    expect(container.textContent).not.toMatch(/\p{Script=Han}/u)
  })

  it('describes a YAML drilldown and localizes its picker title', () => {
    const selectFile = vi.fn(async () => null)
    const port: PlatformPort = { ...platform, selectFile }
    renderWithI18n(<StructuredView pair={diffPair()} format="yaml" platform={port} />, 'en')

    expect(screen.getByText('Local file · YAML source · semantic comparison')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Open left file' }))
    expect(selectFile).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Open left JSON / YAML file' })
    )
  })

  it('keeps the Chinese wording for counts, panel titles and sources', () => {
    render(<StructuredView fixture={STRUCTURED_SCENE} platform={platform} />)

    expect(
      screen.getByText(`共 ${jsonEntries} 个节点 · 计数为运行时对比结果`)
    ).toBeDefined()
    expect(screen.getByText('节点路径变更')).toBeDefined()
    expect(screen.getByText('左原文')).toBeDefined()
    expect(screen.getByText('右原文')).toBeDefined()
  })
})

describe('parse errors and empty states', () => {
  const broken = {
    left: { path: 'broken.json', text: '{"a": 1' },
    right: { path: 'right.json', text: '{}' }
  }

  it('localizes the error frame but keeps the raw core message', () => {
    renderWithI18n(<StructuredView pair={broken} format="json" platform={platform} />, 'en')

    expect(screen.getByRole('heading', { name: 'Structured parsing failed' })).toBeDefined()
    expect(screen.getByText('Parse failed')).toBeDefined()
    expect(screen.getByText(/left side: JSON parse error/)).toBeDefined()
    expect(
      screen.getByText('Only this session is affected: fix the input and drill down again, or switch to another session.')
    ).toBeDefined()
  })

  it('localizes the no-data and filtered empty states', () => {
    const empty = renderWithI18n(<StructuredView platform={platform} />, 'en')
    expect(screen.getByRole('heading', { name: 'No structured data to compare' })).toBeDefined()
    expect(empty.container.textContent).not.toMatch(/\p{Script=Han}/u)

    cleanup()
    render(<StructuredView platform={platform} />)
    expect(screen.getByRole('heading', { name: '无可对比的结构化数据' })).toBeDefined()

    cleanup()
    renderWithI18n(
      <StructuredView
        pair={{ left: { path: 'a.json', text: '{"a":1}' }, right: { path: 'b.json', text: '{"a":2}' } }}
        format="json"
        platform={platform}
      />,
      'en'
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Type changed' }))
    expect(screen.getByText(/No nodes under the current filter/)).toBeDefined()
    expect(screen.getByText(/Switch back to All/)).toBeDefined()

    cleanup()
    render(
      <StructuredView
        pair={{ left: { path: 'a.json', text: '{"a":1}' }, right: { path: 'b.json', text: '{"a":2}' } }}
        format="json"
        platform={platform}
      />
    )
    fireEvent.click(screen.getByRole('tab', { name: '类型变更' }))
    const zhEmpty = screen.getByText(/当前过滤条件下没有节点/)
    expect(zhEmpty.textContent).toContain('全部')
  })
})

describe('language switch keeps structured state', () => {
  it('keeps the YAML format, type-change filter and counts', () => {
    render(
      <I18nProvider initialLanguage="zh">
        <StructuredView fixture={STRUCTURED_SCENE} platform={platform} />
        <LanguageSwitch to="en" />
      </I18nProvider>
    )

    fireEvent.click(screen.getByRole('tab', { name: 'YAML' }))
    fireEvent.click(screen.getByRole('tab', { name: '类型变更' }))

    const countsBefore = countsGroup().textContent ?? ''
    const showingBefore = screen.getByText(/^显示 /).textContent ?? ''

    fireEvent.click(screen.getByRole('button', { name: 'switch-language' }))

    expect(screen.getByRole('tab', { name: 'YAML' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: 'Type changed' }).getAttribute('aria-selected')).toBe('true')
    const countsAfter = screen.getByRole('group', { name: 'structured counts' }).textContent ?? ''
    expect(countsAfter.match(/\d+/g)).toEqual(countsBefore.match(/\d+/g))
    const showingAfter = screen.getByText(/^Showing /).textContent ?? ''
    expect(showingAfter.match(/\d+/g)).toEqual(showingBefore.match(/\d+/g))
    // The YAML pair has no type change, so the filter keeps its (empty) result
    // while the runtime entry count stays intact across the switch.
    expect(showingAfter.match(/\d+/g)).toEqual(['0', String(yamlResult.entries.length)])
  })
})
