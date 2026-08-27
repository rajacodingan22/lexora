import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { decrypt } from '@/lib/drive-crypto'

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: tokenRow } = await supabase
      .from('user_drive_tokens')
      .select('encrypted_refresh_token')
      .eq('user_id', user.id)
      .maybeSingle()

    // Revoke Google token (best effort)
    if (tokenRow) {
      try {
        const refreshToken = decrypt(tokenRow.encrypted_refresh_token)
        await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: refreshToken }),
        })
      } catch {}
    }

    // Delete token row (RLS: own only)
    const { error } = await supabase
      .from('user_drive_tokens')
      .delete()
      .eq('user_id', user.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true, disconnected: true })
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
