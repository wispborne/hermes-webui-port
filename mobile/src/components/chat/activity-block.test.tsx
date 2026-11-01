// How an activity block draws thinking and tool calls: one short line each,
// with the step happening now open while the turn runs.

import { fireEvent, render, screen } from '@testing-library/react-native'
import { PaperProvider } from 'react-native-paper'

import type { ActivityItem, ThinkingStep } from '@/chat/activity'
import type { ToolItem } from '@/chat/items'
import { ActivityBlock } from '@/components/chat/activity-block'
import { hermesTheme } from '@/theme/theme'

const thinking = (extra: Partial<ThinkingStep> = {}): ThinkingStep => ({
  kind: 'thinking',
  key: 'a-thinking',
  text: '**Plan.** Read the README first.\nThen check the tests.',
  streaming: false,
  ...extra
})

const readFile = (extra: Partial<ToolItem> = {}): ToolItem => ({
  kind: 'tool',
  key: 't1',
  toolId: 't1',
  name: 'read_file',
  context: '/opt/data/README.md',
  args: { path: '/opt/data/README.md' },
  result: 'line one',
  running: false,
  ...extra
})

const block = (steps: ActivityItem['steps'], live = false): ActivityItem => ({ kind: 'activity', key: 'activity-1', steps, live })

async function show(item: ActivityItem) {
  const view = await render(
    <PaperProvider theme={hermesTheme('light')}>
      <ActivityBlock item={item} />
    </PaperProvider>
  )

  return (next: ActivityItem) =>
    view.rerender(
      <PaperProvider theme={hermesTheme('light')}>
        <ActivityBlock item={next} />
      </PaperProvider>
    )
}

describe('an activity block', () => {
  it('draws a finished thought as one line with the start of its text', async () => {
    await show(block([thinking()]))

    expect(screen.getByText('Thought')).toBeTruthy()
    expect(screen.getByText('Plan. Read the README first.')).toBeTruthy()
    expect(screen.queryByText(/Then check the tests/)).toBeNull()
  })

  it('names a tool with the desktop title and shows what it acted on', async () => {
    await show(block([readFile(), readFile({ key: 't2', toolId: 't2', running: true })], true))

    expect(screen.getByText('Read file')).toBeTruthy()
    expect(screen.getByText('Reading file')).toBeTruthy()
    expect(screen.getAllByText('/opt/data/README.md')).toHaveLength(1)
  })

  it('previews a search by its pattern, not by its mode', async () => {
    await show(block([readFile({ name: 'search_files', context: 'content', args: { target: 'content', pattern: 'heatToReach' } })]))

    expect(screen.getByText('heatToReach')).toBeTruthy()
    expect(screen.queryByText('content')).toBeNull()
  })

  it('opens the thought being written, and closes it when it is done', async () => {
    const update = await show(block([readFile(), thinking({ streaming: true })], true))

    expect(screen.getByText('Thinking')).toBeTruthy()
    expect(screen.getByText(/Then check the tests/)).toBeTruthy()

    await update(block([readFile(), thinking(), readFile({ key: 't2', toolId: 't2' })], true))

    expect(screen.queryByText(/Then check the tests/)).toBeNull()
  })

  it('opens a running tool call to show its arguments, and closes it when it finishes', async () => {
    const update = await show(block([readFile({ running: true, result: undefined })], true))

    expect(screen.getByText('Arguments')).toBeTruthy()

    await update(block([readFile()], true))

    expect(screen.queryByText('Arguments')).toBeNull()
  })

  it('leaves everything closed once the turn has ended', async () => {
    await show(block([readFile({ running: true }), thinking({ streaming: true })], false))

    expect(screen.queryByText('Arguments')).toBeNull()
    expect(screen.queryByText(/Then check the tests/)).toBeNull()
  })

  it('keeps a step the person opened open', async () => {
    const update = await show(block([readFile()], true))

    await fireEvent.press(screen.getByTestId('tool-t1'))
    expect(screen.getByText('Result')).toBeTruthy()

    await update(block([readFile(), thinking({ streaming: true })], true))

    expect(screen.getByText('Result')).toBeTruthy()
  })

  it('keeps a step the person closed closed while it runs', async () => {
    const update = await show(block([thinking({ streaming: true })], true))

    await fireEvent.press(screen.getByTestId('a-thinking'))
    expect(screen.queryByText(/Then check the tests/)).toBeNull()

    await update(block([thinking({ streaming: true, text: `${thinking().text}\nMore.` })], true))

    expect(screen.queryByText(/Then check the tests/)).toBeNull()
  })
})
