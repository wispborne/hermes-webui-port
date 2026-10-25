// Runs the Expo CLI for the development build, "Hermes Dev":
//
//   node scripts/expo-dev.mjs run:android
//   node scripts/expo-dev.mjs start --dev-client
//
// It sets APP_VARIANT=development, which app.config.ts reads, the same way on
// Windows, macOS and Linux.

import { spawn } from 'node:child_process'

const child = spawn('npx', ['expo', ...process.argv.slice(2)], {
  env: { ...process.env, APP_VARIANT: 'development' },
  shell: process.platform === 'win32',
  stdio: 'inherit'
})

child.on('exit', code => process.exit(code ?? 1))
