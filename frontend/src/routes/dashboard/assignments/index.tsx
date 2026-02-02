import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Calendar,
  Clock,
  CheckCircle2,
  Circle,
  Loader2,
  BookOpen,
  Trash2,
  FileText,
} from 'lucide-react'
import { format, isPast, isToday } from 'date-fns'

import {
  assignmentsApi,
  type Assignment,
  type AssignmentStatus,
} from '../../../lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { AddAssignmentDialog } from '@/components/add-assignment-dialog'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

export const Route = createFileRoute('/dashboard/assignments/')({
  component: AssignmentsPage,
})

function AssignmentsPage() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Assignment | null>(null)
  const queryClient = useQueryClient()

  const {
    data: assignments,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['assignments'],
    queryFn: () => assignmentsApi.list(),
  })

  // Update status mutation
  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: AssignmentStatus }) =>
      assignmentsApi.update(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] })
    },
  })

  // Delete mutation
  const deleteAssignment = useMutation({
    mutationFn: (id: string) => assignmentsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] })
      setDeleteTarget(null)
    },
  })

  // Group assignments by status
  const grouped = groupByStatus(assignments || [])

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">assignments</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            track your tasks and deadlines
          </p>
        </div>
        <Button className="gap-2" onClick={() => setDialogOpen(true)}>
          <Plus className="w-4 h-4" />
          add assignment
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <AssignmentsLoading />
      ) : error ? (
        <AssignmentsError error={error as Error} />
      ) : assignments && assignments.length > 0 ? (
        <div className="space-y-8">
          {/* In Progress */}
          {grouped.in_progress.length > 0 && (
            <AssignmentSection
              title="in progress"
              assignments={grouped.in_progress}
              onStatusChange={(id, status) => updateStatus.mutate({ id, status })}
              onDelete={setDeleteTarget}
            />
          )}

          {/* Not Started */}
          {grouped.not_started.length > 0 && (
            <AssignmentSection
              title="not started"
              assignments={grouped.not_started}
              onStatusChange={(id, status) => updateStatus.mutate({ id, status })}
              onDelete={setDeleteTarget}
            />
          )}

          {/* Done */}
          {grouped.done.length > 0 && (
            <AssignmentSection
              title="done"
              assignments={grouped.done}
              onStatusChange={(id, status) => updateStatus.mutate({ id, status })}
              onDelete={setDeleteTarget}
              collapsed
            />
          )}
        </div>
      ) : (
        <AssignmentsEmpty onAddAssignment={() => setDialogOpen(true)} />
      )}

      {/* Add Assignment Dialog */}
      <AddAssignmentDialog open={dialogOpen} onOpenChange={setDialogOpen} />

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="glass-strong border-0">
          <DialogHeader>
            <DialogTitle className="lowercase">delete assignment</DialogTitle>
            <DialogDescription className="lowercase">
              are you sure you want to delete "{deleteTarget?.title}"? this action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              className="lowercase"
            >
              cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteAssignment.mutate(deleteTarget.id)}
              disabled={deleteAssignment.isPending}
              className="lowercase"
            >
              {deleteAssignment.isPending ? 'deleting...' : 'delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// =============================================================================
// Helper Functions
// =============================================================================

function groupByStatus(assignments: Assignment[]) {
  return {
    not_started: assignments.filter((a) => a.status === 'not_started'),
    in_progress: assignments.filter((a) => a.status === 'in_progress'),
    done: assignments.filter((a) => a.status === 'done'),
  }
}

// =============================================================================
// AssignmentSection
// =============================================================================

interface AssignmentSectionProps {
  title: string
  assignments: Assignment[]
  onStatusChange: (id: string, status: AssignmentStatus) => void
  onDelete: (assignment: Assignment) => void
  collapsed?: boolean
}

function AssignmentSection({
  title,
  assignments,
  onStatusChange,
  onDelete,
  collapsed = false,
}: AssignmentSectionProps) {
  const [isExpanded, setIsExpanded] = useState(!collapsed)

  return (
    <div className="space-y-3">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-lg font-semibold text-foreground hover:text-foreground/80 transition-colors"
      >
        <span className="lowercase">{title}</span>
        <Badge variant="secondary" className="text-xs">
          {assignments.length}
        </Badge>
      </button>

      {isExpanded && (
        <div className="grid gap-3">
          {assignments.map((assignment) => (
            <AssignmentCard
              key={assignment.id}
              assignment={assignment}
              onStatusChange={onStatusChange}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// =============================================================================
// AssignmentCard
// =============================================================================

interface AssignmentCardProps {
  assignment: Assignment
  onStatusChange: (id: string, status: AssignmentStatus) => void
  onDelete: (assignment: Assignment) => void
}

function AssignmentCard({ assignment, onStatusChange, onDelete }: AssignmentCardProps) {
  const navigate = useNavigate()
  const isDone = assignment.status === 'done'
  const isOverdue = assignment.due_date && isPast(new Date(assignment.due_date)) && !isDone
  const isDueToday = assignment.due_date && isToday(new Date(assignment.due_date))

  const nextStatus: AssignmentStatus =
    assignment.status === 'not_started'
      ? 'in_progress'
      : assignment.status === 'in_progress'
        ? 'done'
        : 'not_started'

  return (
    <div
      className={`glass-card p-4 flex items-start gap-4 cursor-pointer hover:bg-muted/10 transition-colors ${
        isDone ? 'opacity-60' : ''
      }`}
      onClick={() => navigate({ to: '/dashboard/assignments/$assignmentId', params: { assignmentId: assignment.id } })}
    >
      {/* Status toggle */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onStatusChange(assignment.id, nextStatus)
        }}
        className="mt-0.5 flex-shrink-0"
        title={`mark as ${nextStatus.replace('_', ' ')}`}
      >
        {isDone ? (
          <CheckCircle2 className="w-5 h-5 text-success" />
        ) : assignment.status === 'in_progress' ? (
          <Loader2 className="w-5 h-5 text-accent animate-spin" />
        ) : (
          <Circle className="w-5 h-5 text-muted-foreground hover:text-foreground transition-colors" />
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3
              className={`font-medium text-foreground lowercase ${
                isDone ? 'line-through' : ''
              }`}
            >
              {assignment.title}
            </h3>
            {assignment.notes_short && (
              <p className="text-sm text-muted-foreground mt-0.5 lowercase">
                {assignment.notes_short}
              </p>
            )}
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(assignment)
            }}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>

        {/* Meta info */}
        <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
          {assignment.due_date && (
            <div
              className={`flex items-center gap-1 ${
                isOverdue ? 'text-destructive' : isDueToday ? 'text-warning' : ''
              }`}
            >
              <Calendar className="w-3 h-3" />
              <span>
                {isOverdue
                  ? 'overdue'
                  : isDueToday
                    ? 'due today'
                    : format(new Date(assignment.due_date), 'MMM d')}
              </span>
            </div>
          )}
          {assignment.estimated_minutes && (
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>{assignment.estimated_minutes} min</span>
            </div>
          )}
          <Badge variant="outline" className="text-xs lowercase">
            {assignment.type}
          </Badge>
          <div className="flex items-center gap-1">
            <FileText className="w-3 h-3" />
            <span>notes</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Loading & Empty States
// =============================================================================

function AssignmentsLoading() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="glass-card p-4 flex items-start gap-4">
          <Skeleton className="w-5 h-5 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}

function AssignmentsEmpty({ onAddAssignment }: { onAddAssignment: () => void }) {
  return (
    <div className="glass-card p-12 text-center">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
        <BookOpen className="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">no assignments yet</h3>
      <p className="text-muted-foreground mb-6 max-w-sm mx-auto text-sm">
        add your first assignment to start tracking your tasks and deadlines.
      </p>
      <Button className="gap-2" onClick={onAddAssignment}>
        <Plus className="w-4 h-4" />
        add your first assignment
      </Button>
    </div>
  )
}

function AssignmentsError({ error }: { error: Error }) {
  return (
    <div className="glass-card p-12 text-center border-destructive/20">
      <h3 className="text-lg font-semibold text-destructive mb-2">
        failed to load assignments
      </h3>
      <p className="text-muted-foreground mb-4 text-sm">{error.message}</p>
      <Button variant="outline" onClick={() => window.location.reload()}>
        try again
      </Button>
    </div>
  )
}
