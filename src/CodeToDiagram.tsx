import { useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { buildGraph, graphToSkeletons, scanFolder, type GraphOptions, type ScanResult } from "./codeGraph";
import { insertCentered } from "./diagramText";

export default function CodeToDiagram({ api, onClose }: { api: ExcalidrawImperativeAPI; onClose: () => void }) {
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [opt, setOpt] = useState<GraphOptions>({ granularity: "folders", depth: 2, includeExternal: false, maxNodes: 40 });

  const graph = useMemo(() => (scan ? buildGraph(scan, opt) : null), [scan, opt]);

  const choose = async () => {
    setErr("");
    const dir = await open({ directory: true, title: "Choose a code folder to diagram" });
    if (typeof dir !== "string") return;
    setBusy("Scanning…");
    try {
      const r = await scanFolder(dir, (n) => setBusy(`Scanning… ${n} files`));
      if (!r.files.length) setErr("No source files found in that folder (looked for JS/TS, Python, Go, Rust, Java/Kotlin, C#, C/C++, Ruby, PHP, Dart, Swift).");
      setScan(r);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy("");
    }
  };

  const insert = () => {
    if (!graph?.nodes.length) return;
    try {
      const els = convertToExcalidrawElements(graphToSkeletons(graph) as never, { regenerateIds: false }) as ExcalidrawElement[];
      insertCentered(api, els);
      onClose();
    } catch (e) {
      setErr(String(e));
    }
  };

  const set = (p: Partial<GraphOptions>) => setOpt({ ...opt, ...p });
  return (
    <div className="ask-backdrop" onMouseDown={onClose}>
      <div className="ask-box dft-box" onMouseDown={(e) => e.stopPropagation()}>
        <div className="ask-title">Code to diagram</div>
        <div className="history-sub">
          Pick a project folder. The app reads import statements (no AI, nothing leaves your computer) and draws which parts depend on which: importers on the left, the things they import on the right.
        </div>
        <div className="dft-row">
          <button className="history-btn primary" onClick={choose} disabled={!!busy}>{scan ? "Choose another folder…" : "Choose folder…"}</button>
          {busy && <span className="history-sub">{busy}</span>}
          {scan && <span className="history-sub" title={scan.root}>{scan.root.split("/").pop()}</span>}
        </div>
        {scan && graph && (
          <>
            <div className="cg-options">
              <label>
                Detail
                <select value={opt.granularity} onChange={(e) => set({ granularity: e.target.value as GraphOptions["granularity"], maxNodes: e.target.value === "files" ? 30 : 40 })}>
                  <option value="folders">Folders (overview)</option>
                  <option value="files">Files (detailed)</option>
                </select>
              </label>
              {opt.granularity === "folders" && (
                <label>
                  Folder depth
                  <select value={opt.depth} onChange={(e) => set({ depth: Number(e.target.value) })}>
                    {[1, 2, 3, 4].map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </label>
              )}
              <label>
                Max boxes
                <select value={opt.maxNodes} onChange={(e) => set({ maxNodes: Number(e.target.value) })}>
                  {[15, 25, 30, 40, 60, 100].map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </label>
              <label className="chat-inline">
                <input type="checkbox" checked={opt.includeExternal} onChange={(e) => set({ includeExternal: e.target.checked })} />
                Show external packages
              </label>
            </div>
            <div className="cg-summary">
              Scanned <b>{scan.files.length}</b> source files{scan.truncated ? " (stopped at 1500)" : ""}
              {scan.skipped ? `, skipped ${scan.skipped} unreadable/large` : ""}. Diagram: <b>{graph.nodes.length}</b> boxes, <b>{graph.edges.length}</b> arrows
              {graph.hidden ? `, ${graph.hidden} less-connected boxes hidden (raise “Max boxes” to show them)` : ""}.
              {!graph.edges.length && " No dependencies were detected between these parts; try “Files” detail or a lower folder depth."}
            </div>
          </>
        )}
        {err && <div className="history-error">{err}</div>}
        <div className="ask-actions">
          <button className="history-btn" onClick={onClose}>Cancel</button>
          <button className="history-btn primary" disabled={!graph?.nodes.length} onClick={insert}>Insert diagram</button>
        </div>
      </div>
    </div>
  );
}
