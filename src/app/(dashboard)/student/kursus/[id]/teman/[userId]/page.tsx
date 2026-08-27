'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase-client'
import { useAuth } from '@/lib/auth-context'
import { useI18n } from '@/lib/i18n/client'
import { Flag } from '@/components/ui/flag'
import { BadgeHexagon } from '@/components/shared/badge-hexagon'
import FilePreviewModal, { isImageUrl } from '@/components/shared/file-preview-modal'
import { getSignedUrl } from '@/lib/storage'
import {
  Loader2, ArrowLeft, Users, GraduationCap,
  Award, FileText,
} from 'lucide-react'
import type { BatchmateProfile, BatchmateCertificate } from '@/types'

interface BadgeRow {
  id: string
  user_id: string
  badge_type: string
  title: string | null
  description: string | null
  earned_at: string
}

const badgeOrder = ['graduation', 'top_scorer', 'perfect_attendance', 'milestone']

const COUNTRY_FLAG: Record<string, string> = {
  id: '🇮🇩', sg: '🇸🇬', my: '🇲🇾', jp: '🇯🇵', kr: '🇰🇷', cn: '🇨🇳',
  us: '🇺🇸', gb: '🇬🇧', au: '🇦🇺', de: '🇩🇪', fr: '🇫🇷',
}

