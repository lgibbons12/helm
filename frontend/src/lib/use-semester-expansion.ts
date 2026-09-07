import { useCallback, useEffect, useState } from 'react'

import { isPastSemester } from '@/lib/semester'

/** Semester name -> whether the user explicitly expanded it. */
type Overrides = Record<string, boolean>

function readOverrides(storageKey: string): Overrides {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return {}
    }
    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => typeof value === 'boolean'),
    ) as Overrides
  } catch {
    return {}
  }
}

function writeOverrides(storageKey: string, overrides: Overrides): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(overrides))
  } catch {
    // storage blocked or full: expanding still works for this session
  }
}

/**
 * Tracks which semesters are expanded, persisted under `storageKey`.
 *
 * Past semesters start collapsed and the current one starts open, so finished
 * terms stay out of the way without hiding what you are working on now. Only
 * explicit toggles are stored, as overrides on that default, so a semester
 * keeps whatever state you set and a new term opens itself once it arrives.
 * The stored value is read after mount to keep the server-rendered markup and
 * the first client render identical.
 */
export function useSemesterExpansion(storageKey: string) {
  const [overrides, setOverrides] = useState<Overrides>({})

  useEffect(() => {
    setOverrides(readOverrides(storageKey))
  }, [storageKey])

  const isSemesterExpanded = useCallback(
    (semester: string) => overrides[semester] ?? !isPastSemester(semester),
    [overrides],
  )

  const toggleSemester = useCallback(
    (semester: string) => {
      const next = {
        ...overrides,
        [semester]: !(overrides[semester] ?? !isPastSemester(semester)),
      }
      setOverrides(next)
      writeOverrides(storageKey, next)
    },
    [overrides, storageKey],
  )

  return { isSemesterExpanded, toggleSemester }
}
