import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { listSessionsFn, createSessionFn } from '../server-fns/sessions'

export const Route = createFileRoute('/')({
  loader: () => listSessionsFn(),
  component: Dashboard,
})

function Dashboard() {
  const sessions = Route.useLoaderData()
  const navigate = useNavigate()
  const createSession = useServerFn(createSessionFn)

  async function handleCreate() {
    const name = window.prompt('Session name')
    if (!name) return
    const session = await createSession({ data: { name } })
    navigate({ to: '/sessions/$sessionId', params: { sessionId: String(session.id) } })
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Sessions</h1>
        <button
          onClick={handleCreate}
          className="bg-teal-500 text-slate-950 px-4 py-2 rounded font-medium hover:bg-teal-400"
        >
          + New session
        </button>
      </div>
      {sessions.length === 0 && <p className="text-slate-500">No sessions yet — create one to get started.</p>}
      <ul className="space-y-2">
        {sessions.map((session) => (
          <li key={session.id}>
            <Link
              to="/sessions/$sessionId"
              params={{ sessionId: String(session.id) }}
              className="block bg-slate-900 border border-slate-800 rounded p-4 hover:border-teal-500"
            >
              <div className="font-medium">{session.name}</div>
              <div className="text-sm text-slate-500">
                {session.tableCount} tables · updated {session.updatedAt}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
