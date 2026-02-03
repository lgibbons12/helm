/**
 * Authentication Context and Hooks
 *
 * Provides:
 * - AuthProvider: Wraps app with auth state
 * - useAuth(): Returns user, login, logout functions
 * - useUser(): TanStack Query hook for current user
 */

import {
  createContext,
  useContext,
  useCallback,
  type ReactNode,
} from 'react'
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { authApi, type User, ApiError, tokenStorage } from './api'

// =============================================================================
// Types
// =============================================================================

interface AuthContextValue {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  logout: () => Promise<void>
  error: Error | null
}

// =============================================================================
// Context
// =============================================================================

const AuthContext = createContext<AuthContextValue | null>(null)

// =============================================================================
// Query Keys
// =============================================================================

export const authKeys = {
  user: ['auth', 'user'] as const,
}

// =============================================================================
// Provider
// =============================================================================

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  // Fetch current user on mount
  const {
    data: user,
    isLoading,
    error,
  } = useQuery({
    queryKey: authKeys.user,
    queryFn: async () => {
      try {
        return await authApi.getMe()
      } catch (err) {
        // 401 means not authenticated - not an error state
        if (err instanceof ApiError && err.status === 401) {
          return null
        }
        throw err
      }
    },
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  // Logout mutation
  const logoutMutation = useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      tokenStorage.clear()
      queryClient.setQueryData(authKeys.user, null)
      queryClient.clear()
      navigate({ to: '/' })
    },
  })

  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync()
  }, [logoutMutation])

  const value: AuthContextValue = {
    user: user ?? null,
    isLoading,
    isAuthenticated: !!user,
    logout,
    error: error as Error | null,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// =============================================================================
// Hooks
// =============================================================================

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

/**
 * Hook to handle Google credential response (from GoogleLogin component)
 */
export function useGoogleCredentialLogin() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: async (credential: string) => {
      return authApi.googleLogin(credential)
    },
    onSuccess: async (data) => {
      // Store token in localStorage as fallback for mobile browsers
      // that block cross-site cookies
      if (data.access_token) {
        tokenStorage.set(data.access_token)
      }
      await queryClient.invalidateQueries({ queryKey: authKeys.user })
      navigate({ to: '/dashboard/classes' })
    },
    onError: (error) => {
      console.error('Login failed:', error)
    },
  })
}

/**
 * Direct hook to query current user
 */
export function useUser() {
  return useQuery({
    queryKey: authKeys.user,
    queryFn: async () => {
      try {
        return await authApi.getMe()
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          return null
        }
        throw err
      }
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  })
}
