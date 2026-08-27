export default function AdminLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="h-7 w-48 rounded bg-surface-hover" />
          <div className="h-4 w-36 rounded bg-surface-hover" />
        </div>
      </div>
      <div className="rounded-xl border border-border bg-surface">
        <div className="p-4 space-y-4">
          <div className="flex gap-4">
            <div className="h-9 w-64 rounded-lg bg-surface-hover" />
            <div className="h-9 w-32 rounded-lg bg-surface-hover" />
          </div>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-12 rounded-lg bg-surface-hover" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}