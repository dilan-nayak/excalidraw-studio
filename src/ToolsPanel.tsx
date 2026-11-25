import { useEffect, useMemo, useRef, useState } from "react";
import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  exportToSvg,
  newElementWith,
} from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { STENCILS, STENCIL_CATEGORIES, type Stencil } from "./stencils";
import { cleanUpStrokes } from "./sketch";
import { askText } from "./askText";

type Tab = "stencils" | "colors" | "layers" | "tidy";
const uid = () => "g" + Math.random().toString(36).slice(2, 11);

// ---------------------------------------------------------------- auto clean (runs even when the panel is closed)
export function useAutoClean(api: ExcalidrawImperativeAPI | null) {
  useEffect(() => {
    if (!api) return;
    const seen = new Set<string>(api.getSceneElements().filter((e) => e.type === "freedraw").map((e) => e.id));
    return api.onChange((els, appState) => {
      if (localStorage.getItem("autoclean") !== "1" || appState.newElement) return;
      const fresh = els.filter((e) => e.type === "freedraw" && !e.isDeleted && !seen.has(e.id));
      if (!fresh.length) return;
      fresh.forEach((e) => seen.add(e.id));
      cleanUpStrokes(api, new Set(fresh.map((e) => e.id)));
    });
  }, [api]);
}

// ---------------------------------------------------------------- stencils
const thumbCache = new Map<string, string>();

async function thumbFor(s: Stencil): Promise<string> {
  const hit = thumbCache.get(s.id);
  if (hit) return hit;
  const els = convertToExcalidrawElements(s.build() as never) as ExcalidrawElement[];
  const svg = await exportToSvg({ elements: els, files: null, appState: { exportBackground: false }, exportPadding: 6, skipInliningFonts: true });
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  const out = svg.outerHTML;
  thumbCache.set(s.id, out);
  return out;
}

function Thumb({ s }: { s: Stencil }) {
  const [html, setHtml] = useState(thumbCache.get(s.id) ?? "");
  useEffect(() => {
    let live = true;
    if (!html) thumbFor(s).then((h) => live && setHtml(h)).catch(() => {});
    return () => {
      live = false;
    };
  }, [s, html]);
  return <div className="stencil-thumb" dangerouslySetInnerHTML={{ __html: html }} />;
}

function viewportCenter(api: ExcalidrawImperativeAPI) {
  const a = api.getAppState();
  return { x: a.width / 2 / a.zoom.value - a.scrollX, y: a.height / 2 / a.zoom.value - a.scrollY };
}

