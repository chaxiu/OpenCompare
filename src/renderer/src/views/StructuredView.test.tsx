// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { diffStructured } from '@core/structured/diff'
import { STRUCTURED_SCENE } from '@shared/fixtures'
import { StructuredView } from './StructuredView'

afterEach(cleanup)

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
    render(<StructuredView fixture={STRUCTURED_SCENE} />)

    expect(screen.getByText('/service/features/limits/maxBytes')).toBeDefined()
    // the type change is labelled separately from a plain edit, with both values
    const row = screen.getByText('/service/version').parentElement as HTMLElement
    expect(within(row).getByText('类型变更')).toBeDefined()
    expect(within(row).getByText('2')).toBeDefined()
    expect(within(row).getByText('"2.0.0"')).toBeDefined()
    expect(within(countsGroup()).getByText('类型变更')).toBeDefined()
  })

  it('reports runtime counts that survive filtering', () => {
    render(<StructuredView fixture={STRUCTURED_SCENE} />)

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
    render(<StructuredView fixture={STRUCTURED_SCENE} />)

    fireEvent.click(screen.getByRole('tab', { name: '新增' }))
    expect(screen.queryByText('/telemetry/enabled')).toBeNull()
    expect(screen.getByText('/service/features/limits/maxBytes')).toBeDefined()

    fireEvent.click(screen.getByRole('tab', { name: '全部' }))
    expect(screen.getByText('/telemetry/enabled')).toBeDefined()
    expect(screen.getByText('/service/features/limits/maxBytes')).toBeDefined()
  })

  it('switches between the JSON and YAML sample pairs', () => {
    render(<StructuredView fixture={STRUCTURED_SCENE} />)

    expect(screen.getByText('/service/features/limits/maxBytes')).toBeDefined()

    fireEvent.click(screen.getByRole('tab', { name: 'YAML' }))
    expect(screen.getByText('/service/health')).toBeDefined()
    expect(screen.queryByText('/service/features/limits/maxBytes')).toBeNull()
    expect(screen.getByText('/samples/structured/deploy.left.yaml')).toBeDefined()
  })

  it('keeps both raw originals visible next to the change list', () => {
    render(<StructuredView fixture={STRUCTURED_SCENE} />)

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
    render(<StructuredView pair={pair} format="yaml" />)

    expect(screen.getByText(/来自目录对比下钻 · YAML 原文/)).toBeDefined()
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
      />
    )

    expect(screen.getByRole('heading', { name: '结构化解析失败' })).toBeDefined()
    expect(screen.getByText(/left side: JSON parse error/)).toBeDefined()
    // the raw text and the other session tabs stay usable
    expect(screen.getByText('broken.json')).toBeDefined()
  })
})
