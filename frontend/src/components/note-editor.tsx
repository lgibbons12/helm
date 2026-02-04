import { useCallback, useEffect, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { Markdown } from 'tiptap-markdown'
import { common, createLowlight } from 'lowlight'
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Heading1,
  Heading2,
  Heading3,
  Link as LinkIcon,
  Loader2,
  Check,
  AlertCircle,
  Save,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// Create lowlight instance with common languages
const lowlight = createLowlight(common)

// =============================================================================
// Types
// =============================================================================

interface NoteEditorProps {
  initialTitle?: string
  initialContent?: string
  onSave: (title: string, content: string) => Promise<void>
  readOnly?: boolean
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'unsaved'

// =============================================================================
// Slash Command Menu
// =============================================================================

interface SlashMenuItem {
  title: string
  description: string
  icon: React.ReactNode
  command: (editor: ReturnType<typeof useEditor>) => void
}

const slashMenuItems: SlashMenuItem[] = [
  {
    title: 'heading 1',
    description: 'large section heading',
    icon: <Heading1 className="w-4 h-4" />,
    command: (editor) => editor?.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    title: 'heading 2',
    description: 'medium section heading',
    icon: <Heading2 className="w-4 h-4" />,
    command: (editor) => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    title: 'heading 3',
    description: 'small section heading',
    icon: <Heading3 className="w-4 h-4" />,
    command: (editor) => editor?.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    title: 'bullet list',
    description: 'create a simple list',
    icon: <List className="w-4 h-4" />,
    command: (editor) => editor?.chain().focus().toggleBulletList().run(),
  },
  {
    title: 'numbered list',
    description: 'create a numbered list',
    icon: <ListOrdered className="w-4 h-4" />,
    command: (editor) => editor?.chain().focus().toggleOrderedList().run(),
  },
  {
    title: 'task list',
    description: 'track tasks with checkboxes',
    icon: <CheckSquare className="w-4 h-4" />,
    command: (editor) => editor?.chain().focus().toggleTaskList().run(),
  },
  {
    title: 'code block',
    description: 'add a code snippet',
    icon: <Code className="w-4 h-4" />,
    command: (editor) => editor?.chain().focus().toggleCodeBlock().run(),
  },
  {
    title: 'quote',
    description: 'capture a quote',
    icon: <Quote className="w-4 h-4" />,
    command: (editor) => editor?.chain().focus().toggleBlockquote().run(),
  },
]

// =============================================================================
// Component
// =============================================================================

export function NoteEditor({
  initialTitle = '',
  initialContent = '',
  onSave,
  readOnly = false,
}: NoteEditorProps) {
  const [title, setTitle] = useState(initialTitle)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [showSlashMenu, setShowSlashMenu] = useState(false)
  const [slashMenuIndex, setSlashMenuIndex] = useState(0)
  const [slashMenuFilter, setSlashMenuFilter] = useState('')
  const [lastSavedContent, setLastSavedContent] = useState(initialContent)
  const [lastSavedTitle, setLastSavedTitle] = useState(initialTitle)

  // Initialize editor
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false, // Use CodeBlockLowlight instead
      }),
      Placeholder.configure({
        placeholder: 'type "/" for commands, or just start writing...',
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-accent underline cursor-pointer',
        },
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      CodeBlockLowlight.configure({
        lowlight,
      }),
      Markdown.configure({
        html: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content: initialContent,
    editable: !readOnly,
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[200px]',
      },
      handleKeyDown: (_view, event) => {
        // Handle slash command
        if (event.key === '/' && !showSlashMenu) {
          setShowSlashMenu(true)
          setSlashMenuIndex(0)
          setSlashMenuFilter('')
          return false
        }

        // Handle slash menu navigation
        if (showSlashMenu) {
          const filteredItems = getFilteredSlashItems()

          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setSlashMenuIndex((prev) => (prev + 1) % filteredItems.length)
            return true
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            setSlashMenuIndex((prev) => (prev - 1 + filteredItems.length) % filteredItems.length)
            return true
          }
          if (event.key === 'Enter') {
            event.preventDefault()
            if (filteredItems[slashMenuIndex]) {
              executeSlashCommand(filteredItems[slashMenuIndex])
            }
            return true
          }
          if (event.key === 'Escape') {
            setShowSlashMenu(false)
            return true
          }
          if (event.key === 'Backspace' && slashMenuFilter === '') {
            setShowSlashMenu(false)
            return false
          }
          // Update filter on typing
          if (event.key.length === 1) {
            setSlashMenuFilter((prev) => prev + event.key)
            setSlashMenuIndex(0)
          } else if (event.key === 'Backspace') {
            setSlashMenuFilter((prev) => prev.slice(0, -1))
            setSlashMenuIndex(0)
          }
        }

        return false
      },
    },
    onUpdate: () => {
      // Mark as unsaved when content changes
      setSaveStatus('unsaved')
    },
  })

  // Get filtered slash menu items
  const getFilteredSlashItems = useCallback(() => {
    if (!slashMenuFilter) return slashMenuItems
    return slashMenuItems.filter(
      (item) =>
        item.title.includes(slashMenuFilter.toLowerCase()) ||
        item.description.includes(slashMenuFilter.toLowerCase())
    )
  }, [slashMenuFilter])

  // Execute slash command
  const executeSlashCommand = useCallback(
    (item: SlashMenuItem) => {
      // Remove the slash and filter text
      editor?.chain().focus().deleteRange({
        from: editor.state.selection.from - slashMenuFilter.length - 1,
        to: editor.state.selection.from,
      }).run()
      item.command(editor)
      setShowSlashMenu(false)
      setSlashMenuFilter('')
    },
    [editor, slashMenuFilter]
  )

  // Get markdown content from editor
  const getMarkdown = useCallback(() => {
    if (!editor) return ''
    // tiptap-markdown extension adds this to storage
    const storage = editor.storage as { markdown?: { getMarkdown: () => string } }
    if (storage.markdown?.getMarkdown) {
      return storage.markdown.getMarkdown()
    }
    // Fallback to plain text extraction
    return editor.getText()
  }, [editor])

  // Manual save function
  const handleSave = useCallback(async () => {
    if (readOnly || !editor) return

    const content = getMarkdown()
    
    // Skip if nothing changed
    if (content === lastSavedContent && title === lastSavedTitle) {
      return
    }

    setSaveStatus('saving')

    try {
      await onSave(title, content)
      setLastSavedContent(content)
      setLastSavedTitle(title)
      setSaveStatus('saved')
      // Reset to idle after showing saved status
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch (error) {
      console.error('Failed to save note:', error)
      setSaveStatus('error')
    }
  }, [editor, getMarkdown, lastSavedContent, lastSavedTitle, onSave, readOnly, title])

  // Handle Ctrl+S to save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleSave])

  // Track title changes for unsaved state
  const handleTitleChange = useCallback((newTitle: string) => {
    setTitle(newTitle)
    if (newTitle !== lastSavedTitle) {
      setSaveStatus('unsaved')
    }
  }, [lastSavedTitle])

  // Update content when initial values change (e.g., loading different note)
  useEffect(() => {
    if (editor && initialContent !== lastSavedContent) {
      editor.commands.setContent(initialContent)
      setLastSavedContent(initialContent)
    }
  }, [initialContent, editor, lastSavedContent])

  useEffect(() => {
    if (initialTitle !== lastSavedTitle) {
      setTitle(initialTitle)
      setLastSavedTitle(initialTitle)
    }
  }, [initialTitle, lastSavedTitle])

  if (!editor) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const filteredSlashItems = getFilteredSlashItems()

  return (
    <div className="space-y-4">
      {/* Header with title and save status */}
      <div className="flex items-center gap-4">
        <Input
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="untitled"
          className="text-xl font-semibold border-0 bg-transparent focus-visible:ring-0 px-0"
          disabled={readOnly}
        />
        <div className="flex items-center gap-2 flex-shrink-0">
          <SaveStatusIndicator status={saveStatus} />
          {!readOnly && (
            <Button
              variant={saveStatus === 'unsaved' ? 'default' : 'ghost'}
              size="sm"
              onClick={handleSave}
              disabled={saveStatus === 'saving' || saveStatus === 'idle' || saveStatus === 'saved'}
              className="gap-1.5 lowercase"
            >
              {saveStatus === 'saving' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              save
            </Button>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 pb-2 border-b border-border/50">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive('bold')}
          title="bold"
        >
          <Bold className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive('italic')}
          title="italic"
        >
          <Italic className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive('strike')}
          title="strikethrough"
        >
          <Strikethrough className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCode().run()}
          active={editor.isActive('code')}
          title="inline code"
        >
          <Code className="w-4 h-4" />
        </ToolbarButton>
        <div className="w-px h-4 bg-border mx-1" />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          active={editor.isActive('heading', { level: 1 })}
          title="heading 1"
        >
          <Heading1 className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive('heading', { level: 2 })}
          title="heading 2"
        >
          <Heading2 className="w-4 h-4" />
        </ToolbarButton>
        <div className="w-px h-4 bg-border mx-1" />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')}
          title="bullet list"
        >
          <List className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive('orderedList')}
          title="numbered list"
        >
          <ListOrdered className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          active={editor.isActive('taskList')}
          title="task list"
        >
          <CheckSquare className="w-4 h-4" />
        </ToolbarButton>
        <div className="w-px h-4 bg-border mx-1" />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive('blockquote')}
          title="quote"
        >
          <Quote className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          active={editor.isActive('codeBlock')}
          title="code block"
        >
          <Code className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => {
            const url = window.prompt('enter url:')
            if (url) {
              editor.chain().focus().setLink({ href: url }).run()
            }
          }}
          active={editor.isActive('link')}
          title="link"
        >
          <LinkIcon className="w-4 h-4" />
        </ToolbarButton>
      </div>

      {/* Editor */}
      <div className="relative">
        <EditorContent
          editor={editor}
          className="min-h-[300px] p-4 glass rounded-lg"
        />

        {/* Slash command menu */}
        {showSlashMenu && (
          <div className="absolute left-2 lg:left-4 mt-2 w-[calc(100%-1rem)] lg:w-64 max-w-[calc(100vw-2rem)] lg:max-w-none glass-strong rounded-lg shadow-lg border border-border/50 overflow-hidden z-50">
            <div className="p-2 border-b border-border/50">
              <span className="text-xs text-muted-foreground">
                {slashMenuFilter ? `/${slashMenuFilter}` : 'type to filter...'}
              </span>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {filteredSlashItems.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground text-center">
                  no matching commands
                </div>
              ) : (
                filteredSlashItems.map((item, index) => (
                  <button
                    key={item.title}
                    className={`w-full flex items-center gap-3 p-3 text-left hover:bg-muted/50 transition-colors ${
                      index === slashMenuIndex ? 'bg-muted/50' : ''
                    }`}
                    onClick={() => executeSlashCommand(item)}
                  >
                    <div className="flex-shrink-0 w-8 h-8 rounded bg-muted flex items-center justify-center">
                      {item.icon}
                    </div>
                    <div>
                      <div className="text-sm font-medium">{item.title}</div>
                      <div className="text-xs text-muted-foreground">{item.description}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

// =============================================================================
// Helper Components
// =============================================================================

function SaveStatusIndicator({ status }: { status: SaveStatus }) {
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      {status === 'unsaved' && (
        <span className="text-amber-500">unsaved</span>
      )}
      {status === 'saving' && (
        <span>saving...</span>
      )}
      {status === 'saved' && (
        <>
          <Check className="w-3 h-3 text-green-500" />
          <span>saved</span>
        </>
      )}
      {status === 'error' && (
        <>
          <AlertCircle className="w-3 h-3 text-destructive" />
          <span>failed</span>
        </>
      )}
    </div>
  )
}

interface ToolbarButtonProps {
  onClick: () => void
  active?: boolean
  title: string
  children: React.ReactNode
  size?: 'sm' | 'default'
}

function ToolbarButton({ onClick, active, title, children, size = 'default' }: ToolbarButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onClick}
      title={title}
      className={`${size === 'sm' ? 'h-6 w-6' : 'h-8 w-8'} ${
        active ? 'bg-muted text-foreground' : 'text-muted-foreground'
      }`}
    >
      {children}
    </Button>
  )
}
