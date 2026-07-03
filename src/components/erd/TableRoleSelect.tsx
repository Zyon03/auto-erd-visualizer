import * as RadixSelect from '@radix-ui/react-select'
import { classifyTableRole, type TableRole } from '../../mutations/tableRole'
import { TableRoleBadge } from './TableRoleBadge'
import { SelectContent, SelectItem } from '../ui/select'

const AUTO_VALUE = 'auto'

/** A real dropdown (not a click-to-cycle toggle) so it's obvious you're choosing a value, not
 *  just poking a badge and hoping it lands on the right one. Shared by the table list panel and
 *  the on-canvas table header pill — same three choices (Auto / Master / Transactional), just a
 *  different trigger size. */
export function TableRoleSelect({
  fields,
  roleOverride,
  onSetTableRole,
  compact = false,
  className,
}: {
  fields: { isForeignKey: boolean }[]
  roleOverride: TableRole | null
  onSetTableRole: (role: TableRole | null) => void
  /** Canvas header pill: just "M"/"T". List panel: full word — more room, more context there. */
  compact?: boolean
  className?: string
}) {
  const effectiveRole = classifyTableRole({ fields, roleOverride })
  const autoDetected = classifyTableRole({ fields, roleOverride: null })
  const isPinned = roleOverride !== null
  const value = roleOverride ?? AUTO_VALUE

  return (
    <RadixSelect.Root
      value={value}
      onValueChange={(next) => onSetTableRole(next === AUTO_VALUE ? null : (next as TableRole))}
    >
      <RadixSelect.Trigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          title={
            isPinned
              ? `Pinned as ${effectiveRole === 'master' ? 'Master' : 'Transactional'} — click to change`
              : `Auto-detected as ${effectiveRole === 'master' ? 'Master' : 'Transactional'} — click to pin`
          }
          className="outline-none transition-opacity hover:opacity-80"
        >
          <TableRoleBadge fields={fields} roleOverride={roleOverride} compact={compact} className={className} />
        </button>
      </RadixSelect.Trigger>
      <SelectContent>
        <SelectItem value={AUTO_VALUE}>Auto ({autoDetected === 'master' ? 'Master' : 'Transactional'})</SelectItem>
        <SelectItem value="master">Master</SelectItem>
        <SelectItem value="transactional">Transactional</SelectItem>
      </SelectContent>
    </RadixSelect.Root>
  )
}
