import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { normalizeZenModel, zenEndpointFor, zenText } from '@/lib/zen'

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

    const { data: isAdmin } = await supabase.rpc('is_admin')
    if (!isAdmin) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })

    const admin = createAdminSupabaseClient()
    const { data: settings } = await admin
      .from('system_settings')
      .select('key, value')
      .in('key', ['ai_api_endpoint', 'ai_api_key', 'ai_model', 'ai_enabled'])
    const map: Record<string, string> = {}
    for (const row of settings ?? []) map[row.key] = String(row.value)

    if (map.ai_enabled === 'false') {
      return NextResponse.json({ ok: false, error: 'AI dimatikan (ai_enabled=false)' })
    }
    if (!map.ai_api_key) {
      return NextResponse.json({ ok: false, error: 'ai_api_key belum diisi' })
    }

    const model = normalizeZenModel(map.ai_model)
    const endpoint = zenEndpointFor(model, map.ai_api_endpoint)
    const reply = await zenText({
      apiKey: map.ai_api_key,
      model,
      endpointOverride: map.ai_api_endpoint,
      system: 'You are a connection test. Reply with exactly: OK',
      user: 'Reply with exactly: OK',
      maxTokens: 20,
      temperature: 0,
      timeoutMs: 30000,
      logTag: 'ai-test',
    })

    if (!reply) {
      return NextResponse.json({
        ok: false,
        model,
        endpoint,
        error: 'Provider tidak menjawab (cek server log untuk detail). Kemungkinan: key salah / model tidak didukung / belum ada billing.',
      })
    }
    return NextResponse.json({ ok: true, model, endpoint, reply: reply.slice(0, 200) })
  } catch (e) {
    console.error('[ai-test] error', e)
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 })
  }
}
