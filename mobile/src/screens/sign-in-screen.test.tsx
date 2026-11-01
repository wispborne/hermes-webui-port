import { fireEvent, render, screen } from '@testing-library/react-native'
import { PaperProvider } from 'react-native-paper'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { BUILT_FOR_HERMES_VERSION } from '@/gateway/built-for-version'
import { memorySettingsStore, setSettingsStoreForTests } from '@/storage/app-settings'
import { loadPassword, savePassword, setPasswordStoreForTests } from '@/storage/saved-password'
import { $auth, $gateway, setGatewayDepsForTests } from '@/store/gateway'
import { hermesTheme } from '@/theme/theme'

import { FakeRest } from '../../test/fake-rest'
import { memoryDatabase } from '../../test/memory-database'
import { memoryPasswordStore } from '../../test/memory-password-store'
import { SignInScreen } from './sign-in-screen'

jest.mock('../../modules/hermes-background', () => ({ flushCookies: jest.fn(), clearCookies: jest.fn() }))

let rest: FakeRest
let passwords: ReturnType<typeof memoryPasswordStore>

beforeEach(() => {
  passwords = memoryPasswordStore()
  setPasswordStoreForTests(passwords)
  rest = new FakeRest()
  rest.version = BUILT_FOR_HERMES_VERSION
  global.fetch = rest.fetch as typeof fetch
  setSettingsStoreForTests(memorySettingsStore())
  setGatewayDepsForTests({
    fetchFn: rest.fetch,
    // No WebSocket in these tests: the socket never opens.
    socketFactory: () => ({ addEventListener() {}, removeEventListener() {}, close() {}, readyState: 0 }) as unknown as WebSocket,
    openDatabase: async () => memoryDatabase(),
    deleteDatabase: async () => undefined
  })
  $auth.set({ phase: 'signed-out', url: 'https://hermes.test', username: 'david' })
})

afterEach(() => {
  $gateway.get()?.connection.stop()
  $gateway.set(null)
})

const metrics = { frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }

async function show() {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <PaperProvider theme={hermesTheme('light')}>
        <SignInScreen />
      </PaperProvider>
    </SafeAreaProvider>
  )
}

async function signInWith(password: string) {
  await show()
  await fireEvent.changeText(screen.getByTestId('password'), password)
  await fireEvent.press(screen.getByTestId('sign-in'))
}

describe('SignInScreen', () => {
  it('fills in the saved URL and username', async () => {
    await show()

    expect(screen.getByTestId('gateway-url').props.value).toBe('https://hermes.test')
    expect(screen.getByTestId('username').props.value).toBe('david')
    expect(screen.getByTestId('password').props.value).toBe('')
  })

  it('says the password is wrong and stays on Sign in', async () => {
    await signInWith('nope')

    expect(await screen.findByText('The username or password is wrong.')).toBeOnTheScreen()
    expect($auth.get().phase).toBe('signed-out')
  })

  it('signs in with the right password', async () => {
    await signInWith('right-password')

    await screen.findByText(`Hermes ${BUILT_FOR_HERMES_VERSION}`)
    expect($auth.get()).toEqual({ phase: 'signed-in', url: 'https://hermes.test', username: 'david' })
  })

  it('mentions Tailscale when the gateway is unreachable', async () => {
    rest.reachable = false
    await signInWith('right-password')

    expect(await screen.findByText("Can't reach the gateway. Is Tailscale connected?")).toBeOnTheScreen()
  })

  it('checks the saved gateway as it opens and shows its version under the URL', async () => {
    await show()

    expect(await screen.findByText(`Hermes ${BUILT_FOR_HERMES_VERSION}`)).toBeOnTheScreen()
    expect(screen.getByTestId('gateway-found')).toBeOnTheScreen()
  })

  it('offers a retry in the URL field when the gateway is unreachable, and checks again', async () => {
    rest.reachable = false
    await show()
    const retry = await screen.findByTestId('gateway-retry')

    rest.reachable = true
    await fireEvent.press(retry)

    expect(await screen.findByTestId('gateway-found')).toBeOnTheScreen()
  })

  it('remembers the password unless the switch is turned off', async () => {
    await signInWith('right-password')
    await screen.findByText(`Hermes ${BUILT_FOR_HERMES_VERSION}`)

    expect(await loadPassword('https://hermes.test', 'david')).toBe('right-password')
  })

  it('forgets the password when the switch is off', async () => {
    await savePassword('https://hermes.test', 'david', 'right-password')
    await show()
    await fireEvent(screen.getByTestId('remember-password'), 'valueChange', false)
    await fireEvent.changeText(screen.getByTestId('password'), 'right-password')
    await fireEvent.press(screen.getByTestId('sign-in'))

    await screen.findByText(`Hermes ${BUILT_FOR_HERMES_VERSION}`)
    expect($auth.get().phase).toBe('signed-in')
    expect(passwords.values.size).toBe(0)
  })

  it('says when the saved password stopped working', async () => {
    $auth.set({ phase: 'signed-out', url: 'https://hermes.test', username: 'david', savedPasswordRefused: true })
    await show()

    expect(screen.getByText("The saved password didn't work, so the phone forgot it. Sign in again.")).toBeOnTheScreen()
  })

  it('shows and hides the password', async () => {
    await show()
    await fireEvent.changeText(screen.getByTestId('password'), 'secret')

    expect(screen.getByTestId('password').props.secureTextEntry).toBe(true)

    await fireEvent.press(screen.getByLabelText('Show password'))

    expect(screen.getByTestId('password').props.secureTextEntry).toBe(false)

    await fireEvent.press(screen.getByLabelText('Hide password'))

    expect(screen.getByTestId('password').props.secureTextEntry).toBe(true)
  })
})
