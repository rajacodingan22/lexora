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

      // Jaga identitas referensi: jangan ganti object user kalau isinya sama,
      // supaya useEffect([user]) di halaman tidak refetch + reset UI tiap token refresh.
      setUser((prev) => {
        if (prev && prev.id === (data as User)?.id && JSON.stringify(prev) === JSON.stringify(data)) {
          return prev
        }
        return data as User
      })
    } catch {
      // JANGAN null-in user saat error transient (jaringan kedip pas pindah tab):
      // user lama dipertahankan supaya halaman tidak ketendang ke login.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()

    const { data: { subscription } } = supabaseRef.current.auth.onAuthStateChange((event) => {
      // Hanya SIGNED_OUT eksplisit yang boleh null-in user.
      // TOKEN_REFRESHED / SIGNED_IN / INITIAL_SESSION cukup sinkron profil.
      if (event === 'SIGNED_OUT') {
        setUser(null)
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
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
