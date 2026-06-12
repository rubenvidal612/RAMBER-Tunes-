import { createClient } from "@supabase/supabase-js";

function send(res: any, status: number, data: any) {
  res.status(status).json(data);
}

async function readJsonBody(req: any): Promise<any> {
  try {
    const buffers = [];
    for await (const chunk of req) buffers.push(chunk);
    const body = Buffer.concat(buffers).toString();
    return JSON.parse(body);
  } catch {
    return null;
  }
}

async function resolveTelegramUser(admin: any, telegramUserId: string) {
  const { data: link, error: linkErr } = await admin
    .from("telegram_links")
    .select("user_id")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();
  if (linkErr) return { userId: "", error: linkErr.message || "Error buscando vínculo" };
  if (link?.user_id) return { userId: String(link.user_id), error: "" };

  const { data: profileByTelegram, error: profileByTelegramErr } = await admin
    .from("profiles")
    .select("id")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();

  if (profileByTelegramErr) {
    const msg = String(profileByTelegramErr.message || "").toLowerCase();
    if (!msg.includes("column") || !msg.includes("telegram_user_id")) {
      return { userId: "", error: profileByTelegramErr.message || "Error buscando perfil" };
    }
  }
  if ((profileByTelegram as any)?.id) return { userId: String((profileByTelegram as any).id), error: "" };
  return { userId: "", error: "" };
}

export default async function handler(req: any, res: any) {
  try {
    if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

    const secret = (process.env.TELEGRAM_BOT_SECRET || "").toString().trim();
    if (!secret) return send(res, 500, { error: "TELEGRAM_BOT_SECRET no configurado" });
    const got = String(req?.headers?.["x-telegram-secret"] || "").trim();
    if (!got || got !== secret) return send(res, 401, { error: "No autorizado" });

    const payload = await readJsonBody(req);
    if (!payload) return send(res, 400, { error: "Body inválido" });

    const telegram_user_id = (payload as any)?.telegram_user_id;
    if (telegram_user_id == null || telegram_user_id === "") return send(res, 400, { error: "Falta telegram_user_id" });

    const supabaseUrl = (process.env.SUPABASE_URL || "").toString().trim();
    const supabaseService = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").toString().trim();
    if (!supabaseUrl || !supabaseService) {
      return send(res, 500, { error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" });
    }

    const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });

    const resolved = await resolveTelegramUser(admin, String(telegram_user_id));
    if (resolved.error) return send(res, 500, { error: "Error buscando vínculo", detail: resolved.error });
    if (!resolved.userId) return send(res, 401, { error: "Cuenta no vinculada" });

    const userId = String(resolved.userId);

    // 2. Buscar las últimas 5 canciones exitosas del usuario
    // Primero intentamos con title, si falla (columna no existe), intentamos sin title
    let tasks: any[] = [];
    let tasksErr: any = null;
    
    // Intento 1: con title
    const resultWithTitle = await admin
      .from("suno_tasks")
      .select("task_id, title, created_at, kind, status")
      .eq("user_id", userId)
      .eq("status", "SUCCESS")
      .order("created_at", { ascending: false })
      .limit(5);
    
    if (resultWithTitle.error) {
      // Intento 2: sin title (por si la columna no existe)
      const resultWithoutTitle = await admin
        .from("suno_tasks")
        .select("task_id, created_at, kind, status")
        .eq("user_id", userId)
        .eq("status", "SUCCESS")
        .order("created_at", { ascending: false })
        .limit(5);
      
      if (resultWithoutTitle.error) {
        tasksErr = resultWithoutTitle.error;
      } else {
        tasks = resultWithoutTitle.data || [];
      }
    } else {
      tasks = resultWithTitle.data || [];
    }

    if (tasksErr) return send(res, 500, { error: "Error buscando canciones", detail: tasksErr.message });

    // 3. Formatear la respuesta
    const songs = (tasks || []).map((task: any) => {
      // Extraer título del prompt si existe, o usar un valor por defecto
      let title = task.title || "Sin título";
      
      // Si no hay título en la tabla, intentamos extraerlo del task_id o kind
      if (!task.title || task.title === "Sin título") {
        if (task.kind === "generate") title = "Canción generada";
        else if (task.kind === "upload_and_cover") title = "Cover personalizado";
        else title = `Canción ${task.kind || "desconocida"}`;
      }
      
      return {
        task_id: task.task_id || "",
        title: title,
        created_at: task.created_at || "",
        kind: task.kind || "unknown",
        has_title_field: !!task.title, // Indica si la tabla realmente tiene el campo title
      };
    });

    return send(res, 200, {
      ok: true,
      count: songs.length,
      songs,
      message: songs.length === 0 ? "No tienes canciones generadas aún" : `Encontradas ${songs.length} canciones`,
    });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return send(res, 500, { error: "Error interno", detail: msg.slice(0, 900) });
  }
}
