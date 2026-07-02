import { useState } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'

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
  onDeleteTable?: (tableId: number) => void
  onDeleteField?: (fieldId: number) => void
  [key: string]: unknown
}

export type TableNodeType = Node<TableNodeData, 'table'>

function AddFieldRow({ tableId, onAdd }: { tableId: number; onAdd: (tableId: number, name: string, type: string) => void }) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState('text')

  function commit() {
    if (!name.trim()) return
    onAdd(tableId, name.trim(), type.trim() || 'text')
    setName('')
    setType('text')
    setAdding(false)
  }

  if (!adding) {
    return (
      <button onClick={() => setAdding(true)} className="text-teal-400 text-xs hover:underline">
        + field
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
        className="w-20 bg-slate-950 border border-teal-400 rounded px-1 text-xs text-slate-100"
      />
      <input
        value={type}
        onChange={(e) => setType(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        placeholder="type"
        className="w-16 bg-slate-950 border border-teal-400 rounded px-1 text-xs text-slate-100"
      />
      <button onClick={commit} className="text-teal-400 text-xs hover:underline">
        add
      </button>
    </div>
  )
}

function EditableText({ value, onCommit }: { value: string; onCommit: (next: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false)
          if (draft.trim() && draft !== value) onCommit(draft.trim())
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        className="bg-slate-950 border border-teal-400 rounded px-1 text-slate-100 w-full"
      />
    )
  }

  return (
    <span onDoubleClick={() => setEditing(true)} className="cursor-pointer">
      {value}
    </span>
  )
}

export function TableNode({ data }: NodeProps<TableNodeType>) {
  return (
    <div className="min-w-[180px] rounded-lg border border-slate-700 bg-slate-900 shadow-lg text-sm">
      <div className="group bg-slate-800 text-slate-200 font-semibold px-3 py-1.5 rounded-t-lg flex items-center justify-between">
        <EditableText value={data.name} onCommit={(next) => data.onRenameTable?.(data.tableId, next)} />
        <button
          onClick={() => data.onDeleteTable?.(data.tableId)}
          className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 text-xs px-1"
          title="Delete table"
        >
          ×
        </button>
      </div>
      <table className="w-full">
        <tbody>
          {data.fields.map((field, index) => (
            <tr key={field.id} className="group relative text-slate-300">
              <Handle
                type="target"
                id={`field-${field.id}`}
                position={Position.Left}
                style={{ top: 8 + index * 28, background: '#5eead4' }}
              />
              <td className="px-2 py-1 w-6 text-amber-400">{field.isPrimaryKey ? '\u{1F511}' : ''}</td>
              <td className="px-2 py-1 w-6 text-teal-400">{field.isForeignKey ? '\u{1F517}' : ''}</td>
              <td className="px-2 py-1">
                <EditableText value={field.name} onCommit={(next) => data.onRenameField?.(field.id, next)} />
              </td>
              <td className="px-2 py-1 text-slate-500">{field.type}</td>
              <td className="px-1 py-1 w-4">
                <button
                  onClick={() => data.onDeleteField?.(field.id)}
                  className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 text-xs"
                  title="Delete field"
                >
                  ×
                </button>
              </td>
              <Handle
                type="source"
                id={`field-${field.id}`}
                position={Position.Right}
                style={{ top: 8 + index * 28, background: '#5eead4' }}
              />
            </tr>
          ))}
          <tr>
            <td colSpan={4} className="px-2 py-1">
              <AddFieldRow tableId={data.tableId} onAdd={data.onAddField ?? (() => {})} />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
