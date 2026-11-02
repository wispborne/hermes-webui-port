// The model picker's actions. A session on the gateway switches with
// `config.set`; a new session keeps the pick until it's created with it.

import type { SessionModel } from '@/chat/stream'
import { loadModelOptions, type ModelChoice, type ModelOptions, type ModelSwitch, switchSessionModel } from '@/gateway/models-api'

import { chatStore } from './chat'
import { $gateway } from './gateway'

/** The models the session can switch to, and the one it uses now. */
export function loadModelsFor(key: string): Promise<ModelOptions> {
  const gateway = $gateway.get()

  if (!gateway?.connection.isOpen) {
    return Promise.reject(new Error('Not connected to the gateway.'))
  }

  return loadModelOptions(gateway.connection.client, chatStore(key).get().runtimeId)
}

/**
 * Uses another model for the session. `confirmed` resends a switch the gateway
 * asked about. The model shown changes once the gateway agrees.
 */
export async function pickModel(key: string, choice: ModelChoice, confirmed = false): Promise<ModelSwitch> {
  const store = chatStore(key)
  const { runtimeId } = store.get()
  const picked: SessionModel = { model: choice.model, provider: choice.provider }

  if (!runtimeId) {
    store.set({ ...store.get(), pickedModel: picked, model: picked })

    return { kind: 'switched' }
  }

  const gateway = $gateway.get()

  if (!gateway?.connection.isOpen) {
    throw new Error('Not connected to the gateway.')
  }

  const result = await switchSessionModel(gateway.connection.client, runtimeId, choice, confirmed)

  if (result.kind !== 'confirm') {
    store.set({ ...store.get(), model: picked })
  }

  return result
}

/** Fills in the model a session uses when the phone doesn't know it yet, such as for a new session. */
export async function learnSessionModel(key: string) {
  const store = chatStore(key)

  if (store.get().model) {
    return
  }

  const { current } = await loadModelsFor(key)

  if (current && !store.get().model) {
    store.set({ ...store.get(), model: current })
  }
}
