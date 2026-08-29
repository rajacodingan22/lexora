'use client'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <AlertTriangle className="h-10 w-10 text-destructive mb-3" />
        <h2 className="text-lg font-semibold">Terjadi kesalahan</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-md">{error.message || 'Coba lagi.'}</p>
        <Button onClick={reset} className="mt-4">Coba lagi</Button>
      </body>
    </html>
  )
}
