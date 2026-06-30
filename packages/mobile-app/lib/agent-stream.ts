// Mobile SSE consumer for /api/m/agent/stream — D2-06 AGENT-03.
//
// Uses react-native-sse so we can:
//   1) POST a request body (browser EventSource only supports GET),
//   2) send Authorization: Bearer <token> (MA1-02 — real session auth),
//   3) listen for named events (delta / tool_use / tool_result / done / error)
//      instead of having to JSON-parse a single message stream.
//
// RESEARCH Finding 5: react-native-sse stores options.headers in this.headers
// and re-calls setRequestHeader on every open() (including reconnects), so
// Bearer survives both the initial connection and any automatic reconnect.
//
// Returns a cancel() that the caller invokes on sheet close / unmount to
// abort an in-flight stream and stop charging tokens.
import EventSource from "react-native-sse";
import { getSessionToken } from "./session";
import { API_BASE_URL } from "./api";

export type StreamCallbacks = {
  onDelta: (text: string) => void;
  onToolUse?: (e: { name: string; id: string; input: any }) => void;
  onToolResult?: (e: { id: string; result: any }) => void;
  onDone: (e: { stop_reason: string }) => void;
  onError: (err: any) => void;
};

// Custom SSE event names emitted by /api/m/agent/stream. react-native-sse
// is generic over its event-name union — without this generic, calls to
// addEventListener("delta", ...) fail TS because the default type is "open" |
// "message" | "error" | "close".
type AgentEvents = "delta" | "tool_use" | "tool_result" | "done";

/**
 * Open an SSE connection to /api/m/agent/stream.
 * Returns a cancel function that closes the connection.
 */
export async function streamAgent(
  messages: Array<{ role: "user" | "assistant"; content: any }>,
  cb: StreamCallbacks,
  endpoint: string = "/api/m/agent/stream",
): Promise<() => void> {
  const token = await getSessionToken();
  if (!token) throw new Error("Not signed in");

  // Token is captured at construction time and stored in this.headers by
  // react-native-sse. Every open() (including reconnects) re-sets the header
  // via setRequestHeader — see RESEARCH Finding 5 / Pitfall 7.
  // The endpoint param (default = member coach) lets MA4-03 point an admin's
  // sheet at /api/m/admin/agent/stream without a second SSE client.
  const es = new EventSource<AgentEvents>(`${API_BASE_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ messages }),
  } as any);

  es.addEventListener("delta", (e: any) => {
    try {
      cb.onDelta(JSON.parse(e.data).text ?? "");
    } catch {}
  });
  es.addEventListener("tool_use", (e: any) => {
    try {
      cb.onToolUse?.(JSON.parse(e.data));
    } catch {}
  });
  es.addEventListener("tool_result", (e: any) => {
    try {
      cb.onToolResult?.(JSON.parse(e.data));
    } catch {}
  });
  es.addEventListener("done", (e: any) => {
    let parsed = { stop_reason: "end_turn" };
    try {
      parsed = JSON.parse(e.data);
    } catch {}
    cb.onDone(parsed);
    es.close();
  });
  es.addEventListener("error", (e: any) => {
    cb.onError(e);
    es.close();
  });

  return () => es.close();
}
