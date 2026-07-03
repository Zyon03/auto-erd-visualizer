/** The app's one shared "something is loading" motif — a staggered three-dot pulse. Used both
 *  full-screen (RouteLoadingScreen, for a genuinely empty view) and as a small overlay indicator
 *  (SessionSwitchOverlay, over content that's still on screen), so the two loading moments read
 *  as the same idea at different scales rather than two unrelated animations. */
export function DotPulse({ size = 8 }: { size?: number }) {
  const dotStyle = { width: size, height: size }
  return (
    <div className="flex items-center gap-1.5">
      <span className="rounded-full bg-accent [animation:dot-pulse_1.2s_ease-in-out_infinite]" style={dotStyle} />
      <span
        className="rounded-full bg-accent [animation:dot-pulse_1.2s_ease-in-out_infinite] [animation-delay:150ms]"
        style={dotStyle}
      />
      <span
        className="rounded-full bg-accent [animation:dot-pulse_1.2s_ease-in-out_infinite] [animation-delay:300ms]"
        style={dotStyle}
      />
    </div>
  )
}
