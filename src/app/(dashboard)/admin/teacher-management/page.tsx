'use client'

import { Fragment, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-client'
import { useAuth } from '@/lib/auth-context'
import { getSignedUrl } from '@/lib/storage'
import { useI18n } from '@/lib/i18n/client'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Search, ChevronDown, ChevronRight, Loader2, Ban, CheckCircle,
  GraduationCap, Users, CheckCircle2, XCircle, AlertTriangle,
  Eye, EyeOff, FileText, ExternalLink, ClipboardList,
} from 'lucide-react'
import FilePreviewModal from '@/components/shared/file-preview-modal'

// ─── Types ───────────────────────────────────────────────────────────────────

interface TeacherUser {
  id: string
  display_name: string | null
  email: string | null
  role: string
  status: string
  teacher?: {
    id?: string
    user_id: string
    status: string
    experience_years: number | null
    marketplace_visible?: boolean
  }
  teacher_languages?: { id: string; language_code: string; levels: string[]; is_native: boolean; language?: { code: string; name: any; native_name: string } }[]
  programs?: any[]
  student_count?: number
}

interface Language {
  code: string
  name: { id: string; en: string }
  native_name: string
}

interface Program {
  id: string
  language_code: string
  name: { id: string; en: string }
  slug: string
}

interface TeacherApplication {
  id: string
  user_id: string
  full_name: string
  birth_date: string | null
  gender: string | null
  nationality: string | null
  phone_number: string | null
  email: string | null
  address: string | null
  timezone: string | null
  bio: string | null
  self_intro: string | null
  motivation: string | null
  highest_education: string | null
  institution: string | null
  major: string | null
  graduation_year: string | null
  has_teaching_exp: boolean | null
  experience_years: string | null
  experience_institution: string | null
  experience_description: string | null
  languages: any
  programs: any
  levels: any
  teaching_days: any
  teaching_hours: any
  session_duration: number | null
  max_students_per_class: number | null
  teaching_mode: string | null
  documents: any
  agreed_terms: boolean | null
  agreed_policy: boolean | null
  status: string
  admin_notes: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  submitted_at: string | null
  created_at: string
  updated_at: string
  // joined from users
  user_display_name?: string | null
  user_email?: string | null
}

type ActiveTab = 'applications' | 'active'

const LOCALE_MAP: Record<string, string> = { en: 'en-US', id: 'id-ID', zh: 'zh-CN' }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(d: string | null | undefined, locale = 'en-US'): string {
  if (!d) return '—'
  try {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(d))
  } catch { return d }
}

