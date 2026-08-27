'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { HelpCircle, X, Sparkles, ArrowRight } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useI18n } from '@/lib/i18n/client'
import { createClient } from '@/lib/supabase-client'
import { Button } from '@/components/ui/button'

const POPUP_INTERVAL_MS = 5 * 60 * 1000
const POPUP_DURATION_MS = 5000
const FIRST_DELAY_MS = 3000

const LOCALE_MAP: Record<string, string> = { en: 'en-US', id: 'id-ID', zh: 'zh-CN' }

interface PopupConfig {
  personalityLink: string
  price: number | null
  bonus: number | null
}

export function PlacementPromptPopup() {
  const { user } = useAuth()
  const { t, lang } = useI18n()
  const router = useRouter()
  const [config, setConfig] = useState<PopupConfig | null>(null)
  const [visible, setVisible] = useState(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const configRef = useRef<PopupConfig | null>(null)

  const evaluate = useCallback(async (): Promise<boolean> => {
    if (!user || user.role !== 'student') return false
    const supabase = createClient()

    const [{ data: settingsData }, { data: trialData }] = await Promise.all([
      supabase.from('system_settings').select('key, value'),
      supabase.from('courses').select('id').eq('is_try_class', true).eq('status', 'active').limit(1),
    ])

    const map: Record<string, unknown> = {}
    for (const row of settingsData ?? []) map[row.key] = row.value

    if (map.placement_popup_enabled === false) return false
    if (!(trialData?.length)) return false

    const { data: enrData } = await supabase
      .from('enrollments')
      .select('course:courses(is_try_class)')
      .eq('user_id', user.id)
      .in('status', ['active', 'pending_payment'])

    const bought = (enrData ?? []).some((e: any) => !e.course?.is_try_class)
    if (bought) return false

    const nextConfig: PopupConfig = {
      personalityLink: (map.personality_test_link as string) || '',
      price: typeof map.placement_test_price === 'number' ? map.placement_test_price : null,
      bonus: typeof map.placement_bonus_meetings === 'number' ? map.placement_bonus_meetings : null,
    }
    configRef.current = nextConfig
    setConfig(nextConfig)
    return true
  }, [user])

  const show = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    setVisible(true)
    hideTimer.current = setTimeout(() => setVisible(false), POPUP_DURATION_MS)
  }, [])

  const dismiss = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    setVisible(false)
  }, [])

  useEffect(() => {
    if (!user || user.role !== 'student') return

    const first = setTimeout(async () => {
      if (await evaluate()) show()
    }, FIRST_DELAY_MS)

    const interval = setInterval(async () => {
      if (await evaluate()) show()
      else dismiss()
    }, POPUP_INTERVAL_MS)

    return () => {
      clearTimeout(first)
      clearInterval(interval)
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [user, evaluate, show, dismiss])

  if (!visible || !config) return null

  const price = config.price != null
    ? new Intl.NumberFormat(LOCALE_MAP[lang] || 'id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
      }).format(config.price)
    : ''

  return (
    <div
      className="fixed bottom-4 right-4 z-[80] w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-primary/30 bg-surface-container-high shadow-2xl animate-toast-in"
      role="alert"
    >
      <div className="h-1 w-full bg-gradient-to-r from-primary via-primary/60 to-primary/20" />
      <div className="flex items-start gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft">
          <HelpCircle className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-on-surface">{t('ui2.placementPopup.title')}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-on-surface-variant">
            {t('ui2.placementPopup.desc')}
          </p>
          {(price || config.bonus != null) && (
            <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-primary">
              <Sparkles className="h-3 w-3 shrink-0" />
              {t('ui2.placementPopup.priceNote', {
                price: price || '-',
                count: String(config.bonus ?? 0),
              })}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => {
                dismiss()
                router.push('/student/placement-test')
              }}
            >
              {t('ui2.placementPopup.ctaLang')}
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
            {config.personalityLink && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  dismiss()
                  window.open(config.personalityLink, '_blank', 'noopener,noreferrer')
                }}
              >
                {t('ui2.placementPopup.ctaPersonality')}
              </Button>
            )}
          </div>
        </div>
        <button
          onClick={dismiss}
          aria-label={t('ui2.placementPopup.dismiss')}
          className="mt-0.5 shrink-0 text-muted transition-colors hover:text-on-surface"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
