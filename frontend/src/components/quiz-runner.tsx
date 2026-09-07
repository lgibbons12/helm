import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ChevronRight, Flag } from 'lucide-react'

import type {
  QuizAnswerResult,
  QuizAnswerSubmit,
  QuizSession,
  QuizSessionSummary,
} from '@/lib/api'
import { quizApi } from '@/lib/api'
import { QuizQuestionCard } from '@/components/quiz-question'
import { Button } from '@/components/ui/button'

interface QuizRunnerProps {
  session: QuizSession
  onFinished: (summary: QuizSessionSummary) => void
}

export function QuizRunner({ session, onFinished }: QuizRunnerProps) {
  const [index, setIndex] = useState(() => {
    // Resuming picks up at the first unanswered question.
    const answered = new Set(session.responses.map((r) => r.question_id))
    const next = session.questions.findIndex((q) => !answered.has(q.id))
    return next === -1 ? Math.max(session.questions.length - 1, 0) : next
  })

  const [results, setResults] = useState<Record<string, QuizAnswerResult>>(() =>
    Object.fromEntries(session.responses.map((r) => [r.question_id, r])),
  )
  const [error, setError] = useState<string | null>(null)

  // Always in range: the server refuses to create a session with no questions,
  // and index only moves between 0 and the last one.
  const question = session.questions[index]
  const result = results[question.id] ?? null
  const answeredCount = Object.keys(results).length
  const isLast = index === session.questions.length - 1

  const submitAnswer = useMutation({
    mutationFn: (answer: QuizAnswerSubmit) =>
      quizApi.submitAnswer(session.id, answer),
    onSuccess: (res) => {
      setError(null)
      setResults((prev) => ({ ...prev, [res.question_id]: res }))
    },
    onError: () => setError('could not save that answer. try again.'),
  })

  const complete = useMutation({
    mutationFn: () => quizApi.complete(session.id),
    onSuccess: onFinished,
    onError: () => setError('could not finish the session. try again.'),
  })

  const progress = useMemo(
    () => (answeredCount / session.questions.length) * 100,
    [answeredCount, session.questions.length],
  )

  return (
    <div className="space-y-6">
      {/* Progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground lowercase">
          <span>
            question {index + 1} of {session.questions.length}
          </span>
          <span>{answeredCount} answered</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-foreground transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="glass-card p-6">
        <QuizQuestionCard
          question={question}
          result={result}
          isSubmitting={submitAnswer.isPending}
          onAnswer={(answer) => submitAnswer.mutate(answer)}
          sessionId={session.id}
        />
      </div>

      {error && <p className="text-sm text-rose-600 lowercase">{error}</p>}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={() => setIndex((i) => Math.max(i - 1, 0))}
          disabled={index === 0}
          className="lowercase"
        >
          back
        </Button>

        {isLast ? (
          <Button
            onClick={() => complete.mutate()}
            disabled={complete.isPending || answeredCount === 0}
            className="gap-2 lowercase"
          >
            <Flag className="w-4 h-4" />
            {complete.isPending ? 'finishing...' : 'finish session'}
          </Button>
        ) : (
          <Button
            onClick={() => setIndex((i) => i + 1)}
            className="gap-2 lowercase"
          >
            next
            <ChevronRight className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Finishing early is allowed; unanswered questions simply don't count. */}
      {!isLast && answeredCount > 0 && (
        <div className="text-center">
          <button
            type="button"
            onClick={() => complete.mutate()}
            disabled={complete.isPending}
            className="text-xs text-muted-foreground hover:text-foreground lowercase underline underline-offset-4"
          >
            finish early with {answeredCount} answered
          </button>
        </div>
      )}
    </div>
  )
}
