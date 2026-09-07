import { useState } from 'react'
import { Check, Eye, Minus, X } from 'lucide-react'

import type {
  QuizAnswerResult,
  QuizAnswerSubmit,
  QuizQuestion,
  QuizVerdict,
} from '@/lib/api'
import { quizApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

// =============================================================================
// Shared bits
// =============================================================================

const VERDICT_STYLES: Record<QuizVerdict, string> = {
  correct: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  partial: 'text-amber-700 bg-amber-50 border-amber-200',
  incorrect: 'text-rose-700 bg-rose-50 border-rose-200',
}

const VERDICT_ICONS: Record<QuizVerdict, typeof Check> = {
  correct: Check,
  partial: Minus,
  incorrect: X,
}

const FORMAT_LABELS: Record<QuizQuestion['format'], string> = {
  multiple_choice: 'multiple choice',
  free_recall: 'recall',
  flashcard: 'flashcard',
}

interface QuestionProps {
  question: QuizQuestion
  result: QuizAnswerResult | null
  isSubmitting: boolean
  onAnswer: (answer: QuizAnswerSubmit) => void
  sessionId: string
}

/** Verdict banner plus the model answer, shown once a question is answered. */
function Feedback({ result }: { result: QuizAnswerResult }) {
  const Icon = VERDICT_ICONS[result.verdict]
  return (
    <div
      className={`rounded-lg border p-4 space-y-2 ${VERDICT_STYLES[result.verdict]}`}
    >
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4" />
        <span className="text-sm font-semibold lowercase">
          {result.verdict}
          {result.self_graded && ' (your call)'}
        </span>
      </div>
      <p className="text-sm lowercase opacity-90">{result.explanation}</p>
    </div>
  )
}

// =============================================================================
// Multiple choice
// =============================================================================

function MultipleChoice({
  question,
  result,
  isSubmitting,
  onAnswer,
}: QuestionProps) {
  const [picked, setPicked] = useState<number | null>(null)
  const answered = result !== null

  return (
    <div className="space-y-3">
      {question.choices?.map((choice, index) => {
        const isCorrect = answered && index === result.correct_choice_index
        const isPickedWrong = answered && index === picked && !isCorrect

        let tone = 'border-border hover:border-foreground/30 hover:bg-muted/40'
        if (isCorrect) tone = 'border-emerald-300 bg-emerald-50'
        else if (isPickedWrong) tone = 'border-rose-300 bg-rose-50'
        else if (answered) tone = 'border-border opacity-50'

        return (
          <button
            key={index}
            type="button"
            disabled={answered || isSubmitting}
            onClick={() => {
              setPicked(index)
              onAnswer({ question_id: question.id, choice_index: index })
            }}
            className={`w-full text-left rounded-lg border p-3 text-sm lowercase transition-colors disabled:cursor-default ${tone}`}
          >
            <span className="text-muted-foreground mr-2">
              {String.fromCharCode(97 + index)}.
            </span>
            {choice}
          </button>
        )
      })}
      {result && <Feedback result={result} />}
    </div>
  )
}

// =============================================================================
// Free recall
// =============================================================================

function FreeRecall({
  question,
  result,
  isSubmitting,
  onAnswer,
}: QuestionProps) {
  const [text, setText] = useState('')
  const answered = result !== null

  return (
    <div className="space-y-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={answered || isSubmitting}
        rows={5}
        placeholder="write what you remember..."
        className="w-full rounded-lg border border-border bg-background p-3 text-sm lowercase resize-y focus:outline-none focus:ring-2 focus:ring-foreground/20 disabled:opacity-60"
      />

      {!answered && (
        <Button
          onClick={() => onAnswer({ question_id: question.id, text })}
          disabled={!text.trim() || isSubmitting}
          className="lowercase"
        >
          {isSubmitting ? 'grading...' : 'submit answer'}
        </Button>
      )}

      {result && (
        <>
          <Feedback result={result} />
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-1">
            <p className="text-xs text-muted-foreground lowercase">
              expected answer
            </p>
            <p className="text-sm lowercase">{result.model_answer}</p>
          </div>
          {!result.self_graded && (
            // You know whether you knew it. The override is what reaches the brain.
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground lowercase">
                disagree?
              </span>
              {(['correct', 'partial', 'incorrect'] as const)
                .filter((v) => v !== result.verdict)
                .map((verdict) => (
                  <Button
                    key={verdict}
                    variant="outline"
                    size="sm"
                    className="lowercase"
                    disabled={isSubmitting}
                    onClick={() =>
                      onAnswer({
                        question_id: question.id,
                        self_grade: verdict,
                      })
                    }
                  >
                    mark {verdict}
                  </Button>
                ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// =============================================================================
// Flashcard
// =============================================================================

function Flashcard({
  question,
  result,
  isSubmitting,
  onAnswer,
  sessionId,
}: QuestionProps) {
  const [back, setBack] = useState<string | null>(null)
  const [revealing, setRevealing] = useState(false)
  const answered = result !== null

  // Answers live server-side, so the back of the card has to be fetched.
  const reveal = async () => {
    setRevealing(true)
    try {
      const revealed = await quizApi.reveal(sessionId, question.id)
      setBack(revealed.model_answer)
    } finally {
      setRevealing(false)
    }
  }

  const shown = back ?? result?.model_answer ?? null

  return (
    <div className="space-y-3">
      {shown === null ? (
        <Button
          variant="outline"
          onClick={reveal}
          disabled={revealing}
          className="gap-2 lowercase"
        >
          <Eye className="w-4 h-4" />
          {revealing ? 'revealing...' : 'reveal answer'}
        </Button>
      ) : (
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <p className="text-sm lowercase">{shown}</p>
        </div>
      )}

      {shown !== null && !answered && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground lowercase">
            did you know it?
          </span>
          {(['correct', 'partial', 'incorrect'] as const).map((verdict) => (
            <Button
              key={verdict}
              variant="outline"
              size="sm"
              className="lowercase"
              disabled={isSubmitting}
              onClick={() =>
                onAnswer({ question_id: question.id, self_grade: verdict })
              }
            >
              {verdict === 'correct'
                ? 'yes'
                : verdict === 'partial'
                  ? 'partly'
                  : 'no'}
            </Button>
          ))}
        </div>
      )}

      {result && <Feedback result={result} />}
    </div>
  )
}

// =============================================================================
// Card wrapper
// =============================================================================

export function QuizQuestionCard(props: QuestionProps) {
  const { question } = props

  const Renderer =
    question.format === 'multiple_choice'
      ? MultipleChoice
      : question.format === 'free_recall'
        ? FreeRecall
        : Flashcard

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="lowercase text-xs">
          {FORMAT_LABELS[question.format]}
        </Badge>
        <Badge variant="outline" className="lowercase text-xs">
          {question.concept}
        </Badge>
      </div>

      <h2 className="text-lg font-semibold text-foreground lowercase leading-snug">
        {question.prompt}
      </h2>

      <Renderer key={question.id} {...props} />
    </div>
  )
}
