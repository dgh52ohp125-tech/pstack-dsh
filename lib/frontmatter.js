const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

                                   
              
                     
                    
                         
                        
 

                              
                               
                 
 

function unquote(value        )         {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function parseBool(value                    , fallback         )          {
  if (value === undefined) return fallback
  const normalized = unquote(value).trim().toLowerCase()
  if (['true', 'yes', 'on', '1'].includes(normalized)) return true
  if (['false', 'no', 'off', '0'].includes(normalized)) return false
  throw new Error(`invalid boolean "${value}"`)
}

/**
 * Minimal YAML frontmatter reader for SKILL.md.
 * Official keys: name, description, whenToUse, disable-model-invocation, user-invocable.
 * `packages/skill/skill-filesystem/README.md`.
 */
export function parseSkillMarkdown(text        , fallbackName        )                          {
  if (!text.startsWith('---')) return undefined
  const end = text.indexOf('\n---', 3)
  if (end < 0) return undefined
  const raw = text.slice(4, end)
  const body = text.slice(end + 4).replace(/^\s*\n/, '')
  const fields                         = {}
  for (const line of raw.split('\n')) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (!match) continue
    fields[match[1] ] = match[2] ?? ''
  }
  let name = unquote(fields.name ?? fallbackName)
  if (name === 'Poteto Mode') name = 'poteto-mode'
  if (!NAME_RE.test(name)) return undefined
  const description = unquote(fields.description ?? '')
  if (description.length === 0) return undefined
  try {
    const disableModel = parseBool(fields['disable-model-invocation'], false)
    const userInvocable = parseBool(fields['user-invocable'], true)
    return {
      frontmatter: {
        name,
        description,
        ...fields.whenToUse ? { whenToUse: unquote(fields.whenToUse) } : {},
        modelInvocable: !disableModel,
        userInvocable,
      },
      content: body.trimStart(),
    }
  } catch {
    return undefined
  }
}


//# sourceURL=frontmatter.ts