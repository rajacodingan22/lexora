import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data } = await supabase
      .from('user_drive_tokens')
      .select('drive_email, connected_at')
      .eq('user_id', user.id)
      .maybeSingle()

    return NextResponse.json({
      connected: !!data,
      email: (data as { drive_email?: string } | null)?.drive_email ?? null,
      connected_at: (data as { connected_at?: string } | null)?.connected_at ?? null,
    })
  } catch {
    return NextResponse.json({ connected: false, email: null })
  }
}
