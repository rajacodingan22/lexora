'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'
import { useI18n } from '@/lib/i18n/client'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Flag } from '@/components/ui/flag'
import { Search, Loader2, BookOpen, Layers } from 'lucide-react'

interface LearningCourse {
  id: string
  title: { en: string; id: string }
  language_code: string
  level_id: string | null
  image_url: string | null
  status: string
  created_at: string
  level_name: { en: string; id: string } | null
  task_count: number
  flag_emoji: string | null
}

export default function AdminLearningCoursesPage() {
  const { t } = useI18n()
  const router = useRouter()
  const supabase = createClient()

  const [courses, setCourses] = useState<LearningCourse[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const fetchCourses = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase.from('courses').select('*')
      if (search.trim()) {
        query = query.or('title->>en.ilike.%' + search + '%,title->>id.ilike.%' + search + '%')
      }
      const { data, error } = await query.order('created_at', { ascending: false })
      if (error || !data) {
        setCourses([])
        setLoading(false)
        return
      }

      const ids = data.map((c) => c.id)
      const [levelRes, taskRes, langRes] = await Promise.all([
        supabase
          .from('language_levels')
          .select('id, name')
          .in('id', data.map((c) => c.level_id).filter(Boolean)),
        supabase.from('course_tasks').select('id, course_id').in('course_id', ids),
        supabase.from('languages').select('code, flag_emoji'),
      ])

      const levelMap = new Map((levelRes.data ?? []).map((l: any) => [l.id, l]))
      const langEmoji = new Map((langRes.data ?? []).map((l: any) => [l.code, l.flag_emoji]))
      const taskCounts: Record<string, number> = {}
      for (const tsk of taskRes.data ?? []) {
        taskCounts[tsk.course_id] = (taskCounts[tsk.course_id] || 0) + 1
      }

      setCourses(
        data.map((c) => ({
          id: c.id,
          title: c.title,
          language_code: c.language_code,
          level_id: c.level_id,
          image_url: c.image_url,
          status: c.status,
          created_at: c.created_at,
          level_name: levelMap.get(c.level_id)?.name ?? null,
          task_count: taskCounts[c.id] || 0,
          flag_emoji: langEmoji.get(c.language_code) ?? null,
        })),
      )
    } catch (err) {
      console.error('Failed to fetch learning courses:', err)
      setCourses([])
    }
    setLoading(false)
  }, [search, supabase])

  useEffect(() => {
    fetchCourses()
  }, [fetchCourses])

  function courseTitle(c: LearningCourse): string {
    return c.title?.id || c.title?.en || '—'
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-slate-900">{t('learning.title')}</h1>
        <p className="text-sm text-slate-500">{t('learning.subtitle')}</p>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('courses.search')}
            className="pl-9"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : courses.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-400">
            <BookOpen className="mx-auto mb-3 h-10 w-10" />
            <p>{t('courses.noCourses')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => (
            <Card
              key={c.id}
              className="cursor-pointer transition-shadow hover:shadow-md"
            >
              <button
                type="button"
                className="w-full text-left"
                onClick={() => router.push(`/admin/learning/courses/${c.id}`)}
              >
                <div className="relative h-36 w-full overflow-hidden rounded-t-xl bg-slate-100">
                  {c.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.image_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <BookOpen className="h-10 w-10 text-slate-300" />
                    </div>
                  )}
                  <div className="absolute right-2 top-2">
                    <Badge variant={c.status === 'active' ? 'default' : 'outline'}>
                      {c.status}
                    </Badge>
                  </div>
                </div>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-slate-900 line-clamp-2">{courseTitle(c)}</h3>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <Flag emoji={c.flag_emoji} />
                    <span>{c.language_code}</span>
                    {c.level_name && <span>• {c.level_name.id || c.level_name.en}</span>}
                  </div>
                </CardHeader>
                <CardContent className="flex items-center justify-between pt-0">
                  <div className="flex items-center gap-1 text-xs text-slate-500">
                    <Layers className="h-3.5 w-3.5" />
                    {c.task_count} {t('tasks.lessons')}
                  </div>
                  <Button size="sm" onClick={() => router.push(`/admin/learning/courses/${c.id}`)}>
                    {t('courses.manageContent')}
                  </Button>
                </CardContent>
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
