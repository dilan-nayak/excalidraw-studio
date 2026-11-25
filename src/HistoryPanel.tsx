import { useCallback, useEffect, useRef, useState } from "react";
import { exportToSvg, loadFromBlob } from "@excalidraw/excalidraw";
import {
  type Checkpoint,
  deleteCheckpoint,
  listCheckpoints,
  readCheckpoint,
  recordCheckpoint,
  setCheckpointMeta,
} from "./history";
import { askText } from "./askText";

interface Props {
  file: string | null;
  open: boolean;
  /** serialized current scene, used for "Save checkpoint" */
  getCurrentJson: () => string | null;
  onRestore: (json: string) => Promise<void> | void;
  refreshKey: number; // bump to reload after a save
}

const fmt = (t: number) =>
  new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });

export default function HistoryPanel({ file, open, getCurrentJson, onRestore, refreshKey }: Props) {
  const [items, setItems] = useState<Checkpoint[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    if (!file) return setItems([]);
    try {
      setItems(await listCheckpoints(file));
    } catch (e) {
      setErr(String(e));
    }
  }, [file]);

  useEffect(() => {
    if (open) reload();
  }, [open, reload, refreshKey]);

  useEffect(() => {
    setSelected(null);
    setSvg(null);
  }, [file]);

  // Preview the selected checkpoint as an SVG thumbnail
  useEffect(() => {
    if (!file || !selected) return setSvg(null);
    const my = ++seq.current;
    (async () => {
      try {
        const json = await readCheckpoint(file, selected);
        const scene = await loadFromBlob(new Blob([json], { type: "application/json" }), null, null);
        const els = scene.elements.filter((e) => !e.isDeleted);
        if (!els.length) return my === seq.current && setSvg("");
        const node = await exportToSvg({
          elements: els,
          files: scene.files ?? null,
          appState: { ...scene.appState, exportBackground: true, exportWithDarkMode: false },
          skipInliningFonts: true,
        });
        node.setAttribute("width", "100%");
        node.removeAttribute("height");
        if (my === seq.current) setSvg(node.outerHTML);
      } catch (e) {
        if (my === seq.current) setErr(String(e));
      }
    })();
  }, [file, selected]);

  if (!file)
    return <div className="history-empty">Save this drawing to a file to start recording its history.</div>;

  const restore = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      // keep the state being replaced as a checkpoint so a restore is itself undoable
      const cur = getCurrentJson();
      if (cur) await recordCheckpoint(file, cur, true);
      await onRestore(await readCheckpoint(file, selected));
      await reload();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="history-panel">
      <div className="history-actions">
        <input
          className="history-name"
          value={newName}
          placeholder="Name this version (optional)"
          onChange={(e) => setNewName(e.target.value)}
        />
        <button
          className="lib-header-btn history-btn"
          onClick={async () => {
            const cur = getCurrentJson();
            if (cur) await recordCheckpoint(file, cur, true, newName.trim() || undefined);
            setNewName("");
            await reload();
          }}
        >
          Save
        </button>
      </div>
      {err && <div className="history-error" onClick={() => setErr(null)}>{err}</div>}
      {svg !== null && selected && (
        <div className="history-preview">
          {svg ? <div dangerouslySetInnerHTML={{ __html: svg }} /> : <em>Empty drawing</em>}
          <div className="history-preview-actions">
            <button className="history-btn primary" disabled={busy} onClick={restore}>
              Restore this version
            </button>
            <button
              className="history-btn"
              onClick={async () => {
                const c = items.find((x) => x.id === selected);
                await setCheckpointMeta(file, selected, { pinned: !c?.pinned });
                await reload();
              }}
            >
              {items.find((x) => x.id === selected)?.pinned ? "Unpin" : "Pin"}
            </button>
            <button
              className="history-btn"
              onClick={async () => {
                const c = items.find((x) => x.id === selected);
                const n = await askText("Version name", c?.name ?? "");
                if (n !== null) {
                  await setCheckpointMeta(file, selected, { name: n.trim() || undefined });
                  await reload();
                }
              }}
            >
              Rename
            </button>
            <button
              className="history-btn"
              onClick={async () => {
                await deleteCheckpoint(file, selected);
                setSelected(null);
                await reload();
              }}
            >
              Delete
            </button>
          </div>
        </div>
      )}
      <div className="history-list">
        {items.length === 0 && <div className="history-empty">No checkpoints yet. They are created when you save.</div>}
        {items.map((c) => (
          <div
            key={c.id}
            className={"history-row" + (c.id === selected ? " selected" : "")}
            onClick={() => setSelected(c.id === selected ? null : c.id)}
          >
            <span className="history-row-main">
              {c.pinned && <span title="Pinned: never auto-deleted">📌 </span>}
              {c.name ? <strong>{c.name}</strong> : fmt(c.time)}
              {c.name && <span className="history-sub"> {fmt(c.time)}</span>}
            </span>
            {c.manual && !c.name && <span className="history-tag">manual</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
