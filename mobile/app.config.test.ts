import type { ExpoConfig } from 'expo/config'

import { configFor, versionCodeFor } from './app.config'
import app from './app.json'

const base = app.expo as ExpoConfig

describe('versionCodeFor', () => {
  it('turns major.minor.patch into one number', () => {
    expect(versionCodeFor('1.2.3')).toBe(10203)
    expect(versionCodeFor('0.2.0')).toBe(200)
    expect(versionCodeFor('99.99.99')).toBe(999999)
  })

  it('goes up with every later version', () => {
    expect(versionCodeFor('0.10.0')).toBeGreaterThan(versionCodeFor('0.9.99'))
    expect(versionCodeFor('1.0.0')).toBeGreaterThan(versionCodeFor('0.99.99'))
  })

  it('names the part that is out of range', () => {
    expect(() => versionCodeFor('0.100.0')).toThrow('The minor part of the version "0.100.0" must be a whole number from 0 to 99.')
    expect(() => versionCodeFor('1.2.x')).toThrow('The patch part')
    expect(() => versionCodeFor('1.2')).toThrow('must have three parts')
  })
})

describe('configFor', () => {
  it('keeps app.json as it is for the release, with the versionCode', () => {
    const config = configFor(base, undefined)

    expect(config.name).toBe('Hermes')
    expect(config.android?.package).toBe('com.wispborne.hermes')
    expect(config.scheme).toBe('hermes')
    expect(config.android?.versionCode).toBe(versionCodeFor(base.version!))
  })

  it('gives the development build its own ID, name and scheme', () => {
    const config = configFor(base, 'development')

    expect(config.name).toBe('Hermes Dev')
    expect(config.android?.package).toBe('com.wispborne.hermes.dev')
    expect(config.scheme).toBe('hermes-dev')
    expect(config.android?.versionCode).toBe(versionCodeFor(base.version!))
  })

  it('fails the build for a bad version', () => {
    expect(() => configFor({ ...base, version: '0.100.0' }, undefined)).toThrow('minor part')
  })
})
