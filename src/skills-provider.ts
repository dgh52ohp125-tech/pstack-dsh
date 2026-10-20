import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSkillMarkdown } from './frontmatter.ts'
import { SKILL_PROVIDER_NAME } from './ids.ts'

const BUNDLED_SKILL_RANK = 600

export function defaultSkillsRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'skills')
}

interface SkillRecord {
  name: string
  description: string
  whenToUse?: string
  modelInvocable: boolean
  userInvocable: boolean
  content: string
  dir: string
}

async function loadSkills(root: string): Promise<SkillRecord[]> {
  let entries: string[] = []
  try {
    entries = await readdir(root)
  } catch {
    return []
  }
  const records: SkillRecord[] = []
  for (const name of entries) {
    const dir = join(root, name)
    const path = join(dir, 'SKILL.md')
    let text: string
    try {
      text = await readFile(path, 'utf8')
    } catch {
      continue
    }
    const parsed = parseSkillMarkdown(text, name)
    if (parsed === undefined) continue
    records.push({
      name: parsed.frontmatter.name,
      description: parsed.frontmatter.description,
      ...parsed.frontmatter.whenToUse === undefined ? {} : { whenToUse: parsed.frontmatter.whenToUse },
      modelInvocable: parsed.frontmatter.modelInvocable,
      userInvocable: parsed.frontmatter.userInvocable,
      content: parsed.content,
      dir,
    })
  }
  return records.sort((a, b) => a.name.localeCompare(b.name))
}

export function createSkillProvider(skillsRoot = defaultSkillsRoot()) {
  return {
    name: SKILL_PROVIDER_NAME,
    async list() {
      const skills = await loadSkills(skillsRoot)
      return skills.map(skill => ({
        name: skill.name,
        description: skill.description,
        ...skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse },
        invocation: {
          modelInvocable: skill.modelInvocable,
          userInvocable: skill.userInvocable,
        },
        provider: SKILL_PROVIDER_NAME,
        source: 'bundled' as const,
        resourceBase: { kind: 'directory' as const, path: skill.dir },
        rank: BUNDLED_SKILL_RANK,
        locator: skill.dir,
        path: join(skill.dir, 'SKILL.md'),
      }))
    },
    async get(candidate: { name: string; locator?: unknown }) {
      const skills = await loadSkills(skillsRoot)
      const skill = skills.find(entry => entry.name === candidate.name)
      if (skill === undefined) return undefined
      return {
        name: skill.name,
        description: skill.description,
        ...skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse },
        invocation: {
          modelInvocable: skill.modelInvocable,
          userInvocable: skill.userInvocable,
        },
        provider: SKILL_PROVIDER_NAME,
        source: 'bundled' as const,
        resourceBase: { kind: 'directory' as const, path: skill.dir },
        content: skill.content,
        path: join(skill.dir, 'SKILL.md'),
      }
    },
  }
}
