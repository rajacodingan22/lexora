'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase-client'
import { useI18n } from '@/lib/i18n/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Plus, Loader2, X, Calendar, CalendarDays, Clock, LinkIcon, Video, MapPin, Users, Search,
  ExternalLink, CheckCircle2, XCircle, History, CalendarClock, ArrowUpRight
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface Session {
  id: string
  course_id: string
  teacher_id: string
  batch_id: string | null
  title: string
  starts_at: string
  provider: string
  meeting_link: string
  duration_minutes: number | null
  description: string | null
  status: string
  attendance_count: number
  course_title?: string
  teacher_name?: string
}

interface Course {
  id: string
  title: { id: string; en: string }
}

interface TeacherInfo {
  id: string
  display_name: string
}

interface SessionForm {
  course_id: string
  teacher_id: string
  batch_id: string
  title: string
  starts_at: string
  provider: string
  meeting_link: string
  duration_minutes: string
}

const emptyForm: SessionForm = {
  course_id: '', teacher_id: '', batch_id: '', title: '', starts_at: '', provider: 'zoom', meeting_link: '', duration_minutes: '60',
}

const platforms = [
  { value: 'zoom', labelKey: 'admin1.jadwal.platformZoom' },
  { value: 'google_meet', labelKey: 'admin1.jadwal.platformGoogleMeet' },
  { value: 'microsoft_teams', labelKey: 'admin1.jadwal.platformTeams' },
  { value: 'webex', labelKey: 'admin1.jadwal.platformWebex' },
  { value: 'other', labelKey: 'admin1.jadwal.platformOther' },
]

const LOCALE_MAP: Record<string, string> = { en: 'en-US', id: 'id-ID', zh: 'zh-CN' }

function formatDateTime(iso: string | null, locale: string): { date: string; time: string; full: string } {
  if (!iso) return { date: '-', time: '', full: '-' }
  const d = new Date(iso)
  const full = d.toLocaleString(locale, {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
  const date = d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  return { date, time, full }
}

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 100, damping: 15 } },
}

