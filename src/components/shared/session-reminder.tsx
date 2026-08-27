'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase-client'
import { useAuth } from '@/lib/auth-context'
import { useI18n } from '@/lib/i18n/client'
import { getMeetingPhase, minutesUntilJoinable } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Video, X, Sparkles, Clock, Bell } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { LiveSession } from '@/types'

interface Props {
  role: 'student' | 'teacher'
}

function getWelcomeBackMessage(lastLogin: string | null, lang: string): string | null {
  if (!lastLogin) return null
  const now = Date.now()
  const last = new Date(lastLogin).getTime()
  const diffMs = now - last
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (lang === 'id') {
    if (diffHours < 1) return 'Selamat datang kembali! ⚡ Kamu baru saja pergi sebentar.'
    if (diffHours < 24) return `Hore, kamu balik lagi! 🎉 Sudah ${diffHours} jam nih sejak terakhir kali. Semangat belajar ya! 💪`
    if (diffDays === 1) return 'Selamat pagi/siang/sore! ☀️ Kangen kamu nih! Sudah sehari belum login. Yuk lanjut belajar! 🚀'
    if (diffDays <= 7) return `Wah, sudah ${diffDays} hari! 🔥 Senang kamu balik! Jangan khawatir, kita mulai dari mana aja. Semangat! 💪✨`
    return `Lama sekali tidak ketemu! 😄 Sudah ${diffDays} hari nih. Tapi nggak apa-apa, mulai sekarang aja ya! Kamu pasti bisa! 🔥`
  }
  // English fallback
  if (diffHours < 1) return 'Welcome back! ⚡ You just stepped away for a moment.'
  if (diffHours < 24) return `Great to see you again! 🎉 It's been ${diffHours} hours. Let's keep the momentum going! 💪`
  if (diffDays === 1) return 'Good day! ☀️ We missed you! It\'s been a day. Ready to continue learning? 🚀'
  if (diffDays <= 7) return `It's been ${diffDays} days! 🔥 Welcome back! Don\'t worry, we can pick up right where you left off. You got this! 💪✨`
  return `Long time no see! 😄 It's been ${diffDays} days. But no worries — today is a great day to start again! You can do it! 🔥`
}

