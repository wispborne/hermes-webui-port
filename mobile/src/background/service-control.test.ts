import { type Activity, ServiceControl, STOP_DELAY_MS } from './service-control'

const idle: Activity = { running: 0, needsInput: 0 }
const working: Activity = { running: 1, needsInput: 0 }
const waiting: Activity = { running: 0, needsInput: 1 }

function setup() {
  jest.useFakeTimers()
  const calls: string[] = []
  const control = new ServiceControl({
    startService: text => calls.push(`start: ${text}`),
    updateService: text => calls.push(`update: ${text}`),
    stopService: () => calls.push('stop'),
    openConnection: () => calls.push('open'),
    closeConnection: () => calls.push('close'),
    describe: activity => (activity.needsInput ? 'Approval needed' : activity.running ? 'Hermes is working' : 'Connected'),
    setTimer: (callback, ms) => setTimeout(callback, ms),
    clearTimer: timer => clearTimeout(timer as ReturnType<typeof setTimeout>)
  })

  control.update({ signedIn: true, appActive: true })
  calls.length = 0

  return { calls, control }
}

afterEach(() => jest.useRealTimers())

describe('on demand', () => {
  it('starts the service when the app leaves the screen during a turn', () => {
    const { calls, control } = setup()
    control.update({ activity: working })
    calls.length = 0

    control.update({ appActive: false })

    expect(calls).toEqual(['start: Hermes is working'])
    expect(control.isServiceOn).toBe(true)
  })

  it('updates the text as things change', () => {
    const { calls, control } = setup()
    control.update({ activity: working })
    control.update({ appActive: false })
    calls.length = 0

    control.update({ activity: waiting })

    expect(calls).toEqual(['update: Approval needed'])
  })

  it('stops 5 minutes after the turn ends, and closes the connection', () => {
    const { calls, control } = setup()
    control.update({ activity: working })
    control.update({ appActive: false })
    control.update({ activity: idle })
    calls.length = 0

    jest.advanceTimersByTime(STOP_DELAY_MS - 1000)
    expect(calls).toEqual([])

    jest.advanceTimersByTime(1000)
    expect(calls).toEqual(['stop', 'close'])
    expect(control.isServiceOn).toBe(false)
  })

  it('keeps running when a new turn starts within the 5 minutes', () => {
    const { calls, control } = setup()
    control.update({ activity: working })
    control.update({ appActive: false })
    control.update({ activity: idle })
    jest.advanceTimersByTime(STOP_DELAY_MS / 2)
    control.update({ activity: working })
    calls.length = 0

    jest.advanceTimersByTime(STOP_DELAY_MS)

    expect(calls).toEqual([])
    expect(control.isServiceOn).toBe(true)
  })

  it('starts nothing and closes the connection when nothing is happening', () => {
    const { calls, control } = setup()

    control.update({ appActive: false })

    expect(calls).toEqual(['close'])
    expect(control.isServiceOn).toBe(false)
  })

  it('stops the service and opens the connection when the app comes back', () => {
    const { calls, control } = setup()
    control.update({ activity: working })
    control.update({ appActive: false })
    calls.length = 0

    control.update({ appActive: true })

    expect(calls).toEqual(['stop', 'open'])
  })
})

describe('Keep connected', () => {
  it('runs the service whenever signed in, on screen or not', () => {
    const { calls, control } = setup()

    control.update({ keepConnected: true })
    control.update({ appActive: false })
    jest.advanceTimersByTime(STOP_DELAY_MS * 2)

    expect(calls.filter(call => call.startsWith('start'))).toEqual(['start: Connected'])
    expect(calls).not.toContain('stop')
    expect(control.isServiceOn).toBe(true)
  })

  it('stops when turned off with nothing happening, off screen', () => {
    const { calls, control } = setup()
    control.update({ keepConnected: true })
    control.update({ appActive: false })
    calls.length = 0

    control.update({ keepConnected: false })

    expect(control.isServiceOn).toBe(true)
    jest.advanceTimersByTime(STOP_DELAY_MS)
    expect(calls.slice(-2)).toEqual(['stop', 'close'])
  })

  it('stops on sign-out', () => {
    const { calls, control } = setup()
    control.update({ keepConnected: true })
    calls.length = 0

    control.update({ signedIn: false })

    expect(calls).toEqual(['stop'])
  })
})
