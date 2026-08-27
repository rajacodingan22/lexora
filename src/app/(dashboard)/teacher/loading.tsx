
export default function TeacherLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="rounded-2xl bg-gradient-to-br from-indigo-900/40 via-purple-900/30 to-slate-900/40 p-6 sm:p-8">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-full bg-white/10" />
          <div className="space-y-2">
            <div className="h-6 w-48 rounded bg-white/10" />
            <div className="h-4 w-36 rounded bg-white/10" />
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="rounded-xl bg-white/5 p-3 space-y-2">
              <div className="h-3 w-16 rounded bg-white/10" />
              <div className="h-7 w-12 rounded bg-white/10" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {[1, 2].map(i => (
          <div key={i} className="rounded-xl border border-border bg-surface p-5 space-y-3">
            <div className="h-4 w-24 rounded bg-surface-hover" />
            <div className="space-y-2">
              {[1, 2, 3].map(j => (
                <div key={j} className="h-12 rounded-lg bg-surface-hover" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}