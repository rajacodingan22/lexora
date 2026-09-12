import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { searchParams } = new URL(req.url)
    const courseId = searchParams.get('course_id')

    if (!courseId) return NextResponse.json({ error: 'course_id is required' }, { status: 400 })

    const { data, error } = await supabase
      .from('discussion_posts')
      .select(`
        id, course_id, parent_id, user_id, title, content,
        is_pinned, is_locked, is_deleted, created_at, updated_at,
        user:users(id, display_name, photo_url, role)
      `)
      .eq('course_id', courseId)
      .eq('is_deleted', false)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Diskusi API error:', error)
      return NextResponse.json({ error: 'Operation failed' }, { status: 400 })
    }
    return NextResponse.json({ data })
  } catch (error) {
    console.error('Diskusi API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { course_id, parent_id, title, content } = await req.json()

    if (!course_id || typeof course_id !== 'string') {
      return NextResponse.json({ error: 'course_id is required' }, { status: 400 })
    }
    if (!title || typeof title !== 'string' || title.length > 200) {
      return NextResponse.json({ error: 'Title is required and must be under 200 characters' }, { status: 400 })
    }
    if (!content || typeof content !== 'string' || content.length > 10000) {
      return NextResponse.json({ error: 'Content is required and must be under 10000 characters' }, { status: 400 })
    }

    if (parent_id) {
      if (typeof parent_id !== 'string') {
        return NextResponse.json({ error: 'parent_id must be a string' }, { status: 400 })
      }
      const { data: parent } = await supabase
        .from('discussion_posts')
        .select('id, course_id, is_locked, is_deleted')
        .eq('id', parent_id)
        .maybeSingle()
      if (!parent || parent.course_id !== course_id) {
        return NextResponse.json({ error: 'Parent post not found in this course' }, { status: 403 })
      }
      if (parent.is_locked || parent.is_deleted) {
        return NextResponse.json({ error: 'Thread is closed' }, { status: 403 })
      }
    }

    const { data, error } = await supabase
      .from('discussion_posts')
      .insert({
        course_id,
        parent_id: parent_id || null,
        user_id: user.id,
        title,
        content,
      })
      .select('id, course_id, parent_id, user_id, title, content, is_pinned, is_locked, is_deleted, created_at, updated_at')
      .single()

    if (error) {
      console.error('Diskusi API error:', error)
      return NextResponse.json({ error: 'Operation failed' }, { status: 400 })
    }
    return NextResponse.json({ data })
  } catch (error) {
    console.error('Diskusi API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
