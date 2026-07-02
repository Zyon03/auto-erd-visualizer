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
import { Plus, Waypoints, Rows3 } from 'lucide-react'
import { TableNode } from './TableNode'
import { RelationshipEdge } from './RelationshipEdge'
import { TableRelationEdge, CrowfootMarkerDefs } from './TableRelationEdge'
import { schemaToNodes, schemaToEdges, schemaToTableEdges } from './schemaToFlow'
import { Button } from '../ui/button'
import { cn } from '../../lib/cn'
import { summarizeTable } from '../../mutations/summarize'
import type { FullSchema } from '../../mutations/getFullSchema'
import type { TableNodeType } from './TableNode'

const nodeTypes = { table: TableNode }
const edgeTypes = { relationship: RelationshipEdge, tableRelation: TableRelationEdge }

type ViewMode = 'fields' | 'relations'

export interface ErdCanvasProps {
  schema: FullSchema
  /** Tables with a `createdAt` after this get a "New" badge — the last time this browser
   *  visited this session, so it reflects what changed since you were last looking. */
  newSinceThreshold: string
  onAddTable: (name: string) => void
  onAddField: (tableId: number, name: string, type: string) => void
  onConnect: (fromFieldId: number, toFieldId: number) => void
  onRenameTable: (tableId: number, name: string) => void
  onRenameField: (fieldId: number, name: string) => void
  onUpdateFieldType: (fieldId: number, type: string) => void
  onDeleteTable: (tableId: number) => void
  onDeleteField: (fieldId: number) => void
  onMoveTable: (tableId: number, positionX: number, positionY: number) => void
}

export function ErdCanvas({
  schema,
  newSinceThreshold,
  onAddTable,
  onAddField,
  onConnect,
  onRenameTable,
  onRenameField,
  onUpdateFieldType,
  onDeleteTable,
  onDeleteField,
  onMoveTable,
}: ErdCanvasProps) {
  const [newTableName, setNewTableName] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('fields')
  const baseNodes = useMemo(
    () =>
      schemaToNodes(schema).map((node) => ({
        ...node,
        data: {
          ...node.data,
          onAddField,
          onRenameTable,
          onRenameField,
          onUpdateFieldType,
          onDeleteTable,
          onDeleteField,
          hideFieldHandles: viewMode === 'relations',
          summaryLines: summarizeTable(schema, node.data.tableId),
          isNew: node.data.createdAt > newSinceThreshold,
        },
      })),
    [
      schema,
      onAddField,
      onRenameTable,
      onRenameField,
      onUpdateFieldType,
      onDeleteTable,
      onDeleteField,
      viewMode,
      newSinceThreshold,
    ],
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
      (viewMode === 'relations' ? schemaToTableEdges(schema) : schemaToEdges(schema)).map((edge) => ({
        ...edge,
        data: { ...edge.data, hovered: edge.id === hoveredEdgeId },
      })),
    [schema, viewMode, hoveredEdgeId],
  )

  function handleConnect(connection: Connection) {
    if (!connection.sourceHandle?.startsWith('field-') || !connection.targetHandle?.startsWith('field-')) return
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
      if (!connection.sourceHandle?.startsWith('field-') || !connection.targetHandle?.startsWith('field-')) return false
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
    <div className="dot-grid h-full w-full bg-canvas">
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
        <Background color="transparent" gap={24} />
        <CrowfootMarkerDefs />
        <Panel position="top-left" className="flex gap-2">
          <input
            value={newTableName}
            onChange={(e) => setNewTableName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddTable()}
            placeholder="New table name"
            className="rounded border border-line bg-surface px-2 py-1 text-sm text-ink placeholder:text-ink-faint outline-none focus-visible:border-accent"
          />
          <Button onClick={handleAddTable} size="sm">
            <Plus size={14} />
            Add table
          </Button>
        </Panel>
        <Panel position="top-right" className="flex overflow-hidden rounded-md border border-line bg-surface">
          <button
            onClick={() => setViewMode('fields')}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 text-xs',
              viewMode === 'fields' ? 'bg-surface-raised text-ink' : 'text-ink-muted hover:text-ink',
            )}
            title="Field view — shows how individual fields connect"
          >
            <Rows3 size={13} />
            Fields
          </button>
          <button
            onClick={() => setViewMode('relations')}
            className={cn(
              'flex items-center gap-1.5 border-l border-line px-2.5 py-1.5 text-xs',
              viewMode === 'relations' ? 'bg-surface-raised text-ink' : 'text-ink-muted hover:text-ink',
            )}
            title="Relation view — one line per table pair, with cardinality"
          >
            <Waypoints size={13} />
            Relations
          </button>
        </Panel>
      </ReactFlow>
    </div>
  )
}
