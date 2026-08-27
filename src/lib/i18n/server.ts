import { cookies } from 'next/headers'
import { DEFAULT_LANG, isLang, LANG_COOKIE, type Lang } from './config'
import { getMessages } from './registry'
import { makeT, type TranslateVars } from './translate'

export interface ServerI18n {
  lang: Lang
  t: (key: string, vars?: TranslateVars) => string
}

export async function getI18n(): Promise<ServerI18n> {
  const cookieStore = await cookies()
  const raw = cookieStore.get(LANG_COOKIE)?.value
  const lang: Lang = isLang(raw) ? raw : DEFAULT_LANG
  const messages = getMessages(lang)
  const fallback = getMessages(DEFAULT_LANG)
  return { lang, t: makeT(messages, fallback) }
}
