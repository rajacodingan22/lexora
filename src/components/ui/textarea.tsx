import { cn } from '@/lib/utils'
import { forwardRef, useId, type TextareaHTMLAttributes } from 'react'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  hint?: string
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, hint, disabled, ...props }, ref) => {
    const hasError = Boolean(error)
    const genId = useId()
    const id = props.id ?? `textarea-${genId}`
    const describedBy = hint || error ? `${id}-hint` : undefined
    return (
      <div className="space-y-2">
        {label && (
          <label htmlFor={id} className="text-sm font-bold text-on-surface tracking-wide">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={id}
          disabled={disabled}
          aria-invalid={hasError || undefined}
          aria-describedby={describedBy}
          className={cn(
            'flex min-h-[120px] w-full rounded-2xl border bg-surface-container-lowest/50 px-4 py-3 text-sm text-on-surface backdrop-blur-sm',
            'placeholder:text-muted resize-y',
            'transition-all duration-300 ease-out',
            'hover:border-border-strong hover:bg-surface-container-lowest/80',
            'focus:outline-none focus:ring-4 focus:border-primary focus:shadow-lg focus:shadow-primary/10',
            'disabled:cursor-not-allowed disabled:opacity-50',
            hasError
              ? 'border-destructive/60 focus:ring-destructive/30 focus:border-destructive bg-destructive-soft/30'
              : 'border-border/70 focus:ring-primary/20',
            className
          )}
          {...props}
        />
        {(hint || error) && (
          <p className={cn('text-xs font-medium', hasError ? 'text-destructive' : 'text-on-surface-variant')}>
            {error || hint}
          </p>
        )}
      </div>
    )
  }
)
Textarea.displayName = 'Textarea'

export { Textarea }
