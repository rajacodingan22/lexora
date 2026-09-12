import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { getAccessToken } from '@/lib/drive'

const MAX_VIDEO_BYTES = 500 * 1024 * 1024
const MAX_DOC_BYTES = 50 * 1024 * 1024

const EXT_TO_MIME: Record<string, string[]> = {
  pdf: ['application/pdf'],
  doc: ['application/msword'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ppt: ['application/vnd.ms-powerpoint'],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  xls: ['application/vnd.ms-excel'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  png: ['image/png'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  mp4: ['video/mp4'],
  mov: ['video/quicktime'],
  webm: ['video/webm'],
}

function extOf(name: string): string {
  const parts = name.toLowerCase().split('.')
  return parts.length > 1 ? parts[parts.length - 1] : ''
}

// Langkah 1 (init): server buatkan resumable-upload session ke Drive milik student.
// Browser lalu PUT byte langsung ke Google (tidak lewat Vercel).
// Langkah 2 (complete): server set permission link-share + kembalikan drive_link.
export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await req.json()) as {
      step?: string
      assignmentId?: string
      fileName?: string
      mimeType?: string
      sizeBytes?: number
      fileId?: string
    }

    const { data: tokenRow } = await supabase
      .from('user_drive_tokens')
      .select('encrypted_refresh_token')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!tokenRow) {
      return NextResponse.json({ error: 'Drive not connected', fallback: true }, { status: 400 })
    }

    const accessToken = await getAccessToken(tokenRow.encrypted_refresh_token as string)
    if (!accessToken) return NextResponse.json({ error: 'Token refresh failed' }, { status: 502 })

    if (body.step === 'complete') {
      if (!body.fileId) return NextResponse.json({ error: 'fileId required' }, { status: 400 })
      // Link-share agar guru + teman se-batch bisa preview di dalam Lexora
      await fetch(`https://www.googleapis.com/drive/v3/files/${body.fileId}/permissions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'reader', type: 'anyone' }),
      }).catch(() => {})
      const metaRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${body.fileId}?fields=id,webViewLink,name,mimeType`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      )
      if (!metaRes.ok) return NextResponse.json({ error: 'Drive file not found' }, { status: 404 })
      const meta = (await metaRes.json()) as { id?: string; webViewLink?: string; name?: string; mimeType?: string }
      return NextResponse.json({ drive_file_id: meta.id, drive_link: meta.webViewLink, file_name: meta.name, mime_type: meta.mimeType })
    }

    // ---- init ----
    const { assignmentId, fileName, mimeType, sizeBytes } = body
    if (!assignmentId || !fileName || !mimeType || !sizeBytes) {
      return NextResponse.json({ error: 'assignmentId, fileName, mimeType, sizeBytes required' }, { status: 400 })
    }

    const { data: assignment } = await supabase
      .from('assignments')
      .select('id, submission_kind, allowed_file_types')
      .eq('id', assignmentId)
      .maybeSingle()
    if (!assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })

    const kind = (assignment as { submission_kind?: string }).submission_kind || 'file'
    if (kind === 'text_inline') {
      return NextResponse.json({ error: 'Assignment ini dijawab langsung sebagai teks' }, { status: 400 })
    }

    const cap = kind === 'video' ? MAX_VIDEO_BYTES : MAX_DOC_BYTES
    if (sizeBytes > cap) {
      return NextResponse.json({ error: `File terlalu besar (maks ${Math.round(cap / 1024 / 1024)}MB)` }, { status: 400 })
    }

    const allowed = ((assignment as { allowed_file_types?: string[] }).allowed_file_types || ['pdf']) as string[]
    const ext = extOf(fileName)
    const mimes = EXT_TO_MIME[ext] || []
    const mimeOk = mimes.includes(mimeType) || (kind === 'video' && mimeType.startsWith('video/'))
    if (!allowed.includes(ext) && !mimeOk) {
      return NextResponse.json({ error: `Tipe file tidak diizinkan (diizinkan: ${allowed.join(', ')})` }, { status: 400 })
    }

    const initRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': String(sizeBytes),
      },
      body: JSON.stringify({ name: fileName, mimeType }),
    })
    if (!initRes.ok) {
      return NextResponse.json({ error: 'Gagal membuat sesi upload Drive' }, { status: 502 })
    }
    const sessionUri = initRes.headers.get('location')
    if (!sessionUri) return NextResponse.json({ error: 'Drive tidak mengembalikan sesi upload' }, { status: 502 })

    return NextResponse.json({ sessionUri })
  } catch (e) {
    console.error('[drive/submission-upload] error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
