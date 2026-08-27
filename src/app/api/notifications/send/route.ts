import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const apiKey = req.headers.get('x-api-key')
    const configuredKey = process.env.NOTIFICATION_API_KEY
    if (!configuredKey) {
      return NextResponse.json({ error: 'Notification service not configured' }, { status: 501 })
    }
    if (!apiKey || apiKey !== configuredKey) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { user_id, sender_id, type, title, body, link, template_key, params } = await req.json()

    if (!user_id || typeof user_id !== 'string') {
      return NextResponse.json({ error: 'user_id is required' }, { status: 400 })
    }
    if (typeof title !== 'string' || title.length > 255) {
      return NextResponse.json({ error: 'title is required and must be under 255 characters' }, { status: 400 })
    }

    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase
      .from('notifications')
      .insert({
        user_id,
        sender_id: sender_id || null,
        type: type || 'info',
        title: title || '',
        body: body || '',
        link: link || '',
        template_key: template_key || null,
        params: params || null,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ data })
  } catch (_error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
