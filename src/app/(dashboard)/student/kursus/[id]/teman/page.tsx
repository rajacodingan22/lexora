'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase-client'
import { useAuth } from '@/lib/auth-context'
import { useI18n } from '@/lib/i18n/client'
import { BadgeHexagon } from '@/components/shared/badge-hexagon'
import { Flag } from '@/components/ui/flag'
import {
  Loader2, Users, ArrowLeft, GraduationCap,
  Award, FileText,
} from 'lucide-react'
import type { BatchmateProfile, BatchmateCertificate } from '@/types'

interface BadgeRow {
  id: string
  user_id: string
  badge_type: string
}

const badgeOrder = ['graduation', 'top_scorer', 'perfect_attendance', 'milestone']

const COUNTRY_FLAG: Record<string, string> = {
  id: '🇮🇩', sg: '🇸🇬', my: '🇲🇾', jp: '🇯🇵', kr: '🇰🇷', cn: '🇨🇳',
  us: '🇺🇸', gb: '🇬🇧', au: '🇦🇺', de: '🇩🇪', fr: '🇫🇷',
}

export default function ClassmatesPage() {
  const params = useParams()
  const router = useRouter()
  const courseId = params.id as string
  const { user } = useAuth()
  const { t } = useI18n()
  const supabase = createClient()

  const [profiles, setProfiles] = useState<BatchmateProfile[]>([])
  const [badges, setBadges] = useState<Record<string, BadgeRow[]>>({})
  const [certs, setCerts] = useState<Record<string, BatchmateCertificate[]>>({})
  const [courseTitle, setCourseTitle] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user || !courseId) return
    fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, courseId])

  async function fetchAll() {
    setLoading(true)
    try {
      const [profilesRes, courseRes, badgesRes, certsRes] = await Promise.all([
        supabase.from('batchmate_profiles').select('*').eq('course_id', courseId),
        supabase.from('courses').select('title').eq('id', courseId).maybeSingle(),
        supabase.from('student_badges').select('id, user_id, badge_type'),
        supabase.from('batchmate_certificates').select('id, user_id, course_id, certificate_code, issue_date, pdf_url, language_code, status, course_title'),
      ])

      const profiles = (profilesRes.data || []) as BatchmateProfile[]
      setProfiles(profiles)

      const t = (courseRes.data as any)?.title
      setCourseTitle(t?.en || t?.id || '')

      const badgeMap: Record<string, BadgeRow[]> = {}
      for (const b of (badgesRes.data || []) as BadgeRow[]) {
        if (!profiles.some(p => p.id === b.user_id)) continue
        ;(badgeMap[b.user_id] ||= []).push(b)
      }
      setBadges(badgeMap)

      const certMap: Record<string, BatchmateCertificate[]> = {}
      for (const c of (certsRes.data || []) as BatchmateCertificate[]) {
        if (!profiles.some(p => p.id === c.user_id)) continue
        ;(certMap[c.user_id] ||= []).push(c)
      }
      setCerts(certMap)
    } catch (err) {
      console.error('Failed to fetch classmates', err)
    } finally {
      setLoading(false)
    }
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/student/kursus/${courseId}`)}
          >
            <ArrowLeft className="mr-1 h-4 w-4" /> {t('student3.batchmate.backToCourse')}
          </Button>
          <div>
            <h1 className="text-xl font-bold text-on-surface">{t('student3.batchmate.listTitle')}</h1>
            <p className="text-sm text-on-surface-variant">{courseTitle} · {t('student3.batchmate.listSubtitle')}</p>
          </div>
        </div>
        <Badge variant="outline" className="gap-1">
          <Users className="h-3.5 w-3.5" /> {profiles.length}
        </Badge>
      </div>

      {profiles.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="mb-3 h-12 w-12 text-muted" />
            <p className="font-medium text-on-surface">{t('student3.batchmate.emptyTitle')}</p>
            <p className="mt-1 text-sm text-on-surface-variant">{t('student3.batchmate.emptyDesc')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {profiles.map((p) => {
            const pBadges = badges[p.id] || []
            const pCerts = certs[p.id] || []
            const flag = COUNTRY_FLAG[(p.country || '').toLowerCase()] || (p.country ? '📍' : '')
            return (
              <Link key={p.id} href={`/student/kursus/${courseId}/teman/${p.id}`}>
                <Card className="h-full transition-all duration-300 hover:border-indigo-500/30 hover:shadow-lg hover:shadow-indigo-500/5">
                  <CardContent className="flex flex-col gap-4 p-5">
                    <div className="flex items-center gap-3">
                      <div className="relative shrink-0">
                        {p.photo_url ? (
                          <img src={p.photo_url} alt="" className="size-12 rounded-full object-cover ring-2 ring-indigo-500/30" />
                        ) : (
                          <div className="flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 ring-2 ring-indigo-500/30">
                            <GraduationCap className="size-5 text-indigo-400" />
                          </div>
                        )}
                        {user && user.id === p.id && (
                          <span className="absolute -bottom-1 -right-1 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
                            {t('student3.batchmate.yourselfBadge')}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-on-surface">
                          {p.display_name || '—'}
                        </p>
                        {p.batch_name && (
                          <p className="truncate text-xs text-muted">
                            {t('student3.batchmate.batchLabel', { name: p.batch_name })}
                          </p>
                        )}
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-on-surface-variant">
                          {flag && <Flag emoji={flag} className="h-3 w-auto" />}
                          {p.country || t('student3.batchmate.countryFallback')}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {pBadges.length > 0 ? (
                        [...pBadges]
                          .sort((a, b) => badgeOrder.indexOf(a.badge_type) - badgeOrder.indexOf(b.badge_type))
                          .slice(0, 3)
                          .map((b) => (
                            <BadgeHexagon key={b.id} type={b.badge_type} title={b.badge_type} photoUrl={p.photo_url} size={44} />
                          ))
                      ) : (
                        <span className="text-xs text-muted">{t('student3.batchmate.noBadges')}</span>
                      )}
                    </div>

                    <div className="flex items-center justify-between border-t border-border/60 pt-3 text-xs">
                      <span className="flex items-center gap-1.5 text-on-surface-variant">
                        <FileText className="size-3.5 text-indigo-400" />
                        {t('student3.batchmate.certCount', { count: pCerts.length })}
                      </span>
                      <span className="flex items-center gap-1.5 text-on-surface-variant">
                        <Award className="size-3.5 text-amber-400" />
                        {t('student3.batchmate.badgeCount', { count: pBadges.length })}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}