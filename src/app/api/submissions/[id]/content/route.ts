import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { getAccessToken } from '@/lib/drive'

// Proxy konten submission memakai token Drive MILIK PENGUMPUL (server-side).
// Peminta harus: pemilik, guru pengampu course, atau teman se-batch aktif.
// Mendukung header Range agar video bisa seek.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return new NextResponse('Unauthorized', { status: 401 })
    const { id } = await params

    const admin = createAdminSupabaseClient()
    const { data: sub } = await admin
      .from('submissions')
      .select('id, user_id, assignment_id, file_url, drive_file_id, file_name')
      .eq('id', id)
      .maybeSingle()
    if (!sub) return new NextResponse('Not found', { status: 404 })

    const submission = sub as {
      id: string; user_id: string; assignment_id: string
      file_url: string | null; drive_file_id: string | null; file_name: string | null
    }

    // ---- otorisasi ----
    let allowed = submission.user_id === user.id
    let courseId: string | null = null
    if (!allowed) {
      const { data: asg } = await admin
        .from('assignments')
        .select('course_id')
        .eq('id', submission.assignment_id)
        .maybeSingle()
      courseId = (asg as { course_id?: string } | null)?.course_id ?? null
      if (courseId) {
        const { data: teacherRow } = await admin
          .from('course_teachers')
          .select('teacher:teachers!inner(user_id)')
          .eq('course_id', courseId)
          .eq('teachers.user_id', user.id)
          .maybeSingle()
        if (teacherRow) {
          allowed = true
        } else {
          const { data: me } = await admin
            .from('enrollments')
            .select('batch_id')
            .eq('course_id', courseId)
            .eq('user_id', user.id)
            .eq('status', 'active')
            .maybeSingle()
          const myBatch = (me as { batch_id?: string | null } | null)?.batch_id ?? null
          if (myBatch) {
            const { data: them } = await admin
              .from('enrollments')
              .select('id')
              .eq('course_id', courseId)
              .eq('user_id', submission.user_id)
              .eq('status', 'active')
              .eq('batch_id', myBatch)
              .maybeSingle()
            if (them) allowed = true
          }
        }
      }
    }
    if (!allowed) return new NextResponse('Forbidden', { status: 403 })

    // ---- file titipan Supabase: redirect ke signed URL singkat ----
    if (!submission.drive_file_id) {
      if (!submission.file_url) return new NextResponse('No content', { status: 404 })
      const path = submission.file_url.replace(/^submissions\//, '')
      const { data: signed, error } = await admin.storage
        .from('submissions')
        .createSignedUrl(path, 120)
      if (error || !signed?.signedUrl) return new NextResponse('Failed to sign URL', { status: 502 })
      return NextResponse.redirect(signed.signedUrl, 302)
    }

    // ---- file Drive milik pengumpul ----
    const { data: tokenRow } = await admin
      .from('user_drive_tokens')
      .select('encrypted_refresh_token')
      .eq('user_id', submission.user_id)
      .maybeSingle()
    if (!tokenRow) return new NextResponse('Owner Drive not connected', { status: 410 })
    const accessToken = await getAccessToken(tokenRow.encrypted_refresh_token as string)
    if (!accessToken) return new NextResponse('Token refresh failed', { status: 502 })

    const metaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${submission.drive_file_id}?fields=mimeType,name`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    if (!metaRes.ok) return new NextResponse('File not found', { status: 404 })
    const meta = (await metaRes.json()) as { mimeType: string; name: string }

    const range = req.headers.get('range') ?? undefined
    const fileRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${submission.drive_file_id}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}`, ...(range ? { Range: range } : {}) } },
    )
    if (!fileRes.ok && fileRes.status !== 206) {
      return new NextResponse('Failed to fetch file', { status: 502 })
    }

    const headers = new Headers()
    headers.set('Content-Type', meta.mimeType)
    headers.set('Content-Disposition', `inline; filename="${(submission.file_name || meta.name).replace(/"/g, '')}"`)
    headers.set('Accept-Ranges', 'bytes')
    headers.set('Cache-Control', 'private, max-age=3600')
    const contentRange = fileRes.headers.get('content-range')
    if (contentRange) headers.set('Content-Range', contentRange)
    const contentLength = fileRes.headers.get('content-length')
    if (contentLength) headers.set('Content-Length', contentLength)

    return new NextResponse(fileRes.body, { status: fileRes.status === 206 ? 206 : 200, headers })
  } catch (e) {
    console.error('[submissions/content] error', e)
    return new NextResponse('Internal error', { status: 500 })
  }
}
