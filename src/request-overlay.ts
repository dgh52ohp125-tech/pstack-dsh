export class RoleEffortMap {
  private readonly bySession = new Map<string, { role: string; reasoningEffort?: string; provider?: string; model?: string }>()

  remember(sessionId: string, binding: { role: string; reasoningEffort?: string; provider?: string; model?: string }): void {
    this.bySession.set(sessionId, binding)
  }

  forget(sessionId: string): void {
    this.bySession.delete(sessionId)
  }

  lookup(sessionId: string) {
    return this.bySession.get(sessionId)
  }
}

export interface CallConfig {
  provider: string
  model: string
  reasoningEffort?: string
  temperature?: number
  maxTokens?: number
  stop?: string[]
}

/**
 * Apply overlay effort/route on the child request waterfall.
 * Official home is `LlmCallConfig.reasoningEffort` (`packages/llm/llm/src/call-config.ts`),
 * not a spawn-tool field. `agent/request` is the replacement waterfall
 * (`packages/core/agent/src/runtime-types.ts`).
 */
export function applyRoleConfig(base: CallConfig, binding: { reasoningEffort?: string; provider?: string; model?: string } | undefined): CallConfig {
  if (binding === undefined) return base
  return {
    ...base,
    ...binding.provider ? { provider: binding.provider } : {},
    ...binding.model ? { model: binding.model } : {},
    ...binding.reasoningEffort ? { reasoningEffort: binding.reasoningEffort } : {},
  }
}
