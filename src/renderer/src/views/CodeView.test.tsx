// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { CodeSceneFixture } from '@shared/fixtures'
import { CodeView } from './CodeView'
import type { CodeMergeState } from './CodeView'

afterEach(cleanup)

const FIXTURE: CodeSceneFixture = {
  scene: 'code',
  composition: { same: 0, added: 0, removed: 0, modified: 0, conflict: 2 },
  diff: {
    left: { path: '/samples/left.ts', text: 'alpha\n  color: red\nbeta\n' },
    right: { path: '/samples/right.ts', text: 'alpha\n  color: RED\nbeta\ngamma\n' }
  },
  merge: {
    base: { path: '/samples/base.ts', text: 'head\nbase-1\nmid\nbase-2\ntail\n' },
    ours: { path: '/samples/ours.ts', text: 'head\nours-1\nmid\nours-2\ntail\n' },
    theirs: { path: '/samples/theirs.ts', text: 'head\ntheirs-1\nmid\ntheirs-2\ntail\n' }
  }
}

describe('two-column diff', () => {
  it('highlights inline characters, navigates blocks and overwrites one side', () => {
    render(<CodeView fixture={FIXTURE} defaultMode="diff" />)

    expect(screen.getByText('1/2')).toBeDefined()
    // only the changed fragment is coloured, not the whole line
    expect(screen.getByText('red')).toBeDefined()
    expect(screen.getByText('RED')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: '下一个差异块' }))
    expect(screen.getByText('2/2')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '下一个差异块' }))
    expect(screen.getByText('1/2')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: '覆写到右' }))
    expect(screen.getByText('1/1')).toBeDefined()
    expect(screen.queryByText('red')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '重置' }))
    expect(screen.getByText('1/2')).toBeDefined()
    expect(screen.getByText('red')).toBeDefined()
  })
})

describe('three-way merge', () => {
  it('counts conflicts, resolves block by block and unlocks export', () => {
    render(<CodeView fixture={FIXTURE} defaultMode="merge" />)

    expect(screen.getByText('2/2')).toBeDefined()
    expect(screen.getAllByText('<<<<<<< ours')).toHaveLength(2)
    expect((screen.getByRole('button', { name: /导出合并文本/ }) as HTMLButtonElement).disabled).toBe(
      true
    )

    // Accept Both on the first conflict
    fireEvent.click(screen.getAllByRole('button', { name: 'Accept Both' })[0])
    expect(screen.getByText('1/2')).toBeDefined()
    expect(screen.getByText('已采纳 ours + theirs')).toBeDefined()

    // Navigate to the second conflict and resolve it to ours
    fireEvent.click(screen.getByRole('button', { name: '下一个冲突块' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Accept Ours' })[0])
    expect(screen.getByText('0/2')).toBeDefined()
    expect(screen.getByText('已采纳 ours')).toBeDefined()
    expect(screen.queryAllByText('<<<<<<< ours')).toHaveLength(0)
    expect(
      (screen.getByRole('button', { name: /导出合并文本/ }) as HTMLButtonElement).disabled
    ).toBe(false)
  })

  it('reports the runtime conflict count to the workbench', () => {
    const states: CodeMergeState[] = []
    render(
      <CodeView
        fixture={FIXTURE}
        defaultMode="merge"
        onMergeStateChange={(state) => states.push(state)}
      />
    )

    expect(states.at(-1)).toEqual({ unresolved: 2, total: 2 })
    fireEvent.click(screen.getAllByRole('button', { name: 'Accept Ours' })[0])
    expect(states.at(-1)).toEqual({ unresolved: 1, total: 2 })
  })
})
