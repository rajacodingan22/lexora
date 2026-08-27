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
  Download, ArrowLeft, Calendar, History, RefreshCw
} from 'lucide-react'
import Link from 'next/link'
import FilePreviewModal from '@/components/shared/file-preview-modal'
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
  const { t } = useI18n()

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
          status: 'submitted',
          submitted_at: new Date().toISOString(),
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
        <Link href="/student/kursus" className="hover:text-indigo-400">Courses</Link>
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
                <div className="flex items-center justify-between rounded-lg border border-border bg-surface-container-low p-4">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-indigo-400" />
                    <div>
                      <p className="text-sm font-medium text-on-surface">
                        Submission file
                      </p>
                      <p className="text-xs text-muted">
                        {formatDate(submission.submitted_at)}
                      </p>
                    </div>
                  </div>
                  {submission.file_url && (
                    <a href={submission.file_url} onClick={(e) => { e.preventDefault(); openFile(submission.file_url) }}>
                      <Button variant="ghost" size="sm">
                        <Download className="h-4 w-4" />
                      </Button>
                    </a>
                  )}
                </div>

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
                      Graded on {formatDate(grade.graded_at)}
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
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  {submission ? 'Submit Revision' : 'Submit Assignment'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border-2 border-dashed border-border bg-surface-container-low p-6 text-center">
                  <Upload className="h-8 w-8 mx-auto text-muted mb-2" />
                  <p className="text-sm text-on-surface-variant mb-1">
                    Upload your assignment file
                  </p>
                  <p className="text-xs text-muted mb-4">
                    PDF, DOCX, or Images (max 10MB)
                  </p>
                  <input
                    type="file"
                    accept=".pdf,.docx,.doc,.png,.jpg,.jpeg"
                    onChange={handleFileChange}
                    className="block w-full text-sm text-on-surface file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-indigo-500/10 file:text-indigo-400 hover:file:bg-indigo-500/20 cursor-pointer"
                  />
                </div>

                {file && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-container-low p-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-indigo-400 shrink-0" />
                      <span className="text-sm text-on-surface truncate">{file.name}</span>
                      <span className="text-xs text-muted shrink-0">
                        ({(file.size / 1024 / 1024).toFixed(2)} MB)
                      </span>
                    </div>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleSubmit}
                      loading={uploading}
                    >
                      {uploading ? 'Uploading...' : 'Submit'}
                    </Button>
                  </div>
                )}

                {submission && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowResubmitForm(false)}
                  >
                    Cancel
                  </Button>
                )}
              </CardContent>
            </Card>
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
                              {formatDate(s.submitted_at)}
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
                  {formatDate(assignment.due_date)}
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
    </div>
  )
}
