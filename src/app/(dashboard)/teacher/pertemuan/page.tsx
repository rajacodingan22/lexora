'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase-client'
import { useAuth } from '@/lib/auth-context'
import { formatDateOnly } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/client'
import type { Course, LiveSession, Language, LanguageLevel, User, Enrollment } from '@/types'
import {
  Plus, Calendar, Clock, Video, MapPin, ExternalLink,
  Edit3, Trash2, Users, Loader2, X, CheckCircle, XCircle, UserCheck
} from 'lucide-react'

interface LiveSessionWithCourse extends LiveSession {
  course_title?: string
}

interface AttendanceWithUser {
  id: string
  session_id: string
  user_id: string
  status: string
  marked_at: string
  user?: { id: string; display_name: string | null; photo_url: string | null }
}

const LOCALE_MAP: Record<string, string> = {
  en: 'en-US',
  id: 'id-ID',
  zh: 'zh-CN',
}

export default function TeacherMeetingsPage() {
  const { user } = useAuth()
  const supabase = createClient()
  const { t, lang } = useI18n()
  const locale = LOCALE_MAP[lang] || 'en-US'

  const [meetings, setMeetings] = useState<LiveSessionWithCourse[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [attendanceMap, setAttendanceMap] = useState<Record<string, { count: number; records: AttendanceWithUser[] }>>({})
  const [loading, setLoading] = useState(true)
  const [levelMap, setLevelMap] = useState<Record<string, LanguageLevel>>({})
  const [languageMap, setLanguageMap] = useState<Record<string, Language>>({})

  const [showModal, setShowModal] = useState(false)
  const [editingMeeting, setEditingMeeting] = useState<LiveSessionWithCourse | null>(null)
  const [showAttendanceFor, setShowAttendanceFor] = useState<string | null>(null)
  const [form, setForm] = useState({
    course_id: '',
    title: '',
    starts_at: '',
    duration_minutes: 60,
    provider: 'Zoom',
    meeting_link: '',
    description: '',
  })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [teacherId, setTeacherId] = useState<string | null>(null)

  /* attendance marking */
  const [markingSessionId, setMarkingSessionId] = useState<string | null>(null)
  const [enrolledStudents, setEnrolledStudents] = useState<(Enrollment & { user: User })[]>([])
  const [attendanceStatus, setAttendanceStatus] = useState<Record<string, boolean>>({})
  const [savingAttendance, setSavingAttendance] = useState(false)

  /* weekly schedule */
  const [schedules, setSchedules] = useState<any[]>([])
  const [scheduleCourseId, setScheduleCourseId] = useState('')
  const [scheduleForm, setScheduleForm] = useState({ day_of_week: 1, start_time: '19:00', duration_minutes: 60 })
  const [savingSchedule, setSavingSchedule] = useState(false)

  const DAY_KEYS = [
    'teacher2.pertemuan.days.sunday',
    'teacher2.pertemuan.days.monday',
    'teacher2.pertemuan.days.tuesday',
    'teacher2.pertemuan.days.wednesday',
    'teacher2.pertemuan.days.thursday',
    'teacher2.pertemuan.days.friday',
    'teacher2.pertemuan.days.saturday',
  ]

  useEffect(() => {
    if (!user) return
    fetchData()
  }, [user])

  function getCourseLabel(c: Course): string {
    const title = c.title?.en || c.title?.id || t('teacher2.pertemuan.untitled')
    const lang = languageMap[c.language_code]
    const level = levelMap[c.level_id]
    const langName = lang?.name?.en || c.language_code?.toUpperCase() || ''
    const levelName = level?.name?.en || ''
    return `${title} (${langName} - ${levelName})`
  }

  async function fetchData() {
    setLoading(true)

    try {
      const { data: teacherRow } = await supabase
        .from('teachers')
        .select('id')
        .eq('user_id', user!.id)
        .maybeSingle()

      if (!teacherRow) {
        setCourses([])
        setLoading(false)
        return
      }
      setTeacherId(teacherRow.id)

      const { data: ctRows } = await supabase
        .from('course_teachers')
        .select('course_id')
        .eq('teacher_id', teacherRow.id)

      const courseIds = (ctRows || []).map(ct => ct.course_id)

      if (courseIds.length === 0) {
        setCourses([])
        setLoading(false)
        return
      }

      const { data: coursesData } = await supabase
        .from('courses')
        .select('*')
        .in('id', courseIds)
        .order('created_at', { ascending: false })

      const teacherCourses = (coursesData || []) as Course[]
      setCourses(teacherCourses)
      const [{ data: levels }, { data: langs }] = await Promise.all([
        supabase.from('language_levels').select('id, language_code, code, name'),
        supabase.from('languages').select('code, name, native_name, flag_emoji'),
      ])
      if (levels) setLevelMap(Object.fromEntries(levels.map(l => [l.id, l])))
      if (langs) setLanguageMap(Object.fromEntries(langs.map(l => [l.code, l])))

      const { data: schedData } = await supabase
        .from('course_schedules')
        .select('*')
        .in('course_id', courseIds)
      setSchedules((schedData || []) as any[])
      setScheduleCourseId(prev => prev || teacherCourses[0]?.id || '')

      const { data: meetingsData } = await supabase
        .from('live_sessions')
        .select('*')
        .in('course_id', courseIds)
        .order('starts_at', { ascending: false })

      const fetchedMeetings = (meetingsData || []) as LiveSession[]
      const enriched: LiveSessionWithCourse[] = fetchedMeetings.map(m => {
        const course = teacherCourses.find(c => c.id === m.course_id)
        return {
          ...m,
          course_title: course?.title ? (typeof course.title === 'string' ? course.title : (course.title as any)?.en || (course.title as any)?.id || '') : t('teacher2.pertemuan.unknown'),
        }
      })
      setMeetings(enriched)

      if (fetchedMeetings.length > 0) {
        const sessionIds = fetchedMeetings.map(m => m.id)
        const { data: attData } = await supabase
          .from('attendance')
          .select('*, user:users(id, display_name, photo_url)')
          .in('session_id', sessionIds)
          .order('marked_at', { ascending: false })

        const attRecords = (attData || []) as AttendanceWithUser[]
        const map: Record<string, { count: number; records: AttendanceWithUser[] }> = {}
        attRecords.forEach(r => {
          if (!map[r.session_id]) map[r.session_id] = { count: 0, records: [] }
          map[r.session_id].count++
          map[r.session_id].records.push(r)
        })
        setAttendanceMap(map)
      }
    } catch (err) {
      console.error('Failed to fetch data:', err)
      setCourses([])
      setMeetings([])
      setAttendanceMap({})
    }

    setLoading(false)
  }

  function openCreateModal() {
    setEditingMeeting(null)
    setFormError('')
    const now = new Date()
    const localStr = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    setForm({
      course_id: courses[0]?.id || '',
      title: '',
      starts_at: localStr,
      duration_minutes: 60,
      provider: 'Zoom',
      meeting_link: '',
      description: '',
    })
    setShowModal(true)
  }

  function openEditModal(meeting: LiveSessionWithCourse) {
    setEditingMeeting(meeting)
    setFormError('')
    const startDate = new Date(meeting.starts_at)
    const localStr = new Date(startDate.getTime() - startDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    setForm({
      course_id: meeting.course_id,
      title: meeting.title,
      starts_at: localStr,
      duration_minutes: meeting.duration_minutes,
      provider: meeting.provider,
      meeting_link: meeting.meeting_link || '',
      description: meeting.description || '',
    })
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.title || !form.starts_at || !form.course_id) return
    setSaving(true)
    setFormError('')

    const startsAtISO = new Date(form.starts_at).toISOString()

    const payload = {
      course_id: form.course_id,
      teacher_id: teacherId,
      title: form.title,
      starts_at: startsAtISO,
      duration_minutes: form.duration_minutes,
      provider: form.provider,
      meeting_link: form.meeting_link || null,
      description: form.description || null,
      status: 'scheduled' as const,
    }

    try {
      if (editingMeeting) {
        const { error } = await supabase.from('live_sessions').update(payload).eq('id', editingMeeting.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('live_sessions').insert(payload)
        if (error) throw error
      }
      setShowModal(false)
      fetchData()
    } catch (err: any) {
      console.error('Failed to save meeting:', err)
      setFormError(err?.message || t('teacher2.pertemuan.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(meetingId: string) {
    if (!confirm(t('teacher2.pertemuan.deleteConfirm'))) return
    await supabase.from('attendance').delete().eq('session_id', meetingId)
    await supabase.from('live_sessions').delete().eq('id', meetingId)
    fetchData()
  }

  async function handleCancel(meetingId: string) {
    await supabase.from('live_sessions').update({ status: 'cancelled' }).eq('id', meetingId)
    fetchData()
  }

  async function openAttendanceMarking(meeting: LiveSessionWithCourse) {
    setMarkingSessionId(meeting.id)
    setSavingAttendance(false)
    const { data: enrData } = await supabase
      .from('enrollments')
      .select('*, user:users(*)')
      .eq('course_id', meeting.course_id)
      .eq('status', 'active')
    const enrolled = (enrData || []) as (Enrollment & { user: User })[]
    setEnrolledStudents(enrolled)

    const { data: attData } = await supabase
      .from('attendance')
      .select('user_id, status')
      .eq('session_id', meeting.id)
    const existing: Record<string, boolean> = {}
    if (attData) {
      attData.forEach(a => { existing[a.user_id] = a.status === 'present' })
    }
    setAttendanceStatus(existing)
  }

  async function handleSaveAttendance() {
    if (!markingSessionId) return
    setSavingAttendance(true)
    const records = enrolledStudents.map(s => ({
      session_id: markingSessionId,
      user_id: s.user_id,
      status: attendanceStatus[s.user_id] ? 'present' : 'absent',
      marked_at: new Date().toISOString(),
    }))
    const { error } = await supabase.from('attendance').upsert(records, {
      onConflict: 'session_id,user_id',
      ignoreDuplicates: false,
    })
    if (!error) {
      setMarkingSessionId(null)
      fetchData()
    }
    setSavingAttendance(false)
  }

  async function handleAddSchedule() {
    if (!scheduleCourseId) return
    setSavingSchedule(true)
    try {
      const { error } = await supabase.from('course_schedules').insert({
        course_id: scheduleCourseId,
        day_of_week: scheduleForm.day_of_week,
        start_time: scheduleForm.start_time,
        duration_minutes: scheduleForm.duration_minutes,
      })
      if (error) throw error
      await fetchData()
    } catch (err) {
      console.error('Failed to add schedule:', err)
      alert(t('teacher2.pertemuan.scheduleAddError', { message: (err as any)?.message || '' }))
    }
    setSavingSchedule(false)
  }

  async function handleDeleteSchedule(scheduleId: string) {
    if (!confirm(t('teacher2.pertemuan.scheduleDeleteConfirm'))) return
    const { error } = await supabase.from('course_schedules').delete().eq('id', scheduleId)
    if (error) console.error('Failed to delete schedule:', error)
    await fetchData()
  }

  const filteredSchedules = schedules.filter(s => s.course_id === scheduleCourseId)

  const getPlatformIcon = (platform: string) => {
    const p = platform.toLowerCase()
    if (p.includes('zoom')) return 'zoom'
    if (p.includes('meet') || p.includes('google')) return 'meet'
    return 'offline'
  }

  const getStatusBadge = (meeting: LiveSessionWithCourse) => {
    if (meeting.status === 'cancelled') return <Badge variant="destructive">{t('teacher2.pertemuan.statusCancelled')}</Badge>
    if (meeting.status === 'completed') return <Badge variant="success">{t('teacher2.pertemuan.statusCompleted')}</Badge>
    const meetingDate = new Date(meeting.starts_at)
    if (meetingDate > new Date()) return <Badge variant="default">{t('teacher2.pertemuan.statusUpcoming')}</Badge>
    return <Badge variant="warning">{t('teacher2.pertemuan.statusMissed')}</Badge>
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 text-indigo-400 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">{t('teacher2.pertemuan.title')}</h1>
          <p className="text-on-surface-variant">{t('teacher2.pertemuan.subtitle')}</p>
        </div>
        <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-400 border-blue-500/20">
          <Calendar className="h-3 w-3 mr-1" /> {t('teacher2.pertemuan.adminManaged')}
        </Badge>
      </div>
      <Card className="border-blue-500/20 bg-blue-500/5">
        <CardContent className="p-3 flex items-center gap-2 text-sm text-blue-400">
          <Calendar className="h-4 w-4" />
          <span>{t('teacher2.pertemuan.adminManagedHint')}</span>
        </CardContent>
      </Card>

      {courses.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm flex items-center gap-2">
              <Calendar className="h-4 w-4 text-indigo-400" /> {t('teacher2.pertemuan.weeklySchedule')}
            </CardTitle>
            <Badge variant="outline">{t('teacher2.pertemuan.slotCount', { count: filteredSchedules.length })}</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t('teacher2.pertemuan.scheduleCourse')}</Label>
              <select
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-indigo-500/50 max-w-sm"
                value={scheduleCourseId}
                onChange={(e) => setScheduleCourseId(e.target.value)}
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>{getCourseLabel(c)}</option>
                ))}
              </select>
            </div>

            {filteredSchedules.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {filteredSchedules.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 rounded-lg border border-border bg-surface-container-low px-3 py-2">
                    <span className="text-sm font-medium text-on-surface">
                      {DAY_KEYS[s.day_of_week] ? t(DAY_KEYS[s.day_of_week]) : s.day_of_week}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted">
                      <Clock className="h-3 w-3" /> {s.start_time}
                      {s.duration_minutes ? ` \u2022 ${t('teacher2.pertemuan.durationMinutes', { minutes: s.duration_minutes })}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {filteredSchedules.length === 0 && (
              <p className="text-xs text-muted">{t('teacher2.pertemuan.noSchedule') || 'Belum ada jadwal mingguan.'}</p>
            )}
            <p className="text-xs text-muted">
              {t('teacher2.pertemuan.scheduleHint')}
            </p>
          </CardContent>
        </Card>
      )}

      {courses.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Calendar className="h-12 w-12 text-muted mb-3" />
            <p className="text-sm text-on-surface-variant">{t('teacher2.pertemuan.noCourse')}</p>
          </CardContent>
        </Card>
      ) : meetings.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Calendar className="h-12 w-12 text-muted mb-3" />
            <p className="text-sm text-on-surface-variant">{t('teacher2.pertemuan.empty')}</p>
            <Button size="sm" className="mt-3" onClick={openCreateModal}>
              <Plus className="mr-1 h-4 w-4" /> {t('teacher2.pertemuan.createNewBtn')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {meetings.map((meeting) => {
            const attInfo = attendanceMap[meeting.id]
            const platformIcon = getPlatformIcon(meeting.provider)
            const startDate = new Date(meeting.starts_at)
            const dateStr = formatDateOnly(meeting.starts_at)
            const timeStr = startDate.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })

            return (
              <Card key={meeting.id}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-on-surface">{meeting.title}</h3>
                      {getStatusBadge(meeting)}
                      <Badge variant="outline" className="text-[10px]">{meeting.course_title}</Badge>
                    </div>
                    {meeting.description && (
                      <p className="text-sm text-on-surface-variant mt-1">{meeting.description}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-muted">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" /> {dateStr}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" /> {timeStr}
                      </span>
                      {meeting.duration_minutes > 0 && (
                        <span>{t('teacher2.pertemuan.durationMinutes', { minutes: meeting.duration_minutes })}</span>
                      )}
                      <span className="flex items-center gap-1">
                        {platformIcon === 'offline' ? (
                          <MapPin className="h-3.5 w-3.5" />
                        ) : (
                          <Video className="h-3.5 w-3.5" />
                        )}
                        {meeting.provider}
                      </span>
                      <span className="flex items-center gap-1 text-indigo-400">
                        <Users className="h-3.5 w-3.5" />
                        {t('teacher2.pertemuan.presentCount', { count: attInfo?.count || 0 })}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {meeting.meeting_link && meeting.status !== 'cancelled' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(meeting.meeting_link!, '_blank')}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {/* Guru read-only: edit/cancel/delete dikelola Admin */}
                  </div>
                </div>

                {showAttendanceFor === meeting.id && (
                  <div className="mt-4 border-t border-border pt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Users className="h-4 w-4 text-indigo-400" />
                      <span className="text-sm font-medium text-on-surface">{t('teacher2.pertemuan.attendanceTitle')}</span>
                      <Badge variant="outline">{t('teacher2.pertemuan.studentCount', { count: attInfo?.count || 0 })}</Badge>
                    </div>
                    {(!attInfo || attInfo.records.length === 0) ? (
                      <p className="text-xs text-muted">{t('teacher2.pertemuan.noAttendance')}</p>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {attInfo.records.map((r) => (
                          <div key={r.id} className="flex items-center gap-2 rounded-lg border border-border bg-surface-container-low p-2.5">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-medium text-indigo-400">
                              {r.user?.display_name?.[0] || '?'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-on-surface truncate">
                                {r.user?.display_name || t('teacher2.pertemuan.unknown')}
                              </p>
                              <p className="text-[10px] text-muted">{formatDateOnly(r.marked_at)}</p>
                            </div>
                            {r.status === 'present' || r.status === 'hadir' ? (
                              <CheckCircle className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                            ) : r.status === 'late' ? (
                              <Clock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-on-surface">
                {editingMeeting ? t('teacher2.pertemuan.modalEditTitle') : t('teacher2.pertemuan.modalCreateTitle')}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-muted hover:text-on-surface">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t('teacher2.pertemuan.courseLabel')}</Label>
                <select
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  value={form.course_id}
                  onChange={(e) => setForm({ ...form, course_id: e.target.value })}
                >
                  <option value="">{t('teacher2.pertemuan.coursePlaceholder')}</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>{getCourseLabel(c)}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label>{t('teacher2.pertemuan.titleLabel')}</Label>
                <Input
                  placeholder={t('teacher2.pertemuan.titlePlaceholder')}
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label>{t('teacher2.pertemuan.datetimeLabel')}</Label>
                <Input
                  type="datetime-local"
                  value={form.starts_at}
                  onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label>{t('teacher2.pertemuan.durationLabel')}</Label>
                <Input
                  type="number"
                  value={String(form.duration_minutes)}
                  onChange={(e) => setForm({ ...form, duration_minutes: parseInt(e.target.value) || 0 })}
                />
              </div>

              <div className="space-y-1.5">
                <Label>{t('teacher2.pertemuan.platformLabel')}</Label>
                <select
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  value={form.provider}
                  onChange={(e) => setForm({ ...form, provider: e.target.value })}
                >
                  <option value="Zoom">Zoom</option>
                  <option value="Google Meet">Google Meet</option>
                  <option value="Offline">Offline</option>
                </select>
              </div>

              {form.provider !== 'Offline' && (
                <div className="space-y-1.5">
                  <Label>{t('teacher2.pertemuan.linkLabel')}</Label>
                  <Input
                    placeholder="https://zoom.us/j/..."
                    value={form.meeting_link}
                    onChange={(e) => setForm({ ...form, meeting_link: e.target.value })}
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label>{t('teacher2.pertemuan.descriptionLabel')}</Label>
                <textarea
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-on-surface placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-indigo-500/50 min-h-[80px] resize-y"
                  placeholder={t('teacher2.pertemuan.descriptionPlaceholder')}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
            </div>

            {formError && (
              <p className="mt-3 text-sm font-medium text-red-400">{formError}</p>
            )}

            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-border">
              <Button variant="secondary" onClick={() => setShowModal(false)}>{t('teacher2.pertemuan.cancel')}</Button>
              <Button variant="default" onClick={handleSave} disabled={saving}>
                {saving ? t('teacher2.pertemuan.saving') : (editingMeeting ? t('teacher2.pertemuan.updateBtn') : t('teacher2.pertemuan.createBtn'))}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Attendance Marking Modal ═══ */}
      {markingSessionId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-on-surface">{t('teacher2.pertemuan.attendanceModalTitle')}</h2>
              <button onClick={() => setMarkingSessionId(null)} className="text-muted hover:text-on-surface">
                <X className="h-5 w-5" />
              </button>
            </div>

            {enrolledStudents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Users className="h-12 w-12 text-muted mb-3" />
                <p className="text-sm text-on-surface-variant">{t('teacher2.pertemuan.noEnrolled')}</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {enrolledStudents.map((s) => (
                  <div
                    key={s.user_id}
                    className={`flex items-center justify-between rounded-lg border p-3 cursor-pointer transition-colors ${
                      attendanceStatus[s.user_id]
                        ? 'border-emerald-500/50 bg-emerald-500/10'
                        : attendanceStatus[s.user_id] === false
                        ? 'border-red-500/50 bg-red-500/10'
                        : 'border-border bg-surface-container-low'
                    }`}
                    onClick={() => setAttendanceStatus(prev => ({ ...prev, [s.user_id]: !prev[s.user_id] }))}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 text-sm font-bold text-white">
                        {s.user?.display_name?.[0] || '?'}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-on-surface">{s.user?.display_name || t('teacher2.pertemuan.unknown')}</p>
                        <p className="text-xs text-muted">{s.user?.email || ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {attendanceStatus[s.user_id] ? (
                        <span className="text-xs font-medium text-emerald-400">{t('teacher2.pertemuan.present')}</span>
                      ) : attendanceStatus[s.user_id] === false ? (
                        <span className="text-xs font-medium text-red-400">{t('teacher2.pertemuan.absent')}</span>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-border">
              <Button variant="secondary" onClick={() => setMarkingSessionId(null)}>{t('teacher2.pertemuan.cancel')}</Button>
              <Button onClick={handleSaveAttendance} loading={savingAttendance} disabled={enrolledStudents.length === 0}>
                {t('teacher2.pertemuan.saveAttendance')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}