import { appStrings } from './app-strings'
import desktopStrings from './en.generated.json'

const strings = { ...desktopStrings, app: appStrings }

type Leaves<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>
}[keyof T & string]

/** A dotted key such as `notifications.native.approvalTitle`, matching the desktop's keys. */
export type StringKey = Leaves<typeof strings>

/**
 * The English text for a key, with `{name}` placeholders filled in from `values`.
 * A placeholder with no value is left as it is.
 */
export function t(key: StringKey, values: Record<string, string | number> = {}): string {
  let node: unknown = strings

  for (const part of key.split('.')) {
    node = (node as Record<string, unknown>)[part]
  }

  if (typeof node !== 'string') {
    throw new Error(`No string for "${key}".`)
  }

  return node.replace(/\{([\w$]+)\}/g, (placeholder, name: string) =>
    name in values ? String(values[name]) : placeholder
  )
}
