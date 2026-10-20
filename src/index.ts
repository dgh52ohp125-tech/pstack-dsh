/**
 * pstack-dsh: DeepSeek Harness port of official pstack.
 * Function/namespace plugin: named apply, no default export.
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-skill'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { snapshotJsonValue, type JsonValue } from '@deepseek-ai/dsh-util-values'
import { PLUGIN_ID, SPAWN_PROVIDER } from './ids.ts'
import { Config, type Config as PluginConfig } from './plugin-config.ts'
import { createSkillProvider } from './skills-provider.ts'
import { RoleEffortMap } from './request-overlay.ts'
import {
  catalogTool,
  overlayReadTool,
  overlayWriteTool,
  spawnTool,
  type ToolHost,
} from './tools.ts'
import { registerPstackSettingsRoutes } from './settings-routes.ts'

export const name = PLUGIN_ID
export const inject = ['tools', 'skills']
export { Config }
export type { PluginConfig as ConfigType }

const JSON_OUTPUT = {
  schema: { type: 'json' as const },
  render: (_args: unknown, value: JsonValue) => [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
}

function asHost(ctx: Context, config: PluginConfig | undefined, roles: RoleEffortMap): ToolHost {
  return {
    get llm() { return ctx.get('llm') as ToolHost['llm'] },
    get credentials() { return ctx.get('credentials') as ToolHost['credentials'] },
    get settings() { return ctx.get('settings') as ToolHost['settings'] },
    get subagents() { return ctx.get('subagents') as ToolHost['subagents'] },
    spawnProvider: config?.spawnProvider ?? SPAWN_PROVIDER,
    roles,
  }
}

function registerOne(ctx: Context, tool: ReturnType<typeof catalogTool>): void {
  ctx.tools.register(defineTool({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    output: JSON_OUTPUT,
    async execute(args: Record<string, unknown>, exec: { signal?: AbortSignal; agent?: { id: string } }): Promise<JsonValue> {
      const snapshot = snapshotJsonValue(await tool.execute(args, exec))
      if (snapshot === undefined) throw new TypeError(`pstack tool ${tool.name} returned a non-JSON value`)
      return snapshot as JsonValue
    },
  }))
}

export function apply(ctx: Context, config?: PluginConfig): void {
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
