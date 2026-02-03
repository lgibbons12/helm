import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Search, FileText, Clock } from 'lucide-react'
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
  const filteredNotes = notes?.filter((note) => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      note.title.toLowerCase().includes(query) ||
      (note.content_text?.toLowerCase().includes(query) ?? false)
    )
  })

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
        ) : filteredNotes && filteredNotes.length > 0 ? (
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
