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
        style={{ stroke: 'var(--color-accent)', strokeWidth: hovered ? 2.5 : 1.5, opacity: hovered ? 1 : 0.7 }}
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
            className="max-w-[220px] whitespace-normal rounded border border-line bg-surface-raised px-2 py-1 text-xs text-ink shadow-lg z-10"
          >
            {aiComment}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
