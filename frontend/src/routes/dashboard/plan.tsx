import { useState, useEffect, useCallback } from 'react'
import { createFileRoute } from '@tanstack/react-router'
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
} from 'lucide-react'

import { Button } from '@/components/ui/button'

// =============================================================================
// Route
// =============================================================================

export const Route = createFileRoute('/dashboard/plan')({
  component: WeeklyPlanPage,
})

// =============================================================================
// Constants
// =============================================================================

const STORAGE_KEY = 'helm-weekly-plan'

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

// =============================================================================
// Main Component
// =============================================================================

function WeeklyPlanPage() {
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

  // Load saved content
  const getSavedContent = useCallback(() => {
    if (typeof window === 'undefined') return DEFAULT_CONTENT
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved || DEFAULT_CONTENT
  }, [])

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
    content: getSavedContent(),
    editorProps: {
      attributes: {
        class:
          'prose prose-sm prose-invert max-w-none focus:outline-none min-h-[calc(100vh-200px)] p-4',
      },
    },
    onUpdate: ({ editor }) => {
      // Auto-save on change
      const storage = editor.storage as { markdown?: { getMarkdown: () => string } }
      const content = storage.markdown?.getMarkdown?.() || editor.getText()
      localStorage.setItem(STORAGE_KEY, content)
      setLastSaved(new Date())
    },
  })

  // Set initial content after mount
  useEffect(() => {
    if (editor && typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved && editor.isEmpty) {
        editor.commands.setContent(saved)
      }
    }
  }, [editor])

  if (!editor) {
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
          <p className="text-xs text-muted-foreground lowercase">
            {lastSaved
              ? `saved ${lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : 'auto-saves as you type'}
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
