'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function StudentMissionPage() {
  const { id: courseId, taskId } = useParams<{ id: string; taskId: string }>()
  const router = useRouter()

  useEffect(() => {
    router.replace(`/student/kursus/${courseId}/tasks/${taskId}`)
  }, [courseId, taskId, router])

  return (
    <div className="flex justify-center py-20">
      <p className="text-sm text-slate-500">Redirecting...</p>
    </div>
  )
}
