import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { answers, language_code } = await req.json()

    // Input validation
    if (!language_code || typeof language_code !== 'string') {
      return NextResponse.json({ error: 'language_code is required' }, { status: 400 })
    }
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
      return NextResponse.json({ error: 'answers must be a valid object mapping question IDs to answers' }, { status: 400 })
    }

    // Scoring di server (security definer): siswa tidak bisa memalsukan skor
    const { data, error } = await supabase.rpc('submit_placement_test', {
      p_language_code: language_code,
      p_answers: answers,
    })

    if (error) {
      console.error('Placement API error:', error)
      return NextResponse.json({ error: error.message || 'Operation failed' }, { status: 400 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Placement API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
