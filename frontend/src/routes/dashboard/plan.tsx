import { useState, useEffect, useCallback, useRef } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Markdown } from 'tiptap-markdown'
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  CheckSquare,
  Heading1,
  Heading2,
  Undo,
  Redo,
  Loader2,
  Cloud,
  CloudOff,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { weeklyPlanApi } from '@/lib/api'

// =============================================================================
// Route
// =============================================================================

export const Route = createFileRoute('/dashboard/plan')({
  component: WeeklyPlanPage,
})

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_CONTENT = `# weekly plan

## goals
- 

## monday
- 

## tuesday
- 

## wednesday
- 

## thursday
- 

## friday
- 

## weekend
- 

## notes
`

const SAVE_DEBOUNCE_MS = 1000

// =============================================================================
// Helpers
// =============================================================================

/** Return the Monday of the current week as YYYY-MM-DD. */
function getCurrentWeekMonday(): string {
  const today = new Date()
  const day = today.getDay() // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? -6 : 1 - day // adjust to Monday
  const monday = new Date(today)
  monday.setDate(today.getDate() + diff)
  return monday.toISOString().split('T')[0]
}

// =============================================================================
// Main Component
// =============================================================================

function WeeklyPlanPage() {
  const queryClient = useQueryClient()
  const weekStart = getCurrentWeekMonday()
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editorReadyRef = useRef(false)

  // Fetch the current week's plan
  const {
    data: plan,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['weekly-plan', weekStart],
    queryFn: () => weeklyPlanApi.get(weekStart),
  })

  // Upsert mutation
  const upsertMutation = useMutation({
    mutationFn: weeklyPlanApi.upsert,
    onSuccess: (data) => {
      queryClient.setQueryData(['weekly-plan', weekStart], data)
      setLastSaved(new Date())
      setIsSaving(false)
    },
    onError: () => {
      setIsSaving(false)
    },
  })

  // Debounced save
  const saveContent = useCallback(
    (content: string) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
      setIsSaving(true)
      debounceRef.current = setTimeout(() => {
        upsertMutation.mutate({ week_start: weekStart, content })
      }, SAVE_DEBOUNCE_MS)
    },
    [weekStart, upsertMutation]
  )

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])

  // Determine initial content
  const initialContent = plan?.content ?? DEFAULT_CONTENT

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Placeholder.configure({
        placeholder: 'Start planning your week...',
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Markdown.configure({
        html: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class:
          'prose prose-sm prose-invert max-w-none focus:outline-none min-h-[calc(100vh-200px)] p-4',
      },
    },
    onUpdate: ({ editor }) => {
      // Don't save during initial content load
      if (!editorReadyRef.current) return

      const storage = editor.storage as { markdown?: { getMarkdown: () => string } }
      const content = storage.markdown?.getMarkdown?.() || editor.getText()
      saveContent(content)
    },
  })

  // Set editor content when plan data loads
  useEffect(() => {
    if (editor && !isLoading) {
      // Set flag to false while we programmatically update content
      editorReadyRef.current = false
      editor.commands.setContent(initialContent)
      // Re-enable saving after content is set
      requestAnimationFrame(() => {
        editorReadyRef.current = true
      })
    }
  }, [editor, isLoading, initialContent])

  if (isLoading || !editor) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-32 bg-muted animate-pulse rounded" />
        <div className="h-[calc(100vh-200px)] bg-muted/50 animate-pulse rounded-lg" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground lowercase">weekly plan</h1>
          <p className="text-xs text-muted-foreground lowercase flex items-center gap-1.5">
            {isError ? (
              <>
                <CloudOff className="w-3 h-3" />
                <span>failed to load — editing locally</span>
              </>
            ) : isSaving ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>saving...</span>
              </>
            ) : lastSaved ? (
              <>
                <Cloud className="w-3 h-3" />
                <span>
                  saved {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </>
            ) : (
              'auto-saves as you type'
            )}
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-1 p-2 glass-card rounded-lg">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          isActive={editor.isActive('heading', { level: 1 })}
          title="Heading 1"
        >
          <Heading1 className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor.isActive('heading', { level: 2 })}
          title="Heading 2"
        >
          <Heading2 className="w-4 h-4" />
        </ToolbarButton>

        <div className="w-px h-5 bg-border mx-1" />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive('bold')}
          title="Bold"
        >
          <Bold className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive('italic')}
          title="Italic"
        >
          <Italic className="w-4 h-4" />
        </ToolbarButton>

        <div className="w-px h-5 bg-border mx-1" />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive('bulletList')}
          title="Bullet List"
        >
          <List className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive('orderedList')}
          title="Numbered List"
        >
          <ListOrdered className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          isActive={editor.isActive('taskList')}
          title="Task List"
        >
          <CheckSquare className="w-4 h-4" />
        </ToolbarButton>

        <div className="w-px h-5 bg-border mx-1" />

        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Undo"
        >
          <Undo className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Redo"
        >
          <Redo className="w-4 h-4" />
        </ToolbarButton>
      </div>

      {/* Editor */}
      <div className="glass-card rounded-lg overflow-hidden">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

// =============================================================================
// Toolbar Button
// =============================================================================

function ToolbarButton({
  onClick,
  isActive,
  disabled,
  title,
  children,
}: {
  onClick: () => void
  isActive?: boolean
  disabled?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className={`h-8 w-8 p-0 ${isActive ? 'bg-accent text-accent-foreground' : ''}`}
      title={title}
    >
      {children}
    </Button>
  )
}
