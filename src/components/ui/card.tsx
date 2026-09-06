import { cn } from '@/lib/utils'
import { forwardRef, type HTMLAttributes } from 'react'

type DivProps = HTMLAttributes<HTMLDivElement>
type HeadingProps = HTMLAttributes<HTMLHeadingElement>
type ParaProps = HTMLAttributes<HTMLParagraphElement>

const cardVariants = {
  default:
    'rounded-3xl border border-border/50 bg-surface/80 backdrop-blur-xl text-on-surface shadow-xl shadow-black/5',
  glass:
    'glass-card-enhanced rounded-3xl border border-white/10',
  elevated:
    'rounded-3xl border border-border/50 bg-surface-container-low shadow-xl shadow-black/10 hover:shadow-2xl hover:shadow-black/15 hover:-translate-y-1 transition-all duration-300 ease-out',
  outline:
    'rounded-3xl border-2 border-dashed border-border/50 bg-surface-container-lowest/50 text-on-surface',
  ghost:
    'rounded-3xl bg-surface-container-low/50 backdrop-blur-sm text-on-surface',
  gradient:
    'rounded-3xl border border-white/10 bg-gradient-to-br from-primary/20 via-surface/50 to-accent/20 backdrop-blur-xl text-on-surface shadow-2xl shadow-primary/10',
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
        'relative overflow-hidden',
        interactive &&
          'cursor-pointer hover:-translate-y-2 hover:shadow-2xl hover:border-primary/30 group',
        'transition-all duration-300 ease-out',
        className
      )}
      {...props}
    />
  )
)
Card.displayName = 'Card'

const CardHeader = forwardRef<HTMLDivElement, DivProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col gap-2 p-6', className)} {...props} />
  )
)
CardHeader.displayName = 'CardHeader'

const CardTitle = forwardRef<HTMLHeadingElement, HeadingProps>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn('text-xl font-bold text-on-surface leading-tight tracking-tight', className)}
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
      className={cn('flex items-center justify-between gap-3 border-t border-border/30 p-6', className)}
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
