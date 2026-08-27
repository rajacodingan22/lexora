'use client'

import { useEffect, useState, useCallback } from 'react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/lib/auth-context'
import { useI18n } from '@/lib/i18n/client'
import { createClient } from '@/lib/supabase-client'
import { formatDate } from '@/lib/utils'
import {
  MessageCircle, Plus, Clock, MessageSquare, Filter, X,
  ChevronDown, ChevronUp, ImageIcon, Send, Pin, Lock,
  AtSign, Loader2, UserCircle, Paperclip
} from 'lucide-react'
import type { User } from '@/types'

interface DiscussionWithMeta {
  id: string
  course_id: string
  parent_id: string | null
  user_id: string
  title?: string
  content: string
  image_url: string | null
  is_pinned: boolean
  is_locked: boolean
  is_deleted: boolean
  created_at: string
  updated_at: string
  user: Pick<User, 'id' | 'display_name' | 'photo_url'> | null
  course_title?: string
  reply_count?: number
  last_activity?: string
}

export default function StudentDiskusiPage() {
  const { user: authUser } = useAuth()
  const { t } = useI18n()
  const supabase = createClient()

  const [discussions, setDiscussions] = useState<DiscussionWithMeta[]>([])
  const [courseOptions, setCourseOptions] = useState<{ id: string; title: string }[]>([])
  const [selectedCourse, setSelectedCourse] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [replies, setReplies] = useState<Record<string, DiscussionWithMeta[]>>({})
  const [loadingReplies, setLoadingReplies] = useState<Record<string, boolean>>({})
  const [replyText, setReplyText] = useState<Record<string, string>>({})
  const [replyImage, setReplyImage] = useState<Record<string, File | null>>({})
  const [replyImagePreview, setReplyImagePreview] = useState<Record<string, string | null>>({})
  const [submittingReply, setSubmittingReply] = useState<Record<string, boolean>>({})

  const [showNewModal, setShowNewModal] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [newCourse, setNewCourse] = useState('')
  const [newImage, setNewImage] = useState<File | null>(null)
  const [newImagePreview, setNewImagePreview] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const isTeacher = authUser?.role === 'teacher'

  const fetchDiscussions = useCallback(async () => {
    if (!authUser) return
    try {
      setError(null)

      const { data: enrollments } = await supabase
        .from('enrollments')
        .select('course_id')
        .eq('user_id', authUser.id)
        .in('status', ['active', 'completed'])

      const raw = (enrollments as { course_id: string }[]) || []
      const courseIds = raw.map(e => e.course_id)

      if (courseIds.length === 0) {
        setDiscussions([])
        setCourseOptions([])
        setLoading(false)
        return
      }

      const { data: courses } = await supabase
        .from('courses')
        .select('id, title')
        .in('id', courseIds)

      const options = (courses || []).map(c => ({
        id: c.id,
        title: c.title?.en || c.title?.id || 'Untitled',
      }))
      setCourseOptions(options)

      let query = supabase
        .from('discussion_posts')
        .select('*, user:user_id(display_name, photo_url)')
        .is('parent_id', null)
        .in('course_id', courseIds)
        .eq('is_deleted', false)
        .order('is_pinned', { ascending: false })
        .order('updated_at', { ascending: false })

      if (selectedCourse !== 'all') {
        query = query.eq('course_id', selectedCourse)
      }

      const { data: posts, error: postsError } = await query
      if (postsError) throw postsError

      const courseTitleMap = new Map(options.map(o => [o.id, o.title]))

      let replyCounts: Record<string, number> = {}
      let lastActivities: Record<string, string> = {}

      const postIds = (posts || []).map(p => p.id)
      if (postIds.length > 0) {
        const { data: repliesData } = await supabase
          .from('discussion_posts')
          .select('parent_id, created_at')
          .in('parent_id', postIds)
          .eq('is_deleted', false)

        if (repliesData) {
          const grouped: Record<string, { count: number; lastDate: string }> = {}
          for (const r of repliesData) {
            if (!grouped[r.parent_id]) {
              grouped[r.parent_id] = { count: 0, lastDate: r.created_at }
            }
            grouped[r.parent_id].count++
            if (r.created_at > grouped[r.parent_id].lastDate) {
              grouped[r.parent_id].lastDate = r.created_at
            }
          }
          replyCounts = Object.fromEntries(
            Object.entries(grouped).map(([k, v]) => [k, v.count])
          )
          lastActivities = Object.fromEntries(
            Object.entries(grouped).map(([k, v]) => [k, v.lastDate])
          )
        }
      }

      const postsWithMeta: DiscussionWithMeta[] = (posts || []).map(p => {
        const anyP = p as any
        return {
          ...anyP,
          title: anyP.title || anyP.content?.split('\n')[0] || t('student1.diskusi.fallback'),
          course_title: courseTitleMap.get(p.course_id) || '',
          reply_count: replyCounts[p.id] || 0,
          last_activity: lastActivities[p.id] || p.updated_at,
        }
      })

      setDiscussions(postsWithMeta)
    } catch (e: any) {
      setError(e.message || t('student1.diskusi.loadError'))
    } finally {
      setLoading(false)
    }
  }, [authUser, selectedCourse, supabase])

  useEffect(() => {
    fetchDiscussions()
  }, [fetchDiscussions])

  const fetchReplies = useCallback(async (discussionId: string) => {
    setLoadingReplies(prev => ({ ...prev, [discussionId]: true }))
    const { data } = await supabase
      .from('discussion_posts')
      .select('*, user:user_id(display_name, photo_url)')
      .eq('parent_id', discussionId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true })

    setReplies(prev => ({ ...prev, [discussionId]: (data as any) || [] }))
    setLoadingReplies(prev => ({ ...prev, [discussionId]: false }))
  }, [supabase])

  const toggleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null)
      return
    }
    setExpandedId(id)
    if (!replies[id]) fetchReplies(id)
  }

  async function uploadImage(file: File): Promise<string | null> {
    const ext = file.name.split('.').pop()
    const fileName = `${crypto.randomUUID()}.${ext}`
    const filePath = `${authUser!.id}/${fileName}`
    const { error } = await supabase.storage
      .from('discussions')
      .upload(filePath, file)
    if (error) return null
    const { data: { publicUrl } } = supabase.storage
      .from('discussions')
      .getPublicUrl(filePath)
    return publicUrl
  }

  async function handleCreateDiscussion() {
    if (!authUser || !newTitle.trim() || !newContent.trim() || !newCourse) return
    setSubmitting(true)
    try {
      let imageUrl: string | null = null
      if (newImage) imageUrl = await uploadImage(newImage)

      const { data, error } = await supabase
        .from('discussion_posts')
        .insert({
          course_id: newCourse,
          user_id: authUser.id,
          title: newTitle.trim(),
          content: newContent.trim(),
          image_url: imageUrl,
        })
        .select('*, user:user_id(display_name, photo_url)')
        .single()

      if (error) throw error

      const newPost: DiscussionWithMeta = {
        ...(data as any),
        title: (data as any).title || newTitle.trim(),
        course_title: courseOptions.find(c => c.id === newCourse)?.title || '',
        reply_count: 0,
        last_activity: data.created_at,
      }
      setDiscussions(prev => [newPost, ...prev])
      setShowNewModal(false)
      setNewTitle('')
      setNewContent('')
      setNewCourse('')
      setNewImage(null)
      setNewImagePreview(null)
    } catch (e: any) {
      console.error(e)
    } finally {
      setSubmitting(false)
    }
  }

  function handleNewImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setNewImage(file)
    const reader = new FileReader()
    reader.onload = () => setNewImagePreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  async function handleReply(discussionId: string) {
    const text = replyText[discussionId]?.trim()
    if (!authUser || !text) return

    setSubmittingReply(prev => ({ ...prev, [discussionId]: true }))
    try {
      let imageUrl: string | null = null
      const rImg = replyImage[discussionId]
      if (rImg) imageUrl = await uploadImage(rImg)

      const discussion = discussions.find(d => d.id === discussionId)
      if (!discussion) return

      const { data, error } = await supabase
        .from('discussion_posts')
        .insert({
          course_id: discussion.course_id,
          parent_id: discussionId,
          user_id: authUser.id,
          content: text,
          image_url: imageUrl,
        })
        .select('*, user:user_id(display_name, photo_url)')
        .single()

      if (error) throw error

      setReplies(prev => ({
        ...prev,
        [discussionId]: [...(prev[discussionId] || []), data as any],
      }))
      setDiscussions(prev => prev.map(d =>
        d.id === discussionId
          ? { ...d, reply_count: (d.reply_count || 0) + 1, last_activity: data.created_at }
          : d
      ))
      setReplyText(prev => ({ ...prev, [discussionId]: '' }))
      setReplyImage(prev => ({ ...prev, [discussionId]: null }))
      setReplyImagePreview(prev => ({ ...prev, [discussionId]: null }))
    } catch (e: any) {
      console.error(e)
    } finally {
      setSubmittingReply(prev => ({ ...prev, [discussionId]: false }))
    }
  }

  function handleReplyImageSelect(discussionId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setReplyImage(prev => ({ ...prev, [discussionId]: file }))
    const reader = new FileReader()
    reader.onload = () => setReplyImagePreview(prev => ({ ...prev, [discussionId]: reader.result as string }))
    reader.readAsDataURL(file)
  }

  function insertAtMention(discussionId: string) {
    setReplyText(prev => ({
      ...prev,
      [discussionId]: (prev[discussionId] || '') + '@teacher ',
    }))
  }

  async function togglePin(discussion: DiscussionWithMeta) {
    await supabase
      .from('discussion_posts')
      .update({ is_pinned: !discussion.is_pinned })
      .eq('id', discussion.id)
    setDiscussions(prev => prev.map(d =>
      d.id === discussion.id ? { ...d, is_pinned: !d.is_pinned } : d
    ))
  }

  async function toggleLock(discussion: DiscussionWithMeta) {
    await supabase
      .from('discussion_posts')
      .update({ is_locked: !discussion.is_locked })
      .eq('id', discussion.id)
    setDiscussions(prev => prev.map(d =>
      d.id === discussion.id ? { ...d, is_locked: !d.is_locked } : d
    ))
  }

  function getInitials(name: string) {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
  }

  function resetNewForm() {
    setNewTitle('')
    setNewContent('')
    setNewCourse('')
    setNewImage(null)
    setNewImagePreview(null)
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">{t('student1.diskusi.title')}</h1>
          <p className="text-on-surface-variant">{t('student1.diskusi.subtitle')}</p>
        </div>
        <Button size="sm" onClick={() => setShowNewModal(true)}>
          <Plus className="mr-1 h-4 w-4" /> {t('student1.diskusi.newPost')}
        </Button>
      </div>

      {courseOptions.length > 0 && (
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted" />
          <select
            value={selectedCourse}
            onChange={(e) => setSelectedCourse(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          >
            <option value="all">{t('student1.diskusi.allCourses')}</option>
            {courseOptions.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="h-5 w-48 rounded bg-surface-container-highest animate-pulse" />
                <div className="mt-3 h-4 w-32 rounded bg-surface-container-highest animate-pulse" />
                <div className="mt-3 flex gap-4">
                  <div className="h-4 w-24 rounded bg-surface-container-highest animate-pulse" />
                  <div className="h-4 w-28 rounded bg-surface-container-highest animate-pulse" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-red-400">{error}</p>
            <Button className="mt-4" variant="outline" onClick={fetchDiscussions}>{t('student1.diskusi.retry')}</Button>
          </CardContent>
        </Card>
      ) : discussions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageCircle className="mx-auto h-12 w-12 text-muted mb-4" />
            <h3 className="font-semibold text-on-surface">{t('student1.diskusi.noDiscussions')}</h3>
            <p className="text-sm text-on-surface-variant mt-1">
              {t('student1.diskusi.noDiscussionsDesc')}
            </p>
            <Button className="mt-4" onClick={() => setShowNewModal(true)}>
              <Plus className="mr-1 h-4 w-4" /> {t('student1.diskusi.newPost')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {discussions.map((post) => (
            <Card key={post.id} className="overflow-hidden">
              <div
                className="cursor-pointer p-5 hover:bg-surface-hover transition-colors"
                onClick={() => toggleExpand(post.id)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      {post.is_pinned && (
                        <Badge variant="warning">
                          <Pin className="h-3 w-3 mr-0.5" /> Pinned
                        </Badge>
                      )}
                      {post.is_locked && (
                        <Badge variant="destructive">
                          <Lock className="h-3 w-3 mr-0.5" /> Closed
                        </Badge>
                      )}
                    </div>
                    <h3 className="font-semibold text-on-surface">{post.title}</h3>
                    <p className="text-sm text-on-surface-variant mt-0.5 line-clamp-2">
                      {post.content}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted">
                      <span className="flex items-center gap-1.5">
                        {post.user?.photo_url ? (
                          <img
                            src={post.user.photo_url}
                            alt=""
                            className="h-4 w-4 rounded-full object-cover"
                          />
                        ) : (
                          <UserCircle className="h-4 w-4" />
                        )}
                        {post.user?.display_name || 'Unknown'}
                      </span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {post.course_title}
                      </Badge>
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        {t('student1.diskusi.repliesCount', { count: post.reply_count ?? 0 })}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDate(post.last_activity!)}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 mt-1">
                    {expandedId === post.id ? (
                      <ChevronUp className="h-5 w-5 text-muted" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-muted" />
                    )}
                  </div>
                </div>

                {post.image_url && (
                  <div className="mt-3">
                    <img
                      src={post.image_url}
                      alt=""
                      className="max-h-48 rounded-lg object-cover border border-border"
                    />
                  </div>
                )}
              </div>

              {expandedId === post.id && (
                <div className="border-t border-border bg-surface-container-lowest">
                  {isTeacher && (
                    <div className="flex items-center gap-2 px-5 pt-3">
                      <Button
                        size="sm"
                        variant={post.is_pinned ? 'default' : 'outline'}
                        onClick={() => togglePin(post)}
                      >
                        <Pin className="h-3 w-3 mr-1" />
                        {post.is_pinned ? 'Unpin' : 'Pin'}
                      </Button>
                      <Button
                        size="sm"
                        variant={post.is_locked ? 'destructive' : 'outline'}
                        onClick={() => toggleLock(post)}
                      >
                        <Lock className="h-3 w-3 mr-1" />
                        {post.is_locked ? 'Open' : 'Close'}
                      </Button>
                    </div>
                  )}

                  <div className="px-5 py-4 space-y-4">
                    {loadingReplies[post.id] ? (
                      <div className="flex items-center gap-2 text-sm text-muted">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t('student1.diskusi.loadingReplies')}
                      </div>
                    ) : replies[post.id]?.length === 0 ? (
                      <p className="text-sm text-muted">{t('student1.diskusi.noReplies')}</p>
                    ) : (
                      replies[post.id]?.map((reply) => (
                        <div key={reply.id} className="flex gap-3">
                          <div className="shrink-0">
                            {reply.user?.photo_url ? (
                              <img
                                src={reply.user.photo_url}
                                alt=""
                                className="h-8 w-8 rounded-full object-cover"
                              />
                            ) : (
                              <div className="h-8 w-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-xs font-medium text-indigo-400">
                                {getInitials(reply.user?.display_name || '?')}
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-on-surface">
                                {reply.user?.display_name || 'Unknown'}
                              </span>
                              <span className="text-[10px] text-muted">
                                {formatDate(reply.created_at)}
                              </span>
                            </div>
                            <p className="text-sm text-on-surface-variant mt-1 whitespace-pre-wrap">
                              {reply.content}
                            </p>
                            {reply.image_url && (
                              <img
                                src={reply.image_url}
                                alt=""
                                className="mt-2 max-h-40 rounded-lg object-cover border border-border"
                              />
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {!post.is_locked && (
                    <div className="border-t border-border px-5 py-4">
                      <div className="flex gap-3">
                        <div className="shrink-0">
                          {authUser?.photo_url ? (
                            <img
                              src={authUser.photo_url}
                              alt=""
                              className="h-8 w-8 rounded-full object-cover"
                            />
                          ) : (
                            <div className="h-8 w-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-xs font-medium text-indigo-400">
                              {getInitials(authUser?.display_name || '?')}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 space-y-2">
                          <Textarea
                            placeholder={t('student1.diskusi.replyPlaceholder')}
                            value={replyText[post.id] || ''}
                            onChange={(e) =>
                              setReplyText(prev => ({ ...prev, [post.id]: e.target.value }))
                            }
                            className="min-h-[60px]"
                          />
                          {replyImagePreview[post.id] && (
                            <div className="relative inline-block">
                              <img
                                src={replyImagePreview[post.id] || ''}
                                alt=""
                                className="h-20 rounded-lg object-cover border border-border"
                              />
                              <button
                                onClick={() => {
                                  setReplyImage(prev => ({ ...prev, [post.id]: null }))
                                  setReplyImagePreview(prev => ({ ...prev, [post.id]: null }))
                                }}
                                className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px]"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <label className="cursor-pointer">
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => handleReplyImageSelect(post.id, e)}
                              />
                              <div className="flex items-center gap-1 text-xs text-muted hover:text-on-surface transition-colors">
                                <Paperclip className="h-3.5 w-3.5" />
                                {t('student1.diskusi.image')}
                              </div>
                            </label>
                            <button
                              onClick={() => insertAtMention(post.id)}
                              className="flex items-center gap-1 text-xs text-muted hover:text-indigo-400 transition-colors"
                            >
                              <AtSign className="h-3.5 w-3.5" />
                              @teacher
                            </button>
                            <div className="flex-1" />
                            <Button
                              size="sm"
                              onClick={() => handleReply(post.id)}
                              disabled={!replyText[post.id]?.trim() || submittingReply[post.id]}
                            >
                              {submittingReply[post.id] ? (
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              ) : (
                                <Send className="h-3 w-3 mr-1" />
                              )}
                              {t('student1.diskusi.send')}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {post.is_locked && (
                    <div className="border-t border-border px-5 py-3 text-center">
                      <p className="text-xs text-muted flex items-center justify-center gap-1">
                        <Lock className="h-3 w-3" />
                        {t('student1.diskusi.closed')}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl bg-surface border border-border shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="text-lg font-semibold text-on-surface">{t('student1.diskusi.newPost')}</h2>
              <Button variant="ghost" size="sm" onClick={() => { setShowNewModal(false); resetNewForm(); }}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-on-surface mb-1.5">{t('student1.diskusi.courseLabel')}</label>
                <select
                  value={newCourse}
                  onChange={(e) => setNewCourse(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                >
                  <option value="">{t('student1.diskusi.selectCourse')}</option>
                  {courseOptions.map((c) => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-on-surface mb-1.5">{t('student1.diskusi.titleLabel')}</label>
                <Input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder={t('student1.diskusi.titlePlaceholder')}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-on-surface mb-1.5">{t('student1.diskusi.contentLabel')}</label>
                <Textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder={t('student1.diskusi.contentPlaceholder')}
                  className="min-h-[120px]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-on-surface mb-1.5">{t('student1.diskusi.imageOptional')}</label>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-muted hover:text-on-surface transition-colors">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleNewImageSelect}
                  />
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
                    <ImageIcon className="h-4 w-4" />
                    {newImage ? newImage.name : t('student1.diskusi.chooseImage')}
                  </div>
                </label>
                {newImagePreview && (
                  <div className="relative inline-block mt-2">
                    <img src={newImagePreview} alt="" className="h-24 rounded-lg object-cover border border-border" />
                    <button
                      onClick={() => { setNewImage(null); setNewImagePreview(null); }}
                      className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px]"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
              <Button variant="ghost" onClick={() => { setShowNewModal(false); resetNewForm(); }}>
                {t('student1.diskusi.cancel')}
              </Button>
              <Button
                onClick={handleCreateDiscussion}
                disabled={!newTitle.trim() || !newContent.trim() || !newCourse || submitting}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Send className="h-4 w-4 mr-1" />
                )}
                {t('student1.diskusi.publish')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  )

}
