const expoPreset = require('jest-expo/jest-preset')

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo/android',
  resolver: '<rootDir>/test/jest-resolver.js',
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/'],
  // nanostores ships only ES modules, so Jest has to compile it like the Expo packages.
  transformIgnorePatterns: expoPreset.transformIgnorePatterns.map(pattern =>
    pattern.startsWith('/node_modules/(?!(') ? pattern.replace('(?!(', '(?!(nanostores|@nanostores|') : pattern
  )
}
