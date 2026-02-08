import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/dashboard/notes')({
  component: NotesLayout,
})

function NotesLayout() {
  return <Outlet />
}
