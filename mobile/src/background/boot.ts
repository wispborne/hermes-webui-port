// Runs when the JavaScript loads, before any screen. See index.ts.

// `URL` in the JS engine is incomplete. The gateway client and the URL checks need the full one.
import 'react-native-url-polyfill/auto'

import { AppRegistry } from 'react-native'

import { startApp } from '@/store/gateway'
// These stores wire themselves to the gateway when it opens, so they load first.
import '@/store/chat'
import '@/store/prompts'

import { startBackground } from './wiring'

/**
 * React Native pauses JavaScript timers when the app leaves the screen,
 * unless a headless task is running. The native module starts this one when
 * the foreground service starts and ends it when the service stops, so the
 * background rules' timers keep running in between. It never ends by itself.
 */
export const TIMERS_TASK = 'HermesKeepTimers'

AppRegistry.registerHeadlessTask(TIMERS_TASK, () => () => new Promise<void>(() => undefined))

startBackground()
void startApp().catch((error: unknown) => console.warn('The start check failed', error))
