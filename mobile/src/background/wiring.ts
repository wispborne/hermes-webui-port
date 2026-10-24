// Connects the background rules (service-control.ts, notifications.ts,
// reconnect.ts) to Android: AppState, NetInfo, the hermes-background
// foreground service, expo-notifications, and the app's stores.

import NetInfo, { type NetInfoState } from '@react-native-community/netinfo'
import * as ExpoNotifications from 'expo-notifications'
import { router } from 'expo-router'
import { atom } from 'nanostores'

import * as background from '../../modules/hermes-background'
import { t } from '@/i18n/t'
import { loadAppSettings, saveAppSettings } from '@/storage/app-settings'
import { $appActive } from '@/store/app-state'
import { chatStore, onSessionEvent } from '@/store/chat'
import { $auth, $gateway } from '@/store/gateway'
import { $prompts, answerApproval, onPromptsChange, promptsFor } from '@/store/prompts'
import { $localMarkers, $sessionRows } from '@/store/sessions'

import { APPROVAL_CATEGORY, CHANNELS, type NotificationContent, Notifications } from './notifications'
import { applyNetworkChange, type NetworkState } from './reconnect'
import { type Activity, ServiceControl } from './service-control'

/** The chat key of the session on screen, set by the Session screen. */
export const $onScreen = atom<string | null>(null)

export const $keepConnected = atom(loadAppSettings().keepConnected ?? false)

/** True when Android still restricts the app's battery use. */
export const $batteryRestricted = atom(!background.isIgnoringBatteryOptimizations())

const describe = (activity: Activity) =>
  activity.needsInput
    ? t('notifications.native.approvalTitle')
    : activity.running
      ? t('app.background.working')
      : t('app.background.connected')

const activity = (): Activity => {
  const markers = Object.values($localMarkers.get())

  return {
    running: markers.filter(marker => marker === 'running').length,
    needsInput: markers.filter(marker => marker === 'needs-input').length
  }
}

const control = new ServiceControl({
  startService: text => {
    background.startService('Hermes', text)
    $batteryRestricted.set(!background.isIgnoringBatteryOptimizations())
  },
  updateService: text => background.updateService('Hermes', text),
  stopService: () => background.stopService(),
  openConnection: () => {
    const connection = $gateway.get()?.connection

    if (connection?.$status.get() === 'stopped') {
      connection.start()
    } else {
      connection?.retryNow()
    }
  },
  closeConnection: () => $gateway.get()?.connection.stop(),
  describe,
  setTimer: (callback, ms) => setTimeout(callback, ms),
  clearTimer: timer => clearTimeout(timer as ReturnType<typeof setTimeout>)
})

/** Turns "Keep connected" on or off, and remembers it across restarts. */
export function setKeepConnected(on: boolean) {
  saveAppSettings({ keepConnected: on })
  background.setKeepConnected(on, 'Hermes', describe({ running: 0, needsInput: 0 }))
  $keepConnected.set(on)
}

// ------------------------------------------------------------ notifications

const notifier = {
  show(id: string, content: NotificationContent) {
    void ExpoNotifications.scheduleNotificationAsync({
      identifier: id,
      content: {
        title: content.title,
        body: content.body,
        data: content.data,
        categoryIdentifier: content.approvalActions ? APPROVAL_CATEGORY : undefined
      },
      trigger: { channelId: content.channel }
    }).catch(() => undefined)
  },
  dismiss(id: string) {
    void ExpoNotifications.dismissNotificationAsync(id).catch(() => undefined)
  }
}

const notifications = new Notifications(notifier)

function context(key: string) {
  const chat = chatStore(key).get()
  const row = $sessionRows.get().find(found => found.id === chat.storedId)

  return {
    appActive: $appActive.get(),
    onScreen: $onScreen.get(),
    storedId: chat.storedId,
    title: chat.title ?? row?.title ?? null
  }
}

async function setUpNotifications() {
  await ExpoNotifications.setNotificationChannelAsync(CHANNELS.needsInput, {
    name: t('notifications.native.inputTitle'),
    importance: ExpoNotifications.AndroidImportance.HIGH
  })
  await ExpoNotifications.setNotificationChannelAsync(CHANNELS.finished, {
    name: t('notifications.native.turnDoneTitle'),
    importance: ExpoNotifications.AndroidImportance.DEFAULT
  })
  await ExpoNotifications.setNotificationCategoryAsync(APPROVAL_CATEGORY, [
    { identifier: 'once', buttonTitle: t('assistant.approval.run'), options: { opensAppToForeground: false } },
    { identifier: 'deny', buttonTitle: t('assistant.approval.reject'), options: { opensAppToForeground: false } }
  ])

  ExpoNotifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false })
  })
}

/** A notification button or tap. Run and Reject answer through the card's own code. */
export function handleNotificationResponse(response: ExpoNotifications.NotificationResponse) {
  const data = response.notification.request.content.data as { key?: string; approvalId?: string; url?: string }
  const action = response.actionIdentifier

  if ((action === 'once' || action === 'deny') && data.key && data.approvalId) {
    const card = promptsFor(data.key).approvals.find(found => found.approvalId === data.approvalId)

    if (card) {
      void answerApproval(data.key, card, action).catch((error: unknown) => console.warn('Could not answer from the notification', error))
    }

    void ExpoNotifications.dismissNotificationAsync(response.notification.request.identifier)

    return
  }

  if (data.url) {
    router.push(data.url.replace(/^hermes:\/\//, '/') as never)
  }
}

// ------------------------------------------------------------ wiring

let started = false

/** Starts the background rules once, when the app starts. */
export function startBackground() {
  if (started) {
    return
  }

  started = true

  void setUpNotifications().catch((error: unknown) => console.warn('Could not set up notifications', error))
  ExpoNotifications.addNotificationResponseReceivedListener(handleNotificationResponse)

  const sync = () =>
    control.update({
      appActive: $appActive.get(),
      keepConnected: $keepConnected.get(),
      signedIn: $auth.get().phase === 'signed-in',
      activity: activity()
    })

  $appActive.listen(active => {
    sync()

    if (active) {
      $batteryRestricted.set(!background.isIgnoringBatteryOptimizations())
    }
  })
  $keepConnected.listen(sync)
  $auth.listen(sync)
  $localMarkers.listen(sync)
  sync()

  onPromptsChange((key, prompts) => notifications.promptsChanged(key, prompts, context(key)))

  // Cards that were quiet because their session was on screen need a
  // notification once the app leaves the screen, and lose it when it's back.
  const recheck = () => {
    for (const [key, prompts] of Object.entries($prompts.get())) {
      notifications.promptsChanged(key, prompts, context(key))
    }
  }

  $appActive.listen(recheck)
  $onScreen.listen(recheck)

  onSessionEvent((key, event) => {
    if (event.type === 'message.complete') {
      const status = (event.payload as { status?: string } | undefined)?.status
      notifications.turnEnded(key, status === 'error', context(key))
    }
  })

  $onScreen.listen(key => {
    if (key) {
      notifications.sessionOpened(key)
    }
  })

  let network: NetworkState | null = null

  NetInfo.addEventListener((state: NetInfoState) => {
    const next: NetworkState = {
      isConnected: state.isConnected,
      type: state.type,
      address: (state.details as { ipAddress?: string } | null)?.ipAddress ?? null
    }
    const connection = $gateway.get()?.connection

    if (connection && network) {
      applyNetworkChange(connection, network, next)
    }

    network = next
  })
}
