import { useStore } from '@nanostores/react'
import { atom } from 'nanostores'

import type { ConnectionStatus } from '@/gateway/connection'
import { $gateway } from '@/store/gateway'

const stopped = atom<ConnectionStatus>('stopped')

/** The signed-in gateway's connection status, or `stopped` when there is none. */
export function useConnectionStatus(): ConnectionStatus {
  const gateway = useStore($gateway)

  return useStore(gateway?.connection.$status ?? stopped)
}
