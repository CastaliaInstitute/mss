/** Swipe up advances a month; swipe down returns to the previous month. */
export function monthSwipeDirection(dx: number, dy: number, elapsedMs: number): -1 | 0 | 1 {
  // Preserve taps, horizontal gestures, diagonal drags, and long presses.
  if (elapsedMs < 0 || elapsedMs > 900 || Math.abs(dy) < 64 || Math.abs(dy) < Math.abs(dx) * 1.5) return 0;
  return dy < 0 ? 1 : -1;
}
