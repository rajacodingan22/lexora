'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n/client'
import { cn } from '@/lib/utils'

interface BatchCountdownProps {
  endDate: string | null
  startDate?: string | null
  status?: string
  compact?: boolean
  className?: string
}

function partsDiff(target: Date, now: Date) {
  const diff = target.getTime() - now.getTime()
  if (diff <= 0) return null
  const totalSeconds = Math.floor(diff / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return { days, hours, minutes, seconds }
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

export function BatchCountdown({ endDate, status, compact, className }: BatchCountdownProps) {
  const { t } = useI18n()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  if (!endDate) return null

  const target = new Date(endDate)
  const remaining = partsDiff(target, new Date(now))

  if (remaining === null) {
    return (
      <p className={cn('text-xs', status === 'completed' ? 'text-muted' : 'text-[10px] text-muted uppercase tracking-wider', className)}>
        {t('teacher1.kelas.countdownEnded')}
      </p>
    )
  }

  const timeStr = `${pad(remaining.hours)}:${pad(remaining.minutes)}:${pad(remaining.seconds)}`

  if (compact) {
    const nearEnd = remaining.days < 7 && remaining.days >= 0
    return (
      <p className={cn('text-xs font-medium tabular-nums', nearEnd ? 'text-amber-400' : 'text-muted', className)}>
        {t('teacher1.kelas.countdownCompact', { days: remaining.days, time: timeStr })}
      </p>
    )
  }

  const blocks = [
    { label: t('teacher1.kelas.countdownDay'), value: remaining.days },
    { label: t('teacher1.kelas.countdownHour'), value: remaining.hours },
    { label: t('teacher1.kelas.countdownMinute'), value: remaining.minutes },
    { label: t('teacher1.kelas.countdownSecond'), value: remaining.seconds },
  ]

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] uppercase tracking-wider text-muted">{t('teacher1.kelas.countdownLabel')}</p>
      <div className="flex items-center gap-1.5">
        {blocks.map((b, i) => (
          <div key={b.label} className="flex items-center gap-1.5">
            <div className="flex flex-col items-center rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-2 py-1 min-w-[52px]">
              <span className="text-base font-bold text-emerald-400 tabular-nums leading-tight">{pad(b.value)}</span>
              <span className="text-[9px] uppercase tracking-wider text-muted">{b.label}</span>
            </div>
            {i < blocks.length - 1 && <span className="text-muted font-bold">:</span>}
          </div>
        ))}
      </div>
    </div>
  )
}