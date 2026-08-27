import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { Loader2 } from 'lucide-react'

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold',
    'transition-all duration-[var(--dur)] ease-[var(--ease-out)]',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:pointer-events-none disabled:opacity-50',
    'active:translate-y-px',
    '[&_svg]:size-4 [&_svg]:shrink-0',
  ].join(' '),
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-sm hover:shadow-md hover:bg-primary/90',
        gradient:
          'btn-gradient text-primary-foreground shadow-sm hover:shadow-glow',
        secondary:
          'bg-surface text-on-surface border border-border hover:bg-surface-hover hover:border-border-strong',
        outline:
          'border border-border bg-transparent text-on-surface hover:bg-surface hover:border-border-strong',
        ghost:
          'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low',
        link:
          'text-primary underline-offset-4 hover:underline font-medium px-0',
        destructive:
          'bg-destructive text-primary-foreground shadow-sm hover:bg-destructive/90 hover:shadow-md',
        success:
          'bg-success text-primary-foreground shadow-sm hover:bg-success/90 hover:shadow-md',
        warning:
          'bg-warning text-on-surface shadow-sm hover:bg-warning/90 hover:shadow-md',
        info:
          'bg-info text-primary-foreground shadow-sm hover:bg-info/90 hover:shadow-md',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-12 rounded-lg px-6 text-base',
        xl: 'h-14 rounded-lg px-8 text-base',
        icon: 'h-10 w-10 [&_svg]:size-5',
        'icon-sm': 'h-8 w-8 [&_svg]:size-4',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
)

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, disabled, children, ...props }, ref) => (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      type="button"
      {...props}
    >
      {loading && <Loader2 className="animate-spin" />}
      {children}
    </button>
  )
)
Button.displayName = 'Button'

export { Button, buttonVariants }
