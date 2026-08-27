'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle2, Cloud, Unlink, ExternalLink } from 'lucide-react'
import { useI18n } from '@/lib/i18n/client'

interface DriveStatus {
  connected: boolean
  email: string | null
  connected_at: string | null
}

export function DriveConnectCard() {
  const { t } = useI18n()
  const [status, setStatus] = useState<DriveStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/drive/status')
      if (res.ok) {
        const data = (await res.json()) as DriveStatus
        setStatus(data)
      } else {
        setStatus({ connected: false, email: null, connected_at: null })
      }
    } catch {
      setStatus({ connected: false, email: null, connected_at: null })
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchStatus()
    // Jika kembali dari callback dengan ?drive=connected, refresh status
    if (typeof window !== 'undefined' && window.location.search.includes('drive=connected')) {
      // Bersihkan query param agar refresh tidak mengulang
      const url = new URL(window.location.href)
      url.searchParams.delete('drive')
      window.history.replaceState({}, '', url.toString())
      fetchStatus()
    }
  }, [fetchStatus])

  async function handleConnect() {
    setConnecting(true)
    try {
      const res = await fetch('/api/drive/auth-url')
      if (!res.ok) throw new Error('Gagal membuat link Google')
      const { url } = (await res.json()) as { url: string }
      window.location.href = url
    } catch (e: any) {
      alert(e?.message || 'Gagal menghubungkan Google Drive')
      setConnecting(false)
    }
  }

  async function handleDisconnect() {
    if (!confirm('Putuskan koneksi Google Drive? Rekaman lama tetap ada di Drive kamu.')) return
    setDisconnecting(true)
    try {
      const res = await fetch('/api/drive/disconnect', { method: 'POST' })
      if (!res.ok) throw new Error('Gagal memutus koneksi')
      await fetchStatus()
    } catch (e: any) {
      alert(e?.message || 'Gagal memutus koneksi')
    }
    setDisconnecting(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Cloud className="h-4 w-4 text-sky-400" /> Google Drive
          {status?.connected && (
            <Badge variant="success" className="ml-auto">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Terhubung
            </Badge>
          )}
          {status && !status.connected && (
            <Badge variant="outline" className="ml-auto text-amber-400 border-amber-500/30">
              Belum terhubung
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : status?.connected ? (
          <>
            <div className="flex items-center justify-between rounded-lg bg-surface-container-low p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-on-surface truncate">{status.email || 'Akun Google'}</p>
                <p className="text-xs text-muted">
                  Rekaman suaramu tersimpan di folder <span className="font-semibold">Lexora</span> di Drive ini.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" onClick={handleDisconnect} disabled={disconnecting}>
                {disconnecting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Unlink className="mr-1 h-3.5 w-3.5" />}
                Putuskan
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => window.open('https://drive.google.com/drive/my-drive', '_blank')}
              >
                Buka Drive <ExternalLink className="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-on-surface-variant">
              Hubungkan Google Drive agar rekaman suaramu saat latihan speaking tersimpan aman di Drive kamu sendiri
              (folder <span className="font-semibold">Lexora</span>). Platform hanya menyimpan link &amp; skor — bukan filenya.
            </p>
            <ul className="text-xs text-muted space-y-1">
              <li>• Kamu/ortu bisa hapus rekaman kapan saja dari Drive</li>
              <li>• Tanpa Drive: rekaman sementara &amp; otomatis terhapus 24 jam</li>
            </ul>
            <Button size="sm" className="w-full" onClick={handleConnect} disabled={connecting}>
              {connecting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Cloud className="mr-1 h-3.5 w-3.5" />}
              Hubungkan Google Drive
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