function statusBadgeVariant(status: string): 'warning' | 'outline' | 'success' | 'destructive' {
  switch (status) {
    case 'pending_review': return 'warning'
    case 'needs_revision': return 'outline'
    case 'approved': return 'success'
    case 'rejected': return 'destructive'
    default: return 'outline'
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AdminTeacherManagementPage() {
  const { user } = useAuth()
  const supabase = createClient()
  const { t: tt, lang } = useI18n()
  const locale = LOCALE_MAP[lang] || 'en-US'
  const [activeTab, setActiveTab] = useState<ActiveTab>('applications')

  // --- Active teachers state ---
  const [teachers, setTeachers] = useState<TeacherUser[]>([])
  const [languages, setLanguages] = useState<Language[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [loadingTeachers, setLoadingTeachers] = useState(true)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterLang, setFilterLang] = useState('all')
  const [_filterProgram, _setFilterProgram] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // --- Applications state ---
  const [applications, setApplications] = useState<TeacherApplication[]>([])
  const [loadingApps, setLoadingApps] = useState(true)
  const [appSearch, setAppSearch] = useState('')
  const [appStatusFilter, setAppStatusFilter] = useState('all')
  const [selectedApp, setSelectedApp] = useState<TeacherApplication | null>(null)

  // --- Admin action state ---
  const [actionMode, setActionMode] = useState<'approve' | 'reject' | 'revision' | null>(null)
  const [actionNotes, setActionNotes] = useState('')
  const [processingAction, setProcessingAction] = useState<string | null>(null) // app id being processed
  const [actionError, setActionError] = useState('')

  // --- Initial data fetch ---
  useEffect(() => {
    fetchLanguages()
    fetchPrograms()
  }, [])

  // Fetch teachers when tab becomes active
  useEffect(() => {
    if (activeTab === 'active') {
      fetchTeachers()
    }
  }, [activeTab])

  // Fetch applications when tab becomes active
  useEffect(() => {
    if (activeTab === 'applications') {
      fetchApplications()
    }
  }, [activeTab])

  // ─── Data Fetching ─────────────────────────────────────────────────────────

  async function fetchTeachers() {
    setLoadingTeachers(true)
    const { data: teacherUsers } = await supabase
      .from('users')
      .select('id, display_name, email, role, status')
      .eq('role', 'teacher')
      .order('created_at', { ascending: false })
    if (teacherUsers && teacherUsers.length > 0) {
      const teacherIds = teacherUsers.map(u => u.id)
      const { data: teacherRows } = await supabase
        .from('teachers')
        .select('id, user_id, status, experience_years, marketplace_visible')
        .in('user_id', teacherIds)
      const teacherMap = new Map((teacherRows || []).map(t => [t.user_id, t]))
      const teacherIdList = (teacherRows || []).map(t => t.id)
      const { data: langRows } = await supabase
        .from('teacher_languages')
        .select('id, teacher_id, language_code, levels, is_native, language:languages(code, name, native_name)')
        .in('teacher_id', teacherIdList)
      const langMap = new Map<string, any[]>()
      for (const l of langRows || []) {
        const arr = langMap.get(l.teacher_id) || []
        arr.push(l)
        langMap.set(l.teacher_id, arr)
      }
      const mapped: TeacherUser[] = teacherUsers.map(t => {
        const tr = teacherMap.get(t.id)
        return {
          id: t.id as string,
          display_name: t.display_name,
          email: t.email,
          role: t.role as string,
          status: t.status as string,
          teacher: tr ? { id: tr.id, user_id: tr.user_id, status: tr.status, experience_years: tr.experience_years, marketplace_visible: tr.marketplace_visible } : undefined,
          teacher_languages: tr ? (langMap.get(tr.id) || []) : [],
        }
      })
      const teacherCourseMap: Record<string, string[]> = {}
      const { data: ctRows } = await supabase
        .from('course_teachers')
        .select('course_id, teacher_id')
        .in('teacher_id', teacherIdList)
      for (const ct of ctRows || []) {
        if (!teacherCourseMap[ct.teacher_id]) teacherCourseMap[ct.teacher_id] = []
        teacherCourseMap[ct.teacher_id].push(ct.course_id)
      }
      const allCourseIds = [...new Set((ctRows || []).map((c: any) => c.course_id))]
      const enrollCounts: Record<string, number> = {}
      if (allCourseIds.length > 0) {
        const { data: enrollRows } = await supabase
          .from('enrollments')
          .select('course_id')
          .in('course_id', allCourseIds)
          .in('status', ['active', 'pending'])
        for (const e of enrollRows || []) {
          enrollCounts[e.course_id] = (enrollCounts[e.course_id] || 0) + 1
        }
      }
      const withCounts = mapped.map(t => {
        const teacherId = getTeacherRecordId(t)
        if (!teacherId) return { ...t, student_count: 0 }
        const courseIds = teacherCourseMap[teacherId] || []
        return {
          ...t,
          student_count: courseIds.reduce((sum, cid) => sum + (enrollCounts[cid] || 0), 0),
        }
      })
      setTeachers(withCounts)
    } else {
      setTeachers([])
    }
    setLoadingTeachers(false)
  }

  async function fetchLanguages() {
    const { data } = await supabase.from('languages').select('code, name, native_name').eq('is_active', true).order('sort_order')
    if (data) setLanguages(data as Language[])
  }

  async function fetchPrograms() {
    const { data } = await supabase.from('programs').select('id, language_code, name, slug').eq('is_active', true).order('display_order')
    if (data) setPrograms(data as Program[])
  }

  async function fetchApplications() {
    setLoadingApps(true)
    const { data, error } = await supabase
      .from('teacher_applications')
      .select(`
        *,
        user:users!teacher_applications_user_id_fkey(id, display_name, email)
      `)
      .in('status', ['pending_review', 'needs_revision', 'approved', 'rejected'])
      .order('submitted_at', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching applications:', error)
    } else if (data) {
      const mapped: TeacherApplication[] = data.map((a: any) => ({
        ...a,
        user_display_name: a.user?.display_name ?? null,
        user_email: a.user?.email ?? null,
        user: undefined,
      }))
      setApplications(mapped)
    }
    setLoadingApps(false)
  }

  // ─── Teacher Actions ──────────────────────────────────────────────────────

  function getTeacherRecordId(t: TeacherUser): string | null {
    return (t as any).teacher?.id || null
  }

  async function assignLanguage(teacherUserId: string, languageCode: string) {
    if (!languageCode) return
    const t = teachers.find(x => x.id === teacherUserId)
    const teacherId = t ? getTeacherRecordId(t) : null
    if (!teacherId) return
    await supabase.from('teacher_languages').insert({ teacher_id: teacherId, language_code: languageCode, levels: ['basic', 'advance', 'expert'], is_native: false })
    fetchTeachers()
  }

  async function toggleTeacherStatus(t: TeacherUser) {
    const newStatus = t.status === 'active' ? 'suspended' : 'active'
    await supabase.from('users').update({ status: newStatus }).eq('id', t.id)
    if (t.teacher) {
      await supabase.from('teachers').update({ status: newStatus }).eq('user_id', t.id)
    }
    fetchTeachers()
  }

  async function toggleMarketplaceVisible(t: TeacherUser) {
    const teacherId = getTeacherRecordId(t)
    if (!teacherId) return
    const { error } = await supabase
      .from('teachers')
      .update({ marketplace_visible: !t.teacher?.marketplace_visible })
      .eq('id', teacherId)
    if (!error) fetchTeachers()
  }

  // ─── Application Review Actions ───────────────────────────────────────────

  async function handleApprove(app: TeacherApplication) {
    if (!user?.id) return
    setProcessingAction(app.id)
    setActionError('')

    const { error } = await supabase.rpc('approve_teacher_application', {
      p_application_id: app.id,
      p_admin_notes: actionNotes || null,
    })

    if (error) {
      console.error('Error approving application:', error)
      setActionError(error.message)
      setProcessingAction(null)
      return
    }

    setProcessingAction(null)
    setActionMode(null)
    setActionNotes('')
    setSelectedApp(null)
    fetchApplications()
  }

  async function handleReject(app: TeacherApplication) {
    if (!user?.id) return
    setProcessingAction(app.id)
    setActionError('')

    const { error: appErr } = await supabase
      .from('teacher_applications')
      .update({
        status: 'rejected',
        admin_notes: actionNotes || null,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', app.id)

    if (appErr) {
      console.error('Error rejecting application:', appErr)
      setActionError(appErr.message)
      setProcessingAction(null)
      return
    }

    setProcessingAction(null)
    setActionMode(null)
    setActionNotes('')
    setSelectedApp(null)
    fetchApplications()
  }

  async function handleRequestRevision(app: TeacherApplication) {
    if (!user?.id) return
    setProcessingAction(app.id)
    setActionError('')

    const { error: appErr } = await supabase
      .from('teacher_applications')
      .update({
        status: 'needs_revision',
        admin_notes: actionNotes || null,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', app.id)

    if (appErr) {
      console.error('Error requesting revision:', appErr)
      setActionError(appErr.message)
      setProcessingAction(null)
      return
    }

    setProcessingAction(null)
    setActionMode(null)
    setActionNotes('')
    setSelectedApp(null)
    fetchApplications()
  }

  // ─── Filtering ─────────────────────────────────────────────────────────────

  const activeFiltered = teachers.filter(t => {
    const name = t.display_name?.toLowerCase() || ''
    const email = t.email?.toLowerCase() || ''
    const matchSearch = name.includes(search.toLowerCase()) || email.includes(search.toLowerCase())
    const matchStatus = filterStatus === 'all' || t.status === filterStatus
    const langCodes = t.teacher_languages?.map(l => l.language_code) || []
    const matchLang = filterLang === 'all' || langCodes.includes(filterLang)
    return matchSearch && matchStatus && matchLang
  })

  const filteredApps = applications.filter(a => {
    const name = (a.user_display_name || a.full_name || '').toLowerCase()
    const email = (a.user_email || a.email || '').toLowerCase()
    const matchSearch = name.includes(appSearch.toLowerCase()) || email.includes(appSearch.toLowerCase())
    const matchStatus = appStatusFilter === 'all' || a.status === appStatusFilter
    return matchSearch && matchStatus
  })

  // ─── Locale helpers ────────────────────────────────────────────────────────

  const statusKeyMap: Record<string, string> = {
    pending_review: 'admin2.teacherManagement.statusPendingReview',
    needs_revision: 'admin2.teacherManagement.statusNeedsRevision',
    approved: 'admin2.teacherManagement.statusApproved',
    rejected: 'admin2.teacherManagement.statusRejected',
  }

  function statusLabel(status: string): string {
    return tt(statusKeyMap[status] || status)
  }

  function getLangName(code: string) {
    const l = languages.find(l => l.code === code)
    return l?.name?.[lang === 'id' ? 'id' : 'en'] || l?.native_name || code
  }

  function getProgName(id: string) {
    const p = programs.find(p => p.id === id)
    return p?.name?.[lang === 'id' ? 'id' : 'en'] || p?.slug || id
  }

  // ─── Render: Application Detail Modal ─────────────────────────────────────

  function renderApplicationModal() {
    if (!selectedApp) return null

    const a = selectedApp
    const isPending = a.status === 'pending_review' || a.status === 'needs_revision'
    const isResolved = a.status === 'approved' || a.status === 'rejected'

    // Parse JSON fields safely
    const languagesList: any[] = typeof a.languages === 'string' ? JSON.parse(a.languages) : (a.languages || [])
    const programsList: any[] = typeof a.programs === 'string' ? JSON.parse(a.programs) : (a.programs || [])
    const levelsObj: Record<string, string[]> = typeof a.levels === 'string' ? JSON.parse(a.levels) : (a.levels || {})
    const daysList: string[] = typeof a.teaching_days === 'string' ? JSON.parse(a.teaching_days) : (a.teaching_days || [])
    const hoursObj: Record<string, string> = typeof a.teaching_hours === 'string' ? JSON.parse(a.teaching_hours) : (a.teaching_hours || {})
    const docsList: any[] = typeof a.documents === 'string' ? JSON.parse(a.documents) : (a.documents || [])

    return (
      <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto pt-10 pb-10">
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm"                onClick={() => { setSelectedApp(null); setActionMode(null); setActionNotes(''); setActionError('') }} />
        <div className="relative z-10 w-full max-w-3xl rounded-2xl border border-border bg-surface shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div className="flex items-center gap-3">
              <ClipboardList className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-bold text-on-surface">{tt('admin2.teacherManagement.appDetailTitle')}</h2>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={statusBadgeVariant(a.status)} size="sm">
                {statusLabel(a.status)}
              </Badge>                <button
                onClick={() => { setSelectedApp(null); setActionMode(null); setActionNotes(''); setActionError('') }}
                className="text-muted hover:text-on-surface transition-colors"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="max-h-[70vh] overflow-y-auto px-6 py-4 space-y-6">
            {actionError && (
              <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive-soft px-4 py-3 text-sm text-destructive">
                {actionError}
              </div>
            )}
            {/* Personal Info */}
            <section>
              <h3 className="flex items-center gap-1.5 text-sm font-bold text-on-surface uppercase tracking-wider mb-3">
                <FileText className="h-4 w-4 text-primary" /> {tt('admin2.teacherManagement.personalInfo')}
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                <div><span className="text-muted">{tt('admin2.teacherManagement.fullName')}</span><p className="text-on-surface font-medium">{a.full_name || '—'}</p></div>
                <div><span className="text-muted">{tt('admin2.teacherManagement.colEmail')}</span><p className="text-on-surface font-medium">{a.user_email || a.email || '—'}</p></div>
                <div><span className="text-muted">{tt('admin2.teacherManagement.phone')}</span><p className="text-on-surface font-medium">{a.phone_number || '—'}</p></div>
                <div><span className="text-muted">{tt('admin2.teacherManagement.birthDate')}</span><p className="text-on-surface font-medium">{a.birth_date || '—'}</p></div>
                <div><span className="text-muted">{tt('admin2.teacherManagement.gender')}</span><p className="text-on-surface font-medium capitalize">{a.gender || '—'}</p></div>
                <div><span className="text-muted">{tt('admin2.teacherManagement.nationality')}</span><p className="text-on-surface font-medium">{a.nationality || '—'}</p></div>
                <div><span className="text-muted">{tt('admin2.teacherManagement.address')}</span><p className="text-on-surface font-medium">{a.address || '—'}</p></div>
                <div><span className="text-muted">{tt('admin2.teacherManagement.timezone')}</span><p className="text-on-surface font-medium">{a.timezone || '—'}</p></div>
                <div><span className="text-muted">{tt('admin2.teacherManagement.submitted')}</span><p className="text-on-surface font-medium">{formatDate(a.submitted_at, locale)}</p></div>
              </div>
            </section>

            {/* Bio & Motivation */}
            {(a.bio || a.self_intro || a.motivation) && (
              <section>
                <h3 className="flex items-center gap-1.5 text-sm font-bold text-on-surface uppercase tracking-wider mb-3">
                  <FileText className="h-4 w-4 text-primary" /> {tt('admin2.teacherManagement.introTitle')}
                </h3>
                <div className="space-y-3 text-sm">
                  {a.bio && (
                    <div>
                      <span className="text-muted">{tt('admin2.teacherManagement.bio')}</span>
                      <p className="text-on-surface mt-0.5 whitespace-pre-wrap">{a.bio}</p>
                    </div>
                  )}
                  {a.self_intro && (
                    <div>
                      <span className="text-muted">{tt('admin2.teacherManagement.selfIntro')}</span>
                      <p className="text-on-surface mt-0.5 whitespace-pre-wrap">{a.self_intro}</p>
                    </div>
                  )}
                  {a.motivation && (
                    <div>
                      <span className="text-muted">{tt('admin2.teacherManagement.motivation')}</span>
                      <p className="text-on-surface mt-0.5 whitespace-pre-wrap">{a.motivation}</p>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Education */}
            <section>
              <h3 className="flex items-center gap-1.5 text-sm font-bold text-on-surface uppercase tracking-wider mb-3">
                <GraduationCap className="h-4 w-4 text-primary" /> {tt('admin2.teacherManagement.educationTitle')}
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div><span className="text-muted">{tt('admin2.teacherManagement.highestEducation')}</span><p className="text-on-surface font-medium">{a.highest_education || '—'}</p></div>
                <div><span className="text-muted">{tt('admin2.teacherManagement.institution')}</span><p className="text-on-surface font-medium">{a.institution || '—'}</p></div>
                <div><span className="text-muted">{tt('admin2.teacherManagement.major')}</span><p className="text-on-surface font-medium">{a.major || '—'}</p></div>
                <div><span className="text-muted">{tt('admin2.teacherManagement.gradYear')}</span><p className="text-on-surface font-medium">{a.graduation_year || '—'}</p></div>
              </div>
            </section>

            {/* Experience */}
            <section>
              <h3 className="flex items-center gap-1.5 text-sm font-bold text-on-surface uppercase tracking-wider mb-3">
                <FileText className="h-4 w-4 text-primary" /> {tt('admin2.teacherManagement.experienceTitle')}
              </h3>
              {a.has_teaching_exp ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                  <div><span className="text-muted">{tt('admin2.teacherManagement.yearsExp')}</span><p className="text-on-surface font-medium">{a.experience_years || '—'}</p></div>
                  <div><span className="text-muted">{tt('admin2.teacherManagement.institution')}</span><p className="text-on-surface font-medium">{a.experience_institution || '—'}</p></div>
                  <div className="col-span-2 md:col-span-3"><span className="text-muted">{tt('admin2.teacherManagement.description')}</span><p className="text-on-surface font-medium whitespace-pre-wrap">{a.experience_description || '—'}</p></div>
                </div>
              ) : (
                <p className="text-sm text-muted">{tt('admin2.teacherManagement.noExperience')}</p>
              )}
            </section>

            {/* Languages & Programs */}
            <section>
              <h3 className="flex items-center gap-1.5 text-sm font-bold text-on-surface uppercase tracking-wider mb-3">
                <FileText className="h-4 w-4 text-primary" /> {tt('admin2.teacherManagement.langProgramsTitle')}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted">{tt('admin2.teacherManagement.languages')}</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {languagesList.length > 0 ? languagesList.map((lang: any, i: number) => (
                      <Badge key={i} variant="default" size="sm">
                        {lang.language || lang.code || lang.name || lang}
                        {lang.is_native ? ` ${tt('admin2.teacherManagement.native')}` : ''}
                      </Badge>
                    )) : <p className="text-on-surface font-medium">—</p>}
                  </div>
                </div>
                <div>
                  <span className="text-muted">{tt('admin2.teacherManagement.programs')}</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {programsList.length > 0 ? programsList.map((p: any, i: number) => (
                      <Badge key={i} variant="outline" size="sm">
                        {p.name || p.program || p.slug || p}
                      </Badge>
                    )) : <p className="text-on-surface font-medium">—</p>}
                  </div>
                </div>
              </div>
              {Object.keys(levelsObj).length > 0 && (
                <div className="mt-3 text-sm">
                  <span className="text-muted">{tt('admin2.teacherManagement.levelsByLanguage')}</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {Object.entries(levelsObj).map(([lang, lvls]) => (
                      <Badge key={lang} variant="ghost" size="sm">
                        {getLangName(lang)}: {(lvls as string[]).join(', ')}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* Schedule */}
            <section>
              <h3 className="flex items-center gap-1.5 text-sm font-bold text-on-surface uppercase tracking-wider mb-3">
                <FileText className="h-4 w-4 text-primary" /> {tt('admin2.teacherManagement.scheduleTitle')}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted">{tt('admin2.teacherManagement.teachingMode')}</span>
                  <p className="text-on-surface font-medium capitalize">{a.teaching_mode || '—'}</p>
                </div>
                <div>
                  <span className="text-muted">{tt('admin2.teacherManagement.sessionDuration')}</span>
                  <p className="text-on-surface font-medium">{a.session_duration ? tt('admin2.teacherManagement.minutesValue', { count: a.session_duration }) : '—'}</p>
                </div>
                <div>
                  <span className="text-muted">{tt('admin2.teacherManagement.maxStudents')}</span>
                  <p className="text-on-surface font-medium">{a.max_students_per_class || '—'}</p>
                </div>
                <div>
                  <span className="text-muted">{tt('admin2.teacherManagement.availableDays')}</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {daysList.length > 0 ? daysList.map((d, i) => (
                      <Badge key={i} variant="ghost" size="sm">{d}</Badge>
                    )) : <p className="text-on-surface font-medium">—</p>}
                  </div>
                </div>
              </div>
              {Object.keys(hoursObj).length > 0 && (
                <div className="mt-3 text-sm">
                  <span className="text-muted">{tt('admin2.teacherManagement.teachingHours')}</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {Object.entries(hoursObj).map(([day, hours]) => (
                      <Badge key={day} variant="outline" size="sm">{day}: {String(hours)}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* Documents */}
            {docsList.length > 0 && (
              <section>
                <h3 className="flex items-center gap-1.5 text-sm font-bold text-on-surface uppercase tracking-wider mb-3">
                  <FileText className="h-4 w-4 text-primary" /> {tt('admin2.teacherManagement.documentsTitle')}
                </h3>
                <div className="space-y-2">
                  {docsList.map((doc: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 rounded-lg border border-border bg-surface-container-lowest p-3">
                      <FileText className="h-5 w-5 text-muted shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-on-surface truncate">{doc.name || doc.title || tt('admin2.teacherManagement.documentNum', { num: i + 1 })}</p>
                        {doc.type && <p className="text-xs text-muted">{doc.type}</p>}
                      </div>
                      {doc.url && (
                        <a href={doc.url} onClick={(e) => {
                          e.preventDefault()
                          setPreviewUrl(null)
                          getSignedUrl(doc.url).then(url => setPreviewUrl(url))
                        }} className="shrink-0">
                          <Button variant="ghost" size="sm">
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Admin Notes */}
            {a.admin_notes && (
              <section>
                <h3 className="flex items-center gap-1.5 text-sm font-bold text-on-surface uppercase tracking-wider mb-3">
                  <AlertTriangle className="h-4 w-4 text-primary" /> {tt('admin2.teacherManagement.adminNotesTitle')}
                </h3>
                <div className="rounded-lg border border-border bg-surface-container-lowest p-3 text-sm text-on-surface whitespace-pre-wrap">
                  {a.admin_notes}
                </div>
                {a.reviewed_at && (
                  <p className="text-xs text-muted mt-1">{tt('admin2.teacherManagement.reviewed', { date: formatDate(a.reviewed_at, locale) })}</p>
                )}
              </section>
            )}

            {/* Action Form (for pending/revision) */}
            {isPending && actionMode && (
              <section className="rounded-xl border border-border bg-surface-container-low p-4 space-y-3">
                <h3 className="text-sm font-bold text-on-surface uppercase tracking-wider">
                  {actionMode === 'approve' && tt('admin2.teacherManagement.confirmApproval')}
                  {actionMode === 'reject' && tt('admin2.teacherManagement.rejectApplication')}
                  {actionMode === 'revision' && tt('admin2.teacherManagement.requestRevision')}
                </h3>
                <Textarea
                  label={
                    actionMode === 'approve' ? tt('admin2.teacherManagement.approvalNotes') :
                    actionMode === 'reject' ? tt('admin2.teacherManagement.rejectionReason') :
                    tt('admin2.teacherManagement.revisionNotes')
                  }
                  placeholder={
                    actionMode === 'approve' ? tt('admin2.teacherManagement.approvalNotesPlaceholder') :
                    actionMode === 'reject' ? tt('admin2.teacherManagement.rejectionPlaceholder') :
                    tt('admin2.teacherManagement.revisionPlaceholder')
                  }
                  value={actionNotes}
                  onChange={e => setActionNotes(e.target.value)}
                  rows={3}
                />
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" onClick={() => { setActionMode(null); setActionNotes('') }}>
                    {tt('admin2.teacherManagement.cancel')}
                  </Button>
                  {actionMode === 'approve' && (
                    <Button
                      variant="success"
                      onClick={() => handleApprove(a)}
                      disabled={processingAction === a.id}
                    >
                      {processingAction === a.id ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                      {tt('admin2.teacherManagement.approve')}
                    </Button>
                  )}
                  {actionMode === 'reject' && (
                    <Button
                      variant="destructive"
                      onClick={() => handleReject(a)}
                      disabled={processingAction === a.id || !actionNotes.trim()}
                    >
                      {processingAction === a.id ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <XCircle className="h-4 w-4 mr-1" />}
                      {tt('admin2.teacherManagement.reject')}
                    </Button>
                  )}
                  {actionMode === 'revision' && (
                    <Button
                      variant="warning"
                      onClick={() => handleRequestRevision(a)}
                      disabled={processingAction === a.id || !actionNotes.trim()}
                    >
                      {processingAction === a.id ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <AlertTriangle className="h-4 w-4 mr-1" />}
                      {tt('admin2.teacherManagement.requestRevision')}
                    </Button>
                  )}
                </div>
              </section>
            )}

            {/* Action buttons (pending/revision) */}
            {isPending && !actionMode && (
              <section className="flex flex-wrap gap-3 pt-2 border-t border-border">
                <Button
                  variant="default"
                  onClick={() => setActionMode('approve')}
                  disabled={processingAction === a.id}
                  className="flex-1 min-w-[140px]"
                >
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                  {tt('admin2.teacherManagement.approve')}
                </Button>
                <Button
                  variant="warning"
                  onClick={() => setActionMode('revision')}
                  disabled={processingAction === a.id}
                  className="flex-1 min-w-[140px]"
                >
                  <AlertTriangle className="h-4 w-4 mr-1.5" />
                  {tt('admin2.teacherManagement.requestRevision')}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setActionMode('reject')}
                  disabled={processingAction === a.id}
                  className="flex-1 min-w-[120px]"
                >
                  <XCircle className="h-4 w-4 mr-1.5" />
                  {tt('admin2.teacherManagement.reject')}
                </Button>
              </section>
            )}

            {/* Resolved status info */}
            {isResolved && (
              <section className="rounded-xl border border-border bg-surface-container-low p-4 text-sm text-on-surface-variant">
                <div className="flex items-center gap-2">
                  {a.status === 'approved' ? (
                    <CheckCircle2 className="h-5 w-5 text-success" />
                  ) : (
                    <XCircle className="h-5 w-5 text-destructive" />
                  )}
                  <span className="font-semibold text-on-surface">
                    {a.status === 'approved' ? tt('admin2.teacherManagement.statusApproved') : tt('admin2.teacherManagement.statusRejected')}
                  </span>
                  {a.reviewed_at && <span className="text-muted">— {formatDate(a.reviewed_at, locale)}</span>}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">{tt('admin2.teacherManagement.title')}</h1>
          <p className="text-on-surface-variant">{tt('admin2.teacherManagement.subtitle')}</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ActiveTab)}>
        <TabsList>
          <TabsTrigger value="applications" icon={<ClipboardList className="h-4 w-4" />} count={applications.filter(a => a.status === 'pending_review').length || undefined}>
            {tt('admin2.teacherManagement.tabApplications')}
          </TabsTrigger>
          <TabsTrigger value="active" icon={<Users className="h-4 w-4" />}>
            {tt('admin2.teacherManagement.tabActive')}
          </TabsTrigger>
        </TabsList>

        {/* ════════════════════════════════════════════ APPLICATIONS TAB ════════ */}
        <TabsContent value="applications">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                  <Input
                    placeholder={tt('admin2.teacherManagement.appSearchPlaceholder')}
                    value={appSearch}
                    onChange={e => setAppSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={appStatusFilter} onChange={e => setAppStatusFilter(e.target.value)} className="w-40">
                  <option value="all">{tt('admin2.teacherManagement.allStatus')}</option>
                  <option value="pending_review">{tt('admin2.teacherManagement.statusPendingReview')}</option>
                  <option value="needs_revision">{tt('admin2.teacherManagement.statusNeedsRevision')}</option>
                  <option value="approved">{tt('admin2.teacherManagement.statusApproved')}</option>
                  <option value="rejected">{tt('admin2.teacherManagement.statusRejected')}</option>
                </Select>
                <Button variant="outline" size="sm" onClick={fetchApplications} disabled={loadingApps}>
                  {loadingApps ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                  {tt('admin2.teacherManagement.refresh')}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingApps ? (
                <div className="flex items-center justify-center py-12 text-muted">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" /> {tt('admin2.teacherManagement.loading')}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted uppercase">
                        <th className="pb-3 font-medium">{tt('admin2.teacherManagement.colName')}</th>
                        <th className="pb-3 font-medium">{tt('admin2.teacherManagement.colEmail')}</th>
                        <th className="pb-3 font-medium">{tt('admin2.teacherManagement.submitted')}</th>
                        <th className="pb-3 font-medium">{tt('admin2.teacherManagement.colStatus')}</th>
                        <th className="pb-3 font-medium">{tt('admin2.teacherManagement.colActions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredApps.map(a => (
                        <tr
                          key={a.id}
                          className="border-b border-border hover:bg-surface/50 cursor-pointer transition-colors"
                          onClick={() => {
                            setSelectedApp(a)
                            setActionMode(null)
                            setActionNotes('')
                            setActionError('')
                          }}
                        >
                          <td className="py-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-xs font-bold text-white shrink-0">
                                {(a.user_display_name || a.full_name || 'A')[0]}
                              </div>
                              <p className="font-medium text-on-surface">{a.user_display_name || a.full_name || tt('admin2.teacherManagement.unnamed')}</p>
                            </div>
                          </td>
                          <td className="py-3 text-on-surface-variant">
                            {a.user_email || a.email || '—'}
                          </td>
                          <td className="py-3 text-on-surface-variant">
                            {formatDate(a.submitted_at, locale)}
                          </td>
                          <td className="py-3">
                            <Badge variant={statusBadgeVariant(a.status)} size="sm">
                              {statusLabel(a.status)}
                            </Badge>
                          </td>
                          <td className="py-3">
                            <Button variant="ghost" size="sm">
                              <Eye className="h-4 w-4 mr-1" />
                              {tt('admin2.teacherManagement.review')}
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {filteredApps.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-12 text-center text-muted">
                            {applications.length === 0
                              ? tt('admin2.teacherManagement.noApps')
                              : tt('admin2.teacherManagement.noAppsMatch')}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════ ACTIVE TEACHERS TAB ═════ */}
        <TabsContent value="active">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                  <Input
                    placeholder={tt('admin2.teacherManagement.teacherSearch')}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={filterLang} onChange={e => setFilterLang(e.target.value)} className="w-36">
                  <option value="all">{tt('admin2.teacherManagement.allLanguages')}</option>
                  {languages.map(l => (
                    <option key={l.code} value={l.code}>{l.name?.en || l.native_name}</option>
                  ))}
                </Select>
                <Select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-32">
                  <option value="all">{tt('admin2.teacherManagement.allStatus')}</option>
                  <option value="active">{tt('admin2.teacherManagement.statusActive')}</option>
                  <option value="suspended">{tt('admin2.teacherManagement.statusSuspended')}</option>
                  <option value="pending">{tt('admin2.teacherManagement.statusPending')}</option>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {loadingTeachers ? (
                <div className="flex items-center justify-center py-12 text-muted">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" /> {tt('admin2.teacherManagement.loading')}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted uppercase">
                        <th className="pb-3 font-medium">{tt('admin2.teacherManagement.colTeacher')}</th>
                        <th className="pb-3 font-medium">{tt('admin2.teacherManagement.colLanguages')}</th>
                        <th className="pb-3 font-medium">{tt('admin2.teacherManagement.colStatus')}</th>
                        <th className="pb-3 font-medium">{tt('admin2.teacherManagement.colStudents')}</th>
                        <th className="pb-3 font-medium">{tt('admin2.teacherManagement.colActions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeFiltered.map(t => (
                        <Fragment key={t.id}>
                          <tr
                            className="border-b border-border hover:bg-surface/50 cursor-pointer"
                            onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                          >
                            <td className="py-3">
                              <div className="flex items-center gap-3">
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 text-xs font-bold text-white shrink-0">
                                  {t.display_name?.[0] || 'T'}
                                </div>
                                <div>
                                  <p className="font-medium text-on-surface">{t.display_name || tt('admin2.teacherManagement.unnamed')}</p>
                                  <p className="text-xs text-muted">{t.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3">
                              <div className="flex flex-wrap gap-1">
                                {t.teacher_languages?.length ? t.teacher_languages.map(tl => (
                                  <Badge key={tl.id} variant="default" className="text-xs">
                                    {getLangName(tl.language_code)}
                                    {tl.is_native ? ' (N)' : ''}
                                  </Badge>
                                )) : <span className="text-muted text-xs">{tt('admin2.teacherManagement.none')}</span>}
                              </div>
                            </td>
                            <td className="py-3">
                              <Badge variant={t.status === 'active' ? 'success' : t.status === 'suspended' ? 'destructive' : 'warning'}>
                                {t.status === 'active' ? tt('admin2.teacherManagement.statusActive') : t.status === 'suspended' ? tt('admin2.teacherManagement.statusSuspended') : tt('admin2.teacherManagement.statusPending')}
                              </Badge>
                            </td>
                            <td className="py-3 text-on-surface-variant">
                              <div className="flex items-center gap-1">
                                <Users className="h-3.5 w-3.5 text-muted" />
                                {t.student_count}
                              </div>
                            </td>
                            <td className="py-3">
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost" size="sm"
                                  onClick={e => { e.stopPropagation(); toggleMarketplaceVisible(t) }}
                                  title={t.teacher?.marketplace_visible ? tt('admin2.teacherManagement.hideMarketplace') : tt('admin2.teacherManagement.showMarketplace')}
                                >
                                  {t.teacher?.marketplace_visible
                                    ? <Eye className="h-4 w-4 text-primary" />
                                    : <EyeOff className="h-4 w-4 text-muted" />}
                                </Button>
                                <Button
                                  variant="ghost" size="sm"
                                  onClick={e => { e.stopPropagation(); toggleTeacherStatus(t) }}
                                  title={t.status === 'active' ? tt('admin2.teacherManagement.suspend') : tt('admin2.teacherManagement.activate')}
                                >
                                  {t.status === 'active'
                                    ? <Ban className="h-4 w-4 text-amber-400" />
                                    : <CheckCircle className="h-4 w-4 text-emerald-400" />
                                  }
                                </Button>
                                <Button variant="ghost" size="sm">
                                  {expandedId === t.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                </Button>
                              </div>
                            </td>
                          </tr>
                          {expandedId === t.id && (
                            <tr key={`${t.id}-detail`} className="bg-surface/30">
                              <td colSpan={5} className="p-4">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                  <div>
                                    <Label className="text-xs text-muted uppercase font-semibold">{tt('admin2.teacherManagement.assignLanguage')}</Label>
                                    <div className="flex gap-2 mt-1">
                                      <Select
                                        value={''}
                                        onChange={e => {
                                          if (e.target.value) assignLanguage(t.id, e.target.value)
                                        }}
                                        className="flex-1"
                                      >
                                        <option value="">{tt('admin2.teacherManagement.addLanguage')}</option>
                                        {languages
                                          .filter(l => !t.teacher_languages?.some(tl => tl.language_code === l.code))
                                          .map(l => (
                                            <option key={l.code} value={l.code}>{l.name?.en || l.native_name}</option>
                                          ))}
                                      </Select>
                                    </div>
                                    <div className="flex flex-wrap gap-1 mt-2">
                                      {t.teacher_languages?.map(tl => (
                                        <Badge key={tl.id} variant="outline" className="text-xs">
                                          {getLangName(tl.language_code)}
                                          {tl.levels?.length ? ` (${tl.levels.join(', ')})` : ''}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                  <div>
                                    <Label className="text-xs text-muted uppercase font-semibold">{tt('admin2.teacherManagement.programs')}</Label>
                                    <div className="mt-1 text-sm text-on-surface-variant">
                                      <GraduationCap className="h-4 w-4 inline mr-1 text-muted" />
                                      {t.programs?.length ? t.programs.map((p: any) => (
                                        <Badge key={p.id} variant="outline" className="mr-1 text-xs">{getProgName(p.id)}</Badge>
                                      )) : <span className="text-xs text-muted">{tt('admin2.teacherManagement.noPrograms')}</span>}
                                    </div>
                                  </div>
                                  <div>
                                    <Label className="text-xs text-muted uppercase font-semibold">{tt('admin2.teacherManagement.maxCapacity')}</Label>
                                    <div className="flex gap-2 mt-1">
                                      <Input type="number" placeholder={tt('admin2.teacherManagement.maxStudentsPlaceholder')} className="w-28" defaultValue={30} />
                                      <Button size="sm" variant="outline">{tt('admin2.teacherManagement.set')}</Button>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                      {activeFiltered.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-12 text-center text-muted">{tt('admin2.teacherManagement.noTeachersFound')}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Application Detail Modal */}
      {renderApplicationModal()}

      <FilePreviewModal url={previewUrl} title={previewUrl?.split('/').pop()} onClose={() => setPreviewUrl(null)} />
    </div>
  )
}
