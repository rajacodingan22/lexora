import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { type HTMLAttributes } from 'react'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold tracking-wide transition-all duration-300 ease-out',
  {
    variants: {
      variant: {
        default: 'bg-gradient-to-r from-primary/20 to-primary/10 text-primary border border-primary/20',
        primary: 'bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-md shadow-primary/25',
        success: 'bg-gradient-to-r from-success/20 to-success/10 text-success border border-success/20',
        warning: 'bg-gradient-to-r from-warning/20 to-warning/10 text-warning border border-warning/20',
        destructive: 'bg-gradient-to-r from-destructive/20 to-destructive/10 text-destructive border border-destructive/20',
        info: 'bg-gradient-to-r from-info/20 to-info/10 text-info border border-info/20',
        accent: 'bg-gradient-to-r from-accent/20 to-accent/10 text-accent border border-accent/20',
        outline: 'border-2 border-border/50 text-on-surface-variant bg-transparent hover:border-primary/50',
        ghost: 'bg-surface-container-high/50 text-on-surface-variant backdrop-blur-sm',
      },
      size: {
        default: 'px-3 py-1 text-xs',
        sm: 'px-2 py-0.5 text-[10px]',
        lg: 'px-4 py-1.5 text-sm',
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
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full rounded-full bg-current opacity-75 animate-ping-soft" />
          <span className="relative inline-flex size-2 rounded-full bg-current" />
        </span>
      )}
      {children}
    </div>
  )
}

export { Badge, badgeVariants }
