/**
 * Harness subagent-API compatibility.
 *
 * pstack_spawn has to start a child on the host's `subagents` service. That
 * service has changed shape across harness releases: `start()` and
 * `startContinuable()` existed in some builds, `startActivation()` in others.
 * Rather than pin a harness version or re-patch this file on every upgrade,
 * probe for the method that is actually present and adapt the result into one
 * shape the rest of the plugin understands.
 *
 * Adding a future API means adding one probe here, not touching tools.ts.
 */

                                   
                          
                                                                     
                                               
 

                            
                           
                        
                                           
                               
                             
 

/** The service surface this plugin needs, all optional: presence is the probe. */
                                      
                                                                                                                
                                        
                                                                            
                                                              
                                                             
                                                                                                                                                                          
                                                                                   
                                                                           
                                                              
                                                                                                                      
 

                                                                                                 

const PROBE_ORDER                                       = ['startActivation', 'start', 'startContinuable', 'startOneShot']

/** Which start method this harness actually exposes. */
export function detectApiShape(service                                 )           {
  if (service === undefined) return 'none'
  for (const shape of PROBE_ORDER) {
    if (typeof service[shape] === 'function') return shape
  }
  return 'none'
}

/** A message that names what the harness offers, so a future drift is diagnosable. */
export function unsupportedApiMessage(service                                 )         {
  const seen = service === undefined
    ? '(ctx.subagents is absent)'
    : `(ctx.subagents exposes: ${Object.keys(service).filter(key => typeof (service                           )[key] === 'function').join(', ') || 'no functions'})`
  return `pstack_spawn found no supported subagent start method ${seen}. Supported: ${PROBE_ORDER.join(', ')}. Add a probe in src/subagent-compat.ts for this harness version.`
}

function toId(candidate         )                     {
  if (typeof candidate === 'string' && candidate.length > 0) return candidate
  return undefined
}

/**
 * Start one child through whichever API exists, normalised to ActivationResult.
 *
 * `startContinuable` starts a child that reports asynchronously and has no
 * completion promise, so its `result` never settles by value: callers that
 * await it must treat the child as running in the background.
 */
export async function startChild(service                     , spec           )                            {
  const shape = detectApiShape(service)
  switch (shape) {
    case 'startActivation': {
      const activation = await service.startActivation (spec)
      const childId = toId(activation?.childId)
      if (childId === undefined) throw new Error('pstack_spawn: startActivation returned no childId')
      return { childId, result: activation.result, ...activation.dispose === undefined ? {} : { dispose: activation.dispose } }
    }
    case 'start': {
      const run = await service.start (spec)
      const childId = toId(run?.childId) ?? toId(run?.runId)
      if (childId === undefined) throw new Error('pstack_spawn: start returned no childId or runId')
      return { childId, result: run.result, ...run.dispose === undefined ? {} : { dispose: run.dispose } }
    }
    case 'startContinuable': {
      const started = await service.startContinuable (spec)
      const childId = toId(started) ?? toId((started                         )?.childId)
      if (childId === undefined) throw new Error('pstack_spawn: startContinuable returned no childId')
      return { childId, result: new Promise(() => {}) }
    }
    case 'startOneShot': {
      const outcome = await service.startOneShot (spec)
      const childId = toId(outcome?.childId) ?? toId(outcome?.runId) ?? 'one-shot'
      return { childId, result: Promise.resolve({ output: outcome?.output, stopReason: outcome?.stopReason }) }
    }
    default:
      throw new Error(unsupportedApiMessage(service))
  }
}

/** Maximum nesting depth the harness allows, when it publishes one. */
export function maxDepthOf(service                                 )                     {
  if (typeof service?.resolveMaxDepth !== 'function') return undefined
  try {
    const depth = service.resolveMaxDepth()
    return typeof depth === 'number' ? depth : undefined
  } catch {
    return undefined
  }
}

/** Whether the spawn provider accepts a persona field. Unknown counts as yes. */
export function providerAcceptsPersona(service                                 , providerName        )          {
  try {
    const provider = service?.getProvider?.(providerName)
    if (provider === undefined) return true
    return provider.capabilities?.persona !== false
  } catch {
    return true
  }
}


//# sourceURL=subagent-compat.ts