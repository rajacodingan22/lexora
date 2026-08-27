import { cn } from '@/lib/utils'
import { forwardRef, type HTMLAttributes } from 'react'

type DivProps = HTMLAttributes<HTMLDivElement>
type HeadingProps = HTMLAttributes<HTMLHeadingElement>
type ParaProps = HTMLAttributes<HTMLParagraphElement>

const cardVariants = {
  default:
    'rounded-2xl border border-border bg-surface text-on-surface shadow-sm',
  glass:
    'glass-card rounded-2xl',
  elevated:
    'rounded-2xl border border-border bg-surface-container-low text-on-surface shadow-md hover:shadow-lg hover:border-border-strong transition-all duration-[var(--dur)] ease-[var(--ease-out)]',
  outline:
    'rounded-2xl border-2 border-dashed border-border bg-surface-container-lowest text-on-surface',
  ghost:
    'rounded-2xl bg-surface-container-low text-on-surface',
  gradient:
    'rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-surface to-accent/10 text-on-surface',
} as const

type CardVariant = keyof typeof cardVariants

export interface CardProps extends DivProps {
  variant?: CardVariant
  interactive?: boolean
}

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'default', interactive, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        cardVariants[variant],
        'relative',
        interactive &&
          'cursor-pointer hover:-translate-y-1 hover:shadow-lg hover:border-border-strong',
        'transition-all duration-[var(--dur)] ease-[var(--ease-out)]',
        className
      )}
      {...props}
    />
  )
)
Card.displayName = 'Card'

const CardHeader = forwardRef<HTMLDivElement, DivProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col gap-1.5 p-6', className)} {...props} />
  )
)
CardHeader.displayName = 'CardHeader'

const CardTitle = forwardRef<HTMLHeadingElement, HeadingProps>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn('text-lg font-bold text-on-surface leading-tight tracking-tight', className)}
      {...props}
    />
  )
)
CardTitle.displayName = 'CardTitle'

const CardDescription = forwardRef<HTMLParagraphElement, ParaProps>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-sm text-on-surface-variant leading-relaxed', className)} {...props} />
  )
)
CardDescription.displayName = 'CardDescription'

const CardContent = forwardRef<HTMLDivElement, DivProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  )
)
CardContent.displayName = 'CardContent'

const CardFooter = forwardRef<HTMLDivElement, DivProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex items-center justify-between gap-3 border-t border-border p-6', className)}
      {...props}
    />
  )
)
CardFooter.displayName = 'CardFooter'

const CardAction = forwardRef<HTMLDivElement, DivProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('absolute right-4 top-4 z-10', className)} {...props} />
  )
)
CardAction.displayName = 'CardAction'

const CardDivider = forwardRef<HTMLDivElement, DivProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('h-px w-full divider-soft', className)} {...props} />
  )
)
CardDivider.displayName = 'CardDivider'

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  CardAction,
  CardDivider,
  cardVariants,
}
