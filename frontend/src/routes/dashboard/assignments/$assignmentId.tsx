import { useState, useCallback } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Calendar,
  Clock,
  FileText,
  Plus,
  Trash2,
  CheckCircle2,
  Circle,
  CircleDot,
  CircleDashed,
} from 'lucide-react'
import { format } from 'date-fns'

import {
  assignmentsApi,
  notesApi,
  type Note,
  type NoteCreate,
  type AssignmentStatus,
} from '../../../lib/api'
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

export const Route = createFileRoute('/dashboard/assignments/$assignmentId')({
  component: AssignmentDetailPage,
  validateSearch: (search: Record<string, unknown>) => ({
    from: (search.from as string) || undefined,
  }),
})

function AssignmentDetailPage() {
  const { assignmentId } = Route.useParams()
  const { from } = Route.useSearch()
  const queryClient = useQueryClient()
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  // Fetch assignment details
  const {
    data: assignment,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['assignments', assignmentId],
    queryFn: () => assignmentsApi.get(assignmentId),
  })

  // Update status mutation
  const updateStatus = useMutation({
    mutationFn: (status: AssignmentStatus) =>
      assignmentsApi.update(assignmentId, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] })
    },
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

  // Handle creating a new note for this assignment
  const handleNewNote = useCallback(() => {
    createNote.mutate({
      title: 'untitled',
      content_text: '',
      assignment_id: assignmentId,
    })
  }, [createNote, assignmentId])

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
    return <AssignmentDetailLoading />
  }

  if (error || !assignment) {
    return <AssignmentDetailError />
  }

  const isFinished = assignment.status === 'finished'

  // Cycle through statuses: not_started -> in_progress -> almost_done -> finished -> not_started
  const getNextStatus = (current: AssignmentStatus): AssignmentStatus => {
    const cycle: AssignmentStatus[] = ['not_started', 'in_progress', 'almost_done', 'finished']
    const currentIndex = cycle.indexOf(current)
    return cycle[(currentIndex + 1) % cycle.length]
  }

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Link to={from === 'board' ? '/dashboard/board' : '/dashboard/assignments'}>
        <Button variant="ghost" size="sm" className="gap-1 lowercase">
          <ArrowLeft className="w-4 h-4" />
          back to {from === 'board' ? 'board' : 'assignments'}
        </Button>
      </Link>

      {/* Assignment header */}
      <div className="glass-card p-6">
        <div className="flex items-start gap-4">
          {/* Status toggle */}
          <button
            onClick={() => updateStatus.mutate(getNextStatus(assignment.status))}
            className="mt-1 flex-shrink-0"
            disabled={updateStatus.isPending}
          >
            {isFinished ? (
              <CheckCircle2 className="w-6 h-6 text-green-500" />
            ) : assignment.status === 'almost_done' ? (
              <CircleDot className="w-6 h-6 text-blue-400" />
            ) : assignment.status === 'in_progress' ? (
              <CircleDashed className="w-6 h-6 text-amber-400" />
            ) : (
              <Circle className="w-6 h-6 text-muted-foreground hover:text-foreground transition-colors" />
            )}
          </button>

          <div className="flex-1 space-y-3">
            <div>
              <h1 className={`text-2xl font-bold text-foreground lowercase ${isFinished ? 'line-through' : ''}`}>
                {assignment.title}
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-xs lowercase">
                  {assignment.type}
                </Badge>
                <Badge
                  variant={isFinished ? 'secondary' : assignment.status === 'almost_done' || assignment.status === 'in_progress' ? 'default' : 'outline'}
                  className="text-xs lowercase"
                >
                  {assignment.status.replace(/_/g, ' ')}
                </Badge>
              </div>
            </div>

            {assignment.notes_short && (
              <p className="text-sm text-muted-foreground lowercase">
                {assignment.notes_short}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              {assignment.due_date && (
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  <span>due {format(new Date(assignment.due_date), 'MMM d, yyyy')}</span>
                </div>
              )}
              {assignment.planned_start_day && (
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  <span>start {assignment.planned_start_day}</span>
                </div>
              )}
              {assignment.estimated_minutes && (
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  <span>{assignment.estimated_minutes} min estimated</span>
                </div>
              )}
            </div>
          </div>
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

        <div className="h-[400px] flex gap-4">
          {/* Notes list sidebar */}
          <div className="w-64 flex-shrink-0 glass rounded-lg overflow-hidden">
            <NotesList
              assignmentId={assignmentId}
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

function AssignmentDetailLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-40" />
      <div className="glass-card p-6 space-y-4">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-5 w-1/3" />
      </div>
    </div>
  )
}

function AssignmentDetailError() {
  return (
    <div className="glass-card p-12 text-center">
      <h3 className="text-lg font-semibold text-destructive mb-2">
        failed to load assignment
      </h3>
      <Link to="/dashboard/assignments">
        <Button variant="outline" className="lowercase">
          back to assignments
        </Button>
      </Link>
    </div>
  )
}
