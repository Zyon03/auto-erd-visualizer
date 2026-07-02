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
  onAddField?: (tableId: number, name: string, type: string) => void
  onRenameTable?: (tableId: number, name: string) => void
  onRenameField?: (fieldId: number, name: string) => void
  onUpdateFieldType?: (fieldId: number, type: string) => void
  onDeleteTable?: (tableId: number) => void
  onDeleteField?: (fieldId: number) => void
  /** Relation view uses a single handle per table instead of per-field ones — dim the
   *  field-level handles rather than unmounting them, so field-level edges stay valid data. */
  hideFieldHandles?: boolean
  /** Pre-computed by ErdCanvas from the full schema (TableNode only sees this table's own
   *  fields, not the whole schema needed to derive it). */
  summaryLines?: string[]
  [key: string]: unknown
}

export type TableNodeType = Node<TableNodeData, 'table'>

/** Relation-view attachment points, spread down each side instead of a single fixed spot —
 *  otherwise every relationship touching a table would converge on the same pixel, making a
 *  table with 3+ relationships unreadable. `schemaToTableEdges` assigns each relationship a
 *  slot round-robin per table, referencing `table-{tableId}-{slot}` as the handle id. */
export const TABLE_HANDLE_SLOTS = 4
const TABLE_HANDLE_TOP_PERCENTS = ['20%', '40%', '60%', '80%']

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
      <Handle type="target" id={`field-${field.id}`} position={Position.Left} style={handleStyle} />
      <td className="w-10 px-2 py-1">
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
            {field.type}
          </button>
        )}
      </td>
      <td className="w-5 px-1 py-1">
        <button
          onClick={() => onDeleteField?.(field.id)}
          className="text-ink-faint opacity-0 hover:text-rose group-hover:opacity-100"
          title="Delete field"
        >
          <Trash2 size={12} />
        </button>
      </td>
      <Handle type="source" id={`field-${field.id}`} position={Position.Right} style={handleStyle} />
    </tr>
  )
}

export function TableNode({ data }: NodeProps<TableNodeType>) {
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
    <div className="relative min-w-[200px] rounded-lg border border-line bg-surface text-sm shadow-lg">
      {/* Stable per-table handles, independent of field rows — used by the relation view,
          which draws one edge per table pair instead of tracing to a specific field. Spread
          across several slots (not header-flex children, so percentage `top` is relative to
          the whole card) so multiple relationships don't all converge on one point. */}
      {TABLE_HANDLE_TOP_PERCENTS.map((top, slot) => (
        <Handle
          key={`target-${slot}`}
          type="target"
          id={`table-${data.tableId}-${slot}`}
          position={Position.Left}
          style={{
            top,
            background: 'var(--color-accent)',
            border: '1px solid var(--color-canvas)',
            opacity: data.hideFieldHandles ? 1 : 0,
            pointerEvents: data.hideFieldHandles ? undefined : 'none',
          }}
        />
      ))}
      {TABLE_HANDLE_TOP_PERCENTS.map((top, slot) => (
        <Handle
          key={`source-${slot}`}
          type="source"
          id={`table-${data.tableId}-${slot}`}
          position={Position.Right}
          style={{
            top,
            background: 'var(--color-accent)',
            border: '1px solid var(--color-canvas)',
            opacity: data.hideFieldHandles ? 1 : 0,
            pointerEvents: data.hideFieldHandles ? undefined : 'none',
          }}
        />
      ))}
      <div className="group flex items-center justify-between rounded-t-lg bg-surface-raised px-3 py-1.5 font-display font-semibold text-ink">
        <EditableText value={data.name} onCommit={(next) => data.onRenameTable?.(data.tableId, next)} />
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
              <DialogTitle>{data.name}</DialogTitle>
              {data.summaryLines && data.summaryLines.length > 0 ? (
                <ul className="mt-3 list-disc space-y-1.5 pl-4 text-sm text-ink">
                  {data.summaryLines.map((line, i) => (
                    <li key={i}>{line}</li>
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
