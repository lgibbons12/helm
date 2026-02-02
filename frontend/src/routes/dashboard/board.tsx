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
} from 'lucide-react'
import { format, isPast, isToday, parseISO } from 'date-fns'

import {
  assignmentsApi,
  classesApi,
  type Assignment,
  type AssignmentUpdate,
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

  // Group assignments by day
  const backlogAssignments = assignments.filter((a) => !a.planned_start_day)
  const assignmentsByDay = ALL_DAYS.reduce(
    (acc, day) => {
      acc[day] = assignments.filter((a) => a.planned_start_day === day)
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
    const targetDay = over.id as DayOfWeek | 'backlog'
    const assignment = assignments.find((a) => a.id === assignmentId)
    if (!assignment) return

    const newDay = targetDay === 'backlog' ? null : targetDay

    if (assignment.planned_start_day !== newDay) {
      updateAssignment.mutate({
        id: assignmentId,
        data: { planned_start_day: newDay },
      })
    }
  }

  const handleCardClick = (assignmentId: string) => {
    if (!activeId) {
      navigate({ to: '/dashboard/assignments/$assignmentId', params: { assignmentId } })
    }
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
            />
          ))}
        </div>

        {/* Weekend row */}
        <div className="grid grid-cols-5 gap-3">
          {WEEKEND.map((day) => (
            <DayColumn
              key={day}
              day={day}
              assignments={assignmentsByDay[day]}
              classMap={classMap}
              onCardClick={handleCardClick}
            />
          ))}
          {/* Empty spacer columns */}
          <div className="col-span-3" />
        </div>

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
              />
            )}
          </div>
        )}

        {/* Empty backlog drop zone when no items */}
        {backlogAssignments.length === 0 && (
          <BacklogDropZone assignments={[]} classMap={classMap} onCardClick={handleCardClick} />
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
}: {
  assignments: Assignment[]
  classMap: Record<string, Class>
  onCardClick: (id: string) => void
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
}: {
  day: DayOfWeek
  assignments: Assignment[]
  classMap: Record<string, Class>
  onCardClick: (id: string) => void
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
// Draggable Card
// =============================================================================

function DraggableCard({
  assignment,
  classMap,
  onCardClick,
}: {
  assignment: Assignment
  classMap: Record<string, Class>
  onCardClick: (id: string) => void
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
      <BoardCard assignment={assignment} classMap={classMap} />
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
}

function BoardCard({ assignment, classMap, isDragging }: BoardCardProps) {
  const dueDate = assignment.due_date ? parseISO(assignment.due_date) : null
  const isOverdue = dueDate && isPast(dueDate) && !isToday(dueDate)
  const isDueToday = dueDate && isToday(dueDate)
  const isDone = assignment.status === 'done'
  const assignedClass = assignment.class_id ? classMap[assignment.class_id] : null

  return (
    <div
      className={`p-2.5 rounded-lg border bg-card/80 backdrop-blur-sm cursor-grab active:cursor-grabbing transition-all ${
        isDragging ? 'shadow-lg ring-2 ring-accent scale-105' : 'hover:bg-card'
      } ${isDone ? 'opacity-40' : ''}`}
      style={{
        borderLeftWidth: '3px',
        borderLeftColor: assignedClass?.color || 'var(--border)',
      }}
    >
      {/* Class name */}
      {assignedClass && (
        <p className="text-[10px] text-muted-foreground lowercase mb-1 truncate">
          {assignedClass.code || assignedClass.name}
        </p>
      )}

      {/* Title */}
      <p className={`text-sm font-medium line-clamp-2 ${isDone ? 'line-through' : ''}`}>
        {assignment.title}
      </p>

      {/* Metadata row */}
      <div className="flex items-center gap-2 mt-2 text-xs">
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
