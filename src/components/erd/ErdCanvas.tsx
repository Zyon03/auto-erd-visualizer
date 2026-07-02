import { useEffect, useMemo, useState, useCallback } from 'react'
import { ReactFlow, Background, applyNodeChanges, type Connection, type Edge, type Node, type NodeChange } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { TableNode } from './TableNode'
import { RelationshipEdge } from './RelationshipEdge'
import { schemaToNodes, schemaToEdges } from './schemaToFlow'
import type { FullSchema } from '../../mutations/getFullSchema'
import type { TableNodeType } from './TableNode'

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
  const baseNodes = useMemo(
    () =>
      schemaToNodes(schema).map((node) => ({
        ...node,
        data: { ...node.data, onAddField, onRenameTable, onRenameField },
      })),
    [schema, onAddField, onRenameTable, onRenameField],
  )
  const [nodes, setNodes] = useState<TableNodeType[]>(baseNodes)
  useEffect(() => {
    setNodes(baseNodes)
  }, [baseNodes])

  const handleNodesChange = useCallback((changes: NodeChange<TableNodeType>[]) => {
    setNodes((current) => applyNodeChanges(changes, current))
  }, [])

  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null)
  const edges = useMemo(
    () =>
      schemaToEdges(schema).map((edge) => ({
        ...edge,
        data: { ...edge.data, hovered: edge.id === hoveredEdgeId },
      })),
    [schema, hoveredEdgeId],
  )

  function handleConnect(connection: Connection) {
    if (!connection.sourceHandle || !connection.targetHandle) return
    const fromFieldId = Number(connection.sourceHandle.replace('field-', ''))
    const toFieldId = Number(connection.targetHandle.replace('field-', ''))
    onConnect(fromFieldId, toFieldId)
  }

  function handleNodeDragStop(_event: unknown, node: Node) {
    onMoveTable(Number(node.id), node.position.x, node.position.y)
  }

  function handleEdgeMouseEnter(_event: unknown, edge: Edge) {
    setHoveredEdgeId(edge.id)
  }

  function handleEdgeMouseLeave() {
    setHoveredEdgeId(null)
  }

  return (
    <div className="h-full w-full bg-slate-950">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={handleNodesChange}
        onConnect={handleConnect}
        onNodeDragStop={handleNodeDragStop}
        onEdgeMouseEnter={handleEdgeMouseEnter}
        onEdgeMouseLeave={handleEdgeMouseLeave}
        fitView
      >
        <Background color="#1e293b" gap={24} />
      </ReactFlow>
    </div>
  )
}
