// Shared release-document fixtures for the split release gate suites.
// Test-only: no product entry point imports this module.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

export const repoRoot = fileURLToPath(new URL('../../', import.meta.url))

export const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
  version?: string
  author?: { name?: string; email?: string }
  license?: string
  homepage?: string
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}
export const currentVersion = pkg.version ?? ''
export const currentTag = `v${currentVersion}`

export const ghostTag = ['v0.2', '3'].join('.')
export const ghostNotesPath = `docs/release-notes/${ghostTag}.md`
export const ghostReleaseLink = `releases/tag/${ghostTag}`
export const ghostEvidencePath = `docs/release-evidence/${ghostTag}.md`
export const foldedTag = ['v0.2', '13'].join('.')
export const foldedNotesPath = `docs/release-notes/${foldedTag}.md`
export const foldedBilingualNotesPath = `docs/release-notes/${foldedTag}.zh-CN.md`
export const foldedReleaseLink = `releases/tag/${foldedTag}`
export const foldedEvidencePath = `docs/release-evidence/${foldedTag}.md`
export const pendingWord = ['待', '发布'].join('')
export const latestPublishedTag = 'v0.2.16'
export const lastShippedTag = 'v0.2.15'
export const priorPublishedTag = 'v0.2.14'
export const previousPublishedTag = 'v0.2.8'
export const publishedTags = [
  'v0.2.0',
  'v0.2.1',
  'v0.2.2',
  'v0.2.4',
  'v0.2.5',
  'v0.2.6',
  'v0.2.7',
  'v0.2.8',
  'v0.2.9',
  'v0.2.11',
  'v0.2.12',
  priorPublishedTag,
  lastShippedTag,
  latestPublishedTag
]
export const releaseTagLink = /releases\/tag\/(v\d+\.\d+\.\d+)/g
export const isTagBefore = (older: string, newer: string): boolean => {
  const parts = (tag: string): number[] => tag.replace(/^v/, '').split('.').map(Number)
  const left = parts(older)
  const right = parts(newer)
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index]
  }
  return false
}

export const documentPaths = (): string[] => {
  const docsRoot = join(repoRoot, 'docs')
  const docs = readdirSync(docsRoot, { recursive: true })
    .map((entry) => String(entry))
    .filter((entry) => entry.endsWith('.md'))
    .map((entry) => join(docsRoot, entry))
  return [join(repoRoot, 'README.md'), join(repoRoot, 'README.zh-CN.md'), join(repoRoot, 'CHANGELOG.md'), ...docs]
}

export const builder = parse(readFileSync(join(repoRoot, 'electron-builder.yml'), 'utf8')) as {
  appId?: string
  productName?: string
  protocols?: Array<{ name?: string; schemes?: string[] }>
  extraResources?: Array<{ from?: string; to?: string }>
  mac?: {
    icon?: string
    identity?: string
    hardenedRuntime?: boolean
    entitlements?: string
    entitlementsInherit?: string
    notarize?: boolean
    target?: string[]
  }
  win?: { icon?: string; artifactName?: string; target?: string[] }
  nsis?: { artifactName?: string }
  linux?: {
    icon?: string
    maintainer?: string
    target?: string[]
    desktop?: { entry?: { MimeType?: string } }
  }
  publish?: { provider?: string; releaseType?: string }
}

export const builderConfig = readFileSync(join(repoRoot, 'electron-builder.yml'), 'utf8')
const entitlementsPath = builder.mac?.entitlements ?? ''
export const macEntitlements = entitlementsPath ? readFileSync(join(repoRoot, entitlementsPath), 'utf8') : ''

export const releaseWorkflow = readFileSync(join(repoRoot, '.github/workflows/release.yml'), 'utf8')

export interface WorkflowStep {
  name?: string
  if?: string
  run?: string
  uses?: string
  with?: Record<string, string>
}

