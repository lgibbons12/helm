import { useCallback, useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Trash2, BookOpen, Briefcase } from 'lucide-react'

import { notesApi } from '../../../lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { NoteEditor } from '@/components/note-editor'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

export const Route = createFileRoute('/dashboard/notes/$noteId')({
  component: NoteDetailPage,
})

function NoteDetailPage() {
  const { noteId } = Route.useParams()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  // Fetch note details
  const {
    data: note,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['notes', noteId],
    queryFn: () => notesApi.get(noteId),
  })

  // Update note mutation
  const updateNote = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { title: string; content_text: string } }) =>
      notesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] })
    },
  })

  // Delete note mutation
  const deleteNote = useMutation({
    mutationFn: (id: string) => notesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] })
      navigate({ to: '/dashboard/notes' })
    },
  })

  // Handle saving note content
  const handleSave = useCallback(
    async (title: string, content: string) => {
      if (!note) return
      await updateNote.mutateAsync({
        id: note.id,
        data: { title, content_text: content },
      })
    },
    [note, updateNote]
  )

  // Handle delete confirmation
  const handleDelete = useCallback(() => {
    if (!note) return
    deleteNote.mutate(note.id)
  }, [note, deleteNote])

  if (isLoading) {
    return <NoteDetailLoading />
  }

  if (error || !note) {
    return <NoteDetailError />
  }

  return (
    <div className="space-y-6">
      {/* Header with back button and metadata */}
      <div className="flex items-center justify-between">
        <Link to="/dashboard/notes">
          <Button variant="ghost" size="sm" className="gap-1 lowercase">
            <ArrowLeft className="w-4 h-4" />
            back to notes
          </Button>
        </Link>
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

      {/* Context badges (class/assignment) */}
      {(note.class_name || note.assignment_title) && (
        <div className="flex items-center gap-2 flex-wrap">
          {note.class_name && (
            <Badge variant="outline" className="gap-1 text-xs lowercase">
              <BookOpen className="w-3 h-3" />
              {note.class_name}
            </Badge>
          )}
          {note.assignment_title && (
            <Badge variant="outline" className="gap-1 text-xs lowercase">
              <Briefcase className="w-3 h-3" />
              {note.assignment_title}
            </Badge>
          )}
        </div>
      )}

      {/* Editor */}
      <div className="glass-card p-6">
        <NoteEditor
          key={note.id}
          initialTitle={note.title}
          initialContent={note.content_text || ''}
          onSave={handleSave}
        />
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="glass-strong border-0">
          <DialogHeader>
            <DialogTitle className="lowercase">delete note</DialogTitle>
            <DialogDescription className="lowercase">
              are you sure you want to delete "{note.title}"? this action cannot be undone.
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

function NoteDetailLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-40" />
      <div className="glass-card p-6 space-y-4">
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  )
}

function NoteDetailError() {
  return (
    <div className="glass-card p-12 text-center">
      <h3 className="text-lg font-semibold text-destructive mb-2">
        failed to load note
      </h3>
      <Link to="/dashboard/notes">
        <Button variant="outline" className="lowercase">
          back to notes
        </Button>
      </Link>
    </div>
  )
}
