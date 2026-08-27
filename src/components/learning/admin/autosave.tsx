'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export function useAutosave<T>(value: T, save: (v: T) => Promise<void>, delay = 800) {
  const [status, setStatus] = useState<AutosaveStatus>('idle')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveRef = useRef(save)
  const lastValueRef = useRef<T>(value)
  const dirtyRef = useRef(false)
  saveRef.current = save
  lastValueRef.current = value

  const runSave = useCallback(async (v: T) => {
    setStatus('saving')
    try {
      await saveRef.current(v)
      dirtyRef.current = false
      setStatus('saved')
      setTimeout(() => setStatus((s) => (s === 'saved' ? 'idle' : s)), 2000)
    } catch {
      dirtyRef.current = true
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    dirtyRef.current = true
    if (timerRef.current) clearTimeout(timerRef.current)
    setStatus('saving')
    timerRef.current = setTimeout(() => {
      runSave(lastValueRef.current)
    }, delay)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, delay])

  const retry = useCallback(() => {
    runSave(lastValueRef.current)
  }, [runSave])

  return { status, retry }
}

export function SaveIndicator({ status }: { status: AutosaveStatus }) {
  if (status === 'idle') return null
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs ${
        status === 'saving'
          ? 'text-slate-400'
          : status === 'saved'
            ? 'text-emerald-600'
            : 'text-red-600'
      }`}
    >
      {status === 'saving' && <span className="h-3 w-3 animate-spin rounded-full border border-slate-400 border-t-transparent" />}
      {status === 'saved' && '✓'}
      {status === 'saving' ? 'Saving...' : status === 'saved' ? 'Saved ✓' : 'Failed to save'}
    </span>
  )
}
