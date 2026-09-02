'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, BookOpen, GraduationCap, TrendingUp, Layers, Inbox } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-client'
import { useAuth } from '@/lib/auth-context'
import { useI18n } from '@/lib/i18n/client'
import { timeAgo } from '@/lib/utils'
import type { User } from '@/types'

interface RoleCounts {
  student: number
  teacher: number
  admin: number
  total: number
}

export default function AdminDashboard() {
  const { user, loading: authLoading } = useAuth()
  const { t } = useI18n()
  const supabase = createClient()

  const [roleCounts, setRoleCounts] = useState<RoleCounts>({ student: 0, teacher: 0, admin: 0, total: 0 })
  const [courseCount, setCourseCount] = useState(0)
  const [recentUsers, setRecentUsers] = useState<User[]>([])
  const [completionRate, setCompletionRate] = useState(0)
  const [avgGrade, setAvgGrade] = useState(0)
  const [activeEnrollments, setActiveEnrollments] = useState(0)
  const [activeBatchCount, setActiveBatchCount] = useState(0)
  const [pendingPaymentCount, setPendingPaymentCount] = useState(0)
  const [totalPaymentCount, setTotalPaymentCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return
    fetchData()
  }, [authLoading])

  async function fetchData() {
    setLoading(true)
    try {
      const [
        { data: usersData },
        { count: courseCnt },
        { data: recentData },
        { count: enrollCnt },
        { data: gradeData },
        { count: batchCnt },
        { data: paymentData },
      ] = await Promise.all([
        supabase.from('users').select('role'),
        supabase.from('courses').select('*', { count: 'exact', head: true }),
        supabase.from('users').select('*').order('created_at', { ascending: false }).limit(5),
        supabase.from('enrollments').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('grade_aggregates').select('weighted_total, is_passing'),
        supabase.from('batches').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('payments').select('status'),
      ])

      const roles: RoleCounts = { student: 0, teacher: 0, admin: 0, total: 0 }
      if (usersData) {
        for (const u of usersData) {
          const r = (u as any).role as string
          if (r === 'student') roles.student++
          else if (r === 'teacher') roles.teacher++
          else if (r === 'admin') roles.admin++
          roles.total++
        }
      }
      setRoleCounts(roles)
      setCourseCount(courseCnt ?? 0)
      setRecentUsers((recentData || []) as User[])
      setActiveEnrollments(enrollCnt ?? 0)
      setActiveBatchCount(batchCnt ?? 0)

      if (paymentData && paymentData.length > 0) {
        const pending = paymentData.filter((p: any) => p.status === 'pending').length
        setPendingPaymentCount(pending)
        setTotalPaymentCount(paymentData.length)
      }

      if (gradeData && gradeData.length > 0) {
        const total = gradeData.reduce((s, g) => s + (g.weighted_total || 0), 0)
        setAvgGrade(Math.round(total / gradeData.length))
        const passed = gradeData.filter(g => g.is_passing).length
        setCompletionRate(Math.round((passed / gradeData.length) * 100))
      }
    } catch (err) {
      console.error('Failed to fetch admin dashboard data', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading || authLoading) {
    return <DashboardSkeleton />
  }

  return (
    <div className="space-y-6">
      {/* Hero — Admin: slate/amber distinct from student indigo & teacher emerald */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900/80 via-amber-900/30 to-slate-900/80 border border-amber-500/20 p-6 sm:p-8">
        <div className="absolute inset-0 bg-[url('/dots.svg')] opacity-10" />
        <div className="absolute -top-20 -right-20 h-40 w-40 rounded-full bg-amber-500/15 blur-3xl" />
        <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-orange-500/15 blur-3xl" />
        <div className="relative flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-lg font-bold text-white shadow-lg shadow-amber-500/20">
              🛡️
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                {t('admin1.dashboard.greeting', { name: (user as any)?.display_name || (user as any)?.email?.split('@')[0] || 'Admin' })}
              </h1>
              <p className="mt-1 text-white/70 text-sm">{t('admin1.dashboard.subtitle', { users: String(roleCounts.total), courses: String(courseCount), batches: String(activeBatchCount) })}</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs text-white/60">
            <span className="px-2.5 py-1 rounded-full bg-white/10 border border-white/15">{roleCounts.student} Siswa</span>
            <span className="px-2.5 py-1 rounded-full bg-white/10 border border-white/15">{roleCounts.teacher} Guru</span>
          </div>
        </div>
      </div>
      <div>
        <h2 className="text-lg font-semibold text-on-surface">{t('admin1.dashboard.title')}</h2>
        <p className="text-sm text-on-surface-variant">{t('admin1.dashboard.subtitleFallback')}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: t('admin1.dashboard.statStudents'), value: roleCounts.student.toLocaleString(), icon: Users, change: `+${roleCounts.student > 0 ? Math.round(roleCounts.student * 0.05) : 0}`, color: 'text-success' },
          { label: t('admin1.dashboard.statTeachers'), value: roleCounts.teacher.toLocaleString(), icon: GraduationCap, change: `+${roleCounts.teacher > 0 ? Math.round(roleCounts.teacher * 0.1) : 0}`, color: 'text-success' },
          { label: t('admin1.dashboard.statActiveCourses'), value: courseCount.toLocaleString(), icon: BookOpen, change: `+${courseCount > 0 ? Math.round(courseCount * 0.05) : 0}`, color: 'text-success' },
          { label: t('admin1.dashboard.statActiveBatches'), value: activeBatchCount.toLocaleString(), icon: Layers, change: `${activeBatchCount > 0 ? activeBatchCount : 0}`, color: 'text-success' },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <stat.icon className="h-5 w-5 text-primary" />
                <span className={`flex items-center gap-0.5 text-xs ${stat.color}`}>
                  <TrendingUp className="h-3 w-3" /> {stat.change}
                </span>
              </div>
              <p className="text-xl font-bold text-on-surface">{stat.value}</p>
              <p className="text-xs text-muted">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-sm">
              <span>{t('admin1.dashboard.recentRegistrations')}</span>
              <Link href="/admin/users" className="text-xs text-primary">{t('admin1.dashboard.viewAll')}</Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <Inbox className="h-8 w-8 text-muted mb-2" />
                <p className="text-xs text-muted">{t('admin1.dashboard.noRegistrations')}</p>
              </div>
            ) : (
              recentUsers.map((u) => {
                const initial = (u.display_name || u.email || '?')[0]?.toUpperCase() || '?'
                return (
                  <div key={u.id} className="flex items-center justify-between rounded-lg bg-surface-container-low p-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-sm font-bold text-primary-foreground">
                        {initial}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-on-surface">{u.display_name || t('admin1.dashboard.unnamed')}</p>
                        <p className="text-xs text-muted">{u.email || t('admin1.dashboard.noEmail')}</p>
                      </div>
                    </div>
                    <span className="text-xs text-muted">{timeAgo(u.created_at)}</span>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-sm">
              <span>{t('admin1.dashboard.platformStats')}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { label: t('admin1.dashboard.completionRate'), value: `${completionRate}%`, progress: completionRate },
              { label: t('admin1.dashboard.avgGrade'), value: `${avgGrade}%`, progress: avgGrade },
              { label: t('admin1.dashboard.pendingPayments'), value: totalPaymentCount > 0 ? t('admin1.dashboard.pendingCount', { pending: pendingPaymentCount, total: totalPaymentCount }) : '0', progress: totalPaymentCount > 0 ? Math.round((pendingPaymentCount / totalPaymentCount) * 100) : 0 },
              { label: t('admin1.dashboard.activeEnrollments'), value: `${roleCounts.total > 0 ? Math.round((activeEnrollments / roleCounts.total) * 100) : 0}%`, progress: roleCounts.total > 0 ? Math.round((activeEnrollments / roleCounts.total) * 100) : 0 },
            ].map((item) => (
              <div key={item.label}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-on-surface">{item.label}</span>
                  <span className="text-primary font-medium">{item.value}</span>
                </div>
                <div className="h-2 rounded-full bg-surface-container-highest overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent" style={{ width: `${item.progress}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div>
        <div className="h-7 w-48 bg-surface-container-highest rounded mb-2" />
        <div className="h-4 w-64 bg-surface-container-highest rounded" />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex justify-between mb-3">
              <div className="h-5 w-5 bg-surface-container-highest rounded" />
              <div className="h-3 w-16 bg-surface-container-highest rounded" />
            </div>
            <div className="h-6 w-20 bg-surface-container-highest rounded mb-1" />
            <div className="h-3 w-12 bg-surface-container-highest rounded" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-6">
          <div className="h-5 w-36 bg-surface-container-highest rounded mb-4" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 mb-3">
              <div className="h-9 w-9 rounded-full bg-surface-container-highest" />
              <div className="flex-1">
                <div className="h-4 w-28 bg-surface-container-highest rounded mb-1" />
                <div className="h-3 w-36 bg-surface-container-highest rounded" />
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-border bg-surface p-6">
          <div className="h-5 w-28 bg-surface-container-highest rounded mb-4" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="mb-3">
              <div className="flex justify-between mb-1">
                <div className="h-4 w-36 bg-surface-container-highest rounded" />
                <div className="h-4 w-12 bg-surface-container-highest rounded" />
              </div>
              <div className="h-2 w-full bg-surface-container-highest rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
