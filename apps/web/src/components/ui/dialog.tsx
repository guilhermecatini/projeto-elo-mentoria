import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motionDuration, reducedMotionQuery } from '../../lib/motion';

/** Let conditional dialog owners unmount only after the shared closing effect. */
export function useDialogDismiss(onClose: () => void) {
  const [closing, setClosing] = useState(false);
  const latestClose = useRef(onClose);
  useEffect(() => { latestClose.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!closing) return;
    const duration = matchMedia(reducedMotionQuery).matches ? 0 : motionDuration('--motion-fast', 120);
    const timeout = setTimeout(() => latestClose.current(), duration);
    return () => clearTimeout(timeout);
  }, [closing]);
  return { open: !closing, dismiss: () => setClosing(true) };
}

export function Dialog({ open, onOpenChange, title, description, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string; children: ReactNode }) {
  const returnFocus = useRef<HTMLElement | null>(null);
  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
    <DialogPrimitive.Portal><DialogPrimitive.Overlay className="dialog-overlay" /><DialogPrimitive.Content className="dialog-content"
      onOpenAutoFocus={() => { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
      onCloseAutoFocus={event => {
        const target = returnFocus.current;
        if (target?.isConnected && target !== document.body && !target.matches(':disabled')) {
          event.preventDefault();
          target.focus({ preventScroll: true });
        }
      }}>
      <DialogPrimitive.Title className="dialog-title">{title}</DialogPrimitive.Title>
      <DialogPrimitive.Description className={description ? 'dialog-description' : 'sr-only'}>{description || title}</DialogPrimitive.Description>
      {children}<DialogPrimitive.Close className="dialog-close" aria-label="Fechar"><X size={19} /></DialogPrimitive.Close>
    </DialogPrimitive.Content></DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}
