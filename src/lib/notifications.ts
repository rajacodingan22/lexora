import { createClient } from './supabase-client'

const NOTIFICATION_TYPES = {
  MEETING: 'meeting',
  ASSIGNMENT: 'assignment',
  QUIZ: 'quiz',
  EXAM: 'exam',
  GRADE: 'grade',
  CERTIFICATE: 'certificate',
  INFO: 'info',
} as const

export async function sendNotification({
  userId,
  type,
  title,
  body,
  link,
}: {
  userId: string
  type: string
  title: string
  body?: string
  link?: string
}) {
  try {
    const supabase = createClient()

    const { data: settings } = await supabase
      .from('system_settings')
      .select('key, value')
    const pushSetting = (settings ?? []).find((s) => s.key === 'notif_push_enabled')
    if (pushSetting && String(pushSetting.value) === 'false') return

    const { error } = await supabase.from('notifications').insert({
      user_id: userId,
      type,
      title,
      body: body || '',
      link: link || '',
      is_read: false,
    })
    if (error) throw error
  } catch (err) {
    console.error('Failed to send notification:', err)
  }
}

export async function sendEmail({ to, subject, body }: { to: string; subject: string; body: string }) {
  try {
    const res = await fetch('/api/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, body }),
    })
    if (!res.ok) {
      console.error('Email send failed:', await res.text().catch(() => ''))
    }
  } catch (err) {
    console.error('Failed to send email:', err)
  }
}

async function _notifyWithEmail(userId: string, subject: string, body: string, link?: string) {
  await sendNotification({
    userId,
    type: NOTIFICATION_TYPES.INFO,
    title: subject,
    body,
    link,
  })
  try {
    const supabase = createClient()
    const { data: profile } = await supabase
      .from('users')
      .select('email')
      .eq('id', userId)
      .single()
    if (profile?.email) {
      await sendEmail({ to: profile.email, subject, body })
    }
  } catch (err) {
    console.error('Failed to resolve email recipient:', err)
  }
}

export async function notifyMeetingReminder(userId: string, courseTitle: string, meetingLink: string) {
  await sendNotification({
    userId,
    type: NOTIFICATION_TYPES.MEETING,
    title: 'Pertemuan Baru',
    body: `Jadwal pertemuan untuk "${courseTitle}" telah ditambahkan.`,
    link: meetingLink,
  })
}

export async function notifyGradePublished(userId: string, courseTitle: string, grade: number) {
  await sendNotification({
    userId,
    type: NOTIFICATION_TYPES.GRADE,
    title: 'Nilai Dipublikasikan',
    body: `Nilai untuk "${courseTitle}" telah dipublikasikan: ${grade}`,
  })
}

export async function notifyCertificateAvailable(userId: string, courseTitle: string) {
  await sendNotification({
    userId,
    type: NOTIFICATION_TYPES.CERTIFICATE,
    title: 'Sertifikat Tersedia',
    body: `Selamat! Sertifikat untuk "${courseTitle}" sudah tersedia.`,
    link: '/student/sertifikat',
  })
}

export async function notifyAssignmentReminder(userId: string, assignmentTitle: string, dueDate: string) {
  await sendNotification({
    userId,
    type: NOTIFICATION_TYPES.ASSIGNMENT,
    title: 'Tenggat Tugas',
    body: `Tugas "${assignmentTitle}" akan berakhir pada ${new Date(dueDate).toLocaleDateString('id-ID')}.`,
  })
}

export async function notifyQuizReminder(userId: string, quizTitle: string) {
  await sendNotification({
    userId,
    type: NOTIFICATION_TYPES.QUIZ,
    title: 'Quiz Baru',
    body: `Quiz "${quizTitle}" telah tersedia.`,
  })
}

export async function notifyExamReminder(userId: string, examTitle: string, dueDate: string) {
  await sendNotification({
    userId,
    type: NOTIFICATION_TYPES.EXAM,
    title: 'Pengumuman Ujian',
    body: `Ujian "${examTitle}" akan berlangsung pada ${new Date(dueDate).toLocaleDateString('id-ID')}.`,
  })
}

export async function notifyPaymentApproved(userId: string, invoiceNumber: string, courseTitle: string) {
  await sendNotification({
    userId,
    type: NOTIFICATION_TYPES.INFO,
    title: 'Pembayaran Disetujui',
    body: `Pembayaran untuk invoice ${invoiceNumber} (${courseTitle}) telah disetujui.`,
    link: '/student/pembayaran',
  })
}

export async function notifyPaymentRejected(userId: string, invoiceNumber: string, courseTitle: string, reason?: string) {
  await sendNotification({
    userId,
    type: NOTIFICATION_TYPES.INFO,
    title: 'Pembayaran Ditolak',
    body: reason
      ? `Pembayaran untuk invoice ${invoiceNumber} (${courseTitle}) ditolak: ${reason}`
      : `Pembayaran untuk invoice ${invoiceNumber} (${courseTitle}) ditolak. Silakan unggah ulang bukti pembayaran.`,
    link: '/student/pembayaran',
  })
}
