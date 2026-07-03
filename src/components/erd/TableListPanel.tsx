import { useState } from 'react'
import { ChevronDown, LayoutList } from 'lucide-react'
import { TableRoleSelect } from './TableRoleSelect'
import type { TableRole } from '../../mutations/tableRole'
import type { TableWithFields } from '../../mutations/getFullSchema'

export interface TableListPanelProps {
  tables: TableWithFields[]
  onSelectTable: (tableId: number) => void
  onSetTableRole: (tableId: number, role: TableRole | null) => void
}

/** Collapsible index of every table in the session — mainly useful once a diagram has grown
 *  past what fits on screen at once, so a table can be found and jumped to without hunting
 *  around the canvas. Alphabetical, so a table's position in the list doesn't shift just because
 *  its master/transactional tag changed. */
export function TableListPanel({ tables, onSelectTable, onSetTableRole }: TableListPanelProps) {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs text-ink-muted hover:text-ink"
        title="Show table list"
      >
        <LayoutList size={13} />
        Tables ({tables.length})
      </button>
    )
  }

  const sorted = [...tables].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="w-56 overflow-hidden rounded-lg border border-line bg-surface/95 shadow-xl backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-line/70 px-2.5 py-1.5">
        <span className="text-xs font-medium text-ink-muted">Tables ({tables.length})</span>
        <button
          onClick={() => setOpen(false)}
          className="rounded p-0.5 text-ink-faint hover:bg-surface-raised hover:text-ink"
          title="Hide table list"
        >
          <ChevronDown size={13} />
        </button>
      </div>
      {sorted.length === 0 ? (
        <p className="px-3 py-3 text-xs text-ink-faint">No tables yet</p>
      ) : (
        <ul className="max-h-72 overflow-y-auto p-1.5">
          {sorted.map((table) => (
            <li key={table.id} className="flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-surface-raised">
              <button
                onClick={() => onSelectTable(table.id)}
                className="min-w-0 flex-1 truncate px-1 py-1 text-left text-xs text-ink-muted hover:text-ink"
              >
                {table.name}
              </button>
              <TableRoleSelect
                fields={table.fields}
                roleOverride={table.roleOverride}
                onSetTableRole={(role) => onSetTableRole(table.id, role)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
