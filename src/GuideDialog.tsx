import { useState, type ReactNode } from "react";

type TabId = "start" | "files" | "draw" | "ai" | "keys";

const K = ({ children }: { children: ReactNode }) => <kbd className="kbd">{children}</kbd>;

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="guide-step">
      <div className="guide-n">{n}</div>
      <div>
        <div className="guide-step-title">{title}</div>
        <div className="guide-step-body">{children}</div>
      </div>
    </div>
  );
}

const TABS: { id: TabId; label: string }[] = [
  { id: "start", label: "Start here" },
  { id: "files", label: "Files & safety" },
  { id: "draw", label: "Drawing helpers" },
  { id: "ai", label: "AI & MCP" },
  { id: "keys", label: "Shortcuts" },
];

export default function GuideDialog({ onClose, firstRun }: { onClose: () => void; firstRun?: boolean }) {
  const [tab, setTab] = useState<TabId>("start");
  return (
    <div className="ask-backdrop" onMouseDown={onClose}>
      <div className="ask-box guide-box" onMouseDown={(e) => e.stopPropagation()}>
        <div className="guide-head">
          <div>
            <div className="ask-title" style={{ fontSize: 18 }}>{firstRun ? "Welcome to Excalidraw Studio" : "Guide & tips"}</div>
            <div className="history-sub">Everything runs on your computer. Reopen this any time from <b>Menu ☰ → Guide &amp; shortcuts</b> or the <b>?</b> button in the title bar.</div>
          </div>
          <button className="history-btn" onClick={onClose}>{firstRun ? "Got it" : "Close"}</button>
        </div>
        <div className="guide-body">
          <div className="guide-tabs">
            {TABS.map((t) => (
              <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>{t.label}</button>
            ))}
          </div>
          <div className="guide-content">
            {tab === "start" && (
              <>
                <Step n={1} title="Make or open a drawing">
                  Click <b>☰ (top-left)</b> for the main menu: <i>New File</i>, <i>Open File…</i>, <i>New from Template…</i>. To see all your drawings at once, click <b>+</b> in the <b>Workspace</b> sidebar and pick a folder.
                </Step>
                <Step n={2} title="Draw">
                  Pick a tool from the toolbar at the top (or press its number key). The <b>Tools</b> button (top-right) holds ready-made <b>Stencils</b> (database, server, user…), colour <b>Palettes</b>, <b>Layers</b> and <b>Tidy</b> options.
                </Step>
                <Step n={3} title="Save, and never lose work">
                  <K>Ctrl</K>+<K>S</K> saves. Turn on <b>Autosave</b> in the title bar to save as you go. Every save is also kept in <b>History</b> (top-right) so you can go back to an earlier version.
                </Step>
                <Step n={4} title="Let an AI help (optional)">
                  Click <b>AI</b> (top-right). The panel can be dragged wider from its left edge. You can use your own Claude key, a free local model, or connect Claude Code/Desktop with no key at all. See the <b>AI &amp; MCP</b> tab.
                </Step>
                <div className="guide-tip">Tip: hover any button to see what it does. Right-click a file in the sidebar for more options.</div>
              </>
            )}
            {tab === "files" && (
              <>
                <Step n={1} title="Workspace sidebar">
                  Shows the folders you added. Click a file to open it, drag files between folders, double-click to rename. <b>Right-click</b> a file for: <i>Add to favorites</i> (pinned at the top), <i>Edit tags</i>, <i>colour label</i>, <i>Save as SVG/PNG</i>, <i>Delete</i>. The filter box searches names and <code>#tags</code>.
                </Step>
                <Step n={2} title="File history (versions)">
                  Open <b>History</b>. Click a version to preview it, then <b>Restore this version</b> (your current state is kept too). Type a name and press <b>Save</b> to make a named version; named or <b>pinned</b> versions are never auto-deleted.
                </Step>
                <Step n={3} title="Trash">
                  Deleting a file moves it to the app's Trash. Get it back from <b>☰ → Trash…</b> → <i>Restore</i>.
                </Step>
                <Step n={4} title="Backup">
                  <b>☰ → Auto-backup folder…</b> and choose a folder (OneDrive, Dropbox, USB drive…). From then on every save is copied there. <i>Back up workspace now</i> copies everything at once.
                </Step>
                <Step n={5} title="Export">
                  <b>☰ → Export image…</b> for PNG/SVG, or right-click a file → <i>Save as SVG/PNG</i>. Exports keep the drawing inside, so you can open the image again as an editable diagram.
                </Step>
              </>
            )}
            {tab === "draw" && (
              <>
                <Step n={1} title="Stencils">
                  <b>Tools → Stencils</b>: search, then click to drop a ready-made icon (all offline). It arrives as a group you can move and resize.
                </Step>
                <Step n={2} title="Sketch to clean">
                  Choose the <b>pencil</b> tool (<K>7</K>), draw a rough box, circle or line, then <b>Tools → Tidy → Clean up selected strokes</b>. Tick <i>Auto-clean</i> to do it as you draw.
                </Step>
                <Step n={3} title="Colours, layers, grid">
                  <b>Colors</b>: click a swatch to colour the selection (switch between Fill and Stroke). <b>Layers</b>: hide, lock, and reorder. <b>Tidy</b>: grid and snapping.
                </Step>
                <Step n={4} title="Diagram from text (no AI)">
                  <b>☰ → Diagram from text…</b> Paste Mermaid code <i>or</i> a simple indented list and get an editable diagram. Use <i>Examples</i> to see the format.
                </Step>
                <Step n={5} title="Code to diagram (no AI)">
                  <b>☰ → Code to diagram…</b> Pick a project folder; the app reads imports and draws what depends on what.
                </Step>
                <Step n={6} title="Slides and focus">
                  Draw <b>frames</b> (the frame tool) and press <K>F5</K> to present them as slides. <K>F8</K> hides everything for distraction-free drawing; <K>Esc</K> brings it back.
                </Step>
              </>
            )}
            {tab === "ai" && (
              <>
                <div className="guide-tip">Three ways to use AI. Pick whichever you have. Nothing is sent anywhere unless you use option 1.</div>
                <Step n={1} title="With an API key (Claude)">
                  Open <b>AI</b> → tab <b>Chat (API key)</b> → <b>API settings</b>, choose <i>Anthropic</i>, paste your key and press <b>Save</b>. The key is stored in Windows Credential Manager. Then type what you want: <i>“Draw a login flow with 4 steps”</i>.
                </Step>
                <Step n={2} title="Free & offline with a local model">
                  Install <b>Ollama</b>, download a model that supports tools, then in <b>AI → Chat (API key) → API settings</b> choose <i>OpenAI-compatible / Ollama</i> (default address is already filled in).
                </Step>
                <Step n={3} title="No key: connect Claude Code or Claude Desktop (MCP)">
                  Open <b>AI</b> and pick the tab for your app (<b>Claude Code</b>, <b>Claude Desktop</b> or <b>Other apps</b>). Each tab walks you through it step by step and has a demo prompt. Then type your request <b>in that app</b>, not in the AI panel. Keep Excalidraw Studio open.
                </Step>
                <Step n={4} title="Let any AI read your drawing">
                  <b>☰ → Copy diagram description</b> puts a plain-text summary of the drawing (shapes, connections, flow) on your clipboard. Paste it into any chat. Over MCP the same information is available as the <code>describe_diagram</code> tool.
                </Step>
              </>
            )}
            {tab === "keys" && (
              <table className="guide-keys">
                <tbody>
                  {[
                    ["Save / Save As", "Ctrl+S / Ctrl+Shift+S"],
                    ["Undo / Redo", "Ctrl+Z / Ctrl+Y"],
                    ["Present frames as slides", "F5 (arrows to move, Esc to stop)"],
                    ["Focus mode on/off", "F8 (or Esc to leave)"],
                    ["Command palette", "Ctrl+/"],
                    ["Find on the canvas", "Ctrl+F"],
                    ["Export image", "Ctrl+Shift+E"],
                    ["Pan the canvas", "Hold Space and drag, or mouse wheel"],
                    ["Zoom", "Ctrl + mouse wheel, or the +/- buttons"],
                    ["Pick a tool", "1 selection · 2 box · 3 diamond · 4 circle · 5 arrow · 6 line · 7 pencil · 8 text"],
                    ["Add a link to a shape", "Ctrl+K"],
                    ["Duplicate while dragging", "Hold Alt (or Ctrl) while dragging"],
                    ["Group / Ungroup", "Ctrl+G / Ctrl+Shift+G"],
                    ["Show all shortcuts", "? (Help button, bottom-right)"],
                  ].map(([a, b]) => (
                    <tr key={a}><td>{a}</td><td>{b}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
