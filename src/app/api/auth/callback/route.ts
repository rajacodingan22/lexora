import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  try {
    const { searchParams, origin } = new URL(req.url)
    const code = searchParams.get('code')
    const next = searchParams.get('next') ?? '/'

    if (code) {
      const supabase = await createServerSupabaseClient()

      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (!error) {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: existingProfile } = await supabase
            .from('users')
            .select('id')
            .eq('id', user.id)
            .maybeSingle()

          if (!existingProfile) {
            await supabase.from('users').upsert({
              id: user.id,
              email: user.email,
              display_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
              role: 'student',
              status: 'active',
            }, { onConflict: 'id' })
          }

          const { data: profile } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .maybeSingle()

          const role = profile?.role || 'student'
          const dashboard = role === 'teacher'
            ? '/teacher/dashboard'
            : role === 'admin'
              ? '/admin/dashboard'
              : '/student/dashboard'

          return NextResponse.redirect(`${origin}${dashboard}`)
        }
        // Validate next is a safe relative path: must start with '/' and not contain //, :, \, or .
        const isSafeNext = typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') && !next.includes(':') && !next.includes('\\') && !next.includes('..')
        const safeNext = isSafeNext ? next : '/'
        return NextResponse.redirect(`${origin}${safeNext}`)
      }
    }

    return NextResponse.redirect(`${origin}?error=auth_callback_error`)
  } catch (error) {
    console.error('Auth callback error:', error)
    return NextResponse.redirect(`${origin}?error=internal_error`)
  }
}
