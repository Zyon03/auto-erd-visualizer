import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { listSessionsFn, createSessionFn } from '../../server-fns/sessions'
import type { SessionSummary } from '../../mutations/sessions'

export function SessionSidebar() {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const navigate = useNavigate()
  const params = useParams({ strict: false })
  const activeSessionId = params.sessionId

  const listSessions = useServerFn(listSessionsFn)
  const createSession = useServerFn(createSessionFn)

  useEffect(() => {
    listSessions().then(setSessions)
  }, [])

  async function handleCreate() {
    const session = await createSession({ data: { name: `Session ${sessions.length + 1}` } })
    setSessions(await listSessions())
    navigate({ to: '/sessions/$sessionId', params: { sessionId: String(session.id) } })
  }

  return (
    <div className="w-56 shrink-0 h-screen bg-slate-950 border-r border-slate-800 flex flex-col">
      <div className="p-3 border-b border-slate-800">
        <button
          onClick={handleCreate}
          className="w-full bg-teal-500 text-slate-950 px-3 py-2 rounded text-sm font-medium hover:bg-teal-400"
        >
          + New session
        </button>
      </div>
      <ul className="flex-1 overflow-y-auto p-2 space-y-1">
        {sessions.map((session) => (
          <li key={session.id}>
            <Link
              to="/sessions/$sessionId"
              params={{ sessionId: String(session.id) }}
              className={`block rounded px-2 py-2 text-sm truncate ${
                activeSessionId === String(session.id)
                  ? 'bg-slate-800 text-slate-100'
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              {session.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
