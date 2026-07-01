import { useState } from 'react'
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
  const [hovered, setHovered] = useState(false)
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })
  const aiComment = (data as { aiComment?: string } | undefined)?.aiComment ?? ''

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={{ stroke: '#5eead4', strokeWidth: hovered ? 3 : 2 }} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
          }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <div className="w-10 h-6" />
          {hovered && aiComment && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-slate-900 border border-teal-400 text-slate-200 text-xs rounded px-2 py-1 max-w-[220px] shadow-lg z-10 whitespace-normal">
              {aiComment}
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
