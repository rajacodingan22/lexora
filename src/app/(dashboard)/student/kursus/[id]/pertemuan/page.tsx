'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { createClient } from '@/lib/supabase-client'
import { useAuth } from '@/lib/auth-context'
import { useI18n } from '@/lib/i18n/client'
import type { LiveSession } from '@/types'
import { formatDateOnly, filterByTeacher, isMeetingLinkOpen, getMeetingPhase } from '@/lib/utils'
import {
  Calendar, Clock, Video, MapPin, Loader2, ChevronLeft,
  ExternalLink, CheckCircle, XCircle, History, CalendarClock
} from 'lucide-react'

interface Meeting {
  id: string
  course_id: string
  title: string
  description: string | null
  starts_at: string
  duration_minutes: number
  provider: string
  meeting_link: string | null
  status: string
  created_at: string
}

interface AttendanceRecord {
  id: string
  session_id: string
  user_id: string
  status: string
  marked_at: string | null
  joined_at: string | null
}

export default function StudentMeetingsPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const { t, lang } = useI18n()
  const supabase = createClient()
  const courseId = params.id as string
  const locale = { en: 'en-US', id: 'id-ID', zh: 'zh-CN' }[lang] || 'en-US'

  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([])
  const [courseTitle, setCourseTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('upcoming')

  useEffect(() => {
    if (!user || !courseId) return
    fetchMeetings()
  }, [user, courseId])

  async function fetchMeetings() {
    setLoading(true)

    try {
      const { data: courseData } = await supabase
        .from('courses')
        .select('title')
        .eq('id', courseId)
        .single()

      if (courseData) {
        const t = courseData.title as { id?: string; en?: string }
        setCourseTitle(t?.en || t?.id || 'Course')
      }

      const { data: meetingsData } = await supabase
        .from('live_sessions')
        .select('*')
        .eq('course_id', courseId)
        .order('starts_at', { ascending: false })

      let visibleMeetings = (meetingsData || []) as LiveSession[]
      if (user) {
        const { data: enrollment } = await supabase
          .from('enrollments')
          .select('teacher_id')
          .eq('course_id', courseId)
          .eq('user_id', user.id)
          .maybeSingle()
        if (enrollment) {
          visibleMeetings = filterByTeacher(
            visibleMeetings,
            new Map<string, string | null>([[courseId, (enrollment as { teacher_id: string | null }).teacher_id]])
          )
        }
      }

      const fetchedMeetings = visibleMeetings.map(s => ({
        id: s.id,
        course_id: s.course_id,
        title: s.title,
        description: s.description,
        starts_at: s.starts_at,
        duration_minutes: s.duration_minutes || 0,
        provider: s.provider || 'offline',
        meeting_link: s.meeting_link || null,
        status: s.status || 'scheduled',
        created_at: s.created_at,
      })) as Meeting[]
      setMeetings(fetchedMeetings)

      if (fetchedMeetings.length > 0 && user) {
        const meetingIds = fetchedMeetings.map(m => m.id)
        const { data: attData } = await supabase
          .from('attendance')
          .select('*')
          .in('session_id', meetingIds)
          .eq('user_id', user.id)

        setAttendanceRecords((attData || []) as AttendanceRecord[])
      }
    } catch (err) {
      console.error('Failed to fetch meetings:', err)
      setMeetings([])
      setAttendanceRecords([])
    }

    setLoading(false)
  }

  const now = new Date()
  const upcoming = meetings.filter(m => getMeetingPhase(m, now) === 'upcoming' || getMeetingPhase(m, now) === 'ongoing')
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())

  const past = meetings.filter(m => getMeetingPhase(m, now) === 'past' || m.status === 'completed' || m.status === 'cancelled')
    .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())

  const isAttended = (meetingId: string) => {
    return attendanceRecords.some(r => r.session_id === meetingId && (r.status === 'present' || r.status === 'hadir'))
  }

  const canMarkAttendance = (meeting: Meeting) => {
    if (isAttended(meeting.id)) return false
    if (meeting.status === 'cancelled') return false
    if (!isMeetingLinkOpen(meeting, now)) return false
    const meetingDate = new Date(meeting.starts_at)
    const diffMs = now.getTime() - meetingDate.getTime()
    const diffMinutes = diffMs / 60000
    return diffMinutes >= -15
  }

  async function handleMarkAttendance(meetingId: string) {
    if (!user) return
    try {
      const { error } = await supabase
        .from('attendance')
        .insert({
          session_id: meetingId,
          user_id: user.id,
          status: 'present',
          marked_at: new Date().toISOString(),
          joined_at: new Date().toISOString(),
        })
      if (error) throw error
      // Update local state
      setAttendanceRecords(prev => [
        ...prev,
        {
          id: crypto.randomUUID?.() || '',
          session_id: meetingId,
          user_id: user.id,
          status: 'present',
          marked_at: new Date().toISOString(),
          joined_at: new Date().toISOString(),
        },
      ])
    } catch (err) {
      console.error('Failed to mark attendance:', err)
    }
  }

  const getStatusBadge = (meeting: Meeting) => {
    if (meeting.status === 'cancelled') return <Badge variant="destructive">Cancelled</Badge>
    if (meeting.status === 'completed') return <Badge variant="success">Completed</Badge>
    const phase = getMeetingPhase(meeting, now)
    if (phase === 'ongoing') return <Badge variant="warning">Ongoing</Badge>
    if (phase === 'upcoming') return <Badge variant="default">Upcoming</Badge>
    return <Badge variant="outline">Past</Badge>
  }

  const getPlatformIcon = (platform: string) => {
    const p = platform.toLowerCase()
    if (p.includes('zoom')) return 'zoom'
    if (p.includes('meet') || p.includes('google')) return 'meet'
    return 'offline'
  }

  function MeetingCard({ meeting }: { meeting: Meeting }) {
    const attended = isAttended(meeting.id)
    const hasRecord = attendanceRecords.some(r => r.session_id === meeting.id)
    const canMark = canMarkAttendance(meeting)
    const platformIcon = getPlatformIcon(meeting.provider)
    const _meetingDate = new Date(meeting.starts_at)
    const [marking, setMarking] = useState(false)

    async function onMarkAttendance() {
      setMarking(true)
      await handleMarkAttendance(meeting.id)
      setMarking(false)
    }

    return (
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-on-surface">{meeting.title}</h3>
              {getStatusBadge(meeting)}
            </div>
            {meeting.description && (
              <p className="text-sm text-on-surface-variant mt-1">{meeting.description}</p>
            )}
            <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-muted">
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {formatDateOnly(meeting.starts_at)}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {new Date(meeting.starts_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
              </span>
              {meeting.duration_minutes > 0 && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {meeting.duration_minutes} min
                </span>
              )}
              <span className="flex items-center gap-1">
                {platformIcon === 'offline' ? (
                  <MapPin className="h-3.5 w-3.5" />
                ) : (
                  <Video className="h-3.5 w-3.5" />
                )}
                {meeting.provider}
              </span>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
              attended
                ? 'bg-emerald-500/20 text-emerald-400'
                : meeting.status === 'cancelled'
                ? 'bg-red-500/20 text-red-400'
                : 'bg-amber-500/20 text-amber-400'
            }`}>
              {attended ? (
                <><CheckCircle className="h-3 w-3" /> {t('student1.pertemuan.present')}</>
              ) : (
                <><XCircle className="h-3 w-3" /> {t('student1.pertemuan.absent')}</>
              )}
            </div>

            {/* Tandai Hadir Button */}
            {!attended && !hasRecord && meeting.status !== 'cancelled' && (
              <Button
                size="sm"
                variant={canMark ? 'default' : 'secondary'}
                disabled={!canMark || marking}
                onClick={onMarkAttendance}
                className={canMark ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : ''}
              >
                {marking ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <CheckCircle className="h-3.5 w-3.5 mr-1" />
                )}
                {marking ? t('student1.pertemuan.processing') : t('student1.pertemuan.markPresent')}
              </Button>
            )}

            {meeting.meeting_link && meeting.status !== 'cancelled' && isMeetingLinkOpen(meeting) && (
              <Button
                size="sm"
                variant="default"
                onClick={() => window.open(meeting.meeting_link!, '_blank')}
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1" /> Join
              </Button>
            )}
          </div>
        </div>
      </Card>
    )
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
          <h1 className="text-2xl font-bold text-on-surface">Meetings & Schedule</h1>
          <p className="text-on-surface-variant">{courseTitle}</p>
        </div>
        <Button variant="ghost" onClick={() => router.back()}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Back
        </Button>
      </div>

      {meetings.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Calendar className="h-12 w-12 text-muted mb-3" />
            <p className="text-sm text-on-surface-variant">No meetings scheduled yet</p>
          </CardContent>
        </Card>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="upcoming">
              <CalendarClock className="h-4 w-4 mr-1.5" />
              {t('student1.pertemuan.upcoming')} {upcoming.length > 0 && `(${upcoming.length})`}
            </TabsTrigger>
            <TabsTrigger value="past">
              <History className="h-4 w-4 mr-1.5" />
              {t('student1.pertemuan.past')} {past.length > 0 && `(${past.length})`}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="space-y-3">
            {upcoming.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-10 text-center">
                  <Calendar className="h-10 w-10 text-muted mb-2" />
                  <p className="text-sm text-on-surface-variant">No upcoming meetings</p>
                </CardContent>
              </Card>
            ) : (
              upcoming.map(m => <MeetingCard key={m.id} meeting={m} />)
            )}
          </TabsContent>

          <TabsContent value="past" className="space-y-3">
            {past.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-10 text-center">
                  <Calendar className="h-10 w-10 text-muted mb-2" />
                  <p className="text-sm text-on-surface-variant">No past meetings</p>
                </CardContent>
              </Card>
            ) : (
              past.map(m => <MeetingCard key={m.id} meeting={m} />)
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
