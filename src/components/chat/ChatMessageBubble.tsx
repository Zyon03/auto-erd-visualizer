import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { HelpCircle } from 'lucide-react'
import type { AnchorHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import type { ChatMessage } from '../../mutations/chatMessages'
import { decodeQuestion } from '../../agent/questionMessage'
import { Button } from '../ui/button'
import { cn } from '../../lib/cn'

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

function QuestionCard({
  question,
  choices,
  allowMultiple,
  interactive,
  disabled,
  onAnswer,
}: {
  question: string
  choices: string[]
  allowMultiple: boolean
  /** Only the most recent question in the conversation stays clickable — older ones render as a
   *  static record so they don't look like they're still waiting on you. */
  interactive: boolean
  disabled: boolean
  onAnswer: (text: string) => void
}) {
  const [selected, setSelected] = useState<string[]>([])
  const [showOther, setShowOther] = useState(false)
  const [otherText, setOtherText] = useState('')

  function toggleChoice(choice: string) {
    if (!interactive) return
    if (allowMultiple) {
      setSelected((prev) => (prev.includes(choice) ? prev.filter((c) => c !== choice) : [...prev, choice]))
    } else {
      onAnswer(choice)
    }
  }

  function submitOther() {
    if (!otherText.trim()) return
    onAnswer(otherText.trim())
  }

  const showOtherInput = interactive && (showOther || choices.length === 0)

  return (
    <div className="mr-auto max-w-[90%] rounded-lg border border-accent/30 bg-accent/10 px-3 py-2.5 text-sm text-ink">
      <div className="mb-2 flex items-start gap-1.5 font-medium">
        <HelpCircle size={14} className="mt-0.5 shrink-0 text-accent" />
        <span>{question}</span>
      </div>
      {choices.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {choices.map((choice) => {
            const isSelected = selected.includes(choice)
            return (
              <button
                key={choice}
                disabled={disabled || !interactive}
                onClick={() => toggleChoice(choice)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                  isSelected
                    ? 'border-accent bg-accent/25 text-ink'
                    : 'border-line bg-surface text-ink-muted hover:border-accent/50 hover:text-ink',
                )}
              >
                {choice}
              </button>
            )
          })}
          {interactive && !showOther && (
            <button
              disabled={disabled}
              onClick={() => setShowOther(true)}
              className="rounded-full border border-dashed border-line px-2.5 py-1 text-xs text-ink-faint hover:border-line-strong hover:text-ink-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              Other…
            </button>
          )}
        </div>
      )}
      {interactive && allowMultiple && choices.length > 0 && (
        <Button
          size="sm"
          className="mt-2"
          disabled={disabled || selected.length === 0}
          onClick={() => onAnswer(selected.join(', '))}
        >
          Send
        </Button>
      )}
      {showOtherInput && (
        <div className="mt-2 flex gap-1.5">
          <input
            autoFocus={showOther}
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitOther()}
            disabled={disabled}
            placeholder="Type your answer..."
            className="flex-1 rounded border border-line bg-inset px-2 py-1 text-xs text-ink outline-none focus-visible:border-accent disabled:opacity-50"
          />
          <button
            disabled={disabled || !otherText.trim()}
            onClick={submitOther}
            className="rounded border border-line px-2 py-1 text-xs text-ink-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send
          </button>
        </div>
      )}
    </div>
  )
}

export function ChatMessageBubble({
  message,
  interactive = false,
  disabled = false,
  onAnswerQuestion,
}: {
  message: ChatMessage
  /** Whether this is the most recent message — only then does a question stay clickable. */
  interactive?: boolean
  disabled?: boolean
  onAnswerQuestion?: (text: string) => void
}) {
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

  const question = decodeQuestion(message.content)
  if (question) {
    return (
      <QuestionCard
        question={question.question}
        choices={question.choices}
        allowMultiple={question.allowMultiple}
        interactive={interactive}
        disabled={disabled}
        onAnswer={(text) => onAnswerQuestion?.(text)}
      />
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
