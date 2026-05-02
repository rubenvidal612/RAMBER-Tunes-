function send(res: any, status: number, body: any) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return send(res, 405, { error: "Método no permitido" });
  return send(res, 200, { ok: true });
}

