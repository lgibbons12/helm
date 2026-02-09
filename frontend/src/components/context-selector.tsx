import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, GraduationCap, BookOpen, FileText, StickyNote, Loader2 } from 'lucide-react'

import { classesApi, assignmentsApi, pdfApi, notesApi } from '@/lib/api'

export interface ChatContext {
  classIds: string[]
  assignmentIds: string[]
  pdfIds: string[]
  noteIds: string[]
}

interface ContextSelectorProps {
  onContextChange: (context: ChatContext) => void
  initialContext?: ChatContext
}

export function ContextSelector({ onContextChange, initialContext }: ContextSelectorProps) {
  const [selectedClasses, setSelectedClasses] = useState<string[]>(initialContext?.classIds || [])
  const [selectedAssignments, setSelectedAssignments] = useState<string[]>(initialContext?.assignmentIds || [])
  const [selectedPdfs, setSelectedPdfs] = useState<string[]>(initialContext?.pdfIds || [])
  const [selectedNotes, setSelectedNotes] = useState<string[]>(initialContext?.noteIds || [])

  const [classesOpen, setClassesOpen] = useState(true)
  const [assignmentsOpen, setAssignmentsOpen] = useState(false)
  const [pdfsOpen, setPdfsOpen] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)

  const { data: classes = [], isLoading: classesLoading } = useQuery({
    queryKey: ['classes'],
    queryFn: () => classesApi.list(),
  })

  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery({
    queryKey: ['assignments'],
    queryFn: () => assignmentsApi.list(),
  })

  const { data: pdfsData, isLoading: pdfsLoading } = useQuery({
    queryKey: ['pdfs'],
    queryFn: () => pdfApi.list(),
  })
  const pdfs = pdfsData?.pdfs || []

  const { data: notes = [], isLoading: notesLoading } = useQuery({
    queryKey: ['notes'],
    queryFn: () => notesApi.list(),
  })

  const isLoading = classesLoading || assignmentsLoading || pdfsLoading || notesLoading

  // Notify parent of changes
  useEffect(() => {
    onContextChange({
      classIds: selectedClasses,
      assignmentIds: selectedAssignments,
      pdfIds: selectedPdfs,
      noteIds: selectedNotes,
    })
  }, [selectedClasses, selectedAssignments, selectedPdfs, selectedNotes, onContextChange])

  const toggleItem = (
    id: string,
    selected: string[],
    setSelected: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    setSelected(
      selected.includes(id)
        ? selected.filter((i) => i !== id)
        : [...selected, id]
    )
  }

  const totalSelected = selectedClasses.length + selectedAssignments.length + selectedPdfs.length + selectedNotes.length

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-4">
        <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
        <span className="text-xs text-muted-foreground lowercase">loading context...</span>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between px-1 mb-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          context
        </span>
        {totalSelected > 0 && (
          <span className="text-[10px] text-primary lowercase">
            {totalSelected} selected
          </span>
        )}
      </div>

      {/* Classes */}
      <ContextGroup
        label="classes"
        icon={GraduationCap}
        isOpen={classesOpen}
        onToggle={() => setClassesOpen(!classesOpen)}
        count={selectedClasses.length}
      >
        {classes.map((cls) => (
          <ContextItem
            key={cls.id}
            label={cls.code || cls.name}
            color={cls.color || undefined}
            isSelected={selectedClasses.includes(cls.id)}
            onToggle={() => toggleItem(cls.id, selectedClasses, setSelectedClasses)}
          />
        ))}
        {classes.length === 0 && (
          <p className="text-xs text-muted-foreground/50 px-2 py-1 lowercase">no classes</p>
        )}
      </ContextGroup>

      {/* Assignments */}
      <ContextGroup
        label="assignments"
        icon={BookOpen}
        isOpen={assignmentsOpen}
        onToggle={() => setAssignmentsOpen(!assignmentsOpen)}
        count={selectedAssignments.length}
      >
        {assignments
          .filter((a) => a.status !== 'finished')
          .map((assignment) => (
            <ContextItem
              key={assignment.id}
              label={assignment.title}
              isSelected={selectedAssignments.includes(assignment.id)}
              onToggle={() => toggleItem(assignment.id, selectedAssignments, setSelectedAssignments)}
            />
          ))}
        {assignments.length === 0 && (
          <p className="text-xs text-muted-foreground/50 px-2 py-1 lowercase">no assignments</p>
        )}
      </ContextGroup>

      {/* PDFs */}
      <ContextGroup
        label="pdfs"
        icon={FileText}
        isOpen={pdfsOpen}
        onToggle={() => setPdfsOpen(!pdfsOpen)}
        count={selectedPdfs.length}
      >
        {pdfs
          .filter((p) => p.extraction_status === 'success')
          .map((pdf) => (
            <ContextItem
              key={pdf.id}
              label={pdf.filename}
              isSelected={selectedPdfs.includes(pdf.id)}
              onToggle={() => toggleItem(pdf.id, selectedPdfs, setSelectedPdfs)}
            />
          ))}
        {pdfs.length === 0 && (
          <p className="text-xs text-muted-foreground/50 px-2 py-1 lowercase">no pdfs uploaded</p>
        )}
      </ContextGroup>

      {/* Notes */}
      <ContextGroup
        label="notes"
        icon={StickyNote}
        isOpen={notesOpen}
        onToggle={() => setNotesOpen(!notesOpen)}
        count={selectedNotes.length}
      >
        {notes
          .filter((n) => n.content_text)
          .map((note) => (
            <ContextItem
              key={note.id}
              label={note.title}
              isSelected={selectedNotes.includes(note.id)}
              onToggle={() => toggleItem(note.id, selectedNotes, setSelectedNotes)}
            />
          ))}
        {notes.length === 0 && (
          <p className="text-xs text-muted-foreground/50 px-2 py-1 lowercase">no notes</p>
        )}
      </ContextGroup>
    </div>
  )
}

// =============================================================================
// Context Group
// =============================================================================

function ContextGroup({
  label,
  icon: Icon,
  isOpen,
  onToggle,
  count,
  children,
}: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  isOpen: boolean
  onToggle: () => void
  count: number
  children: React.ReactNode
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/30 transition-colors"
      >
        {isOpen ? (
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
        )}
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs text-foreground lowercase flex-1 text-left">{label}</span>
        {count > 0 && (
          <span className="text-[10px] text-primary bg-primary/10 px-1.5 rounded-full">
            {count}
          </span>
        )}
      </button>
      {isOpen && (
        <div className="ml-5 space-y-0.5 mt-0.5">{children}</div>
      )}
    </div>
  )
}

// =============================================================================
// Context Item (Checkbox)
// =============================================================================

function ContextItem({
  label,
  color,
  isSelected,
  onToggle,
}: {
  label: string
  color?: string
  isSelected: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-center gap-2 px-2 py-1 rounded text-xs transition-colors ${
        isSelected
          ? 'bg-primary/10 text-foreground'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/20'
      }`}
    >
      <div
        className={`w-3 h-3 rounded-sm border flex-shrink-0 flex items-center justify-center transition-colors ${
          isSelected
            ? 'bg-primary border-primary'
            : 'border-border'
        }`}
      >
        {isSelected && (
          <svg className="w-2 h-2 text-primary-foreground" viewBox="0 0 12 12" fill="none">
            <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      {color && (
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      )}
      <span className="truncate lowercase">{label}</span>
    </button>
  )
}