export default function ClassmateProfilePage() {
  const params = useParams()
  const router = useRouter()
  const courseId = params.id as string
  const userId = params.userId as string
  const { user } = useAuth()
  const { t, lang } = useI18n()
  const supabase = createClient()
  const localeMap: Record<string, string> = { en: 'en-US', id: 'id-ID', zh: 'zh-CN' }
  const dateLocale = localeMap[lang] || 'en-US'

  const [profile, setProfile] = useState<BatchmateProfile | null>(null)
  const [badges, setBadges] = useState<BadgeRow[]>([])
  const [certs, setCerts] = useState<BatchmateCertificate[]>([])
  const [loading, setLoading] = useState(true)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewTitle, setPreviewTitle] = useState<string>('')

  useEffect(() => {
    if (!user || !courseId || !userId) return
    fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, courseId, userId])

  async function fetchAll() {
    setLoading(true)
    try {
      const [profileRes, badgesRes, certsRes] = await Promise.all([
        supabase.from('batchmate_profiles').select('*').eq('id', userId).maybeSingle(),
        supabase.from('student_badges').select('*').eq('user_id', userId).order('earned_at', { ascending: true }),
        supabase.from('batchmate_certificates').select('*').eq('user_id', userId).order('issue_date', { ascending: false }),
      ])
      setProfile((profileRes.data as BatchmateProfile) || null)
      setBadges((badgesRes.data as BadgeRow[]) || [])
      setCerts((certsRes.data as BatchmateCertificate[]) || [])
    } catch (err) {
      console.error('Failed to fetch classmate profile', err)
    } finally {
      setLoading(false)
    }
  }

  async function openCertificate(c: BatchmateCertificate) {
    if (!c.pdf_url) return
    let url = c.pdf_url
    if (!/^https?:\/\//i.test(url)) {
      url = (await getSignedUrl(url)) || ''
    }
    if (!url) return
    const title = typeof c.course_title === 'object'
      ? (c.course_title?.en || c.course_title?.id || '')
      : c.certificate_code
    setPreviewTitle(title)
    setPreviewUrl(url)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 text-indigo-400 animate-spin" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Users className="mb-3 h-12 w-12 text-muted" />
        <h2 className="text-lg font-semibold text-on-surface">{t('student3.batchmate.profileNotFoundTitle')}</h2>
        <p className="mt-1 text-sm text-on-surface-variant">{t('student3.batchmate.profileNotFoundDesc')}</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => router.push(`/student/kursus/${courseId}/teman`)}>
          <ArrowLeft className="mr-1 h-3.5 w-3.5" /> {t('student3.batchmate.profileNotFoundBack')}
        </Button>
      </div>
    )
  }

  const flag = COUNTRY_FLAG[(profile.country || '').toLowerCase()] || (profile.country ? '📍' : '')
  const isSelf = user?.id === profile.id

  return (
    <div className="space-y-6">
      <Button variant="outline" size="sm" onClick={() => router.push(`/student/kursus/${courseId}/teman`)}>
        <ArrowLeft className="mr-1 h-4 w-4" /> {t('student3.batchmate.backToCourse')}
      </Button>

      <Card>
        <CardContent className="flex flex-col gap-6 p-6">
          <div className="flex items-center gap-4">
            {profile.photo_url ? (
              <img src={profile.photo_url} alt="" className="size-20 rounded-2xl object-cover ring-2 ring-indigo-500/30" />
            ) : (
              <div className="flex size-20 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 ring-2 ring-indigo-500/30">
                <GraduationCap className="size-9 text-indigo-400" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-on-surface">{profile.display_name || '—'}</h1>
                {isSelf && (
                  <Badge variant="success">{t('student3.batchmate.yourselfBadge')}</Badge>
                )}
              </div>
              {profile.batch_name && (
                <p className="text-sm text-on-surface-variant">
                  {t('student3.batchmate.batchLabel', { name: profile.batch_name })}
                </p>
              )}
              <p className="mt-1 flex items-center gap-1 text-sm text-on-surface-variant">
                {flag && <Flag emoji={flag} className="h-3.5 w-auto" />}
                {profile.country || t('student3.batchmate.countryFallback')}
              </p>
              {profile.bio && (
                <p className="mt-3 text-sm text-on-surface-variant">{profile.bio}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <Award className="h-5 w-5 text-amber-400" />
              <h2 className="font-semibold text-on-surface">{t('student3.batchmate.badgesTitle')}</h2>
              <Badge variant="outline" className="ml-auto">{badges.length}</Badge>
            </div>
            {badges.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">{t('student3.batchmate.noBadges')}</p>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                {[...badges]
                  .sort((a, b) => badgeOrder.indexOf(a.badge_type) - badgeOrder.indexOf(b.badge_type))
                  .map((b) => (
                    <BadgeHexagon
                      key={b.id}
                      type={b.badge_type}
                      title={b.title || b.badge_type}
                      description={b.description || undefined}
                      photoUrl={profile.photo_url}
                      size={64}
                    />
                  ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5 text-indigo-400" />
              <h2 className="font-semibold text-on-surface">{t('student3.batchmate.certificatesTitle')}</h2>
              <Badge variant="outline" className="ml-auto">{certs.length}</Badge>
            </div>
            {certs.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">{t('student3.batchmate.noCertificates')}</p>
            ) : (
              <div className="space-y-3">
                {certs.map((c) => {
                  const courseName = typeof c.course_title === 'object'
                    ? (c.course_title?.en || c.course_title?.id || '')
                    : c.course_title || ''
                  const isImage = isImageUrl(c.pdf_url)
                  return (
                    <div key={c.id} className="overflow-hidden rounded-xl border border-border/60 bg-surface-container-low">
                      {c.pdf_url && (
                        <button
                          type="button"
                          onClick={() => openCertificate(c)}
                          className="group/cert block w-full text-left"
                        >
                          {isImage ? (
                            <img src={c.pdf_url} alt={courseName} loading="lazy" className="h-24 w-full object-cover object-top transition-opacity group-hover/cert:opacity-90" />
                          ) : (
                            <div className="flex h-24 items-center justify-center bg-gradient-to-br from-indigo-500/10 to-purple-500/10">
                              <FileText className="size-8 text-indigo-400" />
                            </div>
                          )}
                          <div className="flex items-center justify-between gap-2 px-3 py-2">
                            <span className="min-w-0 text-xs text-on-surface-variant">
                              <span className="flex items-center gap-1.5">
                                <FileText className="size-3.5 shrink-0 text-indigo-400" />
                                <span className="truncate font-medium text-on-surface">{courseName || t('student3.batchmate.certificateLabel')}</span>
                              </span>
                              <span className="mt-0.5 block">
                                {t('student3.batchmate.issuedOn', { date: new Date(c.issue_date).toLocaleDateString(dateLocale) })}
                                {c.certificate_code ? ` · ${c.certificate_code}` : ''}
                              </span>
                            </span>
                            <span className="shrink-0 text-xs font-medium text-indigo-400 group-hover/cert:underline">
                              {t('student3.batchmate.viewCertificate')}
                            </span>
                          </div>
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <FilePreviewModal url={previewUrl} title={previewTitle} onClose={() => setPreviewUrl(null)} />
    </div>
  )
}