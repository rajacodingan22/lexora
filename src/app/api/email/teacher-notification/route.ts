import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { sendEmailServer } from '@/lib/email'
import { NextResponse } from 'next/server'

const ADMIN_EMAIL = 'chandraqilana26@gmail.com'

export async function POST(req: Request) {
  try {
    const {
      accountEmail,
      fullName,
      birthDate,
      languages,
      phoneNumber,
      country,
      nationality,
      email,
      website,
    } = await req.json()

    // Public by design: this is called during teacher signup before a session
    // exists. The honeypot makes simple bot submissions fail silently.
    if (typeof website === 'string' && website.trim()) {
      return NextResponse.json({ ok: true, sent: false })
    }

    const isEmail = (value: unknown): value is string =>
      typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    const bounded = (value: unknown, max: number): value is string =>
      typeof value === 'string' && value.length <= max

    if (!isEmail(accountEmail) || !bounded(fullName, 160) || fullName.trim().length < 2) {
      return NextResponse.json({ error: 'Valid accountEmail and fullName are required' }, { status: 400 })
    }
    if (email != null && !isEmail(email)) {
      return NextResponse.json({ error: 'email must be valid' }, { status: 400 })
    }
    if (birthDate != null && !bounded(birthDate, 40)) {
      return NextResponse.json({ error: 'birthDate is too long' }, { status: 400 })
    }
    if (phoneNumber != null && !bounded(phoneNumber, 40)) {
      return NextResponse.json({ error: 'phoneNumber is too long' }, { status: 400 })
    }
    if (country != null && !bounded(country, 100)) {
      return NextResponse.json({ error: 'country is too long' }, { status: 400 })
    }
    if (!Array.isArray(languages) || languages.length > 12 || languages.some((code) => typeof code !== 'string' || !/^[a-zA-Z_-]{2,12}$/.test(code))) {
      return NextResponse.json({ error: 'languages must be a valid list' }, { status: 400 })
    }

    // Signup may require email confirmation, so there is no browser session yet.
    // This route is intentionally server-only and uses the service-role client
    // after strict input validation; no client receives this client or key.
    const supabase = createAdminSupabaseClient()
    const lookupEmail = accountEmail.toLowerCase()
    // The account email is not a user id. Resolve the linked public user row
    // first, then load only that user's pending application.
    const { data: userRecord } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', lookupEmail)
      .maybeSingle()

    if (!userRecord) return NextResponse.json({ ok: true, sent: false })

    const { data: pendingApplication } = await supabase
      .from('teacher_applications')
      .select('id, user_id, status, full_name, email, languages, teacher_notification_sent_at')
      .eq('user_id', userRecord.id)
      .eq('status', 'pending_review')
      .is('teacher_notification_sent_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!pendingApplication || pendingApplication.full_name !== fullName.trim()) {
      return NextResponse.json({ ok: true, sent: false })
    }

    const claimTimestamp = new Date().toISOString()
    const { data: claimed, error: claimError } = await supabase
      .from('teacher_applications')
      .update({ teacher_notification_sent_at: claimTimestamp })
      .eq('id', pendingApplication.id)
      .is('teacher_notification_sent_at', null)
      .select('id')
      .maybeSingle()

    if (claimError || !claimed) return NextResponse.json({ ok: true, sent: false })

    const { data: langs } = await supabase
      .from('languages')
      .select('code, name, native_name')
      .in('code', languages)

    const label = (code: string) => {
      const lang = (langs ?? []).find((l) => l.code === code)
      return lang ? (lang.name?.id || lang.name?.en || lang.native_name) : code
    }
    const langNames = languages.map(label).join(', ')
    const contactEmail = email || pendingApplication.email || lookupEmail
    const countryName = country || nationality || '—'

    const body = [
      'Pendaftaran guru baru! 🎓',
      '',
      'Berikut rincian data yang diisi oleh pelamar:',
      '',
      'Nama lengkap   : ' + fullName.trim(),
      'Tanggal lahir  : ' + (birthDate || '-'),
      'Bahasa         : ' + langNames,
      'Nomor telepon  : ' + (phoneNumber || '—'),
      'Asal negara    : ' + countryName,
      'Email kontak   : ' + contactEmail,
      '',
      'Akun dibuat    : ' + lookupEmail,
      '',
      'Pengajuan guru sedang menunggu verifikasi admin di dashboard.',
    ].join('\n')

    try {
      const result = await sendEmailServer({
        supabase,
        to: ADMIN_EMAIL,
        subject: 'Pendaftaran Guru Baru — ' + fullName.trim(),
        body,
      })

      // A missing/disabled SMTP configuration is not a delivery. Release the
      // claim so an admin can retry after configuring email.
      if (!result.sent) {
        await supabase
          .from('teacher_applications')
          .update({ teacher_notification_sent_at: null })
          .eq('id', pendingApplication.id)
          .eq('teacher_notification_sent_at', claimTimestamp)
      }

      return NextResponse.json({ ok: true, ...result })
    } catch (error) {
      // Release the claim on delivery failure so a later legitimate retry can
      // work, while concurrent requests remain blocked during this attempt.
      await supabase
        .from('teacher_applications')
        .update({ teacher_notification_sent_at: null })
        .eq('id', pendingApplication.id)
        .eq('teacher_notification_sent_at', claimTimestamp)
      console.error('Teacher notification delivery error:', error)
      return NextResponse.json({ ok: true, sent: false })
    }
  } catch (error) {
    console.error('Teacher notification error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
