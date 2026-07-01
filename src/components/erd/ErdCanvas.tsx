import { useMemo } from 'react'
import { ReactFlow, Background, type Connection, type Node } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { TableNode } from './TableNode'
import { RelationshipEdge } from './RelationshipEdge'
import { schemaToNodes, schemaToEdges } from './schemaToFlow'
import type { FullSchema } from '../../mutations/getFullSchema'

const nodeTypes = { table: TableNode }
const edgeTypes = { relationship: RelationshipEdge }

export interface ErdCanvasProps {
  schema: FullSchema
  onAddField: (tableId: number) => void
  onConnect: (fromFieldId: number, toFieldId: number) => void
  onRenameTable: (tableId: number, name: string) => void
  onRenameField: (fieldId: number, name: string) => void
  onMoveTable: (tableId: number, positionX: number, positionY: number) => void
}

export function ErdCanvas({ schema, onAddField, onConnect, onRenameTable, onRenameField, onMoveTable }: ErdCanvasProps) {
  const nodes = useMemo(
    () =>
      schemaToNodes(schema).map((node) => ({
        ...node,
        data: { ...node.data, onAddField, onRenameTable, onRenameField },
      })),
    [schema, onAddField, onRenameTable, onRenameField],
  )
  const edges = useMemo(() => schemaToEdges(schema), [schema])

  function handleConnect(connection: Connection) {
    if (!connection.sourceHandle || !connection.targetHandle) return
    const fromFieldId = Number(connection.sourceHandle.replace('field-', ''))
    const toFieldId = Number(connection.targetHandle.replace('field-', ''))
    onConnect(fromFieldId, toFieldId)
  }

  function handleNodeDragStop(_event: unknown, node: Node) {
    onMoveTable(Number(node.id), node.position.x, node.position.y)
  }

  return (
    <div className="h-full w-full bg-slate-950">
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onConnect={handleConnect} onNodeDragStop={handleNodeDragStop} fitView>
        <Background color="#1e293b" gap={24} />
      </ReactFlow>
    </div>
  )
}
