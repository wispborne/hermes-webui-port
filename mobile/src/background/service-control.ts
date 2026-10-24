// When the foreground service runs, and when the connection is open while the
// app is off screen. Plain logic with its timers passed in, so the rules can
// be tested with a fake clock. See the background-connection design.
//
// - On demand (default): the service starts when the app leaves the screen
//   while a session opened on the phone is running or Needs input. Its text
//   follows what's happening. It stops 5 minutes after nothing is.
// - Keep connected: the service runs whenever the person is signed in.
// - Off screen with no service, the connection is closed. It opens again
//   when the app comes back.

export const STOP_DELAY_MS = 5 * 60_000

/** What sessions opened on the phone are doing. */
export interface Activity {
  running: number
  needsInput: number
}

export interface ServiceControlDeps {
  startService(text: string): void
  updateService(text: string): void
  stopService(): void
  /** Opens the gateway connection, or keeps it open. */
  openConnection(): void
  /** Closes the gateway connection until `openConnection`. */
  closeConnection(): void
  /** The ongoing notification's text for the current activity. */
  describe(activity: Activity): string
  setTimer(callback: () => void, ms: number): unknown
  clearTimer(timer: unknown): void
}

export interface ServiceControlState {
  appActive: boolean
  keepConnected: boolean
  signedIn: boolean
  activity: Activity
}

const busy = (activity: Activity) => activity.running > 0 || activity.needsInput > 0

export class ServiceControl {
  private serviceOn = false
  private stopTimer: unknown = null
  private state: ServiceControlState = {
    appActive: true,
    keepConnected: false,
    signedIn: false,
    activity: { running: 0, needsInput: 0 }
  }

  constructor(private readonly deps: ServiceControlDeps) {}

  get isServiceOn() {
    return this.serviceOn
  }

  /** Applies a change and acts on it. */
  update(change: Partial<ServiceControlState>) {
    const before = this.state
    this.state = { ...before, ...change, activity: change.activity ?? before.activity }
    const { activity, appActive, keepConnected, signedIn } = this.state
    const text = this.deps.describe(activity)

    if (!signedIn) {
      this.cancelStop()
      this.stop()

      return
    }

    if (keepConnected) {
      this.cancelStop()
      this.start(text)
      this.deps.openConnection()

      return
    }

    if (appActive) {
      // On screen: the app itself keeps the connection, so no service.
      this.cancelStop()
      this.stop()
      this.deps.openConnection()

      return
    }

    const leftScreen = before.appActive

    if (busy(activity)) {
      this.cancelStop()

      // Android only lets this service start while the app is leaving the
      // screen, so it can't start later from the background.
      if (leftScreen || this.serviceOn || before.keepConnected) {
        this.start(text)
      }

      return
    }

    if (this.serviceOn) {
      this.deps.updateService(text)
      this.scheduleStop()
    } else if (leftScreen || before.keepConnected) {
      // Nothing is happening: no service, and the connection closes.
      this.deps.closeConnection()
    }
  }

  private start(text: string) {
    if (this.serviceOn) {
      this.deps.updateService(text)
    } else {
      this.serviceOn = true
      this.deps.startService(text)
    }
  }

  private stop() {
    if (this.serviceOn) {
      this.serviceOn = false
      this.deps.stopService()
    }
  }

  private scheduleStop() {
    if (this.stopTimer !== null) {
      return
    }

    this.stopTimer = this.deps.setTimer(() => {
      this.stopTimer = null

      if (!this.state.appActive && !this.state.keepConnected && !busy(this.state.activity)) {
        this.stop()
        this.deps.closeConnection()
      }
    }, STOP_DELAY_MS)
  }

  private cancelStop() {
    if (this.stopTimer !== null) {
      this.deps.clearTimer(this.stopTimer)
      this.stopTimer = null
    }
  }
}
