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

/** Compare two semesters chronologically, most recent first. */
export function compareSemestersDesc(a: string, b: string): number {
  const keyA = semesterSortKey(a)
  const keyB = semesterSortKey(b)
  if (keyA !== keyB) return keyB - keyA
  return a.localeCompare(b)
}

/** Build the semester options for a picker, most recent first. */
export function generateSemesters(yearsBack = 1, yearsForward = 1): Array<string> {
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
