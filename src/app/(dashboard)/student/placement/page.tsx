'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FileText, Clock, CheckCircle, ArrowRight, RefreshCw, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-client'
import { useAuth } from '@/lib/auth-context'
import { useI18n } from '@/lib/i18n/client'
import { normalizeTier } from '@/lib/course-catalog'

const LOCALE_MAP: Record<string, string> = { en: 'en-US', id: 'id-ID', zh: 'zh-CN' }

interface PlacementResult {
  id: string
  provisional_level: string
  score: number
  completed_at: string
}

export default function PlacementTestPage() {
  const { user, loading: authLoading } = useAuth()
  const { t, lang } = useI18n()
  const supabase = createClient()
  const [result, setResult] = useState<PlacementResult | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading || !user) return
    fetchResult()
  }, [authLoading, user])

  async function fetchResult() {
    try {
      const { data } = await supabase
        .from('placement_results')
        .select('id, provisional_level, score, completed_at')
        .eq('user_id', user!.id)
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (data) {
        setResult(data as PlacementResult)
      }
    } catch (err) {
      console.error('Failed to fetch placement result', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 text-indigo-400 animate-spin" />
          <p className="text-sm text-muted">{t('student2.placement.loading')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">{t('student2.placement.title')}</h1>
        <p className="text-on-surface-variant">{t('student2.placement.subtitle')}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {!result ? (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-indigo-400" /> {t('student2.placement.title')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <p className="text-on-surface-variant">
                  {t('student2.placement.beforeDesc')}
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { icon: Clock, text: t('student2.placement.duration') },
                    { icon: FileText, text: t('student2.placement.questionCount') },
                    { icon: CheckCircle, text: t('student2.placement.autoGraded') },
                  ].map((item) => (
                    <div key={item.text} className="flex items-center gap-2 rounded-lg bg-surface-container-low p-3 text-sm text-on-surface-variant">
                      <item.icon className="h-4 w-4 text-indigo-400" /> {item.text}
                    </div>
                  ))}
                </div>
                <Link href="/student/placement-test">
                  <Button>
                    {t('student2.placement.start')} <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-emerald-400" /> {t('student2.placement.yourResult')}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-center py-6">
                <div className="text-5xl font-bold text-indigo-400 mb-2">{t(`common.tier.${normalizeTier(result.provisional_level) || 'unknown'}`)}</div>
                <p className="text-on-surface-variant">{t('student2.placement.score', { score: result.score })}</p>
                <p className="text-xs text-muted mt-1">
                  {t('student2.placement.takenOn', {
                    date: new Date(result.completed_at).toLocaleDateString(LOCALE_MAP[lang] || 'en-US', { dateStyle: 'long' }),
                  })}
                </p>
                <Link href="/student/placement-test">
                  <Button variant="outline" size="sm" className="mt-4">
                    <RefreshCw className="mr-1 h-3 w-3" /> {t('student2.placement.retake')}
                  </Button>
                </Link>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ArrowRight className="h-5 w-5 text-indigo-400" /> {t('student2.placement.nextSteps')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-on-surface-variant">{t('student2.placement.recommendation')}</p>
                <Link href="/project">
                  <Button className="w-full">{t('student2.placement.findCourseLevel', { level: t(`common.tier.${normalizeTier(result.provisional_level) || 'unknown'}`) })}</Button>
                </Link>
                <Link href="/project">
                  <Button variant="ghost" className="w-full">{t('student2.placement.viewAllPrograms')}</Button>
                </Link>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
