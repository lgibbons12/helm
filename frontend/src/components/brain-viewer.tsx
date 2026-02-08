import { useQuery } from '@tanstack/react-query'
import { Brain, Loader2 } from 'lucide-react'
import Markdown from 'react-markdown'

import { chatApi } from '@/lib/api'

interface BrainViewerProps {
  classId?: string
}

export function BrainViewer({ classId }: BrainViewerProps) {
  const { data: brain, isLoading } = useQuery({
    queryKey: ['brain', classId || 'global'],
    queryFn: () =>
      classId ? chatApi.getClassBrain(classId) : chatApi.getGlobalBrain(),
  })

  if (isLoading) {
    return (
      <div className="glass-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Brain className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            brain
          </span>
        </div>
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
        </div>
      </div>
    )
  }

  const hasContent = brain?.content && brain.content.trim().length > 0

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary" />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {classId ? 'class brain' : 'global brain'}
          </span>
        </div>
        {brain && brain.update_count > 0 && (
          <span className="text-[10px] text-muted-foreground/60 lowercase">
            {brain.update_count} update{brain.update_count !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {hasContent ? (
        <div className="prose prose-sm prose-invert max-w-none text-xs leading-relaxed max-h-[300px] overflow-y-auto">
          <Markdown>{brain!.content}</Markdown>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground/50 lowercase italic">
          no memories yet. start chatting to build your brain!
        </p>
      )}
    </div>
  )
}
