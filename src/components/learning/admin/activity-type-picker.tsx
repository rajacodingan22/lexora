'use client'

import { Button } from '@/components/ui/button'
import { ACTIVITY_TYPES, getActivityTypeLabel } from '@/lib/learning'
import type { ActivityType } from '@/types'
import {
  BookMarked, Headphones, BookOpen, Brain, Layers, Mic, Wrench,
  Type, AlignLeft, Image, Images, Link2, PenTool, Zap, CircleDot, X, MessageSquare,
} from 'lucide-react'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  reading: BookMarked,
  listening: Headphones,
  image_speak: Image,
  image_quiz: Images,
  speaking_review: MessageSquare,
  learn: BookOpen,
  flashcard: Brain,
  vocabulary: Layers,
  speaking: Mic,
  grammar_fix: Wrench,
  fill_blank: Type,
  arrange_sentence: AlignLeft,
  image_selection: Image,
  matching: Link2,
  writing: PenTool,
  quick_review: Zap,
}

export function getActivityIcon(type: string): React.ComponentType<{ className?: string }> {
  return ICON_MAP[type] ?? CircleDot
}

export function ActivityTypePicker({
  open,
  onSelect,
  onClose,
}: {
  open: boolean
  onSelect: (type: ActivityType) => void
  onClose: () => void
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-surface border border-border p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-on-surface">Choose Activity Type</h3>
          <Button size="sm" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {ACTIVITY_TYPES.map((type) => {
            const Icon = getActivityIcon(type)
            return (
              <button
                key={type}
                type="button"
                className="flex flex-col items-center gap-2 rounded-xl border border-border p-6 transition-colors hover:border-primary hover:bg-primary-soft"
                onClick={() => onSelect(type)}
              >
                <Icon className="h-8 w-8 text-primary" />
                <span className="text-sm font-medium text-on-surface">{getActivityTypeLabel(type).en}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
