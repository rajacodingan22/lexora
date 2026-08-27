import { cn } from '@/lib/utils'
import { getI18n } from '@/lib/i18n/server'

export async function SkipToContent() {
  const { t } = await getI18n()
  return (
    <a
      href="#main-content"
      className={cn(
        'sr-only',
        'focus:not-sr-only focus:fixed focus:left-0 focus:top-0 focus:z-[9999]',
        'focus:px-5 focus:py-4',
        'focus:bg-primary focus:text-primary-foreground focus:font-semibold',
        'focus:rounded-br-md focus:no-underline',
        'focus:outline-none focus:ring-2 focus:ring-ring',
      )}
    >
      {t('ui2.skip.main')}
    </a>
  )
}