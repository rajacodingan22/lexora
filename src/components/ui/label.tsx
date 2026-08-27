import { cn } from '@/lib/utils'
import { forwardRef, type LabelHTMLAttributes } from 'react'

const Label = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }>(
  ({ className, required, children, ...props }, ref) => (
    <label
      ref={ref}
      className={cn(
        'text-sm font-medium text-on-surface leading-none',
        'peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
        className
      )}
      {...props}
    >
      {children}
      {required && (
        <span aria-hidden="true" className="ml-0.5 text-destructive">
          *
        </span>
      )}
    </label>
  )
)
Label.displayName = 'Label'

export { Label }
