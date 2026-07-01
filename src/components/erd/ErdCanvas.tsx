import { useMemo } from 'react'
import { ReactFlow, Background } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { TableNode } from './TableNode'
import { RelationshipEdge } from './RelationshipEdge'
import { schemaToNodes, schemaToEdges } from './schemaToFlow'
import type { FullSchema } from '../../mutations/getFullSchema'

const nodeTypes = { table: TableNode }
const edgeTypes = { relationship: RelationshipEdge }

export interface ErdCanvasProps {
  schema: FullSchema
}

export function ErdCanvas({ schema }: ErdCanvasProps) {
  const nodes = useMemo(() => schemaToNodes(schema), [schema])
  const edges = useMemo(() => schemaToEdges(schema), [schema])

  return (
    <div className="h-full w-full bg-slate-950">
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} fitView>
        <Background color="#1e293b" gap={24} />
      </ReactFlow>
    </div>
  )
}
