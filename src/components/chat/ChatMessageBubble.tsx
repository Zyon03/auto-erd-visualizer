import type { ChatMessage } from '../../mutations/chatMessages'

export function ChatMessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <div className="ml-auto max-w-[85%] bg-teal-500/20 border border-teal-400/30 text-slate-100 rounded-lg px-3 py-2 text-sm">
        {message.content}
      </div>
    )
  }

  if (message.role === 'system') {
    return <div className="text-xs text-slate-500 px-1">{message.content}</div>
  }

  return (
    <div className="mr-auto max-w-[85%] bg-slate-800/70 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm">
      {message.content}
    </div>
  )
}
