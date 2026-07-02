import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'
import type { Cardinality } from '../../mutations/relationships'

/** Crow's-foot-style end markers, shared across all edges via stable ids — declared once in
 *  ErdCanvas and referenced here by url(#...), rather than duplicated per edge instance. */
export function CrowfootMarkerDefs() {
  return (
    <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden>
      <defs>
        <marker id="crowfoot-one" viewBox="0 0 16 16" refX="14" refY="8" markerWidth="12" markerHeight="12" orient="auto">
          <path d="M11,2 L11,14" style={{ stroke: 'var(--color-accent)', strokeWidth: 1.5 }} fill="none" />
        </marker>
        <marker id="crowfoot-many" viewBox="0 0 16 16" refX="14" refY="8" markerWidth="14" markerHeight="14" orient="auto">
          <path
            d="M1,8 L15,1 M1,8 L15,8 M1,8 L15,15"
            style={{ stroke: 'var(--color-accent)', strokeWidth: 1.5 }}
            fill="none"
          />
        </marker>
      </defs>
    </svg>
  )
}

function markerForSide(cardinality: Cardinality, side: 'from' | 'to'): string {
  const isMany =
    cardinality === 'many-to-many' || (cardinality === 'one-to-many' && side === 'to')
  return isMany ? 'url(#crowfoot-many)' : 'url(#crowfoot-one)'
}

export function TableRelationEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })
  const typedData = data as { cardinality?: Cardinality; aiComments?: string[]; hovered?: boolean } | undefined
  const cardinality = typedData?.cardinality ?? 'one-to-many'
  const aiComments = typedData?.aiComments ?? []
  const hovered = typedData?.hovered ?? false

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerStart={markerForSide(cardinality, 'from')}
        markerEnd={markerForSide(cardinality, 'to')}
        interactionWidth={24}
        style={{ stroke: 'var(--color-accent)', strokeWidth: hovered ? 2.5 : 1.5, opacity: hovered ? 1 : 0.8 }}
      />
      {hovered && aiComments.length > 0 && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              width: 'max-content',
              pointerEvents: 'none',
            }}
            className="max-w-[240px] space-y-1 whitespace-normal rounded border border-line bg-surface-raised px-2 py-1 text-xs text-ink shadow-lg z-10"
          >
            {aiComments.map((comment, i) => (
              <p key={i} className="m-0">
                {comment}
              </p>
            ))}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
