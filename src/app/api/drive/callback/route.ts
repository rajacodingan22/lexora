import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { encrypt } from '@/lib/drive-crypto'

export async function GET(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams, origin } = new URL(req.url)
    const code = searchParams.get('code')
    if (!code) return NextResponse.redirect(`${origin}/student/profil?drive=error`)

    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    if (!clientId || !clientSecret) return NextResponse.redirect(`${origin}/student/profil?drive=not_configured`)

    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${origin}/api/drive/callback`

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })
    if (!tokenRes.ok) {
      const errText = await tokenRes.text().catch(() => '')
      console.error('[drive/callback] token exchange failed', tokenRes.status, errText.slice(0, 200))
      return NextResponse.redirect(`${origin}/student/profil?drive=token_error`)
    }
    const tokens = (await tokenRes.json()) as { refresh_token?: string; access_token?: string }

    if (!tokens.refresh_token) {
      return NextResponse.redirect(`${origin}/student/profil?drive=no_refresh`)
    }

    // Get user email from Google
    let driveEmail: string | null = null
    try {
      const uiRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      })
      if (uiRes.ok) {
        const ui = (await uiRes.json()) as { email?: string }
        driveEmail = ui.email ?? null
      }
    } catch {}

    // Upsert encrypted refresh token
    const { error } = await supabase
      .from('user_drive_tokens')
      .upsert({
        user_id: user.id,
        provider: 'google',
        encrypted_refresh_token: encrypt(tokens.refresh_token),
        drive_email: driveEmail,
        scope: 'drive.file',
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })

    if (error) {
      console.error('[drive/callback] upsert failed', error.message)
      return NextResponse.redirect(`${origin}/student/profil?drive=db_error`)
    }

    return NextResponse.redirect(`${origin}/student/profil?drive=connected`)
  } catch (e) {
    console.error('[drive/callback] error', e)
    return NextResponse.redirect(`${origin}/student/profil?drive=internal_error`)
  }
}
