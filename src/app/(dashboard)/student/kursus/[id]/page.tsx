'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { createClient } from '@/lib/supabase-client'
import { useAuth } from '@/lib/auth-context'
import { useI18n } from '@/lib/i18n/client'
import { formatDate, formatDateOnly, filterByTeacher, filterSessionsByBatch, isMeetingLinkOpen, getMeetingPhase, minutesUntilJoinable } from '@/lib/utils'
import { Flag } from '@/components/ui/flag'
import {
  Play, Video, Calendar, Download, FileText, Clock, CheckCircle,
  MessageCircle, BookOpen, Users, Globe, BarChart3, Loader2,
  ExternalLink, Headphones, File, FileSpreadsheet, Link2,
  UserCircle, MessageSquare, Plus, X, Send, FileText as FileTextIcon,
  ChevronDown, ChevronUp, Search, Lock, Pin, AtSign, Paperclip,
  Sparkles, Wallet, PartyPopper, Layers
} from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import type { User, Language, LanguageLevel, Program, LiveSession, Material, Assignment, Quiz, DiscussionPost, Enrollment, Submission, QuizAttempt } from '@/types'
import FilePreviewModal from '@/components/shared/file-preview-modal'
import { getSignedUrl } from '@/lib/storage'
import { mergeCatalogDetails, normalizeTier, trackLabelKey, type CourseCatalogDetails } from '@/lib/course-catalog'
import { BatchCountdown } from '@/components/shared/batch-countdown'
import TasksTab from '@/components/student/tasks-tab'

interface CourseWithJoins {
  id: string
  teacher_id: string
  program_id: string
  language_code: string
  level_id: string
  tier?: string | null
  track_type?: string | null
  details?: CourseCatalogDetails | null
  title: { id: string; en: string }
  description: { id: string; en: string }
  syllabus: { items: string[] } | null
  price: number
  meeting_count: number
  project_count: number
  is_try_class: boolean
  max_students: number
  status: string
  mode: string
  is_visible_marketplace: boolean
  starts_at: string | null
  ends_at: string | null
  created_at: string
  updated_at: string
  teacher: User
  language: Language
  level: LanguageLevel
  program: Program & { tier?: string | null; track_type?: string | null; details?: CourseCatalogDetails | null }
}

type DiscussionWithMeta = DiscussionPost & {
  user: Pick<User, 'id' | 'display_name' | 'photo_url'> | null
  replies?: DiscussionWithMeta[]
  reply_count?: number
}

type AssignmentWithSubmission = Assignment & {
  submission?: Submission | null
}

type QuizWithMeta = Quiz & {
  question_count: number
  attempt?: QuizAttempt | null
}

type ScheduleSlot = {
  id: string
  course_id: string
  day_of_week: number
  start_time: string
  duration_minutes: number | null
}

const DAY_KEYS = [
  'student1.days.sunday',
  'student1.days.monday',
  'student1.days.tuesday',
  'student1.days.wednesday',
  'student1.days.thursday',
  'student1.days.friday',
  'student1.days.saturday',
]

function getDurationText(starts_at: string | null, ends_at: string | null, ongoingLabel: string): string {
  if (!starts_at || !ends_at) return ongoingLabel
  const start = new Date(starts_at)
  const end = new Date(ends_at)
  const weeks = Math.round((end.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000))
  return `${weeks} weeks`
}

function getInitials(name: string) {
  return name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
}

function formatRp(n: number): string {
  return 'Rp ' + new Intl.NumberFormat('id-ID').format(n || 0)
}

const typeIconMap: Record<string, React.ReactNode> = {
  PDF: <FileText className="h-5 w-5 text-red-400" />,
  PPT: <FileSpreadsheet className="h-5 w-5 text-orange-400" />,
  DOCX: <FileText className="h-5 w-5 text-blue-400" />,
  Worksheet: <FileSpreadsheet className="h-5 w-5 text-emerald-400" />,
  Audio: <Headphones className="h-5 w-5 text-purple-400" />,
  'External Link': <Link2 className="h-5 w-5 text-cyan-400" />,
  Video: <Video className="h-5 w-5 text-pink-400" />,
}

const typeBgMap: Record<string, string> = {
  PDF: 'bg-red-500/10',
  PPT: 'bg-orange-500/10',
  DOCX: 'bg-blue-500/10',
  Worksheet: 'bg-emerald-500/10',
  Audio: 'bg-purple-500/10',
  'External Link': 'bg-cyan-500/10',
  Video: 'bg-pink-500/10',
}

function inferFileType(material: Material): string {
  if (material.external_url) return 'External Link'
  const url = material.file_url || ''
  const ext = url.split('.').pop()?.toLowerCase() || ''
  if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) return 'Video'
  if (['mp3', 'wav', 'ogg', 'aac'].includes(ext)) return 'Audio'
  if (ext === 'pdf') return 'PDF'
  if (['ppt', 'pptx'].includes(ext)) return 'PPT'
  if (['doc', 'docx'].includes(ext)) return 'DOCX'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'Worksheet'
  if (material.file_type) {
    const ft = material.file_type.toLowerCase()
    if (ft.includes('video')) return 'Video'
    if (ft.includes('audio')) return 'Audio'
    if (ft.includes('pdf')) return 'PDF'
    if (ft.includes('ppt') || ft.includes('presentation')) return 'PPT'
    if (ft.includes('doc') || ft.includes('word')) return 'DOCX'
    if (ft.includes('sheet') || ft.includes('excel') || ft.includes('worksheet')) return 'Worksheet'
    if (ft.includes('link') || ft.includes('url')) return 'External Link'
  }
  return material.file_type || 'PDF'
}

