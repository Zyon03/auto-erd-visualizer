import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import {
  ReactFlow,
  Background,
  Panel,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Plus } from 'lucide-react'
import { TableNode } from './TableNode'
import { RelationshipEdge } from './RelationshipEdge'
import { TableRelationEdge, CrowfootMarkerDefs } from './TableRelationEdge'
import { TableListPanel } from './TableListPanel'
import { schemaToNodesWithReuse, schemaToEdges, schemaToTableEdges } from './schemaToFlow'
import { Button } from '../ui/button'
import type { FullSchema } from '../../mutations/getFullSchema'
import type { TableRole } from '../../mutations/tableRole'
import type { TableNodeType } from './TableNode'

const nodeTypes = { table: TableNode }
const edgeTypes = { relationship: RelationshipEdge, tableRelation: TableRelationEdge }

export type ViewMode = 'fields' | 'relations'

export interface ErdCanvasProps {
  schema: FullSchema
  /** Tables with a `createdAt` after this get a "New" badge — the last time this browser
   *  visited this session, so it reflects what changed since you were last looking. */
  newSinceThreshold: string
  /** Owned by the route (routes/sessions.$sessionId.tsx), not local state here — SessionTopbar's
   *  Fields/Relations toggle lives outside this component now, as a sibling under the shared
   *  <ReactFlowProvider>, so both need to read/drive the same value. */
  viewMode: ViewMode
  onAddTable: (name: string) => void
  onAddField: (tableId: number, name: string, type: string) => void
  onConnect: (fromFieldId: number, toFieldId: number) => void
  onRenameTable: (tableId: number, name: string) => void
  onRenameField: (fieldId: number, name: string) => void
  onUpdateFieldType: (fieldId: number, type: string) => void
  onDeleteTable: (tableId: number) => void
  onDeleteField: (fieldId: number) => void
  onMoveTable: (tableId: number, positionX: number, positionY: number) => void
  onSetTableRole: (tableId: number, role: TableRole | null) => void
}

/** Pans/zooms to a single table, e.g. after picking it from the table list — `nonce` (not just
 *  tableId) so clicking the same list entry twice in a row re-triggers the jump even though the
 *  id didn't change. */
function FocusTableOnSelect({ target }: { target: { tableId: number; nonce: number } | null }) {
  const { fitView } = useReactFlow()
  useEffect(() => {
    if (!target) return
    fitView({ nodes: [{ id: String(target.tableId) }], duration: 400, maxZoom: 1.25 })
  }, [target, fitView])
  return null
}

export function ErdCanvas({
  schema,
  newSinceThreshold,
  viewMode,
  onAddTable,
  onAddField,
  onConnect,
  onRenameTable,
  onRenameField,
  onUpdateFieldType,
  onDeleteTable,
  onDeleteField,
  onMoveTable,
  onSetTableRole,
}: ErdCanvasProps) {
  const [newTableName, setNewTableName] = useState('')
  const [focusTarget, setFocusTarget] = useState<{ tableId: number; nonce: number } | null>(null)
  // Carries node objects across renders so schemaToNodesWithReuse can hand back the exact same
  // object for a table whose content didn't actually change — see that function's doc comment
  // for why this matters (React Flow only re-renders a node when its own data reference changes,
  // so without this every edit anywhere would re-render every table, not just the edited one).
  const previousNodesRef = useRef<Map<string, TableNodeType>>(new Map())
  const baseNodes = useMemo(() => {
    const built = schemaToNodesWithReuse(schema, previousNodesRef.current, {
      onAddField,
      onRenameTable,
      onRenameField,
      onUpdateFieldType,
      onDeleteTable,
      onDeleteField,
      onSetTableRole,
      hideFieldHandles: viewMode === 'relations',
      newSinceThreshold,
    })
    previousNodesRef.current = new Map(built.map((node) => [node.id, node]))
    return built
  }, [
    schema,
    onAddField,
    onRenameTable,
    onRenameField,
    onUpdateFieldType,
    onDeleteTable,
    onDeleteField,
    onSetTableRole,
    viewMode,
    newSinceThreshold,
  ])
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

  // Both ends of a hovered relationship, not just the line itself — an edge's `source`/`target`
  // are always table ids regardless of view mode (schemaToEdges resolves field-level relationships
  // back to their owning table). Kept as a separate overlay on top of `nodes` rather than folded
  // into baseNodes/nodes directly: those feed the full node-replace sync effect above, and
  // recomputing them on every hover would wipe out `selected` (see handleSelectTable) each time.
  const highlightedTableIds = useMemo(() => {
    const edge = edges.find((e) => e.id === hoveredEdgeId)
    return edge ? new Set([edge.source, edge.target]) : null
  }, [edges, hoveredEdgeId])
  const displayNodes = useMemo(
    () =>
      nodes.map((node) => {
        const isHighlighted = highlightedTableIds?.has(node.id) ?? false
        // React Flow re-renders a node only when its own data object reference changes (it reads
        // each node from an internal store keyed by id, via a shallow-compared selector — not by
        // diffing this whole array). Reusing the same node/data object for everything except the
        // (at most two) tables whose highlight actually flipped means hovering a relationship
        // doesn't force every other table on the canvas to re-render along with it.
        if ((node.data.highlighted ?? false) === isHighlighted) return node
        return { ...node, data: { ...node.data, highlighted: isHighlighted } }
      }),
    [nodes, highlightedTableIds],
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

  function handleSelectTable(tableId: number) {
    const targetId = String(tableId)
    setNodes((current) => current.map((n) => (n.selected === (n.id === targetId) ? n : { ...n, selected: n.id === targetId })))
    setFocusTarget({ tableId, nonce: Date.now() })
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
        nodes={displayNodes}
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
        minZoom={0.05}
        onlyRenderVisibleElements
      >
        <FocusTableOnSelect target={focusTarget} />
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
        <Panel position="bottom-left">
          <TableListPanel tables={schema.tables} onSelectTable={handleSelectTable} onSetTableRole={onSetTableRole} />
        </Panel>
      </ReactFlow>
    </div>
  )
}
