// "Explain this diagram": turns a drawing into a structured text description (markdown or JSON) that any AI
// can read. Used by the `describe_diagram` MCP/chat tool and the "Copy diagram description" menu item.
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

type El = ExcalidrawElement;
const SHAPES = new Set(["rectangle", "ellipse", "diamond", "image", "frame", "magicframe", "embeddable", "iframe"]);

export interface DiagramNode {
  id: string;
  kind: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  group?: string;
  frame?: string;
  fill?: string;
}
export interface DiagramEdge {
  id: string;
  from: string | null;
  to: string | null;
  label?: string;
  directed: "forward" | "backward" | "both" | "none";
  kind: "arrow" | "line";
}
export interface DiagramModel {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  notes: { id: string; text: string; x: number; y: number }[];
  freehand: number;
  bounds: { x: number; y: number; w: number; h: number } | null;
}

const r = Math.round;
const clean = (s: string) => s.replace(/\s+/g, " ").trim();

export function buildModel(all: readonly El[]): DiagramModel {
  const els = all.filter((e) => !e.isDeleted);
  const boundText = new Map<string, string>();
  for (const e of els) if (e.type === "text" && e.containerId) boundText.set(e.containerId, clean(e.originalText ?? e.text));

  const frames = new Map(els.filter((e) => e.type === "frame" || e.type === "magicframe").map((e) => [e.id, (e as { name?: string | null }).name || "Frame"]));
  const nodes: DiagramNode[] = [];
  for (const e of els) {
    if (!SHAPES.has(e.type)) continue;
    nodes.push({
      id: e.id,
      kind: e.type === "diamond" ? "decision/diamond" : e.type,
      label: e.type === "frame" || e.type === "magicframe" ? String(frames.get(e.id)) : boundText.get(e.id) ?? "",
      x: r(e.x), y: r(e.y), w: r(e.width), h: r(e.height),
      group: e.groupIds.length ? e.groupIds[e.groupIds.length - 1] : undefined,
      frame: e.frameId ? frames.get(e.frameId) : undefined,
      fill: e.backgroundColor !== "transparent" ? e.backgroundColor : undefined,
    });
  }
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // arrow endpoint -> shape: use the binding, else the nearest shape within 40px
  const near = (px: number, py: number): string | null => {
    let best: string | null = null;
    let bestD = 40;
    for (const n of nodes) {
      if (n.kind === "frame" || n.kind === "magicframe") continue;
      const dx = Math.max(n.x - px, 0, px - (n.x + n.w));
      const dy = Math.max(n.y - py, 0, py - (n.y + n.h));
      const d = Math.hypot(dx, dy);
      if (d < bestD) { bestD = d; best = n.id; }
    }
    return best;
  };

  const edges: DiagramEdge[] = [];
  for (const e of els) {
    if (e.type !== "arrow" && e.type !== "line") continue;
    const pts = (e as { points: readonly [number, number][] }).points;
    if (!pts?.length) continue;
    const first = pts[0], last = pts[pts.length - 1];
    const a = e as { startBinding?: { elementId: string } | null; endBinding?: { elementId: string } | null; startArrowhead?: string | null; endArrowhead?: string | null };
    const from = a.startBinding?.elementId ?? near(e.x + first[0], e.y + first[1]);
    const to = a.endBinding?.elementId ?? near(e.x + last[0], e.y + last[1]);
    // lines that touch no shape are just drawings
    if (!from && !to && e.type === "line") continue;
    const sh = !!a.startArrowhead, eh = !!a.endArrowhead;
    edges.push({
      id: e.id,
      from: from && nodeById.has(from) ? from : null,
      to: to && nodeById.has(to) ? to : null,
      label: boundText.get(e.id),
      directed: sh && eh ? "both" : eh ? "forward" : sh ? "backward" : e.type === "arrow" ? "forward" : "none",
      kind: e.type,
    });
  }

  const notes = els
    .filter((e) => e.type === "text" && !e.containerId)
    .map((e) => ({ id: e.id, text: clean((e as { originalText?: string }).originalText ?? (e as { text: string }).text), x: r(e.x), y: r(e.y) }))
    .filter((n) => n.text);
  const freehand = els.filter((e) => e.type === "freedraw").length;

  let bounds: DiagramModel["bounds"] = null;
  if (els.length) {
    const minX = Math.min(...els.map((e) => e.x)), minY = Math.min(...els.map((e) => e.y));
    const maxX = Math.max(...els.map((e) => e.x + e.width)), maxY = Math.max(...els.map((e) => e.y + e.height));
    bounds = { x: r(minX), y: r(minY), w: r(maxX - minX), h: r(maxY - minY) };
  }
  return { nodes, edges, notes, freehand, bounds };
}

const short = (id: string) => id.slice(0, 6);

