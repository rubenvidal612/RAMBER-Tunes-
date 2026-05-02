import { createClient } from "@supabase/supabase-js";

const TABLE = "library_items";
const ITEM_TYPE = "song";
const BUCKET = "ramber-tunes";

function send(res: any, status: number, body: any) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function pickQuery(req: any, key: string) {
  const url = new URL(req.url, "http://localhost");
  return url.searchParams.get(key) || "";
}

function parseJsonBody(req: any) {
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }
  return req.body ?? null;
}

function getAuthToken(req: any) {
  const authHeader = (req.headers.authorization || "").toString();
  return authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
}

async function requireUser(req: any) {
  const supabaseUrl = process.env.SUPABASE_URL || "";
  const supabaseAnon = process.env.SUPABASE_ANON_KEY || "";
  const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !supabaseAnon || !supabaseService) {
    return { ok: false as const, status: 500, error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)" };
  }

  const token = getAuthToken(req);
  if (!token) return { ok: false as const, status: 401, error: "No autorizado" };

  const supabase = createClient(supabaseUrl, supabaseAnon, { auth: { persistSession: false } });
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  const user = userData?.user;
  if (userErr || !user) return { ok: false as const, status: 401, error: "No autorizado" };

  const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });
  return { ok: true as const, user, admin, supabaseUrl };
}

async function hasPaid(admin: any, userId: string) {
  const { data } = await admin
    .from("mp_transactions")
    .select("id")
    .eq("user_id", userId)
    .eq("kind", "songs")
    .gt("amount_mxn", 0)
    .limit(1);
  return Array.isArray(data) && data.length > 0;
}

function storagePathFromPublicUrl(supabaseUrl: string, bucket: string, url: string) {
  try {
    const u = new URL(url);
    if (!supabaseUrl) return null;
    const supa = new URL(supabaseUrl);
    const marker = `/storage/v1/object/public/${bucket}/`;
    const idx = u.pathname.indexOf(marker);
    if (idx < 0) return null;
    const path = u.pathname.slice(idx + marker.length);
    const decoded = decodeURIComponent(path);
    if (!decoded) return null;
    return decoded;
  } catch {
    return null;
  }
}

function shouldDeletePhysicalFile(path: string) {
  return path.startsWith("uploads/") || path.startsWith("personas/");
}

async function deletePhysicalFiles(admin: any, supabaseUrl: string, rows: any[]) {
  const paths: string[] = [];
  for (const r of rows) {
    const a = typeof r?.audio_url === "string" ? r.audio_url : "";
    const c = typeof r?.cover_url === "string" ? r.cover_url : "";
    for (const url of [a, c]) {
      if (!url) continue;
      const p = storagePathFromPublicUrl(supabaseUrl, BUCKET, url);
      if (!p) continue;
      if (!shouldDeletePhysicalFile(p)) continue;
      paths.push(p);
    }
  }
  const unique = Array.from(new Set(paths)).filter(Boolean);
  if (unique.length === 0) return 0;
  const { error } = await admin.storage.from(BUCKET).remove(unique);
  if (error) return 0;
  return unique.length;
}

async function cleanupFreeUser(admin: any, supabaseUrl: string, userId: string) {
  const paid = await hasPaid(admin, userId);
  if (paid) return 0;

  const cutoff = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await admin
    .from(TABLE)
    .select("id, audio_url, cover_url, created_at")
    .eq("user_id", userId)
    .eq("type", ITEM_TYPE)
    .is("deleted_at", null)
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(500);
  const rows = Array.isArray(data) ? data : [];
  if (rows.length === 0) return 0;

  await deletePhysicalFiles(admin, supabaseUrl, rows);

  const ids = rows.map((r) => String(r?.id || "")).filter(Boolean);
  if (ids.length === 0) return 0;
  const { error } = await admin.from(TABLE).delete().in("id", ids).eq("user_id", userId).eq("type", ITEM_TYPE);
  if (error) return 0;
  return ids.length;
}

async function enforceLimit100(admin: any, supabaseUrl: string, userId: string) {
  const { count } = await admin
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("type", ITEM_TYPE)
    .is("deleted_at", null);
  const total = typeof count === "number" ? count : 0;
  if (total < 100) return { deleted: false as const };

  const needToDelete = Math.max(1, total - 99);
  const { data } = await admin
    .from(TABLE)
    .select("id, title, created_at, audio_url, cover_url")
    .eq("user_id", userId)
    .eq("type", ITEM_TYPE)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(needToDelete);
  const rows = Array.isArray(data) ? data : [];
  const ids = rows.map((r) => String(r?.id || "")).filter(Boolean);
  const titles = rows.map((r) => String(r?.title || "")).filter(Boolean);
  if (ids.length === 0) return { deleted: false as const };

  await deletePhysicalFiles(admin, supabaseUrl, rows);

  await admin.from(TABLE).delete().in("id", ids).eq("user_id", userId).eq("type", ITEM_TYPE);

  return {
    deleted: true as const,
    deleted_id: ids[0] || null,
    deleted_ids: ids,
    deleted_count: ids.length,
    deleted_titles: titles.slice(0, 5),
  };
}

async function listSongs(admin: any, userId: string, deleted: boolean) {
  const q = admin
    .from(TABLE)
    .select("*")
    .eq("user_id", userId)
    .eq("type", ITEM_TYPE)
    .order(deleted ? "deleted_at" : "created_at", { ascending: false })
    .limit(200);
  if (deleted) q.not("deleted_at", "is", null);
  else q.is("deleted_at", null);
  const { data, error } = await q;
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, songs: Array.isArray(data) ? data : [] };
}

