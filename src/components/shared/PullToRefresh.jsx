// src/components/shared/PullToRefresh.jsx
// Pull the page down from the very top to reload it (touch screens only).
// The app disables the browser's own pull-to-refresh (overscroll-behavior: none)
// so a stray swipe can't wipe a half-written form; this does it deliberately instead:
//  - only starts when the page is scrolled to the top
//  - ignores touches that start in a text box / dropdown / pop-up
//  - asks first if there is unsaved typing on the page
import React, { useEffect, useState } from 'react';

const THRESHOLD = 70;   // px of pull needed to trigger
const MAX_PULL  = 110;

export default function PullToRefresh({ scrollRef }) {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const el = scrollRef?.current;
    if (!el) return undefined;
    let startY = null;
    let startX = 0;
    let dist = 0;

    const reset = () => { startY = null; dist = 0; setPull(0); };

    const onStart = (e) => {
      if (e.touches.length !== 1 || el.scrollTop > 0) { startY = null; return; }
      if (e.target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], .modal, .modal-overlay, .modal-backdrop')) { startY = null; return; }
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      dist = 0;
    };

    const onMove = (e) => {
      if (startY == null) return;
      const dy = e.touches[0].clientY - startY;
      const dx = Math.abs(e.touches[0].clientX - startX);
      if (el.scrollTop > 0 || dy <= 0 || dx > dy) { if (dist) reset(); else if (dy <= 0) startY = null; return; }
      dist = Math.min(MAX_PULL, dy * 0.5);
      setPull(dist);
    };

    const onEnd = () => {
      if (startY == null) return;
      const fire = dist >= THRESHOLD;
      if (!fire) { reset(); return; }
      const typed = Array.from(el.querySelectorAll('textarea, input:not([type=checkbox]):not([type=radio]):not([type=search]):not([type=button]):not([type=submit])'))
        .some(i => (i.value || '').trim() !== '');
      if (typed && !window.confirm('Reload the page? Anything you typed and have not saved will be lost.')) { reset(); return; }
      setBusy(true);
      setPull(THRESHOLD);
      window.location.reload();
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: true });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', reset, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', reset);
    };
  }, [scrollRef]);

  if (pull <= 0 && !busy) return null;
  const ready = pull >= THRESHOLD;
  return (
    <div aria-hidden="true" style={{
      position: 'fixed', left: 0, right: 0, top: 'env(safe-area-inset-top, 0px)', zIndex: 300,
      display: 'flex', justifyContent: 'center', pointerEvents: 'none',
      transform: `translateY(${Math.max(0, pull - 36)}px)`, opacity: Math.min(1, pull / THRESHOLD),
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%', background: 'var(--card-bg, #fff)',
        boxShadow: '0 2px 10px rgba(0,0,0,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: ready ? 'var(--accent, #2563eb)' : 'var(--t3, #64748b)',
      }}>
        <i className="ti ti-refresh" style={{
          fontSize: 20,
          transform: busy ? undefined : `rotate(${pull * 3}deg)`,
          animation: busy ? 'ptr-spin .8s linear infinite' : 'none',
        }} />
      </div>
      <style>{'@keyframes ptr-spin{to{transform:rotate(360deg)}}'}</style>
    </div>
  );
}
