import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

// One-off recovery: only the exact manifest checked against live DB references
// on 2026-10-07 00:23 UTC, with a short expiry. No general delete capability.
const MANIFEST_SHA256 = "4af8994b8d9fbff2a68ee011c0a9aa7a2bcae32c4ef583753d8e1319c4e3ec64";
const EXPIRES = Date.parse("2026-10-07T01:00:00Z");
export default async function handler(req: any, res: any) {
  res.setHeader("cache-control", "no-store");
  const reply = (status: number, body: any) => { res.statusCode = status; res.setHeader("content-type", "application/json"); res.end(JSON.stringify(body)); };
  if (req.method !== "POST") return reply(405, { ok: false });
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return reply(401, { ok: false });
  if (Date.now() > EXPIRES) return reply(410, { ok: false, error: "Recovery window expired" });
  let body: any;
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body; } catch { return reply(400, { ok: false }); }
  const paths = body?.paths;
  if (!Array.isArray(paths) || paths.length !== 194 || paths.some((p: any) => typeof p !== "string" || !p.startsWith("uploads/audio/") || p.split("/").includes(".."))) return reply(400, { ok: false });
  if (createHash("sha256").update(JSON.stringify(paths)).digest("hex") !== MANIFEST_SHA256) return reply(403, { ok: false, error: "Unapproved manifest" });
  const url = process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) return reply(503, { ok: false });
  const admin = createClient(url, key, { auth: { persistSession: false } });
  let deleted = 0;
  for (let i = 0; i < paths.length; i += 50) {
    const batch = paths.slice(i, i + 50);
    const { data, error } = await admin.storage.from("ramber-tunes").remove(batch);
    if (error) return reply(502, { ok: false, deleted, error: error.message });
    const confirmed = new Set((data || []).map((o: any) => o.name));
    deleted += batch.filter(p => confirmed.has(p)).length;
    if (confirmed.size !== batch.length) return reply(502, { ok: false, deleted, error: "Storage did not confirm the entire batch" });
  }
  return reply(200, { ok: true, deleted });
}
