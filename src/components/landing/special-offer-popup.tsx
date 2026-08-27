'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Gift, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth-context'
import { useI18n } from '@/lib/i18n/client'

const FIRST_DELAY = 5000
const REPEAT_INTERVAL = 5 * 60 * 1000
const CLAIM_KEY = 'lexora_claim_reward'

export function SpecialOfferPopup() {
  const { user, loading } = useAuth()
  const { t } = useI18n()
  const [claimed, setClaimed] = useState(false)
  const [visible, setVisible] = useState(false)

  // Reward hanya untuk pengunjung yang belum pernah klaim
  useEffect(() => {
    try {
      if (localStorage.getItem(CLAIM_KEY) === '1') setClaimed(true)
    } catch {
      // localStorage tidak tersedia — abaikan
    }
  }, [])

  // Muncul tiap 5 menit selama belum di-claim & belum login
  useEffect(() => {
    if (loading || user || claimed) return
    let interval: ReturnType<typeof setInterval> | undefined

    const show = () => {
      setVisible(true)
      if (!interval) interval = setInterval(show, REPEAT_INTERVAL)
    }

    const timeout = setTimeout(show, FIRST_DELAY)
    return () => {
      clearTimeout(timeout)
      if (interval) clearInterval(interval)
    }
  }, [loading, user, claimed])

  const handleClaim = () => {
    try {
      localStorage.setItem(CLAIM_KEY, '1')
    } catch {
      // abaikan
    }
    setClaimed(true)
    setVisible(false)
  }

  if (claimed || loading || user || !visible) return null

  return (
    <div
      role="dialog"
      aria-label={t('landing.offer.ariaLabel')}
      className="fixed bottom-4 right-4 z-[60] w-[calc(100vw-2rem)] max-w-sm animate-slide-up rounded-2xl border border-primary/30 bg-surface-container-lowest p-5 shadow-2xl shadow-black/20"
    >
      <button
        onClick={() => setVisible(false)}
        className="absolute right-3 top-3 rounded-md p-1 text-on-surface-variant transition-colors hover:bg-surface-hover hover:text-on-surface"
        aria-label={t('landing.offer.closeAria')}
      >
        <X className="size-4" />
      </button>

      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <Gift className="size-5" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">{t('landing.offer.badge')}</p>
          <h3 className="text-base font-bold text-on-surface">{t('landing.offer.title')}</h3>
        </div>
      </div>

      <p className="mt-3 text-sm text-on-surface-variant">
        {t('landing.offer.body')}
      </p>

      <Link
        href="/daftar"
        onClick={handleClaim}
        className="mt-4 block"
      >
        <Button variant="gradient" size="lg" className="w-full">
          {t('landing.offer.cta')}
        </Button>
      </Link>
    </div>
  )
}
