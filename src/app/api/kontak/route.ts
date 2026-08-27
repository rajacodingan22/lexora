import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { name, email, subject, message } = await req.json()

    if (!name || typeof name !== 'string' || name.length > 100) {
      return NextResponse.json({ error: 'Name is required and must be under 100 characters' }, { status: 400 })
    }
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
    }
    if (!message || typeof message !== 'string' || message.length > 5000) {
      return NextResponse.json({ error: 'Message is required and must be under 5000 characters' }, { status: 400 })
    }
    if (subject && (typeof subject !== 'string' || subject.length > 255)) {
      return NextResponse.json({ error: 'Subject must be under 255 characters if provided' }, { status: 400 })
    }

    const { error } = await supabase
      .from('contact_messages')
      .insert({ name, email, subject: subject || null, message, created_at: new Date().toISOString() })

    if (error) {
      console.error('Kontak API error:', error)
      return NextResponse.json({ error: error.message || 'Operation failed' }, { status: 400 })
    }
    return NextResponse.json({ success: true })
  } catch (_error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
