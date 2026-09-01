import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { decrypt } from '@/lib/drive-crypto'

async function getAccessToken(refreshTokenEncrypted: string): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  const refreshToken = decrypt(refreshTokenEncrypted)
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
  })
  if (!res.ok) return null
  const data = (await res.json()) as { access_token?: string }
  return data.access_token ?? null
}

async function uploadToDrive(accessToken: string, audioBuffer: Buffer, mimeType: string, fileName: string) {
  const q = encodeURIComponent(`name='Lexora' and mimeType='application/vnd.google-apps.folder' and trashed=false`)
  const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  let folderId: string | null = null
  if (searchRes.ok) {
    const search = (await searchRes.json()) as { files?: { id: string }[] }
    folderId = search.files?.[0]?.id ?? null
  }
  if (!folderId) {
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Lexora', mimeType: 'application/vnd.google-apps.folder' }),
    })
    if (createRes.ok) { const f = (await createRes.json()) as { id?: string }; folderId = f.id ?? null }
  }
  const boundary = 'lexora' + crypto.randomUUID().replace(/-/g, '')
  const metadata = JSON.stringify({ name: fileName, ...(folderId ? { parents: [folderId] } : {}), mimeType })
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    audioBuffer,
    Buffer.from(`\r\n--${boundary}--`),
  ])
  const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
  if (!uploadRes.ok) return { drive_file_id: null, drive_link: null }
  const uploaded = (await uploadRes.json()) as { id?: string; webViewLink?: string }
  return { drive_file_id: uploaded.id ?? null, drive_link: uploaded.webViewLink ?? null }
}

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { activityId, taskId, batchId, activityProgressId, transcript, wordScores, autoScore, audioBase64, mimeType: clientMimeType } = await req.json()
    if (!activityId) return NextResponse.json({ error: 'activityId required' }, { status: 400 })

    // Upload audio to Drive if provided
    let audio_drive_file_id: string | null = null
    let audio_drive_link: string | null = null
    if (audioBase64) {
      try {
        const { data: tokenRow } = await supabase
          .from('user_drive_tokens')
          .select('encrypted_refresh_token')
          .eq('user_id', user.id)
          .maybeSingle()
        if (tokenRow) {
          const accessToken = await getAccessToken(tokenRow.encrypted_refresh_token)
          if (accessToken) {
            const audioBuffer = Buffer.from(String(audioBase64), 'base64')
            const mimeType = clientMimeType || 'audio/webm'
            const result = await uploadToDrive(accessToken, audioBuffer, mimeType, `speaking-review-${Date.now()}.webm`)
            audio_drive_file_id = result.drive_file_id
            audio_drive_link = result.drive_link
          }
        }
      } catch (e) { console.error('[speaking-review] drive upload error', e) }
    }

    // Get activity progress ID if not provided
    let progressId = activityProgressId
    if (!progressId) {
      const { data: existing } = await supabase
        .from('student_activity_progress')
        .select('id')
        .eq('user_id', user.id)
        .eq('activity_id', activityId)
        .eq('batch_id', batchId || '')
        .maybeSingle()
      progressId = existing?.id
    }

    // Insert submission
    const { data: submission, error: insertErr } = await supabase
      .from('speaking_review_submissions')
      .insert({
        activity_progress_id: progressId || null,
        user_id: user.id,
        activity_id: activityId,
        task_id: taskId,
        batch_id: batchId,
        transcript,
        word_scores: wordScores,
        auto_score: autoScore,
        audio_drive_file_id,
        audio_drive_link,
        review_status: 'pending',
      })
      .select('id')
      .single()

    if (insertErr) {
      console.error('[speaking-review] insert error', insertErr)
      return NextResponse.json({ error: 'Failed to save submission' }, { status: 500 })
    }

    // Notify teachers of this course
    try {
      const { data: enrollment } = await supabase
        .from('enrollments')
        .select('course_id')
        .eq('user_id', user.id)
        .eq('batch_id', batchId)
        .maybeSingle()

      if (enrollment) {
        const { data: teachers } = await supabase
          .from('course_teachers')
          .select('teacher_id')
          .eq('course_id', enrollment.course_id)

        if (teachers) {
          const { data: studentProfile } = await supabase
            .from('users')
            .select('display_name')
            .eq('id', user.id)
            .maybeSingle()

          // Resolve teacher_id (teachers table row ID) → user_id (users table)
          const teacherRowIds = teachers.map(t => t.teacher_id).filter(Boolean)
          let teacherUserIds: string[] = []
          if (teacherRowIds.length > 0) {
            const { data: teacherRows } = await supabase
              .from('teachers')
              .select('user_id')
              .in('id', teacherRowIds)
            teacherUserIds = (teacherRows || []).map(t => t.user_id).filter(Boolean)
          }

          for (const uid of teacherUserIds) {
            await supabase.from('notifications').insert({
              user_id: uid,
              type: 'info',
              template_key: 'assessmentWaiting',
              params: { student: studentProfile?.display_name || 'Student', studentId: user.id, submissionId: submission.id, activityId, taskId: taskId || '', batchId: batchId || '', courseId: enrollment.course_id },
              title: `Assessment Waiting for Review: Speaking — ${studentProfile?.display_name || 'Student'}`,
              body: `Student ${studentProfile?.display_name || 'Student'} submitted a speaking recording for review. Course: ${enrollment.course_id}, Task: ${taskId || ''}, Submission: ${submission.id}`,
              link: `/teacher/penilaian?submissionId=${submission.id}&activityId=${activityId}${taskId ? `&taskId=${taskId}` : ''}&batchId=${batchId || ''}&courseId=${enrollment.course_id}`,
            })
          }
        }
      }
    } catch (notifErr) { console.error('[speaking-review] notify error', notifErr) }

    return NextResponse.json({ success: true, submission_id: submission.id })
  } catch (e) {
    console.error('[speaking-review] error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
