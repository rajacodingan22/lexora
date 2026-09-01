import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

const ACCESS_DAYS = 7
const ACCESS_MS = ACCESS_DAYS * 24 * 60 * 60 * 1000

function generateInvoice(): string {
  const ts = Date.now().toString(36).toUpperCase()
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `INV-${ts}-${rand}`
}

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Harga dari system_settings (server-side, tidak bisa dimanipulasi client)
    const { data: settings } = await supabase
      .from('system_settings')
      .select('key, value')

    let price = 599000
    if (settings) {
      for (const row of settings) {
        if (row.key === 'placement_test_price') {
          const parsed = Number(row.value)
          if (!isNaN(parsed) && parsed > 0) price = parsed
        }
      }
    }

    // Cek apakah sudah ada tagihan pending / pembayaran yang masih berlaku
    const { data: existing, error: existingError } = await supabase
      .from('payments')
      .select('id, status, paid_at, created_at, updated_at')
      .eq('user_id', user.id)
      .eq('purpose', 'placement')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingError) {
      console.error('Placement purchase error:', existingError)
      return NextResponse.json({ error: existingError.message || 'Operation failed' }, { status: 400 })
    }

    if (existing) {
      const stillValid =
        existing.status === 'pending' ||
        (existing.status === 'approved' &&
          Date.now() <= new Date(existing.paid_at || existing.updated_at).getTime() + ACCESS_MS)
      if (stillValid) {
        return NextResponse.json({ data: { payment: existing } })
      }
      // rejected / cancelled / expired -> lanjut buat tagihan baru
    }

    const { data: payment, error: payError } = await supabase
      .from('payments')
      .insert({
        user_id: user.id,
        enrollment_id: null,
        purpose: 'placement',
        invoice_number: generateInvoice(),
        amount: price,
        description: 'Placement Test Package',
        status: 'pending',
        due_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select('id, invoice_number, amount, status, due_date, purpose')
      .single()

    if (payError) {
      console.error('Placement purchase error:', payError)
      return NextResponse.json({ error: payError.message || 'Operation failed' }, { status: 400 })
    }

    await supabase.from('notifications').insert({
      user_id: user.id,
      type: 'info',
      template_key: 'placementInvoicePending',
      params: { due: payment.due_date?.slice(0, 10) || '', invoice: payment.invoice_number || '' },
      title: 'Placement Test Payment Pending',
      body: `Complete your placement test payment before ${payment.due_date?.slice(0, 10)}. Invoice: ${payment.invoice_number || ''}. After verification you can start the test anytime.`,
      link: `/student/placement-test?invoice=${payment.invoice_number || ''}`,
      is_read: false,
    })

    return NextResponse.json({ data: { payment } })
  } catch (error) {
    console.error('Placement purchase error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
