export type Lang = 'en' | 'id' | 'zh'

export const SUPPORTED_LANGS: readonly Lang[] = ['en', 'id', 'zh'] as const

export const LANGS: { code: Lang; label: string; native: string }[] = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'id', label: 'Bahasa Indonesia', native: 'Bahasa Indonesia' },
  { code: 'zh', label: 'Mandarin', native: '中文（简体）' },
]

export const DEFAULT_LANG: Lang = 'en'

export const LANG_COOKIE = 'lexora_lang'

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (SUPPORTED_LANGS as readonly string[]).includes(value)
}
