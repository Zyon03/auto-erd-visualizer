import { useEffect, useRef, useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { sendMessageFn } from '../../server-fns/chat'
import { useSessionEvents } from '../../hooks/useSessionEvents'
import { ChatMessageBubble } from './ChatMessageBubble'
import type { ChatMessage } from '../../mutations/chatMessages'

type TurnEvent =
  | { type: 'tool_step'; toolName: string; stepText: string }
  | { type: 'turn_complete'; text: string }
  | { type: 'turn_error'; message: string }

export interface ChatPanelProps {
  sessionId: number
  initialMessages: ChatMessage[]
  onSchemaMayHaveChanged: () => void
}

export function ChatPanel({ sessionId, initialMessages, onSchemaMayHaveChanged }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [draft, setDraft] = useState('')
  const [turnInFlight, setTurnInFlight] = useState(false)
  const nextLocalId = useRef(-1)

  useEffect(() => {
    setMessages(initialMessages)
  }, [sessionId])

  const sendMessage = useServerFn(sendMessageFn)

  useSessionEvents(sessionId, (raw) => {
    const event = raw as TurnEvent
    if (event.type === 'tool_step') {
      setMessages((prev) => [
        ...prev,
        { id: nextLocalId.current--, sessionId, role: 'system', content: event.stepText, createdAt: '' },
      ])
      onSchemaMayHaveChanged()
    } else if (event.type === 'turn_complete') {
      if (event.text) {
        setMessages((prev) => [
          ...prev,
          { id: nextLocalId.current--, sessionId, role: 'assistant', content: event.text, createdAt: '' },
        ])
      }
      setTurnInFlight(false)
      onSchemaMayHaveChanged()
    } else if (event.type === 'turn_error') {
      setMessages((prev) => [
        ...prev,
        { id: nextLocalId.current--, sessionId, role: 'system', content: event.message, createdAt: '' },
      ])
      setTurnInFlight(false)
    }
  })

  async function handleSend() {
    const content = draft.trim()
    if (!content || turnInFlight) return
    setDraft('')
    setTurnInFlight(true)
    const message = await sendMessage({ data: { sessionId, content } })
    setMessages((prev) => [...prev, message])
  }

  const hasMessages = messages.length > 0

  if (!hasMessages) {
    return (
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-full max-w-lg px-6 pointer-events-auto">
          <p className="text-center text-slate-400 mb-3 text-sm">Describe the system you want to model...</p>
          <div className="flex gap-2">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="e.g. Users can place orders, each order has multiple items..."
              className="flex-1 bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600"
            />
            <button
              onClick={handleSend}
              disabled={turnInFlight}
              className="bg-teal-500 text-slate-950 px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-400 disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-full max-w-xl px-4 pointer-events-none">
      <div className="pointer-events-auto rounded-xl border border-teal-400/25 bg-slate-950/55 backdrop-blur-md shadow-lg overflow-hidden">
        <div className="max-h-64 overflow-y-auto px-3 pt-3 space-y-2 [mask-image:linear-gradient(to_bottom,transparent,black_16px)]">
          {messages.map((message) => (
            <ChatMessageBubble key={message.id} message={message} />
          ))}
        </div>
        <div className="flex gap-2 p-3">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            disabled={turnInFlight}
            placeholder={turnInFlight ? 'Thinking...' : 'Message the AI...'}
            className="flex-1 bg-slate-900/80 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={turnInFlight}
            className="bg-teal-500 text-slate-950 px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-400 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
