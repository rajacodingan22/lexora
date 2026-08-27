import { cn } from '@/lib/utils'

export function flagCode(emoji: string | null | undefined): string | null {
  if (!emoji) return null
  const indicators = emoji.match(/[\u{1F1E6}-\u{1F1FF}]/gu)
  if (!indicators || indicators.length !== 2) return null
  const a = indicators[0].codePointAt(0)! - 0x1f1e6 + 65
  const b = indicators[1].codePointAt(0)! - 0x1f1e6 + 65
  return String.fromCharCode(a) + String.fromCharCode(b)
}

export function flagSrc(emoji: string | null | undefined, size: 'w40' | 'w80' = 'w40'): string | null {
  const code = flagCode(emoji)
  return code ? `https://flagcdn.com/${size}/${code.toLowerCase()}.png` : null
}

interface FlagProps {
  emoji?: string | null
  alt?: string
  className?: string
}

export function Flag({ emoji, alt, className }: FlagProps) {
  const src = flagSrc(emoji)
  if (!src) return <span className={className}>{emoji}</span>
  return (
    <img
      src={src}
      srcSet={`${flagSrc(emoji, 'w80')} 2x`}
      alt={alt || ''}
      loading="lazy"
      className={cn('inline-block h-[1em] w-auto shrink-0 rounded-[2px] object-cover align-[-0.125em]', className)}
    />
  )
}
