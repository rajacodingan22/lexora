import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const { email, password, displayName, role } = await req.json()

    // Input validation
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    const supabase = await createServerSupabaseClient()

    // Respect the auth_allow_registration system setting (default: enabled)
    const { data: settings } = await supabase
      .from('system_settings')
      .select('key, value')
    const regSetting = (settings ?? []).find((s) => s.key === 'auth_allow_registration')
    if (regSetting && String(regSetting.value) === 'false') {
      return NextResponse.json({ error: 'Registration is currently disabled' }, { status: 403 })
    }

    // Role dari client DIIGNORASI: pendaftaran publik selalu role student
    // (guard trigger users_guard_role_status juga memaksa student di DB).
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName, role: 'student' },
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/verifikasi-email`,
      },
    })

    if (error) {
      console.error('Register API error:', error)
      return NextResponse.json({ error: error.message || 'Registration failed' }, { status: 400 })
    }

    if (data?.user) {
      await supabase.from('users').upsert({
        id: data.user.id,
        email,
        display_name: displayName,
        role: 'student',
        status: 'active',
      }, { onConflict: 'id' })
    }

    return NextResponse.json({ user: data.user })
  } catch (error) {
    console.error('Register API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
