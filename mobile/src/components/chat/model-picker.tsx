import { useEffect, useMemo, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { ActivityIndicator, Button, Dialog, List, Portal, Searchbar, Text } from 'react-native-paper'

import type { ModelChoice, ModelOptions } from '@/gateway/models-api'
import { t } from '@/i18n/t'
import { displayModelName } from '@/lib/model-names'
import { loadModelsFor, pickModel } from '@/store/models'
import { space } from '@/theme/compact'
import { useHermesTheme } from '@/theme/use-hermes-theme'

/** Without a search, each provider shows this many models, as on the desktop. */
const MODELS_PER_PROVIDER = 50

const fold = (text: string) => text.toLowerCase().replace(/[\s_\-./:]+/g, '')

/**
 * The models a session can use, by provider, with a search box. Picking one
 * switches the session to it, or, for a new session, starts the session with it.
 */
export function ModelPicker({
  current,
  onDismiss,
  onNotice,
  sessionKey,
  visible
}: {
  current: ModelChoice | null
  onDismiss: () => void
  onNotice: (text: string) => void
  sessionKey: string
  visible: boolean
}) {
  const { colors } = useHermesTheme()
  const [options, setOptions] = useState<ModelOptions | null>(null)
  const [failed, setFailed] = useState(false)
  const [query, setQuery] = useState('')
  const [confirm, setConfirm] = useState<{ choice: ModelChoice; message: string } | null>(null)

  useEffect(() => {
    if (!visible) {
      return
    }

    let live = true
    setFailed(false)
    setQuery('')
    loadModelsFor(sessionKey).then(
      loaded => live && setOptions(loaded),
      (error: unknown) => {
        console.warn('Could not load models', error)

        if (live) {
          setFailed(true)
        }
      }
    )

    return () => {
      live = false
    }
  }, [sessionKey, visible])

  const groups = useMemo(() => {
    const words = fold(query)

    return (options?.providers ?? [])
      .map(provider => {
        const models = words
          ? provider.models.filter(model => fold(`${model} ${displayModelName(model)} ${provider.name} ${provider.slug}`).includes(words))
          : provider.models.slice(0, MODELS_PER_PROVIDER)

        return { ...provider, models }
      })
      .filter(provider => provider.models.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [options, query])

  const choose = async (choice: ModelChoice, confirmed = false) => {
    onDismiss()
    setConfirm(null)

    try {
      const result = await pickModel(sessionKey, choice, confirmed)

      if (result.kind === 'confirm') {
        setConfirm({ choice, message: result.message })
      } else if (result.kind === 'next-turn') {
        onNotice(t('shell.modelMenu.pickDeferred', { model: displayModelName(choice.model) }))
      }
    } catch (error) {
      console.warn('Could not switch the model', error)
      onNotice(t('desktop.modelSwitchFailed'))
    }
  }

  const isCurrent = (provider: string, model: string) => current?.model === model && (!current.provider || current.provider === provider)

  return (
    <Portal>
      <Dialog onDismiss={onDismiss} style={styles.dialog} visible={visible}>
        <Dialog.Title>{t('modelPicker.title')}</Dialog.Title>
        <View style={styles.search}>
          <Searchbar
            autoCorrect={false}
            onChangeText={setQuery}
            placeholder={t('shell.modelMenu.search')}
            style={styles.searchbar}
            testID="model-search"
            value={query}
          />
        </View>
        <Dialog.ScrollArea style={styles.scrollArea}>
          {failed ? (
            <Text style={[styles.message, { color: colors.error }]}>{t('modelPicker.loadFailed')}</Text>
          ) : !options ? (
            <ActivityIndicator style={styles.message} />
          ) : groups.length === 0 ? (
            <Text style={[styles.message, { color: colors.onSurfaceVariant }]}>
              {options.providers.length ? t('modelPicker.noModels') : t('modelPicker.noAuthenticatedProviders')}
            </Text>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled">
              {groups.map(provider => (
                <List.Section key={provider.slug} style={styles.section}>
                  <List.Subheader style={styles.subheader}>{provider.name}</List.Subheader>
                  {provider.models.map(model => (
                    <List.Item
                      description={model}
                      descriptionNumberOfLines={1}
                      key={model}
                      onPress={() => void choose({ model, provider: provider.slug })}
                      right={props => (isCurrent(provider.slug, model) ? <List.Icon {...props} color={colors.primary} icon="check" /> : null)}
                      style={styles.item}
                      testID={`model-${provider.slug}-${model}`}
                      title={displayModelName(model)}
                    />
                  ))}
                </List.Section>
              ))}
            </ScrollView>
          )}
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={onDismiss}>{t('common.cancel')}</Button>
        </Dialog.Actions>
      </Dialog>
      <Dialog onDismiss={() => setConfirm(null)} visible={confirm !== null}>
        <Dialog.Title>
          {confirm ? t('desktop.modelSwitchConfirmTitle', { model: displayModelName(confirm.choice.model) }) : t('desktop.modelSwitchConfirmTitleFallback')}
        </Dialog.Title>
        <Dialog.Content>
          <Text variant="bodyMedium">{confirm?.message}</Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={() => setConfirm(null)}>{t('desktop.modelSwitchKeepLabel')}</Button>
          <Button onPress={() => confirm && void choose(confirm.choice, true)}>{t('desktop.modelSwitchConfirmLabel')}</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  )
}

const styles = StyleSheet.create({
  dialog: { maxHeight: '85%' },
  item: { paddingVertical: 0 },
  message: { padding: space.screen },
  scrollArea: { flexShrink: 1, paddingHorizontal: 0 },
  search: { paddingBottom: space.listGap, paddingHorizontal: space.screen },
  searchbar: { elevation: 0 },
  section: { marginVertical: 0 },
  subheader: { paddingBottom: 0 }
})
