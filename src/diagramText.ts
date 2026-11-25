// Diagram from text, no AI involved: Mermaid (via the bundled converter) and indented outlines (own layout).
import { CaptureUpdateAction, convertToExcalidrawElements, newElementWith } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { repairFlowchart, stripBreaks, stripFences } from "./mermaid";

type Sk = Record<string, unknown>;

export const MERMAID_START = /^\s*(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram|gantt|pie|journey|gitGraph|mindmap|timeline)\b/;
export const looksLikeMermaid = (t: string) => MERMAID_START.test(t.replace(/^\s*```(?:mermaid)?\s*/i, ""));

export const EXAMPLES = {
  flowchart: "flowchart TD\n  A[Start] --> B{Logged in?}\n  B -- Yes --> C[Show dashboard]\n  B -- No --> D[Login page]\n  D --> B",
  sequence: "sequenceDiagram\n  participant U as User\n  participant A as App\n  participant S as Server\n  U->>A: Click save\n  A->>S: POST /save\n  S-->>A: 200 OK\n  A-->>U: Saved",
  outline: "Product launch\n  Marketing\n    Landing page\n    Email campaign\n  Engineering\n    Fix blockers\n    Release build\n  Support\n    Update docs",
};

/** Mermaid -> elements (not yet inserted). */
export async function mermaidToElements(src: string): Promise<{ elements: ExcalidrawElement[]; files: unknown }> {
  const { parseMermaidToExcalidraw } = await import("@excalidraw/mermaid-to-excalidraw");
  const clean = repairFlowchart(stripBreaks(stripFences(src)));
  const { elements, files } = await parseMermaidToExcalidraw(clean);
  return { elements: convertToExcalidrawElements(elements, { regenerateIds: true }) as ExcalidrawElement[], files };
}

// ------------------------------------------------------------------ outline
interface ONode {
  id: string;
  text: string;
  depth: number;
  children: ONode[];
  pos: number;
  w: number;
}
export type OutlineDir = "right" | "down";

const FILLS = ["#d0bfff", "#a5d8ff", "#b2f2bb", "#ffec99", "#ffd8a8", "#eebefa"];
const STROKES = ["#6741d9", "#1971c2", "#2f9e44", "#f08c00", "#e8590c", "#c2255c"];

export function parseOutline(text: string): ONode[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const roots: ONode[] = [];
  const stack: { indent: number; node: ONode }[] = [];
  let n = 0;
  for (const raw of lines) {
    const indent = raw.match(/^[ \t]*/)![0].replace(/\t/g, "    ").length;
    const label = raw.trim().replace(/^([-*•+]|\d+[.)])\s+/, "").trim();
    if (!label) continue;
    const node: ONode = { id: `o${++n}`, text: label, depth: 0, children: [], pos: 0, w: Math.min(260, Math.max(110, label.length * 8.5 + 36)) };
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    if (stack.length) {
      const parent = stack[stack.length - 1].node;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else roots.push(node);
    stack.push({ indent, node });
  }
  return roots;
}

export function outlineToSkeletons(text: string, dir: OutlineDir = "right"): Sk[] {
  let roots = parseOutline(text);
  if (!roots.length) throw new Error("Type or paste an indented list first.");
  if (roots.length > 1) {
    // several top-level lines: hang them under an invisible-free common root
    const root: ONode = { id: "o0", text: "Overview", depth: 0, children: roots, pos: 0, w: 130 };
    const bump = (n: ONode) => { n.depth++; n.children.forEach(bump); };
    roots.forEach(bump);
    roots = [root];
  }
  const all: ONode[] = [];
  const walk = (n: ONode) => { all.push(n); n.children.forEach(walk); };
  walk(roots[0]);
  if (all.length > 300) throw new Error("That outline has more than 300 items. Split it up.");

  let leaf = 0;
  const place = (n: ONode): void => {
    if (!n.children.length) { n.pos = leaf++; return; }
    n.children.forEach(place);
    n.pos = (n.children[0].pos + n.children[n.children.length - 1].pos) / 2;
  };
  place(roots[0]);

  const H = 48, GAP_X = 90, ROW = 66, COL = 210, GAP_Y = 80;
  const maxDepth = Math.max(...all.map((n) => n.depth));
  const levelW: number[] = Array(maxDepth + 1).fill(0);
  all.forEach((n) => (levelW[n.depth] = Math.max(levelW[n.depth], n.w)));
  const levelX: number[] = [];
  levelW.reduce((x, w, i) => ((levelX[i] = x), x + w + GAP_X), 0);

  const geo = new Map<string, { x: number; y: number; w: number; h: number }>();
  for (const n of all) {
    if (dir === "right") geo.set(n.id, { x: levelX[n.depth], y: n.pos * ROW, w: levelW[n.depth], h: H });
    else geo.set(n.id, { x: n.pos * COL - n.w / 2, y: n.depth * (H + GAP_Y), w: n.w, h: H });
  }

  const out: Sk[] = [];
  for (const n of all) {
    const g = geo.get(n.id)!;
    out.push({
      type: "rectangle", id: n.id, x: g.x, y: g.y, width: g.w, height: g.h,
      roundness: { type: 3 }, backgroundColor: FILLS[n.depth % FILLS.length], fillStyle: "solid", strokeColor: STROKES[n.depth % STROKES.length],
      label: { text: n.text, fontSize: n.depth === 0 ? 20 : 16 },
    });
  }
  for (const n of all) {
    const g = geo.get(n.id)!;
    for (const c of n.children) {
      const cg = geo.get(c.id)!;
      const [sx, sy, ex, ey] = dir === "right"
        ? [g.x + g.w, g.y + g.h / 2, cg.x, cg.y + cg.h / 2]
        : [g.x + g.w / 2, g.y + g.h, cg.x + cg.w / 2, cg.y];
      out.push({ type: "arrow", x: sx, y: sy, points: [[0, 0], [ex - sx, ey - sy]], start: { id: n.id }, end: { id: c.id }, strokeColor: "#868e96" });
    }
  }
  return out;
}

export function outlineToElements(text: string, dir: OutlineDir): ExcalidrawElement[] {
  return convertToExcalidrawElements(outlineToSkeletons(text, dir) as never, { regenerateIds: false }) as ExcalidrawElement[];
}

// ------------------------------------------------------------------ insertion
/** Insert elements centred in the current viewport (preserving their relative layout) and select them. */
export function insertCentered(api: ExcalidrawImperativeAPI, els: ExcalidrawElement[], files?: unknown) {
  if (!els.length) return;
  const minX = Math.min(...els.map((e) => e.x)), minY = Math.min(...els.map((e) => e.y));
  const maxX = Math.max(...els.map((e) => e.x + e.width)), maxY = Math.max(...els.map((e) => e.y + e.height));
  const a = api.getAppState();
  const cx = a.width / 2 / a.zoom.value - a.scrollX, cy = a.height / 2 / a.zoom.value - a.scrollY;
  const dx = cx - (minX + maxX) / 2, dy = cy - (minY + maxY) / 2;
  const moved = els.map((e) => newElementWith(e, { x: e.x + dx, y: e.y + dy }));
  if (files) api.addFiles(Object.values(files as Record<string, never>));
  api.updateScene({
    elements: [...api.getSceneElementsIncludingDeleted(), ...moved],
    appState: { selectedElementIds: Object.fromEntries(moved.map((m) => [m.id, true])) },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  api.scrollToContent(moved, { fitToViewport: true, viewportZoomFactor: 0.85, animate: true });
}
