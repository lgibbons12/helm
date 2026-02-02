/**
 * API Client for Helm Backend
 *
 * Uses fetch with credentials: 'include' to send httpOnly cookies
 * for authentication. The backend sets the JWT in a cookie.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

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
      headers: {
        'Content-Type': 'application/json',
      },
    })
    return handleResponse<T>(response)
  },

  async post<T>(path: string, data?: unknown): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: data ? JSON.stringify(data) : undefined,
    })
    return handleResponse<T>(response)
  },

  async patch<T>(path: string, data: unknown): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })
    return handleResponse<T>(response)
  },

  async delete(path: string): Promise<void> {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'DELETE',
      credentials: 'include',
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
