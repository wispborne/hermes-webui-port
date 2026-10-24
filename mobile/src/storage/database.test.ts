import { gatewayDatabaseName, gatewayKey } from './database'

describe('gateway databases', () => {
  it('gives the same gateway the same database', () => {
    expect(gatewayKey('https://Hermes.Example.com/')).toBe('hermes.example.com')
    expect(gatewayKey('https://hermes.example.com:443')).toBe('hermes.example.com')
    expect(gatewayKey('http://hermes.example.com')).toBe('hermes.example.com')
  })

  it('gives different gateways different databases', () => {
    const names = [
      'https://hermes.example.com',
      'https://other.example.com',
      'https://hermes.example.com:8443',
      'https://hermes.example.com/team'
    ].map(gatewayDatabaseName)

    expect(new Set(names).size).toBe(names.length)
  })

  it('makes a safe file name', () => {
    expect(gatewayDatabaseName('https://hermes.example.com:8443/a b')).toBe('gateway-hermes.example.com_8443_a_20b.db')
  })
})
