import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'

export interface TableNodeField {
  id: number
  name: string
  type: string
  isPrimaryKey: boolean
  isForeignKey: boolean
}

export interface TableNodeData extends Record<string, unknown> {
  tableId: number
  name: string
  fields: TableNodeField[]
}

export type TableNodeType = Node<TableNodeData, 'table'>

export function TableNode({ data }: NodeProps<TableNodeType>) {
  return (
    <div className="min-w-[180px] rounded-lg border border-slate-700 bg-slate-900 shadow-lg text-sm">
      <div className="bg-slate-800 text-slate-200 font-semibold px-3 py-1.5 rounded-t-lg">{data.name}</div>
      <table className="w-full">
        <tbody>
          {data.fields.map((field, index) => (
            <tr key={field.id} className="relative text-slate-300">
              <Handle
                type="target"
                id={`field-${field.id}`}
                position={Position.Left}
                style={{ top: 8 + index * 28, background: '#5eead4' }}
              />
              <td className="px-2 py-1 w-6 text-amber-400">{field.isPrimaryKey ? '\u{1F511}' : ''}</td>
              <td className="px-2 py-1 w-6 text-teal-400">{field.isForeignKey ? '\u{1F517}' : ''}</td>
              <td className="px-2 py-1">{field.name}</td>
              <td className="px-2 py-1 text-slate-500">{field.type}</td>
              <Handle
                type="source"
                id={`field-${field.id}`}
                position={Position.Right}
                style={{ top: 8 + index * 28, background: '#5eead4' }}
              />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
