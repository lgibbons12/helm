import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Plus, Trash2, Check, ChevronLeft, ChevronRight } from 'lucide-react'

import { classesApi, type ClassCreate } from '../lib/api'
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

const CLASS_COLORS = [
  { name: 'slate', value: '#64748B' },
  { name: 'red', value: '#DC2626' },
  { name: 'orange', value: '#EA580C' },
  { name: 'amber', value: '#D97706' },
  { name: 'green', value: '#16A34A' },
  { name: 'teal', value: '#0D9488' },
  { name: 'blue', value: '#2563EB' },
  { name: 'purple', value: '#7C3AED' },
  { name: 'pink', value: '#DB2777' },
]

const LINK_TYPES = [
  'syllabus',
  'zoom',
  'canvas',
  'piazza',
  'gradescope',
  'github',
  'website',
  'other',
]

// Generate semesters: current year ± 1 year
function generateSemesters(): string[] {
  const currentYear = new Date().getFullYear()
  const semesters: string[] = []
  
  for (let year = currentYear + 1; year >= currentYear - 1; year--) {
    semesters.push(`spring ${year}`)
    semesters.push(`fall ${year}`)
    semesters.push(`summer ${year}`)
    semesters.push(`winter ${year}`)
  }
  
  return semesters
}

const SEMESTERS = generateSemesters()

const STEPS = [
  { id: 1, name: 'basics' },
  { id: 2, name: 'details' },
  { id: 3, name: 'links' },
  { id: 4, name: 'review' },
]

// =============================================================================
// Types
// =============================================================================

interface LinkEntry {
  id: string
  type: string
  url: string
}

interface FormData {
  name: string
  code: string
  semester: string
  instructor: string
  color: string | null
  links: LinkEntry[]
}

interface AddClassDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// =============================================================================
// Component
// =============================================================================

