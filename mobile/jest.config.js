/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo/android',
  resolver: '<rootDir>/test/jest-resolver.js',
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/']
}
