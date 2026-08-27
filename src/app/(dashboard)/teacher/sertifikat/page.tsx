'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { useAuth } from '@/lib/auth-context'
import { useI18n } from '@/lib/i18n/client'
import { createClient } from '@/lib/supabase-client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { generateCertificateNumber } from '@/lib/certificate'
import {
  Award, Loader2, Upload, Users, CheckCircle2, FileText,
  GraduationCap, CalendarDays, X,
} from 'lucide-react'

const LOCALE_MAP: Record<string, string> = { en: 'en-US', id: 'id-ID', zh: 'zh-CN' }

interface BatchInfo {
  id: string
  name: string
  code: string | null
  start_date: string
  end_date: string
  status: string
  course_id: string
  course?: {
    id: string
    title: { id: string; en: string }
  } | null
}

interface StudentRow {
  user_id: string
  enrollment_id: string
  user?: {
    id: string
    display_name: string
    photo_url: string | null
    email: string | null
  } | null
  hasCert: boolean
}

interface CertCheck {
  user_id: string
  id: string
}

function getTitle(t: { id?: string; en?: string } | string | null | undefined): string {
  if (!t) return ''
  if (typeof t === 'string') return t
  return t.id || t.en || ''
}

export default function TeacherCertificatesPage() {
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const { t, lang } = useI18n()
  const supabase = createClient()
  const locale = LOCALE_MAP[lang] || 'en-US'

  const [batches, setBatches] = useState<BatchInfo[]>([])
  const [selectedBatch, setSelectedBatch] = useState<BatchInfo | null>(null)
  const [students, setStudents] = useState<StudentRow[]>([])
  const [loadingBatches, setLoadingBatches] = useState(true)
  const [loadingStudents, setLoadingStudents] = useState(false)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [notify, setNotify] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  const fetchBatches = useCallback(async () => {
    if (!user) return
    setLoadingBatches(true)
    try {
      const { data: teacherRows } = await supabase
        .from('teachers')
        .select('id')
        .eq('user_id', user.id)
      const teacherId = teacherRows?.[0]?.id
      if (!teacherId) { setLoadingBatches(false); return }

      const { data: myCTs } = await supabase
        .from('course_teachers')
        .select('course_id')
        .eq('teacher_id', teacherId)
      const courseIds = (myCTs || []).map((c) => c.course_id)

      const { data: batchData } = await supabase
        .from('batches')
        .select('id, name, code, start_date, end_date, status, course_id, course:courses(id, title)')
        .in('course_id', courseIds)
        .in('status', ['completed', 'active'])
        .order('end_date', { ascending: false })

      const list: BatchInfo[] = (batchData || []).map((b: any) => ({
        id: b.id,
        name: b.name,
        code: b.code,
        start_date: b.start_date,
        end_date: b.end_date,
        status: b.status,
        course_id: b.course_id,
        course: Array.isArray(b.course) ? b.course[0] : b.course,
      }))
      setBatches(list)

      const batchIdParam = searchParams.get('batch_id')
      if (batchIdParam) {
        const found = list.find((b) => b.id === batchIdParam)
        if (found) setSelectedBatch(found)
      } else if (list.length > 0) {
        setSelectedBatch(list[0])
      }
    } catch (err) {
      console.error('Failed to fetch batches:', err)
    }
    setLoadingBatches(false)
  }, [user, supabase, searchParams])

  useEffect(() => {
    if (authLoading || !user) return
    fetchBatches()
  }, [user, authLoading, fetchBatches])

  const loadStudents = useCallback(async (batch: BatchInfo) => {
    setSelectedBatch(batch)
    setLoadingStudents(true)
    setNotify(null)
    try {
      const { data: enrollData } = await supabase
        .from('enrollments')
        .select('id, user_id, user:users(id, display_name, photo_url, email)')
        .eq('batch_id', batch.id)
        .eq('status', 'active')

      const list: StudentRow[] = ((enrollData || []) as any[]).map((e) => ({
        user_id: e.user_id,
        enrollment_id: e.id,
        user: Array.isArray(e.user) ? e.user[0] : e.user,
        hasCert: false,
      }))

      if (list.length > 0) {
        const { data: certData } = await supabase
          .from('certificates')
          .select('user_id')
          .eq('batch_id', batch.id)
        const hasCert = new Set((certData || []).map((c: any) => c.user_id))
        for (const s of list) {
          s.hasCert = hasCert.has(s.user_id)
        }
      }
      setStudents(list)
    } catch (err) {
      console.error('Failed to load students:', err)
    }
    setLoadingStudents(false)
  }, [supabase])

  useEffect(() => {
    if (selectedBatch) loadStudents(selectedBatch)
  }, [selectedBatch?.id])

  async function handleUpload(student: StudentRow, file: File | null) {
    if (!file || !selectedBatch) return
    setUploadingId(student.user_id)
    setNotify(null)
    try {
      const safeName = student.user_id.replace(/-/g, '')
      const path = `batch-${selectedBatch.id}/${safeName}-${Date.now()}.${file.name.split('.').pop() || 'pdf'}`
      const { error: upErr } = await supabase.storage
        .from('certificates')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) throw upErr

      const { data: urlData } = supabase.storage.from('certificates').getPublicUrl(path)
      const pdfUrl = urlData.publicUrl

      const { data: existing } = await supabase
        .from('certificates')
        .select('id')
        .eq('user_id', student.user_id)
        .eq('batch_id', selectedBatch.id)
        .maybeSingle()

      if (existing?.id) {
        await supabase
          .from('certificates')
          .update({
            pdf_url: pdfUrl,
            certificate_code: generateCertificateNumber(),
            source: 'uploaded',
            status: 'issued',
            issue_date: new Date().toISOString().slice(0, 10),
          })
          .eq('id', existing.id)
      } else {
        const { data: teacherRows } = await supabase.from('teachers').select('id').eq('user_id', user!.id).maybeSingle()
        const { error: insErr } = await supabase.from('certificates').insert({
          user_id: student.user_id,
          course_id: selectedBatch.course_id,
          batch_id: selectedBatch.id,
          enrollment_id: student.enrollment_id,
          pdf_url: pdfUrl,
          certificate_code: generateCertificateNumber(),
          source: 'uploaded',
          status: 'issued',
          issue_date: new Date().toISOString().slice(0, 10),
          uploaded_by: teacherRows?.id ?? null,
        })
        if (insErr) throw insErr
      }

      await supabase.from('notifications').insert({
        user_id: student.user_id,
        type: 'info',
        template_key: 'certificateIssued',
        params: { batch: selectedBatch.name },
        title: t('teacher1.cert.notifTitle'),
        body: t('teacher1.cert.notifBody', { batch: selectedBatch.name }),
        link: '/student/sertifikat',
        is_read: false,
      })

      setNotify({ type: 'success', msg: t('teacher1.cert.uploadSuccess') })
      await loadStudents(selectedBatch)
    } catch (err: any) {
      console.error('Upload failed:', err)
      setNotify({ type: 'error', msg: err.message || t('teacher1.cert.uploadError') })
    }
    setUploadingId(null)
  }

  function formatDate(d: string | null | undefined): string {
    if (!d) return '—'
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d))
  }

  const completedBatches = batches.filter((b) => b.status === 'completed')

  return (
    <DashboardLayout role="teacher">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/20">
              <Award className="size-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-on-surface">{t('teacher1.cert.title')}</h1>
              <p className="text-sm text-on-surface-variant">{t('teacher1.cert.subtitle')}</p>
            </div>
          </div>
        </div>

        {notify && (
          <div className={cn(
            'flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm',
            notify.type === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-destructive/30 bg-destructive/10 text-destructive'
          )}>
            {notify.type === 'success' ? <CheckCircle2 className="size-4" /> : <X className="size-4" />}
            {notify.msg}
          </div>
        )}

        {completedBatches.length > 0 && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
            <span className="font-semibold">{t('teacher1.cert.reminder')}</span>{' '}
            {t('teacher1.cert.reminderDesc', { count: completedBatches.length })}
          </div>
        )}

        <Card>
          <CardContent className="p-4">
            <Label className="mb-2 block">{t('teacher1.cert.batchLabel')}</Label>
            {loadingBatches ? (
              <div className="flex items-center gap-2 py-4 text-sm text-muted">
                <Loader2 className="size-4 animate-spin" /> {t('teacher1.cert.loading')}
              </div>
            ) : batches.length === 0 ? (
              <p className="py-4 text-sm text-muted">{t('teacher1.cert.noBatches')}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {batches.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => loadStudents(b)}
                    className={cn(
                      'flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors',
                      selectedBatch?.id === b.id
                        ? 'border-indigo-500/50 bg-indigo-500/10 text-on-surface'
                        : 'border-border bg-surface-container-lowest text-on-surface-variant hover:border-indigo-500/30'
                    )}
                  >
                    <GraduationCap className="size-4 text-indigo-400" />
                    <span className="font-medium">{b.name}</span>
                    <span className="text-xs text-muted">{getTitle(b.course?.title)}</span>
                    {b.status === 'completed' && (
                      <Badge variant="outline" size="sm" className="text-[10px]">{t('teacher1.cert.statusCompleted')}</Badge>
                    )}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {selectedBatch && (
          <Card>
            <CardContent className="p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-4">
                <div>
                  <h2 className="text-lg font-bold text-on-surface">{selectedBatch.name}</h2>
                  <div className="mt-1 flex items-center gap-3 text-xs text-on-surface-variant">
                    <span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" /> {formatDate(selectedBatch.start_date)} — {formatDate(selectedBatch.end_date)}</span>
                    <span className="inline-flex items-center gap-1"><Users className="size-3.5" /> {students.length} {t('teacher1.cert.studentCount')}</span>
                  </div>
                </div>
                <div className="text-right text-xs text-muted">
                  {students.filter((s) => s.hasCert).length}/{students.length} {t('teacher1.cert.uploadedCount')}
                </div>
              </div>

              {loadingStudents ? (
                <div className="flex items-center justify-center py-12 text-muted">
                  <Loader2 className="mr-2 size-5 animate-spin" /> {t('teacher1.cert.loading')}
                </div>
              ) : students.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted">{t('teacher1.cert.noStudents')}</p>
              ) : (
                <div className="space-y-2">
                  {students.map((s) => (
                    <div key={s.user_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-container-lowest p-3">
                      <div className="flex min-w-0 items-center gap-3">
                        {s.user?.photo_url ? (
                          <img src={s.user.photo_url} alt="" className="size-10 shrink-0 rounded-full object-cover" />
                        ) : (
                          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20">
                            <GraduationCap className="size-4 text-indigo-400" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-on-surface">{s.user?.display_name || t('teacher1.cert.unknownStudent')}</p>
                          <p className="truncate text-xs text-muted">{s.user?.email || ''}</p>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {s.hasCert ? (
                          <>
                            <Badge variant="success" size="sm">
                              <CheckCircle2 className="mr-1 size-3" /> {t('teacher1.cert.uploaded')}
                            </Badge>
                            <label className="cursor-pointer">
                              <span className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-on-surface-variant hover:border-indigo-500/40 hover:text-indigo-400 transition-colors">
                                <FileText className="size-3.5" /> {t('teacher1.cert.replace')}
                              </span>
                              <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => handleUpload(s, e.target.files?.[0] || null)} />
                            </label>
                          </>
                        ) : (
                          <label className="cursor-pointer">
                            <span className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-400 transition-colors">
                              {uploadingId === s.user_id ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                              {uploadingId === s.user_id ? t('teacher1.cert.uploading') : t('teacher1.cert.uploadBtn')}
                            </span>
                            <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => handleUpload(s, e.target.files?.[0] || null)} />
                          </label>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  )
}
