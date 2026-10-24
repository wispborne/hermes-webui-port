import { fireEvent, render, screen } from '@testing-library/react-native'
import { PaperProvider } from 'react-native-paper'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { BUILT_FOR_HERMES_VERSION } from '@/gateway/built-for-version'
import { hermesTheme } from '@/theme/theme'

import { GatewayCheckScreen } from './gateway-check-screen'

jest.mock('@/storage/database', () => ({ openGatewayDatabase: jest.fn(async () => ({})) }))

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>()

beforeEach(() => {
  fetchMock.mockReset()
  global.fetch = fetchMock as unknown as typeof fetch
})

const gatewayAnswers = (version: string) =>
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ version }), { status: 200 }))

const metrics = { frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }

async function checkUrl(url: string) {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <PaperProvider theme={hermesTheme('light')}>
        <GatewayCheckScreen />
      </PaperProvider>
    </SafeAreaProvider>
  )
  await fireEvent.changeText(screen.getByTestId('gateway-url'), url)
  await fireEvent.press(screen.getByText('Check'))
}

describe('GatewayCheckScreen', () => {
  it('shows the version, with no banner when it matches the build', async () => {
    gatewayAnswers(BUILT_FOR_HERMES_VERSION)
    await checkUrl('https://hermes-dashboard.wispborne.com')

    expect(await screen.findByText(`Hermes ${BUILT_FOR_HERMES_VERSION}`)).toBeOnTheScreen()
    expect(screen.queryByText(/^Built for Hermes/)).toBeNull()
  })

  it('shows the version banner when the gateway runs another version', async () => {
    gatewayAnswers('99.0.0')
    await checkUrl('https://hermes-dashboard.wispborne.com')

    expect(await screen.findByText('Hermes 99.0.0')).toBeOnTheScreen()
    expect(screen.getByText(`Built for Hermes ${BUILT_FOR_HERMES_VERSION}. The gateway runs 99.0.0.`)).toBeOnTheScreen()
  })

  it('says when the address is not a Hermes gateway', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html></html>', { status: 200 }))
    await checkUrl('https://example.com')

    expect(await screen.findByText('This address is not a Hermes gateway.')).toBeOnTheScreen()
  })

  it('mentions Tailscale when the gateway is unreachable, and retries', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'))
    await checkUrl('https://hermes-dashboard.wispborne.com')

    expect(await screen.findByText("Can't reach the gateway. Is Tailscale connected?")).toBeOnTheScreen()

    gatewayAnswers(BUILT_FOR_HERMES_VERSION)
    await fireEvent.press(screen.getByText('Retry'))

    expect(await screen.findByText(`Hermes ${BUILT_FOR_HERMES_VERSION}`)).toBeOnTheScreen()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
