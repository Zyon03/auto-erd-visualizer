import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { Send, Square, ChevronDown, ChevronUp, Maximize2, Minimize2, PanelBottomClose } from 'lucide-react'
import { sendMessageFn, cancelTurnFn } from '../../server-fns/chat'
import { useSessionEvents } from '../../hooks/useSessionEvents'
import { ChatMessageBubble } from './ChatMessageBubble'
import { Button } from '../ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../ui/select'
import { MODEL_OPTIONS } from '../../agent/models'
import { encodeQuestion } from '../../agent/questionMessage'
import { encodeAgentError } from '../../agent/agentErrorMessage'
import type { AgentErrorKind } from '../../agent/classifyAgentError'
import type { ChatMessage } from '../../mutations/chatMessages'

type TurnEvent =
  | { type: 'tool_step'; toolName: string; stepText: string }
  | { type: 'assistant_note'; text: string }
  | { type: 'ask_question'; question: string; choices: string[]; allowMultiple: boolean }
  | { type: 'turn_complete'; text: string }
  | { type: 'turn_error'; kind: AgentErrorKind; message: string; hint?: string }

type ChatMode = 'expanded' | 'full' | 'compact' | 'hidden'

const DEFAULT_MODEL_VALUE = 'default'

export interface ChatPanelProps {
  sessionId: number
  initialMessages: ChatMessage[]
  onSchemaMayHaveChanged: () => void
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
  onSchemaMayHaveChanged,
  model,
  onModelChange,
  hasTables,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [draft, setDraft] = useState('')
  const [turnInFlight, setTurnInFlight] = useState(false)
  const [workingNote, setWorkingNote] = useState<string | null>(null)
  const [chatMode, setChatMode] = useState<ChatMode>('full')
  const nextLocalId = useRef(-1)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMessages(initialMessages)
  }, [sessionId])

  // Message history opens on the most recent message, not the oldest — the scrollable region is
  // remounted whenever chatMode toggles away from 'full' and back (see the conditional render
  // below), which resets scrollTop to 0 each time, so this has to re-run on chatMode too, not
  // just when messages change. useLayoutEffect (not useEffect) so the jump happens before paint
  // and never flashes the oldest message first.
  useLayoutEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages, chatMode])

  const sendMessage = useServerFn(sendMessageFn)
  const cancelTurn = useServerFn(cancelTurnFn)

  const eventsStatus = useSessionEvents(sessionId, (raw) => {
    const event = raw as TurnEvent
    if (event.type === 'tool_step') {
      setWorkingNote(null)
      setMessages((prev) => [
        ...prev,
        { id: nextLocalId.current--, sessionId, role: 'system', content: event.stepText, createdAt: '' },
      ])
      onSchemaMayHaveChanged()
    } else if (event.type === 'assistant_note') {
      setWorkingNote(event.text)
    } else if (event.type === 'ask_question') {
      // Deliberately does NOT clear turnInFlight — the AI is prompted to stop after asking, but
      // the `claude` process is still technically running until turn_complete/turn_error
      // arrives. Answering immediately (before that) would spawn a second concurrent turn for
      // the same session (registerRunningTurn keys on sessionId, so the first would become
      // uncancellable and the two processes' SSE output would interleave). The question renders
      // right away either way; only the reply controls stay briefly disabled.
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
      }
      setTurnInFlight(false)
      onSchemaMayHaveChanged()
    } else if (event.type === 'turn_error') {
      setWorkingNote(null)
      const content =
        (event.kind === 'not_installed' || event.kind === 'not_authenticated') && event.hint
          ? encodeAgentError({ kind: event.kind, message: event.message, hint: event.hint })
          : event.message
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
            {messages.map((message, index) => (
              <ChatMessageBubble
                key={message.id}
                message={message}
                interactive={index === messages.length - 1}
                disabled={turnInFlight}
                onAnswerQuestion={handleAnswerQuestion}
              />
            ))}
          </div>
        )}
        {workingNote && (
          <div className="flex items-center gap-1.5 px-4 pt-2 text-xs italic text-ink-faint">
            <span className="h-1 w-1 shrink-0 animate-pulse rounded-full bg-accent" aria-hidden />
            <span className="truncate">{workingNote}</span>
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
            placeholder={turnInFlight ? 'Thinking...' : 'Message the AI...'}
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
