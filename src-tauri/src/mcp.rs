//! Local MCP server (Streamable HTTP, JSON responses) bound to 127.0.0.1.
//!
//! The Rust side only speaks the protocol. Tool definitions are registered by the
//! frontend (`mcp_set_tools`) and tool calls are forwarded to the webview as an
//! `mcp-call` event; the webview answers through `mcp_respond`. That keeps one single
//! implementation of the canvas tools (shared with the in-app AI chat).

use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::Read;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
use tiny_http::{Header, Method, Response, Server};

const PROTOCOL_VERSION: &str = "2025-03-26";
const CALL_TIMEOUT: Duration = Duration::from_secs(90);
const MAX_BODY: u64 = 32 * 1024 * 1024;

#[derive(Default)]
pub struct McpState {
    server: Mutex<Option<Arc<Server>>>,
    port: Mutex<Option<u16>>,
    tools: Mutex<Value>,
    prompts: Mutex<Value>,
    pending: Mutex<HashMap<u64, Sender<Value>>>,
    counter: AtomicU64,
}

fn json_header() -> Header {
    Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap()
}

fn rpc_error(id: Value, code: i64, message: &str) -> Value {
    json!({"jsonrpc":"2.0","id":id,"error":{"code":code,"message":message}})
}

/// Reject requests that did not come from a local, non-browser client
/// (DNS-rebinding / drive-by protection required by the MCP transport spec).
fn request_allowed(req: &tiny_http::Request) -> bool {
    let mut host_ok = false;
    for h in req.headers() {
        let name = h.field.as_str().as_str().to_ascii_lowercase();
        let val = h.value.as_str();
        if name == "origin" {
            return false;
        }
        if name == "host" {
            let host = val.rsplit_once(':').map(|x| x.0).unwrap_or(val);
            host_ok = matches!(host, "127.0.0.1" | "localhost" | "[::1]");
        }
    }
    host_ok
}

fn handle_rpc(app: &AppHandle, state: &McpState, msg: Value) -> Option<Value> {
    let id = msg.get("id").cloned();
    let method = msg.get("method").and_then(|m| m.as_str()).unwrap_or("");
    // notifications and responses carry no reply
    let id = match id {
        Some(i) if !method.is_empty() => i,
        _ => return None,
    };
    let result = match method {
        "initialize" => json!({
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {"tools": {"listChanged": false}, "prompts": {"listChanged": false}},
            "serverInfo": {"name": "excalidraw-desktop", "version": env!("CARGO_PKG_VERSION")},
            "instructions": "Controls the drawing currently open in Excalidraw Desktop. Call get_canvas before editing; use add_elements/create_from_mermaid to draw."
        }),
        "ping" => json!({}),
        "tools/list" => json!({"tools": state.tools.lock().unwrap().clone()}),
        "prompts/list" => {
            let all = state.prompts.lock().unwrap().clone();
            let list: Vec<Value> = all
                .as_array()
                .map(|a| {
                    a.iter()
                        .map(|p| {
                            json!({
                                "name": p["name"], "title": p["title"], "description": p["description"],
                                "arguments": p.get("arguments").cloned().unwrap_or_else(|| json!([]))
                            })
                        })
                        .collect()
                })
                .unwrap_or_default();
            json!({"prompts": list})
        }
        "prompts/get" => {
            let params = msg.get("params").cloned().unwrap_or(Value::Null);
            let name = params.get("name").and_then(|n| n.as_str()).unwrap_or("");
            let all = state.prompts.lock().unwrap().clone();
            let found = all.as_array().and_then(|a| a.iter().find(|p| p["name"] == name)).cloned();
            match found {
                None => return Some(rpc_error(id, -32602, "Unknown prompt")),
                Some(p) => {
                    let mut text = p["text"].as_str().unwrap_or("").to_string();
                    if let Some(args) = params.get("arguments").and_then(|a| a.as_object()) {
                        for (k, v) in args {
                            text = text.replace(&format!("{{{{{}}}}}", k), v.as_str().unwrap_or(""));
                        }
                    }
                    json!({"description": p["description"], "messages": [{"role": "user", "content": {"type": "text", "text": text}}]})
                }
            }
        }
        "tools/call" => {
            let params = msg.get("params").cloned().unwrap_or(Value::Null);
            let name = params.get("name").cloned().unwrap_or(Value::Null);
            let args = params.get("arguments").cloned().unwrap_or_else(|| json!({}));
            let call_id = state.counter.fetch_add(1, Ordering::Relaxed);
            let (tx, rx) = channel();
            state.pending.lock().unwrap().insert(call_id, tx);
            if app
                .emit("mcp-call", json!({"id": call_id, "name": name, "arguments": args}))
                .is_err()
            {
                state.pending.lock().unwrap().remove(&call_id);
                return Some(rpc_error(id, -32603, "UI unavailable"));
            }
            match rx.recv_timeout(CALL_TIMEOUT) {
                Ok(v) => v,
                Err(_) => {
                    state.pending.lock().unwrap().remove(&call_id);
                    return Some(rpc_error(id, -32603, "Tool call timed out"));
                }
            }
        }
        _ => return Some(rpc_error(id, -32601, "Method not found")),
    };
    Some(json!({"jsonrpc":"2.0","id":id,"result":result}))
}

