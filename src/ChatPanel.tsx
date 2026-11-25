import { useEffect, useRef, useState } from "react";
import {
  CHAT_DEFAULTS,
  type ChatEvent,
  type ChatProvider,
  type Turn,
  loadChatKey,
  runAgent,
  saveChatKey,
} from "./chat";
import { mcpPrefs, mcpUrl, startMcp, stopMcp } from "./mcp";
import { ClaudeCodePage, ClaudeDesktopPage, OtherAppsPage } from "./ConnectPages";
import type { ToolHost } from "./tools";

type Tab = "code" | "desktop" | "other" | "chat";

type Row = { kind: "user" | "assistant"; text: string } | { kind: "tool"; name: string; result: string; error?: boolean };

export default function ChatPanel({ host }: { host: ToolHost }) {
  const [provider, setProvider] = useState<ChatProvider>(
    () => (localStorage.getItem("chat-provider") as ChatProvider) || "anthropic"
  );
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [key, setKey] = useState("");
  const [showCfg, setShowCfg] = useState(false);
  const [tab, setTab] = useState<Tab>(() => (localStorage.getItem("ai-tab") as Tab) || "code");
  const pickTab = (t: Tab) => {
    setTab(t);
    localStorage.setItem("ai-tab", t);
  };
  const [rows, setRows] = useState<Row[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const turns = useRef<Turn[]>([]);
  const abort = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // MCP
  const [mcpOn, setMcpOn] = useState(mcpPrefs.enabled);
  const [mcpPort] = useState(mcpPrefs.port);
  const [mcpMsg, setMcpMsg] = useState("");

  useEffect(() => {
    setModel(localStorage.getItem(`chat-model-${provider}`) ?? CHAT_DEFAULTS[provider].model);
    setBaseUrl(localStorage.getItem(`chat-base-${provider}`) ?? CHAT_DEFAULTS[provider].baseUrl);
    let live = true;
    loadChatKey(provider).then((k) => live && setKey(k));
    return () => {
      live = false;
    };
  }, [provider]);

  useEffect(() => {
    // braces matter: scrollIntoView returns a Promise in newer WebView2, which React would treat as a cleanup function
    endRef.current?.scrollIntoView({ block: "end" });
  }, [rows]);

  const persistCfg = async () => {
    localStorage.setItem("chat-provider", provider);
    localStorage.setItem(`chat-model-${provider}`, model.trim() || CHAT_DEFAULTS[provider].model);
    localStorage.setItem(`chat-base-${provider}`, baseUrl.trim());
    await saveChatKey(provider, key.trim());
  };

  const needsKey = provider === "anthropic";

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    if (needsKey && !key.trim()) {
      setShowCfg(true);
      return;
    }
    await persistCfg();
    setInput("");
    setRows((r) => [...r, { kind: "user", text }]);
    setBusy(true);
    abort.current = new AbortController();
    const onEvent = (e: ChatEvent) =>
      setRows((r) => [
        ...r,
        e.kind === "text"
          ? { kind: "assistant", text: e.text }
          : { kind: "tool", name: e.name, result: e.result, error: e.error },
      ]);
    try {
      const reply = await runAgent(
        { provider, model: model.trim() || CHAT_DEFAULTS[provider].model, baseUrl: baseUrl.trim(), apiKey: key.trim() },
        turns.current,
        text,
        host,
        onEvent,
        abort.current.signal
      );
      turns.current = [...turns.current, { role: "user" as const, text }, { role: "assistant" as const, text: reply || "(done)" }].slice(-20);
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        setRows((r) => [...r, { kind: "tool", name: "error", result: String((e as Error).message ?? e), error: true }]);
    } finally {
      setBusy(false);
    }
  };

  const toggleMcp = async (on: boolean) => {
    setMcpMsg("");
    try {
      if (on) {
        await startMcp(host, mcpPort);
        setMcpMsg(`Listening on ${mcpUrl(mcpPort)}`);
      } else {
        await stopMcp();
      }
      mcpPrefs.set(on, mcpPort);
      setMcpOn(on);
    } catch (e) {
      setMcpOn(false);
      setMcpMsg(String(e));
    }
  };

  const server = { port: mcpPort, on: mcpOn, msg: mcpMsg, onToggle: toggleMcp };
  const TABS: [Tab, string][] = [
    ["code", "Claude Code"],
    ["desktop", "Claude Desktop"],
    ["other", "Other apps"],
    ["chat", "Chat (API key)"],
  ];

  return (
    <div className="chat-panel">
      <div className="ai-tabs">
        {TABS.map(([id, label]) => (
          <button key={id} className={tab === id ? "on" : ""} onClick={() => pickTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === "code" && (
        <div className="ai-scroll">
          <ClaudeCodePage {...server} />
        </div>
      )}
      {tab === "desktop" && (
        <div className="ai-scroll">
          <ClaudeDesktopPage {...server} />
        </div>
      )}
      {tab === "other" && (
        <div className="ai-scroll">
          <OtherAppsPage {...server} />
        </div>
      )}
      {tab === "chat" && (
        <>
          <div className="ai-callout">
            This chat uses <b>your own API key</b> (Claude) or a <b>local model</b> (Ollama). No key? Use the{" "}
            <a href="#" onClick={(e) => (e.preventDefault(), pickTab("code"))}>Claude Code</a> or{" "}
            <a href="#" onClick={(e) => (e.preventDefault(), pickTab("desktop"))}>Claude Desktop</a> tab instead, and type your
            requests in those apps.
          </div>
          <div className="chat-bar">
            <button className="history-btn" onClick={() => setShowCfg((v) => !v)}>
              {showCfg ? "Hide API settings" : "API settings"}
            </button>
            <button
              className="history-btn"
              onClick={() => {
                turns.current = [];
                setRows([]);
              }}
            >
              New chat
            </button>
          </div>
          {showCfg && (
            <div className="chat-cfg">
              <label>
                Provider
                <select value={provider} onChange={(e) => setProvider(e.target.value as ChatProvider)}>
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="openai">OpenAI-compatible / Ollama (local)</option>
                </select>
              </label>
              <label>
                Model
                <input value={model} onChange={(e) => setModel(e.target.value)} placeholder={CHAT_DEFAULTS[provider].model} />
              </label>
              {provider === "openai" && (
                <label>
                  Base URL
                  <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={CHAT_DEFAULTS.openai.baseUrl} />
                </label>
              )}
              <label>
                API key{provider === "openai" ? " (optional for local models)" : ""}
                <input type="password" value={key} onChange={(e) => setKey(e.target.value)} />
              </label>
              <button className="history-btn" onClick={persistCfg}>
                Save
              </button>
            </div>
          )}
          <div className="chat-log">
            {rows.length === 0 && (
              <div className="chat-intro">
                <strong>Your drawing assistant</strong>
                <div>
                  Ask it to draw or change this canvas, e.g. <i>"Draw a login flow with 4 steps"</i> or <i>"Make all boxes blue"</i>.
                </div>
                <div className="chat-intro-ways">
                  First press <b>API settings</b> and choose one:
                  <ol>
                    <li><b>Claude</b>: pick Anthropic and paste your API key.</li>
                    <li><b>Local model</b>: pick OpenAI-compatible / Ollama (free, offline).</li>
                  </ol>
                </div>
              </div>
            )}
            {rows.map((r, i) =>
              r.kind === "tool" ? (
                <details key={i} className={"chat-tool" + (r.error ? " err" : "")}>
                  <summary>{r.name}</summary>
                  <pre>{r.result.slice(0, 1500)}</pre>
                </details>
              ) : (
                <div key={i} className={"chat-msg " + r.kind}>
                  {r.text}
                </div>
              )
            )}
            {busy && <div className="chat-msg assistant">…</div>}
            <div ref={endRef} />
          </div>
          <div className="chat-input">
            <textarea
              value={input}
              rows={3}
              placeholder="Message the assistant (Enter to send)"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            {busy ? (
              <button className="history-btn" onClick={() => abort.current?.abort()}>
                Stop
              </button>
            ) : (
              <button className="history-btn primary" onClick={send}>
                Send
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
