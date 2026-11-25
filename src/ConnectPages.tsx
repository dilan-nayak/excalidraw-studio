import { useState, type ReactNode } from "react";
import { claudeCodeCommand, claudeDesktopConfig, genericHttpConfig } from "./prompts";
import { mcpUrl } from "./mcp";

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // fallback for webviews without clipboard permission
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

function CopyBtn({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="history-btn"
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        }
      }}
    >
      {done ? "Copied ✓" : label}
    </button>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="ai-step">
      <div className="ai-n">{n}</div>
      <div className="ai-step-main">
        <div className="ai-step-title">{title}</div>
        <div className="ai-step-body">{children}</div>
      </div>
    </div>
  );
}

function Code({ text, label = "Copy" }: { text: string; label?: string }) {
  return (
    <div className="ai-code">
      <pre className="snippet">{text}</pre>
      <CopyBtn text={text} label={label} />
    </div>
  );
}

export interface ServerProps {
  port: number;
  on: boolean;
  msg: string;
  onToggle: (on: boolean) => void;
}

/** Step 1 on every connect page: the on/off switch for the local MCP server. */
function ServerSwitch({ port, on, msg, onToggle }: ServerProps) {
  return (
    <div className="ai-server">
      <label className="ai-switch">
        <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} />
        <span className="ai-switch-track" />
        <span>{on ? "Connection is ON" : "Connection is OFF"}</span>
      </label>
      <div className={"mcp-status " + (on ? "on" : "off")}>
        {on ? `● Ready at ${mcpUrl(port)}` : "○ Turn it on so other apps can reach this one"}
      </div>
      {msg && !on && <div className="chat-note">{msg}</div>}
      <div className="history-sub">It only works on this computer. Keep Excalidraw Studio open while you use it.</div>
    </div>
  );
}

function HowItWorks({ app }: { app: string }) {
  return (
    <div className="ai-flow">
      <div className="ai-flow-row">
        <span className="ai-chip a">You type in {app}</span>
        <span className="ai-arrow">→</span>
        <span className="ai-chip b">{app} calls Excalidraw Studio</span>
        <span className="ai-arrow">→</span>
        <span className="ai-chip c">Shapes appear on your canvas</span>
      </div>
      <div className="ai-callout">
        <b>Type your request in {app}, not in this panel.</b> The message box on the <b>Chat</b> tab here is a separate feature
        that needs your own API key.
      </div>
    </div>
  );
}

const DEMO_DRAW =
  "Use the excalidraw-studio tools. Look at my open drawing with get_canvas first, then draw a simple login flow with 4 steps in an empty area so nothing overlaps.";

function Demo({ app }: { app: string }) {
  return (
    <>
      <Code text={DEMO_DRAW} label="Copy demo prompt" />
      <div className="history-sub">
        Paste it into {app}. Other things to try: <i>“Explain my drawing”</i>, <i>“Make all boxes blue”</i>,{" "}
        <i>“Tidy the layout”</i>.
      </div>
    </>
  );
}

const Check = ({ on }: { on: boolean }) => (
  <li className={on ? "ok" : "todo"}>{on ? "Connection is on" : "Turn the connection on (step 1)"}</li>
);

/* ===================== Claude Code ===================== */
export function ClaudeCodePage(p: ServerProps) {
  const url = mcpUrl(p.port);
  return (
    <div className="ai-page">
      <div className="ai-title">Connect Claude Code</div>
      <div className="history-sub">Use Claude Code to draw and edit this canvas. No API key is needed in this app.</div>
      <HowItWorks app="Claude Code" />

      <Step n={1} title="Turn the connection on">
        <ServerSwitch {...p} />
      </Step>
      <Step n={2} title="Tell Claude Code where we are">
        Open a terminal (PowerShell is fine) and run this <b>once</b>:
        <Code text={claudeCodeCommand(url)} label="Copy command" />
        <details className="ai-more">
          <summary>“claude is not recognized”? Use a file instead</summary>
          In the folder you work in with Claude Code, create a file named <code>.mcp.json</code> and put this inside:
          <Code text={genericHttpConfig(url)} label="Copy file content" />
          Claude Code asks once to trust it. Choose <b>Yes</b>.
        </details>
      </Step>
      <Step n={3} title="Start a new Claude Code session">
        Already-open sessions do not see new connections. Open a <b>new</b> session, type <code>/mcp</code> and check that{" "}
        <b>excalidraw-studio</b> shows <b>connected</b>.
      </Step>
      <Step n={4} title="Ask it to draw">
        Open the drawing you want to change in Excalidraw Studio, then give Claude Code a prompt:
        <Demo app="Claude Code" />
        The first time, Claude Code asks permission to use the tool. Choose <b>Allow</b>. Shapes appear here as it works.
      </Step>
      <div className="ai-callout warn">
        <b>Nothing happens?</b>
        <ul className="ai-check">
          <Check on={p.on} />
          <li className="todo">Excalidraw Studio is open and a drawing is open in it</li>
          <li className="todo">You started a NEW Claude Code session after step 2</li>
        </ul>
      </div>
    </div>
  );
}

