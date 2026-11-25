// Tool-calling agent loop for the in-app AI assistant.
// Providers: Anthropic (SDK) and any OpenAI-compatible endpoint (OpenAI, Ollama, LM Studio, llama.cpp...),
// the latter makes the assistant usable fully offline with a local model.
import Anthropic from "@anthropic-ai/sdk";
import { invoke } from "@tauri-apps/api/core";
import { TOOLS, runTool, type ToolHost } from "./tools";

export type ChatProvider = "anthropic" | "openai";

export interface ChatConfig {
  provider: ChatProvider;
  model: string;
  baseUrl: string; // openai-compatible only
  apiKey: string;
}

export const CHAT_DEFAULTS: Record<ChatProvider, { model: string; baseUrl: string }> = {
  anthropic: { model: "claude-sonnet-5-5", baseUrl: "" },
  openai: { model: "llama3.1", baseUrl: "http://localhost:11434/v1" },
};

export type ChatEvent =
  | { kind: "text"; text: string }
  | { kind: "tool"; name: string; args: unknown; result: string; error?: boolean };

export interface Turn {
  role: "user" | "assistant";
  text: string;
}

const SYSTEM = `You are the drawing assistant inside Excalidraw Desktop. You read and edit the user's current canvas through tools.
- Call get_canvas first when the request refers to existing content. Use read_canvas_image to look at the result when layout matters.
- Prefer create_from_mermaid for flowcharts, sequence and class diagrams; use add_elements for free-form drawings.
- Make minimal edits: change only what was asked, keep the user's layout and styling.
- Keep at least 60px between connected shapes; size shapes about 180x70 when unsure; keep labels short.
- Excalidraw palette: fills red #ffc9c9, orange #ffd8a8, yellow #ffec99, green #b2f2bb, teal #96f2d7, blue #a5d8ff, violet #d0bfff, pink #eebefa, gray #e9ecef; strokes #e03131 #f08c00 #2f9e44 #1971c2 #6741d9 #1e1e1e.
- Destructive actions (clear_canvas, restore_file_history) only when the user clearly asked for them.
Answer briefly after finishing.`;

const MAX_STEPS = 12;

// ---- API keys: OS keychain via the Rust side, localStorage fallback
export async function loadChatKey(provider: ChatProvider): Promise<string> {
  try {
    return (await invoke<string | null>("secret_load", { provider })) ?? "";
  } catch {
    return localStorage.getItem(`chat-key-${provider}`) ?? "";
  }
}
export async function saveChatKey(provider: ChatProvider, key: string): Promise<void> {
  try {
    if (key) await invoke("secret_store", { provider, key });
    else await invoke("secret_delete", { provider });
  } catch {
    localStorage.setItem(`chat-key-${provider}`, key);
  }
}

export async function runAgent(
  cfg: ChatConfig,
  prior: Turn[],
  userText: string,
  host: ToolHost,
  onEvent: (e: ChatEvent) => void,
  signal: AbortSignal
): Promise<string> {
  return cfg.provider === "anthropic"
    ? runAnthropic(cfg, prior, userText, host, onEvent, signal)
    : runOpenAI(cfg, prior, userText, host, onEvent, signal);
}

async function runAnthropic(cfg: ChatConfig, prior: Turn[], userText: string, host: ToolHost, onEvent: (e: ChatEvent) => void, signal: AbortSignal) {
  const client = new Anthropic({ apiKey: cfg.apiKey, dangerouslyAllowBrowser: true });
  const tools = TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema as any }));
  const messages: Anthropic.MessageParam[] = [
    ...prior.map((t) => ({ role: t.role, content: t.text }) as Anthropic.MessageParam),
    { role: "user", content: userText },
  ];
  let final = "";
  for (let step = 0; step < MAX_STEPS; step++) {
    const resp = await client.messages.create(
      { model: cfg.model, max_tokens: 4096, system: SYSTEM, tools, messages },
      { signal }
    );
    messages.push({ role: "assistant", content: resp.content });
    const texts = resp.content.filter((b) => b.type === "text").map((b: any) => b.text).join("\n");
    if (texts) {
      final = texts;
      onEvent({ kind: "text", text: texts });
    }
    const uses = resp.content.filter((b) => b.type === "tool_use") as Anthropic.ToolUseBlock[];
    if (!uses.length) break;
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const u of uses) {
      const r = await runTool(host, u.name, u.input as any);
      onEvent({ kind: "tool", name: u.name, args: u.input, result: r.text, error: r.isError });
      results.push({
        type: "tool_result",
        tool_use_id: u.id,
        is_error: r.isError,
        content: [
          { type: "text", text: r.text },
          ...(r.imageBase64
            ? [{ type: "image" as const, source: { type: "base64" as const, media_type: "image/png" as const, data: r.imageBase64 } }]
            : []),
        ],
      });
    }
    messages.push({ role: "user", content: results });
  }
  return final;
}

async function runOpenAI(cfg: ChatConfig, prior: Turn[], userText: string, host: ToolHost, onEvent: (e: ChatEvent) => void, signal: AbortSignal) {
  const base = (cfg.baseUrl || CHAT_DEFAULTS.openai.baseUrl).replace(/\/+$/, "");
  const tools = TOOLS.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.inputSchema } }));
  const messages: any[] = [
    { role: "system", content: SYSTEM },
    ...prior.map((t) => ({ role: t.role, content: t.text })),
    { role: "user", content: userText },
  ];
  let final = "";
  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}) },
      body: JSON.stringify({ model: cfg.model, messages, tools }),
    });
    if (!res.ok) throw new Error(`Model endpoint error ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const msg = (await res.json()).choices?.[0]?.message;
    if (!msg) throw new Error("Empty response from model endpoint");
    messages.push(msg);
    if (msg.content) {
      final = msg.content;
      onEvent({ kind: "text", text: msg.content });
    }
    const calls: any[] = msg.tool_calls ?? [];
    if (!calls.length) break;
    let image: string | undefined;
    for (const c of calls) {
      let args: any = {};
      try {
        args = JSON.parse(c.function.arguments || "{}");
      } catch {
        /* model sent malformed JSON; tool will report missing args */
      }
      const r = await runTool(host, c.function.name, args);
      onEvent({ kind: "tool", name: c.function.name, args, result: r.text, error: r.isError });
      messages.push({ role: "tool", tool_call_id: c.id, content: r.text });
      if (r.imageBase64) image = r.imageBase64;
    }
    // tool messages are text-only in this API: pass the picture as a follow-up user turn
    if (image)
      messages.push({
        role: "user",
        content: [
          { type: "text", text: "Canvas image:" },
          { type: "image_url", image_url: { url: `data:image/png;base64,${image}` } },
        ],
      });
  }
  return final;
}
