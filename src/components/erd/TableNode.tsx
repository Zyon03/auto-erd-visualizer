import { useLayoutEffect, useRef, useState } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { Plus, Trash2, Sparkles } from 'lucide-react'
import { EditableText } from '../ui/editable-text'
import { Button } from '../ui/button'
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '../ui/alert-dialog'
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from '../ui/dialog'
import { FieldTypeSelect } from './FieldTypeSelect'
import { TableRoleSelect } from './TableRoleSelect'
import { TableRoleBadge } from './TableRoleBadge'
import { parseFieldType, formatFieldType, TYPES_WITH_LENGTH, TYPES_WITH_PRECISION } from './fieldTypeParams'
import { cn } from '../../lib/cn'
import type { TableRole } from '../../mutations/tableRole'

const paramInputClass =
  'w-6 rounded border border-transparent bg-transparent px-0.5 py-0.5 text-center font-mono text-[10px] text-ink-faint outline-none hover:border-line hover:bg-inset focus-visible:border-accent focus-visible:text-ink'

/** Length/precision editing for a field's type, e.g. the "255" in varchar(255) or the "10,2" in
 *  decimal(10,2) -- shown next to the type dropdown, independent of whether that dropdown is
 *  currently open for editing, since it's just adjusting a number rather than picking a new base
 *  type. Only rendered for types where a length/precision is real (see fieldTypeParams.ts);
 *  digits are constrained on input rather than validated after the fact, since there's no
 *  meaningful "invalid but not yet complete" state to show an error for here. */
function FieldTypeParams({ type, onChange }: { type: string; onChange: (next: string) => void }) {
  const { base, params } = parseFieldType(type)

  function setParam(index: number, raw: string) {
    const digits = raw.replace(/\D/g, '')
    const next = [...params]
    next[index] = digits
    onChange(formatFieldType(base, next))
  }

  if (TYPES_WITH_LENGTH.includes(base)) {
    return (
      <input
        value={params[0] ?? ''}
        onChange={(e) => setParam(0, e.target.value)}
        placeholder="len"
        inputMode="numeric"
        title="Length"
        className={paramInputClass}
      />
    )
  }

  if (TYPES_WITH_PRECISION.includes(base)) {
    return (
      <span className="flex items-center gap-0.5 font-mono text-[10px] text-ink-faint">
        <input
          value={params[0] ?? ''}
          onChange={(e) => setParam(0, e.target.value)}
          placeholder="p"
          inputMode="numeric"
          title="Precision"
          className={paramInputClass}
        />
        ,
        <input
          value={params[1] ?? ''}
          onChange={(e) => setParam(1, e.target.value)}
          placeholder="s"
          inputMode="numeric"
          title="Scale"
          className={paramInputClass}
        />
      </span>
    )
  }

  return null
}

export interface TableNodeField {
  id: number
  name: string
  type: string
  isPrimaryKey: boolean
  isForeignKey: boolean
}

export interface TableNodeData {
  tableId: number
  name: string
  fields: TableNodeField[]
  createdAt: string
  roleOverride: TableRole | null
  onAddField?: (tableId: number, name: string, type: string) => void
  onRenameTable?: (tableId: number, name: string) => void
  onRenameField?: (fieldId: number, name: string) => void
  onUpdateFieldType?: (fieldId: number, type: string) => void
  onDeleteTable?: (tableId: number) => void
  onDeleteField?: (fieldId: number) => void
  onSetTableRole?: (tableId: number, role: TableRole | null) => void
  /** Relation view uses a single handle per table instead of per-field ones — dim the
   *  field-level handles rather than unmounting them, so field-level edges stay valid data. */
  hideFieldHandles?: boolean
  /** Pre-computed by ErdCanvas from the full schema (TableNode only sees this table's own
   *  fields, not the whole schema needed to derive it). */
  summaryLines?: string[]
  /** Created since the last time this browser viewed this session — see lib/lastViewed.ts. */
  isNew?: boolean
  /** True while the user hovers a relationship touching this table — see ErdCanvas's
   *  highlightedTableIds. Transient, unlike `selected` (a persistent pick from the table list),
   *  so it gets a lighter treatment that doesn't compete with it when both are true at once. */
  highlighted?: boolean
  [key: string]: unknown
}

