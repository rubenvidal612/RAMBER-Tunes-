const BUCKET = "ramber-tunes";
const PREFIX = "uploads/audio/";
const PAGE = 100;
const RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

export function authorizeAudioCleanup(req: any, env: Record<string, string | undefined>) {
  const method = String(req.method || "").toUpperCase();
  if (method !== "GET" && method !== "POST") return 405;
  const secret = (env.CRON_SECRET || "").trim();
  if (!secret) return 503;
  return req.headers?.authorization === `Bearer ${secret}` ? 200 : 401;
}

// Match only this project's bucket, including signed URLs. An expired signature
// does not mean the underlying file is unused.
export function temporaryAudioKey(raw: string, supabaseUrl: string): string {
  try {
    let key = String(raw || "").trim();
    if (/^https?:\/\//i.test(key)) {
      const url = new URL(key);
      if (url.origin !== new URL(supabaseUrl).origin) return "";
      const match = url.pathname.match(/^\/storage\/v1\/object\/(?:public|sign|authenticated)\/ramber-tunes\/(.+)$/);
      if (!match) return "";
      key = decodeURIComponent(match[1]);
    }
    return key.startsWith(PREFIX) && !key.split("/").includes("..") ? key : "";
  } catch { return ""; }
}

async function protectedKeys(admin: any, supabaseUrl: string) {
  const keys = new Set<string>();
  const collect = (value: any) => {
    if (typeof value === "string") {
      const key = temporaryAudioKey(value, supabaseUrl);
      if (key) keys.add(key);
    } else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === "object") Object.values(value).forEach(collect);
  };
  const sources = [
    ["library_items", "id,audio_url,notes,metadata", "id", false],
    ["songs", "id,audio_url", "id", false],
    ["public_songs", "song_id,audio_url", "song_id", false],
    ["kits_voices", "id,sample_url,dataset_url,output", "id", false],
    ["voice_profiles", "id,sample_original_r2_path,last_verify_r2_path", "id", false],
    // Legacy installations may not have this table. Every other error must stop
    // deletion rather than interpret unreadable references as an empty library.
    ["rvc_covers", "*", "id", true],
  ] as const;
  for (const [table, columns, order, optional] of sources) {
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await admin.from(table).select(columns)
        .order(order, { ascending: true }).range(offset, offset + PAGE - 1);
      if (error) {
        if (optional && ["PGRST205", "42P01"].includes(error.code)) break;
        throw new Error(`No pude verificar referencias en ${table}: ${error.message}`);
      }
      if (!Array.isArray(data)) throw new Error(`Respuesta inválida de ${table}`);
      data.forEach(collect);
      if (data.length < PAGE) break;
    }
  }
  return keys;
}

export async function cleanupTemporaryAudio(admin: any, supabaseUrl: string,
  options: { dryRun?: boolean; now?: number } = {}) {
  const result = { ok: true, dry_run: options.dryRun === true, retention_days: 14,
    aplicables: 0, borrados: 0, protegidos: 0, bytesLiberables: 0, bytesLiberados: 0 };
  try {
    const cutoff = (options.now ?? Date.now()) - RETENTION_MS;
    const candidates: any[] = [];
    const folders = [PREFIX.slice(0, -1)];
    // Use the Storage API; the storage schema is not exposed by the Data API.
    // Gather every page before deleting so offsets do not shift during removal.
    for (let index = 0; index < folders.length; index++) {
      const folder = folders[index];
      for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await admin.storage.from(BUCKET).list(folder,
          { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } });
        if (error) throw new Error(`No pude listar audios: ${error.message}`);
        if (!Array.isArray(data)) throw new Error("Respuesta inválida de Storage");
        for (const item of data) {
          if (!item.name || item.name.includes("/") || [".", ".."].includes(item.name))
            throw new Error("Nombre inválido en Storage");
          const name = `${folder}/${item.name}`;
          if (item.id == null && item.metadata == null) { folders.push(name); continue; }
          const created = Date.parse(item.created_at);
          const updated = Date.parse(item.updated_at || item.created_at);
          if (!Number.isFinite(created) || !Number.isFinite(updated) || created >= cutoff || updated >= cutoff) continue;
          if (/masterizada|^rvc_(mix|vocals)_/i.test(item.name)) { result.protegidos++; continue; }
          candidates.push({ ...item, name });
        }
        if (data.length < PAGE) break;
      }
    }
    const refs = await protectedKeys(admin, supabaseUrl);
    const removable = candidates.filter(item => {
      if (refs.has(item.name)) { result.protegidos++; return false; }
      return true;
    });
    result.aplicables = removable.length;
    result.bytesLiberables = removable.reduce((sum, item) => sum + Number(item.metadata?.size || 0), 0);
    if (result.dry_run) return result;
    for (let i = 0; i < removable.length; i += 50) {
      const batch = removable.slice(i, i + 50);
      const { data, error } = await admin.storage.from(BUCKET).remove(batch.map(item => item.name));
      if (error) throw new Error(`No pude eliminar el lote: ${error.message}`);
      const removed = new Set((data || []).map((item: any) => item.name));
      for (const item of batch) if (removed.has(item.name)) {
        result.borrados++;
        result.bytesLiberados += Number(item.metadata?.size || 0);
      }
      if (removed.size !== batch.length) throw new Error("Storage no confirmó todos los borrados del lote");
    }
    return result;
  } catch (error) {
    return { ...result, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
