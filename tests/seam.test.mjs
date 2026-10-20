// A re-sync must reproduce the installed skills tree exactly.
//
// This is the property that makes upstream updates cheap. If upstream releases
// pstack 0.16, the maintenance move is: point `--upstream` at the new tree, run
// sync-skills.py, done. The DSH seam lives in overrides/ and is replayed. The
// moment a hand edit exists that overrides/ does not describe, that move
// silently loses work — which is how the previous fork ended up 64 commits
// behind. So the test is: sync from upstream into a temp dir and compare it to
// what is installed, byte for byte.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { pluginDir } from './plugin.mjs'
import { check, equal, summary, results } from './assert.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const upstream = process.env.PSTACK_UPSTREAM
  ?? 'C:/Users/User/Desktop/nothing2/scratch/open-pstack/plugins/pstack/skills'
const installed = join(pluginDir, 'skills')

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

// The re-sync itself.
if (!existsSync(upstream)) {
  check('upstream tree is available for the re-sync check', false, `missing ${upstream}`)
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
    const live = walk(installed)
    const onlyFresh = Object.keys(fresh).filter(rel => !(rel in live))
    const onlyLive = Object.keys(live).filter(rel => !(rel in fresh))
    const differing = Object.keys(fresh).filter(rel => rel in live && !fresh[rel].equals(live[rel]))

    equal('re-sync produces no extra files', onlyFresh.length, 0)
    if (onlyFresh.length > 0) check('extra files', false, onlyFresh.slice(0, 8).join(', '))
    equal('re-sync produces no missing files', onlyLive.length, 0)
    if (onlyLive.length > 0) check('missing files', false, onlyLive.slice(0, 8).join(', '))
    equal('re-sync reproduces every file byte-for-byte', differing.length, 0)
    if (differing.length > 0) check('differing files', false, differing.slice(0, 8).join(', '))
    check('the synced tree is not trivially empty', Object.keys(fresh).length > 100, `${Object.keys(fresh).length} files`)
  }
  rmSync(temp, { recursive: true, force: true })
}

const report = summary('seam')
console.log(JSON.stringify({ ...report, checks: results, overrides: overrides.length }, null, 2))
if (report.failed > 0) process.exitCode = 1