export type TableNodeType = Node<TableNodeData, 'table'>

/** Relation-view attachment points, spread down each side instead of a single fixed spot —
 *  otherwise every relationship touching a table would converge on the same pixel, making a
 *  table with 3+ relationships unreadable. `schemaToTableEdges` assigns each relationship a
 *  slot round-robin per table, referencing `table-{tableId}-{slot}` as the handle id. */
export const TABLE_HANDLE_SLOTS = 4
const TABLE_HANDLE_TOP_PERCENTS = ['20%', '40%', '60%', '80%']

const BOLD_SEGMENT = /(\*\*[^*]+\*\*)/g

/** summarize.ts formats each line as `**Table** ↔ **Table** — comment (cardinality)` -- this is
 *  the one place that markup gets interpreted. Deliberately not a full markdown renderer (this is
 *  the only syntax that's ever generated): a plain split/wrap keeps this dialog free of any
 *  content-injection surface from AI-authored text, since it only ever produces React elements,
 *  never raw HTML. */
function renderBoldedLine(line: string) {
  return line.split(BOLD_SEGMENT).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part,
  )
}

function AddFieldRow({ tableId, onAdd }: { tableId: number; onAdd: (tableId: number, name: string, type: string) => void }) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState('varchar')

  function commit() {
    if (!name.trim()) return
    onAdd(tableId, name.trim(), type.trim() || 'varchar')
    setName('')
    setType('varchar')
    setAdding(false)
  }

  if (!adding) {
    return (
      <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-xs text-accent hover:text-accent-strong">
        <Plus size={12} />
        field
      </button>
    )
  }

  return (
    <div className="flex gap-1">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        placeholder="name"
        className="w-20 rounded border border-accent bg-inset px-1.5 py-1 text-xs text-ink outline-none"
      />
      <FieldTypeSelect value={type} onChange={setType} />
      <FieldTypeParams type={type} onChange={setType} />
      <button onClick={commit} className="text-xs text-accent hover:text-accent-strong">
        add
      </button>
    </div>
  )
}