export default function AdminJadwalPage() {
  const { t, lang } = useI18n()
  const supabase = createClient()
  const [sessions, setSessions] = useState<Session[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [teachers, setTeachers] = useState<TeacherInfo[]>([])
  const [batches, setBatches] = useState<{ id: string; name: string; course_id: string; start_date: string | null; end_date: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editingSession, setEditingSession] = useState<Session | null>(null)
  const [form, setForm] = useState<SessionForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('upcoming')

  const [searchQuery, setSearchQuery] = useState('')
  const [filterCourse, setFilterCourse] = useState('all')
  const [filterTeacher, setFilterTeacher] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')

  // ---- Generator jadwal berulang per batch ----
  const [showGen, setShowGen] = useState(false)
  const [gen, setGen] = useState({
    course_id: '', batch_id: '', days: [] as number[],
    time: '09:00', duration: '60', from: '', to: '',
    teacher_id: 'all', baseTitle: 'Week', links: '',
  })
  const [genPreview, setGenPreview] = useState<{ starts_at: string; link: string | null; clash: boolean }[]>([])
  const [generating, setGenerating] = useState(false)
  const [genResult, setGenResult] = useState<string | null>(null)

  const GEN_DAYS = [1, 2, 3, 4, 5, 6, 0]

  function toggleGenDay(d: number) {
    setGen(prev => ({
      ...prev,
      days: prev.days.includes(d) ? prev.days.filter(x => x !== d) : [...prev.days, d].sort(),
    }))
  }

  function computeGenPreview() {
    setGenResult(null)
    if (!gen.batch_id || gen.days.length === 0 || !gen.time || !gen.from || !gen.to) {
      setGenPreview([])
      return
    }
    const links = gen.links.split('\n').map(s => s.trim()).filter(Boolean)
    const existing = new Set(
      sessions
        .filter(s => (s as unknown as { batch_id?: string | null }).batch_id === gen.batch_id && s.starts_at)
        .map(s => new Date(s.starts_at).getTime())
    )
    const out: { starts_at: string; link: string | null; clash: boolean }[] = []
    const [hh, mm] = gen.time.split(':').map(Number)
    let li = 0
    for (let d = new Date(gen.from + 'T00:00:00'); d <= new Date(gen.to + 'T00:00:00'); d.setDate(d.getDate() + 1)) {
      if (!gen.days.includes(d.getDay())) continue
      const dt = new Date(d)
      dt.setHours(hh || 0, mm || 0, 0, 0)
      const clash = existing.has(dt.getTime())
      const link = links.length > 0 ? (links[li] || null) : null
      if (!clash) li++
      out.push({ starts_at: dt.toISOString(), link, clash })
    }
    setGenPreview(out)
  }

  async function handleGenerate() {
    const rows = genPreview.filter(g => !g.clash)
    if (rows.length === 0 || !gen.batch_id || !gen.course_id) return
    setGenerating(true)
    setGenResult(null)
    try {
      const payload = rows.map((g, i) => ({
        course_id: gen.course_id,
        batch_id: gen.batch_id,
        teacher_id: gen.teacher_id === 'all' ? null : gen.teacher_id,
        title: `${gen.baseTitle || 'Week'} ${i + 1}`,
        starts_at: g.starts_at,
        duration_minutes: parseInt(gen.duration) || 60,
        provider: 'zoom',
        meeting_link: g.link,
        status: 'scheduled',
      }))
      const { error } = await supabase.from('live_sessions').insert(payload)
      if (error) throw error
      const skipped = genPreview.length - rows.length
      setGenResult(t('admin1.jadwal.genResult', { created: rows.length, skipped }))
      setGenPreview([])
      fetchSessions()
    } catch (err: any) {
      setGenResult(t('admin1.jadwal.genFailed', { message: err?.message || '' }))
    } finally {
      setGenerating(false)
    }
  }

  const now = new Date()

  useEffect(() => { Promise.all([fetchSessions(), fetchCourses(), fetchTeachers(), fetchBatches()]) }, [])

  async function fetchBatches() {
    try {
      const { data } = await supabase.from('batches').select('id, name, course_id, start_date, end_date').order('created_at', { ascending: false })
      if (data) setBatches(data as { id: string; name: string; course_id: string; start_date: string | null; end_date: string | null }[])
    } catch (err) { console.error('Failed to fetch batches:', err) }
  }

  function pickGenBatch(batchId: string) {
    const b = batches.find(x => x.id === batchId)
    setGen(prev => ({
      ...prev,
      batch_id: batchId,
      course_id: b ? b.course_id : prev.course_id,
      from: b?.start_date ? b.start_date.slice(0, 10) : prev.from,
      to: b?.end_date ? b.end_date.slice(0, 10) : prev.to,
    }))
    setGenPreview([])
    setGenResult(null)
  }

  async function fetchCourses() {
    try {
      const { data } = await supabase.from('courses').select('id, title').order('created_at', { ascending: false })
      if (data) setCourses(data as Course[])
    } catch (err) { console.error('Failed to fetch courses:', err) }
  }

  async function fetchTeachers() {
    try {
      const { data } = await supabase
        .from('teachers')
        .select('id, user:users!user_id(id, display_name)')
        .eq('status', 'active')
      if (data) {
        setTeachers((data as any[]).map((t) => ({
          id: t.id,
          display_name: t.user?.display_name || t('admin1.jadwal.unknown'),
        })))
      }
    } catch (err) { console.error('Failed to fetch teachers:', err) }
  }

  async function fetchSessions() {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('live_sessions')
        .select('*')
        .order('starts_at', { ascending: false })
      if (data && data.length > 0) {
        const courseIds = [...new Set(data.map((s: any) => s.course_id))]
        const teacherIds = [...new Set(data.map((s: any) => s.teacher_id))]
        const sessionIds = data.map((s: any) => s.id)

        const [{ data: coursesData }, { data: teachersData }, { data: attendanceData }] = await Promise.all([
          supabase.from('courses').select('id, title').in('id', courseIds),
          supabase.from('teachers').select('id, user:users!user_id(id, display_name)').in('id', teacherIds),
          supabase.from('attendance').select('session_id, status').in('session_id', sessionIds),
        ])

        const courseMap = new Map((coursesData || []).map((c: any) => [c.id, c]))
        const teacherMap = new Map((teachersData || []).map((t: any) => [t.id, t.user?.display_name || t('admin1.jadwal.unknown')]))
        const attendanceCounts: Record<string, number> = {}
        for (const a of (attendanceData || [])) {
          attendanceCounts[a.session_id] = (attendanceCounts[a.session_id] || 0) + 1
        }

        const sessionsWithInfo = data.map((s: any) => {
          const c = courseMap.get(s.course_id)
          const title = c ? (typeof c.title === 'object' ? (c.title.en || c.title.id) : c.title) : t('admin1.jadwal.unknown')
          return { ...s, course_title: title, teacher_name: teacherMap.get(s.teacher_id) || t('admin1.jadwal.unknown'), attendance_count: attendanceCounts[s.id] || 0 } as Session
        })
        setSessions(sessionsWithInfo)
      } else { setSessions([]) }
    } catch (err) { console.error('Failed to fetch sessions:', err); setSessions([]) }
    setLoading(false)
  }

  function openCreate() { setForm(emptyForm); setEditingSession(null); setShowCreate(true) }
  function openEdit(session: Session) {
    setForm({
      course_id: session.course_id, teacher_id: session.teacher_id, batch_id: (session as { batch_id?: string | null }).batch_id || '',
      title: session.title,
      starts_at: toDatetimeLocal(session.starts_at), provider: session.provider || 'zoom',
      meeting_link: session.meeting_link || '', duration_minutes: String(session.duration_minutes ?? 60),
    })
    setEditingSession(session); setShowCreate(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const payload = {
        title: form.title, starts_at: new Date(form.starts_at).toISOString(),
        provider: form.provider, meeting_link: form.meeting_link,
        duration_minutes: parseInt(form.duration_minutes) || 60,
        batch_id: form.batch_id || null,
      }
      if (editingSession) {
        const { error } = await supabase.from('live_sessions').update(payload).eq('id', editingSession.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('live_sessions').insert({ course_id: form.course_id, teacher_id: form.teacher_id, ...payload, status: 'scheduled' })
        if (error) throw error
      }
      setShowCreate(false); fetchSessions()
    } catch (err: any) { console.error('Failed to save session:', err); alert(err?.message || t('admin1.jadwal.saveError')) }
    finally { setSaving(false) }
  }

  async function handleCancel(session: Session) {
    if (!confirm(t('admin1.jadwal.cancelConfirm', { title: session.title }))) return
    await supabase.from('live_sessions').update({ status: 'cancelled' }).eq('id', session.id)
    fetchSessions()
  }

  // Resolve effective status: consider past scheduled/ongoing sessions as "completed" in UI
  function effectiveStatus(s: Session): string {
    if (s.status === 'cancelled') return 'cancelled'
    if (s.status === 'completed') return 'completed'
    if (s.status === 'ongoing') return 'ongoing'
    const start = new Date(s.starts_at)
    const end = new Date(start.getTime() + (s.duration_minutes || 60) * 60000)
    if (now > end) return 'completed'   // sudah lewat → anggap selesai
    if (now >= start && now <= end) return 'ongoing'
    return 'scheduled'
  }

  function statusLabel(status: string): string {
    switch (status) {
      case 'scheduled': return t('admin1.jadwal.statusScheduled')
      case 'ongoing': return t('admin1.jadwal.statusOngoing')
      case 'completed': return t('admin1.jadwal.statusCompleted')
      case 'cancelled': return t('admin1.jadwal.statusCancelled')
      default: return status
    }
  }

  function statusVariant(status: string): 'default' | 'success' | 'warning' | 'destructive' | 'outline' {
    if (status === 'scheduled') return 'outline'
    if (status === 'completed') return 'success'
    if (status === 'cancelled') return 'destructive'
    if (status === 'ongoing') return 'warning'
    return 'outline'
  }

  function getPlatformIcon(platform: string) {
    switch (platform) {
      case 'zoom': case 'google_meet': case 'microsoft_teams': return <Video className="h-3.5 w-3.5" />
      default: return <MapPin className="h-3.5 w-3.5" />
    }
  }
  function getPlatformLabel(platform: string) {
    return t(platforms.find(p => p.value === platform)?.labelKey || 'admin1.jadwal.platformOther') 
  }
  function getCourseName(id: string) {
    const c = courses.find(c => c.id === id)
    if (!c) return t('admin1.jadwal.unknown')
    return typeof c.title === 'object' ? (c.title.en || c.title.id) : c.title
  }

  const filtered = sessions.filter(s => {
    if (filterCourse !== 'all' && s.course_id !== filterCourse) return false
    if (filterTeacher !== 'all' && s.teacher_id !== filterTeacher) return false
    const eff = effectiveStatus(s)
    if (filterStatus !== 'all' && eff !== filterStatus) return false
    const sDate = s.starts_at ? s.starts_at.slice(0, 10) : ''
    if (filterDateFrom && sDate < filterDateFrom) return false
    if (filterDateTo && sDate > filterDateTo) return false
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      if (!s.title.toLowerCase().includes(q) && !(s.course_title || '').toLowerCase().includes(q) && !(s.teacher_name || '').toLowerCase().includes(q)) return false
    }
    return true
  })

  // Split into upcoming (scheduled + ongoing) and history (completed + cancelled)
  const upcoming = filtered.filter(s => { const e = effectiveStatus(s); return e === 'scheduled' || e === 'ongoing' })
  const history = filtered.filter(s => { const e = effectiveStatus(s); return e === 'completed' || e === 'cancelled' })

  const upcomingCount = upcoming.length
  const historyCount = history.length

  function SessionCard({ session }: { session: Session }) {
    const eff = effectiveStatus(session)
    const isPast = eff === 'completed' || eff === 'cancelled'
    const canEdit = eff === 'scheduled' || eff === 'ongoing'
    const canCancel = eff === 'scheduled' || eff === 'ongoing'
    const fmt = formatDateTime(session.starts_at, LOCALE_MAP[lang] || 'en-US')

    return (
      <motion.div variants={itemVariants}>
        <Card className={`group transition-all duration-300 hover:shadow-xl overflow-hidden ${isPast ? 'opacity-75 hover:opacity-100' : 'hover:border-indigo-500/30'}`}>
          {/* Top color bar based on status */}
          <div className={`h-1 ${eff === 'ongoing' ? 'bg-gradient-to-r from-amber-500 to-orange-500 animate-pulse' : eff === 'completed' ? 'bg-gradient-to-r from-emerald-500 to-teal-500' : eff === 'cancelled' ? 'bg-gradient-to-r from-red-500 to-rose-500' : 'bg-gradient-to-r from-indigo-500 to-purple-500'}`} />
          <CardContent className="p-5 space-y-4">
            {/* Header: title + status */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-on-surface truncate group-hover:text-indigo-400 transition-colors">
                  {session.title}
                </h3>
                <p className="text-xs text-on-surface-variant mt-0.5 truncate">{session.course_title}</p>
              </div>
              <Badge variant={statusVariant(eff)} size="sm" className="shrink-0 capitalize">
                {statusLabel(eff)}
              </Badge>
            </div>

            {/* Info rows */}
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-on-surface-variant">
                <Calendar className="h-4 w-4 text-muted shrink-0" />
                <span className="font-medium text-on-surface">{fmt.date}</span>
                <span className="text-muted">·</span>
                <Clock className="h-4 w-4 text-muted shrink-0" />
                <span>{fmt.time}</span>
              </div>
              <div className="flex items-center gap-2 text-on-surface-variant">
                <Clock className="h-4 w-4 text-muted shrink-0" />
                <span>{t('admin1.jadwal.minutes', { count: session.duration_minutes ?? '-' })}</span>
              </div>
              <div className="flex items-center gap-2 text-on-surface-variant">
                <Users className="h-4 w-4 text-muted shrink-0" />
                <span>{session.teacher_name}</span>
              </div>
            </div>

            {/* Platform + attendance */}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="flex items-center gap-1.5 text-xs">
                {getPlatformIcon(session.provider)}
                {getPlatformLabel(session.provider)}
              </Badge>
              <span className="text-xs text-muted flex items-center gap-1">
                <Users className="h-3 w-3" />
                {t('admin1.jadwal.attended', { count: session.attendance_count })}
              </span>
              {isPast && (
                <Badge variant="outline" size="sm" className="text-[10px] text-muted border-emerald-500/30 text-emerald-400">
                  <CheckCircle2 className="h-3 w-3 mr-0.5" /> {t('admin1.jadwal.sessionDone')}
                </Badge>
              )}
            </div>

            {/* Meeting link */}
            {session.meeting_link && eff !== 'cancelled' && (
              <a
                href={session.meeting_link} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 truncate rounded-lg bg-indigo-500/5 px-2.5 py-1.5 transition-colors hover:bg-indigo-500/10"
              >
                <LinkIcon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{session.meeting_link.replace(/^https?:\/\//, '')}</span>
                <ExternalLink className="h-3 w-3 shrink-0 ml-auto opacity-50 group-hover:opacity-100" />
              </a>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-border">
              {isPast ? (
                <span className="text-xs text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> {t('admin1.jadwal.sessionFinished')}
                </span>
              ) : (
                <span className="text-xs text-on-surface-variant">
                  {eff === 'ongoing' ? t('admin1.jadwal.sessionLive') : t('admin1.jadwal.sessionUpcoming')}
                </span>
              )}
              <div className="flex gap-1">
                {canEdit && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openEdit(session)}>
                    {t('admin1.jadwal.edit')}
                  </Button>
                )}
                {canCancel && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-red-400 hover:text-red-300" onClick={() => handleCancel(session)}>
                    {t('admin1.jadwal.cancel')}
                  </Button>
                )}
                {isPast && eff !== 'cancelled' && session.meeting_link && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => window.open(session.meeting_link, '_blank')}>
                    <ArrowUpRight className="h-3 w-3 mr-1" /> {t('admin1.jadwal.replay')}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    )
  }

  return (
    <motion.div className="space-y-6" variants={containerVariants} initial="hidden" animate="visible">
      {/* Header */}
      <motion.div variants={itemVariants} className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-cyan-500/10 border border-blue-500/20 p-6">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-blue-500/10 to-transparent rounded-full blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4 shrink-0">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg shadow-blue-500/20">
              <CalendarClock className="h-7 w-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-on-surface">{t('admin1.jadwal.title')}</h1>
              <p className="text-on-surface-variant mt-1">{t('admin1.jadwal.subtitle')}</p>
            </div>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button variant="outline" onClick={() => setShowGen(v => !v)} className="w-full sm:w-auto">
              <CalendarDays className="mr-1.5 h-4 w-4" /> {t('admin1.jadwal.genToggle')}
            </Button>
            <Button onClick={openCreate} className="shadow-lg shadow-blue-500/20 w-full sm:w-auto">
              <Plus className="mr-1.5 h-4 w-4" /> {t('admin1.jadwal.newSession')}
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Generator jadwal berulang */}
      {showGen && (
        <motion.div variants={itemVariants}>
          <Card className="border-indigo-500/30">
            <CardContent className="p-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <Label>{t('admin1.jadwal.courseLabel')}</Label>
                  <Select value={gen.course_id} onChange={e => setGen({ ...gen, course_id: e.target.value, batch_id: '' })}>
                    <option value="">{t('admin1.jadwal.selectCourse')}</option>
                    {courses.map(c => (<option key={c.id} value={c.id}>{getCourseName(c.id)}</option>))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t('admin1.jadwal.batchLabel')}</Label>
                  <Select value={gen.batch_id} onChange={e => pickGenBatch(e.target.value)} disabled={!gen.course_id}>
                    <option value="">{t('admin1.jadwal.selectBatch')}</option>
                    {batches.filter(b => b.course_id === gen.course_id).map(b => (<option key={b.id} value={b.id}>{b.name}</option>))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t('admin1.jadwal.genTeacherLabel')}</Label>
                  <Select value={gen.teacher_id} onChange={e => setGen({ ...gen, teacher_id: e.target.value })}>
                    <option value="all">{t('admin1.jadwal.genAllTeachers')}</option>
                    {teachers.map(x => (<option key={x.id} value={x.id}>{x.display_name}</option>))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t('admin1.jadwal.genBaseTitle')}</Label>
                  <Input value={gen.baseTitle} onChange={e => setGen({ ...gen, baseTitle: e.target.value })} placeholder="Week" />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <Label>{t('admin1.jadwal.genDays')}</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {GEN_DAYS.map(d => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleGenDay(d)}
                        className={`rounded-lg border px-2.5 py-1.5 text-xs ${gen.days.includes(d) ? 'border-indigo-400 bg-indigo-500/20 text-on-surface' : 'border-border text-muted'}`}
                      >
                        {new Intl.DateTimeFormat(LOCALE_MAP[lang] || 'en-US', { weekday: 'short' }).format(new Date(2026, 8, 7 + ((d + 6) % 7)))}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>{t('admin1.jadwal.genTime')}</Label>
                  <Input type="time" value={gen.time} onChange={e => setGen({ ...gen, time: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('admin1.jadwal.durationLabel')} (m)</Label>
                  <Input type="number" min={15} value={gen.duration} onChange={e => setGen({ ...gen, duration: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label>{t('admin1.jadwal.genFrom')}</Label>
                    <Input type="date" value={gen.from} onChange={e => setGen({ ...gen, from: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('admin1.jadwal.genTo')}</Label>
                    <Input type="date" value={gen.to} onChange={e => setGen({ ...gen, to: e.target.value })} />
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t('admin1.jadwal.genLinksLabel')}</Label>
                <textarea
                  value={gen.links}
                  onChange={e => setGen({ ...gen, links: e.target.value })}
                  rows={3}
                  placeholder={t('admin1.jadwal.genLinksPlaceholder')}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-on-surface placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
                />
                <p className="text-xs text-muted">{t('admin1.jadwal.genLinksHint')}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={computeGenPreview} disabled={!gen.batch_id || gen.days.length === 0 || !gen.time || !gen.from || !gen.to}>
                  {t('admin1.jadwal.genPreviewBtn')}
                </Button>
                <Button onClick={handleGenerate} loading={generating} disabled={genPreview.filter(g => !g.clash).length === 0}>
                  {t('admin1.jadwal.genGenerateBtn', { count: genPreview.filter(g => !g.clash).length })}
                </Button>
                {genResult && <span className="text-sm text-on-surface-variant">{genResult}</span>}
              </div>
              {genPreview.length > 0 && (
                <div className="max-h-56 overflow-auto rounded-lg border border-border divide-y divide-border">
                  {genPreview.map((g, i) => (
                    <div key={i} className={`flex items-center justify-between gap-3 px-3 py-1.5 text-xs ${g.clash ? 'text-muted line-through' : 'text-on-surface'}`}>
                      <span>{new Date(g.starts_at).toLocaleString(LOCALE_MAP[lang] || 'en-US', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                      <span className="truncate text-muted">{g.clash ? t('admin1.jadwal.genClash') : (g.link ? t('admin1.jadwal.genHasLink') : t('admin1.jadwal.genNoLink'))}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Filters */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px] max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                <Input placeholder={t('admin1.jadwal.searchPlaceholder')} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10" />
              </div>
              <Select value={filterCourse} onChange={e => setFilterCourse(e.target.value)} className="w-40">
                <option value="all">{t('admin1.jadwal.allCourses')}</option>
                {courses.map(c => (<option key={c.id} value={c.id}>{getCourseName(c.id)}</option>))}
              </Select>
              <Select value={filterTeacher} onChange={e => setFilterTeacher(e.target.value)} className="w-40">
                <option value="all">{t('admin1.jadwal.allTeachers')}</option>
                {teachers.map(t => (<option key={t.id} value={t.id}>{t.display_name}</option>))}
              </Select>
              <Select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-36">
                <option value="all">{t('admin1.jadwal.allStatus')}</option>
                <option value="scheduled">{t('admin1.jadwal.statusScheduled')}</option>
                <option value="ongoing">{t('admin1.jadwal.statusOngoing')}</option>
                <option value="completed">{t('admin1.jadwal.statusCompleted')}</option>
                <option value="cancelled">{t('admin1.jadwal.statusCancelled')}</option>
              </Select>
              <Input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="w-36" />
              <span className="text-muted text-sm">-</span>
              <Input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="w-36" />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Tabs: Upcoming / History */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> {t('admin1.jadwal.loading')}
        </div>
      ) : filtered.length === 0 ? (
        <motion.div variants={itemVariants} className="flex flex-col items-center justify-center py-20 text-center">
          <Calendar className="h-14 w-14 text-muted mb-4 opacity-30" />
          <p className="text-on-surface-variant text-lg font-medium">{t('admin1.jadwal.noSessions')}</p>
          <p className="text-sm text-muted mt-1">{t('admin1.jadwal.noSessionsDesc')}</p>
          <Button variant="outline" className="mt-4" onClick={openCreate}>{t('admin1.jadwal.createSession')}</Button>
        </motion.div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="upcoming">
              <CalendarClock className="h-4 w-4 mr-1.5" />
              {t('admin1.jadwal.tabUpcoming')} {upcomingCount > 0 && `(${upcomingCount})`}
            </TabsTrigger>
            <TabsTrigger value="history">
              <History className="h-4 w-4 mr-1.5" />
              {t('admin1.jadwal.tabHistory')} {historyCount > 0 && `(${historyCount})`}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming">
            {upcoming.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <CalendarClock className="h-10 w-10 text-muted mb-3 opacity-30" />
                  <p className="text-sm text-on-surface-variant">{t('admin1.jadwal.noUpcoming')}</p>
                </CardContent>
              </Card>
            ) : (
              <motion.div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" variants={containerVariants} initial="hidden" animate="visible">
                {upcoming.map(s => <SessionCard key={s.id} session={s} />)}
              </motion.div>
            )}
          </TabsContent>

          <TabsContent value="history">
            {history.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <History className="h-10 w-10 text-muted mb-3 opacity-30" />
                  <p className="text-sm text-on-surface-variant">{t('admin1.jadwal.noHistory')}</p>
                </CardContent>
              </Card>
            ) : (
              <motion.div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" variants={containerVariants} initial="hidden" animate="visible">
                {history.map(s => <SessionCard key={s.id} session={s} />)}
              </motion.div>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Create/Edit Modal */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={() => setShowCreate(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', stiffness: 200, damping: 25 }}
              className="w-full max-w-lg rounded-2xl border border-border bg-background shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-lg font-bold text-on-surface">
                    {editingSession ? t('admin1.jadwal.editSession') : t('admin1.jadwal.createSessionTitle')}
                  </h2>
                  <button onClick={() => setShowCreate(false)} className="text-muted hover:text-on-surface p-1 rounded-lg hover:bg-surface-container-highest">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="space-y-4">
                  {!editingSession && (
                    <>
                      <div className="space-y-1.5">
                        <Label>{t('admin1.jadwal.courseLabel')}</Label>
                        <Select value={form.course_id} onChange={e => setForm({ ...form, course_id: e.target.value, batch_id: '' })}>
                          <option value="">{t('admin1.jadwal.selectCourse')}</option>
                          {courses.map(c => (<option key={c.id} value={c.id}>{getCourseName(c.id)}</option>))}
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>{t('admin1.jadwal.teacherLabel')}</Label>
                        <Select value={form.teacher_id} onChange={e => setForm({ ...form, teacher_id: e.target.value })}>
                          <option value="">{t('admin1.jadwal.selectTeacher')}</option>
                          {teachers.map(t => (<option key={t.id} value={t.id}>{t.display_name}</option>))}
                        </Select>
                      </div>
                    </>
                  )}
                  <div className="space-y-1.5">
                    <Label>{t('admin1.jadwal.batchLabel')}</Label>
                    <Select
                      value={form.batch_id}
                      onChange={e => setForm({ ...form, batch_id: e.target.value })}
                      disabled={!form.course_id && !editingSession}
                    >
                      <option value="">{t('admin1.jadwal.selectBatch')}</option>
                      {batches
                        .filter(b => !form.course_id || b.course_id === form.course_id)
                        .map(b => (<option key={b.id} value={b.id}>{b.name}</option>))}
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('admin1.jadwal.sessionTitleLabel')}</Label>
                    <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder={t('admin1.jadwal.titlePlaceholder')} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>{t('admin1.jadwal.startLabel')}</Label>
                      <Input type="datetime-local" value={form.starts_at} onChange={e => setForm({ ...form, starts_at: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t('admin1.jadwal.durationLabel')}</Label>
                      <Input type="number" min={15} value={form.duration_minutes} onChange={e => setForm({ ...form, duration_minutes: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>{t('admin1.jadwal.platformLabel')}</Label>
                      <Select value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })}>
                        {platforms.map(p => (<option key={p.value} value={p.value}>{t(p.labelKey)}</option>))}
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t('admin1.jadwal.meetingLinkLabel')}</Label>
                      <Input value={form.meeting_link} onChange={e => setForm({ ...form, meeting_link: e.target.value })} placeholder={t('admin1.jadwal.linkPlaceholder')} />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => setShowCreate(false)}>{t('admin1.jadwal.cancelShort')}</Button>
                    <Button onClick={handleSave} loading={saving} disabled={!form.title || !form.starts_at || !form.batch_id || (!editingSession && (!form.course_id || !form.teacher_id))}>
                      {editingSession ? t('admin1.jadwal.update') : t('admin1.jadwal.create')}
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
