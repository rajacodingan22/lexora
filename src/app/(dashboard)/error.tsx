'use client'

import { AlertTriangle } from 'lucide-react'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
      <div className="rounded-full bg-destructive/10 p-4">
        <AlertTriangle className="h-8 w-8 text-destructive" />
      </div>
      <h2 className="text-lg font-semibold">Terjadi Kesalahan</h2>
      <p className="max-w-md text-center text-sm text-on-surface-variant">
        {error.message || 'Halaman tidak dapat dimuat. Silakan coba lagi.'}
      </p>
      <button
        onClick={reset}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90"
      >
        Coba Lagi
      </button>
    </div>
  )
}
