import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  CheckCircle2,
  Circle,
  BookOpen,
  Trash2,
  ChevronDown,
  ChevronRight,
  X,
  Check,
  CircleDot,
  CircleDashed,
} from 'lucide-react'
import { format } from 'date-fns'

import {
  assignmentsApi,
  classesApi,
  type Assignment,
  type AssignmentStatus,
  type AssignmentCreate,
  type AssignmentUpdate,
  type Class,
  type DayOfWeek,
  type AssignmentType,
} from '../../../lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

// =============================================================================
// Constants
// =============================================================================

const PROGRESS_OPTIONS: { value: AssignmentStatus; label: string }[] = [
  { value: 'not_started', label: 'not started' },
  { value: 'in_progress', label: 'in progress' },
  { value: 'almost_done', label: 'almost done' },
  { value: 'finished', label: 'finished' },
]

const TYPE_OPTIONS: { value: AssignmentType; label: string }[] = [
  { value: 'pset', label: 'pset' },
  { value: 'reading', label: 'reading' },
  { value: 'project', label: 'project' },
  { value: 'quiz', label: 'quiz' },
  { value: 'other', label: 'other' },
]

const DAY_OPTIONS: { value: DayOfWeek; label: string }[] = [
  { value: 'monday', label: 'mon' },
  { value: 'tuesday', label: 'tue' },
  { value: 'wednesday', label: 'wed' },
  { value: 'thursday', label: 'thu' },
  { value: 'friday', label: 'fri' },
  { value: 'saturday', label: 'sat' },
  { value: 'sunday', label: 'sun' },
]

// =============================================================================
// Route
// =============================================================================

export const Route = createFileRoute('/dashboard/assignments/')({
  component: AssignmentsPage,
})

// =============================================================================
// Main Component
// =============================================================================

