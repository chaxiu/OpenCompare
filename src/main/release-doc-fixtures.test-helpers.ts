// Shared release-document fixtures for the split release gate suites.
// Test-only: no product entry point imports this module.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { compareTags } from './release-gate'

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

const releaseWorkflow = readFileSync(join(repoRoot, '.github/workflows/release.yml'), 'utf8')

export interface WorkflowStep {
  name?: string
  if?: string
  run?: string
  uses?: string
  env?: Record<string, string>
  with?: Record<string, string>
}

export interface WorkflowJob {
  name?: string
  needs?: string | string[]
  strategy?: { matrix?: { include?: Array<Record<string, string>> } }
  steps?: WorkflowStep[]
}

export const workflow = parse(releaseWorkflow) as {
  on?: Record<string, { tags?: string[]; inputs?: Record<string, { default?: string }> }>
  jobs?: Record<string, WorkflowJob>
}
export const gatesSteps: WorkflowStep[] = workflow.jobs?.gates?.steps ?? []
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

/** Markdown atoms a document assertion may read; never the raw document text. */
export interface MarkdownDoc {
  headings: string[]
  codeSpans: string[]
  tableCells: string[]
  links: Array<{ text: string; target: string }>
  listItems: string[]
  paragraphs: string[]
}

export const parseMarkdown = (markdown: string): MarkdownDoc => {
  const doc: MarkdownDoc = { headings: [], codeSpans: [], tableCells: [], links: [], listItems: [], paragraphs: [] }
  let fenced = false
  let paragraph: string[] = []
  const flush = (): void => {
    if (paragraph.length > 0) doc.paragraphs.push(paragraph.join(' ').trim())
    paragraph = []
  }
  for (const raw of markdown.replaceAll('\r', '').split('\n')) {
    const line = raw.trimEnd()
    if (/^\s*(?:```|~~~)/.test(line)) { flush(); fenced = !fenced; continue }
    if (fenced) { doc.codeSpans.push(line.trim()); continue }
    for (const match of line.matchAll(/`([^`]+)`/g)) doc.codeSpans.push(match[1])
    for (const match of line.matchAll(/\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) doc.links.push({ text: match[1], target: match[2] })
    for (const match of line.matchAll(/<((?:https?|mailto):[^>]+)>/g)) doc.links.push({ text: match[1], target: match[1] })
    const heading = /^#{1,6}\s+(.+?)\s*$/.exec(line)
    if (heading !== null) { flush(); doc.headings.push(heading[1]); continue }
    if (/^\s*\|/.test(line)) { flush(); doc.tableCells.push(...line.split('|').slice(1, -1).map((cell) => cell.trim()).filter(Boolean)); continue }
    const listItem = /^\s*(?:[-*+]|\d+\.)\s+(.+)$/.exec(line)
    if (listItem !== null) { flush(); doc.listItems.push(listItem[1].trim()); continue }
    if (line.trim() === '' || /^\s*(?:>|<!--|--$)/.test(line)) { flush(); continue }
    paragraph.push(line.trim())
  }
  flush()
  return doc
}

/** Body of the first heading that contains `anchor`, up to the next same-or-higher heading. */
export const markdownSection = (markdown: string, anchor: string): string => {
  const lines = markdown.replaceAll('\r', '').split('\n')
  const start = lines.findIndex((line) => /^#{1,6}\s/.test(line) && line.includes(anchor))
  if (start < 0) return ''
  const level = /^(#{1,6})/.exec(lines[start])?.[1].length ?? 6
  const end = lines.findIndex((line, index) => index > start && new RegExp(`^#{1,${level}}\\s`).test(line))
  return lines.slice(start, end < 0 ? undefined : end).join('\n')
}

/** Every scalar string value in a parsed YAML document. */
export const yamlScalars = (value: unknown): string[] => {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(yamlScalars)
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(yamlScalars)
  return []
}

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

const ledgerPath = join(repoRoot, 'docs/release-evidence-ledger.json')
const ledgerFacts = existsSync(ledgerPath)
  ? (JSON.parse(readFileSync(ledgerPath, 'utf8')) as {
      versions?: Array<{ version?: string; status?: string }>
    }).versions ?? []
  : []

/** Newest verified tag across the evidence ledger and the evidence directory. */
export const publishedTag =
  [...ledgerFacts.map((entry) => ({ tag: entry.version ?? '', status: entry.status ?? '' })), ...evidenceFacts]
    .filter((entry) => entry.status === 'verified' && /^v\d+\.\d+\.\d+$/.test(entry.tag))
    .map((entry) => entry.tag)
    .sort(compareTags)
    .at(-1) ?? ''

// The single read of the real repository facts. Pure assertions consume this
// object; no `expect` may live in this module.
export const releaseFacts = {
  versionSources: {
    pkgVersion: currentVersion,
    changelogTopTag: /^## (.+)$/m.exec(changelog)?.[1] ?? '',
    notesHeadingTag: tagIn(firstHeading(releaseNotes)),
    workflowDispatchDefault: workflow.on?.workflow_dispatch?.inputs?.tag?.default ?? '',
    processDocDefault: parseMarkdown(releaseProcessDoc).codeSpans
      .map((span) => /^default:\s*'([^']+)'$/.exec(span)?.[1] ?? '')
      .find((tag) => tag !== '') ?? ''
  },
  publishedAnchor: {
    readmeLine5Tag: tagIn(statusLine(readmeEn)),
    readmeZhLine5Tag: tagIn(statusLine(readmeZh)),
    publishedTag
  },
  notes: {
    tag: currentTag,
    notesHeadingTag: tagIn(firstHeading(releaseNotes)),
    englishExists: releaseNotes !== '',
    chineseExists: bilingualNotes !== '',
    englishLines: releaseNotes.split(/\r?\n/),
    chineseLines: bilingualNotes.split(/\r?\n/)
  },
  history: {
    currentTag,
    headings: [...changelog.matchAll(/^## (.+)$/gm)].map((match) => match[1]),
    evidence: evidenceFacts
  }
}
