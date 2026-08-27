import nodemailer from 'nodemailer'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface EmailConfig {
  enabled: boolean
  host: string
  port: number
  user: string
  password: string
  fromEmail: string
  fromName: string
  platformName: string
}

export async function getEmailConfig(supabase: SupabaseClient): Promise<EmailConfig> {
  const { data } = await supabase.from('system_settings').select('key, value')
  const map: Record<string, string> = {}
  for (const row of data ?? []) {
    map[row.key] = String(row.value ?? '')
  }
  return {
    enabled: map.notif_email_enabled !== 'false',
    host: map.smtp_host || '',
    port: Number(map.smtp_port || 587),
    user: map.smtp_user || '',
    password: map.smtp_password || '',
    fromEmail: map.smtp_from_email || '',
    fromName: map.smtp_from_name || 'Lexora Academy',
    platformName: map.brand_platform_name || 'Lexora Academy',
  }
}

export function emailHtml({
  platformName,
  title,
  body,
}: {
  platformName: string
  title: string
  body: string
}): string {
  const escaped = body.replace(/</g, '&lt;')
  return `<!doctype html>
<html lang="id">
  <body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
            <tr>
              <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:20px 28px;">
                <p style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">${platformName}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <h1 style="margin:0 0 12px;font-size:18px;color:#111827;line-height:1.4;">${title}</h1>
                <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;white-space:pre-line;">${escaped}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;background-color:#f9fafb;border-top:1px solid #e5e7eb;">
                <p style="margin:0;font-size:12px;color:#6b7280;">Email ini dikirim otomatis oleh ${platformName}. Mohon tidak membalas email ini.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

export async function sendEmailServer({
  supabase,
  to,
  subject,
  body,
}: {
  supabase: SupabaseClient
  to: string
  subject: string
  body: string
}): Promise<{ sent: boolean; reason?: string }> {
  const cfg = await getEmailConfig(supabase)
  if (!cfg.enabled) return { sent: false, reason: 'email notifications disabled' }
  if (!cfg.host || !cfg.user || !cfg.password) return { sent: false, reason: 'smtp not configured' }

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: {
      user: cfg.user,
      pass: cfg.password,
    },
  })

  await transporter.sendMail({
    from: `"${cfg.fromName}" <${cfg.fromEmail || cfg.user}>`,
    to,
    subject,
    html: emailHtml({ platformName: cfg.platformName, title: subject, body }),
  })

  return { sent: true }
}
