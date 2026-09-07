import { ChevronDown, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'

interface SemesterSectionProps {
  semester: string
  /** Shown beside the heading; omitted or zero renders no badge. */
  count?: number
  isExpanded: boolean
  onToggle: () => void
  children: ReactNode
}

/** A collapsible heading grouping everything that belongs to one semester. */
export function SemesterSection({
  semester,
  count,
  isExpanded,
  onToggle,
  children,
}: SemesterSectionProps) {
  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        className="flex w-full items-center gap-2 text-left rounded-lg hover:bg-muted/30 transition-colors py-1 px-1 -mx-1"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        )}
        <h2 className="text-lg font-semibold text-foreground lowercase">
          {semester}
        </h2>
        {count !== undefined && count > 0 && (
          <Badge variant="secondary" className="text-xs">
            {count}
          </Badge>
        )}
      </button>
      {isExpanded && children}
    </div>
  )
}
