// Text the desktop app has no string for. Everything else comes from
// en.generated.json, which `npm run strings` exports from the desktop app.
export const appStrings = {
  gatewayCheck: {
    title: 'Hermes',
    intro: 'Enter the address of your Hermes gateway.',
    urlPlaceholder: 'https://hermes.example.com',
    check: 'Check',
    checking: 'Checking…',
    version: 'Hermes {version}',
    notAGateway: 'This address is not a Hermes gateway.',
    invalidUrl: 'Enter a full address that starts with https:// or http://.',
    unreachable: "Can't reach the gateway. Is Tailscale connected?"
  },
  signIn: {
    intro: 'Sign in to your Hermes gateway.',
    signingIn: 'Signing in…',
    wrongPassword: 'The username or password is wrong.',
    tooManyAttempts: 'Too many sign-in attempts. Wait a minute and try again.',
    noPasswordSignIn: "This gateway doesn't sign in with a password. Its sign-in method isn't supported yet.",
    passwordStoreDown: "The gateway couldn't check the password right now. Try again shortly.",
    failedStatus: 'Sign-in failed. The gateway answered {status}.',
    sessionEnded: 'The gateway ended your sign-in. Sign in again.'
  },
  settings: {
    gateway: 'Gateway',
    signedInAs: 'Signed in as',
    appVersion: 'App version',
    builtFor: 'Built for Hermes',
    gatewayVersion: 'Gateway Hermes version',
    unknown: 'Unknown',
    signOutOffline: "Signed out on this phone. The gateway couldn't be reached, so its session ends on its own when it expires."
  },
  sessions: {
    savedOnlySearch: 'Only sessions saved on this phone were searched.'
  },
  chat: {
    queued: 'Queued',
    waitingToSend: 'Waiting to send',
    oldMessage: 'Waited more than a day.',
    sendNow: 'Send now',
    discard: 'Discard',
    notSaved: "This session isn't saved on this phone. It loads when the gateway can be reached.",
    arguments: 'Arguments',
    result: 'Result',
    changes: 'Changes',
    running: 'Running…'
  },
  approval: {
    // The desktop's line (assistant.approval.timedOutSystemLine) goes on to
    // point at desktop Settings, which the app doesn't have.
    timedOut: 'Approval timed out — the command was not run.',
    stackPosition: '{position} of {total}'
  },
  question: {
    position: 'Question {position} of {total}',
    recommended: 'recommended',
    back: 'Back',
    next: 'Next',
    close: 'Close',
    closeTitle: 'Cancel these questions?',
    closeBody: 'Hermes gets no answers and goes on without them.',
    keepAnswering: 'Keep answering',
    cancelQuestions: 'Cancel questions'
  },
  background: {
    working: 'Hermes is working',
    connected: 'Connected to the gateway',
    keepConnected: 'Keep connected',
    keepConnectedDescription: 'Stay connected in the background, even when nothing is running. Uses more battery.',
    notificationsTitle: 'Allow notifications',
    notificationsWhy: 'Hermes shows a notification when it needs your answer or finishes a reply while the app is closed.',
    batteryTitle: 'Allow background use',
    batteryWhy:
      'To stay connected while the phone is idle, Android has to let Hermes run without battery restrictions. On the next screen, choose Allow.',
    batteryDeclined: 'Battery restrictions are on, so the connection may drop while the phone is idle.',
    notNow: 'Not now'
  },
  connection: {
    connecting: 'Connecting to the gateway…'
  },
  versionBanner: 'Built for Hermes {builtFor}. The gateway runs {gateway}.'
}
