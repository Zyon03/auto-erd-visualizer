import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { toast } from "sonner";
import {
  listSessionsFn,
  createSessionFn,
  renameSessionFn,
  deleteSessionFn,
} from "../../server-fns/sessions";
import type { SessionSummary } from "../../mutations/sessions";
import { EditableText } from "../ui/editable-text";
import { Button } from "../ui/button";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "../ui/alert-dialog";
import { relativeTime } from "../../lib/relativeTime";
import { onSessionsChanged } from "../../lib/sessionListBus";
import { cn } from "../../lib/cn";

const COLLAPSED_STORAGE_KEY = "autoerd:sidebar-collapsed";

function SessionListSkeleton() {
  // Three placeholder rows shaped like a real session entry (name line + meta line), so the
  // sidebar reads as "loading the list" on first paint instead of just looking empty — this is
  // the slow one the user actually notices, since it's the very first thing the app shows.
  return (
    <ul className="flex-1 space-y-1 p-2" aria-hidden>
      {[0, 1, 2].map((i) => (
        <li
          key={i}
          className="animate-pulse space-y-1.5 rounded-md py-2 pl-3 pr-3"
        >
          <div className="h-3.5 w-3/5 rounded bg-surface-raised" />
          <div className="h-2.5 w-2/5 rounded bg-surface-raised/70" />
        </li>
      ))}
    </ul>
  );
}

export function SessionSidebar() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const activeSessionId = params.sessionId;

  const listSessions = useServerFn(listSessionsFn);
  const createSession = useServerFn(createSessionFn);
  const renameSession = useServerFn(renameSessionFn);
  const deleteSession = useServerFn(deleteSessionFn);

  useEffect(() => {
    listSessions().then((result) => {
      setSessions(result);
      setLoaded(true);
    });
  }, []);

  useEffect(
    () => onSessionsChanged(() => listSessions().then(setSessions)),
    [],
  );

  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSED_STORAGE_KEY) === "1");
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSED_STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  async function refresh() {
    setSessions(await listSessions());
  }

  async function handleCreate() {
    setCreating(true);
    try {
      const session = await createSession({
        data: { name: `Session ${sessions.length + 1}` },
      });
      await refresh();
      navigate({
        to: "/sessions/$sessionId",
        params: { sessionId: String(session.id) },
      });
    } finally {
      setCreating(false);
    }
  }

  async function handleRename(sessionId: number, name: string) {
    await renameSession({ data: { sessionId, name } });
    await refresh();
  }

  async function handleDelete(sessionId: number) {
    try {
      await deleteSession({ data: { sessionId } });
      await refresh();
      if (activeSessionId === String(sessionId)) {
        navigate({ to: "/" });
      }
      toast.success("Session deleted");
    } catch {
      toast.error("Could not delete session");
    }
  }

  // A single persistent shell whose *width* animates, with the collapsed/expanded content as two
  // overlapping absolutely-positioned layers crossfading via opacity — not the old two-branch
  // early return, which swapped between entirely separate DOM trees and could only ever snap
  // instantly with no transition to animate. Each layer keeps its own natural (uncompressed)
  // width so its content doesn't itself squash/reflow mid-transition; the outer `overflow-hidden`
  // is what actually reveals/hides it as the shell's width animates.
  return (
    <div
      className={cn(
        "relative h-screen shrink-0 overflow-hidden border-r border-line bg-surface transition-[width] duration-200 ease-in-out",
        collapsed ? "w-12" : "w-64",
      )}
    >
      <div
        className={cn(
          "absolute inset-0 flex w-12 flex-col items-center gap-2 py-3 transition-opacity duration-150",
          collapsed ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        inert={!collapsed}
      >
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

      <div
        className={cn(
          "absolute inset-0 flex w-64 flex-col transition-opacity duration-150",
          collapsed ? "pointer-events-none opacity-0" : "opacity-100",
        )}
        inert={collapsed}
      >
        <div className="p-3 border-b border-line">
          <div className="mb-3 flex items-center justify-between px-1">
            <span className="font-display text-sm font-semibold tracking-tight text-ink">
              ERDrew
            </span>
            <button
              onClick={toggleCollapsed}
              className="rounded p-1 text-ink-faint hover:bg-surface-raised hover:text-ink"
              title="Collapse sidebar"
            >
              <PanelLeftClose size={15} />
            </button>
          </div>
          <Button onClick={handleCreate} loading={creating} className="w-full">
            {creating ? null : <Plus size={15} />}
            New session
          </Button>
        </div>
        {!loaded ? (
          <SessionListSkeleton />
        ) : (
          <ul className="flex-1 overflow-y-auto p-2 space-y-1">
            {sessions.map((session) => {
              const isActive = activeSessionId === String(session.id);
              return (
                <li
                  key={session.id}
                  className="group relative animate-[fade-in_200ms_ease-out]"
                >
                  <Link
                    to="/sessions/$sessionId"
                    params={{ sessionId: String(session.id) }}
                    className={`block rounded-md border-l-2 py-2 pl-3 pr-8 text-sm transition-colors ${
                      isActive
                        ? "border-accent bg-surface-raised text-ink"
                        : "border-transparent text-ink-muted hover:bg-surface-raised hover:text-ink"
                    }`}
                  >
                    <EditableText
                      value={session.name}
                      onCommit={(name) => handleRename(session.id, name)}
                      className="block truncate"
                      inputClassName="text-sm py-0.5"
                    />
                    <span className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-ink-faint">
                      <span>
                        {session.tableCount}{" "}
                        {session.tableCount === 1 ? "table" : "tables"}
                      </span>
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
                      <AlertDialogTitle>
                        Delete "{session.name}"?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This permanently deletes its tables, fields,
                        relationships, and chat history. This can't be undone.
                      </AlertDialogDescription>
                      <AlertDialogFooter>
                        <AlertDialogCancel asChild>
                          <Button variant="outline" size="sm">
                            Cancel
                          </Button>
                        </AlertDialogCancel>
                        <AlertDialogAction asChild>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDelete(session.id)}
                          >
                            Delete session
                          </Button>
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