function FieldRow({
  field,
  top,
  rowRef,
  hideHandles,
  onRenameField,
  onUpdateFieldType,
  onDeleteField,
}: {
  field: TableNodeField
  top: number
  rowRef: (el: HTMLTableRowElement | null) => void
  hideHandles?: boolean
  onRenameField?: (fieldId: number, name: string) => void
  onUpdateFieldType?: (fieldId: number, type: string) => void
  onDeleteField?: (fieldId: number) => void
}) {
  const [editingType, setEditingType] = useState(false)
  const handleStyle = {
    top,
    background: 'var(--color-accent)',
    border: '1px solid var(--color-canvas)',
    opacity: hideHandles ? 0 : 1,
    pointerEvents: hideHandles ? ('none' as const) : undefined,
  }

  return (
    <tr ref={rowRef} className="group text-ink-muted">
      <td className="w-10 px-2 py-1">
        {/* <Handle> renders a plain <div> -- only valid as a <td>/<th> child, never a <tr>
            child directly (the browser's HTML parser silently relocates it otherwise, causing
            a hydration mismatch). It's absolutely positioned relative to TableNode's outer
            `relative` div regardless of which <td> it sits in, so nesting it here instead of
            at the row level doesn't move it on screen. */}
        <Handle type="target" id={`field-${field.id}`} position={Position.Left} style={handleStyle} />
        {field.isPrimaryKey && (
          <span className="inline-flex items-center gap-0.5 font-mono text-[9px] font-medium text-amber">
            <span className="h-1.5 w-1.5 rounded-full bg-amber" aria-hidden />
            PK
          </span>
        )}
        {field.isForeignKey && (
          <span className="ml-1 inline-flex items-center gap-0.5 font-mono text-[9px] font-medium text-mint">
            <span className="h-1.5 w-1.5 rounded-full bg-mint" aria-hidden />
            FK
          </span>
        )}
      </td>
      <td className="px-2 py-1">
        <EditableText
          value={field.name}
          onCommit={(next) => onRenameField?.(field.id, next)}
          className="text-ink"
        />
      </td>
      <td className="px-2 py-1">
        <div className="flex items-center gap-1">
          {editingType ? (
            <FieldTypeSelect
              value={field.type}
              onChange={(next) => {
                onUpdateFieldType?.(field.id, next)
                setEditingType(false)
              }}
            />
          ) : (
            <button
              onClick={() => setEditingType(true)}
              className="rounded border border-transparent px-1.5 py-0.5 font-mono text-[11px] text-ink-faint hover:border-line hover:bg-inset hover:text-ink-muted"
              title="Click to change type"
            >
              {parseFieldType(field.type).base}
            </button>
          )}
          {/* Independent of editingType -- adjusting a length/precision is a different action
              from picking a new base type, and shouldn't require opening the type dropdown. */}
          <FieldTypeParams type={field.type} onChange={(next) => onUpdateFieldType?.(field.id, next)} />
        </div>
      </td>
      <td className="w-5 px-1 py-1">
        <button
          onClick={() => onDeleteField?.(field.id)}
          className="text-ink-faint opacity-0 hover:text-rose group-hover:opacity-100"
          title="Delete field"
        >
          <Trash2 size={12} />
        </button>
        <Handle type="source" id={`field-${field.id}`} position={Position.Right} style={handleStyle} />
      </td>
    </tr>
  )
}

