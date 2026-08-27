import { createClient } from './supabase-client'

export async function getSettingsMap(): Promise<Record<string, string>> {
  try {
    const supabase = createClient()
    const { data } = await supabase.from('system_settings').select('key, value')
    const map: Record<string, string> = {}
    for (const row of data ?? []) {
      map[row.key] = String(row.value ?? '')
    }
    return map
  } catch {
    return {}
  }
}

export function settingEnabled(settings: Record<string, string>, key: string, defaultValue: boolean): boolean {
  const value = settings[key]
  if (value === undefined) return defaultValue
  return value !== 'false'
}
