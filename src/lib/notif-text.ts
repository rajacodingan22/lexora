import type { Notification } from '@/types'
import type { TFunc } from '@/lib/i18n/translate'
import { getMessages } from '@/lib/i18n/registry'
import { makeT } from '@/lib/i18n/translate'

const enMessages = getMessages('en')
const tEn = makeT(enMessages, enMessages)

/**
 * Render notifikasi — always English (per product decision), regardless of UI language.
 * Uses English dictionary only. Fallback to raw title/body for legacy rows.
 */
export function renderNotification(n: Notification, _t: TFunc): { title: string; body: string } {
  const key = n.template_key
  const params = (n.params ?? {}) as Record<string, string | number>

  if (key) {
    const titleKey = `ui2.notif.tpl.${key}.title`
    const bodyKey = `ui2.notif.tpl.${key}.body`
    const title = tEn(titleKey, params)
    if (title !== titleKey) {
      const body = tEn(bodyKey, params)
      return { title, body: body === bodyKey ? n.body : body }
    }
  }
  // For non-template or missing key, return raw which is already English for new pushes
  return { title: n.title, body: n.body }
}