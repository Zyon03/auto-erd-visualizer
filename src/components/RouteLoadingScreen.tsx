import { DotPulse } from './DotPulse'

/** Shown while a route's loader is in flight and there's no previous view to fall back to (a
 *  cold/direct navigation into a route). Reuses `.dot-grid`, the same faint drafting-table
 *  texture behind the ERD canvas, so the loading screen visually previews what's about to
 *  appear. For navigating *between* two already-loaded sessions specifically, see
 *  SessionSwitchOverlay in routes/sessions.$sessionId.tsx — that one keeps the current canvas on
 *  screen (blurred) instead of replacing it with this, since there's already something to look
 *  at in that case. */
export function RouteLoadingScreen() {
  return (
    <div className="dot-grid flex h-full w-full items-center justify-center bg-canvas" role="status" aria-label="Loading">
      <DotPulse />
    </div>
  )
}