export function describeMarkdown(all: readonly El[], title?: string): string {
  const m = buildModel(all);
  if (!m.nodes.length && !m.notes.length && !m.freehand) return "The canvas is empty.";
  const name = (id: string | null) => {
    if (!id) return "(nothing / open end)";
    const n = m.nodes.find((x) => x.id === id)!;
    return n.label ? `"${n.label}"` : `an unlabeled ${n.kind} [${short(n.id)}]`;
  };
  const out: string[] = [];
  out.push(`# Diagram${title ? `: ${title}` : ""}`);
  const labeled = m.nodes.filter((n) => n.label && n.kind !== "frame" && n.kind !== "magicframe").length;
  out.push(
    `${m.nodes.length} shapes (${labeled} labeled), ${m.edges.length} connections, ${m.notes.length} free text note(s)` +
      (m.freehand ? `, ${m.freehand} freehand stroke(s)` : "") +
      (m.bounds ? `. Canvas extent ${m.bounds.w}×${m.bounds.h}px.` : ".")
  );

  // overall direction of flow
  const dirs = m.edges.filter((e) => e.from && e.to && e.directed !== "none").map((e) => {
    const a = m.nodes.find((n) => n.id === e.from)!, b = m.nodes.find((n) => n.id === e.to)!;
    return { dx: b.x - a.x, dy: b.y - a.y };
  });
  if (dirs.length >= 2) {
    const h = dirs.filter((d) => Math.abs(d.dx) > Math.abs(d.dy)).length;
    const v = dirs.length - h;
    out.push(`Flow reads mostly ${h >= v ? "left-to-right/right-to-left (horizontal)" : "top-to-bottom (vertical)"}.`);
  }

  const frames = m.nodes.filter((n) => n.kind === "frame" || n.kind === "magicframe");
  if (frames.length) {
    out.push("\n## Frames (slides/sections)");
    for (const f of frames) {
      const kids = m.nodes.filter((n) => n.frame === f.label && n.id !== f.id).map((n) => n.label || n.kind);
      out.push(`- **${f.label}**${kids.length ? `: contains ${kids.map((k) => `"${k}"`).join(", ")}` : ""}`);
    }
  }

  const shapes = m.nodes.filter((n) => n.kind !== "frame" && n.kind !== "magicframe");
  if (shapes.length) {
    out.push("\n## Shapes (reading order: top to bottom, then left to right)");
    const rows = [...shapes].sort((a, b) => a.y - b.y || a.x - b.x);
    rows.forEach((n, i) =>
      out.push(`${i + 1}. [${short(n.id)}] ${n.kind}${n.label ? ` "${n.label}"` : " (no label)"} at (${n.x}, ${n.y}) size ${n.w}×${n.h}${n.fill ? `, fill ${n.fill}` : ""}${n.group ? `, group ${short(n.group)}` : ""}`)
    );
  }

  if (m.edges.length) {
    out.push("\n## Connections");
    for (const e of m.edges) {
      const arrow = e.directed === "forward" ? "→" : e.directed === "backward" ? "←" : e.directed === "both" ? "↔" : "—";
      out.push(`- ${name(e.from)} ${arrow} ${name(e.to)}${e.label ? ` (label: "${e.label}")` : ""}`);
    }
    // nodes with no connection
    const used = new Set(m.edges.flatMap((e) => [e.from, e.to]));
    const loose = shapes.filter((n) => !used.has(n.id) && n.label);
    if (loose.length) out.push(`\nNot connected to anything: ${loose.map((n) => `"${n.label}"`).join(", ")}.`);

    // simple structure hints
    const indeg = new Map<string, number>(), outdeg = new Map<string, number>();
    for (const e of m.edges) {
      if (e.from && e.to && e.directed !== "none") {
        outdeg.set(e.from, (outdeg.get(e.from) ?? 0) + 1);
        indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
      }
    }
    const starts = shapes.filter((n) => (outdeg.get(n.id) ?? 0) > 0 && !(indeg.get(n.id) ?? 0));
    const ends = shapes.filter((n) => (indeg.get(n.id) ?? 0) > 0 && !(outdeg.get(n.id) ?? 0));
    const branches = shapes.filter((n) => (outdeg.get(n.id) ?? 0) > 1);
    if (starts.length) out.push(`Entry points (no incoming arrows): ${starts.map((n) => name(n.id)).join(", ")}.`);
    if (ends.length) out.push(`End points (no outgoing arrows): ${ends.map((n) => name(n.id)).join(", ")}.`);
    if (branches.length) out.push(`Branching shapes: ${branches.map((n) => `${name(n.id)} (${outdeg.get(n.id)} outgoing)`).join(", ")}.`);
  }

  if (m.notes.length) {
    out.push("\n## Free text");
    m.notes.forEach((n) => out.push(`- "${n.text}" at (${n.x}, ${n.y})`));
  }
  out.push("\n_IDs in square brackets are the first 6 characters of the element id; use get_canvas for full ids before editing._");
  return out.join("\n");
}

export function describeJson(all: readonly El[]): string {
  return JSON.stringify(buildModel(all));
}
