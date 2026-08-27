import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { type HTMLAttributes } from 'react'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors duration-[var(--dur-fast)]',
  {
    variants: {
      variant: {
        default: 'bg-primary-soft text-primary',
        primary: 'bg-primary text-primary-foreground',
        success: 'bg-success-soft text-success',
        warning: 'bg-warning-soft text-warning',
        destructive: 'bg-destructive-soft text-destructive',
        info: 'bg-info-soft text-info',
        accent: 'bg-accent-soft text-accent',
        outline: 'border border-border text-on-surface-variant',
        ghost: 'bg-surface-container-high text-on-surface-variant',
      },
      size: {
        default: 'px-2.5 py-0.5 text-xs',
        sm: 'px-2 py-0.5 text-[10px]',
        lg: 'px-3 py-1 text-sm',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
)

interface BadgeProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {
  pulse?: boolean
}

function Badge({ className, variant, size, pulse, children, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant, size }), className)} {...props}>
      {pulse && (
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full rounded-full bg-current opacity-75 animate-ping-soft" />
          <span className="relative inline-flex size-1.5 rounded-full bg-current" />
        </span>
      )}
      {children}
    </div>
  )
}

export { Badge, badgeVariants }
