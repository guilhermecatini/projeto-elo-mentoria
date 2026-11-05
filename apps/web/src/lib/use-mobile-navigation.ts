import { useEffect, useState } from 'react';

export function useMobileNavigation() {
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(() => matchMedia('(max-width: 780px)').matches);
  useEffect(() => {
    const media = matchMedia('(max-width: 780px)');
    const update = () => { setMobile(media.matches); if (!media.matches) setOpen(false); };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!mobile || !open) return;
    const navigation = document.getElementById('workspace-navigation');
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const current = navigation?.querySelector<HTMLElement>('nav button.active') || navigation?.querySelector<HTMLElement>('nav button');
    current?.focus({ preventScroll: true });
    current?.scrollIntoView({ block: 'nearest' });
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
      if (event.key !== 'Tab' || !navigation) return;
      const controls = Array.from(navigation.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'));
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [mobile, open]);
  return { mobileOpen: open, setMobileOpen: setOpen, mobile };
}
