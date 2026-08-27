'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase-client'
import { useAuth } from '@/lib/auth-context'
import { useI18n } from '@/lib/i18n/client'
import { getSignedUrl } from '@/lib/storage'
import FilePreviewModal from '@/components/shared/file-preview-modal'
import {
  ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, ChevronRight,
  Circle, Clock, FileText, Headphones, Image as ImageIcon, Link2,
  ListChecks, Loader2, Lock, Menu, PlayCircle, BarChart3,
  X, ExternalLink
} from 'lucide-react'
import type {
  Course, CourseTask, Enrollment, MaterialProgressStatus, TaskMaterial, User
} from '@/types'
import {
  buildTaskWithMeta, firstActionableMaterial, isMaterialLocked,
  type TaskWithMeta
} from '@/lib/tasks'
import { Flag } from '@/components/ui/flag'
import LmsTaskDetail from '@/components/student/lms-task-detail'

const TYPE_ICON: Record<string, React.ReactNode> = {
  text: <FileText className="h-4 w-4" />,
  video: <PlayCircle className="h-4 w-4" />,
  audio: <Headphones className="h-4 w-4" />,
  pdf: <FileText className="h-4 w-4 text-red-400" />,
  image: <ImageIcon className="h-4 w-4" />,
  file: <FileText className="h-4 w-4" />,
  link: <Link2 className="h-4 w-4" />,
  quiz: <BarChart3 className="h-4 w-4" />,
  exercise: <ListChecks className="h-4 w-4" />,
}

const TYPE_COLOR: Record<string, string> = {
  text: 'bg-indigo-500/10 text-indigo-400',
  video: 'bg-pink-500/10 text-pink-400',
  audio: 'bg-purple-500/10 text-purple-400',
  pdf: 'bg-red-500/10 text-red-400',
  image: 'bg-cyan-500/10 text-cyan-400',
  file: 'bg-slate-500/10 text-slate-400',
  link: 'bg-emerald-500/10 text-emerald-400',
  quiz: 'bg-amber-500/10 text-amber-400',
  exercise: 'bg-blue-500/10 text-blue-400',
}

function getStatusMeta(status: string, t: (k: string, vars?: Record<string, string | number>) => string) {
  switch (status) {
    case 'completed':
      return { label: t('student1.tasks.statusLabel.completed'), cls: 'text-emerald-400 border-emerald-500/30', icon: <CheckCircle2 className="h-3 w-3" /> }
    case 'in_progress':
      return { label: t('student1.tasks.statusLabel.in_progress'), cls: 'text-amber-400 border-amber-500/30', icon: <Clock className="h-3 w-3" /> }
    default:
      return { label: t('student1.tasks.statusLabel.not_started'), cls: 'text-on-surface-variant border-border', icon: <Circle className="h-3 w-3" /> }
  }
}

function getEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be')) {
      let vid = ''
      if (u.hostname.includes('youtu.be')) vid = u.pathname.slice(1)
      else if (u.searchParams.get('v')) vid = u.searchParams.get('v')!
      if (vid) return `https://www.youtube.com/embed/${vid}`
    }
    if (u.hostname.includes('vimeo.com')) {
      const vid = u.pathname.split('/').filter(Boolean)[0]
      if (vid) return `https://player.vimeo.com/video/${vid}`
    }
    if (u.hostname.includes('drive.google.com')) return null
  } catch {
    return null
  }
  return null
}

