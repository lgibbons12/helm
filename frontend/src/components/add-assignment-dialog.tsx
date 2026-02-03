import { useState } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { Check, ChevronLeft, ChevronRight, Calendar, Clock } from 'lucide-react'

import {
  assignmentsApi,
  classesApi,
  type AssignmentCreate,
  type AssignmentType,
  type DayOfWeek,
  type Class,
} from '../lib/api'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// =============================================================================
// Constants
// =============================================================================

const ASSIGNMENT_TYPES: { value: AssignmentType; label: string }[] = [
  { value: 'pset', label: 'problem set' },
  { value: 'reading', label: 'reading' },
  { value: 'project', label: 'project' },
  { value: 'quiz', label: 'quiz' },
  { value: 'other', label: 'other' },
]

const DAYS_OF_WEEK: { value: DayOfWeek; label: string }[] = [
  { value: 'monday', label: 'monday' },
  { value: 'tuesday', label: 'tuesday' },
  { value: 'wednesday', label: 'wednesday' },
  { value: 'thursday', label: 'thursday' },
  { value: 'friday', label: 'friday' },
  { value: 'saturday', label: 'saturday' },
  { value: 'sunday', label: 'sunday' },
]

const STEPS = [
  { id: 1, name: 'basics' },
  { id: 2, name: 'schedule' },
  { id: 3, name: 'review' },
]

// =============================================================================
// Types
// =============================================================================

interface FormData {
  title: string
  type: AssignmentType
  class_id: string | null
  due_date: string
  planned_start_day: DayOfWeek | null
  estimated_minutes: string
  notes_short: string
}

interface AddAssignmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultClassId?: string
}

// =============================================================================
// Component
// =============================================================================

