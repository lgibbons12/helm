import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import {
  ChevronDown,
  ChevronRight,
  Clock,
  AlertCircle,
  Circle,
  CircleDashed,
  CircleDot,
  CheckCircle2,
} from 'lucide-react'
import { format, isPast, isToday, parseISO } from 'date-fns'

import {
  assignmentsApi,
  classesApi,
  type Assignment,
  type AssignmentUpdate,
  type AssignmentStatus,
  type DayOfWeek,
  type Class,
} from '../../lib/api'
import { Skeleton } from '@/components/ui/skeleton'

// =============================================================================
// Constants
// =============================================================================

// Two rows: weekdays on top, weekend on bottom
const WEEKDAYS: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
const WEEKEND: DayOfWeek[] = ['saturday', 'sunday']
const ALL_DAYS: DayOfWeek[] = [...WEEKDAYS, ...WEEKEND]

const SHORT_DAYS: Record<DayOfWeek, string> = {
  monday: 'mon',
  tuesday: 'tue',
  wednesday: 'wed',
  thursday: 'thu',
  friday: 'fri',
  saturday: 'sat',
  sunday: 'sun',
}

// =============================================================================
// Route
// =============================================================================

export const Route = createFileRoute('/dashboard/board')({
  component: BoardPage,
})

// =============================================================================
// Main Component
// =============================================================================

function BoardPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [backlogOpen, setBacklogOpen] = useState(false)

  // Fetch all assignments
  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery({
    queryKey: ['assignments'],
    queryFn: () => assignmentsApi.list(),
  })

  // Fetch all classes for displaying class names
  const { data: classes = [], isLoading: classesLoading } = useQuery({
    queryKey: ['classes'],
    queryFn: () => classesApi.list(),
  })

  // Create a map for quick class lookup
  const classMap = classes.reduce(
    (acc, c) => {
      acc[c.id] = c
      return acc
    },
    {} as Record<string, Class>
  )

  const isLoading = assignmentsLoading || classesLoading

  // Update assignment mutation
  const updateAssignment = useMutation({
    mutationFn: ({ id, data }: { id: string; data: AssignmentUpdate }) =>
      assignmentsApi.update(id, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ['assignments'] })
      const previousAssignments = queryClient.getQueryData<Assignment[]>(['assignments'])
      queryClient.setQueryData<Assignment[]>(['assignments'], (old) =>
        old?.map((a) => (a.id === id ? { ...a, ...data } : a))
      )
      return { previousAssignments }
    },
    onError: (_err, _variables, context) => {
      if (context?.previousAssignments) {
        queryClient.setQueryData(['assignments'], context.previousAssignments)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] })
    },
  })

  // Filter out finished assignments - board only shows active work
  const activeAssignments = assignments.filter((a) => a.status !== 'finished')

  // Group assignments by day
  const backlogAssignments = activeAssignments.filter((a) => !a.planned_start_day)
  const assignmentsByDay = ALL_DAYS.reduce(
    (acc, day) => {
      acc[day] = activeAssignments.filter((a) => a.planned_start_day === day)
      return acc
    },
    {} as Record<DayOfWeek, Assignment[]>
  )

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor)
  )

  const activeAssignment = activeId
    ? assignments.find((a) => a.id === activeId)
    : null

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (!over) return

    const assignmentId = active.id as string
    const targetId = over.id as string
    const assignment = assignments.find((a) => a.id === assignmentId)
    if (!assignment) return

    // Determine the new day based on drop target
    let newDay: DayOfWeek | null = null
    if (targetId === 'backlog') {
      newDay = null
    } else if (targetId === 'weekend') {
      newDay = 'saturday' // Weekend drops default to saturday
    } else {
      newDay = targetId as DayOfWeek
    }

    if (assignment.planned_start_day !== newDay) {
      updateAssignment.mutate({
        id: assignmentId,
        data: { planned_start_day: newDay },
      })
    }
  }

  const handleCardClick = (assignmentId: string) => {
    if (!activeId) {
      navigate({ to: '/dashboard/assignments/$assignmentId', params: { assignmentId }, search: { from: 'board' } })
    }
  }

  // Status update handler for clicking status on cards
  const handleStatusClick = (e: React.MouseEvent, assignmentId: string, currentStatus: AssignmentStatus) => {
    e.stopPropagation() // Prevent card navigation
    const statusCycle: AssignmentStatus[] = ['not_started', 'in_progress', 'almost_done', 'finished']
    const currentIndex = statusCycle.indexOf(currentStatus)
    const nextStatus = statusCycle[(currentIndex + 1) % statusCycle.length]
    updateAssignment.mutate({ id: assignmentId, data: { status: nextStatus } })
  }

  if (isLoading) {
    return <BoardLoading />
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground lowercase">board</h1>
          <p className="text-xs text-muted-foreground lowercase">
            drag to schedule
          </p>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {/* Weekdays row */}
        <div className="grid grid-cols-5 gap-3">
          {WEEKDAYS.map((day) => (
            <DayColumn
              key={day}
              day={day}
              assignments={assignmentsByDay[day]}
              classMap={classMap}
              onCardClick={handleCardClick}
              onStatusClick={handleStatusClick}
            />
          ))}
        </div>

        {/* Weekend - wide catchall */}
        <WeekendColumn
          assignments={[...assignmentsByDay.saturday, ...assignmentsByDay.sunday]}
          classMap={classMap}
          onCardClick={handleCardClick}
          onStatusClick={handleStatusClick}
        />

        {/* Backlog - subtle collapsible */}
        {backlogAssignments.length > 0 && (
          <div className="border-t border-border/30 pt-3">
            <button
              onClick={() => setBacklogOpen(!backlogOpen)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {backlogOpen ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              <span className="lowercase">
                unscheduled ({backlogAssignments.length})
              </span>
            </button>

            {backlogOpen && (
              <BacklogDropZone
                assignments={backlogAssignments}
                classMap={classMap}
                onCardClick={handleCardClick}
                onStatusClick={handleStatusClick}
              />
            )}
          </div>
        )}

        {/* Empty backlog drop zone when no items */}
        {backlogAssignments.length === 0 && (
          <BacklogDropZone assignments={[]} classMap={classMap} onCardClick={handleCardClick} onStatusClick={handleStatusClick} />
        )}

        {/* Drag overlay */}
        <DragOverlay>
          {activeAssignment ? (
            <BoardCard assignment={activeAssignment} classMap={classMap} isDragging />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

// =============================================================================
// Backlog Drop Zone
// =============================================================================

function BacklogDropZone({
  assignments,
  classMap,
  onCardClick,
  onStatusClick,
}: {
  assignments: Assignment[]
  classMap: Record<string, Class>
  onCardClick: (id: string) => void
  onStatusClick: (e: React.MouseEvent, id: string, status: AssignmentStatus) => void
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'backlog',
  })

  return (
    <div
      ref={setNodeRef}
      className={`mt-2 min-h-[60px] flex gap-2 overflow-x-auto py-2 rounded transition-colors ${
        isOver ? 'bg-accent/5 ring-1 ring-accent/30' : ''
      }`}
    >
      {assignments.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground/50 lowercase py-2">
          drop here to unschedule
        </div>
      ) : (
        assignments.map((assignment) => (
          <DraggableCard
            key={assignment.id}
            assignment={assignment}
            classMap={classMap}
            onCardClick={onCardClick}
            onStatusClick={onStatusClick}
          />
        ))
      )}
    </div>
  )
}

// =============================================================================
// Day Column
// =============================================================================

function DayColumn({
  day,
  assignments,
  classMap,
  onCardClick,
  onStatusClick,
}: {
  day: DayOfWeek
  assignments: Assignment[]
  classMap: Record<string, Class>
  onCardClick: (id: string) => void
  onStatusClick: (e: React.MouseEvent, id: string, status: AssignmentStatus) => void
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: day,
  })

  // Check if this is today
  const today = new Date()
  const dayIndex = ALL_DAYS.indexOf(day)
  const currentDayIndex = (today.getDay() + 6) % 7
  const isCurrentDay = dayIndex === currentDayIndex

  return (
    <div
      ref={setNodeRef}
      className={`glass rounded-lg p-3 min-h-[220px] flex flex-col transition-all ${
        isOver
          ? 'bg-accent/10 ring-2 ring-accent/50'
          : ''
      } ${isCurrentDay ? 'ring-2 ring-accent/50' : ''}`}
    >
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border/30">
        <span
          className={`text-sm font-medium lowercase ${
            isCurrentDay ? 'text-accent' : 'text-foreground'
          }`}
        >
          {SHORT_DAYS[day]}
        </span>
        {assignments.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {assignments.length}
          </span>
        )}
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto">
        {assignments.map((assignment) => (
          <DraggableCard
            key={assignment.id}
            assignment={assignment}
            classMap={classMap}
            onCardClick={onCardClick}
            onStatusClick={onStatusClick}
          />
        ))}

        {assignments.length === 0 && (
          <div className="h-full flex items-center justify-center">
            <span className="text-xs text-muted-foreground/40 lowercase">
              drop here
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// =============================================================================
// Weekend Column
// =============================================================================

function WeekendColumn({
  assignments,
  classMap,
  onCardClick,
  onStatusClick,
}: {
  assignments: Assignment[]
  classMap: Record<string, Class>
  onCardClick: (id: string) => void
  onStatusClick: (e: React.MouseEvent, id: string, status: AssignmentStatus) => void
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'weekend',
  })

  // Check if today is weekend
  const today = new Date()
  const dayOfWeek = today.getDay()
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

  return (
    <div
      ref={setNodeRef}
      className={`glass rounded-lg p-3 min-h-[120px] transition-all ${
        isOver
          ? 'bg-accent/10 ring-2 ring-accent/50'
          : ''
      } ${isWeekend ? 'ring-2 ring-accent/50' : ''}`}
    >
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border/30">
        <span
          className={`text-sm font-medium lowercase ${
            isWeekend ? 'text-accent' : 'text-foreground'
          }`}
        >
          weekend
        </span>
        {assignments.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {assignments.length}
          </span>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {assignments.map((assignment) => (
          <div key={assignment.id} className="flex-shrink-0 w-48">
            <DraggableCard
              assignment={assignment}
              classMap={classMap}
              onCardClick={onCardClick}
              onStatusClick={onStatusClick}
            />
          </div>
        ))}

        {assignments.length === 0 && (
          <div className="flex-1 flex items-center justify-center py-4">
            <span className="text-xs text-muted-foreground/40 lowercase">
              drop here
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// =============================================================================
// Draggable Card
// =============================================================================

function DraggableCard({
  assignment,
  classMap,
  onCardClick,
  onStatusClick,
}: {
  assignment: Assignment
  classMap: Record<string, Class>
  onCardClick: (id: string) => void
  onStatusClick: (e: React.MouseEvent, id: string, status: AssignmentStatus) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: assignment.id,
  })

  const style = transform
    ? {
        transform: CSS.Translate.toString(transform),
      }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`${isDragging ? 'opacity-40' : ''} touch-none`}
      onClick={() => onCardClick(assignment.id)}
    >
      <BoardCard assignment={assignment} classMap={classMap} onStatusClick={onStatusClick} />
    </div>
  )
}

// =============================================================================
// Board Card
// =============================================================================

interface BoardCardProps {
  assignment: Assignment
  classMap: Record<string, Class>
  isDragging?: boolean
  onStatusClick?: (e: React.MouseEvent, id: string, status: AssignmentStatus) => void
}

function BoardCard({ assignment, classMap, isDragging, onStatusClick }: BoardCardProps) {
  const dueDate = assignment.due_date ? parseISO(assignment.due_date) : null
  const isOverdue = dueDate && isPast(dueDate) && !isToday(dueDate)
  const isDueToday = dueDate && isToday(dueDate)
  const assignedClass = assignment.class_id ? classMap[assignment.class_id] : null

  const StatusIcon = {
    not_started: Circle,
    in_progress: CircleDashed,
    almost_done: CircleDot,
    finished: CheckCircle2,
  }[assignment.status]

  const statusColor = {
    not_started: 'text-muted-foreground hover:text-foreground',
    in_progress: 'text-amber-400 hover:text-amber-300',
    almost_done: 'text-blue-400 hover:text-blue-300',
    finished: 'text-green-500 hover:text-green-400',
  }[assignment.status]

  return (
    <div
      className={`p-2.5 rounded-lg border bg-card/80 backdrop-blur-sm cursor-grab active:cursor-grabbing transition-all ${
        isDragging ? 'shadow-lg ring-2 ring-accent scale-105' : 'hover:bg-card'
      }`}
      style={{
        borderLeftWidth: '3px',
        borderLeftColor: assignedClass?.color || 'var(--border)',
      }}
    >
      <div className="flex items-start gap-2">
        {/* Status toggle */}
        <button
          onClick={(e) => onStatusClick?.(e, assignment.id, assignment.status)}
          className={`flex-shrink-0 transition-colors ${statusColor}`}
          title={`Status: ${assignment.status.replace(/_/g, ' ')}`}
        >
          <StatusIcon className="w-4 h-4" />
        </button>

        <div className="flex-1 min-w-0">
          {/* Class name */}
          {assignedClass && (
            <p className="text-[10px] text-muted-foreground lowercase truncate">
              {assignedClass.code || assignedClass.name}
            </p>
          )}

          {/* Title */}
          <p className="text-sm font-medium line-clamp-2">
            {assignment.title}
          </p>
        </div>
      </div>

      {/* Metadata row */}
      <div className="flex items-center gap-2 mt-2 text-xs pl-6">
        {dueDate && (
          <span
            className={`lowercase ${
              isOverdue
                ? 'text-red-400'
                : isDueToday
                  ? 'text-orange-400'
                  : 'text-muted-foreground'
            }`}
          >
            {isOverdue && <AlertCircle className="w-3 h-3 inline mr-0.5" />}
            {format(dueDate, 'MMM d').toLowerCase()}
          </span>
        )}

        {assignment.estimated_minutes && (
          <span className="text-muted-foreground flex items-center gap-0.5">
            <Clock className="w-3 h-3" />
            {assignment.estimated_minutes}m
          </span>
        )}
      </div>
    </div>
  )
}

// =============================================================================
// Loading State
// =============================================================================

function BoardLoading() {
  return (
    <div className="space-y-4">
      <div>
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-3 w-32 mt-1" />
      </div>

      <div className="grid grid-cols-5 gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[200px] rounded-lg" />
        ))}
      </div>

      <div className="grid grid-cols-5 gap-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-[200px] rounded-lg" />
        ))}
      </div>
    </div>
  )
}
