// Safe fetching of a grades link: https only, no private or local addresses, no redirects, a timeout and a size limit.

const MAX_BYTES = 2_000_000;

function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  return false;
}

export function checkFeedUrl(raw: string): { ok: true; url: URL } | { ok: false; error: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, error: "That isn't a valid link." };
  }
  if (url.protocol !== "https:") return { ok: false, error: "The link must start with https://." };
  if (url.username || url.password) return { ok: false, error: "Links with a login in them aren't supported." };
  if (isBlockedHost(url.hostname)) return { ok: false, error: "That address isn't allowed." };
  return { ok: true, url };
}

export async function fetchFeedText(raw: string, apiKey?: string): Promise<{ text: string; fileName: string }> {
  const checked = checkFeedUrl(raw);
  if (!checked.ok) throw new Error(checked.error);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(checked.url, {
      redirect: "manual", // this runtime doesn't accept "error"; a redirect is refused below
      signal: controller.signal,
      headers: {
        // Browsers send text/html first; some apps refuse requests that don't accept HTML (406).
        // Same as a browser fetch(): the grades app answers JSON to */* but HTML when HTML is preferred.
        Accept: "*/*",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
    });
    if (res.status >= 300 && res.status < 400) throw new Error("The link redirects, which isn't allowed. Use the app's direct address.");
    if (!res.ok) {
      // Show the API's own reason (its JSON "error" field) when it sends one.
      let reason = "";
      try {
        const body = (await res.text()).slice(0, 500);
        const parsed = JSON.parse(body) as { error?: unknown; message?: unknown };
        const detail = parsed.error ?? parsed.message;
        if (typeof detail === "string") reason = detail;
        else if (detail && typeof detail === "object" && "message" in detail) reason = String((detail as { message: unknown }).message);
      } catch {
        /* not JSON: keep only the status */
      }
      throw new Error(`The link answered with an error (${res.status})${reason ? `: ${reason}` : "."}`);
    }
    if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) throw new Error("That file is too large.");
    const reader = res.body?.getReader();
    if (!reader) throw new Error("The link returned nothing.");
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel();
        throw new Error("That file is too large.");
      }
      chunks.push(value);
    }
    const text = new TextDecoder().decode(Buffer.concat(chunks));
    const type = res.headers.get("content-type") ?? "";
    const fileName = type.includes("csv") ? "feed.csv" : type.includes("json") || /^\s*[[{]/.test(text) ? "feed.json" : "feed.txt";
    return { text, fileName };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw new Error("The link took too long to answer.");
    throw err instanceof Error ? err : new Error("Could not reach that link.");
  } finally {
    clearTimeout(timer);
  }
}
