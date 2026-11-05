export const reducedMotionQuery = '(prefers-reduced-motion: reduce)';

/** Search, pagination and filters must not replay the page entrance while typing. */
export function navigationMotionKey(route: string): string {
  const [path, query] = route.split('?');
  const params = new URLSearchParams(query);
  return [path, ...['tab', 'version', 'edit'].map(key => params.get(key) || '')].join('|');
}

export function motionDuration(token: string, fallback: number): number {
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  const amount = Number.parseFloat(value);
  return Number.isFinite(amount) && amount >= 0 ? amount * (value.endsWith('ms') ? 1 : 1000) : fallback;
}

/** Animate the existing node: forms, focus and React state are never recreated. */
export function enterRegion(element: HTMLElement, variant: 'page' | 'content' = 'content'): () => void {
  const preference = matchMedia(reducedMotionQuery);
  if (preference.matches || typeof element.animate !== 'function') return () => {};
  const animation = element.animate(
    [{ opacity: 0.65, translate: `0 ${variant === 'page' ? 6 : 4}px` }, { opacity: 1, translate: '0 0' }],
    { duration: motionDuration(variant === 'page' ? '--motion-page' : '--motion', 180), easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
  );
  const detach = () => preference.removeEventListener('change', stop);
  const stop = () => { if (preference.matches) { detach(); animation.cancel(); } };
  preference.addEventListener('change', stop);
  animation.onfinish = detach;
  animation.oncancel = detach;
  return () => { detach(); animation.cancel(); };
}
