                                                                 
                                               
import { buildCatalog } from './catalog.js'
import {
  parseOverlay,
  readOverlay,
  validateOverlayAgainstCatalog,
  writeOverlay,
               
} from './overlay.js'
import { resolveDshHome } from './home.js'
import { loadPersona } from './persona.js'
import { applyRoleConfig, RoleEffortMap } from './request-overlay.js'
import { resolveSpawn } from './spawn.js'
import { detectApiShape, maxDepthOf, providerAcceptsPersona, startChild, unsupportedApiMessage,                          } from './subagent-compat.js'
import { isPstackRole, normalizeRole } from './roles.js'
import {
  SPAWN_PROVIDER,
  TOOL_CATALOG,
  TOOL_OVERLAY_READ,
  TOOL_OVERLAY_WRITE,
  TOOL_SPAWN,
} from './ids.js'

                                 
              
                     
                                 
                                                                                                                  
 

                                                

                           
                          
                                          
                                    
                            
                  
                         
                        
                      
 

function textPrompt(prompt        )            {
  return [{ type: 'text', text: prompt }]
}

export function catalogTool(host          )                 {
  return {
    name: TOOL_CATALOG,
    description:
      'List live DSH LLM routes pstack may use: registered adapters with a logged-in API key, plus OAuth store routes (dsh-oauth-login, dsh-antigravity-oauth) that are already signed in. Never a vendor catalog. Secrets are omitted.',
    parameters: {},
    async execute(_args, exec) {
      return buildCatalog({
        llm: host.llm,
        credentials: host.credentials,
        settings: host.settings,
        dshHome: host.dshHome,
        env: host.env,
      }, exec.signal)
    },
  }
}

export function overlayReadTool(host          )                 {
  return {
    name: TOOL_OVERLAY_READ,
    description: 'Read $DSH_HOME/pstack-dsh.json. Missing file means inherit the parent conversation for every role.',
    parameters: {},
    async execute() {
      const current = await readOverlay(host.dshHome ?? resolveDshHome(host.env))
      return {
        path: current.path,
        missing: current.missing,
        overlay: current.overlay,
      }
    },
  }
}

export function overlayWriteTool(host          )                 {
  return {
    name: TOOL_OVERLAY_WRITE,
    description:
      'Write $DSH_HOME/pstack-dsh.json after validating every provider/model/effort against pstack_catalog. inherit-parent is stored as inherit: true with empty routes.',
    parameters: {
      overlay: {
        type: 'json',
        required: true,
        description: 'Full overlay object { version: 1, roles: { <role>: { inherit, routes } } }',
      },
    },
    async execute(args) {
      const overlay = typeof args.overlay === 'string'
        ? parseOverlay(args.overlay)
        : parseOverlay(JSON.stringify(args.overlay))
      const catalog = await buildCatalog({
        llm: host.llm,
        credentials: host.credentials,
        settings: host.settings,
        dshHome: host.dshHome,
        env: host.env,
      })
      const errors = validateOverlayAgainstCatalog(overlay, catalog.routes)
      if (errors.length > 0) {
        throw new Error(`overlay rejected against live catalog:\n${errors.join('\n')}`)
      }
      const path = await writeOverlay(overlay, host.dshHome ?? resolveDshHome(host.env))
      return { path, overlay }
    },
  }
}

export function spawnTool(host          )                 {
  return {
    name: TOOL_SPAWN,
    description:
      'Delegate a pstack role to a DSH subagent via ctx.subagents (spawn provider). Send description, prompt, role, and optional run_in_background. Do not send model, provider, reasoning_effort, thinking, isolation, or subagent_type. Route and effort come from $DSH_HOME/pstack-dsh.json when that role is mapped to a live logged-in route; otherwise the child inherits this conversation.',
    parameters: {
      description: {
        type: 'string',
        required: true,
        description: 'A short (3-5 word) description of the delegated task, for display.',
      },
      prompt: {
        type: 'string',
        required: true,
        description: 'The complete, self-contained task. The child does not see this conversation.',
      },
      role: {
        type: 'string',
        required: true,
        description: 'pstack role key (feature, how-explainer, poteto-agent, comment-sicko, …).',
      },
      run_in_background: {
        type: 'boolean',
        description: 'Default true. Continuable children return a subagent id; one-shot background returns a job-like start without waiting.',
      },
      route_index: {
        type: 'number',
        description: 'Which overlay route to use for a panel role. Default 0.',
      },
    },
    async execute(args, exec) {
      const parent = exec.agent
      if (parent === undefined) throw new Error('pstack_spawn requires a calling agent')
      const subagents = host.subagents
      if (subagents === undefined) throw new Error('pstack_spawn requires ctx.subagents')
      const role = normalizeRole(String(args.role ?? ''))
      if (role === 'how-critics') {
        return { kind: 'disabled', role, reason: 'how-critics was retired in pstack 0.15; no agent was started.' }
      }
      if (!isPstackRole(role) && role.length === 0) throw new Error('pstack_spawn role is required')
      const overlay          = (await readOverlay(host.dshHome ?? resolveDshHome(host.env))).overlay
      const resolved = resolveSpawn(overlay, {
        role,
        description: String(args.description ?? ''),
        prompt: String(args.prompt ?? ''),
        runInBackground: args.run_in_background !== false,
        routeIndex: typeof args.route_index === 'number' ? args.route_index : undefined,
      })
      if (resolved.description.trim().length === 0) throw new Error('description is required')
      if (resolved.prompt.trim().length === 0) throw new Error('prompt is required')

      const persona = await loadPersona(resolved.role)
      const providerName = host.spawnProvider ?? SPAWN_PROVIDER
      if (detectApiShape(subagents) === 'none') throw new Error(unsupportedApiMessage(subagents))
      const request                          = {
        label: resolved.description,
        prompt: textPrompt(resolved.prompt),
        parent,
        signal: exec.signal,
        ...resolved.agentOptions ? { agentOptions: resolved.agentOptions } : {},
        ...persona && providerAcceptsPersona(subagents, providerName) ? { persona } : {},
      }

      const remember = (sessionId        ) => {
        host.roles.remember(sessionId, {
          role: resolved.role,
          ...resolved.reasoningEffort ? { reasoningEffort: resolved.reasoningEffort } : {},
          ...resolved.agentOptions?.provider ? { provider: resolved.agentOptions.provider } : {},
          ...resolved.agentOptions?.model ? { model: resolved.agentOptions.model } : {},
        })
      }

      const maxDepth = maxDepthOf(subagents)
      const activation = await startChild(subagents, {
        provider: providerName,
        label: resolved.description,
        request: {
          ...request,
          ...maxDepth === undefined ? {} : { maxDepth },
        },
        signal: exec.signal,
        delivery: 'parent',
      })
      remember(activation.childId)
      if (resolved.runInBackground) {
        return { kind: 'continuable', subagentId: activation.childId, role: resolved.role, inherit: resolved.inherit }
      }
      const result = await activation.result
      await Promise.resolve(activation.dispose?.())
      return {
        kind: 'foreground',
        runId: activation.childId,
        role: resolved.role,
        inherit: resolved.inherit,
        output: result?.output ?? null,
        stopReason: result?.stopReason ?? 'completed',
      }
    },
  }
}

export function bindRequestOverlay(roles               ) {
  return (sessionId        , config                                       ) =>
    applyRoleConfig(config, roles.lookup(sessionId))
}

export const ALL_TOOLS = [catalogTool, overlayReadTool, overlayWriteTool, spawnTool]         


//# sourceURL=tools.ts