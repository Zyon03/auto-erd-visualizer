import { useState } from 'react'
import { HelpCircle } from 'lucide-react'
import type { PendingQuestion } from '../../agent/questionMessage'
import { Button } from '../ui/button'
import { cn } from '../../lib/cn'

/** The live surface for the AI's current unanswered question -- structurally separate from the
 *  scrollable message log (see ChatPanel's `pendingQuestion`, derived from the message log but
 *  rendered here instead of inline) so it can't be scrolled away, collapsed, or buried by
 *  whatever the AI says next. Historical questions render as plain read-only records in
 *  ChatMessageBubble; this component only ever shows the one still awaiting a reply. */
export function PendingQuestionDrawer({
  pendingQuestion,
  disabled,
  onAnswer,
}: {
  pendingQuestion: PendingQuestion | null
  disabled: boolean
  onAnswer: (text: string) => void
}) {
  const [selected, setSelected] = useState<string[]>([])
  const [showOther, setShowOther] = useState(false)
  const [otherText, setOtherText] = useState('')

  // Local choice/other state must not leak from one question to the next -- keyed by
  // messageId so React resets it for us on every new question instead of carrying over a
  // stale selection.
  const [trackedMessageId, setTrackedMessageId] = useState(pendingQuestion?.messageId)
  if (pendingQuestion && pendingQuestion.messageId !== trackedMessageId) {
    setTrackedMessageId(pendingQuestion.messageId)
    setSelected([])
    setShowOther(false)
    setOtherText('')
  }

  if (!pendingQuestion) return null
  const { question, choices, allowMultiple } = pendingQuestion

  function toggleChoice(choice: string) {
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

  const showOtherInput = showOther || choices.length === 0

  return (
    <div className="animate-[fade-in-up_200ms_ease-out] px-3 pt-3">
      <div className="rounded-lg border border-accent/50 bg-accent/10 px-3 py-2.5 text-sm text-ink shadow-[0_0_0_1px_rgba(183,196,242,0.12),0_0_20px_-6px_rgba(183,196,242,0.35)]">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-accent-strong">
          <HelpCircle size={13} className="shrink-0" />
          Waiting for your answer
        </div>
        <p className="mb-2 font-medium">{question}</p>
        {choices.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {choices.map((choice) => {
              const isSelected = selected.includes(choice)
              return (
                <button
                  key={choice}
                  disabled={disabled}
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
            {!showOther && (
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
        {allowMultiple && choices.length > 0 && (
          <Button size="sm" className="mt-2" disabled={disabled || selected.length === 0} onClick={() => onAnswer(selected.join(', '))}>
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
    </div>
  )
}
