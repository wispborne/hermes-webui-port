import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { router } from 'expo-router'
import type { ReactNode } from 'react'
import { PaperProvider } from 'react-native-paper'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { $memoryReview } from '@/store/memory-review'
import { hermesTheme } from '@/theme/theme'

import type { Frame } from '../../test/fake-gateway'
import { type Harness, signedInHarness } from '../../test/harness'
import { MemoryPage } from './settings-memory-page'
import { SessionsScreen } from './sessions-screen'
import { SettingsScreen } from './settings-screen'

jest.mock('../../modules/hermes-background', () => ({ flushCookies: jest.fn(), clearCookies: jest.fn() }))
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react')

  return {
    router: { back: jest.fn(), canGoBack: () => true, push: jest.fn(), replace: jest.fn() },
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect])
  }
})

const list = (count: number) =>
  count === 0
    ? 'memory.write_approval = on\n\nNo pending memory writes.'
    : [
        'memory.write_approval = on',
        '',
        `Pending memory writes (${count}):`,
        ...Array.from({ length: count }, (_, i) => `  0000000${i}  add to memory: Fact ${i}`),
        '',
        'Apply: /memory approve <id>   Reject: /memory reject <id>'
      ].join('\n')

let h: Harness
let pending: number
let args: string[]

beforeEach(async () => {
  pending = 2
  args = []
  h = await signedInHarness()
  h.methods.set('command.dispatch', (frame: Frame) => {
    const { arg } = frame.params as { arg: string }
    args.push(arg)

    return { type: 'exec', output: arg ? "memory.write_approval set to 'off'." : list(pending) }
  })
  h.methods.set('session.active_list', () => ({ sessions: [] }))
  h.rest.route('GET', /^\/api\/profiles\/sessions$/, () => ({ body: { sessions: [], total: 0 } }))
  $memoryReview.set(null)
  jest.mocked(router.push).mockClear()
})

afterEach(() => h.close())

const metrics = { frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }

const show = (children: ReactNode) =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <PaperProvider theme={hermesTheme('light')}>{children}</PaperProvider>
    </SafeAreaProvider>
  )

it('lists the sections in the web settings dialog order', async () => {
  await show(<SettingsScreen />)

  // A row's nested views carry its testID too, so each id can appear more than once.
  const shown = [...new Set(screen.getAllByTestId(/^settings-[a-z]+$/).map(node => node.props.testID as string))]

  expect(shown).toEqual([
    'settings-appearance',
    'settings-memory',
    'settings-notifications',
    'settings-gateways',
    'settings-archived',
    'settings-about'
  ])
  expect(screen.getByText('Memory & Context')).toBeTruthy()
  expect(screen.getByText('Gateways')).toBeTruthy()
  expect(await screen.findByText('2 waiting for review')).toBeTruthy()
})

it('opens Memory review from Memory & Context, and has the approval switch', async () => {
  await show(<MemoryPage />)

  expect(await screen.findByText('2 waiting for review')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('settings-pending-memories'))
  expect(router.push).toHaveBeenCalledWith('/memory-review')

  await waitFor(() => expect(screen.getByTestId('settings-memory-approval').props.on).toBe(true))
  await fireEvent(screen.getByTestId('settings-memory-approval'), 'valueChange', false)
  await waitFor(() => expect(args).toContain('approval off'))
})

it('shows the Sessions lightbulb only while pending memories wait', async () => {
  pending = 0
  await show(<SessionsScreen />)
  await waitFor(() => expect(args).toContain(''))

  expect(screen.queryByTestId('open-memory-review')).toBeNull()

  pending = 3
  screen.unmount()
  await show(<SessionsScreen />)

  expect(await screen.findByTestId('memory-count')).toHaveTextContent('3')
  expect(screen.getByTestId('open-memory-review')).toBeTruthy()
})
