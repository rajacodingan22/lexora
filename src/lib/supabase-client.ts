import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

declare global {
  var __lexoraSupabase: SupabaseClient | undefined
}

export function createClient(): SupabaseClient {
  if (!globalThis.__lexoraSupabase) {
    globalThis.__lexoraSupabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return globalThis.__lexoraSupabase
}