export function TableNode({ data, selected }: NodeProps<TableNodeType>) {
  const tableRef = useRef<HTMLTableElement>(null)
  const rowRefs = useRef(new Map<number, HTMLTableRowElement>())
  const [handleTops, setHandleTops] = useState<Record<number, number>>({})

  useLayoutEffect(() => {
    function measure() {
      // `offsetTop` on a <tr> is relative to the nearest <table> ancestor, not the
      // card container — the DOM spec special-cases table elements as an offsetParent
      // boundary regardless of `position`. Add the table's own offset (which measures
      // normally, relative to the card) to fold the header's height back in.
      const tableOffset = tableRef.current?.offsetTop ?? 0
      const next: Record<number, number> = {}
      rowRefs.current.forEach((el, fieldId) => {
        next[fieldId] = tableOffset + el.offsetTop + el.offsetHeight / 2
      })
      setHandleTops(next)
    }
    measure()
    // Google Fonts swap in after first paint and can shift row heights slightly;
    // re-measure once they're actually loaded so handles don't end up a few px off.
    document.fonts?.ready.then(measure)
  }, [data.fields])

  return (
    <div
      className={cn(
        'relative min-w-[200px] rounded-lg border bg-surface text-sm shadow-lg transition-shadow',
        selected
          ? 'border-accent ring-2 ring-accent/50'
          : data.highlighted
            ? 'border-accent/70 ring-1 ring-accent/30'
            : 'border-line',
      )}
    >
      {/* Stable per-table handles, independent of field rows — used by the relation view, which
          draws one edge per table pair instead of tracing to a specific field. Spread across
          several slots (not header-flex children, so percentage `top` is relative to the whole
          card) so multiple relationships don't all converge on one point. Always invisible and
          non-interactive: they're purely anchor points for the aggregated edges to attach to
          (react-flow measures a Handle's DOM position regardless of its own opacity/pointer-events),
          never meant to be seen or dragged from — relation view is a read-only overview, not
          another place to hand-draw a connection. */}
      {TABLE_HANDLE_TOP_PERCENTS.map((top, slot) => (
        <Handle
          key={`target-${slot}`}
          type="target"
          id={`table-${data.tableId}-${slot}`}
          position={Position.Left}
          style={{ top, opacity: 0, pointerEvents: 'none' }}
        />
      ))}
      {TABLE_HANDLE_TOP_PERCENTS.map((top, slot) => (
        <Handle
          key={`source-${slot}`}
          type="source"
          id={`table-${data.tableId}-${slot}`}
          position={Position.Right}
          style={{ top, opacity: 0, pointerEvents: 'none' }}
        />
      ))}
      <div className="group flex items-center justify-between rounded-t-lg bg-surface-raised px-3 py-1.5 font-display font-semibold text-ink">
        <div className="flex min-w-0 items-center gap-1.5">
          <TableRoleSelect
            compact
            fields={data.fields}
            roleOverride={data.roleOverride}
            onSetTableRole={(role) => data.onSetTableRole?.(data.tableId, role)}
          />
          <EditableText
            value={data.name}
            onCommit={(next) => data.onRenameTable?.(data.tableId, next)}
            className="truncate"
          />
          {data.isNew && (
            <span
              className="shrink-0 rounded-full border border-accent/30 bg-accent/15 px-1.5 py-0 font-mono text-[9px] font-medium uppercase tracking-wide text-accent"
              title="Created since you last viewed this session"
            >
              New
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <Dialog>
            <DialogTrigger asChild>
              <button
                className="rounded p-0.5 text-ink-faint opacity-0 hover:text-accent group-hover:opacity-100"
                title="Summarize relationships"
              >
                <Sparkles size={13} />
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogTitle className="flex items-center gap-2">
                <TableRoleBadge fields={data.fields} roleOverride={data.roleOverride} compact />
                {data.name}
              </DialogTitle>
              {data.summaryLines && data.summaryLines.length > 0 ? (
                <ul className="mt-3 list-disc space-y-1.5 pl-4 text-sm text-ink">
                  {data.summaryLines.map((line, i) => (
                    <li key={i}>{renderBoldedLine(line)}</li>
                  ))}
                </ul>
              ) : (
                <DialogDescription>No relationships yet.</DialogDescription>
              )}
            </DialogContent>
          </Dialog>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                className="rounded p-0.5 text-ink-faint opacity-0 hover:text-rose group-hover:opacity-100"
                title="Delete table"
              >
                <Trash2 size={13} />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogTitle>Delete table "{data.name}"?</AlertDialogTitle>
              <AlertDialogDescription>
                This deletes all its fields and any relationships connected to them. This can't be undone.
              </AlertDialogDescription>
              <AlertDialogFooter>
                <AlertDialogCancel asChild>
                  <Button variant="outline" size="sm">
                    Cancel
                  </Button>
                </AlertDialogCancel>
                <AlertDialogAction asChild>
                  <Button variant="destructive" size="sm" onClick={() => data.onDeleteTable?.(data.tableId)}>
                    Delete table
                  </Button>
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      <table ref={tableRef} className="w-full">
        <tbody>
          {data.fields.length === 0 && (
            <tr>
              <td colSpan={4} className="px-3 py-2 text-xs text-ink-faint">
                No fields yet
              </td>
            </tr>
          )}
          {data.fields.map((field, index) => (
            <FieldRow
              key={field.id}
              field={field}
              top={handleTops[field.id] ?? 8 + index * 28}
              hideHandles={data.hideFieldHandles}
              rowRef={(el) => {
                if (el) rowRefs.current.set(field.id, el)
                else rowRefs.current.delete(field.id)
              }}
              onRenameField={data.onRenameField}
              onUpdateFieldType={data.onUpdateFieldType}
              onDeleteField={data.onDeleteField}
            />
          ))}
          <tr>
            <td colSpan={4} className="px-2 py-1.5">
              <AddFieldRow tableId={data.tableId} onAdd={data.onAddField ?? (() => {})} />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
