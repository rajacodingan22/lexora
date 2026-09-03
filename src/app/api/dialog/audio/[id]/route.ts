import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { getAccessToken } from '@/lib/drive'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id } = await params
    const url = new URL(req.url)
    const turnIdx = parseInt(url.searchParams.get('turn') || '0', 10)

    const { data: session } = await supabase.from('dialog_sessions').select('user_id, batch_id, task_id, turns').eq('id', id).single()
    if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // authz: owner OR teacher of course OR admin
    const isOwner = session.user_id === user.id
    let isTeacher = false
    let isAdmin = false
    if (!isOwner) {
      const { data: adminRes } = await supabase.rpc('is_admin')
      isAdmin = !!adminRes
      if (!isAdmin) {
        // check teacher
        const { data: enrollment } = await supabase.from('enrollments').select('course_id').eq('user_id', session.user_id).eq('batch_id', session.batch_id).maybeSingle()
        if (enrollment) {
          const { data: teacherRow } = await supabase.from('teachers').select('id').eq('user_id', user.id).maybeSingle()
          if (teacherRow) {
            const { data: ct } = await supabase.from('course_teachers').select('teacher_id').eq('course_id', enrollment.course_id).eq('teacher_id', teacherRow.id).maybeSingle()
            isTeacher = !!ct
          }
        }
      }
      if (!isOwner && !isTeacher && !isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const turns = (session.turns as Array<Record<string, unknown>>) || []
    const turn = turns[turnIdx] as Record<string, unknown> | undefined
    const drive_file_id = turn?.drive_file_id as string | undefined
    if (!drive_file_id) return NextResponse.json({ error: 'No audio for this turn' }, { status: 404 })

    // Teacher/admin path must read the STUDENT's token via admin client
    // (RLS on user_drive_tokens only allows the owner, so the teacher call 404s otherwise).
    const tokenClient = (isTeacher || isAdmin) ? createAdminSupabaseClient() : supabase
    const { data: tokenRow } = await tokenClient.from('user_drive_tokens').select('encrypted_refresh_token').eq('user_id', session.user_id).maybeSingle()
    if (!tokenRow) return NextResponse.json({ error: 'Drive not connected' }, { status: 404 })
    const accessToken = await getAccessToken(tokenRow.encrypted_refresh_token)
    if (!accessToken) return NextResponse.json({ error: 'Drive auth failed' }, { status: 502 })

    const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${drive_file_id}?fields=mimeType,name`, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!metaRes.ok) return NextResponse.json({ error: 'Drive file not found' }, { status: 404 })
    const meta = (await metaRes.json()) as { mimeType?: string; name?: string }
    const streamRes = await fetch(`https://www.googleapis.com/drive/v3/files/${drive_file_id}?alt=media`, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!streamRes.ok || !streamRes.body) return NextResponse.json({ error: 'Failed to stream' }, { status: 502 })
    const buf = Buffer.from(await streamRes.arrayBuffer())
    return new NextResponse(buf, {
      headers: {
        'Content-Type': meta.mimeType || 'audio/webm',
        'Content-Disposition': `inline; filename="${meta.name || 'dialog.webm'}"`,
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (e) {
    console.error('[dialog/audio] error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
