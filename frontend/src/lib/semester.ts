/** Seasons within a calendar year, earliest first. */
const SEASON_ORDER = ['winter', 'spring', 'summer', 'fall'] as const

const SEMESTER_PATTERN = /^\s*(winter|spring|summer|fall)\s+(\d{4})\s*$/i

/**
 * Chronological sort key for a "<season> <year>" semester string.
 * Returns -1 for values that don't match the expected shape so they sort last.
 */
export function semesterSortKey(semester: string): number {
  const match = SEMESTER_PATTERN.exec(semester)
  if (!match) return -1
  const season = match[1].toLowerCase() as (typeof SEASON_ORDER)[number]
  return Number(match[2]) * 10 + SEASON_ORDER.indexOf(season)
}

/**
 * The semester that `date` falls in: winter (jan-feb), spring (mar-may),
 * summer (jun-aug), fall (sep-dec).
 */
export function currentSemester(date: Date = new Date()): string {
  const month = date.getMonth()
  const season =
    month <= 1
      ? 'winter'
      : month <= 4
        ? 'spring'
        : month <= 7
          ? 'summer'
          : 'fall'
  return `${season} ${date.getFullYear()}`
}

/** True when `semester` finished before the one we are currently in. */
export function isPastSemester(
  semester: string,
  date: Date = new Date(),
): boolean {
  const key = semesterSortKey(semester)
  // Unrecognized values stay visible rather than getting hidden by default
  if (key < 0) return false
  return key < semesterSortKey(currentSemester(date))
}

/** Compare two semesters chronologically, most recent first. */
export function compareSemestersDesc(a: string, b: string): number {
  const keyA = semesterSortKey(a)
  const keyB = semesterSortKey(b)
  if (keyA !== keyB) return keyB - keyA
  return a.localeCompare(b)
}

/** Build the semester options for a picker, most recent first. */
export function generateSemesters(
  yearsBack = 1,
  yearsForward = 1,
): Array<string> {
  const currentYear = new Date().getFullYear()
  const semesters: Array<string> = []

  for (
    let year = currentYear + yearsForward;
    year >= currentYear - yearsBack;
    year--
  ) {
    for (let i = SEASON_ORDER.length - 1; i >= 0; i--) {
      semesters.push(`${SEASON_ORDER[i]} ${year}`)
    }
  }

  return semesters
}

/** A set of items sharing one semester. */
export interface SemesterGroup<T> {
  semester: string
  items: Array<T>
}

/**
 * Bucket items by semester, ordered most recent first.
 * Order within each bucket is preserved from the input.
 */
export function groupBySemester<T>(
  items: Array<T>,
  getSemester: (item: T) => string,
): Array<SemesterGroup<T>> {
  const groups = new Map<string, Array<T>>()

  for (const item of items) {
    const semester = getSemester(item)
    const existing = groups.get(semester)
    if (existing) {
      existing.push(item)
    } else {
      groups.set(semester, [item])
    }
  }

  return Array.from(groups.keys())
    .sort(compareSemestersDesc)
    .map((semester) => ({ semester, items: groups.get(semester) ?? [] }))
}
