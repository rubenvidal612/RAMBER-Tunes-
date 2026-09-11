import { createSupabaseServerClient } from "@/lib/supabase/server"; 
import { absoluteUrlFromRequest, sunoErrorMessage, sunoFetchJson } from "@/lib/sunoapi"; 
import { isAdminEmail } from "@/lib/authz"; 
import { createSupabaseAdminClient } from "@/lib/supabase/admin"; 
import { adjustUserCredits, consumeUserCredits, CREDIT_COSTS } from "@/lib/credits"; 

export const runtime = "nodejs"; 

function json(body: unknown, status = 200) { 
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); 
} 

function normalizeModel(mvOrModel: string) {
  const v = (mvOrModel || "").trim().toUpperCase();
  const isV6Mini =
    v === "V4_5ALL" ||
    v === "V4.5ALL" ||
    v === "V45ALL" ||
    v === "V3_5" ||
    v === "V3.5" ||
    v === "V35" ||
    v === "V6_MINI" ||
    v === "V6MINI" ||
    v === "V6-MINI";
  if (isV6Mini) return "V6_MINI";
  if (v === "V6" || v === "V6_WILD" || v === "V6WILD" || v === "V6-WILD") return v === "V6_WILD" || v === "V6WILD" || v === "V6-WILD" ? "V6_WILD" : "V6";
  return "V6";
} 

export async function POST(req: Request) { 
  const supabase = await createSupabaseServerClient(); 
  const { 
    data: { user }, 
  } = await supabase.auth.getUser(); 
  if (!user) return json({ error: "No autorizado" }, 401); 
  const isAdmin = isAdminEmail(user.email); 

  let payload: any = null; 
  try { 
    payload = await req.json(); 
  } catch { 
    return json({ error: "Body inválido" }, 400); 
  } 

  const prompt = typeof payload?.prompt === "string" ? payload.prompt.trim() : ""; 
  const style = typeof payload?.style === "string" ? payload.style.trim() : ""; 
  const instrumental = Boolean(payload?.instrumental); 
  const mv = typeof payload?.mv === "string" ? payload.mv.trim() : ""; 
  const modelRaw = typeof payload?.model === "string" ? payload.model.trim() : ""; 
  const model = normalizeModel(modelRaw || mv); 
  const title = typeof payload?.title === "string" ? payload.title.trim() : ""; 

  if (!prompt) return json({ error: "Falta prompt" }, 400); 

  const callBackUrl = absoluteUrlFromRequest(req, "/api/webhooks/suno"); 

  const body: any = { 
    model, 
    callBackUrl, 
    instrumental, 
  }; 

  const wantsCustomMode = typeof payload?.customMode === "boolean" ? payload.customMode : null; 
  const customMode = wantsCustomMode ?? (Boolean(style) || Boolean(title)); 
  body.customMode = customMode; 

  if (!customMode) { 
    if (prompt.length > 500) return json({ error: "En modo Simple el prompt máximo es 500 caracteres." }, 400); 
    body.prompt = prompt.slice(0, 500); 
  } else { 
    if (!style) return json({ error: "En modo Personalizado falta style." }, 400); 
    if (style.length > 1000) return json({ error: "El style máximo es 1,000 caracteres." }, 400); 
    if (!title) return json({ error: "En modo Personalizado falta title." }, 400); 
    if (title.length > 100) return json({ error: "El title máximo es 100 caracteres." }, 400); 
    if (!instrumental) { 
      if (!prompt.trim()) return json({ error: "Si no es instrumental, el prompt (letras) es obligatorio." }, 400); 
      if (prompt.length > 5000) return json({ error: "El prompt (letras) máximo es 5,000 caracteres." }, 400); 
    } else { 
      if (prompt.length > 5000) return json({ error: "El prompt máximo es 5,000 caracteres." }, 400); 
    } 
    body.prompt = (prompt || " ").slice(0, 5000); 
  } 

  if (customMode) { 
    body.style = (style || "General").slice(0, 1000); 
    body.title = title.slice(0, 100); 

    const negativeTags = typeof payload?.negativeTags === "string" ? payload.negativeTags.trim() : ""; 
    if (negativeTags) body.negativeTags = negativeTags.slice(0, 1000); 

    const personaId = typeof payload?.personaId === "string" ? payload.personaId.trim() : "";
    if (personaId) {
      body.personaId = personaId.slice(0, 200);
    } 

    const personaModel = typeof payload?.personaModel === "string" ? payload.personaModel.trim() : ""; 
    if (personaModel) body.personaModel = personaModel.slice(0, 200); 

    const vocalGender = typeof payload?.vocalGender === "string" ? payload.vocalGender.trim().toLowerCase() : ""; 
    if (vocalGender === "m" || vocalGender === "f") body.vocalGender = vocalGender; 

    const styleWeight = Number(payload?.styleWeight); 
    if (Number.isFinite(styleWeight)) body.styleWeight = Math.max(0, Math.min(1, styleWeight)); 

    const weirdnessConstraint = Number(payload?.weirdnessConstraint); 
    if (Number.isFinite(weirdnessConstraint)) body.weirdnessConstraint = Math.max(0, Math.min(1, weirdnessConstraint)); 

    const audioWeight = Number(payload?.audioWeight); 
    if (Number.isFinite(audioWeight)) body.audioWeight = Math.max(0, Math.min(1, audioWeight)); 
  } 

  const cost = CREDIT_COSTS.generate_music; 
  const admin = !isAdmin ? createSupabaseAdminClient() : null; 

  try { 
    if (!isAdmin && admin) { 
      const consumed = await consumeUserCredits(admin, user.id, cost); 
      if (!consumed.ok) return json({ error: consumed.error || "Créditos insuficientes. Recarga para continuar." }, 402); 
    } 

    const { res, data, text } = await sunoFetchJson(req, "/api/v1/generate", { 
      method: "POST", 
      body: JSON.stringify(body), 
    }); 

    if (!res.ok) { 
      const msg = sunoErrorMessage(data, text || `HTTP ${res.status}`); 
      return json({ error: "Error creando música", code: res.status, detail: String(msg).slice(0, 1200) }, 502); 
    } 

    const code = Number(data?.code); 
    if (code && code !== 200) { 
      const msg = sunoErrorMessage(data, "Error del proveedor"); 
      return json({ error: "Error creando música", code, detail: String(msg).slice(0, 1200) }, 502); 
    } 

    const taskId = typeof data?.data?.taskId === "string" ? data.data.taskId.trim() : ""; 
    if (!taskId) return json({ error: "Respuesta inválida del proveedor" }, 502); 

    await supabase.from("suno_tasks").insert({ task_id: taskId, user_id: user.id, kind: "generate", cost, consumed: true }); 

    console.log(`[suno] user=${user.id} taskId=${taskId} model=${model} instrumental=${instrumental}`); 
    return json({ taskId }, 200); 
  } catch (e) { 
    if (!isAdmin && admin) { 
      await adjustUserCredits(admin, user.id, cost); 
    } 
    return json({ error: "Error creando música", detail: e instanceof Error ? e.message : String(e) }, 502); 
  } 
}
