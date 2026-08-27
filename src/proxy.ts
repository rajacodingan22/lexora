import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'

/**
 * Lexora Academy Proxy (formerly Middleware)
 *
 * In Next.js 16, `middleware.ts` is deprecated and renamed to `proxy.ts`.
 * The exported function must be named `proxy` (not `middleware`).
 *
 * Route groups like `(dashboard)` and `(public)` are pathless — they do
 * NOT appear in the URL. Therefore the matcher below uses the actual
 * URL paths (/student/*, /teacher/*, /admin/*), which correctly covers
 * all routes inside and outside route groups.
 */

const publicPaths = [
  '/masuk', '/daftar', '/lupa-password', '/verifikasi-email',
  '/', '/berita', '/event', '/faq', '/tentang', '/kontak',
  '/program', '/project', '/guru',
]

const publicApiPrefixes = [
  '/api/auth/',
  '/api/courses',
  '/api/kontak',
]
// Note: publicApiPrefixes is documentation for audit - actual auth bypass is for all /api/* via isApi check below

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Rate limiting untuk API routes (formerly in middleware.ts)
  const rateLimitResponse = rateLimit(req)
  if (rateLimitResponse) {
    return rateLimitResponse
  }

  // Create a response early so we can set cookies on it
  const response = NextResponse.next()

  const isPublic = publicPaths.some(p => pathname === p || pathname.startsWith(p + '/'))
  const isApi = pathname.startsWith('/api/')
  const _isPublicApi = publicApiPrefixes.some(p => pathname === p || pathname.startsWith(p))
  void _isPublicApi
  const isAuth = pathname.startsWith('/auth/')
  // Check for dashboard paths — covers both route groups and top-level dirs
  const isDashboard =
    pathname.startsWith('/student/') ||
    pathname === '/student' ||
    pathname.startsWith('/teacher/') ||
    pathname === '/teacher' ||
    pathname.startsWith('/admin/') ||
    pathname === '/admin'
  const isTeacherApplication = pathname === '/teacher/apply'

  // Public content and API routes bypass auth redirect; dashboard routes require auth.
  // IMPORTANT: Every non-public API route MUST verify auth via supabase.auth.getUser() internally.
  // isApi bypass is intentional to prevent redirecting API calls to /masuk (JSON vs HTML).
  // publicApiPrefixes documents which APIs are intentionally public; others are protected per-route.
  if (isPublic || isApi || isAuth || !isDashboard) {
    return NextResponse.next()
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            req.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const url = req.nextUrl.clone()
    url.pathname = '/masuk'
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role, status')
    .eq('id', user.id)
    .single()

  const role = (profile as { role?: string; status?: string } | null)?.role || 'student'
  const profileStatus = (profile as { role?: string; status?: string } | null)?.status || 'active'

  // Teacher applicants remain students until admin approval. While an
  // application is pending review (or needs revision), the applicant must be
  // restricted to the application status page only — no dashboard access.
  if (role === 'student' && !isTeacherApplication) {
    const { data: application } = await supabase
      .from('teacher_applications')
      .select('status')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const appStatus = application?.status
    if (appStatus === 'pending_review' || appStatus === 'needs_revision') {
      const url = req.nextUrl.clone()
      url.pathname = '/teacher/apply'
      return NextResponse.redirect(url)
    }
  }

  // Redirect to the correct dashboard based on role
  if (pathname.startsWith('/student') && role !== 'student') {
    const url = req.nextUrl.clone()
    url.pathname = role === 'admin' ? '/admin/dashboard' : `/${role}/dashboard`
    return NextResponse.redirect(url)
  }
  if (pathname.startsWith('/teacher') && !isTeacherApplication && (role !== 'teacher' || profileStatus !== 'active')) {
    const url = req.nextUrl.clone()
    url.pathname = role === 'admin' ? '/admin/dashboard' : '/student/dashboard'
    return NextResponse.redirect(url)
  }
  if (pathname.startsWith('/admin') && role !== 'admin') {
    const url = req.nextUrl.clone()
    url.pathname = `/${role}/dashboard`
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: [
    '/api/:path*',
    '/student/:path*',
    '/student',
    '/teacher/:path*',
    '/teacher',
    '/admin/:path*',
    '/admin',
  ],
}