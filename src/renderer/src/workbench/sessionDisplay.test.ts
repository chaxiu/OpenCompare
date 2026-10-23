import { describe, expect, it } from 'vitest'
import type { DirectoryDiffNode } from '@core/directory/compare'
import type { SessionStat } from '@shared/fixtures'
import { translate } from '@renderer/i18n/context'
import { createFilePairSession, createDrilldownSession } from './directoryCompare'
import type { WorkbenchSession } from './session'
import { describeSession, renderSessionText } from './sessionDisplay'

const zh = translate('zh')
const en = translate('en')

function sampleSession(
  id: 'session-code' | 'session-csv' | 'session-structured' | 'session-directory',
  stats: readonly SessionStat[]
): WorkbenchSession {
  return {
    id,
    scene: id.replace('session-', '') as WorkbenchSession['scene'],
    title: 'fixture title',
    subtitle: 'fixture subtitle',
    columns: 2,
    stats
  }
}

describe('sample session display', () => {
  it('renders the code sample title, subtitle and stable stat keys in both languages', () => {
    const session = sampleSession('session-code', [
      { label: '行数（左）', value: 81 },
      { label: '行数（右）', value: 92 },
      { label: '冲突块', value: 3, tone: 'conflict' }
    ])
    const display = describeSession(session)

    expect(renderSessionText(display.title, zh)).toBe('代码 Diff & 3-Way Merge')
    expect(renderSessionText(display.subtitle, zh)).toBe(
      '双栏 Diff 文本对 + base · ours · theirs 多冲突块'
    )
    expect(renderSessionText(display.title, en)).toBe('Code diff & 3-way merge')
    expect(display.stats.map((stat) => stat.key)).toEqual([
      'shell.stat.linesLeft',
      'shell.stat.linesRight',
      'shell.stat.conflicts'
    ])
    expect(display.stats.map((stat) => stat.value)).toEqual([81, 92, 3])
  })

  it('localizes the CSV subtitle without reading the fixture title text', () => {
    const session = sampleSession('session-csv', [
      { label: '行数（左）', value: 1240 },
      { label: '行数（右）', value: 1240 },
      { label: '主键列', value: 'order_id' }
    ])
    const display = describeSession(session)

    expect(renderSessionText(display.subtitle, zh)).toBe('1,240 行乱序主键 + 列偏移 CSV / TSV')
    expect(renderSessionText(display.subtitle, en)).toBe(
      '1,240 shuffled keys with column offsets in CSV / TSV'
    )
    expect(renderSessionText(display.title, en)).toBe('CSV key comparison')
  })

  it('never surfaces the fixture Chinese title or subtitle for a sample id', () => {
    const sessions = (['session-directory', 'session-code', 'session-csv', 'session-structured'] as const).map(
      (id) => describeSession(sampleSession(id, []))
    )

    for (const display of sessions) {
      expect(renderSessionText(display.title, en)).not.toMatch(/\p{Script=Han}/u)
      expect(renderSessionText(display.subtitle, en)).not.toMatch(/\p{Script=Han}/u)
      expect(display.title[0]).toHaveProperty('key')
    }
  })
})

describe('runtime session display', () => {
  it('keeps directory names and roots as user data and uses stable stat keys', () => {
    const session: WorkbenchSession = {
      id: 'directory:/left ↔ /right',
      scene: 'directory',
      title: 'left ↔ right',
      subtitle: '/left ↔ /right',
      columns: 2,
      stats: [
        { label: '文件（源）', value: 3 },
        { label: '文件（目标）', value: 4 },
        { label: '差异', value: 2 }
      ],
      directory: {} as NonNullable<WorkbenchSession['directory']>
    }
    const display = describeSession(session)

    expect(renderSessionText(display.title, zh)).toBe('left ↔ right')
    expect(renderSessionText(display.subtitle, en)).toBe('/left ↔ /right')
    expect(display.stats.map((stat) => stat.key)).toEqual([
      'shell.stat.sourceFiles',
      'shell.stat.targetFiles',
      'shell.stat.differences'
    ])
    const differences = display.stats[2]
    expect(differences === undefined ? '' : en(differences.key)).toBe('Differences')
  })

  it('localizes the file-family name in a file pair subtitle', () => {
    const session = createFilePairSession(
      'file:/a.json ↔ /b.json',
      'a.json ↔ b.json',
      { kind: 'structured', label: 'json', format: 'json' },
      { path: '/a.json', text: '{"a":1}\n' },
      { path: '/b.json', text: '{"a":2}\n' }
    )

    expect(renderSessionText(describeSession(session).subtitle, zh)).toBe(
      '/a.json ↔ /b.json · JSON'
    )
    expect(renderSessionText(describeSession(session).subtitle, en)).toBe(
      '/a.json ↔ /b.json · JSON'
    )
    expect(describeSession(session).stats.map((stat) => stat.key)).toEqual([
      'shell.stat.linesLeft',
      'shell.stat.linesRight'
    ])
  })

  it('marks a missing drilldown side with a stable token and localizes it at render time', () => {
    const node: DirectoryDiffNode = {
      name: 'engine.ts',
      relativePath: 'src/core/engine.ts',
      kind: 'file',
      status: 'added',
      children: [],
      counts: { same: 0, added: 1, removed: 0, modified: 0 },
      rightPath: '/right/src/core/engine.ts'
    }
    const session = createDrilldownSession(
      'directory:/left ↔ /right',
      node,
      { kind: 'code', label: 'code' },
      '',
      'right body'
    )

    expect(session.adhoc?.pair.left.path).toBe('src/core/engine.ts::opencompare-missing-left')
    const display = describeSession(session)
    expect(renderSessionText(display.subtitle, zh)).toBe(
      'src/core/engine.ts（左不存在） ↔ /right/src/core/engine.ts · 代码 / 文本'
    )
    expect(renderSessionText(display.subtitle, en)).toBe(
      'src/core/engine.ts (missing on the left) ↔ /right/src/core/engine.ts · Code / text'
    )
  })
})
