import { useState, useEffect } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google'
import { Compass } from 'lucide-react'

import { useAuth, useGoogleCredentialLogin } from '../lib/auth'

// Google Client ID from environment
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

export const Route = createFileRoute('/')({
  component: LandingPage,
})

function LandingPage() {
  const { isAuthenticated, isLoading } = useAuth()
  const navigate = useNavigate()
  const googleLogin = useGoogleCredentialLogin()
  const [mounted, setMounted] = useState(false)

  // Only render Google login on client
  useEffect(() => {
    setMounted(true)
  }, [])

  // Redirect to dashboard if already authenticated
  if (isAuthenticated && !isLoading) {
    navigate({ to: '/dashboard/classes' })
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-subtle flex items-center justify-center p-4">
      <div className="glass-card p-8 sm:p-12 w-full max-w-sm text-center space-y-8">
        {/* Logo */}
        <div className="space-y-4">
          <div className="w-14 h-14 rounded-xl bg-primary flex items-center justify-center mx-auto">
            <Compass className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">
            helm
          </h1>
        </div>

        {/* Tagline */}
        <p className="text-muted-foreground text-sm leading-relaxed">
          plan your classes. track your time. stay on budget.
        </p>

        {/* Login */}
        <div className="space-y-4">
          {isLoading || !mounted ? (
            <div className="text-sm text-muted-foreground">loading...</div>
          ) : (
            <div className="flex justify-center">
              <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
                <GoogleLogin
                  onSuccess={(credentialResponse) => {
                    if (credentialResponse.credential) {
                      googleLogin.mutate(credentialResponse.credential)
                    }
                  }}
                  onError={() => {
                    console.error('login failed')
                  }}
                  theme="outline"
                  size="large"
                  width="280"
                  text="continue_with"
                  shape="rectangular"
                />
              </GoogleOAuthProvider>
            </div>
          )}

          {googleLogin.isPending && (
            <p className="text-sm text-muted-foreground">signing in...</p>
          )}

          {googleLogin.isError && (
            <p className="text-sm text-destructive">login failed. try again.</p>
          )}
        </div>
      </div>
    </div>
  )
}
