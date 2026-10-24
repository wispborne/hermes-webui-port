// When to reconnect at once instead of waiting out the backoff.

export interface NetworkState {
  isConnected: boolean | null
  type: string
  /** Something that changes when the phone moves to another network, such as its IP address. */
  address?: string | null
}

/**
 * - `retry`: the network came back. Connect now if not connected.
 * - `reconnect`: the phone moved to another network (Wi-Fi to mobile data,
 *   or Tailscale coming up). The old socket is usually dead, so drop it and
 *   connect again now.
 * - `none`: nothing worth acting on.
 */
export function networkAction(before: NetworkState | null, after: NetworkState): 'retry' | 'reconnect' | 'none' {
  if (!after.isConnected) {
    return 'none'
  }

  if (!before?.isConnected) {
    return 'retry'
  }

  return before.type !== after.type || (before.address ?? null) !== (after.address ?? null) ? 'reconnect' : 'none'
}

/** The part of the connection a network change acts on. */
export interface Reconnectable {
  retryNow(): void
  reconnectNow(): void
}

/** Acts on a network change, skipping the backoff wait. Returns what it did. */
export function applyNetworkChange(connection: Reconnectable, before: NetworkState | null, after: NetworkState) {
  const action = networkAction(before, after)

  if (action === 'retry') {
    connection.retryNow()
  } else if (action === 'reconnect') {
    connection.reconnectNow()
  }

  return action
}
