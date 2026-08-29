'use client'
import { Button } from '@/components/ui/button'
export default function GlobalErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html>
      <body className="flex min-h-screen items-center justify-center p-6">
        <div className="text-center">
          <h2 className="font-semibold">Terjadi kesalahan sistem</h2>
          <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
          <Button onClick={reset} className="mt-4">Coba lagi</Button>
        </div>
      </body>
    </html>
  )
}
