// run.mjs — one command, every check.
//
//   node tests/run.mjs
//
// Groups: build (does the source compile), imports (does the deployed plugin
// load inside the profile), then one file per behaviour area. Each group runs as
// its own process so a crash in one cannot hide another's result.
import { spawnSync } from 'node:child_process'
import { readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const groups = [
  { name: 'build', kind: 'script', file: join(root, 'scripts', 'build.mjs') },
  { name: 'deploy', kind: 'script', file: join(root, 'scripts', 'deploy.mjs') },
  { name: 'imports', kind: 'test', file: join(here, 'imports.test.mjs') },
  { name: 'catalog', kind: 'test', file: join(here, 'catalog.test.mjs') },
  { name: 'overlay', kind: 'test', file: join(here, 'overlay.test.mjs') },
  { name: 'spawn', kind: 'test', file: join(here, 'spawn.test.mjs') },
  { name: 'skills', kind: 'test', file: join(here, 'skills.test.mjs') },
  { name: 'seam', kind: 'test', file: join(here, 'seam.test.mjs') },
  // Offline only. The live "has upstream moved?" check is a separate script
  // (`scripts/check-upstream.mjs`) because a network failure must not fail a
  // code test, and vice versa.
  { name: 'upstream', kind: 'test', file: join(here, 'upstream.test.mjs') },
  // Reads the REAL `$DSH_HOME/pstack-dsh.json`, so it also covers what the three
  // hand-run scripts in the old `pstack-verify/` folder used to check.
  { name: 'live', kind: 'test', file: join(here, 'live.test.mjs') },
]

const skipDeploy = process.argv.includes('--no-deploy')
const selected = groups.filter(group => !(skipDeploy && group.name === 'deploy'))

const outcomes = []
for (const group of selected) {
  if (!existsSync(group.file)) {
    outcomes.push({ name: group.name, status: 'missing', detail: group.file })
    continue
  }
  const run = spawnSync(process.execPath, ['--no-warnings', '--experimental-strip-types', group.file], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  const stdout = run.stdout ?? ''
  const stderr = run.stderr ?? ''

  // Test files print a JSON report; pull the summary out of it.
  let summary
  const firstBrace = stdout.indexOf('{')
  const lastBrace = stdout.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      const parsed = JSON.parse(stdout.slice(firstBrace, lastBrace + 1))
      if (parsed && typeof parsed === 'object' && typeof parsed.failed === 'number') {
        summary = { total: parsed.total, passed: parsed.passed, failed: parsed.failed, failures: parsed.failures }
      }
    } catch { /* not a JSON report (deploy/build) */ }
  }

  outcomes.push({
    name: group.name,
    status: run.status === 0 ? 'pass' : 'fail',
    exitCode: run.status,
    summary,
    detail: run.status === 0 ? undefined : (stderr.trim() || stdout.trim()).split('\n').slice(-12).join('\n'),
  })
}

const failed = outcomes.filter(outcome => outcome.status !== 'pass')
const totalChecks = outcomes.reduce((sum, outcome) => sum + (outcome.summary?.total ?? 0), 0)
const failedChecks = outcomes.reduce((sum, outcome) => sum + (outcome.summary?.failed ?? 0), 0)

const report = {
  groups: outcomes.map(outcome => ({
    name: outcome.name,
    status: outcome.status,
    ...outcome.summary === undefined ? {} : outcome.summary,
    ...outcome.detail === undefined ? {} : { detail: outcome.detail },
  })),
  groupsPassed: outcomes.length - failed.length,
  groupsFailed: failed.length,
  checksPassed: totalChecks - failedChecks,
  checksFailed: failedChecks,
}
console.log(JSON.stringify(report, null, 2))
if (failed.length > 0) process.exitCode = 1
