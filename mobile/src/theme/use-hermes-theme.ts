import { useTheme } from 'react-native-paper'

import type { HermesTheme } from './theme'

/** Paper's theme hook, typed with the extra Hermes colours. */
export const useHermesTheme = () => useTheme<HermesTheme>()
