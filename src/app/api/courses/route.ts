import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const url = new URL(req.url)
    const languageCode = url.searchParams.get('language_code')
    const levelId = url.searchParams.get('level_id')
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100)
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0'), 0)

    // Build base query with specific column selects
    let query = supabase
      .from('courses')
      .select(`
        id, teacher_id, program_id, language_code, level_id,
        title, description, syllabus, max_students, status, mode,
        is_visible_marketplace, starts_at, ends_at, created_at, updated_at,
        teacher:users!courses_teacher_id_fkey(id, display_name, photo_url, role),
        program:programs(id, name, slug, language_code, program_type, display_order, passing_score, is_active),
        language:languages(code, name, native_name, flag_emoji, is_rtl, level_framework, is_active, sort_order),
        level:language_levels(id, language_code, code, name, sort_order, is_active)
      `)
      .eq('status', 'active')
      .eq('is_visible_marketplace', true)

    if (languageCode) query = query.eq('language_code', languageCode)
    if (levelId) query = query.eq('level_id', levelId)

    // Get total count
    const countQuery = supabase
      .from('courses')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .eq('is_visible_marketplace', true)

    if (languageCode) countQuery.eq('language_code', languageCode)
    if (levelId) countQuery.eq('level_id', levelId)

    const { count, error: countError } = await countQuery
    if (countError) {
      console.error('Courses count error:', countError)
    }

    query = query.range(offset, offset + limit - 1)

    const { data, error } = await query
    if (error) {
      console.error('Courses API error:', error)
      return NextResponse.json({ error: 'Operation failed' }, { status: 400 })
    }

    return NextResponse.json({
      data,
      pagination: {
        total: count ?? 0,
        limit,
        offset,
        has_more: (offset + limit) < (count ?? 0),
      },
    })
  } catch (error) {
    console.error('Courses API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
