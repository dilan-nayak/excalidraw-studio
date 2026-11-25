// Frontend half of the MCP server: registers tool definitions with the Rust HTTP server and
// executes incoming tool calls with the same implementations the AI chat uses.
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { TOOLS, runTool, type ToolHost } from "./tools";
import { PROMPTS } from "./prompts";

export const MCP_DEFAULT_PORT = 7421;
const KEY_ENABLED = "mcp-enabled";
const KEY_PORT = "mcp-port";

export const mcpPrefs = {
  enabled: () => localStorage.getItem(KEY_ENABLED) === "1",
  port: () => Number(localStorage.getItem(KEY_PORT)) || MCP_DEFAULT_PORT,
  set(enabled: boolean, port: number) {
    localStorage.setItem(KEY_ENABLED, enabled ? "1" : "0");
    localStorage.setItem(KEY_PORT, String(port));
  },
};

let unlisten: UnlistenFn | null = null;

export async function startMcp(host: ToolHost, port: number): Promise<number> {
  await invoke("mcp_set_tools", {
    tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
  });
  await invoke("mcp_set_prompts", { prompts: PROMPTS });
  if (!unlisten) {
    unlisten = await listen<{ id: number; name: string; arguments: Record<string, unknown> }>("mcp-call", async (ev) => {
      const { id, name, arguments: args } = ev.payload;
      const r = await runTool(host, name, args);
      const content: unknown[] = [{ type: "text", text: r.text }];
      if (r.imageBase64) content.push({ type: "image", data: r.imageBase64, mimeType: "image/png" });
      await invoke("mcp_respond", { id, result: { content, isError: !!r.isError } });
    });
  }
  return invoke<number>("mcp_start", { port });
}

export async function stopMcp(): Promise<void> {
  await invoke("mcp_stop");
  unlisten?.();
  unlisten = null;
}

export const mcpUrl = (port: number) => `http://127.0.0.1:${port}/mcp`;
