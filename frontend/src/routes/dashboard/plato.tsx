import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { Eye } from 'lucide-react'

import type { QuizScope, QuizSession, QuizSessionSummary } from '@/lib/api'
import { ApiError, quizApi } from '@/lib/api'
import { QuizSetup } from '@/components/quiz-setup'
import { QuizRunner } from '@/components/quiz-runner'
import { QuizResults } from '@/components/quiz-results'

export const Route = createFileRoute('/dashboard/plato')({
  component: PlatoPage,
})

type Stage =
  | { name: 'setup' }
  | { name: 'running'; session: QuizSession }
  | { name: 'results'; summary: QuizSessionSummary }

function PlatoPage() {
  const [stage, setStage] = useState<Stage>({ name: 'setup' })
  const [startError, setStartError] = useState<string | null>(null)

  const startSession = useMutation({
    mutationFn: ({ scope, count }: { scope: QuizScope; count: number }) =>
      quizApi.createSession({ ...scope, question_count: count }),
    onSuccess: (session) => {
      setStartError(null)
      setStage({ name: 'running', session })
    },
    onError: (error: unknown) => {
      // The server explains thin material and generation failures precisely;
      // surfacing its message beats a generic one.
      setStartError(
        error instanceof ApiError
          ? error.message
          : 'could not start a session. try again.',
      )
    },
  })

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-foreground text-background flex items-center justify-center flex-shrink-0">
          <Eye className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground lowercase">
            plato
          </h1>
          <p className="text-sm text-muted-foreground lowercase">
            {stage.name === 'setup'
              ? 'review what you just covered, from your own notes'
              : stage.name === 'running'
                ? 'answer honestly — the record is only useful if it is true'
                : 'how that went'}
          </p>
        </div>
      </div>

      {stage.name === 'setup' && (
        <QuizSetup
          isStarting={startSession.isPending}
          startError={startError}
          onStart={(scope, count) => startSession.mutate({ scope, count })}
        />
      )}

      {stage.name === 'running' && (
        <QuizRunner
          session={stage.session}
          onFinished={(summary) => setStage({ name: 'results', summary })}
        />
      )}

      {stage.name === 'results' && (
        <QuizResults
          summary={stage.summary}
          onStartAnother={() => {
            setStartError(null)
            setStage({ name: 'setup' })
          }}
        />
      )}
    </div>
  )
}
