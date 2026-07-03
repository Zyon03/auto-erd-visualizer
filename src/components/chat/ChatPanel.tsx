import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import {
  Send,
  Square,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  PanelBottomClose,
  Eye,
  EyeOff,
} from 'lucide-react'
import { toast } from 'sonner'
import { sendMessageFn, cancelTurnFn, loadEarlierChatMessagesFn } from '../../server-fns/chat'
import { useSessionEvents } from '../../hooks/useSessionEvents'
import { ChatMessageBubble } from './ChatMessageBubble'
import { PendingQuestionDrawer } from './PendingQuestionDrawer'
import { DotPulse } from '../DotPulse'
import { Button } from '../ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../ui/select'
import { MODEL_OPTIONS } from '../../agent/models'
import { encodeQuestion, findPendingQuestion } from '../../agent/questionMessage'
import { encodeAgentError, decodeAgentError } from '../../agent/agentErrorMessage'
import type { AgentErrorKind } from '../../agent/classifyAgentError'
import type { ChatMessage } from '../../mutations/chatMessages'
import { cn } from '../../lib/cn'

type TurnEvent =
  | { type: 'tool_call_started'; toolName: string }
  | { type: 'tool_step'; toolName: string; stepText: string }
  | { type: 'assistant_note'; text: string }
  | { type: 'ask_question'; question: string; choices: string[]; allowMultiple: boolean }
  | { type: 'session_renamed'; name: string }
  | { type: 'turn_complete'; text: string }
  | { type: 'turn_error'; kind: AgentErrorKind; message: string; hint?: string }

type ChatMode = 'expanded' | 'full' | 'compact' | 'hidden'

const DEFAULT_MODEL_VALUE = 'default'
const ACTIVITY_LOG_STORAGE_KEY = 'autoerd:chat-show-activity-log'

// Friendly present-progressive labels for the live "AI is doing X right now" indicator, shown
// the instant a tool call starts (before its result — and thus its actual outcome — is known).
// Falls back to a generic label built from the raw tool name for anything not listed here, so a
// newly added erd tool degrades gracefully instead of showing nothing.
const TOOL_ACTION_LABELS: Record<string, string> = {
  get_schema: 'Checking the schema…',
  add_table: 'Adding a table…',
  rename_table: 'Renaming a table…',
  delete_table: 'Deleting a table…',
  add_field: 'Adding a field…',
  rename_field: 'Renaming a field…',
  update_field: 'Updating a field…',
  delete_field: 'Deleting a field…',
  add_relationship: 'Adding a relationship…',
  update_relationship: 'Updating a relationship…',
  delete_relationship: 'Deleting a relationship…',
}

function toolActionLabel(toolName: string): string {
  return TOOL_ACTION_LABELS[toolName] ?? `Running ${toolName.replace(/_/g, ' ')}…`
}

export interface ChatPanelProps {
  sessionId: number
  initialMessages: ChatMessage[]
  /** Whether the initial page (server-fns/chat.ts's CHAT_PAGE_SIZE most recent messages) left
   *  older ones unloaded — see docs/superpowers/plans/2026-07-03-chat-message-pagination.md. */
  initialHasMoreOlderMessages: boolean
  onSchemaMayHaveChanged: () => void
  /** Fired when the AI names a brand-new session for itself (see the "Session naming" paragraph
   *  in runTurn.ts's SYSTEM_PROMPT) — the caller owns the displayed name (sidebar + topbar), this
   *  component only ever reports it changed. */
  onSessionRenamed?: (name: string) => void
  model: string | null
  onModelChange: (model: string) => void
  /** A table can exist with zero chat messages (added directly on the canvas, no AI turn ever
   *  run) — the centered "describe your system" prompt is misleading once there's already a
   *  schema, so it should only show for a truly blank session, not just an empty chat log. */
  hasTables: boolean
}

