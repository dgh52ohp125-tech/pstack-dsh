import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSkillMarkdown } from './frontmatter.js'
import { SKILL_PROVIDER_NAME } from './ids.js'

const BUNDLED_SKILL_RANK = 600

export function defaultSkillsRoot()         {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'skills')
}

                       
              
                     
                    
                         
                        
                 
             
 

async function loadSkills(root        )                         {
  let entries           = []
  try {
    entries = await readdir(root)
  } catch {
    return []
  }
  const records                = []
  for (const name of entries) {
    const dir = join(root, name)
    const path = join(dir, 'SKILL.md')
    let text        
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
        source: 'bundled'         ,
        resourceBase: { kind: 'directory'         , path: skill.dir },
        rank: BUNDLED_SKILL_RANK,
        locator: skill.dir,
        path: join(skill.dir, 'SKILL.md'),
      }))
    },
    async get(candidate                                     ) {
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
        source: 'bundled'         ,
        resourceBase: { kind: 'directory'         , path: skill.dir },
        content: skill.content,
        path: join(skill.dir, 'SKILL.md'),
      }
    },
  }
}


//# sourceURL=skills-provider.ts