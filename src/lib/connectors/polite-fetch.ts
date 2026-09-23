import "server-only";

// Section 6.4: "Rate-limit every connector... set a real User-Agent
// identifying ABPO with a contact address, and back off on errors."
export const CONNECTOR_USER_AGENT = "ABPOCommandBot/1.0 (+data@assortedtrade.com)";

const lastCallAtByHost = new Map<string, number>();

/** Minimum gap between requests to the same host, so a single fetch run
 * can't hammer a provider even if it returns many pages. */
async function throttle(host: string, minIntervalMs: number) {
  const last = lastCallAtByHost.get(host) ?? 0;
  const wait = last + minIntervalMs - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAtByHost.set(host, Date.now());
}

export async function politeFetch(
  url: string,
  init: RequestInit = {},
  opts: { minIntervalMs?: number; maxRetries?: number } = {},
): Promise<Response> {
  const host = new URL(url).host;
  const minIntervalMs = opts.minIntervalMs ?? 1100;
  const maxRetries = opts.maxRetries ?? 2;

  let attempt = 0;
  for (;;) {
    await throttle(host, minIntervalMs);
    const res = await fetch(url, {
      ...init,
      headers: { "User-Agent": CONNECTOR_USER_AGENT, ...init.headers },
    });
    if (res.ok || attempt >= maxRetries || (res.status < 500 && res.status !== 429)) return res;
    attempt += 1;
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
  }
}
