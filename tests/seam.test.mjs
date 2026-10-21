// A re-sync must reproduce the committed skills tree exactly.
//
// This is the property that makes upstream updates cheap. If upstream releases
// pstack 0.16, the maintenance move is: point `--upstream` at the new tree, run
// sync-skills.py, done. The DSH seam lives in overrides/ and is replayed. The
// moment a hand edit exists that overrides/ does not describe, that move
// silently loses work — which is how the previous fork ended up 64 commits
// behind. So the test is: sync from upstream into a temp dir and compare it to
// what is committed, byte for byte.
//
// The upstream tree is not vendored, so on a machine that has no copy of it this
// check cannot run. It reports a skip rather than pretending to pass.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { check, equal, skip, summary, results } from './assert.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const upstream = process.env.PSTACK_UPSTREAM
  ?? join(root, 'upstream', 'skills')

function walk(dir) {
  const files = {}
  if (!existsSync(dir)) return files
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      for (const [rel, hash] of Object.entries(walk(full))) files[`${entry}/${rel}`] = hash
    } else {
      files[entry] = readFileSync(full)
    }
  }
  return files
}

// overrides/ must exist and describe the seam, or a re-sync is lossy.
const overridesDir = join(root, 'overrides')
check('overrides/ exists', existsSync(overridesDir), overridesDir)
const overrides = existsSync(overridesDir) ? Object.keys(walk(overridesDir)) : []
check('overrides/ describes the seam', overrides.length >= 12, `${overrides.length} override files`)
check('the DSH reference is captured as an override', overrides.some(rel => rel.endsWith('dsh-tools.md')), overrides.join(','))

// skills/ is committed, because the harness loads skills from `<plugin>/skills`
// and a clone without them installs a plugin that answers nothing. That is a
// packaging property, so assert it on the repo tree itself, not the deployed one
// — the deployed copy would hide a missing directory in git.
const repoSkills = walk(join(root, 'skills'))
check('the repo ships a skills tree, so a clone can answer', Object.keys(repoSkills).length > 100, `${Object.keys(repoSkills).length} files`)
check('a spot-check skill is present', 'poteto-mode/SKILL.md' in repoSkills, Object.keys(repoSkills).slice(0, 3).join(', '))

// The re-sync itself. It compares the committed tree to what upstream produces,
// so it is the guard that replaces "keep skills/ out of git": a hand edit to a
// mirrored skill now fails here instead of being uncommittable. It needs the
// upstream tree, which is not vendored — a clone on another machine must still
// be able to run the suite, so an absent upstream is a SKIP with a reason.
//
// `check(..., false, ...)` was wrong here: it recorded a real failure, so every
// fresh clone reported `seam: fail` and a first-time reader was greeted by a red
// suite over a check that had deliberately not run. A skip is its own outcome.
if (!existsSync(upstream)) {
  skip('upstream tree is available for the re-sync check', `missing ${upstream} — set PSTACK_UPSTREAM to a pstack skills tree to enable this check`)
} else {
  const temp = mkdtempSync(join(tmpdir(), 'pstack-resync-'))
  const dest = join(temp, 'skills')
  const run = spawnSync('python', [join(root, 'sync-skills.py'), '--upstream', upstream, '--dest', dest], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
  equal('a clean re-sync succeeds', run.status, 0)
  if (run.status !== 0) {
    check('re-sync output', false, (run.stderr || run.stdout || '').trim().split('\n').slice(-6).join(' | '))
  } else {
    check('re-sync leaves validation clean', run.stdout.includes('validation            = clean'), run.stdout.trim().split('\n').slice(-2).join(' | '))

    const fresh = walk(dest)
    // Compare against the committed tree, not the deployed one: the committed
    // tree is what a clone installs, so it is the thing that must be reproducible.
    const committed = repoSkills
    const onlyFresh = Object.keys(fresh).filter(rel => !(rel in committed))
    const onlyCommitted = Object.keys(committed).filter(rel => !(rel in fresh))
    const differing = Object.keys(fresh).filter(rel => rel in committed && !fresh[rel].equals(committed[rel]))

    equal('re-sync produces no extra files', onlyFresh.length, 0)
    if (onlyFresh.length > 0) check('extra files', false, onlyFresh.slice(0, 8).join(', '))
    equal('re-sync produces no missing files', onlyCommitted.length, 0)
    if (onlyCommitted.length > 0) check('missing files', false, onlyCommitted.slice(0, 8).join(', '))
    equal('re-sync reproduces every committed file byte-for-byte', differing.length, 0)
    if (differing.length > 0) check('differing files', false, differing.slice(0, 8).join(', '))
    check('the synced tree is not trivially empty', Object.keys(fresh).length > 100, `${Object.keys(fresh).length} files`)
  }
  rmSync(temp, { recursive: true, force: true })
}

const report = summary('seam')
console.log(JSON.stringify({ ...report, checks: results, overrides: overrides.length }, null, 2))
if (report.failed > 0) process.exitCode = 1
