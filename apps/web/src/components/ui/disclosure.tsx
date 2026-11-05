import { useEffect, useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { motionDuration, reducedMotionQuery } from '../../lib/motion';

export function Collapse({ open, children, id, className = '', keepMounted = false }: { open: boolean; children: ReactNode; id?: string; className?: string; keepMounted?: boolean }) {
  const [present, setPresent] = useState(open);
  useEffect(() => {
    if (open) { setPresent(true); return; }
    const delay = matchMedia(reducedMotionQuery).matches ? 0 : motionDuration('--motion-expand', 220);
    const timeout = setTimeout(() => setPresent(false), delay);
    return () => clearTimeout(timeout);
  }, [open]);
  return <div id={id} className="motion-collapse" data-open={open} aria-hidden={!open} inert={!open}>
    <div className="motion-collapse-inner">{(keepMounted || open || present) && <div className={className}>{children}</div>}</div>
  </div>;
}

export function Disclosure({ title, children, defaultOpen = false, className = '' }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean; className?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return <div className={className} data-open={open}>
    <button type="button" className="disclosure-trigger" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}><span>{title}</span><ChevronDown size={16} /></button>
    <Collapse open={open} id={id} keepMounted>{children}</Collapse>
  </div>;
}
