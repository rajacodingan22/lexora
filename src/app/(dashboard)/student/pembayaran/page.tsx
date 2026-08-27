'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-client'
import { useAuth } from '@/lib/auth-context'
import { useI18n } from '@/lib/i18n/client'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Loader2, FileText, CheckCircle2, AlertCircle,
  Phone, Clock, Copy, ExternalLink,
} from 'lucide-react'
import type { Payment } from '@/types'

export default function StudentPaymentPage() {
  const { user, loading: authLoading } = useAuth()
  const { t, lang } = useI18n()
  const supabase = createClient()
  const locale = { en: 'en-US', id: 'id-ID', zh: 'zh-CN' }[lang] || 'en-US'
  const [payments, setPayments] = useState<(Payment & { enrollment?: any })[]>([])
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (authLoading || !user) return
    Promise.all([fetchPayments(), fetchSettings()]).then(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user])

  async function fetchPayments() {
    if (!user?.id) return
    const { data } = await supabase
      .from('payments')
      .select('*, enrollment:enrollments!payments_enrollment_id_fkey(id, course:courses(title))')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    if (data) setPayments(data as any)
  }

  async function fetchSettings() {
    const { data } = await supabase.from('system_settings').select('key, value')
    if (data) {
      const map: Record<string, string> = {}
      for (const row of data) map[row.key] = String(row.value ?? '')
      setSettings(map)
    }
  }

  function statusVariant(s: string): 'warning' | 'success' | 'destructive' | 'outline' {
    switch (s) {
      case 'pending': return 'warning'
      case 'approved': return 'success'
      case 'rejected': return 'destructive'
      default: return 'outline'
    }
  }

  function statusLabel(s: string): string {
    switch (s) {
      case 'pending': return 'Pending'
      case 'approved': return 'Approved'
      case 'rejected': return 'Rejected'
      case 'cancelled': return 'Cancelled'
      default: return s
    }
  }

  function formatDate(d: string | null | undefined): string {
    if (!d) return '—'
    return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(d))
  }

  function rupiah(n: number): string {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n)
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const pendingPayment = payments.find(p => p.status === 'pending')

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-muted"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading...</div>
  )

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">{t('student1.pembayaran.title')}</h1>
        <p className="text-on-surface-variant">{t('student1.pembayaran.subtitle')}</p>
      </div>

      {pendingPayment && (
        <Card className="border-warning/50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-warning" />
              <h2 className="font-semibold text-on-surface">{t('student1.pembayaran.pendingTitle')}</h2>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-muted">Invoice</span><p className="text-on-surface font-semibold">{pendingPayment.invoice_number}</p></div>
              <div><span className="text-muted">Total</span><p className="text-on-surface font-bold text-xl">{rupiah(pendingPayment.amount)}</p></div>
              {settings.bank_name && (
                <>
                  <div><span className="text-muted">Bank</span><p className="text-on-surface">{settings.bank_name}</p></div>
                  <div><span className="text-muted">Account No.</span><p className="text-on-surface font-semibold">{settings.bank_account}</p></div>
                  {settings.bank_holder && <div className="col-span-2"><span className="text-muted">Account Holder</span><p className="text-on-surface">{settings.bank_holder}</p></div>}
                </>
              )}
            </div>

            <div className="rounded-lg border border-border bg-surface-container-low p-4">
              <Label className="text-xs text-muted uppercase font-semibold">{t('student1.pembayaran.paymentMethod')}</Label>
              <ol className="mt-2 space-y-1 text-sm text-on-surface list-decimal list-inside">
                <li>{t('student1.pembayaran.step1', { amount: rupiah(pendingPayment.amount) })}</li>
                <li>{t('student1.pembayaran.step2')}</li>
                <li>{t('student1.pembayaran.step3')}</li>
                <li>{t('student1.pembayaran.step4')}</li>
              </ol>
            </div>

            {settings.whatsapp_number && (
              <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Phone className="h-5 w-5 text-green-400" />
                  <span className="font-semibold text-on-surface">{t('student1.pembayaran.sendProofTitle')}</span>
                </div>
                <p className="text-sm text-on-surface-variant mb-2">{t('student1.pembayaran.sendProofDesc')}</p>
                <div className="flex items-center gap-2">
                  <a
                    href={`https://wa.me/${settings.whatsapp_number.replace(/[^0-9]/g, '')}?text=Halo%20admin%2C%20saya%20ingin%20konfirmasi%20pembayaran%20untuk%20${encodeURIComponent(pendingPayment.invoice_number)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500 transition-colors"
                  >
                    <ExternalLink className="h-4 w-4" />
                    {settings.whatsapp_number}
                  </a>
                  <Button variant="ghost" size="sm" onClick={() => copyToClipboard(settings.whatsapp_number)}>
                    {copied ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            )}

            {!settings.whatsapp_number && (
              <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-warning shrink-0" />
                <p className="text-sm text-on-surface-variant">{t('student1.pembayaran.noWhatsapp')}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-on-surface flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            {t('student1.pembayaran.historyTitle')}
          </h2>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-center text-muted py-6">{t('student1.pembayaran.noPayments')}</p>
          ) : (
            <div className="space-y-3">
              {payments.map(p => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-on-surface">{p.invoice_number}</p>
                    <p className="text-xs text-on-surface-variant">{formatDate(p.created_at)}</p>
                    {(p as any).enrollment?.course?.title && (
                      <p className="text-xs text-muted">
                        {(p as any).enrollment.course.title?.id || (p as any).enrollment.course.title?.en}
                      </p>
                    )}
                  </div>
                  <div className="text-right space-y-1">
                    <p className="text-sm font-semibold text-on-surface">{rupiah(p.amount)}</p>
                    <Badge variant={statusVariant(p.status)} size="sm">{statusLabel(p.status)}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}