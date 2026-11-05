import { useCallback, type RefCallback } from 'react';
import { enterRegion } from './motion';

export function useMotionRegion(key: string, variant: 'page' | 'content' = 'content'): RefCallback<HTMLElement> {
  // A new callback replays the entrance on the same DOM node when this view changes.
  // React also invokes it when async content replaces a loading placeholder.
  return useCallback((element: HTMLElement | null) => {
    if (element) return enterRegion(element, variant);
  }, [key, variant]);
}
