import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Respect the notif_push_enabled system setting (default: enabled)
    const { data: settings } = await supabase
      .from('system_settings')
      .select('key, value')
    const pushSetting = (settings ?? []).find((s) => s.key === 'notif_push_enabled')
    if (pushSetting && String(pushSetting.value) === 'false') {
      return NextResponse.json({ count: 0 })
    }

    // Fetch user profile fields from the public users table
    const { data: userRecord } = await supabase
      .from('users')
      .select('role, photo_url, display_name')
      .eq('id', user.id)
      .single()

    let newCount = 0
    const isTeacher = userRecord?.role === 'teacher'

    if (isTeacher) {
      const { data: teacher } = await supabase
        .from('teachers')
        .select('id, headline, bio')
        .eq('user_id', user.id)
        .maybeSingle()

      if (teacher) {
        const profileComplete = teacher.headline?.trim() && teacher.bio?.trim()

        const { count: langCount } = await supabase
          .from('teacher_languages')
          .select('*', { count: 'exact', head: true })
          .eq('teacher_id', teacher.id)

        const hasLanguages = !!langCount && langCount > 0

        if (profileComplete && hasLanguages) {
          await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('type', 'info').eq('is_read', false)
        } else {
          const { count: existing } = await supabase
            .from('notifications').select('*', { count: 'exact', head: true })
            .eq('user_id', user.id).eq('type', 'info').eq('is_read', false)
          if (!existing) {
            await supabase.from('notifications').insert({
              user_id: user.id, sender_id: user.id, type: 'info',
              template_key: 'profileTeacherIncomplete',
              title: 'Lengkapi Profil Guru',
              body: 'Lengkapi headline, bio, dan bahasa yang Anda ajarkan untuk menarik lebih banyak siswa.',
              link: '/teacher/profil',
            })
            newCount++
          }
        }
      }
    } else {
      const { data: enrollments } = await supabase
        .from('enrollments').select('course_id, teacher_id')
        .eq('user_id', user.id).eq('status', 'active')

      const enrollList = (enrollments || []) as { course_id: string; teacher_id: string | null }[]
      const courseIds = enrollList.map((e) => e.course_id)
      const teacherByCourse = new Map<string, string | null>()
      for (const e of enrollList) {
        if (!teacherByCourse.has(e.course_id)) teacherByCourse.set(e.course_id, e.teacher_id)
      }

      // ── Student: pending assignments ──
      if (courseIds.length > 0) {
        const soon = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
        const { data: pendingAssignments } = await supabase
          .from('assignments').select('id, course_id, teacher_id').in('course_id', courseIds).lte('due_date', soon)

        const visibleAssignments = (pendingAssignments || []).filter((a) => {
          const tid = teacherByCourse.get(a.course_id) ?? null
          if (!tid || !a.teacher_id) return true
          return a.teacher_id === tid
        })

        if (visibleAssignments.length > 0) {
          const { count: existing } = await supabase
            .from('notifications').select('*', { count: 'exact', head: true })
            .eq('user_id', user.id).eq('type', 'assignment').eq('is_read', false)
          if (!existing) {
            await supabase.from('notifications').insert({
              user_id: user.id, sender_id: user.id, type: 'assignment',
              template_key: 'assignmentPending',
              title: 'Tugas Menunggu',
              body: 'Anda memiliki tugas yang perlu segera dikerjakan.',
              link: '/student/kursus',
            })
            newCount++
          }
        } else {
          await supabase.from('notifications').update({ is_read: true })
            .eq('user_id', user.id).eq('type', 'assignment').eq('is_read', false)
        }

        // ── Student: upcoming zoom sessions ──
        const now = new Date().toISOString()
        const dayAhead = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        const { data: upcomingSessions } = await supabase
          .from('live_sessions').select('id, course_id, teacher_id').in('course_id', courseIds).gte('starts_at', now).lte('starts_at', dayAhead)

        const visibleSessions = (upcomingSessions || []).filter((s) => {
          const tid = teacherByCourse.get(s.course_id) ?? null
          if (!tid || !s.teacher_id) return true
          return s.teacher_id === tid
        })

        if (visibleSessions.length > 0) {
          const { count: existing } = await supabase
            .from('notifications').select('*', { count: 'exact', head: true })
            .eq('user_id', user.id).eq('type', 'meeting').eq('is_read', false)
          if (!existing) {
            await supabase.from('notifications').insert({
              user_id: user.id, sender_id: user.id, type: 'meeting',
              template_key: 'sessionUpcoming',
              title: 'Sesi Akan Dimulai',
              body: 'Ada sesi Zoom yang akan dimulai dalam waktu dekat.',
              link: '/student/kalender',
            })
            newCount++
          }
        } else {
          await supabase.from('notifications').update({ is_read: true })
            .eq('user_id', user.id).eq('type', 'meeting').eq('is_read', false)
        }
      }

      // ── Student: incomplete profile ──
      if (userRecord?.photo_url && userRecord?.display_name) {
        await supabase.from('notifications').update({ is_read: true })
          .eq('user_id', user.id).eq('type', 'info').eq('is_read', false)
      } else {
        const { count: existing } = await supabase
          .from('notifications').select('*', { count: 'exact', head: true })
          .eq('user_id', user.id).eq('type', 'info').eq('is_read', false)
        if (!existing) {
          await supabase.from('notifications').insert({
            user_id: user.id, sender_id: user.id, type: 'info',
            template_key: 'profileStudentIncomplete',
            title: 'Lengkapi Profil',
            body: 'Tambahkan foto profil dan nama untuk pengalaman yang lebih personal.',
            link: '/student/profil',
          })
          newCount++
        }
      }
    }

    return NextResponse.json({ count: newCount })
  } catch (_error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
