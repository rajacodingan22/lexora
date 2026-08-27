import type { Lang } from './config'
import { DEFAULT_LANG } from './config'
import type { Messages } from './translate'

import common from './namespaces/common'
import { publicNs } from './namespaces/public'
import landing from './namespaces/landing'
import student1 from './namespaces/student1'
import student2 from './namespaces/student2'
import student3 from './namespaces/student3'
import admin1 from './namespaces/admin1'
import admin2 from './namespaces/admin2'
import teacher1 from './namespaces/teacher1'
import teacher2 from './namespaces/teacher2'
import ui from './namespaces/ui'
import ui2 from './namespaces/ui2'
import adminLearning from './namespaces/adminLearning'
import studentLearning from './namespaces/studentLearning'

type Namespace = Record<string, Record<string, string>>

const namespaces: Record<string, Namespace> = {
  common,
  public: publicNs,
  landing,
  student1,
  student2,
  student3,
  admin1,
  admin2,
  teacher1,
  teacher2,
  ui,
  ui2,
  adminLearning,
  studentLearning,
}

function buildLang(lang: Lang): Messages {
  const merged: Messages = {}
  for (const ns of Object.values(namespaces)) {
    const dict = ns[lang]
    if (!dict) continue
    Object.assign(merged, dict)
  }
  return merged
}

const messagesCache = new Map<Lang, Messages>()

export function getMessages(lang: Lang): Messages {
  let cached = messagesCache.get(lang)
  if (!cached) {
    cached = buildLang(lang)
    messagesCache.set(lang, cached)
  }
  return cached
}

export const FALLBACK_MESSAGES: Messages = getMessages(DEFAULT_LANG)

export function getAvailableLangs(): Lang[] {
  return (Object.keys(namespaces) as string[]).length > 0
    ? (['en', 'id', 'zh'] as Lang[])
    : (['en', 'id', 'zh'] as Lang[])
}