export function SessionReminder({ role }: Props) {
  const { user } = useAuth()
  const { t, lang } = useI18n()
  const supabase = createClient()

  const [activeSession, setActiveSession] = useState<LiveSession | null>(null)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [countdown, setCountdown] = useState(0)
  const [welcomeMsg, setWelcomeMsg] = useState<string | null>(null)
  const [showWelcome, setShowWelcome] = useState(false)
  const [coursesMap, setCoursesMap] = useState<Record<string, { title: string; flag?: string }>>({})

  const checkSessions = useCallback(async () => {
    if (!user) return
    try {
      // Get enrolled courses (student) or taught courses (teacher)
      let courseIds: string[] = []

      if (role === 'student') {
        const { data: enrollments } = await supabase
          .from('enrollments')
          .select('course_id')
          .eq('user_id', user.id)
          .eq('status', 'active')
        courseIds = (enrollments || []).map((e: any) => e.course_id)
      } else {
        const { data: teacherRow } = await supabase
          .from('teachers')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle()
        if (teacherRow) {
          const { data: cts } = await supabase
            .from('course_teachers')
            .select('course_id')
            .eq('teacher_id', teacherRow.id)
          courseIds = (cts || []).map((ct: any) => ct.course_id)
        }
      }

      if (courseIds.length === 0) return

      // Fetch course titles for display
      const { data: courseData } = await supabase
        .from('courses')
        .select('id, title, language_code')
        .in('id', courseIds)
      const cMap: Record<string, { title: string; flag?: string }> = {}
      for (const c of courseData || []) {
        const title = (c.title as any)?.id || (c.title as any)?.en || 'Kelas'
        cMap[c.id] = { title }
      }
      setCoursesMap(cMap)

      // Get upcoming/ongoing sessions in the next 10 minutes
      const now = new Date()
      const windowEnd = new Date(now.getTime() + 10 * 60 * 1000)
      const { data: sessions } = await supabase
        .from('live_sessions')
        .select('*')
        .in('course_id', courseIds)
        .in('status', ['scheduled', 'ongoing'])
        .gte('starts_at', new Date(now.getTime() - 5 * 60 * 1000).toISOString())
        .lte('starts_at', windowEnd.toISOString())
        .order('starts_at', { ascending: true })

      const nowDate = new Date()
      for (const s of (sessions || []) as LiveSession[]) {
        if (dismissed.has(s.id)) continue
        const phase = getMeetingPhase(s, nowDate)
        if (phase === 'upcoming' || phase === 'ongoing') {
          setActiveSession(s)
          const mins = minutesUntilJoinable(s, nowDate)
          setCountdown(mins)
          return
        }
      }
      setActiveSession(null)
    } catch {}
  }, [user, role, supabase, dismissed])

  // Check welcome back on first load
  useEffect(() => {
    if (!user) return
    const lastLoginKey = `last_login_${user.id}`
    const lastLogin = localStorage.getItem(lastLoginKey)
    const msg = getWelcomeBackMessage(lastLogin, lang)
    if (msg) {
      setWelcomeMsg(msg)
      setShowWelcome(true)
      setTimeout(() => setShowWelcome(false), 8000)
    }
    localStorage.setItem(lastLoginKey, new Date().toISOString())
  }, [user, lang])

  // Poll for sessions every 30s
  useEffect(() => {
    checkSessions()
    const interval = setInterval(checkSessions, 30000)
    return () => clearInterval(interval)
  }, [checkSessions])

  // Countdown timer
  useEffect(() => {
    if (!activeSession || countdown <= 0) return
    const interval = setInterval(() => {
      const mins = minutesUntilJoinable(activeSession)
      setCountdown(mins)
      if (mins <= 0) clearInterval(interval)
    }, 10000)
    return () => clearInterval(interval)
  }, [activeSession, countdown])

  const isJoinable = activeSession ? minutesUntilJoinable(activeSession) <= 0 : false
  const courseInfo = activeSession ? coursesMap[activeSession.course_id] : null

  return (
    <>
      {/* Welcome Back Toast */}
      <AnimatePresence>
        {showWelcome && welcomeMsg && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] max-w-md w-[calc(100vw-2rem)]"
          >
            <div className="rounded-2xl border border-primary/20 bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 p-4 shadow-xl backdrop-blur-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-500">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-on-surface">{welcomeMsg}</p>
                </div>
                <button onClick={() => setShowWelcome(false)} className="text-muted hover:text-on-surface shrink-0">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Session Reminder Popup — CENTER SCREEN (modal) */}
      <AnimatePresence>
        {activeSession && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setDismissed(prev => new Set(prev).add(activeSession.id))}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md"
            >
            <div className={`rounded-2xl border p-4 shadow-2xl backdrop-blur-sm ${
              isJoinable
                ? 'border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-emerald-500/5'
                : 'border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/5'
            }`}>
              <div className="flex items-start gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                  isJoinable
                    ? 'bg-gradient-to-br from-emerald-500 to-teal-500'
                    : 'bg-gradient-to-br from-amber-500 to-orange-500'
                }`}>
                  {isJoinable ? (
                    <Video className="h-5 w-5 text-white" />
                  ) : (
                    <Bell className="h-5 w-5 text-white animate-bounce" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  {isJoinable ? (
                    <>
                      <p className="text-sm font-bold text-emerald-400">🔥 Kelas sudah dimulai!</p>
                      <p className="text-xs text-on-surface mt-0.5">
                        {activeSession.title || 'Sesi Kelas'}
                        {courseInfo && <span className="text-muted"> • {courseInfo.title}</span>}
                      </p>
                      <p className="text-xs text-on-surface-variant mt-1">
                        Yuk join sekarang! Jangan sampai ketinggalan ya! 💪✨
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-bold text-amber-400">⏰ Persiapan kelas!</p>
                      <p className="text-xs text-on-surface mt-0.5">
                        {activeSession.title || 'Sesi Kelas'}
                        {courseInfo && <span className="text-muted"> • {courseInfo.title}</span>}
                      </p>
                      <p className="text-xs text-on-surface-variant mt-1 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Mulai dalam {countdown} menit lagi. Siapkan diri kamu ya! 🎯
                      </p>
                    </>
                  )}
                </div>
                <button onClick={() => setDismissed(prev => new Set(prev).add(activeSession.id))} className="text-muted hover:text-on-surface shrink-0">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-3 flex gap-2">
                {isJoinable && activeSession.meeting_link ? (
                  <a href={activeSession.meeting_link} target="_blank" rel="noopener noreferrer" className="flex-1">
                    <Button size="sm" className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-600 hover:to-teal-600">
                      <Video className="mr-1.5 h-3.5 w-3.5" /> Join Sekarang 🔥
                    </Button>
                  </a>
                ) : (
                  <Button size="sm" variant="outline" className="flex-1" disabled>
                    <Clock className="mr-1.5 h-3.5 w-3.5" /> {countdown > 0 ? `Tunggu ${countdown} menit` : 'Link belum tersedia'}
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setDismissed(prev => new Set(prev).add(activeSession.id))}>
                  Nanti aja
                </Button>
              </div>
            </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
