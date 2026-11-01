import type { PasswordStore } from '@/storage/saved-password'

/** expo-secure-store in memory, for tests. `values` shows what the phone would hold. */
export function memoryPasswordStore(): PasswordStore & { values: Map<string, string> } {
  const values = new Map<string, string>()

  return {
    values,
    getItemAsync: async key => values.get(key) ?? null,
    setItemAsync: async (key, value) => {
      values.set(key, value)
    },
    deleteItemAsync: async key => {
      values.delete(key)
    }
  }
}
