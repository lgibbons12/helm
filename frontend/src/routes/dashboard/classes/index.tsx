import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Plus, ExternalLink, User, BookOpen, FileText } from 'lucide-react'

import { classesApi, type Class } from '../../../lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { AddClassDialog } from '@/components/add-class-dialog'

export const Route = createFileRoute('/dashboard/classes/')({
  component: ClassesPage,
})

// Query key for classes
const classesQueryKey = ['classes'] as const

function ClassesPage() {
  const [dialogOpen, setDialogOpen] = useState(false)

  const {
    data: classes,
    isLoading,
    error,
  } = useQuery({
    queryKey: classesQueryKey,
    queryFn: () => classesApi.list(),
  })

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">classes</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            manage your courses and track your academic progress
          </p>
        </div>
        <Button className="gap-2" onClick={() => setDialogOpen(true)}>
          <Plus className="w-4 h-4" />
          add class
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <ClassesLoading />
      ) : error ? (
        <ClassesError error={error as Error} />
      ) : classes && classes.length > 0 ? (
        <ClassesGrid classes={classes} />
      ) : (
        <ClassesEmpty onAddClass={() => setDialogOpen(true)} />
      )}

      {/* Add Class Dialog */}
      <AddClassDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  )
}

function ClassesGrid({ classes }: { classes: Class[] }) {
  // Group classes by semester
  const bySemester = classes.reduce(
    (acc, cls) => {
      if (!acc[cls.semester]) {
        acc[cls.semester] = []
      }
      acc[cls.semester].push(cls)
      return acc
    },
    {} as Record<string, Class[]>
  )

  // Sort semesters (most recent first)
  const semesters = Object.keys(bySemester).sort((a, b) => b.localeCompare(a))

  return (
    <div className="space-y-8">
      {semesters.map((semester) => (
        <div key={semester} className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground lowercase">{semester}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {bySemester[semester].map((cls) => (
              <ClassCard key={cls.id} classData={cls} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function ClassCard({ classData }: { classData: Class }) {
  const hasLinks = Object.keys(classData.links_json || {}).length > 0

  return (
    <Link
      to="/dashboard/classes/$classId"
      params={{ classId: classData.id }}
      className="block"
    >
      <div className="glass-card p-5 space-y-4 relative overflow-hidden cursor-pointer">
        {/* Color indicator */}
        {classData.color && (
          <div
            className="absolute top-0 left-0 w-1 h-full"
            style={{ backgroundColor: classData.color }}
          />
        )}

        <div className="space-y-2">
          {/* Code badge */}
          {classData.code && (
            <Badge variant="secondary" className="text-xs lowercase">
              {classData.code}
            </Badge>
          )}

          {/* Name */}
          <h3 className="text-lg font-semibold text-foreground leading-tight lowercase">
            {classData.name}
          </h3>

          {/* Instructor */}
          {classData.instructor && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="w-4 h-4" />
              <span className="lowercase">{classData.instructor}</span>
            </div>
          )}
        </div>

        {/* Links */}
        {hasLinks && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(classData.links_json).map(([key, url]) => (
              <span
                key={key}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  window.open(url, '_blank')
                }}
                className="inline-flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors cursor-pointer"
              >
                <ExternalLink className="w-3 h-3" />
                {formatLinkLabel(key)}
              </span>
            ))}
          </div>
        )}

        {/* Notes indicator */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <FileText className="w-3 h-3" />
          <span>notes</span>
        </div>
      </div>
    </Link>
  )
}

function formatLinkLabel(key: string): string {
  // Convert snake_case or camelCase to readable text (lowercase)
  return key
    .replace(/_url$/i, '')
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .trim()
    .toLowerCase()
}

function ClassesLoading() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="glass-card p-5 space-y-4">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  )
}

function ClassesEmpty({ onAddClass }: { onAddClass: () => void }) {
  return (
    <div className="glass-card p-12 text-center">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
        <BookOpen className="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">no classes yet</h3>
      <p className="text-muted-foreground mb-6 max-w-sm mx-auto text-sm">
        add your first class to get started tracking your courses, assignments, and schedule.
      </p>
      <Button className="gap-2" onClick={onAddClass}>
        <Plus className="w-4 h-4" />
        add your first class
      </Button>
    </div>
  )
}

function ClassesError({ error }: { error: Error }) {
  return (
    <div className="glass-card p-12 text-center border-destructive/20">
      <h3 className="text-lg font-semibold text-destructive mb-2">
        failed to load classes
      </h3>
      <p className="text-muted-foreground mb-4 text-sm">{error.message}</p>
      <Button variant="outline" onClick={() => window.location.reload()}>
        try again
      </Button>
    </div>
  )
}
