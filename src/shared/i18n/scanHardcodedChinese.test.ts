import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { scanHardcodedChinese } from './scanHardcodedChinese'

let root = ''
let viewFile = ''
let testFile = ''
let messageFile = ''
let plainFile = ''

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'opencompare-han-'))
  await mkdir(join(root, 'src/views'), { recursive: true })
  await mkdir(join(root, 'src/renderer/src/i18n/messages/zh'), { recursive: true })

  viewFile = join(root, 'src/views/Panel.tsx')
  await writeFile(
    viewFile,
    ['// 关闭提示', "const label = '确定'", '<span aria-label="语言" />', 'const ok = true'].join(
      '\n'
    ),
    'utf8'
  )
  testFile = join(root, 'src/views/Panel.test.tsx')
  await writeFile(testFile, "expect(screen.getByText('确定')).toBeDefined()\n", 'utf8')
  messageFile = join(root, 'src/renderer/src/i18n/messages/zh/common.ts')
  await writeFile(messageFile, "export const common = { 'common.confirm': '确定' }\n", 'utf8')
  plainFile = join(root, 'src/views/plain.ts')
  await writeFile(plainFile, 'export const label = "Confirm"\n', 'utf8')
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('scanHardcodedChinese', () => {
  it('reports file, line and snippet for every Chinese line, comments included', () => {
    expect(scanHardcodedChinese([viewFile])).toEqual([
      { file: viewFile, line: 1, text: '// 关闭提示' },
      { file: viewFile, line: 2, text: "const label = '确定'" },
      { file: viewFile, line: 3, text: '<span aria-label="语言" />' }
    ])
  })

  it('walks a directory and skips test files and dictionary surfaces', () => {
    const hits = scanHardcodedChinese([root])

    expect(hits.map((hit) => hit.file)).toEqual([viewFile, viewFile, viewFile])
  })

  it('returns nothing for an explicitly listed test file or pure English file', () => {
    expect(scanHardcodedChinese([testFile, messageFile, plainFile])).toEqual([])
  })

  it('returns nothing when the whole tree is clean', async () => {
    const cleanRoot = await mkdtemp(join(tmpdir(), 'opencompare-han-clean-'))
    try {
      await writeFile(join(cleanRoot, 'view.tsx'), 'export const label = "Confirm"\n', 'utf8')
      expect(scanHardcodedChinese([cleanRoot])).toEqual([])
    } finally {
      await rm(cleanRoot, { recursive: true, force: true })
    }
  })
})
