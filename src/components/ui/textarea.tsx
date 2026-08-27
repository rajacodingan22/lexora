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
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={id} className="text-sm font-medium text-on-surface">
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
            'flex min-h-[100px] w-full rounded-lg border bg-surface-container-lowest px-3.5 py-2.5 text-sm text-on-surface',
            'placeholder:text-muted resize-y',
            'transition-all duration-[var(--dur-fast)] ease-[var(--ease-out)]',
            'hover:border-border-strong',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary',
            'disabled:cursor-not-allowed disabled:opacity-50',
            hasError
              ? 'border-destructive/60 focus:ring-destructive/40 focus:border-destructive'
              : 'border-border',
            className
          )}
          {...props}
        />
        {(hint || error) && (
          <p className={cn('text-xs', hasError ? 'text-destructive' : 'text-on-surface-variant')}>
            {error || hint}
          </p>
        )}
      </div>
    )
  }
)
Textarea.displayName = 'Textarea'

export { Textarea }
