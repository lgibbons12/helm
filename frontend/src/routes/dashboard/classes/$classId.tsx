import { useState, useCallback } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  User,
  ExternalLink,
  FileText,
  Plus,
  Trash2,
} from 'lucide-react'

import { classesApi, notesApi, type Note, type NoteCreate } from '../../../lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { NotesList } from '@/components/notes-list'
import { NoteEditor } from '@/components/note-editor'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

export const Route = createFileRoute('/dashboard/classes/$classId')({
  component: ClassDetailPage,
})

function ClassDetailPage() {
  const { classId } = Route.useParams()
  const queryClient = useQueryClient()
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  // Fetch class details
  const {
    data: classData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['classes', classId],
    queryFn: () => classesApi.get(classId),
  })

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

  // Handle creating a new note for this class
  const handleNewNote = useCallback(() => {
    createNote.mutate({
      title: 'untitled',
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

  // Handle delete confirmation
  const handleDelete = useCallback(() => {
    if (!selectedNote) return
    deleteNote.mutate(selectedNote.id)
  }, [selectedNote, deleteNote])

  if (isLoading) {
    return <ClassDetailLoading />
  }

  if (error || !classData) {
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

      {/* Notes section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <FileText className="w-5 h-5" />
            notes
          </h2>
        </div>

        <div className="h-[500px] flex gap-4">
          {/* Notes list sidebar */}
          <div className="w-64 flex-shrink-0 glass rounded-lg overflow-hidden">
            <NotesList
              classId={classId}
              selectedNoteId={selectedNote?.id}
              onSelectNote={setSelectedNote}
              onNewNote={handleNewNote}
            />
          </div>

          {/* Editor */}
          <div className="flex-1 glass rounded-lg overflow-hidden">
            {selectedNote ? (
              <div className="h-full flex flex-col">
                <div className="flex items-center justify-between p-3 border-b border-border/50">
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
                <div className="flex-1 overflow-y-auto p-4">
                  <NoteEditor
                    key={selectedNote.id}
                    initialTitle={selectedNote.title}
                    initialContent={selectedNote.content_text || ''}
                    onSave={handleSave}
                  />
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center space-y-3">
                  <FileText className="w-10 h-10 text-muted-foreground mx-auto" />
                  <p className="text-sm text-muted-foreground">
                    select a note or create a new one
                  </p>
                  <Button
                    size="sm"
                    onClick={handleNewNote}
                    disabled={createNote.isPending}
                    className="gap-1 lowercase"
                  >
                    <Plus className="w-3 h-3" />
                    new note
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
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
