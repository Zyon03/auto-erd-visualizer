import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { HelpCircle, TriangleAlert } from 'lucide-react'
import type { AnchorHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import type { ChatMessage } from '../../mutations/chatMessages'
import { decodeQuestion } from '../../agent/questionMessage'
import { decodeAgentError } from '../../agent/agentErrorMessage'

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

// A question the AI already asked, rendered purely as a scrollback record. Live interaction
// (choice buttons, multi-select send, the "Other…" field) lives entirely in
// PendingQuestionDrawer now, driven by ChatPanel's derived `pendingQuestion` -- this component
// never needs to know whether the question has been answered yet.
function QuestionRecord({ question, choices }: { question: string; choices: string[] }) {
  return (
    <div className="mr-auto max-w-[90%] rounded-lg border border-line bg-surface-raised px-3 py-2.5 text-sm text-ink-muted">
      <div className="mb-2 flex items-start gap-1.5 font-medium">
        <HelpCircle size={14} className="mt-0.5 shrink-0 text-ink-faint" />
        <span>{question}</span>
      </div>
      {choices.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {choices.map((choice) => (
            <span key={choice} className="rounded-full border border-line px-2.5 py-1 text-xs text-ink-faint">
              {choice}
            </span>
          ))}
        </div>
      )}
    </div>
  )
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
    const agentError = decodeAgentError(message.content)
    if (agentError) {
      return (
        <div className="mr-auto max-w-[90%] rounded-lg border border-amber/30 bg-amber/10 px-3 py-2.5 text-sm text-ink">
          <div className="flex items-start gap-1.5 font-medium">
            <TriangleAlert size={14} className="mt-0.5 shrink-0 text-amber" />
            <span>{agentError.message}</span>
          </div>
          <div className="mt-1 pl-[20px] text-xs text-ink-muted">
            <ReactMarkdown components={systemMarkdownComponents}>{agentError.hint ?? 'Try sending your message again.'}</ReactMarkdown>
          </div>
        </div>
      )
    }
    return (
      <div className="px-1 font-mono text-xs text-ink-faint">
        <ReactMarkdown components={systemMarkdownComponents}>{message.content}</ReactMarkdown>
      </div>
    )
  }

  const question = decodeQuestion(message.content)
  if (question) {
    return <QuestionRecord question={question.question} choices={question.choices} />
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
