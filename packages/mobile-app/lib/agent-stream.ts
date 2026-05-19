// Mobile SSE consumer for /api/m/agent/stream — D2-06 AGENT-03.
//
// Uses react-native-sse so we can:
//   1) POST a request body (browser EventSource only supports GET),
//   2) send the X-Demo-Member-Id header (D-07 demo auth),
//   3) listen for named events (delta / tool_use / tool_result / done / error)
//      instead of having to JSON-parse a single message stream.
//
// Returns a cancel() that the caller invokes on sheet close / unmount to
// abort an in-flight stream and stop charging tokens.
import EventSource from "react-native-sse";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
): Promise<() => void> {
  const memberId = await AsyncStorage.getItem("demoMemberId");
  if (!memberId) throw new Error("No member selected");

  const es = new EventSource<AgentEvents>(`${API_BASE_URL}/api/m/agent/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Demo-Member-Id": memberId,
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
