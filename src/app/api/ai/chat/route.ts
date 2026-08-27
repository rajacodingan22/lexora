import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user } } = await supabase.auth.getUser()
    const { data: { session } } = await supabase.auth.getSession()
    if (!user || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const internalSecret = process.env.AI_CHAT_INTERNAL_SECRET
    if (!internalSecret) {
      console.error('AI_CHAT_INTERNAL_SECRET is not configured')
      return NextResponse.json({ error: 'AI service is not configured' }, { status: 503 })
    }

    const { data: settings } = await supabase
      .from('system_settings')
      .select('key, value')
    const aiSetting = (settings ?? []).find((s) => s.key === 'ai_enabled')
    if (aiSetting && String(aiSetting.value) === 'false') {
      return NextResponse.json({ error: 'AI chatbot is disabled' }, { status: 403 })
    }

    const { action, message, language, level, courseContext, sessionId, batchId } = await req.json()

    if (action !== 'chat') {
      // greet / history / clear — tidak butuh message
    } else if (!message || typeof message !== 'string' || message.trim().length === 0 || message.length > 4000) {
      return NextResponse.json({ error: 'Message must be between 1 and 4000 characters' }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const edgeResponse = await fetch(`${supabaseUrl}/functions/v1/ai-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        'x-ai-internal-secret': internalSecret,
      },
      body: JSON.stringify({
        action: action || 'chat',
        message: typeof message === 'string' ? message.trim() : '',
        language: language || '',
        level: level || '',
        courseContext: courseContext || '',
        sessionId: sessionId || '',
        batchId: batchId || '',
      }),
    })

    if (!edgeResponse.ok) {
      const errData = await edgeResponse.json().catch(() => ({}))
      return NextResponse.json(
        { error: errData.detail || errData.error || 'AI service error' },
        { status: edgeResponse.status }
      )
    }

    const data = await edgeResponse.json()
    const payload: Record<string, unknown> = { reply: data.reply }
    if (data.sessionId) payload.sessionId = data.sessionId
    if (data.greeting) payload.greeting = data.greeting
    if (data.history) payload.history = data.history
    if (data.offer) payload.offer = data.offer
    return NextResponse.json(payload)
  } catch (error) {
    console.error('AI chat API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}