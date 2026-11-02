// Choosing the model a session uses. The list comes from `model.options`, and a
// pick on a session is `config.set` with key "model", as the desktop's
// use-model-controls.ts sends it. A new session gets its model in `session.create`.

import type { JsonRpcGatewayClient } from '@hermes/shared/json-rpc-gateway'

/** One model the person can choose, with the provider that serves it. */
export interface ModelChoice {
  model: string
  provider: string
}

export interface ModelProvider {
  slug: string
  name: string
  models: string[]
}

export interface ModelOptions {
  providers: ModelProvider[]
  /** What the session, or a new session, uses now. */
  current: ModelChoice | null
}

interface OptionsAnswer {
  providers?: { slug: string; name: string; models?: string[]; authenticated?: boolean | null; unavailable_models?: string[] | null }[]
  model?: string
  provider?: string
}

/**
 * The models to choose from: each signed-in provider's models, without the
 * ones it says are unavailable. `sessionId` is the Live session's id; without
 * it the answer is for a new session.
 */
export async function loadModelOptions(client: JsonRpcGatewayClient, sessionId?: string | null): Promise<ModelOptions> {
  // `explicit_only` keeps to the providers the gateway is set up for, as the desktop's menu asks.
  const answer = await client.request<OptionsAnswer>('model.options', { explicit_only: true, ...(sessionId ? { session_id: sessionId } : {}) })
  const providers = (answer.providers ?? [])
    .filter(provider => provider.authenticated !== false)
    .map(provider => {
      const unavailable = new Set(provider.unavailable_models ?? [])

      return { slug: provider.slug, name: provider.name, models: (provider.models ?? []).filter(model => !unavailable.has(model)) }
    })
    .filter(provider => provider.models.length > 0)

  return { providers, current: answer.model && answer.provider ? { model: answer.model, provider: answer.provider } : null }
}

export type ModelSwitch =
  | { kind: 'switched' }
  /** The session is running: the gateway uses the new model from its next turn. */
  | { kind: 'next-turn' }
  /** The gateway asks first, such as for an expensive model. Send again with `confirmed`. */
  | { kind: 'confirm'; message: string }

/**
 * Switches a session to another model, for this session only. The phone never
 * changes the profile's default model, as the desktop's second chat window doesn't.
 */
export async function switchSessionModel(client: JsonRpcGatewayClient, sessionId: string, choice: ModelChoice, confirmed = false): Promise<ModelSwitch> {
  const answer = await client.request<{ deferred?: boolean; confirm_required?: boolean; confirm_message?: string } | null>('config.set', {
    session_id: sessionId,
    key: 'model',
    value: `${choice.model} --provider ${choice.provider} --session`,
    ...(confirmed ? { confirm_expensive_model: true } : {})
  })

  if (answer?.confirm_required) {
    return { kind: 'confirm', message: answer.confirm_message ?? '' }
  }

  return answer?.deferred ? { kind: 'next-turn' } : { kind: 'switched' }
}
