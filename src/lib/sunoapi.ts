type FetchJsonResult = { res: Response; data: any; text: string };

export function absoluteUrlFromRequest(req: Request, pathname: string) {
  const base = new URL(req.url);
  return new URL(pathname, base.origin).toString();
}

export function sunoErrorMessage(data: any, fallback: string) {
  const msg =
    (typeof data?.message === "string" && data.message) ||
    (typeof data?.error === "string" && data.error) ||
    (typeof data?.msg === "string" && data.msg) ||
    fallback;
  return String(msg);
}

export async function sunoFetchJson(req: Request, path: string, init?: RequestInit): Promise<FetchJsonResult> {
  const base =
    (typeof process !== "undefined" && process?.env && (process.env.SUNO_API_BASE_URL || process.env.SUNO_BASE_URL)) ||
    "";
  const url = base ? new URL(path, base).toString() : path;

  const headers = new Headers(init?.headers);
  if (!headers.has("content-type")) headers.set("content-type", "application/json");

  const res = await fetch(url, {
    ...init,
    headers,
  });

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  return { res, data, text };
}

