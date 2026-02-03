/**
 * API Client for Helm Backend
 *
 * Uses fetch with credentials: 'include' to send httpOnly cookies
 * for authentication. Falls back to localStorage token for mobile
 * browsers that block cross-site cookies.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const TOKEN_KEY = 'helm_access_token'

// Token storage helpers (fallback for mobile browsers that block cookies)
export const tokenStorage = {
  get: (): string | null => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(TOKEN_KEY)
  },
  set: (token: string): void => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(TOKEN_KEY, token)
    }
  },
  clear: (): void => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(TOKEN_KEY)
    }
  },
}

// Build headers with optional Authorization token
function getHeaders(): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  }
  const token = tokenStorage.get()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: unknown
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorData: unknown
    try {
      errorData = await response.json()
    } catch {
      // Response body isn't JSON
    }

    const message =
      (errorData as { detail?: string })?.detail ||
      response.statusText ||
      'Request failed'

    throw new ApiError(response.status, message, errorData)
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T
  }

  return response.json()
}

export const api = {
  async get<T>(path: string): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'GET',
      credentials: 'include',
      headers: getHeaders(),
    })
    return handleResponse<T>(response)
  },

  async post<T>(path: string, data?: unknown): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: getHeaders(),
      body: data ? JSON.stringify(data) : undefined,
    })
    return handleResponse<T>(response)
  },

  async patch<T>(path: string, data: unknown): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: getHeaders(),
      body: JSON.stringify(data),
    })
    return handleResponse<T>(response)
  },

  async delete(path: string): Promise<void> {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: getHeaders(),
    })
    return handleResponse<void>(response)
  },
}

// =============================================================================
// Type definitions for API responses
// =============================================================================

export interface User {
  id: string
  email: string | null
  name: string
  created_at: string
  updated_at: string
}

export interface Class {
  id: string
  user_id: string
  name: string
  code: string | null
  semester: string
  color: string | null
  instructor: string | null
  links_json: Record<string, string>
  created_at: string
  updated_at: string
}

export interface ClassCreate {
  name: string
  code?: string | null
  semester: string
  color?: string | null
  instructor?: string | null
  links_json?: Record<string, string>
}

export interface ClassUpdate {
  name?: string
  code?: string | null
  semester?: string
  color?: string | null
  instructor?: string | null
  links_json?: Record<string, string>
}

export interface AuthResponse {
  access_token: string
  token_type: string
  expires_in: number
}

// =============================================================================
// Note Types
// =============================================================================

export interface Note {
  id: string
  user_id: string
  class_id: string | null
  assignment_id: string | null
  title: string
  content_text: string | null  // Markdown content
  tags: string[]
  created_at: string
  updated_at: string
}

export interface NoteCreate {
  title?: string
  content_text?: string | null
  tags?: string[]
  class_id?: string | null
  assignment_id?: string | null
}

export interface NoteUpdate {
  title?: string
  content_text?: string | null
  tags?: string[]
}

export interface NoteListParams {
  class_id?: string
  assignment_id?: string
  tag?: string
  q?: string
  standalone?: boolean
}

// =============================================================================
// Assignment Types
// =============================================================================

export type AssignmentStatus = 'not_started' | 'in_progress' | 'almost_done' | 'finished'
export type AssignmentType = 'pset' | 'reading' | 'project' | 'quiz' | 'other'
export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'

export interface Assignment {
  id: string
  user_id: string
  class_id: string | null
  title: string
  type: AssignmentType
  due_date: string | null
  planned_start_day: DayOfWeek | null
  estimated_minutes: number | null
  status: AssignmentStatus
  notes_short: string | null
  created_at: string
  updated_at: string
}

export interface AssignmentCreate {
  title: string
  type?: AssignmentType
  class_id?: string | null
  due_date?: string | null
  planned_start_day?: DayOfWeek | null
  estimated_minutes?: number | null
  status?: AssignmentStatus
  notes_short?: string | null
}

export interface AssignmentUpdate {
  title?: string
  type?: AssignmentType
  class_id?: string | null
  due_date?: string | null
  planned_start_day?: DayOfWeek | null
  estimated_minutes?: number | null
  status?: AssignmentStatus
  notes_short?: string | null
}

// =============================================================================
// Helper Functions
// =============================================================================

function buildQueryString(params?: Record<string, string | boolean | undefined>): string {
  if (!params) return ''
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, String(value))
    }
  }
  const queryString = searchParams.toString()
  return queryString ? `?${queryString}` : ''
}

// =============================================================================
// API Endpoints
// =============================================================================

export const authApi = {
  googleLogin: (idToken: string) =>
    api.post<AuthResponse>('/auth/google', { id_token: idToken }),

  logout: () => api.post<void>('/auth/logout'),

  getMe: () => api.get<User>('/auth/me'),
}

export const classesApi = {
  list: (semester?: string) =>
    api.get<Class[]>(`/classes${semester ? `?semester=${encodeURIComponent(semester)}` : ''}`),

  get: (id: string) => api.get<Class>(`/classes/${id}`),

  create: (data: ClassCreate) => api.post<Class>('/classes', data),

  update: (id: string, data: ClassUpdate) =>
    api.patch<Class>(`/classes/${id}`, data),

  delete: (id: string) => api.delete(`/classes/${id}`),
}

export const notesApi = {
  list: (params?: NoteListParams) =>
    api.get<Note[]>(`/notes${buildQueryString(params)}`),

  get: (id: string) => api.get<Note>(`/notes/${id}`),

  create: (data: NoteCreate) => api.post<Note>('/notes', data),

  update: (id: string, data: NoteUpdate) =>
    api.patch<Note>(`/notes/${id}`, data),

  delete: (id: string) => api.delete(`/notes/${id}`),
}

export const assignmentsApi = {
  list: (params?: { class_id?: string; status?: AssignmentStatus }) =>
    api.get<Assignment[]>(`/assignments${buildQueryString(params)}`),

  get: (id: string) => api.get<Assignment>(`/assignments/${id}`),

  create: (data: AssignmentCreate) => api.post<Assignment>('/assignments', data),

  update: (id: string, data: AssignmentUpdate) =>
    api.patch<Assignment>(`/assignments/${id}`, data),

  delete: (id: string) => api.delete(`/assignments/${id}`),
}

// =============================================================================
// Transaction Types
// =============================================================================

export interface Transaction {
  id: string
  user_id: string
  date: string
  amount_signed: number
  merchant?: string
  category?: string
  note?: string
  is_income: boolean
  is_weekly: boolean
  income_source?: string
  created_at: string
}

export interface TransactionCreate {
  date: string
  amount_signed: number
  merchant?: string
  category?: string
  note?: string
  is_income: boolean
  is_weekly?: boolean
  income_source?: string
}

export interface TransactionSummary {
  total_income: number
  total_expenses: number
  net: number
}

export interface TransactionBreakdown {
  weekly: number
  large: number
  total: number
  weekly_pct: number
  large_pct: number
}

export interface TransactionTrendPoint {
  date: string
  expenses: number
  income: number
}

export interface WeeklyAverage {
  weekly_average: number
  weeks_tracked: number
  total_expenses: number
}

export const transactionsApi = {
  list: (params?: {
    date_from?: string
    date_to?: string
    category?: string
    is_income?: boolean
  }) => api.get<Transaction[]>(`/transactions${buildQueryString(params)}`),

  create: (data: TransactionCreate) =>
    api.post<Transaction>('/transactions', data),

  get: (id: string) => api.get<Transaction>(`/transactions/${id}`),

  delete: (id: string) => api.delete(`/transactions/${id}`),

  getSummary: (params?: { date_from?: string; date_to?: string }) =>
    api.get<TransactionSummary>(`/transactions/summary${buildQueryString(params)}`),

  getBreakdown: () =>
    api.get<TransactionBreakdown>('/transactions/stats/breakdown'),

  getTrend: (days?: number) =>
    api.get<TransactionTrendPoint[]>(`/transactions/stats/trend${days ? `?days=${days}` : ''}`),

  getWeeklyAverage: () =>
    api.get<WeeklyAverage>('/transactions/stats/weekly-average'),
}
