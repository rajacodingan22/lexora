'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-client'
import { useAuth } from '@/lib/auth-context'
import { useI18n } from '@/lib/i18n/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Flag } from '@/components/ui/flag'
import { FileText, Clock, CheckCircle, XCircle } from 'lucide-react'
import Link from 'next/link'
import { normalizeTier } from '@/lib/course-catalog'

interface HistoryResult {
  id: string
  language_code: string
  provisional_level: string
  score: number
  total_questions: number
  created_at: string
  languages: {
    code: string
    name: { id: string; en: string }
    flag_emoji: string
  } | null
}

const LEVEL_BADGE: Record<string, string> = {
  basic: 'bg-emerald-500/20 text-emerald-400',
  advance: 'bg-amber-500/20 text-amber-400',
  expert: 'bg-purple-500/20 text-purple-400',
}

const LOCALE_MAP: Record<string, string> = { en: 'en-US', id: 'id-ID', zh: 'zh-CN' }

function getLevelBadge(level: string) {
  return LEVEL_BADGE[normalizeTier(level) || ''] || 'bg-gray-500/20 text-gray-400'
}

function formatDate(dateStr: string, locale: string) {
  return new Date(dateStr).toLocaleDateString(locale, {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function Skeleton() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-64 rounded-lg bg-surface-container-high animate-pulse" />
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-xl bg-surface-container-high animate-pulse" />
        ))}
      </div>
    </div>
  )
}

function EmptyState() {
  const { t } = useI18n()

  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16 space-y-4">
        <FileText className="h-12 w-12 text-muted" />
        <div className="text-center">
          <p className="text-lg font-medium text-on-surface">{t('student2.history.emptyTitle')}</p>
          <p className="text-sm text-on-surface-variant mt-1">
            {t('student2.history.emptyDesc')}
          </p>
        </div>
        <Link href="/student/placement-test">
          <Button>
            <FileText className="mr-2 h-4 w-4" /> {t('student2.history.takeTest')}
          </Button>
        </Link>
      </CardContent>
    </Card>
  )
}

function ResultRow({ item }: { item: HistoryResult }) {
  const { t, lang } = useI18n()
  const locale = LOCALE_MAP[lang] || 'en-US'
  const rawScore = item.score
  const totalQuestions = item.total_questions || 0
  const scorePercent = totalQuestions > 0 ? Math.round((item.score / totalQuestions) * 100) : 0
  const passed = scorePercent >= 60
  const levelKey = normalizeTier(item.provisional_level) || 'unknown'
  const levelBadge = getLevelBadge(item.provisional_level)
  const langName = item.languages?.name?.id || item.language_code

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xl font-semibold text-on-surface">
                {item.languages?.flag_emoji ? <Flag emoji={item.languages.flag_emoji} className="h-5 w-auto" /> : null} {langName}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-on-surface-variant">
              <Clock className="h-4 w-4 shrink-0" />
              {formatDate(item.created_at, locale)}
            </div>
          </div>

          <div className="flex items-center gap-5 flex-wrap">
            <div className="text-center">
              <p className="text-xs text-on-surface-variant mb-1">{t('student2.history.score')}</p>
              <p className="text-xl font-bold text-on-surface">
                {rawScore}<span className="text-sm text-muted">/{totalQuestions}</span>
              </p>
            </div>

            <div className="text-center">
              <p className="text-xs text-on-surface-variant mb-1">{t('student2.history.percentage')}</p>
              <p className="text-xl font-bold text-on-surface">{scorePercent}%</p>
            </div>

            <div className="text-center">
              <p className="text-xs text-on-surface-variant mb-1">{t('student2.history.level')}</p>
              <Badge className={cn('mt-0.5', levelBadge)}>
                {t(`common.tier.${levelKey}`)}
              </Badge>
            </div>

            <div className="text-center">
              <p className="text-xs text-on-surface-variant mb-1">{t('student2.history.status')}</p>
              {passed ? (
                <div className="flex items-center gap-1 text-green-400 mt-0.5">
                  <CheckCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">{t('student2.history.pass')}</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 text-red-400 mt-0.5">
                  <XCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">{t('student2.history.fail')}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function RiwayatPlacementPage() {
  const { user, loading: authLoading } = useAuth()
  const { t } = useI18n()
  const supabase = createClient()

  const [results, setResults] = useState<HistoryResult[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading || !user) return
    fetchHistory()
  }, [authLoading, user])

  async function fetchHistory() {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('placement_results')
        .select('id, test_id, score, provisional_level, total_questions, completed_at')
        .eq('user_id', user!.id)
        .order('completed_at', { ascending: false })

      if (data) {
        const testIds = data.map(r => r.test_id).filter(Boolean)
        const { data: tests } = await supabase
          .from('placement_tests')
          .select('id, language_code')
          .in('id', testIds)
        const testMap = new Map((tests || []).map(t => [t.id, t.language_code]))

        const langCodes = [...new Set((tests || []).map(t => t.language_code).filter(Boolean))]
        const { data: langs } = langCodes.length
          ? await supabase.from('languages').select('*')
          : { data: [] }

        const langMap = new Map((langs || []).map(l => [l.code, l]))

        const qCounts = new Map<string, number>()
        const missingTestIds = data
          .filter(r => !r.total_questions && r.test_id)
          .map(r => r.test_id)
        if (missingTestIds.length) {
          const { count } = await supabase
            .from('placement_questions_student')
            .select('id', { count: 'exact', head: true })
            .in('test_id', missingTestIds)
          if (missingTestIds.length === 1) {
            qCounts.set(missingTestIds[0], count || 0)
          } else if (count) {
            const { data: byTest } = await supabase
              .from('placement_questions_student')
              .select('test_id')
              .in('test_id', missingTestIds)
            const occ = new Map<string, number>()
            ;(byTest || []).forEach((q: any) => occ.set(q.test_id, (occ.get(q.test_id) || 0) + 1))
            occ.forEach((n, tid) => qCounts.set(tid, n))
          }
        }

        setResults(data.map(r => ({
          id: r.id,
          language_code: testMap.get(r.test_id) || '',
          provisional_level: r.provisional_level,
          score: r.score,
          total_questions: r.total_questions || qCounts.get(r.test_id) || 0,
          created_at: r.completed_at,
          languages: langMap.get(testMap.get(r.test_id) || '') || null,
        })))
      }
    } catch (err) {
      console.error('Failed to fetch placement history', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading || authLoading) {
    return <Skeleton />
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">{t('student2.history.title')}</h1>
        <p className="text-on-surface-variant text-sm mt-1">
          {t('student2.history.subtitle')}
        </p>
      </div>

      {results.length === 0 ? <EmptyState /> : (
        <div className="grid gap-4">
          {results.map((item) => (
            <ResultRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}
