import { t } from './t'

describe('t', () => {
  it('returns a desktop string by its desktop key', () => {
    expect(t('notifications.native.approvalTitle')).toBe('Approval needed')
  })

  it('fills in placeholders', () => {
    expect(t('notifications.native.approvalTitleNamed', { session: 'Fix the build' })).toBe(
      'Approval needed — Fix the build'
    )
  })

  it('fills in numbers', () => {
    expect(t('app.versionBanner', { builtFor: '0.22.4', gateway: '0.23.0' })).toBe(
      'Built for Hermes 0.22.4. The gateway runs 0.23.0.'
    )
  })

  it('leaves a placeholder with no value as it is', () => {
    expect(t('common.tryHint')).toBe('Try “{term}”')
  })

  it('returns app strings under app.', () => {
    expect(t('app.gatewayCheck.unreachable')).toBe("Can't reach the gateway. Is Tailscale connected?")
  })
})
