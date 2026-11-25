// Sketch-to-clean: recognise hand-drawn (freedraw) strokes as rectangles, ellipses, diamonds, lines or arrows
// and replace them with real, tidy elements. Recognition is deliberately strict: if a stroke does not clearly
// match a shape it is left untouched.
import { CaptureUpdateAction, convertToExcalidrawElements, newElementWith } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

type P = [number, number];
export type Recognised =
  | { kind: "rectangle" | "ellipse" | "diamond"; x: number; y: number; w: number; h: number }
  | { kind: "arrow" | "line"; from: P; to: P };

const dist = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;

export function recognise(abs: P[]): Recognised | null {
  if (abs.length < 6) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of abs) {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  const w = maxX - minX, h = maxY - minY, diag = Math.hypot(w, h);
  if (diag < 24) return null;
  const first = abs[0], last = abs[abs.length - 1];

  const closed = dist(first, last) < Math.max(0.22 * diag, 14);
  if (!closed) {
    // straight stroke?
    const len = dist(first, last);
    if (len < 30) return null;
    const [x1, y1] = first, [x2, y2] = last;
    const dev = Math.max(...abs.map(([x, y]) => Math.abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1) / len));
    return dev < 0.07 * len ? { kind: "arrow", from: first, to: last } : null;
  }
  if (w < 20 || h < 20) return null;

  const cx = minX + w / 2, cy = minY + h / 2, a = w / 2, b = h / 2;
  const ellipse = mean(abs.map(([x, y]) => Math.abs(Math.sqrt(((x - cx) / a) ** 2 + ((y - cy) / b) ** 2) - 1)));
  const rectS = mean(abs.map(([x, y]) => Math.min(x - minX, maxX - x, y - minY, maxY - y) / Math.max(w, h)));
  const diamond = mean(abs.map(([x, y]) => Math.abs(Math.abs(x - cx) / a + Math.abs(y - cy) / b - 1)));

  const cands = [
    { kind: "ellipse" as const, ratio: ellipse / 0.1 },
    { kind: "rectangle" as const, ratio: rectS / 0.05 },
    { kind: "diamond" as const, ratio: diamond / 0.1 },
  ].sort((p, q) => p.ratio - q.ratio);
  if (cands[0].ratio >= 1) return null;
  return { kind: cands[0].kind, x: minX, y: minY, w, h };
}

function toSkeleton(r: Recognised, style: Record<string, unknown>) {
  if (r.kind === "arrow" || r.kind === "line")
    return { type: r.kind, x: r.from[0], y: r.from[1], points: [[0, 0], [r.to[0] - r.from[0], r.to[1] - r.from[1]]], ...style };
  const b = r as Extract<Recognised, { w: number }>;
  return { type: b.kind, x: b.x, y: b.y, width: b.w, height: b.h, ...style };
}

/** Convert the given freedraw elements (ids) into clean shapes. Returns how many were converted. */
export function cleanUpStrokes(api: ExcalidrawImperativeAPI, ids: Set<string>): number {
  const all = api.getSceneElements();
  const made: ExcalidrawElement[] = [];
  const replaced = new Set<string>();
  for (const e of all) {
    if (e.isDeleted || e.type !== "freedraw" || !ids.has(e.id)) continue;
    const abs = (e.points as readonly [number, number][]).map(([px, py]) => [e.x + px, e.y + py] as P);
    const rec = recognise(abs);
    if (!rec) continue;
    const style = {
      strokeColor: e.strokeColor,
      backgroundColor: e.backgroundColor,
      fillStyle: e.fillStyle,
      strokeWidth: e.strokeWidth,
      strokeStyle: e.strokeStyle,
      roughness: e.roughness,
      opacity: e.opacity,
      ...(rec.kind === "rectangle" ? { roundness: { type: 3 } } : {}),
    };
    made.push(...(convertToExcalidrawElements([toSkeleton(rec, style)] as never) as ExcalidrawElement[]));
    replaced.add(e.id);
  }
  if (!replaced.size) return 0;
  const next = all.map((e) => (replaced.has(e.id) ? newElementWith(e, { isDeleted: true }) : e));
  api.updateScene({
    elements: [...next, ...made],
    appState: { selectedElementIds: Object.fromEntries(made.map((m) => [m.id, true])) },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  return replaced.size;
}
