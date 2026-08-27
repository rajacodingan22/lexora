import type { ElementType } from 'react'
import { Award, GraduationCap, Trophy, CheckCircle2, Star } from 'lucide-react'
import { cn } from '@/lib/utils'

export const BADGE_TYPES = ['graduation', 'top_scorer', 'perfect_attendance', 'milestone'] as const
export type BadgeType = (typeof BADGE_TYPES)[number]

export const BADGE_STYLE: Record<string, { from: string; to: string; icon: ElementType }> = {
  graduation: { from: '#10b981', to: '#0d9488', icon: GraduationCap },
  top_scorer: { from: '#f59e0b', to: '#ea580c', icon: Trophy },
  perfect_attendance: { from: '#0ea5e9', to: '#2563eb', icon: CheckCircle2 },
  milestone: { from: '#8b5cf6', to: '#7c3aed', icon: Star },
}

interface BadgeHexagonProps {
  type: string
  title?: string
  description?: string
  photoUrl?: string | null
  size?: number
  className?: string
}

function hexagonPoints(size: number, inset = 0): string {
  const half = size / 2
  return [
    `${half},${1 + inset}`,
    `${size - 1 - inset},${half / 2 + 1 + inset}`,
    `${size - 1 - inset},${size - half / 2 - 1 - inset}`,
    `${half},${size - 1 - inset}`,
    `${1 + inset},${size - half / 2 - 1 - inset}`,
    `${1 + inset},${half / 2 + 1 + inset}`,
  ].join(' ')
}

export function BadgeHexagon({ type, title, description, photoUrl, size = 56, className }: BadgeHexagonProps) {
  const cfg = BADGE_STYLE[type] || { from: '#6366f1', to: '#8b5cf6', icon: Award }
  const Icon = cfg.icon
  const half = size / 2
  const uid = `${type}-${size}`
  const gradId = `badge-grad-${uid}`
  const clipId = `badge-clip-${uid}`
  const shineId = `badge-shine-${uid}`
  const inset = Math.max(2, Math.round(size * 0.045))
  const emblemR = Math.max(8, Math.round(size * 0.185))
  const emblemCx = size - emblemR - size * 0.06
  const emblemCy = size - emblemR - size * 0.06
  const emblemIcon = Math.round(emblemR * 1.05)

  return (
    <span
      title={title}
      aria-label={title || type}
      className={cn('group relative inline-flex shrink-0', className)}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="drop-shadow-lg transition-transform duration-300 group-hover:scale-105"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={cfg.from} />
            <stop offset="100%" stopColor={cfg.to} />
          </linearGradient>
          <clipPath id={clipId}>
            <polygon points={hexagonPoints(size, inset)} />
          </clipPath>
          <linearGradient id={shineId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.28" />
            <stop offset="45%" stopColor="#ffffff" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.22" />
          </linearGradient>
        </defs>

        <polygon points={hexagonPoints(size, 0)} fill={`url(#${gradId})`} />

        {photoUrl ? (
          <>
            <image
              href={photoUrl}
              x="0"
              y="0"
              width={size}
              height={size}
              preserveAspectRatio="xMidYMid slice"
              clipPath={`url(#${clipId})`}
            />
            <polygon points={hexagonPoints(size, inset)} fill={`url(#${shineId})`} />
            <polygon
              points={hexagonPoints(size, inset)}
              fill="none"
              stroke="#ffffff"
              strokeOpacity="0.85"
              strokeWidth={Math.max(1.5, size * 0.03)}
            />
          </>
        ) : (
          <>
            <polygon points={hexagonPoints(size, inset)} fill={`url(#${shineId})`} />
            <polygon
              points={hexagonPoints(size, inset)}
              fill="none"
              stroke="#ffffff"
              strokeOpacity="0.55"
              strokeWidth={Math.max(1, size * 0.016)}
            />
          </>
        )}

        <circle cx={emblemCx} cy={emblemCy} r={emblemR} fill="#ffffff" />
      </svg>

      {photoUrl ? (
        <Icon
          className="pointer-events-none absolute text-on-surface drop-shadow"
          style={{
            left: emblemCx - emblemIcon / 2,
            top: emblemCy - emblemIcon / 2,
            width: emblemIcon,
            height: emblemIcon,
            color: cfg.to,
          }}
        />
      ) : (
        <Icon
          className="pointer-events-none absolute text-white drop-shadow"
          style={{
            left: half - size * 0.21,
            top: half - size * 0.21,
            width: size * 0.42,
            height: size * 0.42,
          }}
        />
      )}

      {description && <span className="sr-only">{description}</span>}
    </span>
  )
}