function MaterialContent({ material }: { material: TaskMaterial }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    setSignedUrl(null)
    setError(false)
    if (material.content_url && !/^https?:\/\//.test(material.content_url)) {
      getSignedUrl(material.content_url).then(u => setSignedUrl(u || null))
    }
  }, [material.content_url, material.id])

  const url = material.content_url && /^https?:\/\//.test(material.content_url)
    ? material.content_url
    : signedUrl

  if (material.content_type === 'video') {
    const embed = url ? getEmbedUrl(url) : null
    if (embed) {
      return (
        <div className="overflow-hidden rounded-xl border border-border">
          <iframe
            src={embed}
            className="aspect-video w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )
    }
    if (url && /\.(mp4|webm|mov|avi)$/i.test(url)) {
      return (
        <div className="overflow-hidden rounded-xl border border-border">
          <video src={url} controls className="aspect-video w-full" />
        </div>
      )
    }
    if (url) {
      return (
        <div className="rounded-xl border border-border bg-surface-container-low p-6 text-center">
          <PlayCircle className="mx-auto h-10 w-10 text-pink-400" />
          <Button size="sm" className="mt-3" onClick={() => window.open(url, '_blank')}>
            <ExternalLink className="mr-1.5 h-4 w-4" /> {material.title}
          </Button>
        </div>
      )
    }
  }

  if (material.content_type === 'audio' && url) {
    return (
      <div className="rounded-xl border border-border bg-surface-container-low p-4">
        <audio src={url} controls className="w-full" />
      </div>
    )
  }

  if (material.content_type === 'pdf' && url) {
    if (!error && (url.startsWith('http') || url.startsWith('blob:'))) {
      return (
        <div className="overflow-hidden rounded-xl border border-border">
          <iframe
            src={`${url}#toolbar=0&view=FitH`}
            className="h-[480px] w-full"
            onError={() => setError(true)}
          />
        </div>
      )
    }
    return (
      <div className="rounded-xl border border-border bg-surface-container-low p-6 text-center">
        <FileText className="mx-auto h-10 w-10 text-red-400" />
        <Button size="sm" className="mt-3" onClick={() => window.open(url, '_blank')}>
          <ExternalLink className="mr-1.5 h-4 w-4" /> {material.title}
        </Button>
      </div>
    )
  }

  if (material.content_type === 'image' && url) {
    return (
      <div className="overflow-hidden rounded-xl border border-border">
        <img src={url} alt={material.title} className="w-full object-contain" />
      </div>
    )
  }

  if (material.content_type === 'file' && url) {
    return (
      <div className="rounded-xl border border-border bg-surface-container-low p-6 text-center">
        <FileText className="mx-auto h-10 w-10 text-indigo-400" />
        <Button size="sm" className="mt-3" onClick={() => window.open(url, '_blank')}>
          <ExternalLink className="mr-1.5 h-4 w-4" /> {material.title}
        </Button>
      </div>
    )
  }

  if (material.content_type === 'link' && url) {
    return (
      <div className="rounded-xl border border-border bg-surface-container-low p-6 text-center">
        <Link2 className="mx-auto h-10 w-10 text-emerald-400" />
        <Button size="sm" className="mt-3" onClick={() => window.open(url, '_blank')}>
          <ExternalLink className="mr-1.5 h-4 w-4" /> {material.title}
        </Button>
      </div>
    )
  }

  if (material.content) {
    return (
      <div className="rounded-xl border border-border bg-surface-container-low p-6">
        <div className="prose-sm max-w-none whitespace-pre-wrap text-sm leading-relaxed text-on-surface-variant">
          {material.content}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-surface-container-low p-6 text-center text-sm text-muted">
      {material.description || '—'}
    </div>
  )
}

export default function TaskDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const { t } = useI18n()
  const supabase = createClient()

  const courseId = params.id as string
  const taskId = params.taskId as string

  const [loading, setLoading] = useState(true)
  const [lmsMode, setLmsMode] = useState<boolean | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [course, setCourse] = useState<Course | null>(null)
  const [tasks, setTasks] = useState<TaskWithMeta[]>([])
  const [current, setCurrent] = useState<TaskWithMeta | null>(null)
  const [teacherName, setTeacherName] = useState('')
  const [teacherPhoto, setTeacherPhoto] = useState<string | null>(null)
  const [languageFlag, setLanguageFlag] = useState('')
  const [languageName, setLanguageName] = useState('')
  const [levelName, setLevelName] = useState('')
  const [activeMaterialId, setActiveMaterialId] = useState<string | null>(null)
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)
  const [showSidebar, setShowSidebar] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const mainRef = useRef<HTMLDivElement>(null)

  const activeMaterial = useMemo(() => {
    if (!current) return null
    return current.materials.find(m => m.id === activeMaterialId) || null
  }, [current, activeMaterialId])

  const activeIndex = useMemo(() => {
    if (!current || !activeMaterial) return -1
    return current.materials.findIndex(m => m.id === activeMaterial.id)
  }, [current, activeMaterial])

  const activeLocked = useMemo(() => {
    if (!current || !activeMaterial) return false
    return isMaterialLocked(current, activeMaterial, current.materials, current.progress)
  }, [current, activeMaterial])

  const fetchAll = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setNotFound(false)
    try {
      const lessonCount = await supabase
        .from('task_lessons')
        .select('id', { count: 'exact', head: true })
        .eq('task_id', taskId)
        .eq('status', 'published')
      setLmsMode((lessonCount.count ?? 0) > 0)

      const [courseRes, tasksRes, enrollmentRes, ctRes] = await Promise.all([
        supabase
          .from('courses')
          .select('*, language:language_code(*), level:level_id(*)')
          .eq('id', courseId)
          .maybeSingle(),
        supabase
          .from('course_tasks')
          .select('*')
          .eq('course_id', courseId)
          .eq('status', 'published')
          .order('sort_order', { ascending: true }),
        supabase
          .from('enrollments')
          .select('*')
          .eq('course_id', courseId)
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('course_teachers')
          .select('teacher:teachers(id, user:users(*))')
          .eq('course_id', courseId),
      ])

      const c = (courseRes.data as unknown as Course & {
        language?: { name?: { en?: string }; flag_emoji?: string }
        level?: { name?: { en?: string }; code?: string }
      }) || null
      if (c) {
        setCourse(c as Course)
        setLanguageFlag(c.language?.flag_emoji || '')
        setLanguageName(c.language?.name?.en || c.language_code || '')
        const lv = (c as any).level
        setLevelName(lv?.name?.en || lv?.code || '')
      }

      const enrollment = (enrollmentRes.data as Enrollment) || null
      const teacherList = ((ctRes.data as any[]) || [])
        .map((r: any) => r?.teacher)
        .filter((x: any) => x && x.user) as { id: string; user: User }[]
      const displayTeacher = enrollment?.teacher_id
        ? teacherList.find(x => x.id === enrollment.teacher_id)
        : teacherList[0]
      setTeacherName(displayTeacher?.user.display_name || t('student1.courseDetail.teacherFallback'))
      setTeacherPhoto(displayTeacher?.user.photo_url || null)

      const rawTasks = (tasksRes.data || []) as CourseTask[]
      if (rawTasks.length === 0) {
        setNotFound(true)
        return
      }

      const taskIds = rawTasks.map(x => x.id)
      const [materialsRes, progressRes] = await Promise.all([
        supabase
          .from('task_materials')
          .select('*')
          .in('task_id', taskIds)
          .order('sort_order', { ascending: true }),
        supabase
          .from('student_material_progress')
          .select('material_id, status')
          .eq('user_id', user.id),
      ])

      const materials = (materialsRes.data || []) as TaskMaterial[]
      const byTask = new Map<string, TaskMaterial[]>()
      for (const m of materials) {
        const list = byTask.get(m.task_id) || []
        list.push(m)
        byTask.set(m.task_id, list)
      }
      const progMap = new Map<string, MaterialProgressStatus>()
      for (const p of (progressRes.data || []) as { material_id: string; status: MaterialProgressStatus }[]) {
        progMap.set(p.material_id, p.status)
      }

      const withMeta = rawTasks.map(rt => {
        const list = byTask.get(rt.id) || []
        const prog: Record<string, MaterialProgressStatus> = {}
        for (const m of list) prog[m.id] = progMap.get(m.id) || 'not_started'
        return buildTaskWithMeta(rt, list, prog)
      })
      setTasks(withMeta)

      const found = withMeta.find(x => x.id === taskId)
      if (!found) {
        setNotFound(true)
        return
      }
      setCurrent(found)
      setExpandedTaskId(found.id)

      const first = firstActionableMaterial(found)
      setActiveMaterialId(first?.id || found.materials[0]?.id || null)

      // tandai in_progress saat dibuka
      if (first && progMap.get(first.id) === 'not_started') {
        supabase
          .from('student_material_progress')
          .upsert({ user_id: user.id, material_id: first.id, status: 'in_progress' }, { onConflict: 'user_id,material_id' })
          .then(() => {
            setTasks(prev => prev.map(x => x.id === found.id
              ? { ...x, progress: { ...x.progress, [first.id]: 'in_progress' } }
              : x))
          })
      }
    } catch (err) {
      console.error('Failed to load task', err)
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }, [courseId, taskId, supabase, user, t])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  function selectTask(task: TaskWithMeta) {
    router.push(`/student/kursus/${courseId}/tasks/${task.id}`)
  }

  function selectMaterial(task: TaskWithMeta, material: TaskMaterial) {
    setActiveMaterialId(material.id)
    setShowSidebar(false)
    if (mainRef.current) mainRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })

    const st = task.progress[material.id]
    if (!st || st === 'not_started') {
      supabase
        .from('student_material_progress')
        .upsert({ user_id: user!.id, material_id: material.id, status: 'in_progress' }, { onConflict: 'user_id,material_id' })
        .then(() => {
          setTasks(prev => prev.map(x => x.id === task.id
            ? { ...x, progress: { ...x.progress, [material.id]: 'in_progress' } }
            : x))
        })
    }
  }

  async function toggleComplete() {
    if (!current || !activeMaterial || !user || updating) return
    const st = current.progress[activeMaterial.id]
    const nextStatus: MaterialProgressStatus = st === 'completed' ? 'not_started' : 'completed'
    setUpdating(true)
    try {
      const { error } = await supabase
        .from('student_material_progress')
        .upsert(
          {
            user_id: user.id,
            material_id: activeMaterial.id,
            status: nextStatus,
            completed_at: nextStatus === 'completed' ? new Date().toISOString() : null,
          },
          { onConflict: 'user_id,material_id' }
        )
      if (error) throw error

      setTasks(prev => prev.map(x => x.id === current.id
        ? buildTaskWithMeta(x, x.materials, { ...x.progress, [activeMaterial.id]: nextStatus })
        : x))
      setCurrent(prev => prev ? buildTaskWithMeta(prev, prev.materials, { ...prev.progress, [activeMaterial.id]: nextStatus }) : prev)
    } catch (err) {
      console.error('Failed to update progress', err)
    } finally {
      setUpdating(false)
    }
  }

  function goToMaterial(offset: number) {
    if (!current || activeIndex < 0) return
    const target = current.materials[activeIndex + offset]
    if (target) selectMaterial(current, target)
  }

  function goToNextTask() {
    if (!current) return
    const idx = tasks.findIndex(x => x.id === current.id)
    const next = tasks[idx + 1]
    if (next) selectTask(next)
  }

  function goToPrevTask() {
    if (!current) return
    const idx = tasks.findIndex(x => x.id === current.id)
    const prev = tasks[idx - 1]
    if (prev) selectTask(prev)
  }

  if (lmsMode === true) {
    return <LmsTaskDetail courseId={courseId} taskId={taskId} />
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
      </div>
    )
  }

  if (notFound || !current) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ListChecks className="h-12 w-12 text-muted mb-4" />
        <h2 className="text-lg font-semibold text-on-surface">{t('student1.tasks.notFoundTitle')}</h2>
        <p className="mt-1 text-sm text-on-surface-variant">{t('student1.tasks.notFoundDesc')}</p>
        <Link href={`/student/kursus/${courseId}`}>
          <Button variant="outline" className="mt-5">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> {t('student1.tasks.backToTasks')}
          </Button>
        </Link>
      </div>
    )
  }

  const allRequiredDone = current.materials
    .filter(m => m.is_required)
    .every(m => current.progress[m.id] === 'completed')

  const taskIdx = tasks.findIndex(x => x.id === current.id)
  const hasPrevTask = taskIdx > 0
  const hasNextTask = taskIdx >= 0 && taskIdx < tasks.length - 1

  const SidebarContent = (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t('student1.tasks.courseInfo')}</p>
        <h3 className="mt-2 text-sm font-semibold text-on-surface line-clamp-2">
          {(course as any)?.title?.en || (course as any)?.title?.id || ''}
        </h3>
        <div className="mt-3 flex items-center gap-2">
          {teacherPhoto ? (
            <img src={teacherPhoto} alt="" className="h-6 w-6 rounded-full object-cover" />
          ) : (
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500/20 text-[10px] font-medium text-indigo-400">
              {(teacherName || '?').slice(0, 1).toUpperCase()}
            </div>
          )}
          <span className="text-xs text-on-surface-variant truncate">{t('student1.tasks.instructor')}: {teacherName}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {languageFlag && <Flag emoji={languageFlag} className="h-3.5 w-auto" />}
          {languageName && <Badge variant="outline" className="text-[10px]">{languageName}</Badge>}
          {levelName && <Badge variant="outline" className="text-[10px]">{levelName}</Badge>}
        </div>
        <div className="mt-4">
          <div className="flex items-center justify-between text-[10px] text-muted">
            <span>{t('student1.tasks.overallProgress')}</span>
            <span>{courseTaskPercent(tasks)}%</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-container-highest">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-400"
              style={{ width: `${courseTaskPercent(tasks)}%` }}
            />
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t('student1.tasks.taskList')}</p>
        </div>
        <div className="divide-y divide-border">
          {tasks.map((task, _i) => {
            const expanded = expandedTaskId === task.id
            return (
              <div key={task.id}>
                <button
                  onClick={() => selectTask(task)}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-hover ${
                    task.id === current.id ? 'bg-indigo-500/10' : ''
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                      task.id === current.id ? 'bg-indigo-500/20 text-indigo-400' : 'bg-surface-container-high text-on-surface-variant'
                    }`}
                  >
                    {String(task.task_number).padStart(2, '0')}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className={`block text-xs font-medium truncate ${task.id === current.id ? 'text-on-surface' : 'text-on-surface-variant'}`}>
                      {task.title}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1 text-[10px] text-muted">
                      {task.taskState === 'completed' ? (
                        <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                      ) : task.taskState === 'in_progress' ? (
                        <Clock className="h-3 w-3 text-amber-400" />
                      ) : (
                        <Circle className="h-3 w-3" />
                      )}
                      {t(`student1.tasks.statusLabel.${task.taskState}`)} • {task.percent}%
                    </span>
                  </span>
                  {expanded ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
                  )}
                </button>
                {expanded && (
                  <div className="space-y-0.5 bg-surface-container-low/60 px-2 pb-2">
                    {task.materials.length === 0 && (
                      <p className="px-2 py-2 text-[10px] text-muted">—</p>
                    )}
                    {task.materials.map((m, _mi) => {
                      const locked = isMaterialLocked(task, m, task.materials, task.progress)
                      const mStatus = task.progress[m.id]
                      const meta = getStatusMeta(mStatus, t)
                      const isActive = task.id === current.id && m.id === activeMaterialId
                      return (
                        <button
                          key={m.id}
                          disabled={locked}
                          onClick={() => selectMaterial(task, m)}
                          className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors ${
                            isActive
                              ? 'border-l-2 border-indigo-400 bg-indigo-500/10'
                              : locked
                                ? 'opacity-50'
                                : 'hover:bg-surface-hover'
                          }`}
                        >
                          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${TYPE_COLOR[m.content_type] || 'bg-surface-container-high'}`}>
                            {locked ? <Lock className="h-3 w-3" /> : TYPE_ICON[m.content_type] || <FileText className="h-3 w-3" />}
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className={`block text-xs truncate ${isActive ? 'font-medium text-on-surface' : 'text-on-surface-variant'}`}>
                              {m.title}
                            </span>
                            {!m.is_required && (
                              <span className="text-[9px] text-muted">{t('student1.tasks.optional')}</span>
                            )}
                          </span>
                          <span className={`flex shrink-0 items-center gap-1 text-[9px] ${meta.cls}`}>
                            {locked ? (
                              <Lock className="h-3 w-3" />
                            ) : (
                              <>
                                {meta.icon}
                                {mStatus === 'completed' ? '' : mStatus === 'in_progress' ? '' : ''}
                              </>
                            )}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )

  const MaterialMain = activeMaterial ? (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${TYPE_COLOR[activeMaterial.content_type] || 'bg-surface-container-high'}`}>
            {TYPE_ICON[activeMaterial.content_type] || <FileText className="h-4 w-4" />}
          </span>
          <div>
            <h2 className="text-sm font-semibold text-on-surface">{activeMaterial.title}</h2>
            <p className="text-[10px] text-muted">
              {t(`student1.tasks.materialType.${activeMaterial.content_type}`)}
              {' • '}
              {activeMaterial.is_required ? t('student1.tasks.required') : t('student1.tasks.optional')}
            </p>
          </div>
        </div>
        {!activeLocked && (
          <Button
            size="sm"
            variant={current.progress[activeMaterial.id] === 'completed' ? 'outline' : 'default'}
            className={current.progress[activeMaterial.id] === 'completed' ? 'text-emerald-400' : ''}
            onClick={toggleComplete}
            disabled={updating}
          >
            {updating ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : current.progress[activeMaterial.id] === 'completed' ? (
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
            ) : (
              <Circle className="mr-1.5 h-3.5 w-3.5" />
            )}
            {current.progress[activeMaterial.id] === 'completed'
              ? t('student1.tasks.markedComplete')
              : t('student1.tasks.markComplete')}
          </Button>
        )}
      </div>

      {activeMaterial.description && (
        <p className="text-xs text-on-surface-variant">{activeMaterial.description}</p>
      )}

      {activeLocked ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface-container-low px-6 py-14 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-high">
            <Lock className="h-6 w-6 text-muted" />
          </div>
          <h3 className="mt-3 text-sm font-semibold text-on-surface">{t('student1.tasks.locked')}</h3>
          <p className="mt-1 max-w-xs text-xs text-muted">{t('student1.tasks.sequentialNote')}</p>
        </div>
      ) : (
        <MaterialContent material={activeMaterial} />
      )}

      {activeLocked && current.sequential_learning && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-400">
          {t('student1.tasks.sequentialNote')}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="outline"
          size="sm"
          disabled={activeIndex <= 0}
          onClick={() => goToMaterial(-1)}
        >
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> {t('student1.tasks.previous')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={activeIndex < 0 || activeIndex >= current.materials.length - 1}
          onClick={() => goToMaterial(1)}
        >
          {t('student1.tasks.next')} <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  ) : (
    <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface-container-low py-16 text-center">
      <ListChecks className="h-10 w-10 text-muted" />
      <p className="mt-2 text-sm text-on-surface-variant">{t('student1.tasks.emptyDesc')}</p>
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Link href={`/student/kursus/${courseId}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> {t('student1.tasks.backToTasks')}
          </Button>
        </Link>
        <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setShowSidebar(true)}>
          <Menu className="mr-1.5 h-4 w-4" /> {t('student1.tasks.courseContent')}
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="relative h-36">
          {current.cover_image_url ? (
            <img src={current.cover_image_url} alt={current.title} className="h-36 w-full object-cover" />
          ) : (
            <div className="flex h-36 w-full items-center justify-center bg-gradient-to-br from-indigo-500/20 via-purple-500/10 to-transparent">
              <ListChecks className="h-12 w-12 text-indigo-400/70" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <div className="absolute bottom-3 left-4 right-4 flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/90 text-sm font-bold text-white">
              {String(current.task_number).padStart(2, '0')}
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-bold text-white">{current.title}</h1>
            </div>
            <div className="hidden sm:block">
              {current.taskState === 'completed' ? (
                <Badge variant="success">{t('student1.tasks.completed')}</Badge>
              ) : current.taskState === 'in_progress' ? (
                <Badge variant="warning">{t('student1.tasks.inProgress')}</Badge>
              ) : (
                <Badge variant="outline" className="bg-black/40 text-white border-white/20">{t('student1.tasks.notStarted')}</Badge>
              )}
            </div>
          </div>
        </div>
        <div className="p-4 sm:p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="h-2 w-full max-w-[180px] overflow-hidden rounded-full bg-surface-container-highest">
                <div
                  className={`h-full rounded-full ${current.taskState === 'completed' ? 'bg-emerald-500' : 'bg-gradient-to-r from-indigo-500 to-indigo-400'}`}
                  style={{ width: `${current.percent}%` }}
                />
              </div>
              <span className="text-xs text-muted">{t('student1.tasks.taskProgress', { done: current.completedCount, total: current.totalCount })}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={!hasPrevTask} onClick={goToPrevTask}>
                <ArrowLeft className="mr-1 h-3.5 w-3.5" /> {t('student1.tasks.previous')}
              </Button>
              <Button size="sm" disabled={!hasNextTask} onClick={goToNextTask}>
                {t('student1.tasks.next')} <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          {allRequiredDone && current.materials.length > 0 && (
            <div className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-400">
              {t('student1.tasks.taskCompletedBanner')}
              {hasNextTask && <span className="ml-1">{t('student1.tasks.nextTaskBanner')}</span>}
            </div>
          )}
        </div>
      </Card>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="hidden lg:block lg:w-[320px] shrink-0">
          <div className="lg:sticky lg:top-20">{SidebarContent}</div>
        </div>

        <div ref={mainRef} className="min-w-0 flex-1 scroll-mt-24">
          {MaterialMain}
        </div>
      </div>

      {showSidebar && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowSidebar(false)} />
          <div className="absolute inset-y-0 right-0 w-full max-w-sm overflow-y-auto bg-surface p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold text-on-surface">{t('student1.tasks.courseContent')}</p>
              <Button variant="ghost" size="sm" onClick={() => setShowSidebar(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            {SidebarContent}
          </div>
        </div>
      )}

      <FilePreviewModal url={previewUrl} title={previewUrl?.split('/').pop()} onClose={() => setPreviewUrl(null)} />
    </div>
  )
}

function courseTaskPercent(tasks: TaskWithMeta[]): number {
  let done = 0
  let total = 0
  for (const t of tasks) {
    total += t.materials.length
    done += Object.values(t.progress).filter(s => s === 'completed').length
  }
  return total > 0 ? Math.round((done / total) * 100) : 0
}