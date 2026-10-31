// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { diffStructured } from '@core/structured/diff'
import type { StructuredFormat } from '@core/structured/parse'
import { STRUCTURED_SCENE } from '@shared/fixtures'
import { renderWithI18n } from '@renderer/i18n/testing'
import { createWebPlatformPort } from '@renderer/platform/web-platform'
import type { StructuredCompareClient } from '@renderer/structured/compareClient'
import { runStructuredCompare } from '@renderer/structured/compareJob'
import type { StructuredCompareOutcome } from '@renderer/structured/compareJob'
import { StructuredView } from './StructuredView'

afterEach(cleanup)

const platform = createWebPlatformPort()

interface CompareCall {
  readonly request: {
    readonly leftText: string
    readonly rightText: string
    readonly format: StructuredFormat
  }
  readonly resolve: (outcome: StructuredCompareOutcome) => void
  readonly reject: (error: unknown) => void
}

/** A client whose comparisons stay pending until the test settles them. */
class SuspendedClient implements StructuredCompareClient {
  readonly calls: CompareCall[] = []
  readonly cancel = vi.fn()
  readonly dispose = vi.fn()

  compare(request: CompareCall['request']): Promise<StructuredCompareOutcome> {
    return new Promise<StructuredCompareOutcome>((resolve, reject) => {
      this.calls.push({ request, resolve, reject })
    })
  }

  resolveLatest(outcome: StructuredCompareOutcome): void {
    const call = this.calls[this.calls.length - 1]
    if (!call) throw new Error('no comparison was requested')
    call.resolve(outcome)
  }
}

describe('background comparison loading state', () => {
  it('shows the Chinese loading copy and keeps filters and format switch interactive', async () => {
    const client = new SuspendedClient()
    render(
      <StructuredView
        fixture={STRUCTURED_SCENE}
        platform={platform}
        createClient={() => client}
      />
    )

    expect(screen.getByText('对比中')).toBeDefined()
    expect(screen.queryByRole('group', { name: '结构化计数' })).toBeNull()
    expect(screen.queryByText('/service/version')).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: '类型变更' }))
    expect(screen.getByRole('tab', { name: '类型变更' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.click(screen.getByRole('tab', { name: '全部' }))
    expect(screen.getByRole('tab', { name: '全部' }).getAttribute('aria-selected')).toBe('true')

    fireEvent.click(screen.getByRole('tab', { name: 'YAML' }))
    expect(screen.getByRole('tab', { name: 'YAML' }).getAttribute('aria-selected')).toBe('true')
    expect(client.calls).toHaveLength(2)

    const outcome = runStructuredCompare(
      STRUCTURED_SCENE.yaml.left.text,
      STRUCTURED_SCENE.yaml.right.text,
      'yaml'
    )
    await act(async () => {
      client.resolveLatest(outcome)
    })

    expect(screen.queryByText('对比中')).toBeNull()
    expect(screen.getByRole('group', { name: '结构化计数' })).toBeDefined()
    expect(screen.getByText('/service/health')).toBeDefined()
  })

  it('shows the English loading copy', () => {
    const client = new SuspendedClient()
    const { container } = renderWithI18n(
      <StructuredView
        fixture={STRUCTURED_SCENE}
        platform={platform}
        createClient={() => client}
      />,
      'en'
    )

    expect(screen.getByText('Comparing')).toBeDefined()
    expect(screen.queryByRole('group', { name: 'structured counts' })).toBeNull()
    expect(container.textContent).not.toMatch(/\p{Script=Han}/u)
  })
})

describe('background comparison errors', () => {
  it('renders the synchronous parse error wording in the existing error state', async () => {
    let syncMessage = ''
    try {
      diffStructured('{"a": 1', '{}', 'json')
    } catch (cause) {
      syncMessage = cause instanceof Error ? cause.message : String(cause)
    }

    renderWithI18n(
      <StructuredView
        pair={{
          left: { path: 'broken.json', text: '{"a": 1' },
          right: { path: 'right.json', text: '{}' }
        }}
        format="json"
        platform={platform}
      />,
      'en'
    )

    expect(
      await screen.findByRole('heading', { name: 'Structured parsing failed' })
    ).toBeDefined()
    expect(screen.getByText(syncMessage)).toBeDefined()
    expect(screen.getByText('broken.json')).toBeDefined()
    expect(screen.getByText('right.json')).toBeDefined()
  })
})

describe('background comparison lifecycle', () => {
  it('disposes the injected client exactly once on unmount and ignores a late result', async () => {
    const client = new SuspendedClient()
    const { unmount } = render(
      <StructuredView
        fixture={STRUCTURED_SCENE}
        platform={platform}
        createClient={() => client}
      />
    )

    expect(client.calls).toHaveLength(1)
    unmount()
    expect(client.dispose).toHaveBeenCalledTimes(1)
    expect(client.cancel).not.toHaveBeenCalled()

    await act(async () => {
      client.resolveLatest(
        runStructuredCompare(
          STRUCTURED_SCENE.json.left.text,
          STRUCTURED_SCENE.json.right.text,
          'json'
        )
      )
    })
    expect(screen.queryByRole('group', { name: '结构化计数' })).toBeNull()
  })
})
