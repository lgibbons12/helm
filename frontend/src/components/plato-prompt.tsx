import { useEffect, useState } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Eye } from 'lucide-react'

import { quizApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const STORAGE_KEY = 'helm_plato_prompt_snooze_until'

/** How long "not now" buys you, and how long a review counts for. */
const SNOOZE_DAYS = 3

/**
 * How long to wait before re-checking when there was nothing to review.
 * Shorter than a snooze, because new notes appear often -- but not zero, or a
 * user with no material re-queries on every single page load.
 */
const EMPTY_RECHECK_DAYS = 1

function readSnoozeUntil(): number {
  if (typeof window === 'undefined') return 0
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return 0
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : 0
  } catch {
    return 0
  }
}

function writeSnooze(days: number): void {
  if (typeof window === 'undefined') return
  try {
    const until = Date.now() + days * 24 * 60 * 60 * 1000
    window.localStorage.setItem(STORAGE_KEY, String(until))
  } catch {
    // storage blocked: the prompt just reappears next load, which is survivable
  }
}

/**
 * Occasional nudge toward plato when you open helm.
 *
 * Two gates, because a prompt on a timer alone gets dismissed reflexively:
 * enough days have passed, *and* there is actually enough recent material to
 * quiz from. The source check only runs once the timer says it is due, so most
 * loads cost nothing.
 *
 * The snooze is read after mount so the server-rendered markup and the first
 * client render match, matching the idiom in use-semester-expansion.
 */
export function PlatoPrompt() {
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  const [isDue, setIsDue] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    setIsDue(Date.now() >= readSnoozeUntil())
  }, [])

  // Never nag someone who is already on the page you would send them to.
  const onPlato = pathname.startsWith('/dashboard/plato')

  const { data: preview } = useQuery({
    queryKey: ['quiz', 'sources', 'prompt'],
    queryFn: () => quizApi.previewSources({}),
    enabled: isDue && !onPlato && !dismissed,
    staleTime: 5 * 60 * 1000,
  })

  // Nothing worth reviewing: back off rather than re-checking every page load.
  useEffect(() => {
    if (preview && !preview.sufficient) {
      writeSnooze(EMPTY_RECHECK_DAYS)
      setDismissed(true)
    }
  }, [preview])

  const open = isDue && !onPlato && !dismissed && preview?.sufficient === true

  const close = (days: number) => {
    writeSnooze(days)
    setDismissed(true)
  }

  const noteCount = preview?.notes.length ?? 0

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close(SNOOZE_DAYS)}>
      <DialogContent className="glass-strong border-0 sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-full bg-foreground text-background flex items-center justify-center flex-shrink-0">
              <Eye className="w-4 h-4" />
            </div>
            <DialogTitle className="lowercase">review with plato?</DialogTitle>
          </div>
          <DialogDescription className="lowercase">
            {noteCount > 0
              ? `you have ${noteCount} recent ${noteCount === 1 ? 'note' : 'notes'} worth going back over. a short session takes a few minutes.`
              : 'a short session over your recent notes takes a few minutes.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-end gap-2 mt-4">
          <Button
            variant="ghost"
            onClick={() => close(SNOOZE_DAYS)}
            className="lowercase"
          >
            not now
          </Button>
          <Button
            onClick={() => {
              close(SNOOZE_DAYS)
              navigate({ to: '/dashboard/plato' })
            }}
            className="gap-2 lowercase"
          >
            <Eye className="w-4 h-4" />
            review now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
