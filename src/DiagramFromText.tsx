import { useState } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { EXAMPLES, insertCentered, looksLikeMermaid, mermaidToElements, outlineToElements, type OutlineDir } from "./diagramText";

type Mode = "auto" | "mermaid" | "outline";

export default function DiagramFromText({ api, onClose }: { api: ExcalidrawImperativeAPI; onClose: () => void }) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<Mode>("auto");
  const [dir, setDir] = useState<OutlineDir>("right");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const effective = mode === "auto" ? (looksLikeMermaid(text) ? "mermaid" : "outline") : mode;

  const run = async () => {
    setErr("");
    setBusy(true);
    try {
      if (!text.trim()) throw new Error("Paste Mermaid code or an indented list first.");
      if (effective === "mermaid") {
        const { elements, files } = await mermaidToElements(text);
        if (!elements.length) throw new Error("Mermaid produced no shapes.");
        insertCentered(api, elements, files);
      } else {
        insertCentered(api, outlineToElements(text, dir));
      }
      onClose();
    } catch (e) {
      setErr((e as Error).message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ask-backdrop" onMouseDown={onClose}>
      <div className="ask-box dft-box" onMouseDown={(e) => e.stopPropagation()}>
        <div className="ask-title">Diagram from text</div>
        <div className="history-sub">
          No AI needed. Paste <b>Mermaid</b> code (flowchart, sequence, class, state, ER…) or a plain <b>indented list</b> (outline) and it becomes editable shapes.
        </div>
        <div className="tools-seg">
          {(["auto", "mermaid", "outline"] as Mode[]).map((m) => (
            <button key={m} className={mode === m ? "on" : ""} onClick={() => setMode(m)}>
              {m === "auto" ? `Auto (${effective})` : m === "mermaid" ? "Mermaid" : "Outline"}
            </button>
          ))}
        </div>
        <textarea
          className="dft-text"
          autoFocus
          value={text}
          placeholder={"Mermaid example:\nflowchart TD\n  A[Start] --> B{OK?}\n\nOutline example (indent with spaces):\nProject\n  Design\n  Build\n    Frontend\n    Backend"}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) run();
            if (e.key === "Escape") onClose();
          }}
        />
        <div className="dft-row">
          <span className="history-sub">Examples:</span>
          <button className="history-btn" onClick={() => { setText(EXAMPLES.flowchart); setMode("auto"); }}>Flowchart</button>
          <button className="history-btn" onClick={() => { setText(EXAMPLES.sequence); setMode("auto"); }}>Sequence</button>
          <button className="history-btn" onClick={() => { setText(EXAMPLES.outline); setMode("auto"); }}>Outline</button>
          {effective === "outline" && (
            <label className="dft-dir">
              Layout
              <select value={dir} onChange={(e) => setDir(e.target.value as OutlineDir)}>
                <option value="right">Left to right</option>
                <option value="down">Top down (org chart)</option>
              </select>
            </label>
          )}
        </div>
        {err && <div className="history-error">{err}</div>}
        <div className="ask-actions">
          <span className="history-sub" style={{ marginRight: "auto" }}>Ctrl+Enter to insert</span>
          <button className="history-btn" onClick={onClose}>Cancel</button>
          <button className="history-btn primary" disabled={busy} onClick={run}>{busy ? "Working…" : "Insert diagram"}</button>
        </div>
      </div>
    </div>
  );
}
