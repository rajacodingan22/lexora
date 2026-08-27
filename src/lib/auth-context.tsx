'use client'

import { createContext, useContext, useEffect, useState, useRef, useCallback, type ReactNode } from 'react'
import { createClient } from './supabase-client'
import type { User } from '@/types'

interface AuthContextType {
  user: User | null
  loading: boolean
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true, refresh: async () => {} })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const supabaseRef = useRef(createClient())

  const refresh = useCallback(async () => {
    try {
      const { data: { user: authUser } } = await supabaseRef.current.auth.getUser()
      if (!authUser) { setUser(null); return }

      const { data } = await supabaseRef.current
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single()

      setUser(data as User)
    } catch (_err) {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()

    const { data: { subscription } } = supabaseRef.current.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        refresh()
      }
    })

    return () => subscription.unsubscribe()
  }, [refresh])

  return (
    <AuthContext.Provider value={{ user, loading, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
