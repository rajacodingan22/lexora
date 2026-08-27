import { createServerSupabaseClient } from '@/lib/supabase-server'
import { sendEmailServer } from '@/lib/email'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { to, subject, body } = await req.json()
    if (!to || !subject || !body) {
      return NextResponse.json({ error: 'to, subject and body are required' }, { status: 400 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    const isAdmin = profile?.role === 'admin'
    if (!isAdmin && to !== user.email) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const result = await sendEmailServer({ supabase, to, subject, body })
    return NextResponse.json(result)
  } catch (error) {
    console.error('Email API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
