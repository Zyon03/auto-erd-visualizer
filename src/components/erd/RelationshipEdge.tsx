import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'

export function RelationshipEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })
  const typedData = data as { aiComment?: string; hovered?: boolean } | undefined
  const aiComment = typedData?.aiComment ?? ''
  const hovered = typedData?.hovered ?? false

  return (
    <>
      {/* interactionWidth widens the hit area BaseEdge renders internally so the whole
          curve (not just a point) triggers onEdgeMouseEnter/Leave on <ReactFlow>. */}
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        interactionWidth={20}
        style={{ stroke: '#5eead4', strokeWidth: hovered ? 3 : 2 }}
      />
      {hovered && aiComment && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              width: 'max-content',
              pointerEvents: 'none',
            }}
            className="bg-slate-900 border border-teal-400 text-slate-200 text-xs rounded px-2 py-1 max-w-[220px] shadow-lg z-10 whitespace-normal"
          >
            {aiComment}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
