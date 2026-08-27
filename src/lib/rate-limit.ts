import { NextRequest, NextResponse } from 'next/server'

// Simple in-memory rate limiter (for production, use Redis or Upstash)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()

interface RateLimitConfig {
  maxRequests: number
  windowMs: number
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequests: 30,
  windowMs: 60_000, // 1 menit
}

// Konfigurasi per-route
const ROUTE_CONFIGS: Record<string, RateLimitConfig> = {
  '/api/auth/login': { maxRequests: 5, windowMs: 60_000 },       // 5 login/menit
  '/api/auth/register': { maxRequests: 3, windowMs: 60_000 },    // 3 registrasi/menit
  '/api/auth/callback': { maxRequests: 10, windowMs: 60_000 },
  '/api/enrollments': { maxRequests: 10, windowMs: 60_000 },     // 10 enroll/menit
  '/api/ai/chat': { maxRequests: 20, windowMs: 60_000 },         // 20 chat/menit
  '/api/ai/grade': { maxRequests: 10, windowMs: 60_000 },        // 10 grade/menit (LLM cost)
  '/api/student/progress': { maxRequests: 30, windowMs: 60_000 }, // 30 progress/menit
  '/api/email/send': { maxRequests: 5, windowMs: 60_000 },       // 5 email/menit
  '/api/email/teacher-notification': { maxRequests: 3, windowMs: 10 * 60_000 }, // 3 signup notifications / 10 menit
  '/api/claim-trial': { maxRequests: 5, windowMs: 60_000 },      // 5 trial/menit
  '/api/placement': { maxRequests: 5, windowMs: 60_000 },
  '/api/placement/purchase': { maxRequests: 5, windowMs: 60_000 },
  '/api/diskusi': { maxRequests: 20, windowMs: 60_000 },
  '/api/notifications/send': { maxRequests: 10, windowMs: 60_000 },
  '/api/notifications/generate': { maxRequests: 10, windowMs: 60_000 },
  '/api/certificates/generate': { maxRequests: 5, windowMs: 60_000 },
  '/api/waiting-list/assign': { maxRequests: 10, windowMs: 60_000 },
  '/api/courses': { maxRequests: 30, windowMs: 60_000 },
  '/api/kontak': { maxRequests: 5, windowMs: 60_000 },
}

export function rateLimit(request: NextRequest): NextResponse | null {
  const pathname = request.nextUrl.pathname

  // Hanya apply ke API routes
  if (!pathname.startsWith('/api/')) {
    return null
  }

  const config = ROUTE_CONFIGS[pathname] || DEFAULT_CONFIG

  // Gunakan IP sebagai identifier - handle x-forwarded-for spoofing (ambil IP pertama)
  const xff = request.headers.get('x-forwarded-for')
  const ip = (xff ? xff.split(',')[0].trim() : null) ||
    request.headers.get('x-real-ip')?.split(',')[0].trim() ||
    '127.0.0.1'

  const now = Date.now()
  const key = `${ip}:${pathname}`

  const entry = rateLimitMap.get(key)

  if (!entry || now > entry.resetTime) {
    // First request or window expired
    rateLimitMap.set(key, {
      count: 1,
      resetTime: now + config.windowMs,
    })
    return null
  }

  if (entry.count >= config.maxRequests) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000)
    return NextResponse.json(
      { error: 'Terlalu banyak permintaan. Coba lagi nanti.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(config.maxRequests),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(entry.resetTime / 1000)),
        },
      }
    )
  }

  entry.count++
  return null
}

// Cleanup stale entries every 5 minutes (best-effort; in serverless each instance has own Map)
if (typeof setInterval !== 'undefined') {
  try {
    setInterval(() => {
      const now = Date.now()
      for (const [key, entry] of rateLimitMap) {
        if (now > entry.resetTime) {
          rateLimitMap.delete(key)
        }
      }
    }, 5 * 60 * 1000)
    // Allow Node to exit if this is the only timer
    // @ts-ignore
    if (typeof globalThis !== 'undefined' && (globalThis as any).setInterval) {
      // no-op
    }
  } catch {
    // Edge runtime may not support setInterval - ignore, per-request expiry handles cleanup
  }
}