/* ===================== Claude Desktop ===================== */
export function ClaudeDesktopPage(p: ServerProps) {
  const url = mcpUrl(p.port);
  return (
    <div className="ai-page">
      <div className="ai-title">Connect Claude Desktop</div>
      <div className="history-sub">Use the Claude Desktop chat app to draw and edit this canvas. No API key is needed in this app.</div>
      <HowItWorks app="Claude Desktop" />

      <Step n={1} title="Turn the connection on">
        <ServerSwitch {...p} />
      </Step>
      <Step n={2} title="Install Node.js (once)">
        Claude Desktop needs Node.js to reach this app. Get the <b>LTS</b> version from <b>nodejs.org</b>. Skip this if it is already installed.
        <div className="history-sub">Check in PowerShell: <code>node --version</code></div>
      </Step>
      <Step n={3} title="Open Claude Desktop's config file">
        In Claude Desktop: <b>Settings → Developer → Edit Config</b>. It opens a folder containing{" "}
        <code>claude_desktop_config.json</code>.
        <details className="ai-more">
          <summary>I don’t see “Developer”</summary>
          Open the folder yourself: press <b>Win + R</b> and paste one of these.
          <Code text="%APPDATA%\Claude" label="Copy" />
          <div className="history-sub">If that folder does not exist (Microsoft Store version), use:</div>
          <Code text="%LOCALAPPDATA%\Packages" label="Copy" />
          <div className="history-sub">
            Open the folder starting with <b>Claude_</b>, then <code>LocalCache\Roaming\Claude</code>. Create the file{" "}
            <code>claude_desktop_config.json</code> there if it is missing. Windows may secretly name it{" "}
            <code>.json.txt</code>; in File Explorer turn on <b>View → File name extensions</b> and check.
          </div>
        </details>
      </Step>
      <Step n={4} title="Paste this into the file">
        <Code text={claudeDesktopConfig(url)} label="Copy config" />
        <div className="history-sub">
          The file already has <code>"mcpServers"</code>? Add only the <code>"excalidraw-studio": {"{ … }"}</code> part inside it. Do not
          create a second <code>"mcpServers"</code>. Save the file.
        </div>
      </Step>
      <Step n={5} title="Quit Claude Desktop fully, then reopen">
        Closing the window is not enough. Click the <b>^</b> arrow next to the clock, right-click the Claude icon and choose{" "}
        <b>Quit</b> (or end it in Task Manager). Then open Claude Desktop and start a <b>new chat</b>. Open the tools menu in the chat box:{" "}
        <b>excalidraw-studio</b> should be listed.
      </Step>
      <Step n={6} title="Ask it to draw">
        Open the drawing you want to change in Excalidraw Studio, then paste this in the Claude Desktop chat:
        <Demo app="Claude Desktop" />
        The first time, click <b>Allow</b> when it asks to use the tool.
        <div className="history-sub">
          Tip: Claude Desktop also lists two ready-made prompts from this app under the <b>+</b> button (Explain, Draw an architecture).
        </div>
      </Step>
      <div className="ai-callout warn">
        <b>Nothing happens?</b>
        <ul className="ai-check">
          <Check on={p.on} />
          <li className="todo">Excalidraw Studio is open with a drawing</li>
          <li className="todo">The file is named exactly <code>claude_desktop_config.json</code></li>
          <li className="todo">Claude Desktop was fully quit and reopened, then a new chat started</li>
        </ul>
      </div>
    </div>
  );
}

/* ===================== Other apps ===================== */
export function OtherAppsPage(p: ServerProps) {
  const url = mcpUrl(p.port);
  return (
    <div className="ai-page">
      <div className="ai-title">Connect another app</div>
      <div className="history-sub">For Cursor, VS Code (Copilot), Windsurf, Cline and other apps that support MCP.</div>
      <HowItWorks app="that app" />

      <Step n={1} title="Turn the connection on">
        <ServerSwitch {...p} />
      </Step>
      <Step n={2} title="Add an MCP server in that app">
        Find its <b>MCP servers</b> settings (often a file called <code>mcp.json</code>) and add:
        <Code text={genericHttpConfig(url)} label="Copy config" />
        <div className="history-sub">
          Server address (if the app asks for it separately): <code>{url}</code>, type <b>HTTP</b> (“streamable HTTP”).
        </div>
        <details className="ai-more">
          <summary>My app only supports “command” servers</summary>
          Use the same helper Claude Desktop uses (needs Node.js):
          <Code text={claudeDesktopConfig(url)} label="Copy config" />
        </details>
      </Step>
      <Step n={3} title="Restart that app">
        Reload it so it picks up the new server. Check that <b>excalidraw-studio</b> shows as connected.
      </Step>
      <Step n={4} title="Ask it to draw">
        Open a drawing here, then in that app’s chat:
        <Demo app="that app" />
      </Step>
    </div>
  );
}
