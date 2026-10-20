// The skills tree the plugin ships must be one the DSH loader accepts.
//
// A skill whose frontmatter or name does not match the loader's pattern is
// dropped *silently*: it simply never appears in the tool catalog, which is
// indistinguishable from "nothing is installed". These checks turn that silence
// into a test failure.
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { pluginDir } from './plugin.mjs'
import { check, equal, summary, results } from './assert.mjs'

const skillsDir = join(pluginDir, 'skills')
const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

equal('skills directory exists', existsSync(skillsDir), true)

const skills = existsSync(skillsDir)
  ? readdirSync(skillsDir).filter(name => statSync(join(skillsDir, name)).isDirectory()).sort()
  : []

// The upstream release this tree was synced from ships 63 skills. Fewer means a
// skill was dropped by the loader or never copied.
check('a substantial skill set is installed', skills.length >= 60, `${skills.length} skills`)

const problems = []
const invocable = []
for (const skill of skills) {
  const file = join(skillsDir, skill, 'SKILL.md')
  if (!existsSync(file)) {
    problems.push(`${skill}: no SKILL.md`)
    continue
  }
  const raw = readFileSync(file)
  // A CR anywhere means the loader's frontmatter split admits a trailing \r,
  // which fails the name pattern and drops the skill.
  if (raw.includes(0x0d)) {
    problems.push(`${skill}: contains CR`)
    continue
  }
  const text = raw.toString('utf8')
  if (!text.startsWith('---')) {
    problems.push(`${skill}: no frontmatter`)
    continue
  }
  const end = text.indexOf('\n---', 3)
  if (end < 0) {
    problems.push(`${skill}: unterminated frontmatter`)
    continue
  }
  const fields = {}
  for (const line of text.slice(4, end).split('\n')) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (match !== null) fields[match[1]] = match[2]
  }
  const name = (fields.name ?? '').trim().replace(/^["']|["']$/g, '')
  if (!NAME_RE.test(name)) problems.push(`${skill}: name ${JSON.stringify(name)} fails the loader pattern`)
  if ((fields.description ?? '').trim().length === 0) problems.push(`${skill}: empty description`)
  if (fields['disable-model-invocation'] !== 'true') invocable.push(skill)
}

equal('every installed skill is loadable', problems.length, 0)
if (problems.length > 0) check('skill problems', false, problems.join(' | '))

// Skills may legitimately block model invocation, but the bulk must be callable.
check('most skills are model-invocable', invocable.length >= skills.length - 10, `${invocable.length}/${skills.length} invocable`)

// The DSH reference file the seam depends on must be present and non-trivial.
const seam = join(skillsDir, 'poteto-mode', 'references', 'dsh-tools.md')
check('the DSH tool reference exists', existsSync(seam), seam)
if (existsSync(seam)) {
  const body = readFileSync(seam, 'utf8')
  check('the DSH reference is substantive', body.length > 1500, `${body.length} bytes`)
  check('the DSH reference names pstack_spawn', body.includes('pstack_spawn'), 'missing pstack_spawn')
}

// Agents the personas come from.
const agentsDir = join(pluginDir, 'agents')
const agents = existsSync(agentsDir) ? readdirSync(agentsDir).filter(n => n.endsWith('.md')) : []
check('agent personas are installed', agents.length >= 2, `${agents.length} agents`)

const report = summary('skills')
console.log(JSON.stringify({ ...report, checks: results, skills: skills.length, agents: agents.length }, null, 2))
if (report.failed > 0) process.exitCode = 1
