import type { JsonRpcGatewayClient } from '@hermes/shared/json-rpc-gateway'

import { loadModelOptions, switchSessionModel } from './models-api'

const clientAnswering = (answer: unknown) => {
  const request = jest.fn(() => Promise.resolve(answer))

  return { client: { request } as unknown as JsonRpcGatewayClient, request }
}

describe('loadModelOptions', () => {
  it("lists signed-in providers' models, without unavailable ones", async () => {
    const { client, request } = clientAnswering({
      model: 'claude-sonnet-4-5',
      provider: 'anthropic',
      providers: [
        { slug: 'anthropic', name: 'Anthropic', authenticated: true, models: ['claude-sonnet-4-5'] },
        { slug: 'openrouter', name: 'OpenRouter', models: ['openai/gpt-5', 'old'], unavailable_models: ['old'] },
        { slug: 'openai', name: 'OpenAI', authenticated: false, models: ['gpt-5'] },
        { slug: 'empty', name: 'Empty', models: [] }
      ]
    })

    const options = await loadModelOptions(client, 'rt-1')

    expect(request).toHaveBeenCalledWith('model.options', { explicit_only: true, session_id: 'rt-1' })
    expect(options).toEqual({
      current: { model: 'claude-sonnet-4-5', provider: 'anthropic' },
      providers: [
        { slug: 'anthropic', name: 'Anthropic', models: ['claude-sonnet-4-5'] },
        { slug: 'openrouter', name: 'OpenRouter', models: ['openai/gpt-5'] }
      ]
    })
  })

  it('asks without a session for a new session', async () => {
    const { client, request } = clientAnswering({ providers: [] })

    await expect(loadModelOptions(client)).resolves.toEqual({ current: null, providers: [] })
    expect(request).toHaveBeenCalledWith('model.options', { explicit_only: true })
  })
})

describe('switchSessionModel', () => {
  it('switches for this session only', async () => {
    const { client, request } = clientAnswering({ ok: true })

    await expect(switchSessionModel(client, 'rt-1', { model: 'openai/gpt-5', provider: 'openrouter' })).resolves.toEqual({ kind: 'switched' })
    expect(request).toHaveBeenCalledWith('config.set', { session_id: 'rt-1', key: 'model', value: 'openai/gpt-5 --provider openrouter --session' })
  })

  it('passes on a question from the gateway, and sends the confirmed switch', async () => {
    const asked = clientAnswering({ confirm_required: true, confirm_message: 'Costs more.' })

    await expect(switchSessionModel(asked.client, 'rt-1', { model: 'big', provider: 'p' })).resolves.toEqual({ kind: 'confirm', message: 'Costs more.' })

    const confirmed = clientAnswering({ ok: true })
    await switchSessionModel(confirmed.client, 'rt-1', { model: 'big', provider: 'p' }, true)
    expect(confirmed.request).toHaveBeenCalledWith('config.set', expect.objectContaining({ confirm_expensive_model: true }))
  })

  it('says when the switch waits for the next turn', async () => {
    const { client } = clientAnswering({ ok: true, deferred: true })

    await expect(switchSessionModel(client, 'rt-1', { model: 'm', provider: 'p' })).resolves.toEqual({ kind: 'next-turn' })
  })
})
