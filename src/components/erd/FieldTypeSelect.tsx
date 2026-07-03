import { useState } from 'react'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../ui/select'
import { FIELD_TYPES, CUSTOM_FIELD_TYPE } from './fieldTypes'
import { parseFieldType } from './fieldTypeParams'

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
  // Matched against the parsed *base* type, not the raw value -- "varchar(255)" must still show
  // "varchar" selected in the dropdown rather than falling into the unknown/custom bucket just
  // because of its embedded length. The length/precision inputs themselves live in TableNode,
  // right next to this component, operating on the same raw `value` string independently.
  const { base } = parseFieldType(value)
  const isKnown = KNOWN_TYPES.includes(base)
  // Radix Select's own `value` must match one of its items' values exactly. A known base (e.g.
  // "varchar" parsed out of "varchar(255)") matches the FIELD_TYPES item for "varchar"; anything
  // else falls back to matching against the raw string, same as before this component knew how
  // to parse a length out of anything.
  const selectValue = isKnown ? base : value
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
      value={selectValue}
      onValueChange={(next) => {
        if (next === CUSTOM_FIELD_TYPE) {
          setCustomMode(true)
          setCustomDraft(isKnown ? '' : value)
          return
        }
        // Picking a fresh base type from the list, not adjusting the current one -- drops any
        // previous length/precision (e.g. varchar(255) -> decimal shouldn't become decimal(255)).
        onChange(next)
      }}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={selectValue || 'type'} />
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
