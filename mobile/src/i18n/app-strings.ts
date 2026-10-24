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
  versionBanner: 'Built for Hermes {builtFor}. The gateway runs {gateway}.'
}
