import { useRef } from "react";

const KEY = "panel-w";
const DEFAULT_W = 380;
const MIN_W = 300;

const apply = (w: number) => document.documentElement.style.setProperty("--panel-w", `${w}px`);

/** Restore the saved right-panel width (call once at startup). */
export function initPanelWidth() {
  const w = Number(localStorage.getItem(KEY));
  apply(w >= MIN_W ? w : DEFAULT_W);
}

/** Drag handle on the left edge of a right-hand side panel. Double-click resets the width. */
export default function PanelResizer() {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      className="panel-resizer"
      title="Drag to resize (double-click to reset)"
      onDoubleClick={() => {
        apply(DEFAULT_W);
        localStorage.setItem(KEY, String(DEFAULT_W));
      }}
      onPointerDown={(e) => {
        const el = ref.current;
        const panel = el?.closest(".sidebar") as HTMLElement | null;
        if (!el || !panel) return;
        e.preventDefault();
        const right = panel.getBoundingClientRect().right;
        let last = Math.round(panel.getBoundingClientRect().width);
        el.setPointerCapture(e.pointerId);
        document.body.classList.add("panel-resizing");
        const move = (ev: PointerEvent) => {
          const max = Math.max(MIN_W, window.innerWidth - 320);
          last = Math.round(Math.min(max, Math.max(MIN_W, right - ev.clientX)));
          apply(last);
        };
        const up = () => {
          el.removeEventListener("pointermove", move);
          el.removeEventListener("pointerup", up);
          el.removeEventListener("pointercancel", up);
          document.body.classList.remove("panel-resizing");
          localStorage.setItem(KEY, String(last));
        };
        el.addEventListener("pointermove", move);
        el.addEventListener("pointerup", up);
        el.addEventListener("pointercancel", up);
      }}
    />
  );
}