export function ChatPanel({
  sessionId,
  initialMessages,
  initialHasMoreOlderMessages,
  onSchemaMayHaveChanged,
  onSessionRenamed,
  model,
  onModelChange,
  hasTables,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [hasMoreOlder, setHasMoreOlder] = useState(initialHasMoreOlderMessages)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [draft, setDraft] = useState('')
  const [turnInFlight, setTurnInFlight] = useState(false)
  const [workingNote, setWorkingNote] = useState<string | null>(null)
  const [chatMode, setChatMode] = useState<ChatMode>('full')
  // Tool-step system messages ("Added table `users`", etc.) are the AI's own action log, not
  // conversation -- hidden by default so the chat reads as a dialogue with the user's own
  // messages and the AI's replies, with the play-by-play tucked behind a toggle. Agent-error
  // messages are a different kind of system message (user-facing problem reports) and always
  // stay visible regardless of this toggle -- see visibleMessages below.
  const [showActivityLog, setShowActivityLog] = useState(false)
  const nextLocalId = useRef(-1)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  // Set right before prepending an older page, to the container's scrollHeight *before* the
  // prepend — the scroll-pinning layout effect below uses it to keep whatever the user was
  // looking at in the same visual spot, instead of either jumping to the bottom (its normal
  // behavior for a *new* message) or leaving scrollTop at a now-wrong pixel offset into the
  // newly-added older content.
  const pendingScrollAdjustRef = useRef<number | null>(null)

  useEffect(() => {
    setMessages(initialMessages)
  }, [sessionId])

  useEffect(() => {
    setShowActivityLog(localStorage.getItem(ACTIVITY_LOG_STORAGE_KEY) === '1')
  }, [])

  function toggleActivityLog() {
    setShowActivityLog((prev) => {
      const next = !prev
      localStorage.setItem(ACTIVITY_LOG_STORAGE_KEY, next ? '1' : '0')
      return next
    })
  }

  // Plain tool-step logs are filtered out when the activity log is collapsed; agent-error
  // messages (decodable system messages) are a user-facing problem report, not an action log
  // entry, so they stay visible either way.
  const visibleMessages = useMemo(
    () => (showActivityLog ? messages : messages.filter((m) => m.role !== 'system' || decodeAgentError(m.content) !== null)),
    [messages, showActivityLog],
  )

  // Derived, not tracked as its own state -- see findPendingQuestion's doc comment. This is what
  // makes the question un-buryable: it doesn't matter whether the AI adds closing prose after
  // asking, or where the question sits in `messages`, only whether the user has replied yet.
  const pendingQuestion = useMemo(() => findPendingQuestion(messages), [messages])

  // Ticks once a second for the whole turn (not per working-note change) so "Thinking… 4s" becomes
  // "Adding a table… 11s" as the turn progresses -- a running total, not a per-step timer.
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  useEffect(() => {
    if (!turnInFlight) return
    setElapsedSeconds(0)
    const interval = setInterval(() => setElapsedSeconds((s) => s + 1), 1000)
    return () => clearInterval(interval)
  }, [turnInFlight])

  // Message history opens on the most recent message, not the oldest — the scrollable region is
  // remounted whenever chatMode toggles away from 'full' and back (see the conditional render
  // below), which resets scrollTop to 0 each time, so this has to re-run on chatMode too, not
  // just when messages change. useLayoutEffect (not useEffect) so the jump happens before paint
  // and never flashes the oldest message first.
  useLayoutEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return

    if (pendingScrollAdjustRef.current !== null) {
      const previousScrollHeight = pendingScrollAdjustRef.current
      pendingScrollAdjustRef.current = null
      el.scrollTop += el.scrollHeight - previousScrollHeight
      return
    }

    function pinToBottom() {
      if (el) el.scrollTop = el.scrollHeight
    }
    pinToBottom()
    // Same fix as TableNode's handle-position measurement: the app's webfonts swap in after
    // first paint and reflow already-rendered text, changing its height. A short history barely
    // moves; a long one (hundreds of wrapped lines, e.g. many AI tool-step log lines) can shift
    // enough that scrollHeight measured before the swap lands well short of the true bottom —
    // this re-measures once the swap actually happens, so a long session doesn't open somewhere
    // in the middle of its history instead of the end.
    document.fonts?.ready.then(pinToBottom)
  }, [visibleMessages, chatMode])

  const sendMessage = useServerFn(sendMessageFn)
  const cancelTurn = useServerFn(cancelTurnFn)
  const loadEarlierMessages = useServerFn(loadEarlierChatMessagesFn)

  const eventsStatus = useSessionEvents(sessionId, (raw) => {
    const event = raw as TurnEvent
    if (event.type === 'tool_call_started') {
      setWorkingNote(toolActionLabel(event.toolName))
    } else if (event.type === 'tool_step') {
      setWorkingNote(null)
      setMessages((prev) => [
        ...prev,
        { id: nextLocalId.current--, sessionId, role: 'system', content: event.stepText, createdAt: '' },
      ])
      onSchemaMayHaveChanged()
    } else if (event.type === 'assistant_note') {
      setWorkingNote(event.text)
    } else if (event.type === 'session_renamed') {
      onSessionRenamed?.(event.name)
    } else if (event.type === 'ask_question') {
      // Deliberately does NOT clear turnInFlight — the AI is prompted to stop after asking, but
      // the `claude` process is still technically running until turn_complete/turn_error
      // arrives. Answering immediately (before that) would spawn a second concurrent turn for
      // the same session (registerRunningTurn keys on sessionId, so the first would become
      // uncancellable and the two processes' SSE output would interleave). The question renders
      // right away either way; only the drawer's reply controls stay briefly disabled — and only
      // briefly, since pendingQuestion (see above) no longer depends on this being the last
      // message once turn_complete arrives.
      setWorkingNote(null)
      setMessages((prev) => [
        ...prev,
        {
          id: nextLocalId.current--,
          sessionId,
          role: 'assistant',
          content: encodeQuestion({ question: event.question, choices: event.choices, allowMultiple: event.allowMultiple }),
          createdAt: '',
        },
      ])
    } else if (event.type === 'turn_complete') {
      setWorkingNote(null)
      if (event.text) {
        setMessages((prev) => [
          ...prev,
          { id: nextLocalId.current--, sessionId, role: 'assistant', content: event.text, createdAt: '' },
        ])
      } else {
        // A turn can succeed with zero output -- no closing text, no tool calls. Tagged the same
        // always-visible way as turn_error (see runTurn.ts's finish()) so this never reads as
        // "thinking just silently stopped," which otherwise looks identical to an actual hang.
        setMessages((prev) => [
          ...prev,
          {
            id: nextLocalId.current--,
            sessionId,
            role: 'system',
            content: encodeAgentError({ kind: 'other', message: "The AI didn't reply that time." }),
            createdAt: '',
          },
        ])
      }
      setTurnInFlight(false)
      onSchemaMayHaveChanged()
    } else if (event.type === 'turn_error') {
      setWorkingNote(null)
      // Always tagged (not just the two actionable kinds) so a generic failure -- a timeout, a
      // non-zero exit code -- can't silently disappear behind the activity-log toggle the way a
      // plain-text system message would. See agentErrorMessage.ts.
      const content = encodeAgentError({ kind: event.kind, message: event.message, hint: event.hint })
      setMessages((prev) => [
        ...prev,
        { id: nextLocalId.current--, sessionId, role: 'system', content, createdAt: '' },
      ])
      setTurnInFlight(false)
    }
  })

  async function handleSend(overrideText?: string) {
    const content = (overrideText ?? draft).trim()
    if (!content || turnInFlight) return
    setDraft('')
    setTurnInFlight(true)
    setWorkingNote(null)
    const message = await sendMessage({ data: { sessionId, content } })
    setMessages((prev) => [...prev, message])
  }

  function handleAnswerQuestion(text: string) {
    handleSend(text)
  }

  async function handleLoadEarlier() {
    if (loadingOlder || !hasMoreOlder || messages.length === 0) return
    setLoadingOlder(true)
    pendingScrollAdjustRef.current = scrollContainerRef.current?.scrollHeight ?? null
    try {
      const page = await loadEarlierMessages({ data: { sessionId, beforeId: messages[0].id } })
      setHasMoreOlder(page.hasMore)
      setMessages((prev) => [...page.messages, ...prev])
    } catch {
      pendingScrollAdjustRef.current = null
      toast.error('Could not load earlier messages')
    } finally {
      setLoadingOlder(false)
    }
  }

  function handleStop() {
    cancelTurn({ data: { sessionId } })
  }

  const hasMessages = messages.length > 0

  const modelSelect = (
    <Select value={model ?? DEFAULT_MODEL_VALUE} onValueChange={onModelChange}>
      <SelectTrigger className="border-transparent bg-transparent px-1.5 py-1 text-ink-faint hover:text-ink-muted">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={DEFAULT_MODEL_VALUE}>Default model</SelectItem>
        {MODEL_OPTIONS.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  // Fully hidden — nothing but a barely-there hover strip at the canvas edge, so the chat
  // doesn't visually compete with the diagram until the user actually wants it back. A pulsing
  // dot stays visible even without hovering if a turn is still running, so "hidden" never means
  // "no idea the AI is working."
  if (chatMode === 'hidden') {
    return (
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center">
        <div className="group pointer-events-auto relative">
          {turnInFlight && (
            <span
              className="pointer-events-none absolute left-1/2 top-1 h-1.5 w-1.5 -translate-x-1/2 animate-pulse rounded-full bg-accent"
              aria-hidden
            />
          )}
          <button
            onClick={() => setChatMode('full')}
            className="flex items-center gap-1 rounded-t-lg border border-b-0 border-line bg-surface px-3 py-1.5 text-xs text-ink-faint opacity-0 transition-opacity duration-150 hover:text-ink group-hover:opacity-100"
            title="Show chat"
          >
            <ChevronUp size={12} />
            Chat
          </button>
        </div>
      </div>
    )
  }

  if (!hasMessages && !hasTables) {
    return (
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="pointer-events-auto w-full max-w-lg px-6">
          <div className="mb-2 flex items-center justify-between">
            {modelSelect}
            <button
              onClick={() => setChatMode('hidden')}
              className="rounded p-1 text-ink-faint hover:bg-surface-raised hover:text-ink"
              title="Hide chat"
            >
              <PanelBottomClose size={13} />
            </button>
          </div>
          <p className="mb-3 text-center text-sm text-ink-muted">Describe the system you want to model...</p>
          <div className="flex gap-2">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="e.g. Users can place orders, each order has multiple items..."
              className="flex-1 rounded-lg border border-line bg-surface/90 px-3 py-2 text-sm text-ink placeholder:text-ink-faint outline-none focus-visible:border-accent"
            />
            <Button onClick={() => handleSend()} disabled={turnInFlight}>
              <Send size={14} />
              Send
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const isHistoryVisible = chatMode === 'full' || chatMode === 'expanded'
  const isExpanded = chatMode === 'expanded'

  return (
    <div
      className={`pointer-events-none absolute bottom-4 left-1/2 w-full -translate-x-1/2 px-4 ${isExpanded ? 'max-w-2xl' : 'max-w-xl'}`}
    >
      <div className="pointer-events-auto overflow-hidden rounded-xl border border-line bg-surface/70 shadow-2xl backdrop-blur-md">
        <div className="flex items-center justify-between gap-2 border-b border-line/70 px-2 py-1">
          {modelSelect}
          <div className="flex items-center gap-0.5">
            <button
              onClick={toggleActivityLog}
              className={cn(
                'rounded p-1 text-ink-faint hover:bg-surface-raised hover:text-ink',
                showActivityLog && 'text-accent hover:text-accent',
              )}
              title={showActivityLog ? 'Hide activity log (table/field edits)' : 'Show activity log (table/field edits)'}
            >
              {showActivityLog ? <Eye size={13} /> : <EyeOff size={13} />}
            </button>
            <button
              onClick={() => setChatMode(isHistoryVisible ? 'compact' : 'full')}
              className="rounded p-1 text-ink-faint hover:bg-surface-raised hover:text-ink"
              title={isHistoryVisible ? 'Hide message history' : 'Show message history'}
            >
              {isHistoryVisible ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
            </button>
            <button
              onClick={() => setChatMode(isExpanded ? 'full' : 'expanded')}
              className="rounded p-1 text-ink-faint hover:bg-surface-raised hover:text-ink"
              title={isExpanded ? 'Collapse chat' : 'Expand chat'}
            >
              {isExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
            <button
              onClick={() => setChatMode('hidden')}
              className="rounded p-1 text-ink-faint hover:bg-surface-raised hover:text-ink"
              title="Hide chat"
            >
              <PanelBottomClose size={13} />
            </button>
          </div>
        </div>
        {isHistoryVisible && (
          <div
            ref={scrollContainerRef}
            className={`space-y-2 overflow-y-auto px-3 pt-3 [mask-image:linear-gradient(to_bottom,transparent,black_16px)] ${isExpanded ? 'max-h-[70vh]' : 'max-h-64'}`}
          >
            {hasMoreOlder && (
              <div className="flex justify-center pb-1">
                <button
                  onClick={handleLoadEarlier}
                  disabled={loadingOlder}
                  className="rounded-full border border-line px-2.5 py-1 text-xs text-ink-muted hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loadingOlder ? 'Loading…' : 'Load earlier messages'}
                </button>
              </div>
            )}
            {visibleMessages.map((message) => (
              // The animation only plays once, on this element's first mount — existing messages
              // keep their stable `message.id` key across re-renders (e.g. a new message arriving
              // appends to the array rather than remounting the list), so only a genuinely new
              // message ever animates in.
              <div key={message.id} className="animate-[fade-in-up_200ms_ease-out]">
                <ChatMessageBubble message={message} />
              </div>
            ))}
          </div>
        )}
        {/* Rendered outside isHistoryVisible on purpose — collapsing the message history must
            never hide the one thing blocking the AI from continuing. */}
        <PendingQuestionDrawer pendingQuestion={pendingQuestion} disabled={turnInFlight} onAnswer={handleAnswerQuestion} />
        {turnInFlight && (
          <div className="flex items-center gap-1.5 px-4 pt-2 text-xs italic text-ink-faint">
            <DotPulse size={4} />
            <span className="truncate">
              {workingNote ?? 'Thinking…'} {elapsedSeconds}s
            </span>
          </div>
        )}
        <div className="flex items-center gap-2 p-3">
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${eventsStatus === 'open' ? 'bg-mint' : 'bg-rose'}`}
            title={eventsStatus === 'open' ? 'Live updates connected' : 'Live updates paused'}
          />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            disabled={turnInFlight}
            placeholder={pendingQuestion ? 'Type your answer…' : turnInFlight ? 'Thinking…' : 'Message the AI...'}
            className="flex-1 rounded-lg border border-line bg-inset/80 px-3 py-2 text-sm text-ink placeholder:text-ink-faint outline-none focus-visible:border-accent disabled:opacity-50"
          />
          {turnInFlight ? (
            <Button onClick={handleStop} variant="outline">
              <Square size={12} />
              Stop
            </Button>
          ) : (
            <Button onClick={() => handleSend()}>
              <Send size={14} />
              Send
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
