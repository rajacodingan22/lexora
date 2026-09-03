import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Append an audit trail row. Fire-and-forget — never throws.
 * RLS: audit_insert allows any authenticated user; audit_read_admin restricts reads.
 */
export async function writeAudit(
  supabase: SupabaseClient,
  action: string,
  details?: Record<string, unknown>
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    let role: string | null = null
    try {
      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()
      role = (profile as { role?: string } | null)?.role || null
    } catch {
      /* role optional */
    }
    await supabase.from('audit_logs').insert({
      action,
      user_id: user.id,
      role,
      details: details ?? {},
    })
  } catch (err) {
    console.error('[audit] write failed:', err)
  }
}
