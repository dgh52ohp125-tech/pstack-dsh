// deploy.mjs — install this fork's build into the DSH profile plugin directory.
//
// Bare `@deepseek-ai/*` specifiers resolve only from inside the profile's
// node_modules, so the plugin cannot be run from this repo directly. Deploy
// copies the built host sources and the untouched client bundle over the
// installed plugin, after backing up whatever was there.
//
//   node scripts/deploy.mjs [--dry-run]
//
// Lives beside build.mjs; reads PROFILE_PLUGIN or uses the default profile.

import { readFileSync, writeFileSync, copyFileSync, mkdirSync, rmSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const target = process.env.PROFILE_PLUGIN
  ?? join(homedir(), '.dsh', 'profiles', 'desktop', 'node_modules', 'pstack-dsh')
const dryRun = process.argv.includes('--dry-run')

/** Recursively copy a directory tree. */
function copyTree(from, to) {
  mkdirSync(to, { recursive: true })
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const source = join(from, entry.name)
    const destination = join(to, entry.name)
    if (entry.isDirectory()) copyTree(source, destination)
    else copyFileSync(source, destination)
  }
}

/** Count files in a tree, for the deploy report. */
function countFiles(dir) {
  let total = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) total += countFiles(join(dir, entry.name))
    else total += 1
  }
  return total
}

if (!existsSync(target)) {
  console.error(`deploy: target plugin directory not found: ${target}`)
  process.exit(1)
}

const libDir = join(root, 'lib')
if (!existsSync(libDir)) {
  console.error('deploy: lib/ is missing — run `node scripts/build.mjs` first')
  process.exit(1)
}

const built = readdirSync(libDir).filter(name => name.endsWith('.js'))
if (built.length === 0) {
  console.error('deploy: lib/ holds no JavaScript to deploy')
  process.exit(1)
}

// Keep the plugin's own package metadata pointed at the deployed entry.
// A fork build must keep the same entry and bundle contract as upstream, or the
// loader stops treating the package as a profile layer.
const pkgPath = join(target, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
const forkPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
if (forkPkg.exports?.['.']?.default !== './lib/index.js') {
  console.error(`deploy: fork entry ${String(forkPkg.exports?.['.']?.default)} is not ./lib/index.js; refusing to deploy`)
  process.exit(1)
}
if (forkPkg.dsh?.bundle?.patch === undefined) {
  console.error('deploy: fork package.json declares no dsh.bundle.patch; the loader would treat it as a plain dependency')
  process.exit(1)
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const backup = join(target, 'lib.backup-' + stamp)

if (dryRun) {
  console.log(JSON.stringify({ dryRun: true, target, wouldCopy: built, backup }, null, 2))
  process.exit(0)
}

mkdirSync(backup, { recursive: true })
for (const name of readdirSync(join(target, 'lib'))) {
  const source = join(target, 'lib', name)
  try { copyFileSync(source, join(backup, name)) } catch { /* directory or unreadable: skip */ }
}

// A stale per-file module from an earlier deploy would shadow nothing, but a
// remaining bundled index.js would. Clear the host bundle, keep client assets.
for (const name of readdirSync(join(target, 'lib'))) {
  if (name === 'client.js' || name === 'client.js.map' || name.startsWith('client.')) continue
  rmSync(join(target, 'lib', name), { recursive: true, force: true })
}

for (const name of built) {
  copyFileSync(join(libDir, name), join(target, 'lib', name))
}

// Mirror host sources so the deployed tree stays auditable.
const srcTarget = join(target, 'src')
const srcSource = join(root, 'src')
if (existsSync(srcSource)) {
  mkdirSync(srcTarget, { recursive: true })
  for (const name of readdirSync(srcSource)) {
    if (!name.endsWith('.ts')) continue
    copyFileSync(join(srcSource, name), join(srcTarget, name))
  }
}

// Skills, agents and the seam overrides ship alongside: a re-sync from this
// repo must reproduce byte-for-byte what is deployed, so they travel together.
//
// `skills/` is only replaced when the source tree is actually populated. A fork
// checkout that has not been synced yet (no upstream available offline) would
// otherwise wipe a perfectly good installed skills tree — which is a data-loss
// bug, not a deploy.
for (const dirName of ['skills', 'agents', 'overrides']) {
  const from = join(root, dirName)
  if (!existsSync(from)) continue
  if (dirName === 'skills' && countFiles(from) === 0) {
    console.warn(`deploy: ${from} is empty — leaving the deployed skills tree untouched. Run \`python sync-skills.py --upstream <dir> --dest skills\` first.`)
    continue
  }
  const to = join(target, dirName)
  if (countFiles(to) > countFiles(from)) {
    console.warn(`deploy: refusing to shrink ${to} (${countFiles(to)} files) from ${from} (${countFiles(from)} files)`)
    continue
  }
  rmSync(to, { recursive: true, force: true })
  copyTree(from, to)
}

// The bundle manifest is what makes this a profile layer rather than a plain
// dependency, so it has to be present in the deployed tree too.
for (const name of ['cordis.patch.yml', 'cordis.yml']) {
  if (existsSync(join(root, name))) copyFileSync(join(root, name), join(target, name))
}

// Skills and agents ship separately: `node sync-skills.py --upstream <dir>`.
const report = {
  target,
  backup,
  deployedHostModules: built.length,
  clientPreserved: existsSync(join(target, 'lib', 'client.js')),
  skills: existsSync(join(target, 'skills')) ? readdirSync(join(target, 'skills')).length : 0,
  overrides: existsSync(join(target, 'overrides')) ? countFiles(join(target, 'overrides')) : 0,
  written: stamp,
}
console.log(JSON.stringify(report, null, 2))
