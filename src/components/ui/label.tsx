import { cn } from '@/lib/utils'
import { forwardRef, type LabelHTMLAttributes } from 'react'

const Label = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }>(
  ({ className, required, children, ...props }, ref) => (
    <label
      ref={ref}
      className={cn(
        'text-sm font-bold text-on-surface tracking-wide leading-none',
        'peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
        'transition-colors duration-200',
        className
      )}
      {...props}
    >
      {children}
      {required && (
        <span aria-hidden="true" className="ml-1 text-destructive text-base">*</span>
      )}
    </label>
  )
)
Label.displayName = 'Label'

export { Label }
