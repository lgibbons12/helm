import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  ChevronDown,
  ChevronRight,
  BookOpen,
  ClipboardList,
  StickyNote,
  Clock,
  Tag,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

import { notesApi, classesApi, assignmentsApi, type Note, type Class, type Assignment } from '../lib/api'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

// =============================================================================
// Types
// =============================================================================

interface NotesTreeProps {
  searchQuery?: string
}

interface TreeNode {
  type: 'class' | 'assignment' | 'standalone' | 'note'
  id: string
  name: string
  notes?: Note[]
  children?: TreeNode[]
}

// =============================================================================
// Component
// =============================================================================

export function NotesTree({ searchQuery = '' }: NotesTreeProps) {
  const navigate = useNavigate()
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())

  // Fetch all data
  const { data: notes, isLoading: notesLoading } = useQuery({
    queryKey: ['notes'],
    queryFn: () => notesApi.list({}),
  })

  const { data: classes, isLoading: classesLoading } = useQuery({
    queryKey: ['classes'],
    queryFn: () => classesApi.list(),
  })

  const { data: assignments, isLoading: assignmentsLoading } = useQuery({
    queryKey: ['assignments'],
    queryFn: () => assignmentsApi.list(),
  })

  const isLoading = notesLoading || classesLoading || assignmentsLoading

  // Filter notes by search query
  const filteredNotes = useMemo(() => {
    if (!notes) return []
    if (!searchQuery) return notes

    const query = searchQuery.toLowerCase()
    return notes.filter(
      (note) =>
        note.title.toLowerCase().includes(query) ||
        (note.content_text?.toLowerCase().includes(query) ?? false)
    )
  }, [notes, searchQuery])

  // Build tree structure
  const treeData = useMemo(() => {
    if (!filteredNotes || !classes || !assignments) return []

    const classMap = new Map<string, Class>()
    classes.forEach((c) => classMap.set(c.id, c))

    const assignmentMap = new Map<string, Assignment>()
    const assignmentsByClass = new Map<string, Assignment[]>()
    assignments.forEach((a) => {
      assignmentMap.set(a.id, a)
      if (a.class_id) {
        const existing = assignmentsByClass.get(a.class_id) || []
        assignmentsByClass.set(a.class_id, [...existing, a])
      }
    })

    // Group notes
    const notesByClass = new Map<string, Note[]>()
    const notesByAssignment = new Map<string, Note[]>()
    const standaloneNotes: Note[] = []

    filteredNotes.forEach((note) => {
      if (note.assignment_id) {
        const existing = notesByAssignment.get(note.assignment_id) || []
        notesByAssignment.set(note.assignment_id, [...existing, note])
      } else if (note.class_id) {
        const existing = notesByClass.get(note.class_id) || []
        notesByClass.set(note.class_id, [...existing, note])
      } else {
        standaloneNotes.push(note)
      }
    })

    const tree: TreeNode[] = []

    // Build class nodes
    classes.forEach((cls) => {
      const classNotes = notesByClass.get(cls.id) || []
      const classAssignments = assignmentsByClass.get(cls.id) || []

      // Build assignment nodes for this class
      const assignmentNodes: TreeNode[] = classAssignments
        .filter((assignment) => {
          const assignmentNotes = notesByAssignment.get(assignment.id) || []
          return assignmentNotes.length > 0
        })
        .map((assignment) => ({
          type: 'assignment' as const,
          id: `assignment-${assignment.id}`,
          name: assignment.title,
          notes: notesByAssignment.get(assignment.id) || [],
        }))

      // Only include class if it has notes or assignments with notes
      if (classNotes.length > 0 || assignmentNodes.length > 0) {
        tree.push({
          type: 'class',
          id: `class-${cls.id}`,
          name: cls.name,
          notes: classNotes,
          children: assignmentNodes,
        })
      }
    })

    // Add standalone section if there are standalone notes
    if (standaloneNotes.length > 0) {
      tree.push({
        type: 'standalone',
        id: 'standalone',
        name: 'standalone notes',
        notes: standaloneNotes,
      })
    }

    return tree
  }, [filteredNotes, classes, assignments])

  const toggleNode = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }

  const handleNoteClick = (noteId: string) => {
    navigate({ to: '/dashboard/notes/$noteId', params: { noteId } })
  }

  if (isLoading) {
    return <NotesTreeLoading />
  }

  if (treeData.length === 0) {
    return (
      <div className="p-6 text-center">
        <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center mx-auto mb-3">
          <StickyNote className="w-6 h-6 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">
          {searchQuery ? 'no matching notes found' : 'no notes yet'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2 pb-4">
      {treeData.map((node) => (
        <TreeNodeComponent
          key={node.id}
          node={node}
          isExpanded={expandedNodes.has(node.id)}
          onToggle={() => toggleNode(node.id)}
          onNoteClick={handleNoteClick}
          expandedNodes={expandedNodes}
          onToggleChild={toggleNode}
        />
      ))}
    </div>
  )
}

// =============================================================================
// TreeNode Component
// =============================================================================

interface TreeNodeComponentProps {
  node: TreeNode
  isExpanded: boolean
  onToggle: () => void
  onNoteClick: (noteId: string) => void
  expandedNodes: Set<string>
  onToggleChild: (nodeId: string) => void
  depth?: number
}

function TreeNodeComponent({
  node,
  isExpanded,
  onToggle,
  onNoteClick,
  expandedNodes,
  onToggleChild,
  depth = 0,
}: TreeNodeComponentProps) {
  const hasChildren = node.children && node.children.length > 0
  const hasNotes = node.notes && node.notes.length > 0
  const noteCount = (node.notes?.length || 0) + (node.children?.reduce((acc, child) => acc + (child.notes?.length || 0), 0) || 0)

  const getIcon = () => {
    switch (node.type) {
      case 'class':
        return <BookOpen className="w-4 h-4" />
      case 'assignment':
        return <ClipboardList className="w-4 h-4" />
      case 'standalone':
        return <StickyNote className="w-4 h-4" />
      default:
        return null
    }
  }

  return (
    <div>
      {/* Node header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 p-3 hover:bg-muted/50 rounded-lg transition-colors text-left group"
      >
        {hasChildren || hasNotes ? (
          isExpanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          )
        ) : (
          <div className="w-4" />
        )}
        <div className="flex-shrink-0 text-muted-foreground group-hover:text-foreground transition-colors">
          {getIcon()}
        </div>
        <span className="text-sm font-medium text-foreground lowercase flex-1 truncate">
          {node.name}
        </span>
        <Badge variant="secondary" className="text-xs">
          {noteCount}
        </Badge>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className={`space-y-1 ${depth === 0 ? 'ml-6' : 'ml-10'}`}>
          {/* Direct notes */}
          {hasNotes && (
            <div className="space-y-1">
              {node.notes!.map((note) => (
                <NoteItem
                  key={note.id}
                  note={note}
                  onClick={() => onNoteClick(note.id)}
                />
              ))}
            </div>
          )}

          {/* Child nodes */}
          {hasChildren && (
            <div className="space-y-1">
              {node.children!.map((child) => (
                <TreeNodeComponent
                  key={child.id}
                  node={child}
                  isExpanded={expandedNodes.has(child.id)}
                  onToggle={() => onToggleChild(child.id)}
                  onNoteClick={onNoteClick}
                  expandedNodes={expandedNodes}
                  onToggleChild={onToggleChild}
                  depth={depth + 1}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// =============================================================================
// NoteItem Component
// =============================================================================

interface NoteItemProps {
  note: Note
  onClick: () => void
}

function NoteItem({ note, onClick }: NoteItemProps) {
  // Extract first ~100 chars of content for excerpt
  const excerpt = note.content_text
    ? note.content_text.slice(0, 100).replace(/\n/g, ' ').trim() +
      (note.content_text.length > 100 ? '...' : '')
    : 'no content'

  const updatedAgo = formatDistanceToNow(new Date(note.updated_at), {
    addSuffix: true,
  })

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-3 hover:bg-muted/50 rounded-lg transition-colors border border-border/30"
    >
      <div className="space-y-2">
        {/* Title */}
        <h4 className="text-sm font-medium text-foreground lowercase truncate">
          {note.title || 'untitled'}
        </h4>

        {/* Excerpt */}
        <p className="text-xs text-muted-foreground line-clamp-2 lowercase">
          {excerpt}
        </p>

        {/* Metadata row */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Last updated */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground/70">
            <Clock className="w-3 h-3" />
            <span>{updatedAgo}</span>
          </div>

          {/* Tags */}
          {note.tags && note.tags.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <Tag className="w-3 h-3 text-muted-foreground/70" />
              {note.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs lowercase px-1.5 py-0">
                  {tag}
                </Badge>
              ))}
              {note.tags.length > 3 && (
                <span className="text-xs text-muted-foreground/70">
                  +{note.tags.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </button>
  )
}

// =============================================================================
// Loading State
// =============================================================================

function NotesTreeLoading() {
  return (
    <div className="space-y-3 p-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <div className="ml-6 space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </div>
      ))}
    </div>
  )
}
