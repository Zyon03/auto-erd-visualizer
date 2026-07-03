import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { Plus } from 'lucide-react'
import { createSessionFn } from '../server-fns/sessions'
import { Button } from '../components/ui/button'
import { notifySessionsChanged } from '../lib/sessionListBus'

export const Route = createFileRoute('/')({
  component: Dashboard,
})

function Dashboard() {
  const navigate = useNavigate()
  const createSession = useServerFn(createSessionFn)

  async function handleCreate() {
    const session = await createSession({ data: { name: 'Session 1' } })
    notifySessionsChanged()
    navigate({ to: '/sessions/$sessionId', params: { sessionId: String(session.id) } })
  }

  return (
    <div className="dot-grid flex h-full w-full flex-col items-center justify-center gap-4 bg-canvas text-center">
      <p className="max-w-sm text-sm text-ink-muted">
        Select a session from the sidebar, or start a new one to describe a data model and watch the
        diagram build itself.
      </p>
      <Button onClick={handleCreate}>
        <Plus size={15} />
        New session
      </Button>
    </div>
  )
}
