/**
 * pstack-dsh: DeepSeek Harness port of official pstack.
 * Function/namespace plugin: named apply, no default export.
 */

                                                  
                                            
                                                     
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
                                            
import { defineTool } from '@deepseek-ai/dsh-tools'
import { snapshotJsonValue,                } from '@deepseek-ai/dsh-util-values'
import { PLUGIN_ID, SPAWN_PROVIDER } from './ids.js'
import { Config,                             } from './plugin-config.js'
import { createSkillProvider } from './skills-provider.js'
import { RoleEffortMap } from './request-overlay.js'
import {
  catalogTool,
  overlayReadTool,
  overlayWriteTool,
  spawnTool,
                
} from './tools.js'
import { registerPstackSettingsRoutes } from './settings-routes.js'

export const name = PLUGIN_ID
export const inject = ['tools', 'skills']
export { Config }
                                          

const JSON_OUTPUT = {
  schema: { type: 'json'          },
  render: (_args         , value           ) => [{ type: 'text'         , text: JSON.stringify(value, null, 2) }],
}

function asHost(ctx         , config                          , roles               )           {
  return {
    get llm() { return ctx.get('llm')                    },
    get credentials() { return ctx.get('credentials')                            },
    get settings() { return ctx.get('settings')                         },
    get subagents() { return ctx.get('subagents')                          },
    spawnProvider: config?.spawnProvider ?? SPAWN_PROVIDER,
    roles,
  }
}

function registerOne(ctx         , tool                                )       {
  ctx.tools.register(defineTool({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    output: JSON_OUTPUT,
    async execute(args                         , exec                                                  )                     {
      const snapshot = snapshotJsonValue(await tool.execute(args, exec))
      if (snapshot === undefined) throw new TypeError(`pstack tool ${tool.name} returned a non-JSON value`)
      return snapshot             
    },
  }))
}

export function apply(ctx         , config               )       {
  console.log('[my-plugins/pstack-dsh] loaded')
  const roles = new RoleEffortMap()
  const host = asHost(ctx, config, roles)
  registerOne(ctx, catalogTool(host))
  registerOne(ctx, overlayReadTool(host))
  registerOne(ctx, overlayWriteTool(host))
  registerOne(ctx, spawnTool(host))
  ctx.skills.registerProvider(() => createSkillProvider())
  ctx.inject(['webServer', 'connection'], webCtx => {
    registerPstackSettingsRoutes(webCtx, host)
  })

  ctx.on('agent/request', async (payload, next) => {
    const base = await next()
    const binding = roles.lookup(payload.agent.id)
    if (binding === undefined) return base
    return {
      ...base,
      ...binding.provider ? { provider: binding.provider } : {},
      ...binding.model ? { model: binding.model } : {},
      ...binding.reasoningEffort ? { reasoningEffort: ReasoningEffortId(binding.reasoningEffort) } : {},
    }
  })
}


//# sourceURL=index.ts