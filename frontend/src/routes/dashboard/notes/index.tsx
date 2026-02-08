import { useState, useMemo } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'

import { notesApi, classesApi, assignmentsApi, type NoteCreate } from '../../../lib/api'
import { NotesTree } from '@/components/notes-tree'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'

export const Route = createFileRoute('/dashboard/notes/')({
  component: NotesIndexPage,
})

function NotesIndexPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground lowercase">notes</h1>
          <p className="text-sm text-muted-foreground lowercase">
            browse and organize your notes by class and assignment
          </p>
        </div>
        <Button
          onClick={() => setCreateDialogOpen(true)}
          className="gap-2 lowercase"
        >
          <Plus className="w-4 h-4" />
          create note
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="search notes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 lowercase"
        />
      </div>

      {/* Tree Navigation */}
      <div className="glass-card p-6">
        <NotesTree searchQuery={searchQuery} />
      </div>

      {/* Create note dialog */}
      <CreateNoteDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </div>
  )
}

// =============================================================================
// Create Note Dialog
// =============================================================================

interface CreateNoteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function CreateNoteDialog({ open, onOpenChange }: CreateNoteDialogProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [selectedClassId, setSelectedClassId] = useState<string>('')
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string>('')

  // Fetch classes
  const { data: classes } = useQuery({
    queryKey: ['classes'],
    queryFn: () => classesApi.list(),
    enabled: open,
  })

  // Fetch assignments
  const { data: allAssignments } = useQuery({
    queryKey: ['assignments'],
    queryFn: () => assignmentsApi.list(),
    enabled: open,
  })

  // Filter assignments by selected class
  const filteredAssignments = useMemo(() => {
    if (!allAssignments || !selectedClassId) return []
    return allAssignments.filter((a) => a.class_id === selectedClassId)
  }, [allAssignments, selectedClassId])

  // Reset assignment when class changes
  const handleClassChange = (classId: string) => {
    setSelectedClassId(classId === 'none' ? '' : classId)
    setSelectedAssignmentId('')
  }

  const handleAssignmentChange = (assignmentId: string) => {
    setSelectedAssignmentId(assignmentId === 'none' ? '' : assignmentId)
  }

  // Create note mutation
  const createNote = useMutation({
    mutationFn: (data: NoteCreate) => notesApi.create(data),
    onSuccess: (newNote) => {
      queryClient.invalidateQueries({ queryKey: ['notes'] })
      onOpenChange(false)
      // Reset form
      setSelectedClassId('')
      setSelectedAssignmentId('')
      // Navigate to the new note
      navigate({ to: '/dashboard/notes/$noteId', params: { noteId: newNote.id } })
    },
  })

  const handleCreate = () => {
    const noteData: NoteCreate = {
      title: 'untitled',
      content_text: '',
    }

    // Add class/assignment if selected
    if (selectedAssignmentId) {
      noteData.assignment_id = selectedAssignmentId
    } else if (selectedClassId) {
      noteData.class_id = selectedClassId
    }

    createNote.mutate(noteData)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong border-0">
        <DialogHeader>
          <DialogTitle className="lowercase">create new note</DialogTitle>
          <DialogDescription className="lowercase">
            optionally attach this note to a class or assignment
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Class selection */}
          <div className="space-y-2">
            <Label className="lowercase text-xs">class (optional)</Label>
            <Select value={selectedClassId} onValueChange={handleClassChange}>
              <SelectTrigger className="lowercase">
                <SelectValue placeholder="select a class" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="lowercase">
                  none (standalone note)
                </SelectItem>
                {classes?.map((cls) => (
                  <SelectItem key={cls.id} value={cls.id} className="lowercase">
                    {cls.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Assignment selection (only show if class is selected) */}
          {selectedClassId && (
            <div className="space-y-2">
              <Label className="lowercase text-xs">assignment (optional)</Label>
              <Select value={selectedAssignmentId} onValueChange={handleAssignmentChange}>
                <SelectTrigger className="lowercase">
                  <SelectValue placeholder="select an assignment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="lowercase">
                    none (class note)
                  </SelectItem>
                  {filteredAssignments.map((assignment) => (
                    <SelectItem key={assignment.id} value={assignment.id} className="lowercase">
                      {assignment.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-6">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={createNote.isPending}
            className="lowercase"
          >
            cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={createNote.isPending}
            className="lowercase"
          >
            {createNote.isPending ? 'creating...' : 'create note'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
