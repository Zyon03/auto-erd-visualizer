import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { Plus, Trash2, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { toast } from 'sonner'
import { listSessionsFn, createSessionFn, renameSessionFn, deleteSessionFn } from '../../server-fns/sessions'
import type { SessionSummary } from '../../mutations/sessions'
import { EditableText } from '../ui/editable-text'
import { Button } from '../ui/button'
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '../ui/alert-dialog'
import { relativeTime } from '../../lib/relativeTime'
import { onSessionsChanged } from '../../lib/sessionListBus'

const COLLAPSED_STORAGE_KEY = 'autoerd:sidebar-collapsed'

export function SessionSidebar() {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()
  const params = useParams({ strict: false })
  const activeSessionId = params.sessionId

  const listSessions = useServerFn(listSessionsFn)
  const createSession = useServerFn(createSessionFn)
  const renameSession = useServerFn(renameSessionFn)
  const deleteSession = useServerFn(deleteSessionFn)

  useEffect(() => {
    listSessions().then(setSessions)
  }, [])

  useEffect(() => onSessionsChanged(() => listSessions().then(setSessions)), [])

  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSED_STORAGE_KEY) === '1')
  }, [])

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(COLLAPSED_STORAGE_KEY, next ? '1' : '0')
      return next
    })
  }

  async function refresh() {
    setSessions(await listSessions())
  }

  async function handleCreate() {
    const session = await createSession({ data: { name: `Session ${sessions.length + 1}` } })
    await refresh()
    navigate({ to: '/sessions/$sessionId', params: { sessionId: String(session.id) } })
  }

  async function handleRename(sessionId: number, name: string) {
    await renameSession({ data: { sessionId, name } })
    await refresh()
  }

  async function handleDelete(sessionId: number) {
    try {
      await deleteSession({ data: { sessionId } })
      await refresh()
      if (activeSessionId === String(sessionId)) {
        navigate({ to: '/' })
      }
      toast.success('Session deleted')
    } catch {
      toast.error('Could not delete session')
    }
  }

  if (collapsed) {
    return (
      <div className="flex h-screen w-12 shrink-0 flex-col items-center gap-2 border-r border-line bg-surface py-3">
        <button
          onClick={toggleCollapsed}
          className="rounded p-1.5 text-ink-muted hover:bg-surface-raised hover:text-ink"
          title="Expand sidebar"
        >
          <PanelLeftOpen size={16} />
        </button>
        <button
          onClick={handleCreate}
          className="rounded p-1.5 text-ink-muted hover:bg-surface-raised hover:text-ink"
          title="New session"
        >
          <Plus size={16} />
        </button>
      </div>
    )
  }

  return (
    <div className="w-64 shrink-0 h-screen bg-surface border-r border-line flex flex-col">
      <div className="p-3 border-b border-line">
        <div className="mb-3 flex items-center justify-between px-1">
          <span className="font-display text-sm font-semibold tracking-tight text-ink">Auto ERD</span>
          <button
            onClick={toggleCollapsed}
            className="rounded p-1 text-ink-faint hover:bg-surface-raised hover:text-ink"
            title="Collapse sidebar"
          >
            <PanelLeftClose size={15} />
          </button>
        </div>
        <Button onClick={handleCreate} className="w-full">
          <Plus size={15} />
          New session
        </Button>
      </div>
      <ul className="flex-1 overflow-y-auto p-2 space-y-1">
        {sessions.map((session) => {
          const isActive = activeSessionId === String(session.id)
          return (
            <li key={session.id} className="group relative">
              <Link
                to="/sessions/$sessionId"
                params={{ sessionId: String(session.id) }}
                className={`block rounded-md border-l-2 py-2 pl-3 pr-8 text-sm transition-colors ${
                  isActive
                    ? 'border-accent bg-surface-raised text-ink'
                    : 'border-transparent text-ink-muted hover:bg-surface-raised hover:text-ink'
                }`}
              >
                <EditableText
                  value={session.name}
                  onCommit={(name) => handleRename(session.id, name)}
                  className="block truncate"
                  inputClassName="text-sm py-0.5"
                />
                <span className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-ink-faint">
                  <span>{session.tableCount} {session.tableCount === 1 ? 'table' : 'tables'}</span>
                  <span aria-hidden>·</span>
                  <span>{relativeTime(session.updatedAt)}</span>
                </span>
              </Link>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-2 top-2.5 rounded p-1 text-ink-faint opacity-0 transition-opacity hover:bg-surface hover:text-rose group-hover:opacity-100"
                    title="Delete session"
                  >
                    <Trash2 size={13} />
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogTitle>Delete "{session.name}"?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently deletes its tables, fields, relationships, and chat history. This
                    can't be undone.
                  </AlertDialogDescription>
                  <AlertDialogFooter>
                    <AlertDialogCancel asChild>
                      <Button variant="outline" size="sm">
                        Cancel
                      </Button>
                    </AlertDialogCancel>
                    <AlertDialogAction asChild>
                      <Button variant="destructive" size="sm" onClick={() => handleDelete(session.id)}>
                        Delete session
                      </Button>
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
