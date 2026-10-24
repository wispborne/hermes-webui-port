import { useStore } from '@nanostores/react'
import { useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { Button, Checkbox, Chip, Dialog, IconButton, Portal, Text, TextInput } from 'react-native-paper'

import { useConnectionStatus } from '@/hooks/use-connection-status'
import { t } from '@/i18n/t'
import {
  $prompts,
  type Answer,
  answerApproval,
  type ApprovalCard as ApprovalCardData,
  type ApprovalChoice,
  cancelQuestions,
  type QuestionCard as QuestionCardData,
  sendAnswers,
  setAnswer,
  showQuestion
} from '@/store/prompts'
import { space } from '@/theme/compact'
import { useHermesTheme } from '@/theme/use-hermes-theme'

const CHOICE_LABEL: Record<ApprovalChoice, () => string> = {
  once: () => t('assistant.approval.run'),
  session: () => t('assistant.approval.allowSession'),
  always: () => t('assistant.approval.alwaysAllow'),
  deny: () => t('assistant.approval.reject')
}

function ApprovalCard({ card, sessionKey, total }: { card: ApprovalCardData; sessionKey: string; total: number }) {
  const { colors } = useHermesTheme()
  const online = useConnectionStatus() === 'open'
  const [confirmAlways, setConfirmAlways] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const answer = (choice: ApprovalChoice) => {
    setError(null)
    answerApproval(sessionKey, card, choice).catch(() => setError(t('assistant.approval.sendFailed')))
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.surfaceContainer, borderColor: colors.primary }]} testID="approval-card">
      <View style={styles.headerRow}>
        <Text style={styles.flex} variant="titleSmall">
          {t('notifications.native.approvalTitle')}
        </Text>
        {total > 1 ? (
          <Text style={{ color: colors.onSurfaceVariant }} testID="approval-position" variant="labelSmall">
            {t('app.approval.stackPosition', { position: 1, total })}
          </Text>
        ) : null}
      </View>
      {card.description ? (
        <Text style={{ color: colors.onSurfaceVariant }} variant="bodySmall">
          {card.description}
        </Text>
      ) : null}
      <ScrollView horizontal style={[styles.command, { backgroundColor: colors.surfaceVariant }]}>
        <Text selectable style={[styles.mono, { color: colors.onSurface }]}>
          {card.command}
        </Text>
      </ScrollView>
      {error ? (
        <Text style={{ color: colors.error }} variant="bodySmall">
          {error}
        </Text>
      ) : null}
      <View style={styles.choices}>
        {card.choices.map(choice => (
          <Button
            compact
            disabled={!online}
            key={choice}
            mode={choice === 'once' ? 'contained' : choice === 'deny' ? 'outlined' : 'contained-tonal'}
            onPress={() => (choice === 'always' ? setConfirmAlways(true) : answer(choice))}
            testID={`approval-${choice}`}
            textColor={choice === 'deny' ? colors.error : undefined}
          >
            {CHOICE_LABEL[choice]()}
          </Button>
        ))}
      </View>
      <Portal>
        <Dialog onDismiss={() => setConfirmAlways(false)} visible={confirmAlways}>
          <Dialog.Title>{t('assistant.approval.alwaysTitle')}</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">{t('assistant.approval.alwaysDescription', { pattern: card.pattern })}</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmAlways(false)}>{t('common.cancel')}</Button>
            <Button
              onPress={() => {
                setConfirmAlways(false)
                answer('always')
              }}
              testID="approval-always-confirm"
            >
              {t('assistant.approval.alwaysAllow')}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  )
}

const RECOMMENDED = /\s*\(recommended\)\s*$/i

