// The long-press actions on the Sessions screen (rename, pin, archive and
// delete a session) and the Archived Chats page.

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import type { ReactElement } from 'react'
import { PaperProvider } from 'react-native-paper'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { hermesTheme } from '@/theme/theme'

import type { FakeRestCall } from '../../test/fake-rest'
import { type Harness, signedInHarness } from '../../test/harness'
import { ArchivedSessionsScreen } from './archived-sessions-screen'
import { SessionsScreen } from './sessions-screen'

jest.mock('../../modules/hermes-background', () => ({ flushCookies: jest.fn(), clearCookies: jest.fn() }))
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react')

  return {
    router: { back: jest.fn(), canGoBack: () => true, push: jest.fn(), replace: jest.fn() },
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect])
  }
})

const metrics = { frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }

interface Row {
  id: string
  title: string | null
  pinned: boolean
  archived?: boolean
  last_active: number
  started_at: number
  message_count: number
  source: string
}

let h: Harness
let rows: Row[]
let edits: FakeRestCall[]

beforeEach(async () => {
  h = await signedInHarness()
  edits = []
  rows = [1, 2, 3].map(n => ({ id: `s${n}`, title: `Session ${n}`, pinned: false, last_active: 100 - n, started_at: 1, message_count: 2, source: 'gui' }))
  h.methods.set('session.active_list', () => ({ sessions: [] }))
  h.methods.set('command.dispatch', () => ({ type: 'exec', output: 'No pending memory writes.' }))
  h.rest.route('GET', /^\/api\/profiles\/sessions$/, (_, query) => {
    const shown = rows.filter(row => Boolean(row.archived) === (query.get('archived') === 'only'))

    return { body: { sessions: shown, total: shown.length } }
  })
  h.rest.route('GET', /^\/api\/sessions\/[^/]+\/mutation-snapshot$/, () => ({
    body: { session_id: 's', exists: true, runtime_revision: 1, runtime_generation: 0 }
  }))
  const edit = (call: FakeRestCall) => {
    edits.push(call)
    const id = call.path.split('/')[3]

    if (call.method === 'DELETE') {
      rows = rows.filter(row => row.id !== id)
    } else {
      Object.assign(rows.find(row => row.id === id)!, call.body as object)
    }

    return { body: { ok: true } }
  }
  h.rest.route('PATCH', /^\/api\/sessions\/[^/]+$/, edit)
  h.rest.route('DELETE', /^\/api\/sessions\/[^/]+$/, edit)
})

afterEach(() => h.close())

async function show(page: ReactElement) {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <PaperProvider theme={hermesTheme('light')}>{page}</PaperProvider>
    </SafeAreaProvider>
  )
}

const longPress = (id: string) => fireEvent(screen.getByTestId(`session-row-${id}`), 'longPress')
const rowOrder = () => screen.getAllByTestId(/^session-row-/).map(row => (row.props.testID as string).replace('session-row-', ''))

describe('the Sessions screen', () => {
  beforeEach(async () => {
    await show(<SessionsScreen />)
    await screen.findByTestId('session-row-s2')
  })

  it('offers Rename, Pin, Archive and Delete on a long press, without opening the session', async () => {
    const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router')

    longPress('s2')

    expect(await screen.findByText('Rename…')).toBeTruthy()
    expect(screen.getByText('Pin')).toBeTruthy()
    expect(screen.getByText('Archive')).toBeTruthy()
    expect(screen.getByText('Delete')).toBeTruthy()
    expect(router.push).not.toHaveBeenCalled()
  })

  it('pins a session, which then shows first with a pin', async () => {
    longPress('s3')
    fireEvent.press(await screen.findByText('Pin'))

    await waitFor(() => expect(rowOrder()).toEqual(['s3', 's1', 's2']))
    expect(edits[0]).toMatchObject({ method: 'PATCH', body: { pinned: true } })
    expect(screen.getByTestId('pinned-s3')).toBeTruthy()

    longPress('s3')
    expect(await screen.findByText('Unpin')).toBeTruthy()
  })

  it('renames a session from its dialog', async () => {
    longPress('s2')
    fireEvent.press(await screen.findByText('Rename…'))
    fireEvent.changeText(await screen.findByTestId('rename-input'), 'Garden beds')
    await waitFor(() => expect(screen.getByTestId('rename-input').props.value).toBe('Garden beds'))
    fireEvent.press(screen.getByTestId('rename-save'))

    expect(await screen.findByText('Garden beds')).toBeTruthy()
    expect(edits[0]).toMatchObject({ method: 'PATCH', body: { title: 'Garden beds' } })
  })

  it('archives a session, and Undo brings it back', async () => {
    longPress('s2')
    fireEvent.press(await screen.findByText('Archive'))

    await waitFor(() => expect(screen.queryByTestId('session-row-s2')).toBeNull())
    expect(edits[0]).toMatchObject({ method: 'PATCH', body: { archived: true, pinned: false } })
    expect(screen.getByText('Session archived')).toBeTruthy()

    fireEvent.press(screen.getByText('Undo'))

    await screen.findByTestId('session-row-s2')
    expect(edits[1]).toMatchObject({ method: 'PATCH', body: { archived: false } })
  })

  it('deletes a session only after the person confirms', async () => {
    longPress('s2')
    fireEvent.press(await screen.findByText('Delete'))

    expect(await screen.findByText('Delete session?')).toBeTruthy()
    expect(edits).toEqual([])

    fireEvent.press(screen.getByTestId('delete-confirm'))

    await waitFor(() => expect(screen.queryByTestId('session-row-s2')).toBeNull())
    expect(edits[0]).toMatchObject({ method: 'DELETE', path: '/api/sessions/s2' })
  })

  it('says so when the gateway refuses an edit', async () => {
    h.rest.route('PATCH', /^\/api\/sessions\/[^/]+$/, () => ({ status: 409, body: { detail: 'revision_conflict' } }))

    longPress('s2')
    fireEvent.press(await screen.findByText('Pin'))

    expect(await screen.findByText("Couldn't pin the session.")).toBeTruthy()
  })
})

describe('Archived Chats', () => {
  beforeEach(async () => {
    rows[1].archived = true
    await show(<ArchivedSessionsScreen />)
    await screen.findByTestId('session-row-s2')
  })

  it('lists only archived sessions', () => {
    expect(rowOrder()).toEqual(['s2'])
  })

  it('unarchives a session, which leaves this list', async () => {
    longPress('s2')

    expect(await screen.findByText('Unarchive')).toBeTruthy()
    expect(screen.queryByText('Archive')).toBeNull()
    expect(screen.queryByText('Pin')).toBeNull()

    fireEvent.press(screen.getByText('Unarchive'))

    await waitFor(() => expect(screen.queryByTestId('session-row-s2')).toBeNull())
    expect(edits[0]).toMatchObject({ method: 'PATCH', path: '/api/sessions/s2', body: { archived: false } })
    expect(screen.getByText('No archived sessions.')).toBeTruthy()
  })

  it('deletes an archived session after asking', async () => {
    longPress('s2')
    fireEvent.press(await screen.findByText('Delete'))
    fireEvent.press(await screen.findByTestId('delete-confirm'))

    await waitFor(() => expect(screen.queryByTestId('session-row-s2')).toBeNull())
    expect(edits[0]).toMatchObject({ method: 'DELETE', path: '/api/sessions/s2' })
  })
})
