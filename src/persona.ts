import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeRole } from './roles.ts'

export function defaultAgentsRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'agents')
}

function stripFrontmatter(text: string): string {
  if (!text.startsWith('---')) return text
  const end = text.indexOf('\n---', 3)
  if (end < 0) return text
  return text.slice(end + 4).replace(/^\s*\n/, '')
}

/**
 * Persona for a pstack role. Official spawn persona shadows deployment persona
 * (`SubagentStartRequest.persona`, `packages/subagent/subagent/src/types.ts`).
 */
export async function loadPersona(role: string, agentsRoot = defaultAgentsRoot()): Promise<string | undefined> {
  const key = normalizeRole(role)
  const files = key === 'comment-sicko'
    ? ['comment-sicko.md']
    : key === 'poteto-agent'
      ? ['poteto-agent.md']
      : [`${key}.md`, 'poteto-agent.md']
  for (const file of files) {
    try {
      const text = await readFile(join(agentsRoot, file), 'utf8')
      const body = stripFrontmatter(text).trim()
      if (body.length > 0) return body
    } catch {
      continue
    }
  }
  return undefined
}
