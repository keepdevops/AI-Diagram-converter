// A small trigger button + floating panel that closes on outside-click or Esc.
// Used for the File menu and Settings in the top bar.

import { useEffect, useRef, useState } from 'react';

export default function Popover({ label, title, align = 'left', className = '', children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className={`popover-wrap ${className}`} ref={ref}>
      <button type="button" className={`popover-trigger${open ? ' on' : ''}`} title={title}
        aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {label}
      </button>
      {open && (
        <div className={`popover ${align}`} role="menu" onClick={(e) => e.stopPropagation()}>
          {typeof children === 'function' ? children(() => setOpen(false)) : children}
        </div>
      )}
    </div>
  );
}
