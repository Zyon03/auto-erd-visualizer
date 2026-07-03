import { classifyTableRole, type TableRole, type ClassifiableTable } from '../../mutations/tableRole'
import { cn } from '../../lib/cn'

const ROLE_TEXT: Record<TableRole, string> = {
  master: 'text-mint',
  transactional: 'text-amber',
}
const PINNED_BG: Record<TableRole, string> = {
  master: 'bg-mint/25 ring-1 ring-mint/60',
  transactional: 'bg-amber/25 ring-1 ring-amber/60',
}
const AUTO_BG: Record<TableRole, string> = {
  master: 'bg-mint/15',
  transactional: 'bg-amber/15',
}
const ROLE_LABEL: Record<TableRole, { compact: string; full: string }> = {
  master: { compact: 'M', full: 'Master' },
  transactional: { compact: 'T', full: 'Trans.' },
}

/** Purely visual — the pill styling shared by the interactive TableRoleSelect trigger and any
 *  read-only spot (e.g. the relationship summary dialog) that just needs to show the tag. */
export function TableRoleBadge({
  fields,
  roleOverride,
  compact = false,
  className,
}: ClassifiableTable & { compact?: boolean; className?: string }) {
  const role = classifyTableRole({ fields, roleOverride })
  const isPinned = roleOverride !== null
  return (
    <span
      className={cn(
        'shrink-0 rounded-full font-mono font-medium uppercase tracking-wide',
        compact ? 'px-1.5 py-0 text-[10px]' : 'px-1.5 py-0 text-[9px]',
        ROLE_TEXT[role],
        isPinned ? PINNED_BG[role] : AUTO_BG[role],
        className,
      )}
    >
      {compact ? ROLE_LABEL[role].compact : ROLE_LABEL[role].full}
    </span>
  )
}
