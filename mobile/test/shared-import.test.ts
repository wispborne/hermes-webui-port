// apps/shared is written for browsers and Node. These tests load it under the
// React Native Jest preset, so an upstream change that needs something the
// phone lacks fails here, during the upstream sync.

import * as shared from '@hermes/shared'
import { JsonRpcGatewayClient } from '@hermes/shared/json-rpc-gateway'
import { THEME_PRESET_PALETTES } from '@hermes/shared/theme-presets'

describe('@hermes/shared', () => {
  it('loads the index', () => {
    expect(shared.JsonRpcGatewayClient).toBe(JsonRpcGatewayClient)
    expect(shared.THEME_PRESET_PALETTES).toBe(THEME_PRESET_PALETTES)
  })

  it('loads the gateway client', () => {
    expect(new JsonRpcGatewayClient().connectionState).toBe('idle')
  })
})
