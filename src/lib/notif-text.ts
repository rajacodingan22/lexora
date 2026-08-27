import type { Notification } from '@/types'
import type { TFunc } from '@/lib/i18n/translate'

/**
 * Render notifikasi sesuai bahasa UI.
 * Jika notifikasi memakai template_key (data + params), terjemahkan via i18n.
 * Fallback ke title/body mentah untuk data lama tanpa template.
 */
export function renderNotification(n: Notification, t: TFunc): { title: string; body: string } {
  const key = n.template_key
  const params = (n.params ?? {}) as Record<string, string | number>

  if (key) {
    const titleKey = `ui2.notif.tpl.${key}.title`
    const bodyKey = `ui2.notif.tpl.${key}.body`
    const title = t(titleKey, params)
    // Bila key tidak ditemukan di kamus, t() mengembalikan key itu sendiri → gunakan data mentah
    if (title !== titleKey) {
      const body = t(bodyKey, params)
      return { title, body: body === bodyKey ? n.body : body }
    }
  }
  return { title: n.title, body: n.body }
}