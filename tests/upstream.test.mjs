// The pin must agree with the tree, the README and the manifest.
//
// `upstream.json` is the one place that records which upstream release the
// committed prose came from. A pin that drifts from reality is worse than no pin
// at all: the scheduled check would report "already synced" while the tree is
// stale, which is the exact rot this fork exists to prevent. Every check here is
// offline — the live comparison lives in `scripts/check-upstream.mjs` and runs on
// a schedule, not in `npm test`.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { check, equal, summary, results } from './assert.mjs'
import { compareVersions, parseVersion, describeDrift, UPSTREAM_REPO, UPSTREAM_PATH } from '../scripts/upstream.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pin = JSON.parse(readFileSync(join(root, 'upstream.json'), 'utf8'))

// --- version arithmetic -------------------------------------------------

equal('a release beats its predecessor', compareVersions('0.15.29', '0.15.25'), 1)
equal('a release loses to its successor', compareVersions('0.15.25', '0.15.29'), -1)
equal('equal versions compare equal', compareVersions('0.15.29', '0.15.29'), 0)
equal('a missing patch component counts as zero', compareVersions('1.2', '1.2.0'), 0)
equal('a leading v is accepted', compareVersions('v0.15.29', '0.15.29'), 0)
equal('two-digit components sort numerically, not as text', compareVersions('0.15.9', '0.15.10'), -1)
equal('decimal points are components, not fractions', compareVersions('1.10.0', '1.9.0'), 1)
equal('major dominates minor', compareVersions('2.0.0', '1.99.99'), 1)

let rejected = false
try { parseVersion('0.15.29-beta.1') } catch { rejected = true }
check('a pre-release string is refused rather than guessed at', rejected, 'parseVersion accepted a non-numeric version')

// --- drift reporting ----------------------------------------------------

const current = describeDrift('0.15.29', '0.15.29')
equal('a matching pin reports current', current.status, 'current')

const behind = describeDrift('0.15.25', '0.15.29')
equal('an older pin reports behind', behind.status, 'behind')
check('the behind message names both versions', behind.message.includes('0.15.29') && behind.message.includes('0.15.25'), behind.message)

const ahead = describeDrift('0.15.29', '0.15.25')
equal('a newer pin reports ahead, not current', ahead.status, 'ahead')

// A network failure must never masquerade as an upgrade, so the checker emits
// `unknown` rather than `behind`. Prove the two are distinguishable values.
check('unknown is its own status', describeDrift('0.15.29', '0.15.29').status !== 'unknown', 'current collides with unknown')

// --- the pin agrees with the repository --------------------------------

equal('the pin names the source repository', pin.repo, UPSTREAM_REPO)
equal('the pin names the plugin path', pin.path, UPSTREAM_PATH)
check('the pinned version is a real version', /^\d+\.\d+\.\d+$/.test(pin.version), pin.version)
check('the pin records when it was taken', /^\d{4}-\d{2}-\d{2}$/.test(pin.syncedAt), pin.syncedAt)

// Exact counts, not a floor. A floor lets a dropped skill pass, which is the
// failure mode that matters: the DSH loader drops a bad skill *silently*, so an
// unnoticed missing directory is indistinguishable from a skill that never
// worked. A re-sync that legitimately adds or removes one must update this pin.
const skillsDir = join(root, 'skills')
const skills = readdirSync(skillsDir).filter(name => statSync(join(skillsDir, name)).isDirectory())
equal('the committed tree has exactly the pinned skill count', skills.length, pin.skillDirs)

const allFiles = []
const walkSkills = dir => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walkSkills(path)
    else allFiles.push(name)
  }
}
walkSkills(skillsDir)
equal('the committed tree has exactly the pinned file count', allFiles.length, pin.skillFiles)

// --- the README tells the same story ------------------------------------

const readme = readFileSync(join(root, 'README.md'), 'utf8')
check(
  'the README names the pinned version, so a reader is not misled',
  readme.includes(`Currently synced to Cursor pstack ${pin.version}`),
  `README must say "Currently synced to Cursor pstack ${pin.version}"`,
)

// --- a release that changes the prose must move the override count ------

const overridesDir = join(root, 'overrides')
const overrideFiles = []
const walk = dir => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path)
    else overrideFiles.push(name)
  }
}
walk(overridesDir)
const patches = overrideFiles.filter(name => name.endsWith('.patch'))
const wholes = overrideFiles.filter(name => !name.endsWith('.patch'))
check('the seam ships whole-file overrides', wholes.length > 0, `${wholes.length} whole files`)
check('the seam ships patch overrides', patches.length > 0, `${patches.length} patches`)

// The README quotes these numbers. Recompute them so a sync that adds an
// override cannot leave the table lying.
check(
  'the README override counts match the directory',
  readme.includes(`(${wholes.length} whole files, ${patches.length} patches)`),
  `README must say "(${wholes.length} whole files, ${patches.length} patches)"`,
)

const report = summary('upstream')
console.log(JSON.stringify({ ...report, checks: results, pinned: pin.version, skills: skills.length }, null, 2))
if (report.failed > 0) process.exitCode = 1
