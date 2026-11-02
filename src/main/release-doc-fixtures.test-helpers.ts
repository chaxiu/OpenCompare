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
export const lastShippedTag = 'v0.2.15'

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
export const changelog = readFileSync(join(repoRoot, 'CHANGELOG.md'), 'utf8')

const readNotes = (tag: string): string => {
  const path = join(repoRoot, `docs/release-notes/${tag}.md`)
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

export const releaseNotes = readNotes(currentTag)
const bilingualNotesPath = join(repoRoot, `docs/release-notes/${currentTag}.zh-CN.md`)
export const bilingualNotes = existsSync(bilingualNotesPath) ? readFileSync(bilingualNotesPath, 'utf8') : ''

export const signingSecrets = [
  'CSC_LINK',
  'CSC_KEY_PASSWORD',
  'APPLE_TEAM_ID',
  'APPLE_API_KEY',
  'APPLE_API_KEY_ID',
  'APPLE_API_ISSUER'
]

const tagIn = (text: string): string => /v\d+\.\d+\.\d+/.exec(text)?.[0] ?? ''
const firstHeading = (markdown: string): string =>
  markdown.split(/\r?\n/).find((line) => line.startsWith('# ')) ?? ''
const statusLine = (markdown: string): string => markdown.split(/\r?\n/)[4] ?? ''
const evidenceDir = join(repoRoot, 'docs/release-evidence')
const evidenceFacts = readdirSync(evidenceDir)
  .filter((file) => file.endsWith('.md'))
  .sort()
  .map((file) => ({
    tag: file.slice(0, -'.md'.length),
    status: /^status:\s*(\w+)$/m.exec(readFileSync(join(evidenceDir, file), 'utf8'))?.[1] ?? ''
  }))

// The single read of the real repository facts. Pure assertions consume this
// object; no `expect` may live in this module.
export const releaseFacts = {
  versionSources: {
    pkgVersion: currentVersion,
    changelogTopTag: /^## (.+)$/m.exec(changelog)?.[1] ?? '',
    notesHeadingTag: tagIn(firstHeading(releaseNotes)),
    readmeLine5Tag: tagIn(statusLine(readmeEn)),
    workflowDispatchDefault: /default:\s*'([^']+)'/.exec(releaseWorkflow)?.[1] ?? '',
    processDocDefault: /default:\s*'([^']+)'/.exec(releaseProcessDoc)?.[1] ?? ''
  },
  notes: {
    tag: currentTag,
    notesHeadingTag: tagIn(firstHeading(releaseNotes)),
    englishExists: releaseNotes !== '',
    chineseExists: bilingualNotes !== '',
    evidenceExists: existsSync(join(evidenceDir, `${currentTag}.md`)),
    englishLines: releaseNotes.split(/\r?\n/),
    chineseLines: bilingualNotes.split(/\r?\n/)
  },
  history: {
    currentTag,
    headings: [...changelog.matchAll(/^## (.+)$/gm)].map((match) => match[1]),
    evidence: evidenceFacts
  }
}
