'use client'

import { useEffect, useState, use } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase-client'
import { useAuth } from '@/lib/auth-context'
import type { Assignment, Submission, User } from '@/types'
import { ChevronLeft, FileText, User as UserIcon, Loader2, Save, CheckCircle, X, Download } from 'lucide-react'
import Link from 'next/link'
import { useI18n } from '@/lib/i18n/client'
import { getSignedUrl } from '@/lib/storage'
import { DashboardLayout } from '@/components/layout/dashboard-layout'

const LOCALE_MAP: Record<string, string> = {
  en: 'en-US',
  id: 'id-ID',
  zh: 'zh-CN',
}

interface SubmissionWithUser extends Submission {
  user: User
}

function getFileKind(url: string): 'image' | 'pdf' | 'doc' | 'other' {
  const clean = url.split('?')[0]
  const ext = clean.split('.').pop()?.toLowerCase() || ''
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image'
  if (ext === 'pdf') return 'pdf'
  if (['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'].includes(ext)) return 'doc'
  return 'other'
}

function getFileName(url: string): string {
  const clean = url.split('?')[0]
  return clean.split('/').pop() || 'file'
}

export default function AdminGradingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { user, loading: authLoading } = useAuth()
  const supabase = createClient()
  const { t, lang } = useI18n()
  const locale = LOCALE_MAP[lang] || 'en-US'

  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [submissions, setSubmissions] = useState<SubmissionWithUser[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [saving, setSaving] = useState(false)

  const [manualGrade, setManualGrade] = useState<number>(0)
  const [feedback, setFeedback] = useState('')
  const [saved, setSaved] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    if (authLoading || !user) return
    fetchData()
  }, [authLoading, user, id])

  useEffect(() => {
    if (submissions.length > 0) {
      resetForm()
    }
  }, [selectedIdx, submissions.length])

  function resetForm() {
    const sub = submissions[selectedIdx]
    if (!sub) return
    setManualGrade(sub.grade != null && typeof sub.grade === 'number' ? sub.grade : 0)
    setFeedback(sub.feedback || '')
    setSaved(false)
  }

  async function fetchData() {
    setLoading(true)
    try {
      const [{ data: assignData }, { data: subData }] = await Promise.all([
        supabase.from('assignments').select('*').eq('id', id).single(),
        supabase.from('submissions').select('*, user:users!submissions_user_id_fkey(id, display_name, photo_url)').eq('assignment_id', id).order('submitted_at', { ascending: false }),
      ])

      if (assignData) {
        setAssignment(assignData as Assignment)
      }

      setSubmissions((subData || []) as unknown as SubmissionWithUser[])
    } catch (err) {
      console.error('Failed to fetch grading data', err)
    } finally {
      setLoading(false)
    }
  }

  const currentSubmission = submissions[selectedIdx]

  async function handleSubmitGrade() {
    if (!currentSubmission || !user) return
    setSaving(true)
    setSaved(false)
    try {
      const grade = manualGrade

      const { error } = await supabase
        .from('submissions')
        .update({
          grade: Number(grade) || 0,
          feedback: feedback || null,
          graded_by: user.id,
          graded_at: new Date().toISOString(),
          status: 'graded',
        })
        .eq('id', currentSubmission.id)

      if (!error) {
          setSubmissions(prev =>
            prev.map(s => s.id === currentSubmission.id ? {
              ...s, grade: Number(grade) || 0, feedback: feedback || null,
              graded_by: user.id, graded_at: new Date().toISOString(), status: 'graded'
            } as SubmissionWithUser : s)
          )
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    } catch (err) {
      console.error('Failed to submit grade', err)
    } finally {
      setSaving(false)
    }
  }

  if (authLoading || loading) {
    return (
      <DashboardLayout role="admin">
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 text-indigo-400 animate-spin" />
        </div>
      </DashboardLayout>
    )
  }

  if (!assignment) {
    return (
      <DashboardLayout role="admin">
        <div className="space-y-6">
          <Link href="/admin/penugasan">
            <Button variant="ghost" size="sm"><ChevronLeft className="mr-1 h-4 w-4" /> {t('admin2.grading.back')}</Button>
          </Link>
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <FileText className="h-12 w-12 text-muted mb-4" />
              <p className="text-lg font-semibold text-on-surface">{t('admin2.grading.notFoundTitle')}</p>
              <p className="text-sm text-on-surface-variant mt-1">{t('admin2.grading.notFoundDesc')}</p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Link href="/admin/penugasan">
              <Button variant="ghost" size="sm"><ChevronLeft className="mr-1 h-4 w-4" /> {t('admin2.grading.back')}</Button>
            </Link>
            <h1 className="text-2xl font-bold text-on-surface mt-1">{assignment.title}</h1>
            <p className="text-sm text-on-surface-variant">{t('admin2.grading.subtitle')}</p>
          </div>
        </div>

        {submissions.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <FileText className="h-10 w-10 text-muted mb-3" />
              <p className="text-sm text-on-surface-variant">{t('admin2.grading.empty')}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-3 space-y-2">
              <p className="text-xs font-medium text-muted uppercase tracking-wider">{t('admin2.grading.submissionsList', { count: submissions.length })}</p>
              {submissions.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedIdx(i)}
                  className={`w-full text-left rounded-lg border p-3 transition-colors ${
                    i === selectedIdx
                      ? 'border-indigo-500/50 bg-indigo-500/5'
                      : 'border-border bg-background hover:border-indigo-500/30'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 text-[10px] font-bold text-white">
                      {s.user?.display_name?.[0] || '?'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-on-surface truncate">{s.user?.display_name || t('admin2.grading.unknown')}</p>
                      <p className="text-[10px] text-muted">
                        {s.submitted_at ? new Date(s.submitted_at).toLocaleDateString(locale) : '-'}
                      </p>
                    </div>
                    {(s.grade != null && typeof s.grade === 'number') && (
                      <span className="text-xs font-semibold text-emerald-400">{s.grade}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>

            <div className="lg:col-span-9 space-y-6">
              {currentSubmission && (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <UserIcon className="h-5 w-5 text-indigo-400" />
                        {currentSubmission.user?.display_name || t('admin2.grading.unknownStudent')}
                      </CardTitle>
                      <CardDescription>
                        {currentSubmission.submitted_at ? t('admin2.grading.submittedAt', { datetime: new Date(currentSubmission.submitted_at).toLocaleString(locale) }) : '-'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {currentSubmission.file_url && (
                        <div>
                          <Label>{t('admin2.grading.fileLabel')}</Label>
                          <div className="mt-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                setPreviewUrl(null)
                                const url = await getSignedUrl(currentSubmission.file_url)
                                setPreviewUrl(url || null)
                              }}
                            >
                              <FileText className="h-4 w-4 mr-1" />
                              {t('admin2.grading.viewFile')}
                            </Button>
                          </div>
                        </div>
                      )}
                      {currentSubmission.notes && (
                        <div>
                          <Label>{t('admin2.grading.studentNotes')}</Label>
                          <p className="mt-1 text-sm text-on-surface-variant bg-surface-container-highest rounded-lg p-3">
                            {currentSubmission.notes}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">{t('admin2.grading.gradeTitle')}</CardTitle>
                      <CardDescription>{t('admin2.grading.gradeDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div>
                          <Label>{t('admin2.grading.gradeLabel', { max: assignment.max_grade })}</Label>
                          <Input
                            type="number"
                            min={0}
                            max={assignment.max_grade}
                            value={manualGrade}
                            onChange={e => setManualGrade(Math.min(Number(e.target.value) || 0, assignment.max_grade))}
                            className="w-40"
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">{t('admin2.grading.feedbackTitle')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Textarea
                        value={feedback}
                        onChange={e => setFeedback(e.target.value)}
                        placeholder={t('admin2.grading.feedbackPlaceholder')}
                        className="min-h-[120px]"
                      />
                    </CardContent>
                  </Card>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {(currentSubmission.grade != null && typeof currentSubmission.grade === 'number') && (
                        <Badge variant="success" className="text-xs">
                          {t('admin2.grading.previousGrade', { grade: currentSubmission.grade })}
                        </Badge>
                      )}
                      {saved && (
                        <span className="flex items-center gap-1 text-sm text-emerald-400">
                          <CheckCircle className="h-4 w-4" /> {t('admin2.grading.saved')}
                        </span>
                      )}
                    </div>
                    <Button size="lg" onClick={handleSubmitGrade} loading={saving}>
                      <Save className="mr-1 h-4 w-4" /> {t('admin2.grading.saveGrade')}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {previewUrl && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setPreviewUrl(null)}
          >
            <div
              className="w-full max-w-3xl rounded-2xl bg-surface border border-border shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 shrink-0 text-indigo-400" />
                  <span className="truncate text-sm font-semibold">{getFileName(previewUrl)}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {t('admin2.grading.download')}
                  </a>
                  <button
                    onClick={() => setPreviewUrl(null)}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface/80 hover:text-foreground transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <div className="max-h-[70vh] overflow-auto bg-background">
                {getFileKind(previewUrl) === 'image' ? (
                  <img src={previewUrl} alt={t('admin2.grading.previewAlt')} className="mx-auto max-h-[70vh] w-auto object-contain" />
                ) : getFileKind(previewUrl) === 'pdf' ? (
                  <iframe src={previewUrl} className="h-[70vh] w-full" title="Preview file pengumpulan" />
                ) : getFileKind(previewUrl) === 'doc' ? (
                  <iframe
                    src={`https://docs.google.com/viewer?url=${encodeURIComponent(previewUrl)}&embedded=true`}
                    className="h-[70vh] w-full"
                    title={t('admin2.grading.previewAlt')}
                  />
                ) : (
                  <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
                    <FileText className="h-12 w-12 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      {t('admin2.grading.previewUnavailable')}
                    </p>
                    <a
                      href={previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400 transition-colors"
                    >
                      <Download className="h-4 w-4" />
                      {t('admin2.grading.openDownload')}
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}