async function handleList(req: any, res: any) {
  if ((req.method || "").toUpperCase() !== "GET") return send(res, 405, { error: "Método no permitido" });
  const auth = await requireUser(req);
  if (!auth.ok) return send(res, auth.status, { error: auth.error });

  const deleted = ["1", "true", "yes"].includes((pickQuery(req, "deleted") || "").toLowerCase());
  const cleaned = await cleanupFreeUser(auth.admin, auth.supabaseUrl, auth.user.id);
  const r = await listSongs(auth.admin, auth.user.id, deleted);
  if (!r.ok) return send(res, 500, { error: "Error cargando canciones", detail: r.error });
  return send(res, 200, { songs: r.songs, cleanup_deleted: cleaned });
}

async function handleCreate(req: any, res: any) {
  if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });
  const auth = await requireUser(req);
  if (!auth.ok) return send(res, auth.status, { error: auth.error });

  await cleanupFreeUser(auth.admin, auth.supabaseUrl, auth.user.id);
  const lim = await enforceLimit100(auth.admin, auth.supabaseUrl, auth.user.id);

  const body = parseJsonBody(req);
  if (!body) return send(res, 400, { error: "Body inválido" });

  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 120) : "Nueva Canción";
  const description = typeof body?.description === "string" ? body.description.trim().slice(0, 2000) : "";
  const lyrics = typeof body?.lyrics === "string" ? body.lyrics.trim().slice(0, 8000) : null;
  const gender = typeof body?.gender === "string" ? body.gender.trim().slice(0, 20) : null;
  const audioUrl = typeof body?.audioUrl === "string" ? body.audioUrl.trim().slice(0, 2000) : null;
  const coverUrl = typeof body?.coverUrl === "string" ? body.coverUrl.trim().slice(0, 2000) : null;
  const sunoTaskId = typeof body?.sunoTaskId === "string" ? body.sunoTaskId.trim().slice(0, 200) : null;
  const sunoAudioId = typeof body?.sunoAudioId === "string" ? body.sunoAudioId.trim().slice(0, 200) : null;
  const isCover = Boolean(body?.isCover);

  const insertRow: any = {
    user_id: auth.user.id,
    type: ITEM_TYPE,
    title,
    description: description || null,
    lyrics,
    gender,
    audio_url: audioUrl,
    cover_url: coverUrl,
    suno_task_id: sunoTaskId,
    suno_audio_id: sunoAudioId,
    is_cover: isCover,
  };

  const { data, error } = await auth.admin.from(TABLE).insert(insertRow).select("*").single();
  if (error) return send(res, 500, { error: "No pude guardar la canción", detail: error.message });

  return send(res, 200, {
    song: data,
    deleted_oldest: lim.deleted,
    deleted_id: (lim as any).deleted_id || null,
    deleted_count: (lim as any).deleted_count || 0,
    deleted_titles: (lim as any).deleted_titles || [],
  });
}

async function handleDelete(req: any, res: any) {
  if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });
  const auth = await requireUser(req);
  if (!auth.ok) return send(res, auth.status, { error: auth.error });
  const body = parseJsonBody(req);
  if (!body) return send(res, 400, { error: "Body inválido" });
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!id) return send(res, 400, { error: "Falta id" });

  const { error } = await auth.admin
    .from(TABLE)
    .update({ deleted_at: new Date().toISOString(), deleted_reason: "user_deleted" })
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .eq("type", ITEM_TYPE);
  if (error) return send(res, 500, { error: "No pude eliminar", detail: error.message });
  return send(res, 200, { ok: true });
}

async function handleRestore(req: any, res: any) {
  if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });
  const auth = await requireUser(req);
  if (!auth.ok) return send(res, auth.status, { error: auth.error });

  await cleanupFreeUser(auth.admin, auth.supabaseUrl, auth.user.id);
  const lim = await enforceLimit100(auth.admin, auth.supabaseUrl, auth.user.id);

  const body = parseJsonBody(req);
  if (!body) return send(res, 400, { error: "Body inválido" });
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!id) return send(res, 400, { error: "Falta id" });

  const { error } = await auth.admin
    .from(TABLE)
    .update({ deleted_at: null, deleted_reason: null })
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .eq("type", ITEM_TYPE);
  if (error) return send(res, 500, { error: "No pude recuperar", detail: error.message });

  return send(res, 200, {
    ok: true,
    deleted_oldest: lim.deleted,
    deleted_id: (lim as any).deleted_id || null,
    deleted_count: (lim as any).deleted_count || 0,
    deleted_titles: (lim as any).deleted_titles || [],
  });
}

export default async function handler(req: any, res: any) {
  const action = (pickQuery(req, "action") || "").trim().toLowerCase() || "";
  const fallback = (() => {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const parts = pathname.split("/").filter(Boolean);
    const i = parts.findIndex((p) => p === "library");
    const next = i >= 0 ? parts[i + 1] : "";
    return (next || "").toLowerCase();
  })();
  const a = action || fallback || "list";

  if (a === "list") return handleList(req, res);
  if (a === "create") return handleCreate(req, res);
  if (a === "delete") return handleDelete(req, res);
  if (a === "restore") return handleRestore(req, res);

  return send(res, 404, { error: "Ruta no encontrada", action: a || null });
}
