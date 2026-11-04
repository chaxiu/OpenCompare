import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const workflowPath = `${repoRoot}/.github/workflows/coverage-gate-preflight.yml`
const preflight = 'node scripts/coverage-gate-preflight.mjs'

const text = readFileSync(workflowPath, 'utf8')
const workflow = parse(text)
const jobs = Object.entries(workflow.jobs ?? {})
const steps = jobs.flatMap(([, job]) => job.steps ?? [])
const header = text.split('jobs:')[0] ?? ''
const body = text.slice(header.length)

describe('coverage-gate-preflight workflow', () => {
  it('parses as an object with a job name', () => {
    expect(text.trim().length).toBeGreaterThan(0)
    expect(workflow).toBeTypeOf('object')
    expect(typeof workflow.name).toBe('string')
    expect((workflow.name ?? '').trim().length).toBeGreaterThan(0)
  })

  it('only triggers on pull_request and a manual dispatch with a string tag label', () => {
    expect(Object.keys(workflow.on ?? {}).sort()).toEqual(['pull_request', 'workflow_dispatch'])
    const dispatch = workflow.on?.workflow_dispatch
    expect(dispatch?.inputs?.tag).toMatchObject({
      required: false,
      default: 'v0.0.0-preflight',
      type: 'string'
    })
    expect(workflow['run-name']).toBe('coverage-gate preflight ${{ inputs.tag || github.ref_name }}')
  })

  it('is read-only and never pushes tags or touches releases or secrets', () => {
    expect(workflow.permissions).toEqual({ contents: 'read' })
    for (const forbidden of [
      /secrets\./,
      /contents:\s*write/,
      /gh release/,
      /git push/,
      /git tag/,
      /continue-on-error/
    ]) {
      expect(body, String(forbidden)).not.toMatch(forbidden)
    }
  })

  it('runs one ubuntu-latest job with pinned checkout, pnpm, node and install steps', () => {
    expect(jobs).toHaveLength(1)
    const [jobName, job] = jobs[0]
    expect(jobName).toBeTruthy()
    expect(job['runs-on']).toBe('ubuntu-latest')
    expect(job.steps?.map((step) => step.uses ?? step.run)).toEqual([
      'actions/checkout@v4',
      'pnpm/action-setup@v4',
      'actions/setup-node@v4',
      'pnpm install --frozen-lockfile',
      preflight,
      `${preflight} --negative floor`,
      `${preflight} --negative stale`
    ])
    expect(job.steps?.[0].with).toEqual({ 'fetch-depth': 0 })
    expect(job.steps?.[1].with).toEqual({ version: '10.18.3' })
    expect(job.steps?.[2].with).toEqual({ 'node-version': 22, cache: 'pnpm' })
  })

  it('calls the preflight wrapper directly for positive and both negative passes', () => {
    const runs = steps.map((step) => step.run).filter((run) => typeof run === 'string')
    expect(runs.filter((run) => run.includes('coverage-gate-preflight.mjs'))).toEqual([
      preflight,
      `${preflight} --negative floor`,
      `${preflight} --negative stale`
    ])
    for (const run of runs) {
      expect(run).not.toMatch(/\|\||&&|set \+e/)
    }
  })

  it('documents the read-only pre-tag rehearsal posture in the header', () => {
    for (const marker of [
      'pre-tag rehearsal',
      'ubuntu-latest',
      'never pushes a tag',
      '.munk/baseline/coverage.json',
      'secrets'
    ]) {
      expect(header, marker).toContain(marker)
    }
  })
})
