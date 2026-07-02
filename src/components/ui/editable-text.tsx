import { useState } from 'react'
import { cn } from '../../lib/cn'

export function EditableText({
  value,
  onCommit,
  className,
  inputClassName,
}: {
  value: string
  onCommit: (next: string) => void
  className?: string
  inputClassName?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={() => {
          setEditing(false)
          if (draft.trim() && draft !== value) onCommit(draft.trim())
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') {
            setDraft(value)
            setEditing(false)
          }
        }}
        className={cn(
          'w-full rounded border border-accent bg-inset px-1 text-ink outline-none',
          inputClassName,
        )}
      />
    )
  }

  return (
    <span
      onDoubleClick={() => {
        setDraft(value)
        setEditing(true)
      }}
      className={cn('cursor-pointer', className)}
      title="Double-click to rename"
    >
      {value}
    </span>
  )
}