function QuestionCard({ card, sessionKey }: { card: QuestionCardData; sessionKey: string }) {
  const { colors } = useHermesTheme()
  const online = useConnectionStatus() === 'open'
  const [confirmClose, setConfirmClose] = useState(false)
  const question = card.questions[card.index]
  const answer: Answer | undefined = question ? card.answers[question.qid] : undefined
  const last = card.index === card.questions.length - 1
  const choices = question?.choices ?? []
  const picked = Array.isArray(answer) ? answer : []
  const freeText = typeof answer === 'string' && !choices.includes(answer) ? answer : ''

  if (!question) {
    return null
  }

  const next = () => (last ? sendAnswers(sessionKey) : showQuestion(sessionKey, card.index + 1))

  return (
    <View style={[styles.card, { backgroundColor: colors.surfaceContainer, borderColor: colors.primary }]} testID="question-card">
      <View style={styles.headerRow}>
        <Text style={[styles.flex, { color: colors.onSurfaceVariant }]} variant="labelSmall">
          {card.questions.length > 1
            ? t('app.question.position', { position: card.index + 1, total: card.questions.length })
            : t('notifications.native.inputTitle')}
        </Text>
        <IconButton accessibilityLabel={t('app.question.close')} icon="close" onPress={() => setConfirmClose(true)} size={18} style={styles.close} />
      </View>
      <Text variant="titleSmall">{question.question}</Text>
      {choices.length ? (
        <Text style={{ color: colors.onSurfaceVariant }} variant="labelSmall">
          {question.multi_select ? t('assistant.clarify.multiSelectHint') : t('assistant.clarify.singleSelectHint')}
        </Text>
      ) : null}
      <View style={question.multi_select ? undefined : styles.choiceRow}>
        {choices.map(choice => {
          const label = choice.replace(RECOMMENDED, '')
          const recommended = RECOMMENDED.test(choice)

          if (question.multi_select) {
            return (
              <Checkbox.Item
                key={choice}
                label={label}
                labelStyle={styles.checkboxLabel}
                labelVariant="bodyMedium"
                mode="android"
                onPress={() => setAnswer(sessionKey, picked.includes(choice) ? picked.filter(found => found !== choice) : [...picked, choice])}
                position="leading"
                status={picked.includes(choice) ? 'checked' : 'unchecked'}
                style={styles.checkbox}
              />
            )
          }

          return (
            <Chip
              compact
              key={choice}
              mode={answer === choice ? 'flat' : 'outlined'}
              onPress={() => setAnswer(sessionKey, choice)}
              selected={answer === choice}
              showSelectedOverlay
            >
              {recommended ? `${label} · ${t('app.question.recommended')}` : label}
            </Chip>
          )
        })}
      </View>
      {!question.multi_select ? (
        <TextInput
          dense
          mode="outlined"
          onChangeText={text => setAnswer(sessionKey, text)}
          placeholder={choices.length ? t('assistant.clarify.other') : t('assistant.clarify.placeholder')}
          testID="question-free-text"
          value={freeText}
        />
      ) : null}
      <View style={styles.choices}>
        {card.index > 0 ? (
          <Button compact onPress={() => showQuestion(sessionKey, card.index - 1)}>
            {t('app.question.back')}
          </Button>
        ) : null}
        <View style={styles.flex} />
        <Button
          compact
          onPress={() => {
            setAnswer(sessionKey, null)
            next()
          }}
          testID="question-skip"
        >
          {t('assistant.clarify.skip')}
        </Button>
        <Button compact disabled={last && !online} mode="contained" onPress={next} testID="question-next">
          {last ? t('composer.send') : t('app.question.next')}
        </Button>
      </View>
      <Portal>
        <Dialog onDismiss={() => setConfirmClose(false)} visible={confirmClose}>
          <Dialog.Title>{t('app.question.closeTitle')}</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">{t('app.question.closeBody')}</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmClose(false)}>{t('app.question.keepAnswering')}</Button>
            <Button
              onPress={() => {
                setConfirmClose(false)
                cancelQuestions(sessionKey)
              }}
              textColor={colors.error}
            >
              {t('app.question.cancelQuestions')}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  )
}

/** The Approval and Question cards of one session, pinned above the message box. */
export function PromptCards({ sessionKey }: { sessionKey: string }) {
  const prompts = useStore($prompts)[sessionKey]

  if (!prompts) {
    return null
  }

  return (
    <ScrollView style={styles.cards} keyboardShouldPersistTaps="handled">
      {prompts.question ? <QuestionCard card={prompts.question} sessionKey={sessionKey} /> : null}
      {prompts.approvals[0] ? (
        <ApprovalCard card={prompts.approvals[0]} key={prompts.approvals[0].approvalId} sessionKey={sessionKey} total={prompts.approvals.length} />
      ) : null}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, gap: space.listGap, margin: space.listGap, padding: space.screen },
  cards: { flexGrow: 0, maxHeight: '60%' },
  checkbox: { paddingHorizontal: 0, paddingVertical: 0 },
  checkboxLabel: { textAlign: 'left' },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.step * 2 },
  choices: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: space.step * 2 },
  close: { margin: -8 },
  command: { borderRadius: 6, maxHeight: 120 },
  flex: { flex: 1 },
  headerRow: { alignItems: 'center', flexDirection: 'row' },
  mono: { fontFamily: 'monospace', fontSize: 13, padding: space.listGap }
})