function insertStencil(api: ExcalidrawImperativeAPI, s: Stencil) {
  const c = viewportCenter(api);
  const gid = uid();
  const made = (convertToExcalidrawElements(s.build() as never, { regenerateIds: true }) as ExcalidrawElement[]).map((e) =>
    newElementWith(e, { x: e.x + c.x, y: e.y + c.y, groupIds: [gid] })
  );
  api.updateScene({
    elements: [...api.getSceneElementsIncludingDeleted(), ...made],
    appState: { selectedElementIds: Object.fromEntries(made.map((m) => [m.id, true])), selectedGroupIds: { [gid]: true } },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
}

function StencilsTab({ api }: { api: ExcalidrawImperativeAPI | null }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return STENCILS.filter((s) => !t || `${s.name} ${s.keywords} ${s.category}`.toLowerCase().includes(t));
  }, [q]);
  return (
    <>
      <input className="tools-search" placeholder="Search stencils (db, user, flow, uml...)" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="tools-scroll">
        {STENCIL_CATEGORIES.map((cat) => {
          const items = list.filter((s) => s.category === cat);
          if (!items.length) return null;
          return (
            <div key={cat}>
              <div className="tools-cat">{cat}</div>
              <div className="stencil-grid">
                {items.map((s) => (
                  <button key={s.id} className="stencil" title={`Insert ${s.name}`} disabled={!api} onClick={() => api && insertStencil(api, s)}>
                    <Thumb s={s} />
                    <span>{s.name}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        {!list.length && <div className="history-empty">No stencil matches “{q}”.</div>}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- colors
interface Palette {
  name: string;
  colors: string[];
}
const DEFAULT_PALETTES: Palette[] = [
  { name: "Excalidraw", colors: ["#ffc9c9", "#ffd8a8", "#ffec99", "#b2f2bb", "#96f2d7", "#a5d8ff", "#d0bfff", "#eebefa", "#e9ecef", "#1e1e1e"] },
  { name: "Ocean", colors: ["#03396c", "#005b96", "#6497b1", "#b3cde0", "#e8f4f8", "#0a9396", "#94d2bd"] },
  { name: "Sunset", colors: ["#264653", "#2a9d8f", "#e9c46a", "#f4a261", "#e76f51", "#fff3e0"] },
  { name: "Mono", colors: ["#000000", "#343a40", "#868e96", "#ced4da", "#f1f3f5", "#ffffff"] },
];
const loadPalettes = (): Palette[] => {
  try {
    const raw = localStorage.getItem("palettes");
    return raw ? JSON.parse(raw) : DEFAULT_PALETTES;
  } catch {
    return DEFAULT_PALETTES;
  }
};

function applyColor(api: ExcalidrawImperativeAPI, color: string, mode: "fill" | "stroke") {
  const sel = api.getAppState().selectedElementIds;
  const ids = new Set(Object.keys(sel));
  if (!ids.size) {
    // nothing selected: set the default for new shapes
    const cur = api.getAppState();
    api.updateScene({
      appState: {
        currentItemBackgroundColor: mode === "fill" ? color : cur.currentItemBackgroundColor,
        currentItemStrokeColor: mode === "stroke" ? color : cur.currentItemStrokeColor,
      } as never,
    });
    return;
  }
  // also colour text bound to selected containers when changing the stroke (text colour)
  const els = api.getSceneElementsIncludingDeleted().map((e) => {
    const picked = ids.has(e.id) || (e.type === "text" && e.containerId && ids.has(e.containerId) && mode === "stroke");
    if (!picked || e.isDeleted) return e;
    if (mode === "fill") {
      if (e.type === "text") return e;
      return newElementWith(e, { backgroundColor: color, ...(e.backgroundColor === "transparent" ? { fillStyle: "solid" as const } : {}) });
    }
    return newElementWith(e, { strokeColor: color });
  });
  api.updateScene({ elements: els as ExcalidrawElement[], captureUpdate: CaptureUpdateAction.IMMEDIATELY });
}

function ColorsTab({ api }: { api: ExcalidrawImperativeAPI | null }) {
  const [palettes, setPalettes] = useState<Palette[]>(loadPalettes);
  const [mode, setMode] = useState<"fill" | "stroke">("fill");
  const save = (p: Palette[]) => {
    setPalettes(p);
    localStorage.setItem("palettes", JSON.stringify(p));
  };
  const picker = useRef<HTMLInputElement>(null);
  const target = useRef<number>(0);
  return (
    <div className="tools-scroll">
      <div className="tools-seg">
        <button className={mode === "fill" ? "on" : ""} onClick={() => setMode("fill")}>Fill</button>
        <button className={mode === "stroke" ? "on" : ""} onClick={() => setMode("stroke")}>Stroke / text</button>
      </div>
      <div className="history-sub">Click a color to apply it to the selection (or to new shapes if nothing is selected).</div>
      {palettes.map((p, pi) => (
        <div key={p.name + pi} className="palette">
          <div className="palette-head">
            <strong>{p.name}</strong>
            <span className="palette-actions">
              <button title="Add color" onClick={() => { target.current = pi; picker.current?.click(); }}>＋</button>
              <button
                title="Add colors from selection"
                onClick={() => {
                  if (!api) return;
                  const sel = api.getAppState().selectedElementIds;
                  const cs = new Set<string>();
                  api.getSceneElements().forEach((e) => {
                    if (!sel[e.id]) return;
                    if (e.backgroundColor !== "transparent") cs.add(e.backgroundColor);
                    if (e.strokeColor !== "transparent") cs.add(e.strokeColor);
                  });
                  save(palettes.map((x, i) => (i === pi ? { ...x, colors: [...new Set([...x.colors, ...cs])] } : x)));
                }}
              >⤓</button>
              <button title="Delete palette" onClick={() => save(palettes.filter((_, i) => i !== pi))}>✕</button>
            </span>
          </div>
          <div className="swatches">
            {p.colors.map((c) => (
              <button
                key={c}
                className="swatch"
                style={{ background: c }}
                title={`${c} — click to apply, right-click to remove`}
                onClick={() => api && applyColor(api, c, mode)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  save(palettes.map((x, i) => (i === pi ? { ...x, colors: x.colors.filter((k) => k !== c) } : x)));
                }}
              />
            ))}
          </div>
        </div>
      ))}
      <button
        className="history-btn"
        onClick={async () => {
          const n = await askText("New palette name", "My brand");
          if (n?.trim()) save([...palettes, { name: n.trim(), colors: [] }]);
        }}
      >
        New palette
      </button>
      <button className="history-btn" onClick={() => save(DEFAULT_PALETTES)}>Reset to defaults</button>
      <input
        ref={picker}
        type="color"
        style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 0, height: 0 }}
        onChange={(e) => {
          const col = e.target.value;
          save(palettes.map((x, i) => (i === target.current ? { ...x, colors: [...new Set([...x.colors, col])] } : x)));
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------- layers
interface Item {
  key: string;
  ids: string[]; // element ids belonging to this layer
  label: string;
  locked: boolean;
  hidden: boolean;
  top: number; // highest index
}

function buildItems(api: ExcalidrawImperativeAPI): Item[] {
  const all = api.getSceneElementsIncludingDeleted();
  const byId = new Map(all.map((e) => [e.id, e]));
  const groups = new Map<string, Item>();
  const items: Item[] = [];
  all.forEach((e, idx) => {
    if (e.isDeleted) return;
    // bound text joins its container's layer
    const owner = e.type === "text" && e.containerId && byId.get(e.containerId) ? byId.get(e.containerId)! : e;
    const gid = owner.groupIds.length ? owner.groupIds[owner.groupIds.length - 1] : null;
    const key = gid ?? owner.id;
    let it = groups.get(key);
    if (!it) {
      it = { key, ids: [], label: "", locked: true, hidden: true, top: idx };
      groups.set(key, it);
      items.push(it);
    }
    it.ids.push(e.id);
    it.top = idx;
    it.locked &&= !!e.locked;
    it.hidden &&= !!(e.customData as { hidden?: boolean } | undefined)?.hidden;
  });
  for (const it of items) {
    const els = it.ids.map((i) => byId.get(i)!);
    if (it.key.startsWith("g") || els.length > 1 && els.some((e) => e.groupIds.length)) {
      it.label = `Group (${els.filter((e) => !(e.type === "text" && e.containerId)).length})`;
    } else {
      const e = els[0];
      const t = els.find((x) => x.type === "text") as { text?: string } | undefined;
      it.label = `${e.type[0].toUpperCase()}${e.type.slice(1)}${t?.text ? ` — ${t.text.replace(/\s+/g, " ").slice(0, 22)}` : ""}`;
    }
  }
  return items.reverse(); // top-most first
}

function patchItem(api: ExcalidrawImperativeAPI, ids: string[], fn: (e: ExcalidrawElement) => Partial<ExcalidrawElement>) {
  const set = new Set(ids);
  api.updateScene({
    elements: api.getSceneElementsIncludingDeleted().map((e) => (set.has(e.id) ? newElementWith(e, fn(e) as never) : e)) as ExcalidrawElement[],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
}

function moveItem(api: ExcalidrawImperativeAPI, items: Item[], i: number, dir: "up" | "down") {
  const j = dir === "up" ? i - 1 : i + 1; // items are top-first
  if (j < 0 || j >= items.length) return;
  const mine = new Set(items[i].ids);
  const other = new Set(items[j].ids);
  const all = [...api.getSceneElementsIncludingDeleted()];
  const moving = all.filter((e) => mine.has(e.id));
  const rest = all.filter((e) => !mine.has(e.id));
  let anchor = -1;
  rest.forEach((e, idx) => {
    if (other.has(e.id)) anchor = dir === "up" ? idx : anchor < 0 ? idx : anchor; // up: after last; down: before first
  });
  const at = dir === "up" ? anchor + 1 : rest.findIndex((e) => other.has(e.id));
  rest.splice(Math.max(0, at), 0, ...moving);
  api.updateScene({ elements: rest, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
}

function LayersTab({ api, tick }: { api: ExcalidrawImperativeAPI | null; tick: number }) {
  const [, force] = useState(0);
  useEffect(() => (api ? api.onChange(() => force((n) => n + 1)) : undefined), [api]);
  if (!api) return null;
  void tick;
  const items = buildItems(api);
  const sel = api.getAppState().selectedElementIds;
  return (
    <div className="tools-scroll">
      <div className="history-sub">Top of the list is the front. Hidden layers are kept in the file with opacity 0 and locked.</div>
      {!items.length && <div className="history-empty">The canvas is empty.</div>}
      {items.map((it, i) => (
        <div key={it.key} className={"layer-row" + (it.ids.some((x) => sel[x]) ? " selected" : "") + (it.hidden ? " dim" : "")}>
          <button
            className="layer-name"
            onClick={() => {
              api.updateScene({ appState: { selectedElementIds: Object.fromEntries(it.ids.map((x) => [x, true])) } });
              api.scrollToContent(api.getSceneElements().filter((e) => it.ids.includes(e.id)), { animate: true });
            }}
          >
            {it.label}
          </button>
          <button title={it.hidden ? "Show" : "Hide"} onClick={() =>
            patchItem(api, it.ids, (e) => {
              const cd = (e.customData ?? {}) as { hidden?: boolean; origOpacity?: number };
              return it.hidden
                ? ({ opacity: cd.origOpacity ?? 100, locked: false, customData: { ...cd, hidden: false } } as never)
                : ({ opacity: 0, locked: true, customData: { ...cd, hidden: true, origOpacity: e.opacity } } as never);
            })}>{it.hidden ? "🙈" : "👁"}</button>
          <button title={it.locked ? "Unlock" : "Lock"} disabled={it.hidden} onClick={() => patchItem(api, it.ids, () => ({ locked: !it.locked }) as never)}>
            {it.locked ? "🔒" : "🔓"}
          </button>
          <button title="Bring forward" disabled={i === 0} onClick={() => moveItem(api, items, i, "up")}>▲</button>
          <button title="Send backward" disabled={i === items.length - 1} onClick={() => moveItem(api, items, i, "down")}>▼</button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- tidy / grid
function TidyTab({ api }: { api: ExcalidrawImperativeAPI | null }) {
  const [, force] = useState(0);
  const [auto, setAuto] = useState(() => localStorage.getItem("autoclean") === "1");
  if (!api) return null;
  const st = api.getAppState();
  const set = (appState: Record<string, unknown>) => {
    api.updateScene({ appState: appState as never });
    force((n) => n + 1);
  };
  return (
    <div className="tools-scroll tidy">
      <strong>Sketch to clean</strong>
      <div className="history-sub">Draw with the pencil tool, then snap rough strokes into real rectangles, ellipses, diamonds and arrows.</div>
      <button
        className="history-btn primary"
        onClick={() => {
          const sel = api.getAppState().selectedElementIds;
          const ids = new Set(Object.keys(sel));
          const n = cleanUpStrokes(api, ids.size ? ids : new Set(api.getSceneElements().filter((e) => e.type === "freedraw").map((e) => e.id)));
          api.setToast({ message: n ? `Cleaned ${n} stroke(s)` : "No clear shapes found in the selected strokes", closable: true, duration: 2500 });
        }}
      >
        Clean up selected strokes
      </button>
      <label className="chat-inline">
        <input type="checkbox" checked={auto} onChange={(e) => { setAuto(e.target.checked); localStorage.setItem("autoclean", e.target.checked ? "1" : "0"); }} />
        Auto-clean pencil strokes as I draw
      </label>
      <hr />
      <strong>Grid & snapping</strong>
      <label className="chat-inline">
        <input type="checkbox" checked={!!st.gridModeEnabled} onChange={(e) => set({ gridModeEnabled: e.target.checked })} />
        Show grid and snap to it
      </label>
      <label className="chat-inline">
        Grid size
        <select value={st.gridSize} onChange={(e) => set({ gridSize: Number(e.target.value) })}>
          {[5, 10, 20, 40, 80].map((n) => <option key={n} value={n}>{n}px</option>)}
        </select>
      </label>
      <label className="chat-inline">
        <input type="checkbox" checked={!!st.objectsSnapModeEnabled} onChange={(e) => set({ objectsSnapModeEnabled: e.target.checked })} />
        Snap to other objects (alignment guides)
      </label>
    </div>
  );
}

// ---------------------------------------------------------------- panel
export default function ToolsPanel({ api }: { api: ExcalidrawImperativeAPI | null }) {
  const [tab, setTab] = useState<Tab>("stencils");
  const tabs: [Tab, string][] = [["stencils", "Stencils"], ["colors", "Colors"], ["layers", "Layers"], ["tidy", "Tidy"]];
  return (
    <div className="tools-panel">
      <div className="tools-tabs">
        {tabs.map(([k, l]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === "stencils" && <StencilsTab api={api} />}
      {tab === "colors" && <ColorsTab api={api} />}
      {tab === "layers" && <LayersTab api={api} tick={0} />}
      {tab === "tidy" && <TidyTab api={api} />}
    </div>
  );
}
