import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Search, FileText, Clock, BookOpen, ClipboardList, StickyNote } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

import { notesApi, type Note } from '../lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

// =============================================================================
// Types
// =============================================================================

interface NotesListProps {
  classId?: string
  assignmentId?: string
  standalone?: boolean
  selectedNoteId?: string
  onSelectNote: (note: Note) => void
  onNewNote: () => void
}

interface GroupedNotes {
  classNotes: Map<string, { className: string; notes: Note[] }>
  assignmentNotes: Map<string, { assignmentTitle: string; className: string | null; notes: Note[] }>
  standaloneNotes: Note[]
}

// =============================================================================
// Component
// =============================================================================

export function NotesList({
  classId,
  assignmentId,
  standalone,
  selectedNoteId,
  onSelectNote,
  onNewNote,
}: NotesListProps) {
  const [searchQuery, setSearchQuery] = useState('')

  // Determine if we should show grouped view
  // Only show grouped view when listing ALL notes (no filters)
  const showGrouped = !classId && !assignmentId && !standalone

  // Fetch notes
  const {
    data: notes,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['notes', { classId, assignmentId, standalone }],
    queryFn: () =>
      notesApi.list({
        class_id: classId,
        assignment_id: assignmentId,
        standalone,
      }),
  })

  // Filter notes by search query (local filter)
  const filteredNotes = useMemo(() => {
    if (!notes) return []
    if (!searchQuery) return notes
    
    const query = searchQuery.toLowerCase()
    return notes.filter((note) =>
      note.title.toLowerCase().includes(query) ||
      (note.content_text?.toLowerCase().includes(query) ?? false)
    )
  }, [notes, searchQuery])

  // Group notes by class, assignment, and standalone
  const groupedNotes = useMemo((): GroupedNotes => {
    const classNotes = new Map<string, { className: string; notes: Note[] }>()
    const assignmentNotes = new Map<string, { assignmentTitle: string; className: string | null; notes: Note[] }>()
    const standaloneNotes: Note[] = []

    for (const note of filteredNotes) {
      if (note.assignment_id) {
        // Assignment note
        const key = note.assignment_id
        const existing = assignmentNotes.get(key)
        if (existing) {
          existing.notes.push(note)
        } else {
          assignmentNotes.set(key, {
            assignmentTitle: note.assignment_title || 'Unknown Assignment',
            className: note.class_name,
            notes: [note],
          })
        }
      } else if (note.class_id) {
        // Class note (no assignment)
        const key = note.class_id
        const existing = classNotes.get(key)
        if (existing) {
          existing.notes.push(note)
        } else {
          classNotes.set(key, {
            className: note.class_name || 'Unknown Class',
            notes: [note],
          })
        }
      } else {
        // Standalone note
        standaloneNotes.push(note)
      }
    }

    return { classNotes, assignmentNotes, standaloneNotes }
  }, [filteredNotes])

  const hasAnyNotes = filteredNotes.length > 0

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border/50 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">notes</h2>
          <Button
            size="sm"
            variant="ghost"
            onClick={onNewNote}
            className="gap-1 h-7 text-xs lowercase"
          >
            <Plus className="w-3 h-3" />
            new
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <Input
            placeholder="search notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-7 pl-7 text-xs lowercase"
          />
        </div>
      </div>

      {/* Notes list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <NotesListLoading />
        ) : error ? (
          <NotesListError />
        ) : hasAnyNotes ? (
          showGrouped ? (
            <GroupedNotesList
              groupedNotes={groupedNotes}
              selectedNoteId={selectedNoteId}
              onSelectNote={onSelectNote}
            />
          ) : (
            <div className="divide-y divide-border/30">
              {filteredNotes.map((note) => (
                <NoteListItem
                  key={note.id}
                  note={note}
                  isSelected={note.id === selectedNoteId}
                  onClick={() => onSelectNote(note)}
                />
              ))}
            </div>
          )
        ) : (
          <NotesListEmpty
            hasSearch={!!searchQuery}
            onNewNote={onNewNote}
          />
        )}
      </div>
    </div>
  )
}

// =============================================================================
// GroupedNotesList
// =============================================================================

interface GroupedNotesListProps {
  groupedNotes: GroupedNotes
  selectedNoteId?: string
  onSelectNote: (note: Note) => void
}

function GroupedNotesList({ groupedNotes, selectedNoteId, onSelectNote }: GroupedNotesListProps) {
  const { classNotes, assignmentNotes, standaloneNotes } = groupedNotes

  return (
    <div className="pb-4">
      {/* Class notes */}
      {classNotes.size > 0 && (
        <div>
          {Array.from(classNotes.entries()).map(([classId, { className, notes }]) => (
            <div key={classId}>
              <SectionHeader
                icon={<BookOpen className="w-3 h-3" />}
                label={className}
              />
              <div className="divide-y divide-border/30">
                {notes.map((note) => (
                  <NoteListItem
                    key={note.id}
                    note={note}
                    isSelected={note.id === selectedNoteId}
                    onClick={() => onSelectNote(note)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Assignment notes */}
      {assignmentNotes.size > 0 && (
        <div>
          {Array.from(assignmentNotes.entries()).map(([assignmentId, { assignmentTitle, className, notes }]) => (
            <div key={assignmentId}>
              <SectionHeader
                icon={<ClipboardList className="w-3 h-3" />}
                label={assignmentTitle}
                sublabel={className || undefined}
              />
              <div className="divide-y divide-border/30">
                {notes.map((note) => (
                  <NoteListItem
                    key={note.id}
                    note={note}
                    isSelected={note.id === selectedNoteId}
                    onClick={() => onSelectNote(note)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Standalone notes */}
      {standaloneNotes.length > 0 && (
        <div>
          <SectionHeader
            icon={<StickyNote className="w-3 h-3" />}
            label="standalone"
          />
          <div className="divide-y divide-border/30">
            {standaloneNotes.map((note) => (
              <NoteListItem
                key={note.id}
                note={note}
                isSelected={note.id === selectedNoteId}
                onClick={() => onSelectNote(note)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// =============================================================================
// SectionHeader
// =============================================================================

interface SectionHeaderProps {
  icon: React.ReactNode
  label: string
  sublabel?: string
}

function SectionHeader({ icon, label, sublabel }: SectionHeaderProps) {
  return (
    <div className="px-3 py-2 bg-muted/30 border-y border-border/30 sticky top-0">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span className="font-medium lowercase truncate">{label}</span>
        {sublabel && (
          <>
            <span className="text-muted-foreground/50">·</span>
            <span className="text-muted-foreground/70 lowercase truncate">{sublabel}</span>
          </>
        )}
      </div>
    </div>
  )
}

// =============================================================================
// NoteListItem
// =============================================================================

interface NoteListItemProps {
  note: Note
  isSelected: boolean
  onClick: () => void
}

function NoteListItem({ note, isSelected, onClick }: NoteListItemProps) {
  // Extract first ~80 chars of content for excerpt
  const excerpt = note.content_text
    ? note.content_text.slice(0, 80).replace(/\n/g, ' ').trim() +
      (note.content_text.length > 80 ? '...' : '')
    : 'no content'

  const updatedAgo = formatDistanceToNow(new Date(note.updated_at), {
    addSuffix: true,
  })

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 transition-colors hover:bg-muted/50 ${
        isSelected ? 'bg-muted/70' : ''
      }`}
    >
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-foreground truncate lowercase">
          {note.title || 'untitled'}
        </h3>
        <p className="text-xs text-muted-foreground line-clamp-2 lowercase">
          {excerpt}
        </p>
        <div className="flex items-center gap-1 text-xs text-muted-foreground/70">
          <Clock className="w-3 h-3" />
          <span>{updatedAgo}</span>
        </div>
      </div>
    </button>
  )
}

// =============================================================================
// Loading & Empty States
// =============================================================================

function NotesListLoading() {
  return (
    <div className="p-3 space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  )
}

function NotesListEmpty({
  hasSearch,
  onNewNote,
}: {
  hasSearch: boolean
  onNewNote: () => void
}) {
  return (
    <div className="p-6 text-center">
      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center mx-auto mb-3">
        <FileText className="w-5 h-5 text-muted-foreground" />
      </div>
      {hasSearch ? (
        <>
          <p className="text-sm text-muted-foreground mb-2">no matching notes</p>
          <p className="text-xs text-muted-foreground/70">
            try a different search term
          </p>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-3">no notes yet</p>
          <Button
            size="sm"
            variant="outline"
            onClick={onNewNote}
            className="gap-1 text-xs lowercase"
          >
            <Plus className="w-3 h-3" />
            create note
          </Button>
        </>
      )}
    </div>
  )
}

function NotesListError() {
  return (
    <div className="p-6 text-center">
      <p className="text-sm text-destructive">failed to load notes</p>
    </div>
  )
}