export function AddClassDialog({ open, onOpenChange }: AddClassDialogProps) {
  const queryClient = useQueryClient()
  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState<FormData>({
    name: '',
    code: '',
    semester: '',
    instructor: '',
    color: null,
    links: [],
  })

  // Create class mutation
  const createClass = useMutation({
    mutationFn: (data: ClassCreate) => classesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classes'] })
      handleClose()
    },
  })

  // Reset form when dialog closes
  const handleClose = () => {
    setStep(1)
    setFormData({
      name: '',
      code: '',
      semester: '',
      instructor: '',
      color: null,
      links: [],
    })
    onOpenChange(false)
  }

  // Navigation
  const canGoNext = () => {
    switch (step) {
      case 1:
        return formData.name.trim() !== '' && formData.semester !== ''
      case 2:
      case 3:
        return true
      case 4:
        return true
      default:
        return false
    }
  }

  const goNext = () => {
    if (step < 4 && canGoNext()) {
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
    const linksJson: Record<string, string> = {}
    formData.links.forEach((link) => {
      if (link.url.trim()) {
        linksJson[link.type] = link.url.trim()
      }
    })

    const payload: ClassCreate = {
      name: formData.name.trim(),
      semester: formData.semester,
      code: formData.code.trim() || null,
      instructor: formData.instructor.trim() || null,
      color: formData.color,
      links_json: Object.keys(linksJson).length > 0 ? linksJson : undefined,
    }

    createClass.mutate(payload)
  }

  // Link management
  const addLink = () => {
    setFormData({
      ...formData,
      links: [
        ...formData.links,
        { id: crypto.randomUUID(), type: 'syllabus', url: '' },
      ],
    })
  }

  const removeLink = (id: string) => {
    setFormData({
      ...formData,
      links: formData.links.filter((link) => link.id !== id),
    })
  }

  const updateLink = (id: string, field: 'type' | 'url', value: string) => {
    setFormData({
      ...formData,
      links: formData.links.map((link) =>
        link.id === id ? { ...link, [field]: value } : link
      ),
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg glass-strong border-0">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold lowercase">
            add new class
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <StepIndicator currentStep={step} />

        {/* Step content */}
        <div className="mt-6 min-h-[280px]">
          {step === 1 && (
            <StepBasics formData={formData} setFormData={setFormData} />
          )}
          {step === 2 && (
            <StepDetails formData={formData} setFormData={setFormData} />
          )}
          {step === 3 && (
            <StepLinks
              formData={formData}
              addLink={addLink}
              removeLink={removeLink}
              updateLink={updateLink}
            />
          )}
          {step === 4 && <StepReview formData={formData} />}
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

          {step < 4 ? (
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
              disabled={createClass.isPending}
              className="gap-1 lowercase"
            >
              {createClass.isPending ? 'creating...' : 'create class'}
              <Check className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* Error message */}
        {createClass.isError && (
          <p className="text-sm text-destructive text-center mt-2">
            {createClass.error?.message || 'failed to create class'}
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

interface StepProps {
  formData: FormData
  setFormData: React.Dispatch<React.SetStateAction<FormData>>
}

function StepBasics({ formData, setFormData }: StepProps) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        let's start with the essentials
      </p>

      <div className="space-y-2">
        <Label htmlFor="name" className="lowercase">
          class name *
        </Label>
        <Input
          id="name"
          placeholder="e.g. introduction to computer science"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="lowercase"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="code" className="lowercase">
          course code
        </Label>
        <Input
          id="code"
          placeholder="e.g. cs 101"
          value={formData.code}
          onChange={(e) => setFormData({ ...formData, code: e.target.value })}
          className="lowercase"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="semester" className="lowercase">
          semester *
        </Label>
        <Select
          value={formData.semester}
          onValueChange={(value) =>
            setFormData({ ...formData, semester: value })
          }
        >
          <SelectTrigger className="lowercase">
            <SelectValue placeholder="select semester" />
          </SelectTrigger>
          <SelectContent>
            {SEMESTERS.map((sem) => (
              <SelectItem key={sem} value={sem} className="lowercase">
                {sem}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

// =============================================================================
// Step 2: Details
// =============================================================================

function StepDetails({ formData, setFormData }: StepProps) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        personalize your class
      </p>

      <div className="space-y-2">
        <Label htmlFor="instructor" className="lowercase">
          instructor
        </Label>
        <Input
          id="instructor"
          placeholder="e.g. prof. smith"
          value={formData.instructor}
          onChange={(e) =>
            setFormData({ ...formData, instructor: e.target.value })
          }
          className="lowercase"
        />
      </div>

      <div className="space-y-3">
        <Label className="lowercase">color</Label>
        <div className="flex flex-wrap gap-2">
          {CLASS_COLORS.map((color) => (
            <button
              key={color.value}
              type="button"
              onClick={() =>
                setFormData({
                  ...formData,
                  color: formData.color === color.value ? null : color.value,
                })
              }
              className={`w-8 h-8 rounded-lg transition-all duration-200 ${
                formData.color === color.value
                  ? 'ring-2 ring-offset-2 ring-primary scale-110'
                  : 'hover:scale-105'
              }`}
              style={{ backgroundColor: color.value }}
              title={color.name}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {formData.color
            ? `selected: ${CLASS_COLORS.find((c) => c.value === formData.color)?.name}`
            : 'no color selected'}
        </p>
      </div>
    </div>
  )
}

// =============================================================================
// Step 3: Links
// =============================================================================

interface StepLinksProps {
  formData: FormData
  addLink: () => void
  removeLink: (id: string) => void
  updateLink: (id: string, field: 'type' | 'url', value: string) => void
}

function StepLinks({ formData, addLink, removeLink, updateLink }: StepLinksProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        add useful links for quick access
      </p>

      {formData.links.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-border rounded-lg">
          <p className="text-sm text-muted-foreground mb-3">no links yet</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addLink}
            className="gap-1 lowercase"
          >
            <Plus className="w-4 h-4" />
            add link
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {formData.links.map((link) => (
            <div key={link.id} className="flex gap-2 items-start">
              <Select
                value={link.type}
                onValueChange={(value) => updateLink(link.id, 'type', value)}
              >
                <SelectTrigger className="w-32 lowercase">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LINK_TYPES.map((type) => (
                    <SelectItem key={type} value={type} className="lowercase">
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="https://..."
                value={link.url}
                onChange={(e) => updateLink(link.id, 'url', e.target.value)}
                className="flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeLink(link.id)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addLink}
            className="gap-1 lowercase"
          >
            <Plus className="w-4 h-4" />
            add another
          </Button>
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Step 4: Review
// =============================================================================

function StepReview({ formData }: { formData: FormData }) {
  const activeLinks = formData.links.filter((l) => l.url.trim())

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        review your class details
      </p>

      <div className="glass rounded-lg p-4 space-y-3">
        {/* Name and code */}
        <div className="flex items-start gap-3">
          {formData.color && (
            <div
              className="w-3 h-12 rounded-full flex-shrink-0"
              style={{ backgroundColor: formData.color }}
            />
          )}
          <div>
            <h3 className="font-semibold text-foreground lowercase">
              {formData.name}
            </h3>
            {formData.code && (
              <p className="text-sm text-muted-foreground lowercase">
                {formData.code}
              </p>
            )}
          </div>
        </div>

        <div className="h-px bg-border/50" />

        {/* Details grid */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-muted-foreground">semester</span>
            <p className="font-medium lowercase">{formData.semester}</p>
          </div>
          {formData.instructor && (
            <div>
              <span className="text-muted-foreground">instructor</span>
              <p className="font-medium lowercase">{formData.instructor}</p>
            </div>
          )}
        </div>

        {/* Links */}
        {activeLinks.length > 0 && (
          <>
            <div className="h-px bg-border/50" />
            <div>
              <span className="text-sm text-muted-foreground">links</span>
              <div className="flex flex-wrap gap-2 mt-1">
                {activeLinks.map((link) => (
                  <span
                    key={link.id}
                    className="text-xs bg-muted px-2 py-1 rounded lowercase"
                  >
                    {link.type}
                  </span>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
