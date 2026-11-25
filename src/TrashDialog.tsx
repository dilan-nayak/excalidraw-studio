import { useCallback, useEffect, useState } from "react";
import { type TrashItem, listTrash, purgeTrash, restoreFromTrash } from "./trashStore";
import { confirm } from "@tauri-apps/plugin-dialog";

const fmt = (t: number) => new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export default function TrashDialog({
  roots,
  onClose,
  onRestored,
}: {
  roots: string[];
  onClose: () => void;
  onRestored: (path: string) => void;
}) {
  const [items, setItems] = useState<TrashItem[] | null>(null);
  const [err, setErr] = useState("");
  const reload = useCallback(() => listTrash().then(setItems).catch((e) => setErr(String(e))), []);
  useEffect(() => {
    reload();
  }, [reload]);

  const restore = async (it: TrashItem) => {
    // prefer the folder it came from; fall back to the first workspace folder if that one was removed
    const root = roots.find((r) => it.root.replace(/\\/g, "/").toLowerCase() === r.replace(/\\/g, "/").toLowerCase()) ?? roots[0];
    if (!root) return setErr("Add a workspace folder first, then restore.");
    try {
      onRestored(await restoreFromTrash(it, root));
      await reload();
    } catch (e) {
      setErr(String(e));
    }
  };

  return (
    <div className="ask-backdrop" onMouseDown={onClose}>
      <div className="ask-box trash-box" onMouseDown={(e) => e.stopPropagation()}>
        <div className="ask-title">Trash</div>
        {err && <div className="history-error" onClick={() => setErr("")}>{err}</div>}
        <div className="trash-list">
          {items === null && <div className="history-empty">Loading…</div>}
          {items?.length === 0 && <div className="history-empty">Trash is empty.</div>}
          {items?.map((it) => (
            <div key={it.slot} className="trash-row">
              <div className="trash-info">
                <div className="trash-name">{it.isDir ? "📁 " : "📄 "}{it.name}</div>
                <div className="history-sub" title={it.originalPath}>Deleted {fmt(it.deletedAt)}</div>
              </div>
              <button className="history-btn" onClick={() => restore(it)}>Restore</button>
              <button
                className="history-btn"
                onClick={async () => {
                  if (await confirm(`Permanently delete "${it.name}"? This cannot be undone.`, { kind: "warning", okLabel: "Delete forever" })) {
                    await purgeTrash(it.slot);
                    await reload();
                  }
                }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
        <div className="ask-actions">
          {!!items?.length && (
            <button
              className="history-btn"
              onClick={async () => {
                if (await confirm("Permanently delete everything in the Trash? This cannot be undone.", { kind: "warning", okLabel: "Empty Trash" })) {
                  await purgeTrash();
                  await reload();
                }
              }}
            >
              Empty Trash
            </button>
          )}
          <button className="history-btn primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
