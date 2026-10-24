import { atom } from 'nanostores'
import { AppState } from 'react-native'

/** True while the app is on screen. */
export const $appActive = atom(AppState.currentState === 'active')

AppState.addEventListener('change', state => $appActive.set(state === 'active'))
