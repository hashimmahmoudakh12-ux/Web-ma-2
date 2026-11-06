"use client";
/**
 * iOS-style bottom sheet: slides up with a spring, frosted background,
 * drag handle, swipe down (or tap outside) to close.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function Sheet({ open, onClose, children, title }: { open: boolean; onClose: () => void; children: ReactNode; title?: string }) {
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<number | null>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  // Rendered at the end of <body> so nothing on the page can cover it.
  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <div className="animate-fade absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="glass-surface absolute inset-x-0 bottom-0 mx-auto max-h-[88dvh] max-w-lg overflow-y-auto rounded-t-[28px] px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2 shadow-2xl"
        style={{
          animation: drag ? undefined : "slide-up 0.45s var(--spring) both",
          transform: drag ? `translateY(${drag}px)` : undefined,
          transition: dragging ? undefined : "transform 0.3s var(--spring)",
        }}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("[data-sheet-handle]")) {
            start.current = e.clientY;
            setDragging(true);
          }
        }}
        onPointerMove={(e) => {
          if (start.current !== null) setDrag(Math.max(0, e.clientY - start.current));
        }}
        onPointerUp={() => {
          if (start.current !== null && drag > 120) onClose();
          start.current = null;
          setDragging(false);
          setDrag(0);
        }}
      >
        <div data-sheet-handle className="flex cursor-grab touch-none justify-center py-2">
          <div className="h-1.5 w-10 rounded-full bg-brand-muted/40" />
        </div>
        {title && <h2 className="mb-3 text-center text-lg font-semibold">{title}</h2>}
        {children}
      </div>
    </div>,
    document.body,
  );
}