export function AddAssignmentDialog({
  open,
  onOpenChange,
  defaultClassId,
}: AddAssignmentDialogProps) {
  const queryClient = useQueryClient()
  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState<FormData>({
    title: '',
    type: 'other',
    class_id: defaultClassId || null,
    due_date: '',
    planned_start_day: null,
    estimated_minutes: '',
    notes_short: '',
  })

  // Fetch classes for the dropdown
  const { data: classes } = useQuery({
    queryKey: ['classes'],
    queryFn: () => classesApi.list(),
  })

  // Create assignment mutation
  const createAssignment = useMutation({
    mutationFn: (data: AssignmentCreate) => assignmentsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] })
      handleClose()
    },
  })

  // Reset form when dialog closes
  const handleClose = () => {
    setStep(1)
    setFormData({
      title: '',
      type: 'other',
      class_id: defaultClassId || null,
      due_date: '',
      planned_start_day: null,
      estimated_minutes: '',
      notes_short: '',
    })
    onOpenChange(false)
  }

  // Navigation
  const canGoNext = () => {
    switch (step) {
      case 1:
        return formData.title.trim() !== ''
      case 2:
      case 3:
        return true
      default:
        return false
    }
  }

  const goNext = () => {
    if (step < 3 && canGoNext()) {
      setStep(step + 1)
    }
  }

  const goBack = () => {
    if (step > 1) {
      setStep(step - 1)
    }
  }

  // Submit
  const handleSubmit = () => {
    const payload: AssignmentCreate = {
      title: formData.title.trim(),
      type: formData.type,
      class_id: formData.class_id || undefined,
      due_date: formData.due_date || undefined,
      planned_start_day: formData.planned_start_day || undefined,
      estimated_minutes: formData.estimated_minutes
        ? parseInt(formData.estimated_minutes, 10)
        : undefined,
      notes_short: formData.notes_short.trim() || undefined,
    }

    createAssignment.mutate(payload)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg glass-strong border-0">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold lowercase">
            add new assignment
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <StepIndicator currentStep={step} />

        {/* Step content */}
        <div className="mt-6 min-h-[240px]">
          {step === 1 && (
            <StepBasics
              formData={formData}
              setFormData={setFormData}
              classes={classes || []}
            />
          )}
          {step === 2 && (
            <StepSchedule formData={formData} setFormData={setFormData} />
          )}
          {step === 3 && <StepReview formData={formData} classes={classes || []} />}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between pt-4 border-t border-border/50">
          <Button
            variant="ghost"
            onClick={goBack}
            disabled={step === 1}
            className="gap-1 lowercase"
          >
            <ChevronLeft className="w-4 h-4" />
            back
          </Button>

          <div className="text-xs text-muted-foreground">
            step {step} of {STEPS.length}
          </div>

          {step < 3 ? (
            <Button
              onClick={goNext}
              disabled={!canGoNext()}
              className="gap-1 lowercase"
            >
              next
              <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={createAssignment.isPending}
              className="gap-1 lowercase"
            >
              {createAssignment.isPending ? 'creating...' : 'create assignment'}
              <Check className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* Error message */}
        {createAssignment.isError && (
          <p className="text-sm text-destructive text-center mt-2">
            {createAssignment.error?.message || 'failed to create assignment'}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}

// =============================================================================
// Step Indicator
// =============================================================================

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-center gap-2 pt-2">
      {STEPS.map((s, index) => (
        <div key={s.id} className="flex items-center">
          <div
            className={`w-2 h-2 rounded-full transition-all duration-300 ${
              s.id === currentStep
                ? 'w-6 bg-primary'
                : s.id < currentStep
                  ? 'bg-primary/60'
                  : 'bg-muted-foreground/30'
            }`}
          />
          {index < STEPS.length - 1 && (
            <div
              className={`w-8 h-0.5 mx-1 transition-colors duration-300 ${
                s.id < currentStep ? 'bg-primary/60' : 'bg-muted-foreground/20'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  )
}

// =============================================================================
// Step 1: Basics
// =============================================================================

interface StepBasicsProps {
  formData: FormData
  setFormData: React.Dispatch<React.SetStateAction<FormData>>
  classes: Class[]
}

function StepBasics({ formData, setFormData, classes }: StepBasicsProps) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        what do you need to do?
      </p>

      <div className="space-y-2">
        <Label htmlFor="title" className="lowercase">
          title *
        </Label>
        <Input
          id="title"
          placeholder="e.g. read chapter 5"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          className="lowercase"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="type" className="lowercase">
          type
        </Label>
        <Select
          value={formData.type}
          onValueChange={(value) =>
            setFormData({ ...formData, type: value as AssignmentType })
          }
        >
          <SelectTrigger className="lowercase">
            <SelectValue placeholder="select type" />
          </SelectTrigger>
          <SelectContent>
            {ASSIGNMENT_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value} className="lowercase">
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="class" className="lowercase">
          class
        </Label>
        <Select
          value={formData.class_id || 'none'}
          onValueChange={(value) =>
            setFormData({ ...formData, class_id: value === 'none' ? null : value })
          }
        >
          <SelectTrigger className="lowercase">
            <SelectValue placeholder="select class (optional)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none" className="lowercase">
              no class
            </SelectItem>
            {classes.map((cls) => (
              <SelectItem key={cls.id} value={cls.id} className="lowercase">
                {cls.code ? `${cls.code} - ${cls.name}` : cls.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

// =============================================================================
// Step 2: Schedule
// =============================================================================

interface StepScheduleProps {
  formData: FormData
  setFormData: React.Dispatch<React.SetStateAction<FormData>>
}

function StepSchedule({ formData, setFormData }: StepScheduleProps) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        when is it due?
      </p>

      <div className="space-y-2">
        <Label htmlFor="due_date" className="lowercase flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          due date
        </Label>
        <Input
          id="due_date"
          type="date"
          value={formData.due_date}
          onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label className="lowercase flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          planned start day
        </Label>
        <Select
          value={formData.planned_start_day || ''}
          onValueChange={(value) =>
            setFormData({ ...formData, planned_start_day: value as DayOfWeek })
          }
        >
          <SelectTrigger className="lowercase">
            <SelectValue placeholder="select a day..." />
          </SelectTrigger>
          <SelectContent>
            {DAYS_OF_WEEK.map((day) => (
              <SelectItem key={day.value} value={day.value} className="lowercase">
                {day.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="estimated" className="lowercase flex items-center gap-2">
          <Clock className="w-4 h-4" />
          estimated time (minutes)
        </Label>
        <Input
          id="estimated"
          type="number"
          min="1"
          placeholder="e.g. 60"
          value={formData.estimated_minutes}
          onChange={(e) =>
            setFormData({ ...formData, estimated_minutes: e.target.value })
          }
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes" className="lowercase">
          quick notes
        </Label>
        <Input
          id="notes"
          placeholder="any quick notes..."
          value={formData.notes_short}
          onChange={(e) => setFormData({ ...formData, notes_short: e.target.value })}
          className="lowercase"
        />
      </div>
    </div>
  )
}

// =============================================================================
// Step 3: Review
// =============================================================================

interface StepReviewProps {
  formData: FormData
  classes: Class[]
}

function StepReview({ formData, classes }: StepReviewProps) {
  const selectedClass = classes.find((c) => c.id === formData.class_id)
  const typeLabel = ASSIGNMENT_TYPES.find((t) => t.value === formData.type)?.label

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        review your assignment
      </p>

      <div className="glass rounded-lg p-4 space-y-3">
        {/* Title */}
        <div>
          <h3 className="font-semibold text-foreground lowercase">
            {formData.title}
          </h3>
          <p className="text-sm text-muted-foreground lowercase">
            {typeLabel}
          </p>
        </div>

        <div className="h-px bg-border/50" />

        {/* Details grid */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          {selectedClass && (
            <div>
              <span className="text-muted-foreground">class</span>
              <p className="font-medium lowercase">
                {selectedClass.code || selectedClass.name}
              </p>
            </div>
          )}
          {formData.due_date && (
            <div>
              <span className="text-muted-foreground">due</span>
              <p className="font-medium">{formData.due_date}</p>
            </div>
          )}
          {formData.planned_start_day && (
            <div>
              <span className="text-muted-foreground">start day</span>
              <p className="font-medium">{formData.planned_start_day}</p>
            </div>
          )}
          {formData.estimated_minutes && (
            <div>
              <span className="text-muted-foreground">time</span>
              <p className="font-medium">{formData.estimated_minutes} min</p>
            </div>
          )}
        </div>

        {formData.notes_short && (
          <>
            <div className="h-px bg-border/50" />
            <div>
              <span className="text-sm text-muted-foreground">notes</span>
              <p className="text-sm lowercase">{formData.notes_short}</p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
