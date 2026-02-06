// Mobile / touch detection utilities

export function isTouchDevice(): boolean {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

export type Orientation = 'portrait' | 'landscape';

export function getOrientation(): Orientation {
  return window.matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape';
}

export function onOrientationChange(callback: (orientation: Orientation) => void): () => void {
  const mql = window.matchMedia('(orientation: portrait)');

  const handler = () => {
    callback(mql.matches ? 'portrait' : 'landscape');
  };

  mql.addEventListener('change', handler);

  // Fallback: some older mobile browsers don't fire matchMedia change reliably
  window.addEventListener('resize', handler);

  // Return cleanup function
  return () => {
    mql.removeEventListener('change', handler);
    window.removeEventListener('resize', handler);
  };
}