fn serve_one(app: &AppHandle, mut req: tiny_http::Request) {
    if !request_allowed(&req) {
        let _ = req.respond(Response::from_string("forbidden").with_status_code(403));
        return;
    }
    match (req.method().clone(), req.url().split('?').next().unwrap_or("")) {
        (Method::Post, "/mcp") | (Method::Post, "/") => {}
        (Method::Get, "/health") => {
            let _ = req.respond(Response::from_string("ok"));
            return;
        }
        _ => {
            let _ = req.respond(Response::from_string("method not allowed").with_status_code(405));
            return;
        }
    }
    let mut body = String::new();
    if req.as_reader().take(MAX_BODY).read_to_string(&mut body).is_err() {
        let _ = req.respond(Response::from_string("bad body").with_status_code(400));
        return;
    }
    let parsed: Value = match serde_json::from_str(&body) {
        Ok(v) => v,
        Err(_) => {
            let r = Response::from_string(rpc_error(Value::Null, -32700, "Parse error").to_string())
                .with_header(json_header())
                .with_status_code(400);
            let _ = req.respond(r);
            return;
        }
    };
    let state = app.state::<McpState>();
    let reply = match parsed {
        Value::Array(items) => {
            let out: Vec<Value> = items
                .into_iter()
                .filter_map(|m| handle_rpc(app, &state, m))
                .collect();
            if out.is_empty() { None } else { Some(Value::Array(out)) }
        }
        single => handle_rpc(app, &state, single),
    };
    let _ = match reply {
        Some(v) => req.respond(Response::from_string(v.to_string()).with_header(json_header())),
        None => req.respond(Response::empty(202)),
    };
}

#[tauri::command]
pub fn mcp_set_tools(state: State<'_, McpState>, tools: Value) {
    *state.tools.lock().unwrap() = tools;
}

#[tauri::command]
pub fn mcp_set_prompts(state: State<'_, McpState>, prompts: Value) {
    *state.prompts.lock().unwrap() = prompts;
}

#[tauri::command]
pub fn mcp_respond(state: State<'_, McpState>, id: u64, result: Value) {
    if let Some(tx) = state.pending.lock().unwrap().remove(&id) {
        let _ = tx.send(result);
    }
}

#[tauri::command]
pub fn mcp_status(state: State<'_, McpState>) -> Option<u16> {
    *state.port.lock().unwrap()
}

#[tauri::command]
pub fn mcp_stop(state: State<'_, McpState>) {
    if let Some(s) = state.server.lock().unwrap().take() {
        s.unblock();
    }
    *state.port.lock().unwrap() = None;
}

#[tauri::command]
pub fn mcp_start(app: AppHandle, state: State<'_, McpState>, port: u16) -> Result<u16, String> {
    // already listening on this port (e.g. the page reloaded): nothing to do
    if *state.port.lock().unwrap() == Some(port) && state.server.lock().unwrap().is_some() {
        return Ok(port);
    }
    mcp_stop(state.clone());
    let server = Arc::new(
        Server::http(("127.0.0.1", port)).map_err(|e| format!("Cannot listen on 127.0.0.1:{port}: {e}"))?,
    );
    *state.server.lock().unwrap() = Some(server.clone());
    *state.port.lock().unwrap() = Some(port);
    std::thread::spawn(move || {
        for req in server.incoming_requests() {
            let app = app.clone();
            std::thread::spawn(move || serve_one(&app, req));
        }
    });
    Ok(port)
}
