import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  ReactFlow,
  Background,
  Panel,
  applyNodeChanges,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
} from '@xyflow/react'
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
  onAddTable: (name: string) => void
  onAddField: (tableId: number, name: string, type: string) => void
  onConnect: (fromFieldId: number, toFieldId: number) => void
  onRenameTable: (tableId: number, name: string) => void
  onRenameField: (fieldId: number, name: string) => void
  onDeleteTable: (tableId: number) => void
  onDeleteField: (fieldId: number) => void
  onMoveTable: (tableId: number, positionX: number, positionY: number) => void
}

export function ErdCanvas({
  schema,
  onAddTable,
  onAddField,
  onConnect,
  onRenameTable,
  onRenameField,
  onDeleteTable,
  onDeleteField,
  onMoveTable,
}: ErdCanvasProps) {
  const [newTableName, setNewTableName] = useState('')
  const baseNodes = useMemo(
    () =>
      schemaToNodes(schema).map((node) => ({
        ...node,
        data: { ...node.data, onAddField, onRenameTable, onRenameField, onDeleteTable, onDeleteField },
      })),
    [schema, onAddField, onRenameTable, onRenameField, onDeleteTable, onDeleteField],
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

  function handleAddTable() {
    if (!newTableName.trim()) return
    onAddTable(newTableName.trim())
    setNewTableName('')
  }

  const isValidConnection = useCallback(
    (connection: Edge | Connection) => {
      if (!connection.sourceHandle || !connection.targetHandle) return false
      const fromFieldId = Number(connection.sourceHandle.replace('field-', ''))
      const toFieldId = Number(connection.targetHandle.replace('field-', ''))
      if (fromFieldId === toFieldId) return false
      return !schema.relationships.some(
        (rel) =>
          (rel.fromFieldId === fromFieldId && rel.toFieldId === toFieldId) ||
          (rel.fromFieldId === toFieldId && rel.toFieldId === fromFieldId),
      )
    },
    [schema.relationships],
  )

  return (
    <div className="h-full w-full bg-slate-950">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={handleNodesChange}
        onConnect={handleConnect}
        isValidConnection={isValidConnection}
        onNodeDragStop={handleNodeDragStop}
        onEdgeMouseEnter={handleEdgeMouseEnter}
        onEdgeMouseLeave={handleEdgeMouseLeave}
        fitView
      >
        <Background color="#1e293b" gap={24} />
        <Panel position="top-left" className="flex gap-2">
          <input
            value={newTableName}
            onChange={(e) => setNewTableName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddTable()}
            placeholder="New table name"
            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-slate-200 placeholder:text-slate-600"
          />
          <button
            onClick={handleAddTable}
            className="bg-teal-500 text-slate-950 px-3 py-1 rounded text-sm font-medium hover:bg-teal-400"
          >
            + Add table
          </button>
        </Panel>
      </ReactFlow>
    </div>
  )
}
