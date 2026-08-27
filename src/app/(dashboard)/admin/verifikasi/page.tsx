'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-client'
import { useAuth } from '@/lib/auth-context'
import { useI18n } from '@/lib/i18n/client'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import {
  Search, Loader2, CheckCircle2, XCircle, Eye, ExternalLink,
  FileText, X,
} from 'lucide-react'
import type { Payment, User } from '@/types'
import FilePreviewModal from '@/components/shared/file-preview-modal'
import { getSignedUrl } from '@/lib/storage'

const PER_PAGE = 10

const LOCALE_MAP: Record<string, string> = { en: 'en-US', id: 'id-ID', zh: 'zh-CN' }

export default function AdminVerifikasiPage() {
  const { user } = useAuth()
  const { t, lang } = useI18n()
  const supabase = createClient()
  const locale = LOCALE_MAP[lang] || 'en-US'
  const [payments, setPayments] = useState<(Payment & { user?: User; enrollment?: any })[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [selectedPayment, setSelectedPayment] = useState<(Payment & { user?: User }) | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [proofSignedUrl, setProofSignedUrl] = useState<string | null>(null)
  const [actionNotes, setActionNotes] = useState('')
  const [processing, setProcessing] = useState<string | null>(null)
  const [page, setPage] = useState(0)

  useEffect(() => { fetchPayments() }, [])

  useEffect(() => {
    if (selectedPayment?.proof_url) {
      let cancelled = false
      getSignedUrl(selectedPayment.proof_url).then(url => { if (!cancelled) setProofSignedUrl(url || null) })
      return () => { cancelled = true }
    }
    setProofSignedUrl(null)
  }, [selectedPayment?.id])

  async function fetchPayments() {
    setLoading(true)
    const { data } = await supabase
      .from('payments')
      .select('*, user:users!payments_user_id_fkey(id, display_name, email)')
      .order('created_at', { ascending: false })
    if (data) {
      setPayments(data.map((p: any) => ({
        ...p,
        user: p.user || undefined,
      })))
    }
    setLoading(false)
  }

  const filtered = payments.filter(p => {
    const name = (p.user as any)?.display_name || ''
    const email = (p.user as any)?.email || ''
    const matchSearch = name.toLowerCase().includes(search.toLowerCase()) || email.toLowerCase().includes(search.toLowerCase()) || p.invoice_number.toLowerCase().includes(search.toLowerCase())
    const matchStatus = filterStatus === 'all' || p.status === filterStatus
    return matchSearch && matchStatus
  })

  const paged = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE)
  const totalPages = Math.ceil(filtered.length / PER_PAGE)

  async function handleApprove(payment: Payment) {
    if (!user?.id) return
    setProcessing(payment.id)
    const { error } = await supabase.rpc('review_payment', {
      p_payment_id: payment.id,
      p_status: 'approved',
      p_admin_notes: actionNotes || null,
    })
    if (error) {
      console.error('Payment approval error:', error)
      alert(error.message || 'Gagal memproses pembayaran')
      setProcessing(null)
      return
    }
    setProcessing(null)
    setActionNotes('')
    setSelectedPayment(null)
    fetchPayments()
  }

  async function handleReject(payment: Payment) {
    if (!user?.id) return
    setProcessing(payment.id)
    const { error } = await supabase.rpc('review_payment', {
      p_payment_id: payment.id,
      p_status: 'rejected',
      p_admin_notes: actionNotes || null,
    })
    if (error) {
      console.error('Payment rejection error:', error)
      alert(error.message || 'Gagal memproses pembayaran')
      setProcessing(null)
      return
    }
    setProcessing(null)
    setActionNotes('')
    setSelectedPayment(null)
    fetchPayments()
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
      case 'pending':
      case 'awaiting_proof':
      case 'under_review': return t('admin2.verifikasi.statusPending')
      case 'approved': return t('admin2.verifikasi.statusApproved')
      case 'rejected': return t('admin2.verifikasi.statusRejected')
      case 'cancelled': return t('admin2.verifikasi.statusCancelled')
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

  const modal = selectedPayment && (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto pt-10 pb-10">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setSelectedPayment(null); setActionNotes('') }} />
      <div className="relative z-10 w-full max-w-2xl rounded-2xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold text-on-surface">{t('admin2.verifikasi.detailTitle')}</h2>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={statusVariant(selectedPayment.status)} size="sm">{statusLabel(selectedPayment.status)}</Badge>
            <button onClick={() => { setSelectedPayment(null); setActionNotes('') }} className="text-muted hover:text-on-surface transition-colors"><X className="h-5 w-5" /></button>
          </div>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-6 py-4 space-y-6">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-muted">{t('admin2.verifikasi.invoice')}</span><p className="text-on-surface font-medium">{selectedPayment.invoice_number}</p></div>
            <div><span className="text-muted">{t('admin2.verifikasi.amount')}</span><p className="text-on-surface font-bold text-lg">{rupiah(selectedPayment.amount)}</p></div>
            <div><span className="text-muted">{t('admin2.verifikasi.student')}</span><p className="text-on-surface font-medium">{(selectedPayment.user as any)?.display_name || '—'}</p></div>
            <div><span className="text-muted">{t('admin2.verifikasi.email')}</span><p className="text-on-surface font-medium">{(selectedPayment.user as any)?.email || '—'}</p></div>
            <div><span className="text-muted">{t('admin2.verifikasi.submitted')}</span><p className="text-on-surface">{formatDate(selectedPayment.created_at)}</p></div>
          </div>



          {selectedPayment.proof_url && (
            <div>
              <Label className="text-xs text-muted uppercase font-semibold">{t('admin2.verifikasi.proof')}</Label>
              <div className="mt-1">
                {proofSignedUrl ? (
                  selectedPayment.proof_url.match(/\.(jpg|jpeg|png|gif|webp)/i) ? (
                    <img src={proofSignedUrl} alt={t('admin2.verifikasi.proofAlt')} className="max-h-64 rounded-lg border border-border object-contain bg-surface-container-lowest" />
                  ) : (
                    <a href={proofSignedUrl} onClick={(e) => { e.preventDefault(); setPreviewUrl(proofSignedUrl) }} className="inline-flex items-center gap-2 text-primary hover:underline">
                      <ExternalLink className="h-4 w-4" /> {t('admin2.verifikasi.viewDocument')}
                    </a>
                  )
                ) : (
                  <p className="text-sm text-muted">{t('admin2.verifikasi.proofLoading')}</p>
                )}
              </div>
            </div>
          )}

          {selectedPayment.admin_notes && (
            <div><Label className="text-xs text-muted uppercase font-semibold">{t('admin2.verifikasi.notes')}</Label><p className="text-sm text-on-surface mt-0.5">{selectedPayment.admin_notes}</p></div>
          )}

          {['pending', 'awaiting_proof', 'under_review'].includes(selectedPayment.status) && (
            <>
              <div className="space-y-2">
                <Label>{t('admin2.verifikasi.adminNotes')}</Label>
                <Textarea placeholder={t('admin2.verifikasi.notesPlaceholder')} value={actionNotes} onChange={e => setActionNotes(e.target.value)} rows={2} />
              </div>
              <div className="flex gap-3 pt-2 border-t border-border">
                <Button variant="success" onClick={() => handleApprove(selectedPayment)} loading={processing === selectedPayment.id} className="flex-1">
                  <CheckCircle2 className="h-4 w-4 mr-1" /> {t('admin2.verifikasi.approve')}
                </Button>
                <Button variant="destructive" onClick={() => handleReject(selectedPayment)} loading={processing === selectedPayment.id} className="flex-1">
                  <XCircle className="h-4 w-4 mr-1" /> {t('admin2.verifikasi.reject')}
                </Button>
              </div>
            </>
          )}

          {(selectedPayment.status === 'approved' || selectedPayment.status === 'rejected') && (
            <div className="rounded-lg border border-border bg-surface-container-low p-3 text-sm">
              <div className="flex items-center gap-2">
                {selectedPayment.status === 'approved' ? <CheckCircle2 className="h-5 w-5 text-success" /> : <XCircle className="h-5 w-5 text-destructive" />}
                <span className="font-semibold text-on-surface">{selectedPayment.status === 'approved' ? t('admin2.verifikasi.statusApproved') : t('admin2.verifikasi.statusRejected')}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">{t('admin2.verifikasi.title')}</h1>
          <p className="text-on-surface-variant">{t('admin2.verifikasi.subtitle')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchPayments} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
          {t('admin2.verifikasi.refresh')}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
              <Input placeholder={t('admin2.verifikasi.searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
            </div>
            <Select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-36">
              <option value="all">{t('admin2.verifikasi.allStatus')}</option>
              <option value="pending">{t('admin2.verifikasi.statusPending')}</option>
              <option value="approved">{t('admin2.verifikasi.statusApproved')}</option>
              <option value="rejected">{t('admin2.verifikasi.statusRejected')}</option>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted"><Loader2 className="h-5 w-5 animate-spin mr-2" /> {t('admin2.verifikasi.loading')}</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted uppercase">
                      <th className="pb-3 font-medium">{t('admin2.verifikasi.colInvoice')}</th>
                      <th className="pb-3 font-medium">{t('admin2.verifikasi.colStudent')}</th>
                      <th className="pb-3 font-medium">{t('admin2.verifikasi.colAmount')}</th>
                      <th className="pb-3 font-medium">{t('admin2.verifikasi.colStatus')}</th>
                      <th className="pb-3 font-medium">{t('admin2.verifikasi.colDate')}</th>
                      <th className="pb-3 font-medium">{t('admin2.verifikasi.colAction')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map(p => (
                      <tr key={p.id} className="border-b border-border hover:bg-surface/50 cursor-pointer transition-colors" onClick={() => { setSelectedPayment(p as any); setActionNotes('') }}>
                        <td className="py-3 font-medium text-on-surface">{p.invoice_number}</td>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 text-[10px] font-bold text-white shrink-0">
                              {(p.user as any)?.display_name?.[0] || '?'}
                            </div>
                            <span className="text-on-surface">{(p.user as any)?.display_name || '—'}</span>
                          </div>
                        </td>
                        <td className="py-3 font-medium text-on-surface">{rupiah(p.amount)}</td>
                        <td className="py-3"><Badge variant={statusVariant(p.status)} size="sm">{statusLabel(p.status)}</Badge></td>
                        <td className="py-3 text-on-surface-variant">{formatDate(p.created_at)}</td>
                        <td className="py-3">
                          <Button variant="ghost" size="sm"><Eye className="h-4 w-4 mr-1" /> {t('admin2.verifikasi.review')}</Button>
                        </td>
                      </tr>
                    ))}
                    {paged.length === 0 && (
                      <tr><td colSpan={6} className="py-12 text-center text-muted">{payments.length === 0 ? t('admin2.verifikasi.noPayments') : t('admin2.verifikasi.noMatch')}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 text-sm text-muted">
                  <span>{t('admin2.verifikasi.pageInfo', { page: page + 1, total: totalPages })}</span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>{t('admin2.verifikasi.previous')}</Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>{t('admin2.verifikasi.next')}</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {modal}

      <FilePreviewModal url={previewUrl} title={previewUrl?.split('/').pop()} onClose={() => setPreviewUrl(null)} />
    </div>
  )
}