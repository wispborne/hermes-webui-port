import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { PaperProvider } from 'react-native-paper'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { hermesTheme } from '@/theme/theme'

import type { Frame } from '../../test/fake-gateway'
import { type Harness, signedInHarness } from '../../test/harness'
import { MemoryReviewScreen } from './memory-review-screen'

jest.mock('../../modules/hermes-background', () => ({ flushCookies: jest.fn(), clearCookies: jest.fn() }))
// Paper's menu popup opens through measurement and animation timers. With fake
// timers, findBy* and waitFor advance them deterministically, so the popup
// mounts in the test instead of racing the machine's load.
jest.useFakeTimers()
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react')

  return {
    router: { back: jest.fn(), canGoBack: () => true, replace: jest.fn() },
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect])
  }
})

const LIST = [
  'memory.write_approval = on',
  '',
  'Pending memory writes (2):',
  '  a1b2c3d4  patch in memory: entry matching: tea',
  "span 'tea' becomes: green tea (rest of the entry is kept)",
  '      patchs entry: User likes tea in the morning',
  '  d4e5f6a7 [auto]  background review consolidation (remove on memory): - remove: old project',
  '      removes entry: The old project is no longer used',
  '',
  'Apply: /memory approve <id>   Reject: /memory reject <id>'
].join('\n')

let h: Harness
let args: string[]

beforeEach(async () => {
  args = []
  h = await signedInHarness()
  h.methods.set('command.dispatch', (frame: Frame) => {
    const { arg } = frame.params as { arg: string }
    args.push(arg)

    return { type: 'exec', output: arg ? 'Approved 1 memory write(s).' : LIST }
  })
})

afterEach(() => h.close())

const metrics = { frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }

async function show() {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <PaperProvider theme={hermesTheme('light')}>
        <MemoryReviewScreen />
      </PaperProvider>
    </SafeAreaProvider>
  )
  await screen.findByTestId('memory-a1b2c3d4')
}

it('shows each pending memory with its labels and the memory it changes', async () => {
  await show()

  expect(screen.getByText('Edit')).toBeTruthy()
  expect(screen.getByText('User likes tea in the morning')).toBeTruthy()
  expect(screen.getByText('Remove')).toBeTruthy()
  expect(screen.getByText('Background review')).toBeTruthy()
  expect(screen.getByText('Removes this memory')).toBeTruthy()
  // Android's switch keeps its value in `on`.
  expect(screen.getByTestId('memory-approval').props.on).toBe(true)
})

it('approves one and shows the reply', async () => {
  await show()
  await fireEvent.press(screen.getByTestId('approve-a1b2c3d4'))

  await waitFor(() => expect(screen.getByTestId('memory-reply')).toBeTruthy())
  expect(args).toContain('approve a1b2c3d4')
  expect(screen.getByText('Approved 1 memory write(s).')).toBeTruthy()
})

it('approves all after the confirmation', async () => {
  await show()
  await fireEvent.press(screen.getByTestId('memory-menu'))
  await fireEvent.press(screen.getByTestId('approve-all'))

  expect(screen.getByText('Approve 2 pending memories?')).toBeTruthy()
  expect(args).not.toContain('approve all')

  await fireEvent.press(screen.getByTestId('confirm-all'))
  await waitFor(() => expect(args).toContain('approve all'))
})
