import { Loader2 } from 'lucide-react'

export default function DashboardLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-on-surface-variant">Memuat...</p>
      </div>
    </div>
  )
}
