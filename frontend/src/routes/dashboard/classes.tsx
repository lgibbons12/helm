import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/dashboard/classes')({
  component: ClassesLayout,
})

function ClassesLayout() {
  return <Outlet />
}
