import { useState, useCallback } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2, ArrowLeft, FileText } from 'lucide-react'

import { notesApi, type Note, type NoteCreate } from '../../lib/api'
import { NotesList } from '@/components/notes-list'
import { NoteEditor } from '@/components/note-editor'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

export const Route = createFileRoute('/dashboard/notes')({
  component: NotesPage,
})

function NotesPage() {
  const queryClient = useQueryClient()
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  // Create new note mutation
  const createNote = useMutation({
    mutationFn: (data: NoteCreate) => notesApi.create(data),
    onSuccess: (newNote) => {
      queryClient.invalidateQueries({ queryKey: ['notes'] })
      setSelectedNote(newNote)
    },
  })

  // Update note mutation
  const updateNote = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { title: string; content_text: string } }) =>
      notesApi.update(id, data),
    onSuccess: (updatedNote) => {
      queryClient.invalidateQueries({ queryKey: ['notes'] })
      setSelectedNote(updatedNote)
    },
  })

  // Delete note mutation
  const deleteNote = useMutation({
    mutationFn: (id: string) => notesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] })
      setSelectedNote(null)
      setDeleteDialogOpen(false)
    },
  })

  // Handle creating a new note
  const handleNewNote = useCallback(() => {
    createNote.mutate({
      title: 'untitled',
      content_text: '',
    })
  }, [createNote])

  // Handle saving note content
  const handleSave = useCallback(
    async (title: string, content: string) => {
      if (!selectedNote) return
      await updateNote.mutateAsync({
        id: selectedNote.id,
        data: { title, content_text: content },
      })
    },
    [selectedNote, updateNote]
  )

  // Handle delete confirmation
  const handleDelete = useCallback(() => {
    if (!selectedNote) return
    deleteNote.mutate(selectedNote.id)
  }, [selectedNote, deleteNote])

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-6">
      {/* Sidebar with notes list */}
      <div className="w-72 flex-shrink-0 glass rounded-lg overflow-hidden">
        <NotesList
          selectedNoteId={selectedNote?.id}
          onSelectNote={setSelectedNote}
          onNewNote={handleNewNote}
        />
      </div>

      {/* Main editor area */}
      <div className="flex-1 glass rounded-lg overflow-hidden">
        {selectedNote ? (
          <div className="h-full flex flex-col">
            {/* Editor header */}
            <div className="flex items-center justify-between p-4 border-b border-border/50">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedNote(null)}
                className="gap-1 text-xs lowercase"
              >
                <ArrowLeft className="w-3 h-3" />
                back
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeleteDialogOpen(true)}
                className="gap-1 text-xs text-destructive hover:text-destructive lowercase"
              >
                <Trash2 className="w-3 h-3" />
                delete
              </Button>
            </div>

            {/* Editor */}
            <div className="flex-1 overflow-y-auto p-6">
              <NoteEditor
                key={selectedNote.id}
                initialTitle={selectedNote.title}
                initialContent={selectedNote.content_text || ''}
                onSave={handleSave}
              />
            </div>
          </div>
        ) : (
          <EmptyState onNewNote={handleNewNote} isCreating={createNote.isPending} />
        )}
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="glass-strong border-0">
          <DialogHeader>
            <DialogTitle className="lowercase">delete note</DialogTitle>
            <DialogDescription className="lowercase">
              are you sure you want to delete "{selectedNote?.title}"? this action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              className="lowercase"
            >
              cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteNote.isPending}
              className="lowercase"
            >
              {deleteNote.isPending ? 'deleting...' : 'delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function EmptyState({
  onNewNote,
  isCreating,
}: {
  onNewNote: () => void
  isCreating: boolean
}) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto">
          <FileText className="w-8 h-8 text-muted-foreground" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-1">no note selected</h3>
          <p className="text-sm text-muted-foreground">
            select a note from the sidebar or create a new one
          </p>
        </div>
        <Button onClick={onNewNote} disabled={isCreating} className="lowercase">
          {isCreating ? 'creating...' : 'create new note'}
        </Button>
      </div>
    </div>
  )
}
