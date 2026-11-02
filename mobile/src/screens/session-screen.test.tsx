// The Session screen's message box: Send and Stop while a turn runs, and the
// box stepping aside while a Question is open.

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { PaperProvider } from 'react-native-paper'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { chatStore } from '@/store/chat'
import { promptsFor } from '@/store/prompts'
import { hermesTheme } from '@/theme/theme'

import { ChatGateway } from '../../test/chat-gateway'
import { type Harness, signedInHarness } from '../../test/harness'
import { SessionScreen } from './session-screen'

jest.mock('../../modules/hermes-background', () => ({ flushCookies: jest.fn(), clearCookies: jest.fn() }))
jest.mock('../background/permission-dialogs', () => ({ askBackgroundPermissions: jest.fn() }))
jest.mock('../background/wiring', () => ({ $onScreen: jest.requireActual<typeof import('nanostores')>('nanostores').atom(null) }))
jest.mock('expo-router', () => ({ router: { back: jest.fn(), canGoBack: () => true, replace: jest.fn() } }))
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }))
jest.mock('@/chat/attachments', () => ({
  readAttachment: jest.fn(() => Promise.resolve('QUJD')),
  attachmentExists: () => true,
  discardAttachment: jest.fn(),
  pruneAttachments: jest.fn()
}))
jest.mock('@/chat/pick-attachments', () => ({
  pickPhotos: jest.fn(() => Promise.resolve([{ kind: 'image', uri: 'file:///app/beds.jpg', name: 'beds.jpg', mime: 'image/jpeg' }])),
  takePhoto: jest.fn(() => Promise.resolve([])),
  pickFiles: jest.fn(() => Promise.resolve([{ kind: 'file', uri: 'file:///app/plan.pdf', name: 'plan.pdf', mime: 'application/pdf' }]))
}))

const metrics = { frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }

let h: Harness
let g: ChatGateway

beforeEach(async () => {
  h = await signedInHarness()
  g = new ChatGateway(h)
  g.addSession('s1', [['user', 'Clean up the build']])
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <PaperProvider theme={hermesTheme('light')}>
        <SessionScreen id="s1" />
      </PaperProvider>
    </SafeAreaProvider>
  )
  await waitFor(() => expect(chatStore('s1').get().runtimeId).not.toBeNull())
})

afterEach(() => h.close())

const startTurn = async () => {
  g.emit('s1', 'message.start')
  await waitFor(() => expect(screen.getByTestId('stop')).toBeTruthy())
}

describe('the message box while a turn runs', () => {
  it('offers Stop and, once something is typed, Send next to it', async () => {
    await startTurn()

    expect(screen.queryByTestId('send')).toBeNull()

    fireEvent.changeText(screen.getByTestId('message-box'), 'And then?')

    await waitFor(() => expect(screen.getByTestId('send')).toBeTruthy())
    expect(screen.getByTestId('stop')).toBeTruthy()
  })
})

describe('the message box while a Question is open', () => {
  beforeEach(async () => {
    await startTurn()
    const runtimeId = chatStore('s1').get().runtimeId!
    h.gateway.send({
      jsonrpc: '2.0',
      id: 'req-1',
      method: 'clarify',
      params: { session_id: runtimeId, questions: [{ qid: 'q0', question: 'Which branch?', choices: ['main', 'dev'], multi_select: false }] }
    })
    await waitFor(() => expect(screen.getByTestId('question-card')).toBeTruthy())
  })

  it('leaves the answer to the card, and keeps Stop', async () => {
    const box = screen.getByTestId('message-box')

    expect(box.props.editable).toBe(false)
    expect(box.props.placeholder).toBe('Answer the question above')
    expect(screen.getByTestId('stop')).toBeTruthy()

    fireEvent.changeText(screen.getByTestId('question-free-text'), 'staging')

    expect(promptsFor('s1').question?.answers.q0).toBe('staging')
    expect(screen.getByTestId('message-box').props.value).toBe('')
  })
})

describe('Copy and Retry under replies', () => {
  it("puts Copy under each finished turn's reply, and Retry only under the last", async () => {
    g.reply('s1', 'Run it once a day.')
    await waitFor(() => expect(screen.getAllByTestId('copy-reply')).toHaveLength(1))
    expect(screen.getAllByTestId('retry')).toHaveLength(1)

    fireEvent.changeText(screen.getByTestId('message-box'), 'And then?')
    await waitFor(() => expect(screen.getByTestId('send')).toBeTruthy())
    fireEvent.press(screen.getByTestId('send'))
    await waitFor(() => expect(g.submitted).toHaveLength(1))
    g.reply('s1', 'Water the roses.')

    await waitFor(() => expect(screen.getAllByTestId('copy-reply')).toHaveLength(2))
    expect(screen.getAllByTestId('retry')).toHaveLength(1)
  })

  it('shows neither while the turn is running', async () => {
    g.emit('s1', 'message.start')
    g.emit('s1', 'message.delta', { text: 'Half' })
    await waitFor(() => expect(screen.getByTestId('stop')).toBeTruthy())

    expect(screen.queryByTestId('copy-reply')).toBeNull()
    expect(screen.queryByTestId('retry')).toBeNull()
  })
})

describe('attaching photos and files', () => {
  const attach = async (choice: string) => {
    fireEvent.press(screen.getByTestId('attach'))
    fireEvent.press(await screen.findByText(choice))
  }

  it('sends a picked photo, with no text needed', async () => {
    await attach('Photos')

    expect(await screen.findByTestId('attachment-beds.jpg')).toBeTruthy()
    expect(screen.getByTestId('send').props.accessibilityState?.disabled).toBeFalsy()

    fireEvent.press(screen.getByTestId('send'))

    await waitFor(() => expect(g.submitted).toHaveLength(1))
    expect(g.calls[0]).toMatchObject({ method: 'image.attach_bytes', params: { filename: 'beds.jpg' } })
    expect(screen.queryByTestId('attachment-beds.jpg')).toBeNull()
  })

  it('removes a picked file, and deletes its copy', async () => {
    const { discardAttachment } = jest.requireMock<{ discardAttachment: jest.Mock }>('@/chat/attachments')
    await attach('File')
    await screen.findByTestId('attachment-plan.pdf')

    fireEvent.press(screen.getByLabelText('Remove plan.pdf'))

    await waitFor(() => expect(screen.queryByTestId('attachment-plan.pdf')).toBeNull())
    expect(discardAttachment).toHaveBeenCalledWith(expect.objectContaining({ name: 'plan.pdf' }))
  })
})
