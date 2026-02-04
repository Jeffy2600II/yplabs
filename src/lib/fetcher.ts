// small helper: fetch with timeout and nicer errors
export async function fetchWithTimeout(input: RequestInfo | URL, init ? : RequestInit, timeout = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(input, { ...init, signal: controller.signal } as RequestInit);
    clearTimeout(id);
    if (!res.ok) {
      // throw with body message if available
      let bodyText = await res.text().catch(() => "");
      const msg = bodyText ? `HTTP ${res.status} ${res.statusText}: ${bodyText}` : `HTTP ${res.status} ${res.statusText}`;
      const err: any = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return res;
  } catch (err: any) {
    if (err.name === "AbortError") throw new Error("Request timeout");
    throw err;
  } finally {
    clearTimeout(id);
  }
}