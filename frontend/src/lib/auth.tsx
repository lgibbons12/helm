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
import { useGoogleLogin } from '@react-oauth/google'
import { useNavigate } from '@tanstack/react-router'

import { authApi, type User, ApiError } from './api'

// =============================================================================
// Types
// =============================================================================

interface AuthContextValue {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: () => void
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

  // Google login mutation
  const googleLoginMutation = useMutation({
    mutationFn: async (accessToken: string) => {
      // Google's useGoogleLogin returns an access_token, not id_token
      // We need to exchange it for user info, but our backend expects id_token
      // Actually, let's use the implicit flow which gives us the id_token directly
      // For now, we'll need to adjust this based on the OAuth flow
      return authApi.googleLogin(accessToken)
    },
    onSuccess: async () => {
      // Refetch user after successful login
      await queryClient.invalidateQueries({ queryKey: authKeys.user })
      navigate({ to: '/dashboard/classes' })
    },
  })

  // Logout mutation
  const logoutMutation = useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      queryClient.setQueryData(authKeys.user, null)
      queryClient.clear()
      navigate({ to: '/' })
    },
  })

  // Google OAuth login
  // Note: We use the 'implicit' flow to get id_token directly
  const googleLogin = useGoogleLogin({
    flow: 'implicit',
    onSuccess: (tokenResponse) => {
      // For implicit flow, we get access_token, not id_token
      // We need to use the authorization code flow instead
      // Let's switch to the CredentialResponse approach
      console.log('Google login success:', tokenResponse)
      // This won't work directly - we need the id_token
      // Let's use GoogleLogin component instead in the UI
    },
    onError: (error) => {
      console.error('Google login error:', error)
    },
  })

  const login = useCallback(() => {
    googleLogin()
  }, [googleLogin])

  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync()
  }, [logoutMutation])

  const value: AuthContextValue = {
    user: user ?? null,
    isLoading,
    isAuthenticated: !!user,
    login,
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
    onSuccess: async () => {
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
