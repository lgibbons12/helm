import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/dashboard/assignments')({
  component: AssignmentsLayout,
})

function AssignmentsLayout() {
  return <Outlet />
}
