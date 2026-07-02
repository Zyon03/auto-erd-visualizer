import { useState } from 'react'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../ui/select'
import { FIELD_TYPES, CUSTOM_FIELD_TYPE } from './fieldTypes'

const KNOWN_TYPES: readonly string[] = FIELD_TYPES

export function FieldTypeSelect({
  value,
  onChange,
  className,
}: {
  value: string
  onChange: (type: string) => void
  className?: string
}) {
  const isKnown = KNOWN_TYPES.includes(value)
  const [customMode, setCustomMode] = useState(false)
  const [customDraft, setCustomDraft] = useState('')

  if (customMode) {
    return (
      <input
        autoFocus
        value={customDraft}
        onChange={(e) => setCustomDraft(e.target.value)}
        onBlur={() => customDraft.trim() && onChange(customDraft.trim())}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        placeholder="type"
        className={className ?? 'w-20 rounded border border-accent bg-inset px-1.5 py-1 font-mono text-xs text-ink outline-none'}
      />
    )
  }

  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (next === CUSTOM_FIELD_TYPE) {
          setCustomMode(true)
          setCustomDraft(isKnown ? '' : value)
          return
        }
        onChange(next)
      }}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={value || 'type'} />
      </SelectTrigger>
      <SelectContent>
        {/* An AI-set or otherwise non-curated type (e.g. "integer") still needs to appear
            as the selected item — Radix Select shows blank if `value` matches nothing. */}
        {!isKnown && value && <SelectItem value={value}>{value}</SelectItem>}
        {FIELD_TYPES.map((type) => (
          <SelectItem key={type} value={type}>
            {type}
          </SelectItem>
        ))}
        <SelectItem value={CUSTOM_FIELD_TYPE}>Custom…</SelectItem>
      </SelectContent>
    </Select>
  )
}
