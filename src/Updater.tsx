import { useCallback, useEffect, useRef, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

const AUTO_KEY = "auto-update";
export const autoUpdatePref = {
  get: () => localStorage.getItem(AUTO_KEY) !== "0",
  set: (on: boolean) => localStorage.setItem(AUTO_KEY, on ? "1" : "0"),
};

export type UpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "uptodate" }
  | { kind: "available"; version: string; current: string; notes: string }
  | { kind: "downloading"; done: number; total: number }
  | { kind: "installing" }
  | { kind: "error"; msg: string; phase: "check" | "install" };

/** Checks GitHub for a newer signed release. `beforeInstall` should save any unsaved work. */
export function useUpdater(beforeInstall: () => Promise<void>) {
  const [state, setState] = useState<UpdateState>({ kind: "idle" });
  const found = useRef<Update | null>(null);
  const beforeRef = useRef(beforeInstall);
  beforeRef.current = beforeInstall;

  // manual = the user asked, so show "up to date" / errors; otherwise stay silent unless an update exists
  const run = useCallback(async (manual: boolean) => {
    if (manual) setState({ kind: "checking" });
    try {
      const u = await check();
      if (u) {
        found.current = u;
        setState({ kind: "available", version: u.version, current: u.currentVersion, notes: u.body ?? "" });
      } else {
        setState(manual ? { kind: "uptodate" } : { kind: "idle" });
      }
    } catch (e) {
      console.warn("Update check failed:", e);
      setState(manual ? { kind: "error", msg: String(e instanceof Error ? e.message : e), phase: "check" } : { kind: "idle" });
    }
  }, []);

  // automatic check a few seconds after launch, so startup stays fast
  useEffect(() => {
    if (!autoUpdatePref.get()) return;
    const t = setTimeout(() => run(false), 8000);
    return () => clearTimeout(t);
  }, [run]);

  const install = useCallback(async () => {
    const u = found.current;
    if (!u) return;
    try {
      setState({ kind: "downloading", done: 0, total: 0 });
      await beforeRef.current();
      let done = 0;
      let total = 0;
      await u.downloadAndInstall((ev) => {
        if (ev.event === "Started") total = ev.data.contentLength ?? 0;
        else if (ev.event === "Progress") {
          done += ev.data.chunkLength;
          setState({ kind: "downloading", done, total });
        } else if (ev.event === "Finished") setState({ kind: "installing" });
      });
      await relaunch();
    } catch (e) {
      setState({ kind: "error", msg: String(e instanceof Error ? e.message : e), phase: "install" });
    }
  }, []);

  return { state, checkNow: () => run(true), install, close: () => setState({ kind: "idle" }) };
}

const mb = (n: number) => (n / 1048576).toFixed(1);

export default function UpdateDialog({
  state,
  onInstall,
  onClose,
  onRetry,
}: {
  state: UpdateState;
  onInstall: () => void;
  onClose: () => void;
  onRetry: () => void;
}) {
  const [auto, setAuto] = useState(autoUpdatePref.get());
  if (state.kind === "idle") return null;
  const busy = state.kind === "checking" || state.kind === "downloading" || state.kind === "installing";
  const pct = state.kind === "downloading" && state.total > 0 ? Math.min(100, Math.round((state.done / state.total) * 100)) : null;
  return (
    <div className="ask-backdrop" onMouseDown={() => !busy && onClose()}>
      <div className="ask-box upd-box" onMouseDown={(e) => e.stopPropagation()}>
        {state.kind === "checking" && (
          <>
            <div className="ask-title">Checking for updates…</div>
            <div className="history-sub">Looking for a newer version on GitHub.</div>
          </>
        )}
        {state.kind === "uptodate" && (
          <>
            <div className="ask-title">You're up to date</div>
            <div className="history-sub">You already have the newest version of Excalidraw Studio.</div>
          </>
        )}
        {state.kind === "available" && (
          <>
            <div className="ask-title">Update available: version {state.version}</div>
            <div className="history-sub">You have version {state.current}.</div>
            {state.notes && <pre className="upd-notes">{state.notes}</pre>}
            <div className="history-sub">
              Your open drawing is saved first, then the app installs the update and restarts.{" "}
              <a href="https://github.com/dilan-nayak/excalidraw-studio/releases/latest">What's new</a>
            </div>
          </>
        )}
        {state.kind === "downloading" && (
          <>
            <div className="ask-title">Downloading the update…</div>
            <div className="upd-bar">
              <div className="upd-bar-fill" style={{ width: pct === null ? "35%" : pct + "%" }} data-indeterminate={pct === null} />
            </div>
            <div className="history-sub">
              {pct === null ? "Starting…" : `${pct}%  (${mb(state.done)} of ${mb(state.total)} MB)`}
            </div>
          </>
        )}
        {state.kind === "installing" && (
          <>
            <div className="ask-title">Installing…</div>
            <div className="history-sub">The app will restart in a moment. Please do not close it.</div>
          </>
        )}
        {state.kind === "error" && (
          <>
            <div className="ask-title">{state.phase === "check" ? "Could not check for updates" : "Could not install the update"}</div>
            <div className="history-error">{state.msg}</div>
            <div className="history-sub">
              {state.phase === "check"
                ? "Check your internet connection and try again. Your app keeps working as usual."
                : "Your current version still works. You can also download the newest installer yourself from the releases page."}{" "}
              {state.phase === "install" && <a href="https://github.com/dilan-nayak/excalidraw-studio/releases/latest">Open releases page</a>}
            </div>
          </>
        )}
        {!busy && (
          <label className="upd-auto">
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => {
                setAuto(e.target.checked);
                autoUpdatePref.set(e.target.checked);
              }}
            />
            Check for updates automatically when the app starts
          </label>
        )}
        <div className="ask-actions">
          {state.kind === "available" && (
            <>
              <button className="history-btn" onClick={onClose}>
                Later
              </button>
              <button className="history-btn primary" onClick={onInstall}>
                Update now
              </button>
            </>
          )}
          {state.kind === "error" && (
            <>
              <button className="history-btn" onClick={onClose}>
                Close
              </button>
              <button className="history-btn primary" onClick={onRetry}>
                Try again
              </button>
            </>
          )}
          {state.kind === "uptodate" && (
            <button className="history-btn primary" onClick={onClose}>
              OK
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
