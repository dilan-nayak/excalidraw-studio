// Small imperative text prompt (window.prompt is unreliable inside the Tauri webview).
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

function Dialog({ title, initial, hint, done }: { title: string; initial: string; hint?: string; done: (v: string | null) => void }) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <div className="ask-backdrop" onMouseDown={() => done(null)}>
      <div className="ask-box" onMouseDown={(e) => e.stopPropagation()}>
        <div className="ask-title">{title}</div>
        <input
          ref={ref}
          value={v}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") done(v);
            if (e.key === "Escape") done(null);
          }}
        />
        {hint && <div className="ask-hint">{hint}</div>}
        <div className="ask-actions">
          <button className="history-btn" onClick={() => done(null)}>Cancel</button>
          <button className="history-btn primary" onClick={() => done(v)}>OK</button>
        </div>
      </div>
    </div>
  );
}

export function askText(title: string, initial = "", hint?: string): Promise<string | null> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const done = (v: string | null) => {
      root.unmount();
      host.remove();
      resolve(v);
    };
    root.render(<Dialog title={title} initial={initial} hint={hint} done={done} />);
  });
}
