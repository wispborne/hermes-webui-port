import { useStore } from '@nanostores/react'
import * as ExpoNotifications from 'expo-notifications'
import { atom } from 'nanostores'
import { Button, Dialog, Portal, Text } from 'react-native-paper'

import * as background from '../../modules/hermes-background'
import { t } from '@/i18n/t'
import { saveAppSettings } from '@/storage/app-settings'

import { $batteryRestricted } from './wiring'

type Step = 'notifications' | 'battery' | null

const $step = atom<Step>(null)

/**
 * Explains, then asks for, the notification permission and the battery
 * exemption, one after the other. Each request is skipped when already granted.
 */
export async function askBackgroundPermissions() {
  saveAppSettings({ backgroundAsked: true })

  const notifications = await ExpoNotifications.getPermissionsAsync().catch(() => null)

  if (notifications && !notifications.granted && notifications.canAskAgain) {
    $step.set('notifications')
  } else if (!background.isIgnoringBatteryOptimizations()) {
    $step.set('battery')
  }
}

function next(from: Step) {
  $step.set(from === 'notifications' && !background.isIgnoringBatteryOptimizations() ? 'battery' : null)
}

/** The explanation dialogs. Rendered once, in the root layout. */
export function BackgroundPermissionDialogs() {
  const step = useStore($step)

  return (
    <Portal>
      <Dialog dismissable={false} visible={step !== null}>
        <Dialog.Title>{step === 'battery' ? t('app.background.batteryTitle') : t('app.background.notificationsTitle')}</Dialog.Title>
        <Dialog.Content>
          <Text variant="bodyMedium">{step === 'battery' ? t('app.background.batteryWhy') : t('app.background.notificationsWhy')}</Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={() => next(step)}>{t('app.background.notNow')}</Button>
          <Button
            onPress={async () => {
              if (step === 'notifications') {
                await ExpoNotifications.requestPermissionsAsync().catch(() => undefined)
                next('notifications')
              } else {
                $step.set(null)
                background.requestIgnoreBatteryOptimizations()
              }

              $batteryRestricted.set(!background.isIgnoringBatteryOptimizations())
            }}
            testID="permission-continue"
          >
            {t('common.continue')}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  )
}
