import { useState, useCallback, useEffect } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  User,
  ExternalLink,
  ChevronDown,
  Plus,
  Trash2,
  Pencil,
} from 'lucide-react'

import { classesApi, notesApi, type NoteCreate } from '../../../lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { NoteEditor } from '@/components/note-editor'
import { EditClassDialog } from '@/components/edit-class-dialog'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export const Route = createFileRoute('/dashboard/classes/$classId')({
  component: ClassDetailPage,
})

function ClassDetailPage() {
  const { classId } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [deleteNoteDialogOpen, setDeleteNoteDialogOpen] = useState(false)
  const [editClassDialogOpen, setEditClassDialogOpen] = useState(false)
  const [deleteClassDialogOpen, setDeleteClassDialogOpen] = useState(false)

  // Fetch class details
  const {
    data: classData,
    isLoading: classLoading,
    error: classError,
  } = useQuery({
    queryKey: ['classes', classId],
    queryFn: () => classesApi.get(classId),
  })

  // Fetch notes for this class
  const { data: notes = [], isLoading: notesLoading } = useQuery({
    queryKey: ['notes', { classId }],
    queryFn: () => notesApi.list({ class_id: classId }),
  })

  // Auto-select the first note when notes load
  useEffect(() => {
    if (notes.length > 0 && !selectedNoteId) {
      setSelectedNoteId(notes[0].id)
    }
  }, [notes, selectedNoteId])

  // Get the currently selected note
  const selectedNote = notes.find((n) => n.id === selectedNoteId) || null

  // Create new note mutation
  const createNote = useMutation({
    mutationFn: (data: NoteCreate) => notesApi.create(data),
    onSuccess: (newNote) => {
      queryClient.invalidateQueries({ queryKey: ['notes'] })
      setSelectedNoteId(newNote.id)
    },
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
      // Select another note if available
      const remainingNotes = notes.filter((n) => n.id !== selectedNoteId)
      setSelectedNoteId(remainingNotes.length > 0 ? remainingNotes[0].id : null)
      setDeleteNoteDialogOpen(false)
    },
  })

  // Delete class mutation
  const deleteClass = useMutation({
    mutationFn: () => classesApi.delete(classId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classes'] })
      queryClient.invalidateQueries({ queryKey: ['notes'] })
      queryClient.invalidateQueries({ queryKey: ['assignments'] })
      navigate({ to: '/dashboard/classes' })
    },
  })

  // Handle creating a new note for this class
  const handleNewNote = useCallback(() => {
    createNote.mutate({
      title: 'Untitled',
      content_text: '',
      class_id: classId,
    })
  }, [createNote, classId])

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

  // Handle note delete confirmation
  const handleDeleteNote = useCallback(() => {
    if (!selectedNote) return
    deleteNote.mutate(selectedNote.id)
  }, [selectedNote, deleteNote])

  // Handle class delete confirmation
  const handleDeleteClass = useCallback(() => {
    deleteClass.mutate()
  }, [deleteClass])

  if (classLoading) {
    return <ClassDetailLoading />
  }

  if (classError || !classData) {
    return <ClassDetailError />
  }

  const hasLinks = Object.keys(classData.links_json || {}).length > 0

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Link to="/dashboard/classes">
        <Button variant="ghost" size="sm" className="gap-1 lowercase">
          <ArrowLeft className="w-4 h-4" />
          back to classes
        </Button>
      </Link>

      {/* Class header */}
      <div className="glass-card p-6 relative overflow-hidden">
        {classData.color && (
          <div
            className="absolute top-0 left-0 w-1 h-full"
            style={{ backgroundColor: classData.color }}
          />
        )}

        <div className="space-y-4">
          <div className="flex items-start justify-between">
            <div>
              {classData.code && (
                <Badge variant="secondary" className="text-xs lowercase mb-2">
                  {classData.code}
                </Badge>
              )}
              <h1 className="text-2xl font-bold text-foreground lowercase">
                {classData.name}
              </h1>
              <p className="text-sm text-muted-foreground lowercase">
                {classData.semester}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditClassDialogOpen(true)}
                className="gap-1 lowercase"
              >
                <Pencil className="w-4 h-4" />
                edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeleteClassDialogOpen(true)}
                className="gap-1 text-destructive hover:text-destructive lowercase"
              >
                <Trash2 className="w-4 h-4" />
                delete
              </Button>
            </div>
          </div>

          {classData.instructor && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="w-4 h-4" />
              <span className="lowercase">{classData.instructor}</span>
            </div>
          )}

          {hasLinks && (
            <div className="flex flex-wrap gap-3">
              {Object.entries(classData.links_json).map(([key, url]) => (
                <a
                  key={key}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-accent hover:text-accent/80 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  {formatLinkLabel(key)}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Notes section - full width editor with dropdown */}
      <div className="glass-card p-6">
        {/* Note selector header */}
        <div className="flex items-center justify-between mb-4 pb-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            {notesLoading ? (
              <Skeleton className="h-9 w-48" />
            ) : notes.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2 lowercase">
                    {selectedNote?.title || 'select note'}
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64">
                  {notes.map((note) => (
                    <DropdownMenuItem
                      key={note.id}
                      onClick={() => setSelectedNoteId(note.id)}
                      className={`lowercase ${note.id === selectedNoteId ? 'bg-muted' : ''}`}
                    >
                      {note.title}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleNewNote}
                    disabled={createNote.isPending}
                    className="lowercase"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    new note
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <span className="text-sm text-muted-foreground lowercase">no notes yet</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {notes.length === 0 && (
              <Button
                size="sm"
                onClick={handleNewNote}
                disabled={createNote.isPending}
                className="gap-1 lowercase"
              >
                <Plus className="w-4 h-4" />
                create note
              </Button>
            )}
            {selectedNote && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeleteNoteDialogOpen(true)}
                className="gap-1 text-destructive hover:text-destructive lowercase"
              >
                <Trash2 className="w-4 h-4" />
                delete
              </Button>
            )}
          </div>
        </div>

        {/* Note editor */}
        {selectedNote ? (
          <NoteEditor
            key={selectedNote.id}
            initialTitle={selectedNote.title}
            initialContent={selectedNote.content_text || ''}
            onSave={handleSave}
          />
        ) : (
          <div className="py-12 text-center">
            <p className="text-muted-foreground lowercase mb-4">
              {notes.length === 0
                ? 'create your first note for this class'
                : 'select a note from the dropdown'}
            </p>
            {notes.length === 0 && (
              <Button
                onClick={handleNewNote}
                disabled={createNote.isPending}
                className="gap-1 lowercase"
              >
                <Plus className="w-4 h-4" />
                create note
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Delete note confirmation dialog */}
      <Dialog open={deleteNoteDialogOpen} onOpenChange={setDeleteNoteDialogOpen}>
        <DialogContent className="glass-strong border-0">
          <DialogHeader>
            <DialogTitle className="lowercase">delete note</DialogTitle>
            <DialogDescription className="lowercase">
              are you sure you want to delete "{selectedNote?.title}"?
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setDeleteNoteDialogOpen(false)}
              className="lowercase"
            >
              cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteNote}
              disabled={deleteNote.isPending}
              className="lowercase"
            >
              {deleteNote.isPending ? 'deleting...' : 'delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete class confirmation dialog */}
      <Dialog open={deleteClassDialogOpen} onOpenChange={setDeleteClassDialogOpen}>
        <DialogContent className="glass-strong border-0">
          <DialogHeader>
            <DialogTitle className="lowercase">delete class</DialogTitle>
            <DialogDescription className="lowercase">
              are you sure you want to delete "{classData.name}"?
              <br />
              <span className="text-muted-foreground mt-2 block">
                assignments, exams, and notes linked to this class will be unlinked but not deleted.
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setDeleteClassDialogOpen(false)}
              className="lowercase"
            >
              cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteClass}
              disabled={deleteClass.isPending}
              className="lowercase"
            >
              {deleteClass.isPending ? 'deleting...' : 'delete class'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit class dialog */}
      <EditClassDialog
        open={editClassDialogOpen}
        onOpenChange={setEditClassDialogOpen}
        classData={classData}
      />
    </div>
  )
}

function formatLinkLabel(key: string): string {
  return key
    .replace(/_url$/i, '')
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .trim()
    .toLowerCase()
}

function ClassDetailLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-32" />
      <div className="glass-card p-6 space-y-4">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-5 w-1/3" />
      </div>
    </div>
  )
}

function ClassDetailError() {
  return (
    <div className="glass-card p-12 text-center">
      <h3 className="text-lg font-semibold text-destructive mb-2">
        failed to load class
      </h3>
      <Link to="/dashboard/classes">
        <Button variant="outline" className="lowercase">
          back to classes
        </Button>
      </Link>
    </div>
  )
}
