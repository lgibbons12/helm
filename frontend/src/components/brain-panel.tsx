import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Brain, Check, Loader2, Pencil, X } from 'lucide-react'
import Markdown from 'react-markdown'

import { brainsApi } from '@/lib/api'
import { Button } from '@/components/ui/button'

interface BrainPanelProps {
  classId: string
  /** 'quiz' is plato's mastery record; 'class' is what odin accumulated. */
  brainType?: 'class' | 'quiz'
}

const LABELS: Record<'class' | 'quiz', { title: string; empty: string }> = {
  class: {
    title: 'class brain',
    empty: 'nothing here yet.',
  },
  quiz: {
    title: 'what plato knows',
    empty: 'nothing yet. finish a plato session and this fills in.',
  },
}

/**
 * Read and hand-correct a brain.
 *
 * Editing matters because these feed the prompts. When plato decides you are
 * weak at something you actually know, or you want to seed a topic before an
 * exam, this is where you fix it.
 */
export function BrainPanel({ classId, brainType = 'quiz' }: BrainPanelProps) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const queryKey = ['brain', classId, brainType]

  const {
    data: brain,
    isLoading,
    isError,
  } = useQuery({
    queryKey,
    queryFn: () => brainsApi.getClass(classId, brainType),
  })

  const save = useMutation({
    mutationFn: (content: string) => brainsApi.update(brain!.id, content),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKey, updated)
      setEditing(false)
    },
  })

  const labels = LABELS[brainType]

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary" />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {labels.title}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {brain && brain.update_count > 0 && !editing && (
            <span className="text-[10px] text-muted-foreground/60 lowercase">
              {brain.update_count} update{brain.update_count === 1 ? '' : 's'}
            </span>
          )}
          {brain && !editing && (
            <button
              type="button"
              onClick={() => {
                setDraft(brain.content)
                setEditing(true)
              }}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="edit"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
        </div>
      )}

      {isError && (
        <p className="text-xs text-destructive/70 lowercase">
          could not load this record.
        </p>
      )}

      {brain && !editing && (
        <>
          {brain.content.trim() ? (
            <div className="prose prose-sm max-w-none text-xs leading-relaxed max-h-[300px] overflow-y-auto">
              <Markdown>{brain.content}</Markdown>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/50 lowercase italic">
              {labels.empty}
            </p>
          )}
        </>
      )}

      {brain && editing && (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={12}
            className="w-full rounded-lg border border-border bg-background p-3 text-xs font-mono resize-y focus:outline-none focus:ring-2 focus:ring-foreground/20"
          />
          {save.isError && (
            <p className="text-xs text-destructive/70 lowercase">
              could not save. try again.
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="gap-1.5 lowercase"
              disabled={save.isPending}
              onClick={() => save.mutate(draft)}
            >
              <Check className="w-3.5 h-3.5" />
              {save.isPending ? 'saving...' : 'save'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 lowercase"
              disabled={save.isPending}
              onClick={() => setEditing(false)}
            >
              <X className="w-3.5 h-3.5" />
              cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
