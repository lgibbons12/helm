import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'

// Redirect old /dashboard/chat to /dashboard/odin
export const Route = createFileRoute('/dashboard/chat')({
  component: ChatRedirect,
})

function ChatRedirect() {
  const navigate = useNavigate()
  useEffect(() => {
    navigate({ to: '/dashboard/odin', replace: true })
  }, [navigate])
  return null
}
