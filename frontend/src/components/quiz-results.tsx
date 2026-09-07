import { Brain, RotateCcw } from 'lucide-react'

import type { QuizSessionSummary } from '@/lib/api'
import { Button } from '@/components/ui/button'

interface QuizResultsProps {
  summary: QuizSessionSummary
  onStartAnother: () => void
}

export function QuizResults({ summary, onStartAnother }: QuizResultsProps) {
  const pct =
    summary.total > 0 ? Math.round((summary.correct / summary.total) * 100) : 0

  // Anything you didn't get fully right is worth seeing again.
  const shaky = summary.concepts.filter((c) => c.correct < c.total)
  const solid = summary.concepts.filter((c) => c.correct === c.total)

  return (
    <div className="space-y-6">
      <div className="glass-card p-8 text-center space-y-2">
        <p className="text-5xl font-bold text-foreground tabular-nums">
          {pct}%
        </p>
        <p className="text-sm text-muted-foreground lowercase">
          {summary.correct} correct
          {summary.partial > 0 && `, ${summary.partial} partial`}
          {summary.incorrect > 0 && `, ${summary.incorrect} missed`} out of{' '}
          {summary.total} answered
        </p>
      </div>

      {shaky.length > 0 && (
        <div className="glass-card p-6 space-y-3">
          <h3 className="text-sm font-semibold text-foreground lowercase">
            worth another look
          </h3>
          <div className="space-y-2">
            {shaky.map((c) => (
              <div
                key={c.concept}
                className="flex items-center justify-between text-sm lowercase"
              >
                <span className="text-foreground">{c.concept}</span>
                <span className="text-muted-foreground tabular-nums">
                  {c.correct}/{c.total}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {solid.length > 0 && (
        <div className="glass-card p-6 space-y-3">
          <h3 className="text-sm font-semibold text-foreground lowercase">
            solid
          </h3>
          <div className="flex flex-wrap gap-2">
            {solid.map((c) => (
              <span
                key={c.concept}
                className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground lowercase"
              >
                {c.concept}
              </span>
            ))}
          </div>
        </div>
      )}

      {summary.brain_update_queued && (
        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-4">
          <Brain className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
          <p className="text-xs text-muted-foreground lowercase">
            plato is updating what it knows about you. the next session will
            lean toward what you missed. you can read and edit that record on
            the class page.
          </p>
        </div>
      )}

      <div className="flex justify-center">
        <Button onClick={onStartAnother} className="gap-2 lowercase">
          <RotateCcw className="w-4 h-4" />
          another session
        </Button>
      </div>
    </div>
  )
}
