import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const taskId = url.searchParams.get('taskId')
    const sessionId = url.searchParams.get('sessionId')
    if (!taskId && !sessionId) return NextResponse.json({ error: 'taskId or sessionId required' }, { status: 400 })

    let query = supabase.from('dialog_sessions').select('*').eq('user_id', user.id)
    if (sessionId) query = query.eq('id', sessionId)
    if (taskId) query = query.eq('task_id', taskId)
    query = query.order('created_at', { ascending: false }).limit(1)

    const { data: session } = await query.maybeSingle()
    if (!session) return NextResponse.json({ session: null })

    // check expiry
    const now = new Date()
    if (session.status === 'active' && session.ends_at) {
      const ends = new Date(session.ends_at)
      if (ends <= now) {
        await supabase.from('dialog_sessions').update({ status: 'expired' }).eq('id', session.id)
        session.status = 'expired'
      }
    }

    const remainingSec = session.ends_at ? Math.max(0, Math.ceil((new Date(session.ends_at).getTime() - now.getTime()) / 1000)) : null
    const isExpired = session.ends_at ? new Date(session.ends_at) <= now : false

    return NextResponse.json({ session, remainingSec, isExpired })
  } catch (e) {
    console.error('[dialog/session] error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
