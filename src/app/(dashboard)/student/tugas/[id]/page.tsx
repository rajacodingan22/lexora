'use client'

import { use, useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'
import { useAuth } from '@/lib/auth-context'
import { useI18n } from '@/lib/i18n/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import {
  FileText, Clock, AlertTriangle, Upload, CheckCircle,
  Download, ArrowLeft, Calendar, History, RefreshCw,
  Video, Type, Users, HardDrive
} from 'lucide-react'
import Link from 'next/link'
import FilePreviewModal from '@/components/shared/file-preview-modal'
import { DriveConnectCard } from '@/components/student/drive-connect-card'
import { getSignedUrl } from '@/lib/storage'

export default function AssignmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const supabase = createClient()
  const { user } = useAuth()
  const { t, lang } = useI18n()
  const locale = lang === 'en' ? 'en-US' : lang === 'zh' ? 'zh-CN' : 'id-ID'

  const [assignment, setAssignment] = useState<any>(null)
  const [course, setCourse] = useState<any>(null)
  const [submission, setSubmission] = useState<any>(null)
  const [grade, setGrade] = useState<any>(null)
  const [allSubmissions, setAllSubmissions] = useState<any[]>([])
  const [gradeMap, setGradeMap] = useState<Record<string, any>>({})
  const [showResubmitForm, setShowResubmitForm] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [timeLeft, setTimeLeft] = useState<string>('')
  const [driveConnected, setDriveConnected] = useState<boolean | null>(null)
  const [answerText, setAnswerText] = useState('')
  const [submittingText, setSubmittingText] = useState(false)
  const [driveFile, setDriveFile] = useState<File | null>(null)
  const [uploadingDrive, setUploadingDrive] = useState(false)
  const [showTempForm, setShowTempForm] = useState(false)
  const [gallery, setGallery] = useState<any[]>([])
  const [videoPreview, setVideoPreview] = useState<{ url: string; title: string } | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)

    const { data: asg } = await supabase
      .from('assignments')
      .select('*')
      .eq('id', id)
      .single()

    if (asg) {
      setAssignment(asg)
      const { data: c } = await supabase
        .from('courses')
        .select('title')
        .eq('id', asg.course_id)
        .single()
      setCourse(c)
    }

    if (user) {
      const { data: subs } = await supabase
        .from('submissions')
        .select('*')
        .eq('assignment_id', id)
        .eq('user_id', user.id)
        .order('submitted_at', { ascending: false })

      if (subs && subs.length > 0) {
        setAllSubmissions(subs)
        setSubmission(subs[0])
        setShowResubmitForm(false)

        const gm: Record<string, any> = {}
        subs.forEach(s => {
          if (s.grade != null) {
            gm[s.id] = {
              submission_id: s.id,
              grade: s.grade,
              feedback: s.feedback,
              graded_at: s.graded_at,
              graded_by: s.graded_by,
            }
          }
        })
        setGradeMap(gm)
        setGrade(gm[subs[0].id] || null)
      } else {
        setAllSubmissions([])
        setSubmission(null)
        setGrade(null)
        setGradeMap({})
      }
    }

    try {
      const st = await fetch('/api/drive/status').then(r => r.json()).catch(() => null)
      setDriveConnected(!!st?.connected)
    } catch { setDriveConnected(false) }

    if (user) {
      const { data: gal } = await supabase
        .from('submissions')
        .select('id, user_id, file_name, drive_file_id, drive_link, answer_text, submitted_at, purged_at, storage_kind, user:users!submissions_user_id_fkey(display_name)')
        .eq('assignment_id', id)
        .neq('user_id', user.id)
        .order('submitted_at', { ascending: false })
        .limit(50)
      setGallery(gal || [])
    }

    setLoading(false)
  }, [id, user])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (!assignment?.due_date) return
    const due = new Date(assignment.due_date)
    const now = new Date()
    const _diff = due.getTime() - now.getTime()

    const updateTimer = () => {
      const d = new Date(assignment.due_date).getTime() - Date.now()
      if (d <= 0) {
        setTimeLeft('')
        return
      }
      const days = Math.floor(d / 86400000)
      const hours = Math.floor((d % 86400000) / 3600000)
      const mins = Math.floor((d % 3600000) / 60000)
      const secs = Math.floor((d % 60000) / 1000)
      setTimeLeft(`${days}d ${hours}h ${mins}m ${secs}s`)
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [assignment?.due_date])

  const isPastDue = assignment?.due_date && new Date(assignment.due_date) < new Date()
  const within7Days = assignment?.due_date && !isPastDue &&
    (new Date(assignment.due_date).getTime() - Date.now()) <= 7 * 86400000

  const openFile = async (fileUrl: string) => {
    setPreviewUrl(null)
    const url = await getSignedUrl(fileUrl)
    setPreviewUrl(url || null)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) setFile(e.target.files[0])
  }

  const handleSubmit = async () => {
    if (!file || !user || !assignment) return
    setUploading(true)

    try {
      const ext = file.name.split('.').pop()
      const filePath = `${assignment.id}/${user.id}_${Date.now()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('submissions')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      const { error: insertError } = await supabase
        .from('submissions')
        .insert({
          assignment_id: assignment.id,
          user_id: user.id,
          file_url: `submissions/${filePath}`,
          file_name: file.name,
          status: 'submitted',
          submitted_at: new Date().toISOString(),
          storage_kind: 'temp',
        })

      if (insertError) throw insertError

      setFile(null)
      await fetchData()
    } catch (err) {
      console.error('Submission error:', err)
    } finally {
      setUploading(false)
    }
  }

  const MIME_BY_EXT: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
  }

  const handleTextSubmit = async () => {
    if (!user || !assignment || !answerText.trim() || answerText.length > 5000) return
    setSubmittingText(true)
    try {
      const { error } = await supabase.from('submissions').insert({
        assignment_id: assignment.id,
        user_id: user.id,
        answer_text: answerText.trim(),
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        storage_kind: 'drive',
      })
      if (error) throw error
      setAnswerText('')
      await fetchData()
    } catch (err) {
      console.error('Text submission error:', err)
    } finally {
      setSubmittingText(false)
    }
  }

  const handleDriveSubmit = async () => {
    if (!driveFile || !user || !assignment) return
    setUploadingDrive(true)
    try {
      const ext = (driveFile.name.split('.').pop() || '').toLowerCase()
      const mimeType = MIME_BY_EXT[ext] || driveFile.type || 'application/octet-stream'
      const initRes = await fetch('/api/drive/submission-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignmentId: assignment.id,
          fileName: driveFile.name,
          mimeType,
          sizeBytes: driveFile.size,
        }),
      })
      const initJson = await initRes.json().catch(() => ({}))
      if (!initRes.ok) {
        if (initJson.fallback) setShowTempForm(true)
        throw new Error(initJson.error || 'Drive upload init failed')
      }
      const putRes = await fetch(initJson.sessionUri, {
        method: 'PUT',
        headers: { 'Content-Type': mimeType },
        body: driveFile,
      })
      if (!putRes.ok) throw new Error('Drive upload failed')
      const uploaded = await putRes.json().catch(() => ({})) as { id?: string }
      if (!uploaded.id) throw new Error('Drive tidak mengembalikan file')
      const compRes = await fetch('/api/drive/submission-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'complete', fileId: uploaded.id }),
      })
      const comp = await compRes.json().catch(() => ({}))
      if (!compRes.ok) throw new Error(comp.error || 'Drive complete failed')
      const { error } = await supabase.from('submissions').insert({
        assignment_id: assignment.id,
        user_id: user.id,
        drive_file_id: comp.drive_file_id,
        drive_link: comp.drive_link,
        file_name: driveFile.name,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        storage_kind: 'drive',
      })
      if (error) throw error
      setDriveFile(null)
      await fetchData()
    } catch (err) {
      console.error('Drive submission error:', err)
    } finally {
      setUploadingDrive(false)
    }
  }

  function drivePreviewEmbed(link: string | null): string | null {
    if (!link) return null
    const m = link.match(/\/file\/d\/([^/]+)/)
    return m ? `https://drive.google.com/file/d/${m[1]}/preview` : null
  }

  function openSubmissionPreview(s: any) {
    const pv = drivePreviewEmbed(s.drive_link)
    if (s.drive_file_id && pv) {
      setVideoPreview({ url: pv, title: s.file_name || 'Drive file' })
      return
    }
    if (s.file_url) {
      openFile(s.file_url)
      return
    }
    setPreviewUrl(`/api/submissions/${s.id}/content`)
  }

  function tempCountdownText(expiresAt: string | null): string {
    if (!expiresAt) return ''
    const ms = new Date(expiresAt).getTime() - Date.now()
    if (ms <= 0) return t('student1.tugas.expiredPurged')
    const h = Math.floor(ms / 3600000)
    const m = Math.floor((ms % 3600000) / 60000)
    return t('student1.tugas.expiresIn', { h, m })
  }

  const acceptAttr = ((assignment?.allowed_file_types as string[] | undefined) || ['pdf'])
    .map(e => '.' + String(e).toLowerCase())
    .join(',')

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin h-8 w-8 border-2 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!assignment) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-on-surface">Assignment not found</h1>
        <Button onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
      </div>
    )
  }

  const canResubmit = submission && grade && assignment.resubmission_allowed && !isPastDue

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted">
        <Link href="/student/dashboard" className="hover:text-indigo-400">Dashboard</Link>
        <span>/</span>
        <span className="text-on-surface">{assignment.title}</span>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">{assignment.title}</h1>
          <p className="text-on-surface-variant">{course?.title?.en || course?.title?.id || ''}</p>
        </div>
        <div className="flex gap-2">
          {within7Days && !isPastDue && (
            <Badge variant="warning" className="text-sm py-1 px-3">
              <Clock className="h-4 w-4 mr-1" /> {timeLeft}
            </Badge>
          )}
          {isPastDue && (
            <Badge variant="destructive" className="text-sm py-1 px-3">
              <AlertTriangle className="h-4 w-4 mr-1" /> {t('student1.tugas.overdue')}
            </Badge>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Instructions</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-on-surface-variant whitespace-pre-wrap">
                {assignment.instructions}
              </p>
            </CardContent>
          </Card>

          {submission && !showResubmitForm ? (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-emerald-400" />
                  <CardTitle className="text-sm">Submitted</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {submission.answer_text && (
                  <p className="text-sm text-on-surface-variant whitespace-pre-wrap rounded-lg border border-border bg-surface-container-low p-4">
                    {submission.answer_text}
                  </p>
                )}
                {(submission.drive_file_id || submission.file_url) && !submission.purged_at && (
                <div className="flex items-center justify-between rounded-lg border border-border bg-surface-container-low p-4">
                  <div className="flex items-center gap-3 min-w-0">
                    {assignment?.submission_kind === 'video'
                      ? <Video className="h-5 w-5 text-sky-400 shrink-0" />
                      : <FileText className="h-5 w-5 text-indigo-400 shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-on-surface truncate">
                        {submission.file_name || 'Submission file'}
                      </p>
                      <p className="text-xs text-muted">
                        {formatDate(submission.submitted_at, locale)}
                        {submission.storage_kind === 'drive'
                          ? ` · ${t('student1.tugas.driveBadge')}`
                          : ` · ${t('student1.tugas.tempBadge')} · ${tempCountdownText(submission.expires_at)}`}
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => openSubmissionPreview(submission)}>
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
                )}
                {submission.purged_at && (
                  <p className="text-xs text-amber-400 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3">
                    {t('student1.tugas.purgedNotice')}
                  </p>
                )}

                {grade && (
                  <div className="rounded-lg border border-border bg-surface-container-low p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-on-surface">Grade</p>
                        <p className="text-xs text-muted mt-1">{grade.feedback}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-2xl font-bold text-indigo-400">
                          {grade.grade}
                        </span>
                        <span className="text-muted text-sm">/{assignment.max_grade}</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted mt-2">
                      Graded on {formatDate(grade.graded_at, locale)}
                    </p>
                  </div>
                )}

                {canResubmit && (
                  <Button
                    variant="outline"
                    onClick={() => setShowResubmitForm(true)}
                    className="w-full"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" /> {t('student1.tugas.resubmit')}
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : assignment?.submission_kind === 'text_inline' ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Type className="h-4 w-4 text-emerald-400" />
                  {submission ? t('student1.tugas.submitRevision') : t('student1.tugas.submitTitle')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <textarea
                    value={answerText}
                    onChange={e => setAnswerText(e.target.value.slice(0, 5000))}
                    rows={8}
                    placeholder={t('student1.tugas.answerPlaceholder')}
                    className="w-full rounded-lg border border-border bg-surface-container-low p-3 text-sm text-on-surface placeholder:text-muted"
                  />
                  <p className="text-xs text-muted mt-1 text-right">{answerText.length}/5000</p>
                </div>
                <div className="flex gap-2">
                  {submission && (
                    <Button variant="ghost" size="sm" onClick={() => { setShowResubmitForm(false); setAnswerText('') }}>
                      {t('student1.tugas.cancel')}
                    </Button>
                  )}
                  <Button
                    variant="default"
                    size="sm"
                    className="flex-1"
                    disabled={!answerText.trim() || submittingText}
                    onClick={handleTextSubmit}
                    loading={submittingText}
                  >
                    {submittingText ? t('student1.tugas.processing') : t('student1.tugas.submit')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : driveConnected ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  {assignment?.submission_kind === 'video'
                    ? <Video className="h-4 w-4 text-sky-400" />
                    : <HardDrive className="h-4 w-4 text-indigo-400" />}
                  {submission ? t('student1.tugas.submitRevision') : t('student1.tugas.submitTitle')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border-2 border-dashed border-border bg-surface-container-low p-6 text-center">
                  <Upload className="h-8 w-8 mx-auto text-muted mb-2" />
                  <p className="text-sm text-on-surface-variant mb-1">
                    {t('student1.tugas.uploadDriveHint')}
                  </p>
                  <p className="text-xs text-muted mb-4">
                    {assignment?.submission_kind === 'video'
                      ? t('student1.tugas.videoHint')
                      : t('student1.tugas.docHint', { types: ((assignment?.allowed_file_types as string[] | undefined) || []).join(', ').toUpperCase() })}
                  </p>
                  <input
                    type="file"
                    accept={acceptAttr}
                    onChange={e => setDriveFile(e.target.files?.[0] || null)}
                    className="block w-full text-sm text-on-surface file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-indigo-500/10 file:text-indigo-400 hover:file:bg-indigo-500/20 cursor-pointer"
                  />
                </div>

                {driveFile && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-container-low p-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-indigo-400 shrink-0" />
                      <span className="text-sm text-on-surface truncate">{driveFile.name}</span>
                      <span className="text-xs text-muted shrink-0">
                        ({(driveFile.size / 1024 / 1024).toFixed(2)} MB)
                      </span>
                    </div>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleDriveSubmit}
                      loading={uploadingDrive}
                    >
                      {uploadingDrive ? t('student1.tugas.uploading') : t('student1.tugas.submit')}
                    </Button>
                  </div>
                )}

                <div className="flex gap-2">
                  {submission && (
                    <Button variant="ghost" size="sm" onClick={() => { setShowResubmitForm(false); setDriveFile(null) }}>
                      {t('student1.tugas.cancel')}
                    </Button>
                  )}
                  <button onClick={() => setShowTempForm(v => !v)} className="ml-auto text-xs text-muted hover:text-indigo-400 underline underline-offset-2">
                    {t('student1.tugas.tempTitle')}
                  </button>
                </div>

                {showTempForm && (
                  <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-4 space-y-3">
                    <p className="text-xs text-amber-300">{t('student1.tugas.tempWarning')}</p>
                    <input
                      type="file"
                      accept={acceptAttr}
                      onChange={handleFileChange}
                      className="block w-full text-sm text-on-surface file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-indigo-500/10 file:text-indigo-400 hover:file:bg-indigo-500/20 cursor-pointer"
                    />
                    {file && (
                      <Button variant="default" size="sm" onClick={handleSubmit} loading={uploading}>
                        {uploading ? t('student1.tugas.uploading') : t('student1.tugas.submit')}
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <DriveConnectCard />
              <Card>
                <CardContent className="pt-4">
                  <button onClick={() => setShowTempForm(v => !v)} className="text-sm text-indigo-400 hover:text-indigo-300 underline underline-offset-2">
                    {t('student1.tugas.tempTitle')}
                  </button>
                  {showTempForm && (
                    <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/5 p-4 space-y-3">
                      <p className="text-xs text-amber-300">{t('student1.tugas.tempWarning')}</p>
                      <input
                        type="file"
                        accept={acceptAttr}
                        onChange={handleFileChange}
                        className="block w-full text-sm text-on-surface file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-indigo-500/10 file:text-indigo-400 hover:file:bg-indigo-500/20 cursor-pointer"
                      />
                      {file && (
                        <Button variant="default" size="sm" onClick={handleSubmit} loading={uploading}>
                          {uploading ? t('student1.tugas.uploading') : t('student1.tugas.submit')}
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {allSubmissions.length > 1 && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <History className="h-5 w-5 text-muted" />
                  <CardTitle className="text-sm">Submission History</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {allSubmissions.map((s, i) => {
                  const g = gradeMap[s.id]
                  return (
                    <div key={s.id}>
                      <div className="flex items-center justify-between rounded-lg border border-border bg-surface-container-low p-3">
                        <div className="flex items-center gap-3">
                          <FileText className="h-4 w-4 text-indigo-400" />
                          <div>
                            <p className="text-sm text-on-surface">
                              Submission {allSubmissions.length - i}
                            </p>
                            <p className="text-xs text-muted">
                              {formatDate(s.submitted_at, locale)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {g && (
                            <span className="text-sm font-medium text-indigo-400">
                              {g.grade}/{assignment.max_grade}
                            </span>
                          )}
                          {s.file_url && (
                            <a href={s.file_url} onClick={(e) => { e.preventDefault(); openFile(s.file_url) }}>
                              <Button variant="ghost" size="sm">
                                <Download className="h-4 w-4" />
                              </Button>
                            </a>
                          )}
                        </div>
                      </div>
                      {g?.feedback && (
                        <p className="text-xs text-muted mt-1 ml-9">{g.feedback}</p>
                      )}
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-muted" />
                <CardTitle className="text-sm">{t('student1.tugas.galleryTitle')}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {gallery.length === 0 ? (
                <p className="text-sm text-muted text-center py-4">{t('student1.tugas.galleryEmpty')}</p>
              ) : (
                gallery.map(g => (
                  <div key={g.id} className="rounded-lg border border-border bg-surface-container-low p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-on-surface truncate">
                          {g.user?.display_name || g.user_id.slice(0, 8)}
                        </p>
                        <p className="text-xs text-muted">
                          {g.submitted_at ? formatDate(g.submitted_at, locale) : ''}
                        </p>
                      </div>
                      {(g.drive_file_id || g.file_url) && !g.purged_at && (
                        <Button variant="ghost" size="sm" onClick={() => openSubmissionPreview(g)}>
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {g.answer_text && (
                      <p className="text-sm text-on-surface-variant whitespace-pre-wrap rounded bg-background p-2 max-h-28 overflow-auto">
                        {g.answer_text}
                      </p>
                    )}
                    {!g.answer_text && g.file_name && (
                      <p className="text-xs text-muted truncate">{g.file_name}</p>
                    )}
                    {g.purged_at && (
                      <p className="text-xs text-amber-400">{t('student1.tugas.purgedNotice')}</p>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted" />
                <span className="text-on-surface-variant">Due:</span>
                <span className={`font-medium ${isPastDue ? 'text-red-400' : 'text-on-surface'}`}>
                  {formatDate(assignment.due_date, locale)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4 text-muted" />
                <span className="text-on-surface-variant">Max Score:</span>
                <span className="font-medium text-on-surface">{assignment.max_grade}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle className="h-4 w-4 text-muted" />
                <span className="text-on-surface-variant">Status:</span>
                <Badge variant={submission ? 'success' : 'warning'}>
                  {submission ? 'Submitted' : 'Not Submitted'}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <FilePreviewModal url={previewUrl} title={previewUrl?.split('/').pop()} onClose={() => setPreviewUrl(null)} />
      {videoPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setVideoPreview(null)}>
          <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-slate-900" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <p className="text-sm font-medium text-white truncate">{videoPreview.title}</p>
              <button onClick={() => setVideoPreview(null)} className="text-white/40 hover:text-white">✕</button>
            </div>
            <iframe src={videoPreview.url} className="h-[60vh] w-full border-0" title={videoPreview.title} allow="autoplay" />
          </div>
        </div>
      )}
    </div>
  )
}
