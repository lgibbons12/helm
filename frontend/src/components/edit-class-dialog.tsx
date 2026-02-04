import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Plus, Trash2 } from 'lucide-react'

import { classesApi, type Class, type ClassUpdate } from '../lib/api'
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

interface EditClassDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  classData: Class
}

// =============================================================================
// Component
// =============================================================================

export function EditClassDialog({ open, onOpenChange, classData }: EditClassDialogProps) {
  const queryClient = useQueryClient()
  
  // Convert links_json object to array of LinkEntry
  const initialLinks: LinkEntry[] = Object.entries(classData.links_json || {}).map(
    ([type, url]) => ({
      id: crypto.randomUUID(),
      type,
      url,
    })
  )

  const [formData, setFormData] = useState<FormData>({
    name: classData.name,
    code: classData.code || '',
    semester: classData.semester,
    instructor: classData.instructor || '',
    color: classData.color,
    links: initialLinks,
  })

  // Reset form when classData changes
  useEffect(() => {
    const links: LinkEntry[] = Object.entries(classData.links_json || {}).map(
      ([type, url]) => ({
        id: crypto.randomUUID(),
        type,
        url,
      })
    )
    setFormData({
      name: classData.name,
      code: classData.code || '',
      semester: classData.semester,
      instructor: classData.instructor || '',
      color: classData.color,
      links,
    })
  }, [classData])

  // Update class mutation
  const updateClass = useMutation({
    mutationFn: (data: ClassUpdate) => classesApi.update(classData.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classes'] })
      onOpenChange(false)
    },
  })

  // Submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    const linksJson: Record<string, string> = {}
    formData.links.forEach((link) => {
      if (link.url.trim()) {
        linksJson[link.type] = link.url.trim()
      }
    })

    const payload: ClassUpdate = {
      name: formData.name.trim(),
      semester: formData.semester,
      code: formData.code.trim() || null,
      instructor: formData.instructor.trim() || null,
      color: formData.color,
      links_json: linksJson,
    }

    updateClass.mutate(payload)
  }

  // Link management
  const addLink = () => {
    // Find a link type that's not already used
    const usedTypes = new Set(formData.links.map((l) => l.type))
    const availableType = LINK_TYPES.find((t) => !usedTypes.has(t)) || 'other'
    
    setFormData({
      ...formData,
      links: [
        ...formData.links,
        { id: crypto.randomUUID(), type: availableType, url: '' },
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

  const isValid = formData.name.trim() !== '' && formData.semester !== ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg glass-strong border-0 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold lowercase">
            edit class
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          {/* Basic info */}
          <div className="space-y-4">
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

            <div className="grid grid-cols-2 gap-4">
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
          </div>

          {/* Color picker */}
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
          </div>

          {/* Links */}
          <div className="space-y-3">
            <Label className="lowercase">links</Label>
            {formData.links.length === 0 ? (
              <div className="text-center py-4 border border-dashed border-border rounded-lg">
                <p className="text-sm text-muted-foreground mb-2">no links</p>
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
              <div className="space-y-2">
                {formData.links.map((link) => (
                  <div key={link.id} className="flex gap-2 items-start">
                    <Select
                      value={link.type}
                      onValueChange={(value) => updateLink(link.id, 'type', value)}
                    >
                      <SelectTrigger className="w-28 lowercase">
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
                  add link
                </Button>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t border-border/50">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="lowercase"
            >
              cancel
            </Button>
            <Button
              type="submit"
              disabled={!isValid || updateClass.isPending}
              className="lowercase"
            >
              {updateClass.isPending ? 'saving...' : 'save changes'}
            </Button>
          </div>

          {/* Error message */}
          {updateClass.isError && (
            <p className="text-sm text-destructive text-center">
              {updateClass.error?.message || 'failed to update class'}
            </p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}