export const workflow = parse(releaseWorkflow) as {
  jobs?: Record<string, { steps?: WorkflowStep[] }>
}
const gatesSteps: WorkflowStep[] = workflow.jobs?.gates?.steps ?? []
export const gateStep = (name: string): WorkflowStep | undefined =>
  gatesSteps.find((step) => step.name === name)
const packageSteps: WorkflowStep[] = workflow.jobs?.release?.steps ?? []
export const packageStep = (name: string): WorkflowStep | undefined =>
  packageSteps.find((step) => step.name === name)
const finalizeSteps: WorkflowStep[] = workflow.jobs?.finalize?.steps ?? []
export const finalizeStep = (name: string): WorkflowStep | undefined =>
  finalizeSteps.find((step) => step.name === name)

export const ancestryGateScript = gateStep('Preflight v0.1.2 ancestry')?.run ?? ''

export const signingDoc = readFileSync(join(repoRoot, 'docs/release-signing.md'), 'utf8')
export const releaseProcessDoc = readFileSync(join(repoRoot, 'docs/release-process.md'), 'utf8')
export const readmeEn = readFileSync(join(repoRoot, 'README.md'), 'utf8')
export const readmeZh = readFileSync(join(repoRoot, 'README.zh-CN.md'), 'utf8')
export const symlinkDoc = readFileSync(join(repoRoot, 'docs/symlink-no-follow.md'), 'utf8')
export const changelog = readFileSync(join(repoRoot, 'CHANGELOG.md'), 'utf8')

const readNotes = (tag: string): string => {
  const path = join(repoRoot, `docs/release-notes/${tag}.md`)
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

export const releaseNotesPath = join(repoRoot, `docs/release-notes/${currentTag}.md`)
export const releaseNotes = readNotes(currentTag)
export const bilingualNotesPath = join(repoRoot, `docs/release-notes/${currentTag}.zh-CN.md`)
export const bilingualNotes = existsSync(bilingualNotesPath) ? readFileSync(bilingualNotesPath, 'utf8') : ''
export const historicalNotesV024 = readNotes('v0.2.4')
export const historicalNotesV022 = readNotes('v0.2.2')
export const lastReleasedNotesPath = join(repoRoot, `docs/release-notes/${latestPublishedTag}.md`)
export const lastReleasedNotes = readNotes(latestPublishedTag)

export const firstHeading = (markdown: string): string =>
  markdown.split(/\r?\n/).find((line) => line.startsWith('# ')) ?? ''

export const driftFacts = [
  /7ea2cc6/,
  /c4a6a95/,
  /annotated/,
  /祖先/,
  /13 个提交/,
  /公开/,
  /非预发布/,
  /11 个资产/
]

export const signingSecrets = [
  'CSC_LINK',
  'CSC_KEY_PASSWORD',
  'APPLE_TEAM_ID',
  'APPLE_API_KEY',
  'APPLE_API_KEY_ID',
  'APPLE_API_ISSUER'
]

export const readmeLines = (markdown: string): string[] => markdown.split(/\r?\n/)
export const readmeStatusLine = (markdown: string): string => readmeLines(markdown)[4] ?? ''
export const stripLanguageSwitch = (markdown: string): string =>
  readmeLines(markdown)
    .filter((line) => !line.includes('README.zh-CN.md') && !line.includes('[English](./README.md)'))
    .join('\n')
export const h2Headings = (markdown: string): string[] =>
  readmeLines(markdown)
    .filter((line) => line.startsWith('## '))
    .map((line) => line.slice(3))
export const wordCount = (markdown: string): number => {
  let text = markdown.replace(/```[\s\S]*?```/g, ' ')
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  text = text.replace(/https?:\/\/\S+/g, ' ')
  text = text.replace(/`[^`]*`/g, ' ')
  text = text.replace(/<[^>]+>/g, ' ')
  return (text.match(/[A-Za-z][A-Za-z0-9'’-]*/g) ?? []).length
}
