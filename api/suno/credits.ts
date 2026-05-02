function send(res: any, status: number, body: any) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function sunoErrorMessage(data: any, fallback: string) {
  const msg =
    (typeof data?.message === "string" && data.message) ||
    (typeof data?.error === "string" && data.error) ||
    (typeof data?.msg === "string" && data.msg) ||
    fallback;
  return String(msg);
}

function parseCreditsValue(raw: any) {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const cleaned = raw
      .trim()
      .replaceAll("Credits", "")
      .replaceAll("credits", "")
      .replaceAll(" ", "")
      .replaceAll(",", ".");
    const n = Number(cleaned);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

async function sunoFetchJson(path: string) {
  const base = process.env.SUNO_API_BASE_URL || process.env.SUNO_BASE_URL || "";
  if (!base) throw new Error("Falta SUNO_API_BASE_URL en Vercel → Environment Variables");

  const apiKey = process.env.SUNO_API_KEY || process.env.SUNO_KEY || "";
  if (!apiKey) throw new Error("Falta SUNO_API_KEY en Vercel → Environment Variables");

  const url = new URL(path, base).toString();
  const res = await fetch(url, { method: "GET", headers: { authorization: `Bearer ${apiKey}` } });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { res, data, text };
}

export default async function handler(req: any, res: any) {
  if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });

  try {
    const paths = [
      "/api/v1/get-credits",
      "/api/v1/generate/credit",
      "/api/v1/suno/get-credits",
      "/api/v1/suno/generate/credit",
      "/api/v1/suno/credits",
      "/api/v1/suno/credit",
    ];

    let last: any = null;
    for (const p of paths) {
      const r = await sunoFetchJson(p);
      last = r;
      if (r.res.status !== 404) break;
    }
    const r = last;

    if (!r?.res?.ok) {
      const msg = sunoErrorMessage(r?.data, r?.text || `HTTP ${r?.res?.status || 0}`);
      return send(res, 502, { error: "Error consultando créditos", code: r?.res?.status || 0, detail: String(msg).slice(0, 1200) });
    }

    const code = Number(r.data?.code);
    if (code && code !== 200) {
      const msg = sunoErrorMessage(r.data, "Error del proveedor");
      return send(res, 502, { error: "Error consultando créditos", code, detail: String(msg).slice(0, 1200) });
    }

    const raw = r.data?.data?.credits ?? r.data?.data;
    const parsed = parseCreditsValue(raw);
    const credits = Number.isFinite(parsed) ? parsed : 0;
    return send(res, 200, { credits });
  } catch (e) {
    return send(res, 500, { error: "Error interno", detail: e instanceof Error ? e.message : String(e) });
  }
}
