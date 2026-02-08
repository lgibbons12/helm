import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  GraduationCap,
  FileUp,
  StickyNote,
  Check,
  Globe,
} from 'lucide-react'

import {
  classesApi,
  notesApi,
  pdfApi,
} from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

// =============================================================================
// Types
// =============================================================================

export interface ConversationSetupResult {
  title: string
  classIds: string[]
  assignmentIds: string[]
  pdfIds: string[]
  noteIds: string[]
}

interface ConversationSetupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onStart: (result: ConversationSetupResult) => void
  isPending?: boolean
}

// =============================================================================
// Setup Dialog
// =============================================================================

export function ConversationSetupDialog({
  open,
  onOpenChange,
  onStart,
  isPending,
}: ConversationSetupDialogProps) {
  const [step, setStep] = useState<1 | 2>(1)
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null)
  const [selectedPdfIds, setSelectedPdfIds] = useState<string[]>([])
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([])

  // Fetch data
  const { data: classes = [] } = useQuery({
    queryKey: ['classes'],
    queryFn: () => classesApi.list(),
    enabled: open,
  })

  const { data: pdfsData } = useQuery({
    queryKey: ['pdfs'],
    queryFn: () => pdfApi.list(),
    enabled: open,
  })
  const allPdfs = pdfsData?.pdfs || []

  const { data: allNotes = [] } = useQuery({
    queryKey: ['notes'],
    queryFn: () => notesApi.list(),
    enabled: open,
  })

  // Filter by selected class
  const filteredPdfs = useMemo(() => {
    const successPdfs = allPdfs.filter((p) => p.extraction_status === 'success')
    if (!selectedClassId) return successPdfs
    return successPdfs.filter((p) => p.class_id === selectedClassId || !p.class_id)
  }, [allPdfs, selectedClassId])

  const filteredNotes = useMemo(() => {
    const notesWithContent = allNotes.filter((n) => n.content_text)
    if (!selectedClassId) return notesWithContent
    return notesWithContent.filter((n) => n.class_id === selectedClassId || !n.class_id)
  }, [allNotes, selectedClassId])

  const togglePdf = (id: string) => {
    setSelectedPdfIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    )
  }

  const toggleNote = (id: string) => {
    setSelectedNoteIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    )
  }

  const handleStart = () => {
    onStart({
      title: 'New Conversation',
      classIds: selectedClassId ? [selectedClassId] : [],
      assignmentIds: [],
      pdfIds: selectedPdfIds,
      noteIds: selectedNoteIds,
    })
  }

  const handleBack = () => {
    if (step === 2) setStep(1)
  }

  const handleNext = () => {
    if (step === 1) setStep(2)
  }

  // Reset on close
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setStep(1)
      setSelectedClassId(null)
      setSelectedPdfIds([])
      setSelectedNoteIds([])
    }
    onOpenChange(open)
  }

  const totalContext = selectedPdfIds.length + selectedNoteIds.length

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="glass-strong border-0 max-w-lg">
        <DialogHeader>
          <DialogTitle className="lowercase">
            {step === 1 ? 'choose scope' : 'select context'}
          </DialogTitle>
          <DialogDescription className="lowercase">
            {step === 1
              ? 'pick a class or start a general conversation'
              : 'choose pdfs and notes the ai should reference'}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex items-center gap-2 mb-2">
          <div
            className={`h-1 flex-1 rounded-full transition-colors ${
              step >= 1 ? 'bg-primary' : 'bg-muted'
            }`}
          />
          <div
            className={`h-1 flex-1 rounded-full transition-colors ${
              step >= 2 ? 'bg-primary' : 'bg-muted'
            }`}
          />
        </div>

        {/* Step 1: Scope */}
        {step === 1 && (
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {/* General option */}
            <button
              onClick={() => setSelectedClassId(null)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-left ${
                selectedClassId === null
                  ? 'bg-primary/10 ring-1 ring-primary/30'
                  : 'hover:bg-muted/30'
              }`}
            >
              <Globe className="w-5 h-5 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground lowercase">general</p>
                <p className="text-[10px] text-muted-foreground lowercase">
                  no specific class — access all pdfs and notes
                </p>
              </div>
              {selectedClassId === null && (
                <Check className="w-4 h-4 text-primary" />
              )}
            </button>

            {/* Class options */}
            {classes.map((cls) => (
              <button
                key={cls.id}
                onClick={() => setSelectedClassId(cls.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-left ${
                  selectedClassId === cls.id
                    ? 'bg-primary/10 ring-1 ring-primary/30'
                    : 'hover:bg-muted/30'
                }`}
              >
                {cls.color ? (
                  <div
                    className="w-5 h-5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: cls.color }}
                  />
                ) : (
                  <GraduationCap className="w-5 h-5 text-muted-foreground" />
                )}
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground lowercase">{cls.name}</p>
                  {cls.code && (
                    <p className="text-[10px] text-muted-foreground lowercase">{cls.code}</p>
                  )}
                </div>
                {selectedClassId === cls.id && (
                  <Check className="w-4 h-4 text-primary" />
                )}
              </button>
            ))}
          </div>
        )}

        {/* Step 2: Context selection */}
        {step === 2 && (
          <div className="space-y-4 max-h-[50vh] overflow-y-auto">
            {/* PDFs */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <FileUp className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  pdfs
                </span>
                {selectedPdfIds.length > 0 && (
                  <span className="text-[10px] text-primary bg-primary/10 px-1.5 rounded-full">
                    {selectedPdfIds.length}
                  </span>
                )}
              </div>
              {filteredPdfs.length === 0 ? (
                <p className="text-xs text-muted-foreground/50 px-2 py-1 lowercase">
                  no extracted pdfs available
                </p>
              ) : (
                <div className="space-y-0.5">
                  {filteredPdfs.map((pdf) => (
                    <ContextCheckItem
                      key={pdf.id}
                      label={pdf.filename}
                      isSelected={selectedPdfIds.includes(pdf.id)}
                      onToggle={() => togglePdf(pdf.id)}
                      icon={<FileUp className="w-3.5 h-3.5" />}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <StickyNote className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  notes
                </span>
                {selectedNoteIds.length > 0 && (
                  <span className="text-[10px] text-primary bg-primary/10 px-1.5 rounded-full">
                    {selectedNoteIds.length}
                  </span>
                )}
              </div>
              {filteredNotes.length === 0 ? (
                <p className="text-xs text-muted-foreground/50 px-2 py-1 lowercase">
                  no notes available
                </p>
              ) : (
                <div className="space-y-0.5">
                  {filteredNotes.map((note) => (
                    <ContextCheckItem
                      key={note.id}
                      label={note.title}
                      isSelected={selectedNoteIds.includes(note.id)}
                      onToggle={() => toggleNote(note.id)}
                      icon={<StickyNote className="w-3.5 h-3.5" />}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between mt-4">
          <div className="text-[10px] text-muted-foreground lowercase">
            {step === 2 && totalContext > 0 && `${totalContext} items in context`}
          </div>
          <div className="flex gap-2">
            {step === 2 && (
              <Button
                variant="outline"
                onClick={handleBack}
                className="lowercase"
              >
                back
              </Button>
            )}
            {step === 1 ? (
              <Button onClick={handleNext} className="lowercase">
                next
              </Button>
            ) : (
              <Button
                onClick={handleStart}
                disabled={isPending}
                className="lowercase"
              >
                {isPending ? 'creating...' : 'start chat'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// =============================================================================
// Context Check Item
// =============================================================================

function ContextCheckItem({
  label,
  isSelected,
  onToggle,
  icon,
}: {
  label: string
  isSelected: boolean
  onToggle: () => void
  icon: React.ReactNode
}) {
  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors ${
        isSelected
          ? 'bg-primary/10 text-foreground'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/20'
      }`}
    >
      <div
        className={`w-3.5 h-3.5 rounded-sm border flex-shrink-0 flex items-center justify-center transition-colors ${
          isSelected ? 'bg-primary border-primary' : 'border-border'
        }`}
      >
        {isSelected && (
          <svg className="w-2 h-2 text-primary-foreground" viewBox="0 0 12 12" fill="none">
            <path
              d="M2 6L5 9L10 3"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
      <span className="text-muted-foreground flex-shrink-0">{icon}</span>
      <span className="truncate lowercase">{label}</span>
    </button>
  )
}
