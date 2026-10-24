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
  connection: {
    connecting: 'Connecting to the gateway…'
  },
  versionBanner: 'Built for Hermes {builtFor}. The gateway runs {gateway}.'
}
