// safe-fetch.ts — SSRF-guarded HTTP fetch helper
//
// Used by brain-extract-brand (and any future server-side URL fetching).
// Lives in server/lib (NEVER server/plugins — Nitro bundling rule).
//
// SSRF mitigations enforced:
//   1. Protocol allow-list: http: and https: only (blocks file:, ftp:, data:, javascript:, etc.)
//   2. No credentials in URL (no user:password@ component)
//   3. No private/loopback/link-local IPs — IPv4 and IPv6 ranges blocked
//   4. 10s request timeout
//   5. 2MB body cap (reads no more than 2MB then aborts further)
//
// Returns: { ok: true, body: string } or { ok: false, error: string }

/** Parsed hostname validated against SSRF-unsafe ranges. */
function isPrivateHost(hostname: string): boolean {
  // Strip IPv6 brackets: [::1] → ::1
  const host = hostname.replace(/^\[/, "").replace(/\]$/, "");

  // localhost / loopback names
  if (host === "localhost" || host.endsWith(".localhost")) return true;

  // IPv4 private / loopback / link-local / broadcast ranges
  const ipv4 = host.match(
    /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/,
  );
  if (ipv4) {
    const [, a, b, c, d] = ipv4.map(Number);
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 10) return true; // 10.0.0.0/8 RFC-1918
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 RFC-1918
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 RFC-1918
    if (a === 0) return true; // 0.0.0.0/8 this-network
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 shared-addr
    if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
    if (a === 240) return true; // 240.0.0.0/4 reserved
    if (a === 255 && b === 255 && c === 255 && d === 255) return true; // broadcast
    return false;
  }

  // IPv6 loopback / link-local / unique-local / unspecified
  if (host === "::1") return true; // loopback
  if (host === "::") return true; // unspecified
  const lower = host.toLowerCase();
  if (lower.startsWith("fe80:")) return true; // link-local fe80::/10
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique-local fc00::/7
  if (lower.startsWith("::ffff:")) {
    // IPv4-mapped IPv6 — recurse with the embedded IPv4 address
    return isPrivateHost(lower.slice(7));
  }

  return false;
}

const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2MB
const TIMEOUT_MS = 10_000; // 10s

export type SafeFetchResult =
  | { ok: true; body: string }
  | { ok: false; error: string };

export async function safeFetch(rawUrl: string): Promise<SafeFetchResult> {
  // 1. Parse and validate URL
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, error: "INVALID_URL" };
  }

  // 2. Protocol allow-list
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "DISALLOWED_PROTOCOL" };
  }

  // 3. No credentials in URL
  if (parsed.username || parsed.password) {
    return { ok: false, error: "CREDENTIALS_IN_URL" };
  }

  // 4. Block private/loopback/link-local hosts
  if (isPrivateHost(parsed.hostname)) {
    return { ok: false, error: "PRIVATE_HOST" };
  }

  // 5. Fetch with timeout + size cap
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(parsed.href, {
      signal: controller.signal,
      headers: {
        // Identify ourselves politely; many sites reject headless requests
        "User-Agent": "RunStudio-BrandExtractor/1.0",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      },
      redirect: "follow",
    });
  } catch (err: unknown) {
    clearTimeout(timer);
    const message =
      err instanceof Error ? err.message : String(err ?? "fetch error");
    if (message.includes("abort") || message.includes("timeout")) {
      return { ok: false, error: "TIMEOUT" };
    }
    return { ok: false, error: `FETCH_ERROR: ${message}` };
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    return { ok: false, error: `HTTP_${response.status}` };
  }

  // 6. Body size cap — read via streaming to avoid buffering entire response
  const reader = response.body?.getReader();
  if (!reader) {
    return { ok: false, error: "NO_BODY" };
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_BODY_BYTES) {
        reader.cancel();
        break; // Truncate — still return what we have; caller can handle partial HTML
      }
      chunks.push(value);
    }
  } catch {
    // Stream error — return what we have so far
  }

  // Decode collected chunks
  const fullBuffer = new Uint8Array(
    chunks.reduce((acc, c) => acc + c.byteLength, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    fullBuffer.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const body = new TextDecoder().decode(fullBuffer);
  return { ok: true, body };
}
