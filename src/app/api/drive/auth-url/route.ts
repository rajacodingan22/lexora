import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import crypto from 'crypto'

export async function GET(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const clientId = process.env.GOOGLE_CLIENT_ID
    if (!clientId) return NextResponse.json({ error: 'Google Drive not configured' }, { status: 503 })

    const origin = new URL(req.url).origin
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${origin}/api/drive/callback`
    const state = crypto.randomBytes(16).toString('hex')

    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    url.searchParams.set('client_id', clientId)
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('scope', 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email')
    url.searchParams.set('access_type', 'offline')
    url.searchParams.set('prompt', 'consent')
    url.searchParams.set('state', state)
    url.searchParams.set('login_hint', user.email || '')

    return NextResponse.json({ url: url.toString(), state })
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
