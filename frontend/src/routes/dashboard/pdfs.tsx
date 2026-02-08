import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/dashboard/pdfs')({
  component: PdfsLayout,
})

function PdfsLayout() {
  return <Outlet />
}
