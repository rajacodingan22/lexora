import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { Loader2 } from 'lucide-react'

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-bold tracking-wide',
    'transition-all duration-300 ease-out',
    'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed',
    'active:scale-95 hover:-translate-y-0.5',
    '[&_svg]:size-5 [&_svg]:shrink-0',
    'relative overflow-hidden',
    'before:absolute before:inset-0 before:bg-gradient-to-r before:from-white/0 before:via-white/10 before:to-white/0 before:-translate-x-full',
    'hover:before:translate-x-full hover:before:duration-700',
  ].join(' '),
  {
    variants: {
      variant: {
        default:
          'bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/35 border border-primary/20',
        gradient:
          'btn-gradient text-primary-foreground shadow-xl shadow-primary/30 hover:shadow-2xl hover:shadow-primary/40 border-0',
        secondary:
          'bg-gradient-to-r from-surface-container-high to-surface-container-highest text-on-surface border border-border-strong hover:border-primary/50 hover:shadow-md',
        outline:
          'border-2 border-primary/50 bg-transparent text-primary hover:bg-primary/10 hover:shadow-lg hover:shadow-primary/20',
        ghost:
          'text-on-surface hover:text-on-surface hover:bg-surface-container-low hover:shadow-sm',
        link:
          'text-primary underline-offset-4 hover:underline font-bold px-0 decoration-2',
        destructive:
          'bg-gradient-to-r from-destructive to-red-500 text-primary-foreground shadow-lg shadow-destructive/25 hover:shadow-xl hover:shadow-destructive/35',
        success:
          'bg-gradient-to-r from-success to-green-500 text-primary-foreground shadow-lg shadow-success/25 hover:shadow-xl hover:shadow-success/35',
        warning:
          'bg-gradient-to-r from-warning to-orange-500 text-on-surface shadow-lg shadow-warning/25 hover:shadow-xl hover:shadow-warning/35',
        info:
          'bg-gradient-to-r from-info to-blue-500 text-primary-foreground shadow-lg shadow-info/25 hover:shadow-xl hover:shadow-info/35',
      },
      size: {
        default: 'h-12 px-6 py-3 text-sm',
        sm: 'h-10 rounded-lg px-4 text-xs',
        lg: 'h-14 rounded-xl px-8 text-base',
        xl: 'h-16 rounded-2xl px-10 text-lg',
        icon: 'h-12 w-12 [&_svg]:size-5',
        'icon-sm': 'h-10 w-10 [&_svg]:size-4',
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
