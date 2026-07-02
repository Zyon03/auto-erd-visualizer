import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Dashboard,
})

function Dashboard() {
  return (
    <div className="h-full w-full flex items-center justify-center bg-slate-950 text-slate-500">
      <p>Select a session from the sidebar, or create a new one to get started.</p>
    </div>
  )
}
