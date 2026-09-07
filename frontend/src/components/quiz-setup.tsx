import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AlertTriangle, FileText, Sparkles } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

import { useNavigate } from '@tanstack/react-router'
import type { Class, QuizScope } from '@/lib/api'

import { ApiError, classesApi, quizApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Ranges are expressed in notes or days rather than "classes", because note
 * updated_at is the only recency signal the app actually has.
 */
const RANGES = [
  { label: 'last 3 notes', note_limit: 3 },
  { label: 'last 5 notes', note_limit: 5 },
  { label: 'last 10 notes', note_limit: 10 },
  { label: 'past 2 weeks', since_days: 14 },
  { label: 'past month', since_days: 30 },
  { label: 'everything', note_limit: 50 },
] as const

const LENGTHS = [5, 10, 15, 20] as const

interface QuizSetupProps {
  onStart: (scope: QuizScope, questionCount: number) => void
  isStarting: boolean
  startError: string | null
}

export function QuizSetup({ onStart, isStarting, startError }: QuizSetupProps) {
  const [classId, setClassId] = useState<string | null>(null)
  const [rangeIndex, setRangeIndex] = useState(1)
  const [questionCount, setQuestionCount] = useState(10)
  const [includeStandalone, setIncludeStandalone] = useState(false)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [guideError, setGuideError] = useState<string | null>(null)
  const navigate = useNavigate()

  const { data: classes = [] } = useQuery({
    queryKey: ['classes'],
    queryFn: () => classesApi.list(),
  })

  const range = RANGES[rangeIndex]

  const scope: QuizScope = useMemo(
    () => ({
      class_ids: classId ? [classId] : [],
      note_limit: 'note_limit' in range ? range.note_limit : null,
      since_days: 'since_days' in range ? range.since_days : null,
      include_standalone: includeStandalone,
    }),
    [classId, range, includeStandalone],
  )

  const { data: preview, isFetching } = useQuery({
    queryKey: ['quiz', 'sources', scope],
    queryFn: () => quizApi.previewSources(scope),
  })

  const included = (preview?.notes ?? []).filter((n) => !excluded.has(n.id))
  const includedChars = included.reduce((sum, n) => sum + n.char_count, 0)
  // Mirrors the server's own floor, so the button state matches what it will do.
  const canStart = included.length > 0 && includedChars >= 500

  const toggleNote = (id: string) => {
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Send an explicit selection only when something was actually deselected.
  const finalScope = (): QuizScope =>
    excluded.size > 0
      ? { ...scope, note_ids: included.map((n) => n.id) }
      : scope

  const start = () => onStart(finalScope(), questionCount)

  const guide = useMutation({
    mutationFn: () => quizApi.createStudyGuide(finalScope()),
    onSuccess: (note) => {
      setGuideError(null)
      // The guide is a real note, so it lives in the tree like any other.
      navigate({ to: '/dashboard/notes/$noteId', params: { noteId: note.id } })
    },
    onError: (error: unknown) =>
      setGuideError(
        error instanceof ApiError
          ? error.message
          : 'could not write the guide. try again.',
      ),
  })

  return (
    <div className="space-y-6">
      {/* Class */}
      <div className="glass-card p-6 space-y-4">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-foreground lowercase">
            class
          </h2>
          <p className="text-xs text-muted-foreground lowercase">
            leave this on everything for a mixed review across all your classes
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterChip
            label="everything"
            active={classId === null}
            onClick={() => setClassId(null)}
          />
          {classes.map((cls: Class) => (
            <FilterChip
              key={cls.id}
              label={cls.code || cls.name}
              active={classId === cls.id}
              onClick={() => setClassId(cls.id)}
            />
          ))}
        </div>
      </div>

      {/* Range */}
      <div className="glass-card p-6 space-y-4">
        <h2 className="text-sm font-semibold text-foreground lowercase">
          how far back
        </h2>
        <div className="flex flex-wrap gap-2">
          {RANGES.map((r, i) => (
            <FilterChip
              key={r.label}
              label={r.label}
              active={i === rangeIndex}
              onClick={() => {
                setRangeIndex(i)
                setExcluded(new Set())
              }}
            />
          ))}
        </div>
      </div>

      {/* Length */}
      <div className="glass-card p-6 space-y-4">
        <h2 className="text-sm font-semibold text-foreground lowercase">
          how many questions
        </h2>
        <div className="flex flex-wrap gap-2">
          {LENGTHS.map((n) => (
            <FilterChip
              key={n}
              label={String(n)}
              active={n === questionCount}
              onClick={() => setQuestionCount(n)}
            />
          ))}
        </div>
      </div>

      {/* Sources */}
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground lowercase">
            what plato will read
          </h2>
          {preview && (
            <span className="text-xs text-muted-foreground lowercase tabular-nums">
              {included.length} notes
              {preview.pdf_count > 0 && ` · ${preview.pdf_count} pdfs`}
            </span>
          )}
        </div>

        {isFetching && !preview ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : preview && preview.notes.length > 0 ? (
          <>
            <p className="text-xs text-muted-foreground lowercase">
              recency comes from when you last edited a note, so tidying up an
              old one can pull it in. uncheck anything that doesn&apos;t belong.
            </p>
            <label className="flex items-center gap-2 text-xs text-muted-foreground lowercase cursor-pointer">
              <input
                type="checkbox"
                checked={includeStandalone}
                onChange={(e) => {
                  setIncludeStandalone(e.target.checked)
                  setExcluded(new Set())
                }}
                className="rounded border-border"
              />
              include notes with no class (to-do lists and scratch live here)
            </label>
            <div className="space-y-1">
              {preview.notes.map((note) => {
                const isIn = !excluded.has(note.id)
                return (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => toggleNote(note.id)}
                    className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                      isIn
                        ? 'border-border hover:bg-muted/40'
                        : 'border-dashed border-border opacity-45'
                    }`}
                  >
                    <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground lowercase truncate">
                        {note.title}
                      </p>
                      <p className="text-xs text-muted-foreground lowercase">
                        {note.class_name ?? 'no class'} · edited{' '}
                        {formatDistanceToNow(new Date(note.updated_at), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs tabular-nums">
                      {note.char_count}
                    </Badge>
                  </button>
                )
              })}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground lowercase">
            {preview?.message ?? 'nothing in this range yet.'}
          </p>
        )}

        {preview && preview.notes.length > 0 && !canStart && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <AlertTriangle className="w-4 h-4 text-amber-700 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-800 lowercase">
              not enough here to write questions worth answering. widen the
              range or include more notes.
            </p>
          </div>
        )}
      </div>

      {startError && (
        <p className="text-sm text-rose-600 lowercase">{startError}</p>
      )}

      <Button
        onClick={start}
        disabled={!canStart || isStarting || guide.isPending}
        size="lg"
        className="w-full gap-2 lowercase"
      >
        <Sparkles className="w-4 h-4" />
        {isStarting ? 'writing your questions...' : 'start session'}
      </Button>

      {/* Same scope, different output: read it instead of being tested on it. */}
      <div className="text-center space-y-2">
        <button
          type="button"
          onClick={() => guide.mutate()}
          disabled={!canStart || isStarting || guide.isPending}
          className="text-xs text-muted-foreground hover:text-foreground lowercase underline underline-offset-4 disabled:opacity-40 disabled:no-underline"
        >
          {guide.isPending
            ? 'writing your study guide...'
            : 'or write a study guide from the same notes'}
        </button>
        {guideError && (
          <p className="text-xs text-rose-600 lowercase">{guideError}</p>
        )}
      </div>

      {(isStarting || guide.isPending) && (
        <p className="text-center text-xs text-muted-foreground lowercase">
          written fresh from your notes, so this takes a few seconds
        </p>
      )}
    </div>
  )
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs lowercase transition-colors ${
        active
          ? 'border-foreground bg-foreground text-background'
          : 'border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground'
      }`}
    >
      {label}
    </button>
  )
}