export default function CourseDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const { t, lang } = useI18n()
  const dateLocale = lang === 'en' ? 'en-US' : lang === 'zh' ? 'zh-CN' : 'id-ID'
  const supabase = createClient()
  const courseId = params.id as string

  const [activeTab, setActiveTab] = useState('overview')

  const [course, setCourse] = useState<CourseWithJoins | null>(null)
  const [sessions, setSessions] = useState<LiveSession[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [assignments, setAssignments] = useState<AssignmentWithSubmission[]>([])
  const [quizzes, setQuizzes] = useState<QuizWithMeta[]>([])
  const [discussions, setDiscussions] = useState<DiscussionWithMeta[]>([])
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null)
  const [courseTeachers, setCourseTeachers] = useState<{ id: string; user: User }[]>([])
  const [loading, setLoading] = useState(true)
  const [enrolling, setEnrolling] = useState(false)
  const [waitListed, setWaitListed] = useState(false)
  const [congratsBatch, setCongratsBatch] = useState<{ name: string | null } | null>(null)
  const [courseSchedules, setCourseSchedules] = useState<ScheduleSlot[]>([])
  const [enrolledBatch, setEnrolledBatch] = useState<{ id: string; name: string | null; start_date: string | null; end_date: string | null; status: string; capacity: number | null; current_students: number | null } | null>(null)
  const [placementResult, setPlacementResult] = useState<{ provisional_level: string; language_code?: string } | null>(null)

  const [expandedDiscussion, setExpandedDiscussion] = useState<string | null>(null)
  const [discussionReplies, setDiscussionReplies] = useState<Record<string, DiscussionWithMeta[]>>({})
  const [loadingReplies, setLoadingReplies] = useState<Record<string, boolean>>({})
  const [replyText, setReplyText] = useState<Record<string, string>>({})
  const [submittingReply, setSubmittingReply] = useState<Record<string, boolean>>({})
  const [showNewPost, setShowNewPost] = useState(false)
  const [newPostTitle, setNewPostTitle] = useState('')
  const [newPostContent, setNewPostContent] = useState('')
  const [submittingNewPost, setSubmittingNewPost] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [taskStats, setTaskStats] = useState<{ done: number; total: number; percent: number }>({ done: 0, total: 0, percent: 0 })

  // Assignment submission state
  const [assignmentNotes, setAssignmentNotes] = useState<Record<string, string>>({})
  const [assignmentFiles, setAssignmentFiles] = useState<Record<string, File | null>>({})
  const [submittingAssignment, setSubmittingAssignment] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!user || !courseId) return
    fetchAll()
  }, [user, courseId])

  async function fetchAll() {
    setLoading(true)
    try {
      // Try localStorage first for immediate result
      try {
        const stored = localStorage.getItem('placement_result')
        if (stored) {
          const parsed = JSON.parse(stored)
          setPlacementResult(parsed)
        }
      } catch {}

      const [courseRes, ctRes, sessionsRes, materialsRes, assignmentsRes, quizzesRes, discussionsRes, enrollmentRes, placementRes, scheduleRes, taskStatsRes] = await Promise.all([
        supabase
          .from('courses')
          .select('*, language:language_code(*), level:level_id(*), program:program_id(*)')
          .eq('id', courseId)
          .single(),
        supabase
          .from('course_teachers')
          .select('teacher:teachers(id, user:users(*))')
          .eq('course_id', courseId),
        supabase
          .from('live_sessions')
          .select('*')
          .eq('course_id', courseId)
          .order('starts_at', { ascending: true }),
        supabase
          .from('materials')
          .select('*')
          .eq('course_id', courseId)
          .order('sort_order', { ascending: true }),
        supabase
          .from('assignments')
          .select('*')
          .eq('course_id', courseId)
          .order('due_date', { ascending: false }),
        supabase
          .from('quizzes')
          .select('*')
          .eq('course_id', courseId)
          .order('created_at', { ascending: false }),
        supabase
          .from('discussion_posts')
          .select('*, user:user_id(display_name, photo_url)')
          .eq('course_id', courseId)
          .is('parent_id', null)
          .eq('is_deleted', false)
          .order('is_pinned', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase
          .from('enrollments')
          .select('*')
          .eq('course_id', courseId)
          .eq('user_id', user!.id)
          .maybeSingle(),
        supabase
          .from('placement_results')
          .select('provisional_level, test_id, test:test_id(language_code)')
          .eq('user_id', user!.id)
          .order('completed_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('course_schedules')
          .select('*')
          .eq('course_id', courseId)
          .order('day_of_week', { ascending: true }),
        supabase
          .from('course_tasks')
          .select('id')
          .eq('course_id', courseId)
          .eq('status', 'published'),
      ])

      if (courseRes.data) {
        const c = courseRes.data as unknown as CourseWithJoins
        if (c.language && typeof c.language === 'string') {
          const { data: langData } = await supabase.from('languages').select('*').eq('code', c.language_code).single()
          c.language = langData as Language
        }
        if (c.level && typeof c.level === 'string') {
          const { data: levelData } = await supabase.from('language_levels').select('*').eq('id', c.level_id).single()
          c.level = levelData as LanguageLevel
        }
        setCourse(c)
      }

      const ctData = ctRes.data as any[]
      const teacherList = (ctData || [])
        .map((r: any) => r?.teacher)
        .filter((t: any) => t && t.user) as { id: string; user: User }[]
      setCourseTeachers(teacherList)

      const enrolled = (enrollmentRes.data as Enrollment) || null
      setEnrollment(enrolled)
      const enrolledTeacherId = enrolled?.teacher_id ?? null
      const courseTeacherFilter = new Map<string, string | null>([[courseId, enrolledTeacherId]])

      setSessions(filterByTeacher((sessionsRes.data || []) as LiveSession[], courseTeacherFilter))

      setCourseSchedules((scheduleRes.data as ScheduleSlot[]) || [])

      if (enrolled?.batch_id) {
        const { data: batch } = await supabase
          .from('batches')
          .select('id, name, start_date, end_date, status, capacity, current_students, zoom_link')
          .eq('id', enrolled.batch_id)
          .maybeSingle()
        setEnrolledBatch((batch as any) || null)
      }

      setMaterials((materialsRes.data || []) as Material[])

      const publishedTasks = (taskStatsRes.data || []) as { id: string }[]
      if (publishedTasks.length > 0 && enrolled) {
        const tIds = publishedTasks.map(x => x.id)
        const [tmRes, progRes] = await Promise.all([
          supabase.from('task_materials').select('id, task_id').in('task_id', tIds),
          supabase
            .from('student_material_progress')
            .select('material_id, status')
            .eq('user_id', user!.id),
        ])
        const tm = (tmRes.data || []) as { id: string; task_id: string }[]
        const prog = (progRes.data || []) as { material_id: string; status: string }[]
        const doneSet = new Set(prog.filter(p => p.status === 'completed').map(p => p.material_id))
        const total = tm.length
        const done = tm.filter(m => doneSet.has(m.id)).length
        setTaskStats({ done, total, percent: total > 0 ? Math.round((done / total) * 100) : 0 })
      } else {
        setTaskStats({ done: 0, total: 0, percent: 0 })
      }

      const rawAssignments = filterByTeacher((assignmentsRes.data || []) as Assignment[], courseTeacherFilter)
      if (rawAssignments.length > 0) {
        const assignmentIds = rawAssignments.map(a => a.id)
        const { data: submissions } = await supabase
          .from('submissions')
          .select('*')
          .in('assignment_id', assignmentIds)
          .eq('user_id', user!.id)

        const submissionMap = new Map((submissions || []).map(s => [s.assignment_id, s]))
        setAssignments(
          rawAssignments.map(a => ({
            ...a,
            submission: submissionMap.get(a.id) || null,
          }))
        )
      } else {
        setAssignments([])
      }

      const rawQuizzes = (quizzesRes.data || []) as Quiz[]
      if (rawQuizzes.length > 0) {
        const quizIds = rawQuizzes.map(q => q.id)
        const [questionsRes, attemptsRes] = await Promise.all([
          supabase
            .from('quiz_questions_student')
            .select('quiz_id, id')
            .in('quiz_id', quizIds),
          supabase
            .from('quiz_attempts')
            .select('*')
            .in('quiz_id', quizIds)
            .eq('user_id', user!.id),
        ])

        const questionCountMap = new Map<string, number>()
        if (questionsRes.data) {
          for (const q of questionsRes.data) {
            questionCountMap.set(q.quiz_id, (questionCountMap.get(q.quiz_id) || 0) + 1)
          }
        }

        const attemptMap = new Map<string, QuizAttempt>()
        if (attemptsRes.data) {
          for (const a of attemptsRes.data as QuizAttempt[]) {
            const existing = attemptMap.get(a.quiz_id)
            if (!existing || a.attempt_number > existing.attempt_number) {
              attemptMap.set(a.quiz_id, a)
            }
          }
        }

        setQuizzes(
          rawQuizzes.map(q => ({
            ...q,
            question_count: questionCountMap.get(q.id) || 0,
            attempt: attemptMap.get(q.id) || null,
          }))
        )
      } else {
        setQuizzes([])
      }

      const rawDiscussions = (discussionsRes.data || []) as any[]
      if (rawDiscussions.length > 0) {
        const postIds = rawDiscussions.map(p => p.id)
        const { data: repliesData } = await supabase
          .from('discussion_posts')
          .select('parent_id, id')
          .in('parent_id', postIds)
          .eq('is_deleted', false)

        const replyCountMap = new Map<string, number>()
        if (repliesData) {
          for (const r of repliesData) {
            replyCountMap.set(r.parent_id, (replyCountMap.get(r.parent_id) || 0) + 1)
          }
        }

        setDiscussions(
          rawDiscussions.map(p => ({
            ...p,
            reply_count: replyCountMap.get(p.id) || 0,
          }))
        )
      } else {
        setDiscussions([])
      }

      // Fetch placement result from DB to confirm
      if (placementRes.data) {
        const d = placementRes.data as any
        setPlacementResult({ provisional_level: d.provisional_level, language_code: d.test?.language_code })
        localStorage.setItem('placement_result', JSON.stringify({ provisional_level: d.provisional_level, language_code: d.test?.language_code }))
      }
    } catch (err) {
      console.error('Failed to fetch course data', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleEnroll() {
    if (!user || !course) return
    setEnrolling(true)
    try {
      const res = await fetch('/api/enrollments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId: course.id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t('student1.kursus.enrollError'))

      const status = json.data?.status
      if (status === 'pending_payment' || status === 'pending') {
        router.push('/student/pembayaran')
        return
      }
      if (status === 'waiting') {
        setWaitListed(true)
        return
      }
      if (status === 'active' && json.data?.batch) {
        setCongratsBatch(json.data.batch as { name: string | null })
      }
      await fetchAll()
    } catch (err: any) {
      console.error('Failed to enroll', err)
      alert(err.message || t('student1.kursus.enrollError'))
    } finally {
      setEnrolling(false)
    }
  }

  async function fetchReplies(postId: string) {
    setLoadingReplies(prev => ({ ...prev, [postId]: true }))
    const { data } = await supabase
      .from('discussion_posts')
      .select('*, user:user_id(display_name, photo_url)')
      .eq('parent_id', postId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true })
    setDiscussionReplies(prev => ({ ...prev, [postId]: (data as any) || [] }))
    setLoadingReplies(prev => ({ ...prev, [postId]: false }))
  }

  function toggleDiscussionExpand(postId: string) {
    if (expandedDiscussion === postId) {
      setExpandedDiscussion(null)
      return
    }
    setExpandedDiscussion(postId)
    if (!discussionReplies[postId]) fetchReplies(postId)
  }

  async function handleNewPost() {
    if (!user || !newPostTitle.trim() || !newPostContent.trim()) return
    setSubmittingNewPost(true)
    try {
      const { data, error } = await supabase
        .from('discussion_posts')
        .insert({
          course_id: courseId,
          user_id: user.id,
          title: newPostTitle.trim(),
          content: newPostContent.trim(),
        })
        .select('*, user:user_id(display_name, photo_url)')
        .single()

      if (error) throw error
      setDiscussions(prev => [data as any, ...prev])
      setShowNewPost(false)
      setNewPostTitle('')
      setNewPostContent('')
    } catch (err) {
      console.error('Failed to create post', err)
    } finally {
      setSubmittingNewPost(false)
    }
  }

  const openSubmissionFile = async (fileUrl: string) => {
    setPreviewUrl(null)
    const url = await getSignedUrl(fileUrl)
    setPreviewUrl(url || null)
  }

  async function handleSubmitAssignment(assignmentId: string) {    if (!user) return
    const file = assignmentFiles[assignmentId]
    if (!file) return
    setSubmittingAssignment(prev => ({ ...prev, [assignmentId]: true }))
    try {
      const notes = assignmentNotes[assignmentId]?.trim() || null

      const ext = file.name.split('.').pop() || 'file'
      const filePath = `${assignmentId}/${user.id}_${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('submissions')
        .upload(filePath, file)
      if (uploadError) throw uploadError

      const { data, error } = await supabase
        .from('submissions')
        .insert({
          assignment_id: assignmentId,
          user_id: user.id,
          file_url: `submissions/${filePath}`,
          notes: notes,
          status: 'submitted',
          submitted_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (error) throw error

      // Update local state
      setAssignments(prev =>
        prev.map(a =>
          a.id === assignmentId
            ? { ...a, submission: data as Submission }
            : a
        )
      )

      // Clear form
      setAssignmentNotes(prev => ({ ...prev, [assignmentId]: '' }))
      setAssignmentFiles(prev => ({ ...prev, [assignmentId]: null }))
    } catch (err) {
      console.error('Failed to submit assignment:', err)
    } finally {
      setSubmittingAssignment(prev => ({ ...prev, [assignmentId]: false }))
    }
  }

  async function handleReply(postId: string) {
    const text = replyText[postId]?.trim()
    if (!user || !text) return
    setSubmittingReply(prev => ({ ...prev, [postId]: true }))
    try {
      const { data, error } = await supabase
        .from('discussion_posts')
        .insert({
          course_id: courseId,
          parent_id: postId,
          user_id: user.id,
          content: text,
        })
        .select('*, user:user_id(display_name, photo_url)')
        .single()

      if (error) throw error
      setDiscussionReplies(prev => ({
        ...prev,
        [postId]: [...(prev[postId] || []), data as any],
      }))
      setDiscussions(prev => prev.map(d =>
        d.id === postId ? { ...d, reply_count: (d.reply_count || 0) + 1 } : d
      ))
      setReplyText(prev => ({ ...prev, [postId]: '' }))
    } catch (err) {
      console.error('Failed to reply', err)
    } finally {
      setSubmittingReply(prev => ({ ...prev, [postId]: false }))
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 text-indigo-400 animate-spin" />
      </div>
    )
  }

  if (!course) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <BookOpen className="h-12 w-12 text-muted mb-4" />
        <h2 className="text-lg font-semibold text-on-surface">{t('student1.courseDetail.notFoundTitle')}</h2>
        <p className="text-sm text-on-surface-variant mt-1">{t('student1.courseDetail.notFoundDesc')}</p>
      </div>
    )
  }

  const title = course.title?.en || course.title?.id || 'Untitled Course'
  const description = course.description?.en || course.description?.id || ''
  const syllabus: string[] = course.syllabus ? (Array.isArray(course.syllabus) ? course.syllabus : typeof course.syllabus === 'object' && course.syllabus.items ? course.syllabus.items : []) : []
  const displayTeacher = enrollment?.teacher_id
    ? courseTeachers.find(t => t.id === enrollment.teacher_id)
    : courseTeachers[0]
  const teacherName = displayTeacher?.user.display_name || course.teacher?.display_name || t('student1.courseDetail.teacherFallback')
  const languageName = course.language?.name?.en || course.language_code || ''
  const tier = normalizeTier(course.tier || course.level?.tier || course.level?.code || course.program?.tier)
  const levelName = tier ? t(`common.tier.${tier}`) : course.level?.name?.en || course.level?.code || ''
  const track = course.track_type || course.program?.track_type || course.program?.program_type || 'regular'
  const catalogDetails = mergeCatalogDetails(course.details, course.program?.details)
  const languageFlag = course.language?.flag_emoji || ''

  const isEnrolled = !!enrollment
  const isPendingPayment = !!enrollment && enrollment.status === 'pending'
  // Batch-specific zoom: jumlah link Zoom ngikutin jumlah pertemuan di batch ini.
  const batchSessions = filterSessionsByBatch(sessions, enrolledBatch, isEnrolled)

  const now = new Date()
  const upcomingSessions = batchSessions.filter(s => getMeetingPhase(s, now) === 'upcoming' || getMeetingPhase(s, now) === 'ongoing')
  const _pastSessions = batchSessions.filter(s => getMeetingPhase(s, now) === 'past')

  const _totalMeetings = batchSessions.length || course.meeting_count || 0
  const _heldMeetings = _pastSessions.filter(s => s.meeting_link).length

  // Check if this course matches the student's placement level
  // (gate hanya berlaku untuk kursus bahasa yang sama dengan hasil placement)
  const hasPlacementForCourseLang = !!placementResult && placementResult.language_code === course.language_code
  const isPlacementMatch = hasPlacementForCourseLang &&
    normalizeTier(course.tier || course.level?.tier || course.level?.code || course.program?.tier) === normalizeTier(placementResult.provisional_level)

  return (
    <div className="space-y-6">
      {isPendingPayment && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/20">
              <Wallet className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-on-surface">{t('student1.courseDetail.waitingPayment')}</p>
              <p className="text-xs text-on-surface-variant">
                {t('student1.courseDetail.waitingPaymentDesc')}
              </p>
            </div>
          </div>
          <Link href="/student/pembayaran">
            <Button size="sm" variant="warning" className="shrink-0">
              <Wallet className="mr-1.5 h-4 w-4" /> {t('student1.courseDetail.payNow')}
            </Button>
          </Link>
        </div>
      )}
      {isEnrolled && enrolledBatch && (
        <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 ${
          enrolledBatch.status === 'active'
            ? 'border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent'
            : enrolledBatch.status === 'completed'
              ? 'border-border bg-surface-container-low'
              : 'border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              enrolledBatch.status === 'active' ? 'bg-emerald-500/20' : enrolledBatch.status === 'completed' ? 'bg-surface-container-high' : 'bg-amber-500/20'
            }`}>
              {enrolledBatch.status === 'active' ? (
                <Video className="h-5 w-5 text-emerald-400" />
              ) : enrolledBatch.status === 'completed' ? (
                <CheckCircle className="h-5 w-5 text-on-surface-variant" />
              ) : (
                <Clock className="h-5 w-5 text-amber-400" />
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-on-surface">
                {enrolledBatch.status === 'active'
                  ? t('student1.courseDetail.batchOngoing')
                  : enrolledBatch.status === 'completed'
                    ? t('student1.courseDetail.batchCompleted')
                    : t('student1.courseDetail.batchNotStarted')}
              </p>
              <p className="text-xs text-on-surface-variant">
                Batch {enrolledBatch.name || ''}
                {enrolledBatch.status === 'upcoming' && enrolledBatch.start_date
                  ? ` \u2022 ${t('student1.courseDetail.startsOn', { date: new Date(enrolledBatch.start_date).toLocaleDateString(dateLocale) })}`
: enrolledBatch.status === 'active' && enrolledBatch.end_date
                      ? ` \u2022 ${t('student1.courseDetail.endsOn', { date: new Date(enrolledBatch.end_date).toLocaleDateString(dateLocale) })}`
                      : ''}
              </p>
              {enrolledBatch.status === 'active' && (
                <BatchCountdown endDate={enrolledBatch.end_date} status={enrolledBatch.status} compact className="mt-2" />
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge variant={enrolledBatch.status === 'active' ? 'success' : enrolledBatch.status === 'completed' ? 'outline' : 'warning'}>
              {enrolledBatch.status === 'active'
                ? t('student1.courseDetail.statusActive')
                : enrolledBatch.status === 'completed'
                  ? t('student1.courseDetail.statusCompleted')
                  : t('student1.courseDetail.statusUpcoming')}
            </Badge>
            {(enrolledBatch.status === 'active' || enrolledBatch.status === 'upcoming') && (
              <Link href={`/student/kursus/${courseId}/teman`}>
                <Button size="sm" variant="outline" className="shrink-0">
                  <Users className="mr-1.5 h-4 w-4" /> {t('student3.batchmate.button')}
                </Button>
              </Link>
            )}
          </div>
        </div>
      )}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">{title}</h1>
          <div className="flex flex-wrap items-center gap-3 mt-1">              <p className="text-sm text-on-surface-variant">{t('student1.courseDetail.instructorLabel')}: {teacherName}</p>

            {languageFlag && <Flag emoji={languageFlag} className="h-4 w-auto" />}
            {languageName && <Badge variant="outline"><Globe className="h-3 w-3 mr-1" />{languageName}</Badge>}
            {levelName && <Badge variant="outline"><BarChart3 className="h-3 w-3 mr-1" />{levelName}</Badge>}
            {isPlacementMatch && (
              <Badge variant="success" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                <Sparkles className="h-3 w-3 mr-1" /> {t('student1.courseDetail.matchesYourLevel')}
              </Badge>
            )}
            {hasPlacementForCourseLang && !isPlacementMatch && (
              <Badge variant="outline" className="text-indigo-400 border-indigo-500/30">
                {t('student1.courseDetail.yourLevel', { level: t(`common.tier.${normalizeTier(placementResult.provisional_level) || 'unknown'}`) })}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {isEnrolled && upcomingSessions.length > 0 && isMeetingLinkOpen(upcomingSessions[0]) && (upcomingSessions[0].meeting_link ? <Button onClick={() => window.open(upcomingSessions[0].meeting_link || '#', '_blank')}>
              <Video className="mr-1 h-4 w-4" /> {t('student1.courseDetail.joinLive')}

            </Button> : null)}
          {!isEnrolled && course.status === 'active' && (
            <div className="flex flex-col items-end gap-2">
              {waitListed ? (
                <Badge variant="outline" className="border-orange-500/30 text-orange-400">
                  {t('student1.courseDetail.waitingListNote')}
                </Badge>
              ) : (
                <>
                  {course.is_try_class ? (
                    <Badge variant="success" className="border-emerald-500/30 text-emerald-400">
                      {t('student1.courseDetail.trialFreeNote')}
                    </Badge>
                  ) : (
                    <p className="text-right text-xl font-bold text-on-surface">
                      {formatRp(course.price)}
                      <span className="ml-1 text-xs font-normal text-on-surface-variant">{t('student1.courseDetail.perClass')}</span>
                    </p>
                  )}
                  <div className="flex items-center gap-2">
                    {!placementResult && (
                      <Link href="/student/placement-test">
                        <Button variant="outline" size="sm" className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10">
                          <Sparkles className="mr-1 h-3 w-3" /> Ikuti Placement Test
                        </Button>
                      </Link>
                    )}
                    <Button
                      onClick={handleEnroll}
                      disabled={enrolling || (hasPlacementForCourseLang && !isPlacementMatch && !course.is_try_class)}
                      title={hasPlacementForCourseLang && !isPlacementMatch && !course.is_try_class
                        ? t('student1.courseDetail.enrollLevelBlocked')
                        : undefined}
                    >
                      {enrolling ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <BookOpen className="mr-1 h-4 w-4" />}
                      {enrolling ? t('student1.courseDetail.processing') : course.is_try_class ? t('student1.courseDetail.claimTrialFree') : t('student1.courseDetail.enrollPayClass')}
                    </Button>
                  </div>
                  {hasPlacementForCourseLang && !isPlacementMatch && !course.is_try_class && (
                    <p className="text-right text-xs text-amber-400">
                      {t('student1.courseDetail.enrollLevelBlocked')}
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">{t('student1.courseDetail.tabOverview')}</TabsTrigger>
          <TabsTrigger value="tasks">{t('student1.tasks.tabTasks')}</TabsTrigger>
          <TabsTrigger value="materials">{t('student1.courseDetail.tabMaterials')} ({materials.length})</TabsTrigger>
          <TabsTrigger value="assignments">{t('student1.courseDetail.tabAssignments')} ({assignments.length})</TabsTrigger>
          <TabsTrigger value="quizzes">{t('student1.courseDetail.tabQuizzes')} ({quizzes.length})</TabsTrigger>
          <TabsTrigger value="discussion">{t('student1.courseDetail.tabDiscussion')} ({discussions.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle className="text-sm">{t('student1.courseDetail.overviewTitle')}</CardTitle></CardHeader>
              <CardContent className="space-y-4 text-sm text-on-surface-variant">
                <p>{description}</p>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: t('student1.courseDetail.durationLabel'), value: getDurationText(course.starts_at, course.ends_at, t('student1.courseDetail.ongoing')), icon: Clock },
                    { label: t('student1.courseDetail.levelLabel'), value: levelName || t('common.tier.unknown'), icon: BarChart3 },
                    { label: t('student1.courseDetail.trackLabel'), value: t(trackLabelKey(track)), icon: Layers },
                    { label: t('student1.courseDetail.modeLabel'), value: course.mode || 'Online', icon: Video },
                    { label: t('student1.courseDetail.maxStudentsLabel'), value: String(course.max_students || 'Unlimited'), icon: Users },
                  ].map((item) => (
                    <div key={item.label} className="rounded-lg bg-surface-container-low p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <item.icon className="h-3.5 w-3.5 text-indigo-400" />
                        <p className="text-xs text-muted">{item.label}</p>
                      </div>
                      <p className="font-medium text-on-surface">{item.value}</p>
                    </div>
                  ))}
                </div>
                {catalogDetails.topics && catalogDetails.topics.length > 0 && (
                  <div>
                    <h4 className="font-medium text-on-surface mb-2">{t('student1.courseDetail.topicsTitle')}</h4>
                    <div className="space-y-2">
                      {catalogDetails.topics.map((item, i) => (
                        <div key={`topic-${i}`} className="flex items-start gap-2 text-sm">
                          <CheckCircle className="h-4 w-4 text-indigo-400 mt-0.5 shrink-0" />
                          <span><strong>{item.title}</strong>{item.description ? ` â€” ${item.description}` : ''}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {catalogDetails.projects && catalogDetails.projects.length > 0 && (
                  <div>
                    <h4 className="font-medium text-on-surface mb-2">{t('student1.courseDetail.projectsTitle')}</h4>
                    <div className="space-y-2">
                      {catalogDetails.projects.map((item, i) => (
                        <div key={`project-${i}`} className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm">
                          <p className="font-medium text-on-surface">{item.title}</p>
                          {item.description && <p className="mt-1 text-on-surface-variant">{item.description}</p>}
                          {item.required && <Badge variant="warning" className="mt-2">{t('student1.courseDetail.requiredProject')}</Badge>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {catalogDetails.certificates && catalogDetails.certificates.length > 0 && (
                  <div>
                    <h4 className="font-medium text-on-surface mb-2">{t('student1.courseDetail.certificatesTitle')}</h4>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {catalogDetails.certificates.map((certificate, i) => (
                        <div key={`certificate-${i}`} className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm">
                          <p className="font-medium text-on-surface">{certificate.title}</p>
                          {certificate.description && <p className="mt-1 text-on-surface-variant">{certificate.description}</p>}
                          {certificate.issuer && <p className="mt-1 text-xs text-muted">{certificate.issuer}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {syllabus.length > 0 && (
                  <div>
                    <h4 className="font-medium text-on-surface mb-2">{t('student1.courseDetail.syllabusTitle')}</h4>
                    <div className="space-y-2">
                      {syllabus.map((item: string, i: number) => (
                        <div key={i} className="flex items-start gap-2 text-sm">
                          <CheckCircle className="h-4 w-4 text-indigo-400 mt-0.5 shrink-0" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Jadwal Pertemuan (7) & Project — manual admin, tampil Tanggal Bulan Tahun + Nama */}
                <div className="grid gap-3 pt-2 border-t border-border">
                  <h4 className="font-medium text-on-surface text-sm">{t('student1.courseDetail.classDetailsTitle')}</h4>
                  <p className="text-xs text-muted -mt-1">{t('student1.courseDetail.dateFormatHint')}</p>
                  <div className="rounded-lg border border-border bg-surface-container-low p-3">
                    <p className="text-xs font-semibold text-on-surface flex items-center gap-1.5"><Video className="h-3.5 w-3.5 text-indigo-400" /> {t('student1.courseDetail.meetingScheduleTitle')} <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-surface-container-highest text-muted">{batchSessions.length || course.meeting_count || 0}</span></p>
                    {batchSessions.length > 0 ? (
                      <div className="mt-2 divide-y divide-border">
                        {batchSessions.slice(0, 20).map((s) => {
                          const d = s.starts_at ? new Date(s.starts_at).toLocaleDateString(dateLocale, { day: 'numeric', month: 'long', year: 'numeric' }) : t('student1.courseDetail.scheduleEmpty')
                          const link = (s as unknown as { meeting_link?: string }).meeting_link
                          const joinable = isEnrolled && !!link && isMeetingLinkOpen(s as any)
                          const mins = !joinable && (s as any).starts_at ? minutesUntilJoinable(s as any) : 0
                          return (
                            <div key={s.id} className="flex items-center justify-between gap-3 py-2">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-on-surface truncate">{s.title || `Pertemuan`}</p>
                                <p className="text-xs text-muted flex items-center gap-1"><Calendar className="h-3 w-3" />{d}</p>
                              </div>
                              {link ? (
                                joinable ? (
                                  <a href={link} target="_blank" rel="noopener noreferrer" className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-emerald-400 hover:underline"><ExternalLink className="h-3 w-3" /> Zoom</a>
                                ) : isEnrolled ? (
                                  <span className="shrink-0 inline-flex items-center gap-1 text-xs text-amber-400"><Clock className="h-3 w-3" />{mins > 0 ? `${mins}m lagi` : 'Belum waktunya'}</span>
                                ) : (
                                  <span className="shrink-0 text-xs text-muted flex items-center gap-1"><Link2 className="h-3 w-3" /> Zoom</span>
                                )
                              ) : (
                                <span className="shrink-0 text-xs text-muted">—</span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted mt-2">{t('student1.courseDetail.noMeetingSchedule')}</p>
                    )}
                  </div>
                  <div className="rounded-lg border border-border bg-surface-container-low p-3">
                    <p className="text-xs font-semibold text-on-surface flex items-center gap-1.5"><FileText className="h-3.5 w-3.5 text-amber-400" /> {t('student1.courseDetail.projectScheduleTitle')} <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-surface-container-highest text-muted">{assignments.length || catalogDetails.projects?.length || course.project_count || 0}</span></p>
                    {assignments.length > 0 ? (
                      <div className="mt-2 divide-y divide-border">
                        {assignments.slice(0, 20).map((a) => {
                          const d = (a as unknown as { due_date?: string }).due_date ? new Date((a as unknown as { due_date: string }).due_date).toLocaleDateString(dateLocale, { day: 'numeric', month: 'long', year: 'numeric' }) : null
                          return (
                            <div key={a.id} className="flex items-center justify-between gap-3 py-2">
                              <p className="text-sm font-medium text-on-surface truncate">{(a as unknown as { title?: string }).title || 'Project'}</p>
                              <span className="shrink-0 text-xs text-muted flex items-center gap-1"><Calendar className="h-3 w-3" />{d || t('student1.courseDetail.scheduleEmpty')}</span>
                            </div>
                          )
                        })}
                      </div>
                    ) : catalogDetails.projects && catalogDetails.projects.length > 0 ? (
                      <div className="mt-2 divide-y divide-border">
                        {catalogDetails.projects.slice(0, 20).map((p, i) => (
                          <div key={`cat-proj-${i}`} className="flex items-center justify-between gap-3 py-2">
                            <p className="text-sm font-medium text-on-surface truncate">{p.title}</p>
                            <span className="shrink-0 text-xs text-muted">{t('student1.courseDetail.scheduleEmpty')}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted mt-2">{t('student1.courseDetail.noProjectSchedule')}</p>
                    )}
                    {course.project_count > 0 && <p className="text-[11px] text-muted mt-2">{t('student1.courseDetail.projectsValue', { count: String(course.project_count) })}</p>}
                  </div>

                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              {/* Guru Pengajar */}
              {displayTeacher && (
                <Card>
                  <CardHeader><CardTitle className="text-sm">{t('student1.courseDetail.instructorLabel')}</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-3">
                      {displayTeacher.user.photo_url ? (
                        <img src={displayTeacher.user.photo_url} alt={teacherName} className="h-12 w-12 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-500/15 text-lg font-bold text-indigo-400">
                          {teacherName.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)}
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-semibold text-on-surface">{teacherName}</p>
                        <p className="text-xs text-muted">{languageName} • {levelName}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">Upcoming Sessions</CardTitle>
                    <Badge variant="outline">{upcomingSessions.length}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {upcomingSessions.length === 0 ? (
                    <p className="text-sm text-muted text-center py-4">No upcoming sessions</p>
                  ) : (
                    upcomingSessions.slice(0, 5).map((s) => {
                        const sPhase = getMeetingPhase(s, now)
                        return (
                      <div key={s.id} className="rounded-lg border border-border bg-surface-container-low p-3">
                        <p className="text-sm font-medium text-on-surface">{s.title}</p>
                        <div className="mt-1 flex items-center justify-between">
                          <span className="text-xs text-muted flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {formatDate(s.starts_at)}
                          </span>
                          <Badge variant={sPhase === 'ongoing' ? 'success' : 'default'}>
                            {sPhase === 'ongoing' ? 'Berlangsung' : 'Scheduled'}
                          </Badge>
                        </div>
                        {isEnrolled && s.meeting_link && isMeetingLinkOpen(s) && (
                          <Button
                            size="sm"
                            className="mt-2 w-full"
                            onClick={() => window.open(s.meeting_link || '#', '_blank')}
                          >
                            <Video className="mr-1 h-3 w-3" /> Join
                          </Button>
                        )}
                      </div>
                    )
                    })
                  )}
                </CardContent>
              </Card>



              {isEnrolled && (
                <Card>
                  <CardHeader><CardTitle className="text-sm">{t('student1.courseDetail.progressTaskTitle')}</CardTitle></CardHeader>
                  <CardContent className="text-center">
                    <div className="text-3xl font-bold text-indigo-400">
                      {taskStats.percent}%
                    </div>
                    <p className="text-xs text-muted mt-1">{t('student1.courseDetail.progressTaskSubtitle')}</p>
                    <div className="mt-3 h-2 rounded-full bg-surface-container-highest overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-400"
                        style={{ width: `${taskStats.percent}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted mt-2">
                      {taskStats.total > 0
                        ? t('student1.courseDetail.progressTaskCount', { done: taskStats.done, total: taskStats.total })
                        : t('student1.courseDetail.progressTaskNone')}
                    </p>
                    {taskStats.total > 0 && (
                      <p className="text-[10px] text-muted mt-1">{t('student1.courseDetail.progressTaskDesc')}</p>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="tasks">
          <TasksTab courseId={courseId} />
        </TabsContent>

        <TabsContent value="materials" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">{t('student1.courseDetail.learningMaterials')}</CardTitle>
                <Badge variant="outline">{materials.length} items</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {materials.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <FileTextIcon className="h-12 w-12 text-muted mb-3" />
                  <p className="text-sm text-on-surface-variant">No materials available yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {materials.map((m) => {
                    const type = inferFileType(m)
                    const icon = typeIconMap[type] || <File className="h-5 w-5 text-muted" />
                    const bg = typeBgMap[type] || 'bg-surface-container-low'
                    return (
                      <div
                        key={m.id}
                        className="flex items-center justify-between rounded-lg border border-border bg-surface-container-low p-4 transition-all duration-150 hover:border-indigo-500/20"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${bg}`}>
                            {icon}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-on-surface truncate">{m.title}</p>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-[10px] text-muted">{type}</span>
                              {m.is_required && <Badge variant="warning" className="text-[9px] px-1.5 py-0">Required</Badge>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-3">
                          {isEnrolled ? (
                            m.external_url ? (
                              <Button variant="outline" size="sm" onClick={() => window.open(m.external_url!, '_blank')}>
                                <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open
                              </Button>
                            ) : m.file_url ? (
                              <Button variant="outline" size="sm" onClick={() => setPreviewUrl(m.file_url!)}>
                                <Download className="h-3.5 w-3.5 mr-1" /> Download
                              </Button>
                            ) : null
                          ) : (
                            <Badge variant="outline" className="text-[10px]">
                              <Lock className="h-3 w-3 mr-1" /> Enroll to access
                            </Badge>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assignments" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">{t('student1.courseDetail.assignmentsTitle')}</CardTitle>
                {assignments.filter(a => !a.submission || a.submission?.status !== 'graded').length > 0 && (
                  <Badge variant="warning">
                    {assignments.filter(a => !a.submission || a.submission?.status !== 'graded').length} Pending
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {assignments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <FileTextIcon className="h-12 w-12 text-muted mb-3" />
                  <p className="text-sm text-on-surface-variant">No assignments yet</p>
                </div>
              ) : (
                assignments.map((a) => {
                  const submission = a.submission
                  const isGraded = submission?.grade !== null && submission?.grade !== undefined
                  const isSubmitted = submission && submission.status === 'submitted'
                  const isOverdue = new Date(a.due_date) < new Date()
                  return (
                    <div key={a.id} className="rounded-lg border border-border bg-surface-container-low overflow-hidden">
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-on-surface">{a.title}</p>
                            {a.instructions && (
                              <p className="text-xs text-on-surface-variant mt-1 line-clamp-2">{a.instructions}</p>
                            )}
                            <div className="flex items-center gap-3 mt-1.5">
                              <span className="text-xs text-muted flex items-center gap-1">
                                <Clock className="h-3 w-3" /> Due: {formatDateOnly(a.due_date)}
                              </span>
                              <span className="text-xs text-muted">Max grade: {a.max_grade}</span>
                              {isSubmitted && isGraded && (
                                <Badge variant="success">Graded: {String(submission!.grade)}/{a.max_grade}</Badge>
                              )}
                              {isSubmitted && !isGraded && (
                                <Badge variant="outline">Submitted</Badge>
                              )}
                              {!isSubmitted && isOverdue && (
                                <Badge variant="destructive">Overdue</Badge>
                              )}
                              {!isSubmitted && !isOverdue && (
                                <Badge variant="outline">Pending</Badge>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Submission feedback if graded */}
                        {isGraded && submission?.feedback && (
                          <div className="mt-3 rounded-lg bg-surface-container-high p-3 text-sm">
                            <p className="text-xs font-medium text-on-surface mb-1">Teacher Feedback:</p>
                            <p className="text-on-surface-variant">{submission.feedback}</p>
                          </div>
                        )}

                        {/* Inline submission form for unsubmitted assignments — enrolled only */}
                        {!isSubmitted && isEnrolled && (
                          <div className="mt-4 space-y-3 border-t border-border pt-4">
                            <p className="text-sm font-medium text-on-surface">Submit Your Work</p>
                            <div>
                              <label className="block text-xs text-muted mb-1">File Pengumpulan</label>
                              <input
                                type="file"
                                accept=".pdf,.docx,.doc,.png,.jpg,.jpeg"
                                className="block w-full text-sm text-on-surface file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-500/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-indigo-400 hover:file:bg-indigo-500/20 cursor-pointer"
                                onChange={(e) => {
                                  const f = e.target.files?.[0] || null
                                  setAssignmentFiles(prev => ({ ...prev, [a.id]: f }))
                                }}
                              />
                              <p className="mt-1 text-xs text-muted">
                                PDF, DOCX, atau gambar (maks 10MB)
                              </p>
                              {assignmentFiles[a.id] && (
                                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-on-surface-variant">
                                  <FileText className="h-3.5 w-3.5 text-indigo-400" />
                                  <span className="font-medium">{assignmentFiles[a.id]!.name}</span>
                                  <span className="text-muted">
                                    ({(assignmentFiles[a.id]!.size / 1024 / 1024).toFixed(2)} MB)
                                  </span>
                                </p>
                              )}
                            </div>
                            <div>
                              <label className="block text-xs text-muted mb-1">Notes (optional)</label>
                              <textarea
                                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-on-surface placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
                                placeholder="Add any notes for your teacher..."
                                rows={3}
                                value={assignmentNotes[a.id] || ''}
                                onChange={(e) => setAssignmentNotes(prev => ({ ...prev, [a.id]: e.target.value }))}
                              />
                            </div>
                            <div className="flex justify-end">
                              <Button
                                size="sm"
                                onClick={() => handleSubmitAssignment(a.id)}
                                disabled={submittingAssignment[a.id] || !assignmentFiles[a.id]}
                              >
                                {submittingAssignment[a.id] ? (
                                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                                ) : (
                                  <Send className="h-3.5 w-3.5 mr-1" />
                                )}
                                {submittingAssignment[a.id] ? 'Uploading...' : 'Submit Assignment'}
                              </Button>
                            </div>
                          </div>
                        )}

                        {/* Show submitted file URL if available */}
                        {isSubmitted && submission?.file_url && (
                          <div className="mt-3 flex items-center gap-2 text-xs">
                            <ExternalLink className="h-3 w-3 text-indigo-400" />
                            <button
                              onClick={() => submission.file_url && openSubmissionFile(submission.file_url)}
                              className="text-indigo-400 hover:text-indigo-300 underline"
                            >
                              View submitted file
                            </button>
                          </div>
                        )}
                        {isSubmitted && submission?.notes && (
                          <div className="mt-2 text-xs text-on-surface-variant">
                            <span className="font-medium">Your notes:</span> {submission.notes}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="quizzes" className="space-y-4">
          <Card>
            <CardHeader>              <CardTitle className="text-sm">{t('student1.courseDetail.quizzesTitle')}</CardTitle>
</CardHeader>
            <CardContent className="space-y-3">
              {quizzes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <FileTextIcon className="h-12 w-12 text-muted mb-3" />
                  <p className="text-sm text-on-surface-variant">No quizzes yet</p>
                </div>
              ) : (
                quizzes.map((q) => {
                  const attempt = q.attempt
                  const isCompleted = attempt?.status === 'completed' || attempt?.status === 'submitted'
                  const score = attempt?.score
                  return (
                    <div key={q.id} className="flex items-center justify-between rounded-lg border border-border bg-surface-container-low p-4">
                      <div>
                        <p className="text-sm font-medium text-on-surface">{q.title}</p>
                        <p className="text-xs text-muted mt-1">
                          {q.question_count} questions
                          {q.time_limit_minutes ? ` \u2022 ${q.time_limit_minutes} min` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {isCompleted && score !== null && score !== undefined && (
                          <Badge variant={score >= q.passing_score ? 'success' : 'warning'}>
                            {Math.round(score)}%
                          </Badge>
                        )}
                        <a href={`/student/kuis/${q.id}`}><Button size="sm">{isCompleted ? 'View Result' : 'Start'}</Button></a>
                      </div>
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="discussion" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">{t('student1.courseDetail.discussionTitle')}</CardTitle>
                <Button size="sm" onClick={() => setShowNewPost(true)} disabled={!isEnrolled}>
                  <Plus className="mr-1 h-3 w-3" /> {t('student1.courseDetail.newPost')}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {discussions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <MessageCircle className="h-12 w-12 text-muted mb-3" />
                  <p className="text-sm text-on-surface-variant">No discussion posts yet. Start a conversation!</p>
                </div>
              ) : (
                discussions.map((post) => (
                  <div key={post.id} className="rounded-lg border border-border bg-surface-container-low overflow-hidden">
                    <div
                      className="cursor-pointer p-4 hover:bg-surface-hover transition-colors"
                      onClick={() => toggleDiscussionExpand(post.id)}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        {post.user?.photo_url ? (
                          <img src={post.user.photo_url} alt="" className="h-6 w-6 rounded-full object-cover" />
                        ) : (
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-medium text-indigo-400">
                            {getInitials(post.user?.display_name || '?')}
                          </div>
                        )}
                        <span className="text-sm font-medium text-on-surface">{post.user?.display_name || 'Unknown'}</span>
                        <span className="text-xs text-muted">{formatDate(post.created_at)}</span>
                        {post.is_pinned && <Pin className="h-3 w-3 text-amber-400" />}
                      </div>
                      <p className="text-sm text-on-surface-variant">{post.content}</p>
                      <div className="mt-2 flex items-center gap-3 text-xs text-muted">
                        <span className="flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />
                          {post.reply_count || 0} replies
                        </span>
                        <span className="flex items-center gap-1">
                          {expandedDiscussion === post.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </span>
                      </div>
                    </div>

                    {expandedDiscussion === post.id && (
                      <div className="border-t border-border">
                        <div className="px-4 py-3 space-y-3">
                          {loadingReplies[post.id] ? (
                            <div className="flex items-center gap-2 text-sm text-muted">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Loading replies...
                            </div>
                          ) : discussionReplies[post.id]?.length === 0 ? (
                            <p className="text-sm text-muted">No replies yet.</p>
                          ) : (
                            discussionReplies[post.id]?.map((reply) => (
                              <div key={reply.id} className="flex gap-3">
                                <div className="shrink-0">
                                  {reply.user?.photo_url ? (
                                    <img src={reply.user.photo_url} alt="" className="h-7 w-7 rounded-full object-cover" />
                                  ) : (
                                    <div className="h-7 w-7 rounded-full bg-indigo-500/20 flex items-center justify-center text-[10px] font-medium text-indigo-400">
                                      {getInitials(reply.user?.display_name || '?')}
                                    </div>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-on-surface">
                                      {reply.user?.display_name || 'Unknown'}
                                    </span>
                                    <span className="text-[10px] text-muted">{formatDate(reply.created_at)}</span>
                                  </div>
                                  <p className="text-sm text-on-surface-variant mt-0.5">{reply.content}</p>
                                </div>
                              </div>
                            ))
                          )}
                        </div>

                        {isEnrolled && (
                          <div className="border-t border-border px-4 py-3">
                            <div className="flex gap-3">
                              <div className="shrink-0">
                                {user?.photo_url ? (
                                  <img src={user.photo_url} alt="" className="h-7 w-7 rounded-full object-cover" />
                                ) : (
                                  <div className="h-7 w-7 rounded-full bg-indigo-500/20 flex items-center justify-center text-[10px] font-medium text-indigo-400">
                                    {getInitials(user?.display_name || '?')}
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 space-y-2">
                                <textarea
                                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-on-surface placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
                                  placeholder="Write a reply..."
                                  rows={2}
                                  value={replyText[post.id] || ''}
                                  onChange={(e) => setReplyText(prev => ({ ...prev, [post.id]: e.target.value }))}
                                />
                                <div className="flex justify-end">
                                  <Button
                                    size="sm"
                                    onClick={() => handleReply(post.id)}
                                    disabled={!replyText[post.id]?.trim() || submittingReply[post.id]}
                                  >
                                    {submittingReply[post.id] ? (
                                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                    ) : (
                                      <Send className="h-3 w-3 mr-1" />
                                    )}
                                    Reply
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {showNewPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl bg-surface border border-border shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="text-lg font-semibold text-on-surface">New Discussion Post</h2>
              <Button variant="ghost" size="sm" onClick={() => setShowNewPost(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-on-surface mb-1.5">Content</label>
                <textarea
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-on-surface placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
                  placeholder="What's on your mind?"
                  rows={4}
                  value={newPostContent}
                  onChange={(e) => setNewPostContent(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
              <Button variant="ghost" onClick={() => setShowNewPost(false)}>Cancel</Button>
              <Button
                onClick={handleNewPost}
                disabled={!newPostContent.trim() || submittingNewPost}
              >
                {submittingNewPost ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Send className="h-4 w-4 mr-1" />
                )}
                Post
              </Button>
            </div>
          </div>
        </div>
      )}

      {congratsBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-surface border border-border shadow-2xl">
            <div className="p-6 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20">
                <PartyPopper className="h-8 w-8 text-emerald-400" />
              </div>
              <h2 className="text-xl font-bold text-on-surface mb-2">
                {t('student1.courseDetail.enrollCongratsTitle')}
              </h2>
              <p className="text-sm text-on-surface-variant">
                {t('student1.courseDetail.enrollCongratsDesc', { batch: congratsBatch.name || '' })}
              </p>
            </div>
            <div className="flex justify-center gap-3 border-t border-border px-6 py-4">
              <Button onClick={() => setCongratsBatch(null)}>
                <CheckCircle className="h-4 w-4 mr-1" /> {t('student1.courseDetail.enrollCongratsAction')}
              </Button>
            </div>
          </div>
        </div>
      )}

      <FilePreviewModal url={previewUrl} title={previewUrl?.split('/').pop()} onClose={() => setPreviewUrl(null)} />
    </div>
  )
}

