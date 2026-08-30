'use client'

import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface AdminModalProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  headerRight?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  maxWidth?: string
}

export function AdminModal({ open, onClose, title, subtitle, headerRight, children, footer, maxWidth = 'max-w-3xl' }: AdminModalProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className={`mt-8 w-full ${maxWidth} rounded-2xl bg-surface border border-border shadow-xl`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between rounded-t-2xl border-b border-border px-5 py-3">
          <div>
            <p className="text-sm font-semibold text-on-surface">{title}</p>
            {subtitle && <p className="text-xs text-on-surface-variant">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2">
            {headerRight}
            <Button size="sm" variant="ghost" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex items-center justify-between rounded-b-2xl border-t border-border px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}
