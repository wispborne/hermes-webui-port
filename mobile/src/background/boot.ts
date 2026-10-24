// Runs when the JavaScript loads, before any screen. See index.ts.

// `URL` in the JS engine is incomplete. The gateway client and the URL checks need the full one.
import 'react-native-url-polyfill/auto'

import { startApp } from '@/store/gateway'
// These stores wire themselves to the gateway when it opens, so they load first.
import '@/store/chat'
import '@/store/prompts'

import { startBackground } from './wiring'

startBackground()
void startApp().catch((error: unknown) => console.warn('The start check failed', error))
