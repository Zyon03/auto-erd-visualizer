import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import type { AnchorHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import type { ChatMessage } from '../../mutations/chatMessages'

const markdownComponents = {
  a: ({ ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props} target="_blank" rel="noopener noreferrer" />
  ),
}

// System notices (e.g. "Added field `name` to `users`") are short, deterministic strings the
// app itself generates with backtick-wrapped identifiers — not full AI prose, but they still
// need those backticks parsed away rather than shown literally. The whole line is already
// monospace, so `code` here just brightens the identifier instead of adding the boxed pill
// styling that's appropriate for a full-prose assistant message.
const systemMarkdownComponents = {
  code: ({ children }: { children?: ReactNode }) => <span className="text-ink">{children}</span>,
  p: ({ children }: HTMLAttributes<HTMLParagraphElement>) => <>{children}</>,
}

export function ChatMessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <div className="ml-auto max-w-[85%] rounded-lg border border-accent/30 bg-accent/15 px-3 py-2 text-sm text-ink">
        {message.content}
      </div>
    )
  }

  if (message.role === 'system') {
    return (
      <div className="px-1 font-mono text-xs text-ink-faint">
        <ReactMarkdown components={systemMarkdownComponents}>{message.content}</ReactMarkdown>
      </div>
    )
  }

  return (
    <div className="mr-auto max-w-[85%] rounded-lg border border-line bg-surface-raised px-3 py-2 text-sm text-ink">
      <div className="chat-prose prose prose-sm">
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={markdownComponents}>
          {message.content}
        </ReactMarkdown>
      </div>
    </div>
  )
}