function AssignmentsPage() {
  const [progressFilter, setProgressFilter] = useState<AssignmentStatus | 'all'>('all')
  const [deleteTarget, setDeleteTarget] = useState<Assignment | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [addingForClass, setAddingForClass] = useState<string | null>(null)
  const queryClient = useQueryClient()

  // Fetch assignments
  const {
    data: assignments = [],
    isLoading: assignmentsLoading,
    error: assignmentsError,
  } = useQuery({
    queryKey: ['assignments'],
    queryFn: () => assignmentsApi.list(),
  })

  // Fetch classes
  const { data: classes = [], isLoading: classesLoading } = useQuery({
    queryKey: ['classes'],
    queryFn: () => classesApi.list(),
  })

  const isLoading = assignmentsLoading || classesLoading

  // Create mutation
  const createAssignment = useMutation({
    mutationFn: (data: AssignmentCreate) => assignmentsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] })
      setAddingForClass(null)
    },
  })

  // Update mutation
  const updateAssignment = useMutation({
    mutationFn: ({ id, data }: { id: string; data: AssignmentUpdate }) =>
      assignmentsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] })
      setExpandedId(null)
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

  // Filter assignments by progress
  const filteredAssignments =
    progressFilter === 'all'
      ? assignments
      : assignments.filter((a) => a.status === progressFilter)

  // Group assignments by class
  const assignmentsByClass = groupByClass(filteredAssignments, classes)

  // Count active assignments
  const activeCount = assignments.filter((a) => a.status !== 'finished').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground lowercase">assignments</h1>
          <p className="text-muted-foreground mt-1 text-sm lowercase">
            {activeCount} active
          </p>
        </div>

        {/* Progress Filter */}
        <Select
          value={progressFilter}
          onValueChange={(v) => setProgressFilter(v as AssignmentStatus | 'all')}
        >
          <SelectTrigger className="w-40 lowercase">
            <SelectValue placeholder="filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="lowercase">all</SelectItem>
            {PROGRESS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="lowercase">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {isLoading ? (
        <AssignmentsLoading />
      ) : assignmentsError ? (
        <AssignmentsError error={assignmentsError as Error} />
      ) : classes.length > 0 ? (
        <div className="space-y-4">
          {assignmentsByClass.map((group) => (
            <ClassSection
              key={group.class?.id || 'no-class'}
              classData={group.class}
              assignments={group.assignments}
              expandedId={expandedId}
              isAddingNew={addingForClass === (group.class?.id || 'no-class')}
              onToggleExpand={(id) => setExpandedId(expandedId === id ? null : id)}
              onStartAdd={() => setAddingForClass(group.class?.id || 'no-class')}
              onCancelAdd={() => setAddingForClass(null)}
              onSaveNew={(data) => createAssignment.mutate(data)}
              onUpdate={(id, data) => updateAssignment.mutate({ id, data })}
              onDelete={setDeleteTarget}
              isSaving={createAssignment.isPending || updateAssignment.isPending}
            />
          ))}
        </div>
      ) : (
        <AssignmentsEmpty />
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="glass-strong border-0">
          <DialogHeader>
            <DialogTitle className="lowercase">delete assignment</DialogTitle>
            <DialogDescription className="lowercase">
              are you sure you want to delete "{deleteTarget?.title}"?
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

interface ClassGroup {
  class: Class | null
  assignments: Assignment[]
}

function groupByClass(assignments: Assignment[], classes: Class[]): ClassGroup[] {
  const groups = new Map<string | null, Assignment[]>()

  // Initialize groups for all classes
  classes.forEach((c) => groups.set(c.id, []))
  groups.set(null, [])

  // Group assignments
  assignments.forEach((a) => {
    const classId = a.class_id
    if (!groups.has(classId)) groups.set(classId, [])
    groups.get(classId)!.push(a)
  })

  // Convert to array
  const result: ClassGroup[] = []
  classes.forEach((c) => {
    result.push({ class: c, assignments: groups.get(c.id) || [] })
  })

  const noClassAssignments = groups.get(null) || []
  if (noClassAssignments.length > 0) {
    result.push({ class: null, assignments: noClassAssignments })
  }

  return result
}

// =============================================================================
// Progress Icon
// =============================================================================

function ProgressIcon({ status, className }: { status: AssignmentStatus; className?: string }) {
  switch (status) {
    case 'not_started':
      return <Circle className={className} />
    case 'in_progress':
      return <CircleDashed className={className} />
    case 'almost_done':
      return <CircleDot className={className} />
    case 'finished':
      return <CheckCircle2 className={className} />
  }
}

// =============================================================================
// ClassSection
// =============================================================================

interface ClassSectionProps {
  classData: Class | null
  assignments: Assignment[]
  expandedId: string | null
  isAddingNew: boolean
  onToggleExpand: (id: string) => void
  onStartAdd: () => void
  onCancelAdd: () => void
  onSaveNew: (data: AssignmentCreate) => void
  onUpdate: (id: string, data: AssignmentUpdate) => void
  onDelete: (assignment: Assignment) => void
  isSaving: boolean
}

function ClassSection({
  classData,
  assignments,
  expandedId,
  isAddingNew,
  onToggleExpand,
  onStartAdd,
  onCancelAdd,
  onSaveNew,
  onUpdate,
  onDelete,
  isSaving,
}: ClassSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  // Sort: in_progress, almost_done, not_started, finished
  const sortedAssignments = [...assignments].sort((a, b) => {
    const order = { in_progress: 0, almost_done: 1, not_started: 2, finished: 3 }
    return order[a.status] - order[b.status]
  })

  const activeCount = assignments.filter((a) => a.status !== 'finished').length

  return (
    <div className="glass-card overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {classData?.color && (
          <div
            className="w-1 h-8 rounded-full flex-shrink-0"
            style={{ backgroundColor: classData.color }}
          />
        )}
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground lowercase truncate">
              {classData ? classData.code || classData.name : 'no class'}
            </span>
            {activeCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {activeCount}
              </Badge>
            )}
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="gap-1 text-xs lowercase flex-shrink-0"
          onClick={(e) => {
            e.stopPropagation()
            onStartAdd()
          }}
        >
          <Plus className="w-3 h-3" />
          add
        </Button>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="border-t border-border/30">
          {/* Table Header */}
          <div className="grid grid-cols-[auto_1fr_5rem_6rem_5rem_4rem_5rem_auto] gap-2 px-4 py-2 text-[10px] text-muted-foreground uppercase tracking-wider border-b border-border/20 bg-muted/10">
            <div className="w-5"></div>
            <div>title</div>
            <div>type</div>
            <div>due</div>
            <div>day</div>
            <div>mins</div>
            <div>status</div>
            <div className="w-16"></div>
          </div>

          {/* Add new row */}
          {isAddingNew && (
            <AddAssignmentRow
              classId={classData?.id || null}
              onSave={onSaveNew}
              onCancel={onCancelAdd}
              isSaving={isSaving}
            />
          )}

          {/* Assignment rows */}
          {sortedAssignments.length > 0 ? (
            <div className="divide-y divide-border/20">
              {sortedAssignments.map((assignment) =>
                expandedId === assignment.id ? (
                  <EditAssignmentRow
                    key={assignment.id}
                    assignment={assignment}
                    onSave={(data) => onUpdate(assignment.id, data)}
                    onCancel={() => onToggleExpand(assignment.id)}
                    onDelete={() => onDelete(assignment)}
                    isSaving={isSaving}
                  />
                ) : (
                  <AssignmentRow
                    key={assignment.id}
                    assignment={assignment}
                    onClick={() => onToggleExpand(assignment.id)}
                  />
                )
              )}
            </div>
          ) : (
            !isAddingNew && (
              <div className="p-6 text-center text-sm text-muted-foreground lowercase">
                no assignments
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}

// =============================================================================
// AssignmentRow (Collapsed View)
// =============================================================================

function AssignmentRow({
  assignment,
  onClick,
}: {
  assignment: Assignment
  onClick: () => void
}) {
  const isFinished = assignment.status === 'finished'

  return (
    <div
      className={`grid grid-cols-[auto_1fr_5rem_6rem_5rem_4rem_5rem_auto] gap-2 items-center px-4 py-2.5 cursor-pointer hover:bg-muted/20 transition-colors ${
        isFinished ? 'opacity-50' : ''
      }`}
      onClick={onClick}
    >
      <ProgressIcon
        status={assignment.status}
        className={`w-5 h-5 ${
          assignment.status === 'finished'
            ? 'text-green-500'
            : assignment.status === 'almost_done'
              ? 'text-blue-400'
              : assignment.status === 'in_progress'
                ? 'text-amber-400'
                : 'text-muted-foreground'
        }`}
      />
      <span
        className={`text-sm truncate ${
          isFinished ? 'line-through text-muted-foreground' : 'text-foreground'
        }`}
      >
        {assignment.title}
      </span>
      <span className="text-xs text-muted-foreground lowercase truncate">
        {assignment.type}
      </span>
      <span className="text-xs text-muted-foreground lowercase">
        {assignment.due_date
          ? format(new Date(assignment.due_date), 'MMM d').toLowerCase()
          : '—'}
      </span>
      <span className="text-xs text-muted-foreground lowercase">
        {assignment.planned_start_day
          ? assignment.planned_start_day.slice(0, 3)
          : '—'}
      </span>
      <span className="text-xs text-muted-foreground">
        {assignment.estimated_minutes ? `${assignment.estimated_minutes}m` : '—'}
      </span>
      <span className="text-xs text-muted-foreground lowercase truncate">
        {assignment.status.replace(/_/g, ' ')}
      </span>
      <div className="w-16"></div>
    </div>
  )
}

// =============================================================================
// AddAssignmentRow (Expanded Add Form)
// =============================================================================

function AddAssignmentRow({
  classId,
  onSave,
  onCancel,
  isSaving,
}: {
  classId: string | null
  onSave: (data: AssignmentCreate) => void
  onCancel: () => void
  isSaving: boolean
}) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState<AssignmentType>('other')
  const [dueDate, setDueDate] = useState('')
  const [plannedDay, setPlannedDay] = useState<DayOfWeek | ''>('')
  const [estimatedMinutes, setEstimatedMinutes] = useState('')

  const handleSave = () => {
    if (!title.trim()) return
    onSave({
      title: title.trim(),
      type,
      class_id: classId || undefined,
      due_date: dueDate || undefined,
      planned_start_day: plannedDay || undefined,
      estimated_minutes: estimatedMinutes ? parseInt(estimatedMinutes, 10) : undefined,
      status: 'not_started',
    })
  }

  return (
    <div className="grid grid-cols-[auto_1fr_5rem_6rem_5rem_4rem_5rem_auto] gap-2 items-center px-4 py-2 bg-accent/10 border-b border-accent/20">
      <div className="w-5">
        <Circle className="w-5 h-5 text-muted-foreground/50" />
      </div>
      <Input
        placeholder="assignment title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="h-8 text-sm lowercase"
        autoFocus
        onKeyDown={(e) => e.key === 'Enter' && handleSave()}
      />
      <Select value={type} onValueChange={(v) => setType(v as AssignmentType)}>
        <SelectTrigger className="h-8 text-xs lowercase">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TYPE_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="lowercase">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        className="h-8 text-xs"
      />
      <Select value={plannedDay || 'none'} onValueChange={(v) => setPlannedDay(v === 'none' ? '' : v as DayOfWeek)}>
        <SelectTrigger className="h-8 text-xs lowercase">
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none" className="lowercase">—</SelectItem>
          {DAY_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="lowercase">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        type="number"
        placeholder="—"
        value={estimatedMinutes}
        onChange={(e) => setEstimatedMinutes(e.target.value)}
        className="h-8 text-xs"
        min="1"
      />
      <span className="text-xs text-muted-foreground lowercase">not started</span>
      <div className="flex gap-0.5 w-16 justify-end">
        <Button
          size="icon"
          variant="ghost"
          onClick={handleSave}
          disabled={!title.trim() || isSaving}
          className="h-7 w-7 text-green-500 hover:text-green-600"
        >
          <Check className="w-4 h-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={onCancel}
          className="h-7 w-7 text-muted-foreground"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}

// =============================================================================
// EditAssignmentRow (Expanded Edit Form)
// =============================================================================

function EditAssignmentRow({
  assignment,
  onSave,
  onCancel,
  onDelete,
  isSaving,
}: {
  assignment: Assignment
  onSave: (data: AssignmentUpdate) => void
  onCancel: () => void
  onDelete: () => void
  isSaving: boolean
}) {
  const [title, setTitle] = useState(assignment.title)
  const [type, setType] = useState<AssignmentType>(assignment.type)
  const [dueDate, setDueDate] = useState(assignment.due_date || '')
  const [plannedDay, setPlannedDay] = useState<DayOfWeek | ''>(
    assignment.planned_start_day || ''
  )
  const [estimatedMinutes, setEstimatedMinutes] = useState(
    assignment.estimated_minutes?.toString() || ''
  )
  const [status, setStatus] = useState<AssignmentStatus>(assignment.status)

  const handleSave = () => {
    if (!title.trim()) return
    onSave({
      title: title.trim(),
      type,
      due_date: dueDate || undefined,
      planned_start_day: plannedDay || undefined,
      estimated_minutes: estimatedMinutes ? parseInt(estimatedMinutes, 10) : undefined,
      status,
    })
  }

  return (
    <div className="grid grid-cols-[auto_1fr_5rem_6rem_5rem_4rem_5rem_auto] gap-2 items-center px-4 py-2 bg-accent/10 border-b border-accent/20">
      <ProgressIcon
        status={status}
        className={`w-5 h-5 ${
          status === 'finished'
            ? 'text-green-500'
            : status === 'almost_done'
              ? 'text-blue-400'
              : status === 'in_progress'
                ? 'text-amber-400'
                : 'text-muted-foreground'
        }`}
      />
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="h-8 text-sm"
        autoFocus
        onKeyDown={(e) => e.key === 'Enter' && handleSave()}
      />
      <Select value={type} onValueChange={(v) => setType(v as AssignmentType)}>
        <SelectTrigger className="h-8 text-xs lowercase">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TYPE_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="lowercase">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        className="h-8 text-xs"
      />
      <Select value={plannedDay || 'none'} onValueChange={(v) => setPlannedDay(v === 'none' ? '' : v as DayOfWeek)}>
        <SelectTrigger className="h-8 text-xs lowercase">
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none" className="lowercase">—</SelectItem>
          {DAY_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="lowercase">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        type="number"
        placeholder="—"
        value={estimatedMinutes}
        onChange={(e) => setEstimatedMinutes(e.target.value)}
        className="h-8 text-xs"
        min="1"
      />
      <Select value={status} onValueChange={(v) => setStatus(v as AssignmentStatus)}>
        <SelectTrigger className="h-8 text-xs lowercase">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PROGRESS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="lowercase">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex gap-0.5 w-16 justify-end">
        <Button
          size="icon"
          variant="ghost"
          onClick={handleSave}
          disabled={!title.trim() || isSaving}
          className="h-7 w-7 text-green-500 hover:text-green-600"
        >
          <Check className="w-4 h-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={onCancel}
          className="h-7 w-7 text-muted-foreground"
        >
          <X className="w-4 h-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={onDelete}
          className="h-7 w-7 text-destructive hover:text-destructive"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
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
      {[1, 2, 3].map((i) => (
        <div key={i} className="glass-card overflow-hidden">
          <div className="p-4 flex items-center gap-3">
            <Skeleton className="w-1 h-8 rounded-full" />
            <Skeleton className="w-4 h-4" />
            <Skeleton className="h-5 w-32" />
          </div>
          <div className="border-t border-border/30 p-4 space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

function AssignmentsEmpty() {
  return (
    <div className="glass-card p-12 text-center">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
        <BookOpen className="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2 lowercase">
        no classes yet
      </h3>
      <p className="text-muted-foreground max-w-sm mx-auto text-sm lowercase">
        add a class first, then you can create assignments for it.
      </p>
    </div>
  )
}

function AssignmentsError({ error }: { error: Error }) {
  return (
    <div className="glass-card p-12 text-center border-destructive/20">
      <h3 className="text-lg font-semibold text-destructive mb-2 lowercase">
        failed to load assignments
      </h3>
      <p className="text-muted-foreground mb-4 text-sm">{error.message}</p>
      <Button
        variant="outline"
        onClick={() => window.location.reload()}
        className="lowercase"
      >
        try again
      </Button>
    </div>
  )
}
