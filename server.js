import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

// Cargar variables de entorno
dotenv.config();
dotenv.config({ path: '.env.local', override: true });

const app = express();
const PORT = process.env.PORT || 3001;

// Configurar CORS
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.FRONTEND_URL 
    : 'http://localhost:3000',
  credentials: true
}));

// Middleware para parsear JSON
app.use(express.json({ limit: '50mb' }));

// Inicializar cliente de Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Faltan variables de entorno de Supabase');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// --- CONSTANTES Y HELPERS ---

const CREDIT_COSTS = {
  generate_music: 12,
  extend_music: 12,
  upload_and_cover: 12,
  upload_and_extend: 12,
  add_instrumental: 12,
  add_vocals: 12,
  sounds: 2.5,
  separate_vocal: 10,
  split_stem: 50,
  music_video: 2,
  replace_section: 5,
  wav: 0.4,
  lyrics: 0.4,
  timestamped_lyrics: 0.5,
  boost_style: 0.4,
  midi: 0,
  generate_persona: 0,
  music_cover: 0,
  clone_voice: 15,
  karaoke_generation: 12.5,
};

function round2(n) {
  return Math.round(n * 100) / 100;
}

function creditsFromProfile(profile) {
  const p = profile ?? {};
  for (const k of ["ramber_credits", "zingy_credits", "credits"]) {
    if (Object.prototype.hasOwnProperty.call(p, k)) {
      const v = p[k];
      if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, v);
    }
  }
  return 0;
}

const getR2Env = () => {
  const bucketName = process.env.R2_BUCKET_NAME || 'ramber-tunes-audio';
  const rawEndpoint = process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  let endpoint = rawEndpoint;
  try {
    const u = new URL(String(rawEndpoint));
    const p = (u.pathname || "").replace(/\/+$/, "");
    if (bucketName && p.toLowerCase() === `/${String(bucketName).toLowerCase()}`) u.pathname = "/";
    endpoint = u.toString().replace(/\/$/, "");
  } catch {}
  return {
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucketName,
    endpoint,
    publicBaseUrl: `https://${bucketName}.${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  };
};

async function getR2Client() {
  const env = getR2Env();
  // Si falta configuración de R2, lanzamos error para usar Supabase
  if (!env.endpoint || !env.accessKeyId || !env.secretAccessKey) {
    throw new Error("Configuración de Cloudflare R2 incompleta.");
  }
  const { S3Client } = await import("@aws-sdk/client-s3");
  const hostname = (() => {
    try {
      return new URL(env.endpoint).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();
  const shouldForcePathStyle = hostname ? !hostname.startsWith(`${String(env.bucketName || "").toLowerCase()}.`) : true;
  return new S3Client({
    region: "auto",
    endpoint: env.endpoint,
    forcePathStyle: shouldForcePathStyle,
    credentials: {
      accessKeyId: env.accessKeyId,
      secretAccessKey: env.secretAccessKey,
    },
  });
}

async function getSignedR2Url(key, expiresIn = 3600) {
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  const env = getR2Env();
  const client = await getR2Client();
  const command = new GetObjectCommand({
    Bucket: env.bucketName,
    Key: key,
  });
  return await getSignedUrl(client, command, { expiresIn });
}

async function getUserPlan(userId) {
  try {
    const { data: tx } = await supabase
      .from("mp_transactions")
      .select("payment_id, pack_key, kind, created_at, amount_mxn")
      .eq("user_id", userId)
      .eq("kind", "songs")
      .order("created_at", { ascending: false })
      .limit(10);
    
    const rows = Array.isArray(tx) ? tx : [];
    const hasInicio = rows.some(t => String(t.pack_key).toLowerCase() === "inicio");
    const hasProductor = rows.some(t => String(t.pack_key).toLowerCase() === "productor");
    
    const plan_key = hasProductor ? "productor" : hasInicio ? "inicio" : "ninguno";
    const lastPaid = rows.find(t => ["inicio", "productor"].includes(String(t.pack_key).toLowerCase()));
    
    if (!lastPaid) return { plan_key: "ninguno", plan_active: false };

    const start = new Date(lastPaid.created_at).getTime();
    const expires = start + 30 * 24 * 60 * 60 * 1000;
    const plan_active = Date.now() < expires;

    return { 
      plan_key, 
      plan_active, 
      plan_expires_at: new Date(expires).toISOString() 
    };
  } catch (error) {
    return { plan_key: "ninguno", plan_active: false };
  }
}

async function consumeUserCredits(userId, costCredits) {
  const cost = round2(Number(costCredits));
  if (!Number.isFinite(cost) || cost <= 0) return { ok: true };

  try {
    const plan = await getUserPlan(userId);
    if ((plan.plan_key === "inicio" || plan.plan_key === "productor") && !plan.plan_active) {
      return { ok: false, error: "Tu paquete venció. Para seguir usando, renueva tu plan." };
    }
  } catch (e) {}

  for (let i = 0; i < 4; i++) {
    const { data: profile, error: readErr } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (readErr) return { ok: false, error: readErr.message };
    if (!profile) return { ok: false, error: "Perfil no encontrado" };

    const current = creditsFromProfile(profile);
    if (current < cost) return { ok: false, error: "Créditos insuficientes. Recarga para continuar.", credits: current };

    const next = round2(Math.max(0, current - cost));
    
    let col = null;
    if (Object.prototype.hasOwnProperty.call(profile, "ramber_credits")) col = "ramber_credits";
    else if (Object.prototype.hasOwnProperty.call(profile, "zingy_credits")) col = "zingy_credits";
    else if (Object.prototype.hasOwnProperty.call(profile, "credits")) col = "credits";

    if (!col) return { ok: false, error: "No se encontró columna de créditos" };

    const { error: updErr } = await supabase.from("profiles").update({ [col]: next }).eq("id", userId);
    if (!updErr) return { ok: true, credits: next };
  }
  return { ok: false, error: "Error consumiendo créditos" };
}

function isAdminEmail(email) {
  const e = (email || "").trim().toLowerCase();
  if (!e) return false;
  const hardcoded = ["rubenfiverr612@gmail.com", "rubenvidal612@gmail.com"];
  return hardcoded.includes(e);
}

function normalizeSunoBaseUrl(url) {
  let s = (url || "").trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  return s.replace(/\/+$/, "");
}

function sanitizeExternalUrl(raw) {
  const s = (raw || "").toString().trim();
  return s.replace(/^[`"' ]+/, "").replace(/[`"' ]+$/, "").trim();
}

async function sunoFetchJson(path, init = {}) {
  const baseEnv = process.env.SUNO_API_BASE_URL || process.env.SUNO_BASE_URL || "";
  const base = normalizeSunoBaseUrl(baseEnv) || "https://api.sunoapi.org";
  const apiKey = (process.env.SUNO_API_KEY || process.env.SUNO_KEY || "").toString().trim().replace(/^[`"' ]+/, "").replace(/[`"' ]+$/, "");
  
  if (!apiKey) throw new Error("Falta SUNO_API_KEY en las variables de entorno.");

  const headers = new Headers(init?.headers || {});
  if (!headers.has("authorization")) headers.set("authorization", `Bearer ${apiKey}`);
  if (!headers.has("content-type")) headers.set("content-type", "application/json");

  const fullUrl = new URL(path.replace(/^\/+/, ""), base + (base.endsWith("/") ? "" : "/")).toString();
  
  try {
    const r = await fetch(fullUrl, {
      ...init,
      headers,
    });
    const text = await r.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    return { res: r, data, text };
  } catch (err) {
    console.error(`Error en sunoFetchJson (${fullUrl}):`, err);
    throw err;
  }
}

async function getReferredUsers(admin, affiliateUserId) {
  try {
    const { data } = await admin
      .from("affiliate_referrals")
      .select("referred_user_id")
      .eq("affiliate_user_id", affiliateUserId);
    return (data || []).map(r => r.referred_user_id);
  } catch {
    return [];
  }
}

// --- GEMINI HELPERS ---

async function syncLyricsWithGemini(audioBuf, mimeType, lyrics) {
  const apiKey = (process.env.GEMINI_API_KEY || "").toString().trim().replace(/^[`"' ]+/, "").replace(/[`"' ]+$/, "");
  if (!apiKey) {
    return { ok: false, error: "Falta GEMINI_API_KEY en el entorno" };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const partAudio = {
      inlineData: {
        data: Buffer.from(audioBuf).toString("base64"),
        mimeType
      }
    };

    const prompt = `Listen to the audio and read the following lyrics:\n\n${lyrics}\n\nReturn a JSON array representing the exact timing of each line of the lyrics in the audio. The start_time and end_time should be in seconds (float). Use this exact format:\n[\n  { "text": "line of lyrics", "start_time": 0.0, "end_time": 2.5 }\n]\nOutput ONLY valid JSON without markdown wrapping.`;

    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
            prompt,
            partAudio
        ],
        config: {
            responseMimeType: "application/json"
        }
    });

    const textOut = response.text;
    if (!textOut) return { ok: false, error: "Gemini no devolvió texto" };

    const parsed = JSON.parse(textOut);
    return { ok: true, data: parsed };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

// --- MIDDLEWARES ---

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Token inválido' });
    req.user = user;
    next();
  } catch (error) {
    console.error('Error de autenticación:', error);
    return res.status(500).json({ error: 'Error de autenticación' });
  }
};

// --- ENDPOINTS ---

// 1. Voces
app.get('/api/voices/list', authenticate, async (req, res) => {
  try {
    const { data: voices, error } = await supabase
      .from('kits_voices')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return res.json({ voices });
  } catch (error) {
    return res.status(500).json({ error: 'Error listando voces' });
  }
});

app.get('/api/suno/voices', authenticate, async (req, res) => {
  try {
    const { data: voices, error } = await supabase
      .from('suno_voices')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return res.json({ voices: voices || [] });
  } catch (error) {
    const detail = (error && typeof error === 'object' ? (error.message || error.details || error.hint) : String(error || '')).toString();
    const lower = detail.toLowerCase();
    const missingTable = lower.includes('could not find the table') && lower.includes('suno_voices');
    const sql = `create extension if not exists pgcrypto;

create table if not exists public.suno_voices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  suno_voice_id text not null,
  name text not null,
  status text default 'processing',
  last_task_id text,
  meta jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists suno_voices_user_suno_voice_id_key
on public.suno_voices (user_id, suno_voice_id);

alter table public.suno_voices enable row level security;

drop policy if exists "suno_voices_select_own" on public.suno_voices;
create policy "suno_voices_select_own"
on public.suno_voices for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "suno_voices_insert_own" on public.suno_voices;
create policy "suno_voices_insert_own"
on public.suno_voices for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "suno_voices_update_own" on public.suno_voices;
create policy "suno_voices_update_own"
on public.suno_voices for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "suno_voices_delete_own" on public.suno_voices;
create policy "suno_voices_delete_own"
on public.suno_voices for delete
to authenticated
using (auth.uid() = user_id);

notify pgrst, 'reload schema';`;

    return res.status(500).json({
      error: 'Error listando voces de Suno',
      detail,
      sql: missingTable ? sql : undefined,
    });
  }
});

app.post('/api/suno/voices', authenticate, async (req, res) => {
  try {
    const payload = req.body || {};
    const sunoVoiceId = String(payload.sunoVoiceId || payload.suno_voice_id || payload.voiceId || payload.voice_id || '').trim();
    const name = String(payload.name || payload.voiceName || payload.voice_name || 'Voz').trim() || 'Voz';
    const status = String(payload.status || '').trim();
    const taskId = String(payload.taskId || payload.task_id || '').trim();
    const meta = payload && typeof payload.meta === 'object' && payload.meta && !Array.isArray(payload.meta) ? payload.meta : null;

    if (!sunoVoiceId) return res.status(400).json({ error: 'Falta sunoVoiceId' });

    const row = {
      user_id: req.user.id,
      suno_voice_id: sunoVoiceId.slice(0, 200),
      name: name.slice(0, 160),
      updated_at: new Date().toISOString(),
      ...(status ? { status: status.slice(0, 60) } : {}),
      ...(taskId ? { last_task_id: taskId.slice(0, 200) } : {}),
      ...(meta ? { meta } : {}),
    };

    const { data: voice, error } = await supabase
      .from('suno_voices')
      .upsert(row, { onConflict: 'user_id,suno_voice_id' })
      .select('*')
      .single();

    if (error) throw error;
    return res.json({ ok: true, voice });
  } catch (error) {
    const detail = (error && typeof error === 'object' ? (error.message || error.details || error.hint) : String(error || '')).toString();
    return res.status(500).json({ error: 'Error guardando voz de Suno', detail });
  }
});

app.post('/api/suno/clone-voice', authenticate, async (req, res) => {
  const payload = req.body;
  const { uploadUrl, uploadPath, voiceName, voiceProfileName, description, profileImageUrl, category, language, gender, tags, isPublic } = payload;
  const user = req.user;

  try {
    const cost = CREDIT_COSTS.clone_voice || 15;
    const creditResult = await consumeUserCredits(user.id, cost);
    if (!creditResult.ok) return res.status(402).json({ error: creditResult.error });

    let finalUploadUrl = uploadUrl;
    if (uploadPath) finalUploadUrl = await getSignedR2Url(uploadPath, 7200);
    if (!finalUploadUrl) return res.status(400).json({ error: "Falta audio para entrenar" });

    const audioRes = await fetch(finalUploadUrl);
    if (!audioRes.ok) throw new Error(`Error descargando audio: ${audioRes.status}`);
    const audioBuffer = await audioRes.arrayBuffer();

    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    const rvcName = (voiceProfileName || voiceName || "voz").replace(/[^a-z0-9]/gi, '_').slice(0, 30);
    zip.file(`dataset/${rvcName}/audio.wav`, Buffer.from(audioBuffer));
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const r2Client = await getR2Client();
    const rvcDatasetKey = `rvc_datasets/${user.id}/${Date.now()}_dataset.zip`;
    const env = getR2Env();
    
    await r2Client.send(new PutObjectCommand({
      Bucket: env.bucketName,
      Key: rvcDatasetKey,
      Body: zipBuffer,
      ContentType: 'application/zip',
    }));

    const datasetUrl = await getSignedR2Url(rvcDatasetKey, 86400);
    const replicateToken = process.env.REPLICATE_API_TOKEN;
    const replicateModel = process.env.REPLICATE_RVC_MODEL || 'replicate/train-rvc-model';
    const replicateVersion = process.env.REPLICATE_RVC_VERSION || 'cf360587a27f67500c30fc31de1e0f0f9aa26dcd7b866e6ac937a07bd104bad9';

    const repRes = await fetch(`https://api.replicate.com/v1/models/${replicateModel}/versions/${replicateVersion}/predictions`, {
      method: 'POST',
      headers: { 'Authorization': `Token ${replicateToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: {
          dataset_zip: datasetUrl,
          sample_rate: "48k",
          version: "v2",
          f0method: "rmvpe_gpu",
          epoch: 80,
          batch_size: "7"
        }
      }),
    });

    const repData = await repRes.json();
    if (!repRes.ok) return res.status(502).json({ error: "Error en Replicate", detail: repData.detail });

    const { data: voice, error: dbError } = await supabase.from('kits_voices').insert({
      user_id: user.id,
      voice_name: voiceName,
      description: description || '',
      profile_image_url: profileImageUrl || null,
      voice_profile_name: voiceProfileName || voiceName,
      category: category || 'personal',
      language: language || 'es',
      gender: gender || 'unknown',
      tags: tags || [],
      is_public: isPublic || false,
      status: 'training',
      replicate_id: repData.id,
      created_at: new Date().toISOString()
    }).select().single();

    if (dbError) return res.status(500).json({ error: "Error guardando en DB" });

    return res.status(201).json({ message: 'Entrenamiento iniciado', voice, prediction: repData });
  } catch (error) {
    return res.status(500).json({ error: 'Error interno del servidor', detail: error.message });
  }
});

app.post('/api/suno/voice-validate', authenticate, async (req, res) => {
  try {
    const payload = req.body || {};
    let voiceUrl = sanitizeExternalUrl(String(payload.voiceUrl || payload.voice_url || "").trim());

    // Si la URL es relativa (ej: /api/...), la convertimos en absoluta para Suno
    if (voiceUrl.startsWith("/")) {
      const host = req.get("host") || "ramber-tunes.vercel.app";
      // Forzamos HTTPS a menos que sea localhost
      const protocol = host.includes("localhost") ? "http" : "https";
      voiceUrl = `${protocol}://${host}${voiceUrl}`;
    }
    const vocalStartSRaw = Number(payload.vocalStartS ?? payload.vocal_start_s ?? payload.vocalStart ?? payload.vocal_start);
    const vocalEndSRaw = Number(payload.vocalEndS ?? payload.vocal_end_s ?? payload.vocalEnd ?? payload.vocal_end);
    const language = String(payload.language || "es").trim() || "es";

    if (!voiceUrl) return res.status(400).json({ error: "Falta voiceUrl" });
    if (!Number.isFinite(vocalStartSRaw) || !Number.isFinite(vocalEndSRaw)) {
      return res.status(400).json({ error: "vocalStartS y vocalEndS deben ser números (segundos)" });
    }
    const vocalStartS = Math.max(0, Math.floor(vocalStartSRaw));
    const vocalEndS = Math.max(0, Math.floor(vocalEndSRaw));
    if (vocalEndS <= vocalStartS) return res.status(400).json({ error: "vocalEndS debe ser mayor que vocalStartS" });

    const callBackUrl =
      String(payload.callBackUrl || payload.call_back_url || "").trim() ||
      `${req.protocol}://${req.get("host")}/api/webhooks/suno`;

    const body = { voiceUrl, vocalStartS, vocalEndS, language, callBackUrl };
    const { res: r, data, text } = await sunoFetchJson("/api/v1/voice/validate", {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!r.ok) {
      console.error(`Suno Voice Validate falló para la URL: ${voiceUrl}`);
      return res.status(502).json({ 
        error: data?.detail || data?.error || "Suno no pudo descargar tu audio. Por favor intenta de nuevo.", 
        code: r.status, 
        detail: { sunoResponse: data || text, attemptedUrl: voiceUrl } 
      });
    }
    const code = Number(data?.code);
    if (code && code !== 200) return res.status(502).json({ error: "Error iniciando validación de voz", code, detail: data?.msg || data?.error || "Error del proveedor" });

    const taskId = typeof data?.data?.taskId === "string" ? data.data.taskId.trim() : "";
    if (!taskId) return res.status(502).json({ error: "Respuesta inválida del proveedor" });

    return res.json({ taskId });
  } catch (error) {
    return res.status(500).json({ error: "Error iniciando validación de voz", detail: error.message });
  }
});

app.get('/api/suno/voice-validate-info', authenticate, async (req, res) => {
  try {
    const taskId = String(req.query.taskId || req.query.task_id || "").trim();
    if (!taskId) return res.status(400).json({ error: "Falta taskId" });

    const { res: r, data, text } = await sunoFetchJson(`/api/v1/voice/validate-info?taskId=${encodeURIComponent(taskId)}`, {
      method: "GET",
    });

    if (!r.ok) return res.status(502).json({ error: "Error consultando validación de voz", code: r.status, detail: data || text });
    const code = Number(data?.code);
    if (code && code !== 200) return res.status(502).json({ error: "Error consultando validación de voz", code, detail: data?.msg || data?.error || "Error del proveedor" });

    const d = data?.data || {};
    return res.json({
      ok: true,
      taskId: String(d.taskId || taskId),
      validateInfo: typeof d.validateInfo === "string" ? d.validateInfo : "",
      status: typeof d.status === "string" ? d.status : "",
      errorCode: Number.isFinite(Number(d.errorCode)) ? Number(d.errorCode) : null,
      errorMessage: typeof d.errorMessage === "string" ? d.errorMessage : "",
      data: d,
    });
  } catch (error) {
    return res.status(500).json({ error: "Error consultando validación de voz", detail: error.message });
  }
});

app.post('/api/suno/voice-generate', authenticate, async (req, res) => {
  try {
    const payload = req.body || {};
    const validationTaskId = String(payload.taskId || payload.task_id || "").trim();
    let verifyUrl = sanitizeExternalUrl(String(payload.verifyUrl || payload.verify_url || "").trim());

    // Si la URL es relativa, la convertimos en absoluta para Suno
    if (verifyUrl.startsWith("/")) {
      const host = req.get("host") || "ramber-tunes.vercel.app";
      // Forzamos HTTPS a menos que sea localhost
      const protocol = host.includes("localhost") ? "http" : "https";
      verifyUrl = `${protocol}://${host}${verifyUrl}`;
    }
    const voiceName = String(payload.voiceName || payload.voice_name || "").trim();
    const description = String(payload.description || "").trim();
    const style = String(payload.style || "").trim();
    const singerSkillLevel = String(payload.singerSkillLevel || payload.singer_skill_level || "").trim();

    if (!validationTaskId) return res.status(400).json({ error: "Falta taskId" });
    if (!verifyUrl) return res.status(400).json({ error: "Falta verifyUrl" });

    const callBackUrl =
      String(payload.callBackUrl || payload.call_back_url || "").trim() ||
      `${req.protocol}://${req.get("host")}/api/webhooks/suno`;

    const body = {
      taskId: validationTaskId,
      verifyUrl,
      voiceName: voiceName || undefined,
      description: description || undefined,
      style: style || undefined,
      singerSkillLevel: singerSkillLevel || undefined,
      callBackUrl,
    };

    const { res: r, data, text } = await sunoFetchJson("/api/v1/voice/generate", {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!r.ok) return res.status(502).json({ error: "Error creando voz personalizada", code: r.status, detail: data || text });
    const code = Number(data?.code);
    if (code && code !== 200) return res.status(502).json({ error: "Error creando voz personalizada", code, detail: data?.msg || data?.error || "Error del proveedor" });

    const taskId = typeof data?.data?.taskId === "string" ? data.data.taskId.trim() : "";
    if (!taskId) return res.status(502).json({ error: "Respuesta inválida del proveedor" });

    return res.json({ taskId });
  } catch (error) {
    return res.status(500).json({ error: "Error creando voz personalizada", detail: error.message });
  }
});

app.get('/api/suno/voice-record-info', authenticate, async (req, res) => {
  try {
    const taskId = String(req.query.taskId || req.query.task_id || "").trim();
    if (!taskId) return res.status(400).json({ error: "Falta taskId" });

    const { res: r, data, text } = await sunoFetchJson(`/api/v1/voice/record-info?taskId=${encodeURIComponent(taskId)}`, {
      method: "GET",
    });

    if (!r.ok) return res.status(502).json({ error: "Error consultando estado de voz", code: r.status, detail: data || text });
    const code = Number(data?.code);
    if (code && code !== 200) return res.status(502).json({ error: "Error consultando estado de voz", code, detail: data?.msg || data?.error || "Error del proveedor" });

    const d = data?.data || {};
    return res.json({
      ok: true,
      taskId: String(d.taskId || taskId),
      voiceId: typeof d.voiceId === "string" ? d.voiceId : "",
      status: typeof d.status === "string" ? d.status : "",
      errorCode: Number.isFinite(Number(d.errorCode)) ? Number(d.errorCode) : null,
      errorMessage: typeof d.errorMessage === "string" ? d.errorMessage : "",
      data: d,
    });
  } catch (error) {
    return res.status(500).json({ error: "Error consultando estado de voz", detail: error.message });
  }
});

app.post('/api/voices/create', (req, res) => res.redirect(307, '/api/suno/clone-voice'));

// 2. Covers
app.post('/api/suno/create-cover', authenticate, async (req, res) => {
  const { songId, voiceId, uploadUrl, uploadPath, pitchChange, indexRate, protect } = req.body;
  const user = req.user;
  try {
    let sourceAudioUrl = uploadUrl;
    if (songId) {
      const { data: song } = await supabase.from('library_items').select('audio_url').eq('id', songId).single();
      sourceAudioUrl = song?.audio_url;
    } else if (uploadPath) {
      sourceAudioUrl = await getSignedR2Url(uploadPath, 7200);
    }
    if (!sourceAudioUrl) return res.status(400).json({ error: "Falta audio de origen" });

    const { data: voice } = await supabase.from('kits_voices').select('model_url, replicate_id').eq('id', voiceId).single();
    let modelUrl = voice?.model_url;
    if (!modelUrl && voice?.replicate_id) {
      const repRes = await fetch(`https://api.replicate.com/v1/predictions/${voice.replicate_id}`, {
        headers: { 'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}` }
      });
      const repData = await repRes.json();
      modelUrl = repData?.output?.model_url || (Array.isArray(repData?.output) ? repData.output[0] : null);
    }
    if (!modelUrl) return res.status(400).json({ error: "La voz no tiene un modelo listo" });

    const replicateToken = process.env.REPLICATE_API_TOKEN;
    const repRes = await fetch(`https://api.replicate.com/v1/predictions`, {
      method: 'POST',
      headers: { 'Authorization': `Token ${replicateToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version: "a0076ea1440af7994949713918b93582068831e1a3ca2664531804f561919a31",
        input: {
          song_input: sourceAudioUrl,
          rvc_model: "CUSTOM",
          custom_rvc_model_download_url: modelUrl,
          pitch_change: pitchChange === 12 ? "up-to-all-vocals" : pitchChange === -12 ? "down-to-all-vocals" : "no-change",
          index_rate: indexRate || 0.5,
          protect: protect || 0.33,
        }
      }),
    });
    const repData = await repRes.json();
    if (!repRes.ok) return res.status(502).json({ error: "Error en Replicate", detail: repData.detail });

    await supabase.from('rvc_covers').insert({
      user_id: user.id,
      voice_id: voiceId,
      original_audio_url: sourceAudioUrl,
      prediction_id: repData.id,
      status: 'processing',
      created_at: new Date().toISOString()
    });
    return res.json({ coverId: repData.id, predictionId: repData.id });
  } catch (error) {
    return res.status(500).json({ error: 'Error creando cover', detail: error.message });
  }
});

app.get('/api/rvc/cover-status', authenticate, async (req, res) => {
  const { predictionId } = req.query;
  try {
    const repRes = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: { 'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}` }
    });
    const repData = await repRes.json();
    const status = repData.status;
    const outputUrl = Array.isArray(repData.output) ? repData.output[0] : repData.output;
    if (status === 'succeeded' && outputUrl) {
      await supabase.from('rvc_covers').update({ status: 'ready', output_url: outputUrl }).eq('prediction_id', predictionId);
    }
    return res.json({ ok: true, status: status === 'succeeded' ? 'ready' : status, replicateStatus: status, outputUrl });
  } catch (error) {
    return res.status(500).json({ error: 'Error consultando estado' });
  }
});

// 2.5 Karaoke Sync
async function refundUserCredits(userId, costCredits) {
  const cost = round2(Number(costCredits));
  if (!Number.isFinite(cost) || cost <= 0) return { ok: true };

  try {
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (!profile) return { ok: false, error: "Perfil no encontrado" };

    const current = creditsFromProfile(profile);
    const next = round2(current + cost);
    
    let col = null;
    if (Object.prototype.hasOwnProperty.call(profile, "ramber_credits")) col = "ramber_credits";
    else if (Object.prototype.hasOwnProperty.call(profile, "zingy_credits")) col = "zingy_credits";
    else if (Object.prototype.hasOwnProperty.call(profile, "credits")) col = "credits";

    if (!col) return { ok: false, error: "No se encontró columna de créditos" };

    const { error: updErr } = await supabase.from("profiles").update({ [col]: next }).eq("id", userId);
    if (updErr) return { ok: false, error: updErr.message };
    return { ok: true, credits: next };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

// 2.5 Karaoke Async 3-Step Flow (Vercel Hobby compatible)
app.post('/api/suno/karaoke-start', authenticate, async (req, res) => {
  const { uploadUrl, uploadPath } = req.body;
  const user = req.user;

  try {
    const cost = CREDIT_COSTS.karaoke_generation || 12.5;
    const isAdmin = isAdminEmail(user.email);
    
    if (!isAdmin) {
      const creditResult = await consumeUserCredits(user.id, cost);
      if (!creditResult.ok) return res.status(402).json({ error: creditResult.error });
    }

    let sourceAudioUrl = uploadUrl;
    if (uploadPath) {
      try {
        const signedUrl = await getSignedR2Url(uploadPath, 7200);
        if (signedUrl) sourceAudioUrl = signedUrl;
      } catch {}
    }
    if (!sourceAudioUrl) {
      if (!isAdmin) await refundUserCredits(user.id, cost);
      return res.status(400).json({ error: "Falta audio de origen" });
    }

    const replicateToken = process.env.REPLICATE_API_TOKEN;
    if (!replicateToken) {
      if (!isAdmin) await refundUserCredits(user.id, cost);
      return res.status(500).json({ error: "Falta REPLICATE_API_TOKEN para la separación de voz." });
    }

    const replicateVersion =
      (process.env.REPLICATE_ALL_IN_ONE_AUDIO_VERSION || "").toString().trim() ||
      "f2a8516c9084ef460592deaa397acd4a97f60f18c3d15d273644c72500cdff0e";

    try {
      const probeRes = await fetch(sourceAudioUrl, {
        method: "GET",
        headers: { Range: "bytes=0-2047", Accept: "*/*" },
      });
      if (!probeRes.ok) {
        if (!isAdmin) await refundUserCredits(user.id, cost);
        return res.status(502).json({ error: `No pude leer el audio desde R2 (HTTP ${probeRes.status}).` });
      }
      const ct = (probeRes.headers.get("content-type") || "").toString().toLowerCase();
      const buf = Buffer.from(await probeRes.arrayBuffer());
      const headText = buf.slice(0, 256).toString("utf8").toLowerCase();
      const looksHtml = headText.includes("<html") || headText.includes("<!doctype html") || headText.includes("access denied");
      if (looksHtml || (ct && !ct.includes("audio") && !ct.includes("octet-stream"))) {
        if (!isAdmin) await refundUserCredits(user.id, cost);
        return res.status(502).json({ error: "El archivo en R2 no parece ser un audio válido. Revisa la subida y el tipo de archivo." });
      }
    } catch {}

    console.log("Iniciando separación principal en Replicate (Kim Vocal 2)...");
    const initRes = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${replicateToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: replicateVersion,
        input: { 
          music_input: sourceAudioUrl, 
          audioSeparator: true,
          audioSeparatorModel: 'Kim_Vocal_2.onnx'
        }
      })
    });
    
    const initData = await initRes.json();
    if (!initRes.ok) {
      if (!isAdmin) await refundUserCredits(user.id, cost);
      return res.status(502).json({ error: initData.detail || "Error iniciando separación en Replicate" });
    }

    const predictionId = initData?.id;
    const predictionUrl = initData?.urls?.get;
    if (!predictionId || !predictionUrl) {
      if (!isAdmin) await refundUserCredits(user.id, cost);
      return res.status(502).json({ error: "Respuesta inválida de Replicate al iniciar" });
    }

    return res.json({
      ok: true,
      predictionId,
      predictionUrl,
      stage: "separating"
    });
  } catch (error) {
    console.error("Error en karaoke-start:", error);
    // Attempt refund just in case
    const cost = CREDIT_COSTS.karaoke_generation || 12.5;
    const isAdmin = isAdminEmail(user?.email);
    if (user?.id && !isAdmin) {
      await refundUserCredits(user.id, cost).catch(console.error);
    }
    return res.status(500).json({ error: 'Error iniciando Karaoke', detail: error.message });
  }
});

app.get('/api/suno/karaoke-status', authenticate, async (req, res) => {
  const predictionId = req.query.predictionId;
  const stage = req.query.stage || "separating";
  const vocalUrlForBacking = req.query.vocalUrl;
  const instrumentalUrlForBacking = req.query.instrumentalUrl;
  const skipBackingRaw = String(req.query.skipBacking || "").trim().toLowerCase();
  const skipBacking = skipBackingRaw === "1" || skipBackingRaw === "true" || skipBackingRaw === "yes";

  if (!predictionId) return res.status(400).json({ error: "Falta predictionId" });

  const replicateToken = process.env.REPLICATE_API_TOKEN;
  if (!replicateToken) return res.status(500).json({ error: "Falta REPLICATE_API_TOKEN" });
  const replicateVersion =
    (process.env.REPLICATE_ALL_IN_ONE_AUDIO_VERSION || "").toString().trim() ||
    "f2a8516c9084ef460592deaa397acd4a97f60f18c3d15d273644c72500cdff0e";

  try {
    const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${encodeURIComponent(predictionId)}`, {
      headers: { 'Authorization': `Token ${replicateToken}` }
    });
    const pollData = await pollRes.json();
    const status = pollData?.status;

    if (status === 'succeeded') {
      const output = pollData?.output || {};

      if (stage === 'separating') {
        const vocalUrl = output?.mdx_vocals || output?.vocals || null;
        const instrumentalUrl = output?.mdx_other || output?.instrumental || output?.no_vocals || null;

        if (!vocalUrl || !instrumentalUrl) {
          return res.json({ ok: false, error: "No se obtuvieron pistas separadas" });
        }

        if (skipBacking) {
          return res.json({
            ok: true,
            status: "ready_for_finalize",
            stage: "done",
            vocalUrl,
            instrumentalUrl,
            backingVocalUrl: null,
            message: "Separación lista."
          });
        }

        console.log("Iniciando extracción de segundas voces (UVR-BVE)...");
        const bveRes = await fetch('https://api.replicate.com/v1/predictions', {
          method: 'POST',
          headers: {
            'Authorization': `Token ${replicateToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            version: replicateVersion,
            input: { 
              music_input: vocalUrl, 
              audioSeparator: true,
              audioSeparatorModel: 'UVR-BVE-4B_SN-44100-1.pth'
            }
          })
        });

        const bveData = await bveRes.json();
        if (bveRes.ok && bveData?.id) {
          return res.json({
            ok: true,
            status: "progressing",
            stage: "backing",
            predictionId: bveData.id,
            vocalUrl,
            instrumentalUrl,
            message: "Extrayendo segundas voces..."
          });
        } else {
          // BVE failed to start -> skip and finalize
          return res.json({
            ok: true,
            status: "ready_for_finalize",
            stage: "done",
            vocalUrl,
            instrumentalUrl,
            backingVocalUrl: null,
            message: "Separación lista."
          });
        }
      }

      if (stage === 'backing') {
        const bveVocalUrl = output?.mdx_vocals || null;
        const backingVocalUrl = output?.mdx_other || null;

        return res.json({
          ok: true,
          status: "ready_for_finalize",
          stage: "done",
          vocalUrl: bveVocalUrl || vocalUrlForBacking || null,
          backingVocalUrl,
          instrumentalUrl: instrumentalUrlForBacking || null,
          message: "Listo para sincronizar."
        });
      }
    }

    if (status === 'failed' || status === 'canceled') {
      const rawErr = String(pollData?.error || "").trim();
      if (stage === 'backing') {
        return res.json({
          ok: true,
          status: "ready_for_finalize",
          stage: "done",
          vocalUrl: vocalUrlForBacking || null,
          instrumentalUrl: instrumentalUrlForBacking || null,
          backingVocalUrl: null,
          message: "Coros fallaron, continuando sin coros."
        });
      }
      return res.json({ ok: false, error: `Replicate: ${status}. ${rawErr}` });
    }

    return res.json({
      ok: true,
      status: "processing",
      stage,
      message: stage === "separating" ? "Separando voz e instrumental..." : "Extrayendo segundas voces..."
    });
  } catch (error) {
    console.error("Error en karaoke-status:", error);
    return res.status(500).json({ error: 'Error consultando estado', detail: error.message });
  }
});

app.post('/api/suno/karaoke-finalize', authenticate, async (req, res) => {
  const { vocalUrl, instrumentalUrl, backingVocalUrl, lyrics } = req.body;

  if (!vocalUrl) return res.status(400).json({ error: "Falta vocalUrl" });
  if (!lyrics?.trim()) return res.status(400).json({ error: "Falta la letra para sincronizar" });

  try {
    console.log("Descargando pista vocal para Gemini...");
    const vocalRes = await fetch(vocalUrl);
    if (!vocalRes.ok) throw new Error("Error descargando voz separada.");
    const vocalBuffer = await vocalRes.arrayBuffer();

    console.log("Sincronizando con Gemini...");
    const syncResult = await syncLyricsWithGemini(vocalBuffer, "audio/mpeg", lyrics);
    if (!syncResult.ok) throw new Error(syncResult.error);

    return res.json({
      ok: true,
      syncData: syncResult.data,
      instrumentalUrl: instrumentalUrl || null,
      vocalUrl,
      backingVocalUrl: backingVocalUrl || null
    });
  } catch (error) {
    console.error("Error en karaoke-finalize:", error);
    return res.status(500).json({ error: 'Error finalizando karaoke', detail: error.message });
  }
});

// Legacy compatibility mapping
app.post('/api/suno/karaoke-sync', authenticate, async (req, res) => {
  // Redirect locally to karaoke-start
  res.status(400).json({ error: "Este endpoint es legado. Por favor usa el flujo de 3 pasos (karaoke-start)." });
});

app.post('/api/karaoke/upload-url', authenticate, async (req, res) => {
  try {
    const forwardRes = await fetch(`http://localhost:${PORT}/api/upload-audio`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: req.headers.authorization || '',
      },
      body: JSON.stringify(req.body || {}),
    });
    const out = await forwardRes.json().catch(() => ({}));
    return res.status(forwardRes.status).json(out);
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'Error procesando upload-url', detail: error.message });
  }
});

app.post('/api/karaoke/start', authenticate, async (req, res) => {
  try {
    const forwardRes = await fetch(`http://localhost:${PORT}/api/suno/karaoke-start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: req.headers.authorization || '',
      },
      body: JSON.stringify(req.body || {}),
    });
    const out = await forwardRes.json().catch(() => ({}));
    return res.status(forwardRes.status).json(out);
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'Error procesando karaoke/start', detail: error.message });
  }
});

app.get('/api/karaoke/status', authenticate, async (req, res) => {
  try {
    const qs = (req.originalUrl || '').split('?')[1] || '';
    const forwardRes = await fetch(`http://localhost:${PORT}/api/suno/karaoke-status${qs ? `?${qs}` : ''}`, {
      headers: {
        authorization: req.headers.authorization || '',
      },
    });
    const out = await forwardRes.json().catch(() => ({}));
    return res.status(forwardRes.status).json(out);
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'Error procesando karaoke/status', detail: error.message });
  }
});

app.post('/api/karaoke/finalize', authenticate, async (req, res) => {
  try {
    const forwardRes = await fetch(`http://localhost:${PORT}/api/suno/karaoke-finalize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: req.headers.authorization || '',
      },
      body: JSON.stringify(req.body || {}),
    });
    const out = await forwardRes.json().catch(() => ({}));
    return res.status(forwardRes.status).json(out);
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'Error procesando karaoke/finalize', detail: error.message });
  }
});

app.post('/api/karaoke/verify', authenticate, async (req, res) => {
  try {
    const key = String(req.body?.key || '').trim().replace(/^\/+/, '');
    const expectedSizeRaw = req.body?.expectedSize ?? req.body?.size ?? null;
    const expectedSize = expectedSizeRaw == null ? null : Number(expectedSizeRaw);
    if (!key) return res.status(400).json({ ok: false, error: 'Falta key' });

    const uid = String(req.user?.id || '').trim();
    const allowedPrefixes = [`uploads/audio/${uid}/`, `karaoke/${uid}/`];
    if (!allowedPrefixes.some((p) => key.startsWith(p))) {
      return res.status(403).json({ ok: false, error: 'No autorizado para verificar este archivo' });
    }

    const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
    const env = getR2Env();
    const client = await getR2Client();
    const head = await client.send(new HeadObjectCommand({ Bucket: env.bucketName, Key: key }));
    const contentLength = Number(head?.ContentLength ?? NaN);
    const etag = String(head?.ETag || '').replaceAll('"', '').trim() || null;
    if (!Number.isFinite(contentLength) || contentLength <= 0) {
      return res.status(404).json({ ok: false, error: 'No se encontró el archivo en R2', key });
    }
    if (expectedSize != null && Number.isFinite(expectedSize) && expectedSize > 0 && contentLength !== expectedSize) {
      return res.status(409).json({
        ok: false,
        error: 'La subida a R2 quedó incompleta (tamaño no coincide). Reintenta la subida.',
        expectedSize,
        contentLength,
        key,
      });
    }
    return res.json({ ok: true, key, contentLength, etag, matches: expectedSize == null ? null : contentLength === expectedSize });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'No se pudo verificar el archivo en R2', detail: error.message });
  }
});

app.get('/api/karaoke/play-url', authenticate, async (req, res) => {
  try {
    const key = String(req.query?.key || '').trim().replace(/^\/+/, '');
    if (!key) return res.status(400).json({ ok: false, error: 'Falta key' });

    const uid = String(req.user?.id || '').trim();
    const allowedPrefixes = [`uploads/audio/${uid}/`, `karaoke/${uid}/`];
    if (!allowedPrefixes.some((p) => key.startsWith(p))) {
      return res.status(403).json({ ok: false, error: 'No autorizado para este archivo' });
    }

    const url = await getSignedR2Url(key, 3600);
    return res.json({ ok: true, key, url });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'No pude generar URL de reproducción', detail: error.message });
  }
});

const encodeB64Url = (buf) =>
  Buffer.from(buf)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

const decodeB64Url = (s) => {
  const clean = String(s || "").replaceAll("-", "+").replaceAll("_", "/");
  const pad = clean.length % 4 === 0 ? "" : "=".repeat(4 - (clean.length % 4));
  return Buffer.from(clean + pad, "base64");
};

const getProxySecret = () => {
  const direct = String(process.env.KARAOKE_PROXY_SECRET || "").trim();
  if (direct) return direct;
  const r2 = String(process.env.R2_SECRET_ACCESS_KEY || "").trim();
  if (r2) return r2;
  return String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
};

const signProxyToken = (payload) => {
  const secret = getProxySecret();
  if (!secret) throw new Error("Falta KARAOKE_PROXY_SECRET (o R2_SECRET_ACCESS_KEY)");
  const crypto = require("crypto");
  const body = encodeB64Url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  return `${body}.${sig}`;
};

const verifyProxyToken = (token) => {
  const t = String(token || "").trim();
  if (!t.includes(".")) return null;
  const [body, sig] = t.split(".", 2);
  if (!body || !sig) return null;
  const secret = getProxySecret();
  if (!secret) return null;
  const crypto = require("crypto");
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;
  try {
    const json = JSON.parse(decodeB64Url(body).toString("utf8"));
    const expMs = Number(json?.exp ?? 0);
    if (!Number.isFinite(expMs) || expMs <= Date.now()) return null;
    return json;
  } catch {
    return null;
  }
};

app.get('/api/karaoke/proxy-url', authenticate, async (req, res) => {
  try {
    const uid = String(req.user?.id || '').trim();
    const allowedPrefixes = [`uploads/audio/${uid}/`, `karaoke/${uid}/`];
    const key = String(req.query?.key || '').trim().replace(/^\/+/, '');
    const src = String(req.query?.src || '').trim();
    if (!key && !src) return res.status(400).json({ ok: false, error: 'Falta key o src' });

    if (key && !allowedPrefixes.some((p) => key.startsWith(p))) {
      return res.status(403).json({ ok: false, error: 'No autorizado para este archivo' });
    }
    if (src) {
      let u = null;
      try { u = new URL(src); } catch {}
      if (!u || u.protocol !== 'https:') return res.status(400).json({ ok: false, error: 'URL inválida' });
      const host = String(u.hostname || '').toLowerCase();
      const allow = host.endsWith('replicate.delivery') || host.endsWith('.r2.cloudflarestorage.com') || host.endsWith('.r2.dev');
      if (!allow) return res.status(403).json({ ok: false, error: 'Origen no permitido' });
    }

    const token = signProxyToken({
      uid,
      exp: Date.now() + 60 * 60 * 1000,
      key: key || null,
      src: src || null,
    });
    const url = `/api/karaoke/audio-proxy?token=${encodeURIComponent(token)}`;
    return res.json({ ok: true, url });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'No pude crear URL proxy', detail: error.message });
  }
});

app.get('/api/karaoke/audio-proxy', async (req, res) => {
  try {
    const method = String(req.method || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') return res.status(405).json({ ok: false, error: 'Método no permitido' });

    const range = String(req.headers?.range || req.headers?.Range || '').trim();
    const setCommonHeaders = () => {
      res.setHeader('cache-control', 'no-store, max-age=0, s-maxage=0, must-revalidate');
      res.setHeader('access-control-allow-origin', '*');
      res.setHeader('access-control-allow-headers', 'range, content-type');
      res.setHeader('access-control-expose-headers', 'accept-ranges, content-length, content-range, content-type');
      res.setHeader('accept-ranges', 'bytes');
    };

    const token = String(req.query?.token || req.query?.t || '').trim();
    const verified = verifyProxyToken(token);
    if (!verified) return res.status(403).json({ ok: false, error: 'Token inválido' });

    const uid = String(verified?.uid || '').trim();
    const allowedPrefixes = [`uploads/audio/${uid}/`, `karaoke/${uid}/`];

    const keyRaw = String(verified?.key || '').trim().replace(/^\/+/, '');
    if (keyRaw) {
      if (!allowedPrefixes.some((p) => keyRaw.startsWith(p))) {
        return res.status(403).json({ ok: false, error: 'No autorizado para este archivo' });
      }

      const { GetObjectCommand } = await import('@aws-sdk/client-s3');
      const env = getR2Env();
      const client = await getR2Client();
      const out = await client.send(new GetObjectCommand({
        Bucket: env.bucketName,
        Key: keyRaw,
        ...(range ? { Range: range } : {}),
      }));

      res.status(range ? 206 : 200);
      setCommonHeaders();
      const ct = String(out?.ContentType || 'audio/mpeg');
      res.setHeader('content-type', ct);
      if (out?.ContentLength != null) res.setHeader('content-length', String(out.ContentLength));
      if (out?.ContentRange) res.setHeader('content-range', String(out.ContentRange));
      if (method === 'HEAD') return res.end();

      const body = out?.Body;
      if (body?.pipe) return body.pipe(res);
      const ab = await (body?.arrayBuffer?.() ?? Promise.resolve(null)).catch(() => null);
      if (!ab) return res.status(502).json({ ok: false, error: 'No pude leer el audio' });
      return res.end(Buffer.from(ab));
    }

    const src = String(verified?.src || '').trim();
    if (!src) return res.status(400).json({ ok: false, error: 'Falta src' });

    let u = null;
    try { u = new URL(src); } catch {}
    if (!u || u.protocol !== 'https:') return res.status(400).json({ ok: false, error: 'URL inválida' });
    const host = String(u.hostname || '').toLowerCase();
    const allow = host.endsWith('replicate.delivery') || host.endsWith('.r2.cloudflarestorage.com') || host.endsWith('.r2.dev');
    if (!allow) return res.status(403).json({ ok: false, error: 'Origen no permitido' });

    const headers = { accept: '*/*', ...(range ? { range } : {}) };
    const upstream = await fetch(u.toString(), { method: 'GET', headers });
    if (!upstream.ok) {
      const txt = await upstream.text().catch(() => '');
      return res.status(502).json({ ok: false, error: 'No pude descargar el audio', detail: txt || `HTTP ${upstream.status}` });
    }

    res.status(upstream.status);
    setCommonHeaders();
    const upstreamCt = upstream.headers.get('content-type') || 'audio/mpeg';
    const cl = upstream.headers.get('content-length') || '';
    const cr = upstream.headers.get('content-range') || '';
    res.setHeader('content-type', upstreamCt);
    if (cl) res.setHeader('content-length', cl);
    if (cr) res.setHeader('content-range', cr);
    if (method === 'HEAD') return res.end();

    const body = upstream.body;
    if (body && body.pipe) return body.pipe(res);
    const ab = await upstream.arrayBuffer().catch(() => null);
    if (!ab) return res.status(502).json({ ok: false, error: 'No pude leer el audio' });
    return res.end(Buffer.from(ab));
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'Error en audio-proxy', detail: error.message });
  }
});

// 2.6 Upload Audio to R2 (Helper for both Clone Voice and Karaoke)
app.post('/api/upload-audio', authenticate, async (req, res) => {
  try {
    const { title, contentType, file, path } = req.body;
    const user = req.user;
    
    // Limpiamos el nombre del archivo: minúsculas, sin espacios, solo caracteres seguros
    const cleanTitle = (title || 'audio').toString().toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9._-]/g, '')
      .slice(0, 100);
    
    const ext = contentType === 'audio/wav' ? 'wav' : 'mp3';
    const key = path || `uploads/${user.id}/${Date.now()}_${cleanTitle}.${ext}`;
    
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    
    const r2Client = await getR2Client();
    const env = getR2Env();
    
    if (file && Array.isArray(file)) {
      // Fallback: upload directly from buffer
      const uint8 = new Uint8Array(file.length);
      for (let i = 0; i < file.length; i++) {
        uint8[i] = file[i];
      }
      
      try {
        const r2Client = await getR2Client();
        const env = getR2Env();
        
        const putCommand = new PutObjectCommand({
          Bucket: env.bucketName,
          Key: key,
          Body: uint8,
          ContentLength: uint8.length,
          ContentType: contentType || 'audio/mpeg',
        });
        
        await r2Client.send(putCommand);
        const url = `${env.publicBaseUrl}/${key}`;
        return res.json({ ok: true, url, key });
      } catch (r2Error) {
        // Si falla R2, usamos Supabase Storage como respaldo automático
        console.log("R2 falló, usando Supabase Storage...");
        const bucket = "ramber-tunes";
        const { error: upErr } = await supabase.storage.from(bucket).upload(key, uint8, {
          contentType: contentType || 'audio/mpeg',
          upsert: true
        });
        if (upErr) throw upErr;
        
        // Generamos una URL firmada que dure 1 hora para que Suno pueda descargarla sin problemas
        const { data: signedData, error: signErr } = await supabase.storage.from(bucket).createSignedUrl(key, 3600);
        if (signErr) {
          const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(key);
          return res.json({ ok: true, url: publicUrl, key: "", via: "supabase" });
        }
        
        return res.json({ ok: true, url: signedData.signedUrl, key: "", via: "supabase-signed" });
      }
    } else {
      // Normal: generate pre-signed URL for direct upload
      try {
        const r2Client = await getR2Client();
        const env = getR2Env();
        
        const command = new PutObjectCommand({
          Bucket: env.bucketName,
          Key: key,
          ContentType: contentType || 'audio/mpeg',
        });
        
        const uploadUrl = await getSignedUrl(r2Client, command, { expiresIn: 3600 });
        const url = `${env.publicBaseUrl}/${key}`;
        
        return res.json({ ok: true, uploadUrl, url, key });
      } catch (r2Error) {
        // Si falla R2 al preparar la subida directa, devolvemos error para que el front use el buffer
        return res.status(200).json({ ok: false, error: "R2 no configurado", useBuffer: true });
      }
    }
  } catch (error) {
    console.error("Error en upload-audio:", error);
    return res.status(500).json({ ok: false, error: 'Error procesando subida de audio', detail: error.message });
  }
});

// 3. Afiliados
app.get('/api/affiliates/me', authenticate, async (req, res) => {
  try {
    const user = req.user;
    let { data: account } = await supabase.from('affiliate_accounts').select('*').eq('user_id', user.id).maybeSingle();
    if (!account) {
      const code = Math.random().toString(36).substring(2, 10);
      const { data: newAccount } = await supabase.from('affiliate_accounts').insert({
        user_id: user.id,
        code,
        created_at: new Date().toISOString()
      }).select().single();
      account = newAccount;
    }
    const { data: referrals } = await supabase.from('profiles').select('id, full_name').eq('ref_user_id', user.id);
    const { data: stats } = await supabase.from('affiliate_stats').select('*').eq('user_id', user.id).maybeSingle();
    return res.json({
      ok: true,
      code: account.code,
      link: `https://ramber-tunes.vercel.app/?ref=${account.code}`,
      plan_active: true,
      stats: {
        referrals_total: referrals?.length || 0,
        referrals_active: referrals?.length || 0,
        commissions_paid_mxn: stats?.commissions_paid_mxn || 0,
        commissions_pending_mxn: stats?.commissions_pending_mxn || 0,
        commissions_blocked_mxn: 0
      },
      active_referrals: referrals || [],
      inactive_referrals: []
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error en Afiliados' });
  }
});

// 4. Catálogo
app.get('/api/voices/catalog', async (req, res) => {
  try {
    const { category, language, gender, search, limit = 20, offset = 0 } = req.query;
    let query = supabase.from('kits_voices').select('*, profiles!inner(full_name, avatar_url)', { count: 'exact' }).eq('is_public', true).eq('status', 'ready').order('created_at', { ascending: false });
    if (category) query = query.eq('category', category);
    if (language) query = query.eq('language', language);
    if (gender) query = query.eq('gender', gender);
    if (search) query = query.or(`voice_name.ilike.%${search}%,description.ilike.%${search}%,voice_profile_name.ilike.%${search}%`);
    query = query.range(offset, parseInt(offset) + parseInt(limit) - 1);
    const { data: voices, error, count } = await query;
    if (error) throw error;
    const formattedVoices = (voices || []).map(voice => ({
      id: voice.id,
      name: voice.voice_name,
      description: voice.description,
      modelUrl: voice.model_url,
      sampleUrl: voice.sample_url,
      profileImageUrl: voice.profile_image_url,
      voiceProfileName: voice.voice_profile_name || voice.voice_name,
      category: voice.category || 'personal',
      language: voice.language || 'es',
      gender: voice.gender || 'unknown',
      tags: voice.tags || [],
      isPublic: voice.is_public,
      createdAt: voice.created_at,
      status: voice.status,
      userId: voice.user_id,
      userProfile: {
        username: voice.profiles?.full_name || 'Usuario',
        avatarUrl: voice.profiles?.avatar_url
      }
    }));
    return res.json({ voices: formattedVoices, total: count || 0, limit: parseInt(limit), offset: parseInt(offset) });
  } catch (error) {
    return res.status(500).json({ error: 'Error en catálogo' });
  }
});

// 5. Gestión de Voz Individual
app.get('/api/voices/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { data: voice, error } = await supabase.from('kits_voices').select('*').eq('id', id).single();
    if (error) return res.status(404).json({ error: 'Voz no encontrada' });
    return res.json({ voice });
  } catch (error) {
    return res.status(500).json({ error: 'Error obteniendo voz' });
  }
});

app.put('/api/voices/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, profileImageUrl, voiceProfileName, category, language, gender, tags, isPublic } = req.body;
    const { data: voice, error } = await supabase.from('kits_voices').update({
      voice_name: name,
      description,
      profile_image_url: profileImageUrl,
      voice_profile_name: voiceProfileName,
      category,
      language,
      gender,
      tags,
      is_public: isPublic,
      updated_at: new Date().toISOString()
    }).eq('id', id).eq('user_id', req.user.id).select().single();
    if (error) throw error;
    return res.json({ voice });
  } catch (error) {
    return res.status(500).json({ error: 'Error actualizando voz' });
  }
});

app.delete('/api/voices/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('kits_voices').delete().eq('id', id).eq('user_id', req.user.id);
    if (error) throw error;
    return res.json({ message: 'Eliminada' });
  } catch (error) {
    return res.status(500).json({ error: 'Error eliminando' });
  }
});

// 6. Cuenta y Saldo
app.get('/api/account/balance', authenticate, async (req, res) => {
  try {
    const user = req.user;
    const is_admin = isAdminEmail(user.email);
    
    const plan = await getUserPlan(user.id);
    const plan_key = plan.plan_key || "ninguno";
    const plan_active = is_admin ? true : Boolean(plan.plan_active);
    const plan_expires_at = plan.plan_expires_at || null;
    const downloads_allowed = is_admin ? true : Boolean(plan_active);

    const { data: profile, error: profErr } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (profErr) throw profErr;

    const internal_credits = round2(creditsFromProfile(profile));
    let provider_credits = null;
    let provider_error = "";

    if (is_admin) {
      try {
        const paths = ["/api/v1/generate/credit", "/api/v1/get-credits"];
        let last = null;
        for (const p of paths) {
          const r = await sunoFetchJson(p);
          last = r;
          if (r.res.status !== 404) break;
        }
        if (last?.res?.ok) {
          const raw = last.data?.data?.credits ?? last.data?.data;
          provider_credits = Number(raw);
        }
      } catch (e) {
        provider_error = e.message;
      }
    }

    const credits = is_admin && typeof provider_credits === "number" ? provider_credits : internal_credits;
    const counts = {
      songs: Math.floor(credits / 12),
      // ... otros conteos si son necesarios
    };

    return res.json({
      credits,
      song_balance: counts.songs,
      counts,
      downloads_allowed,
      plan_key,
      plan_active,
      plan_expires_at,
      is_admin,
      internal_credits,
      provider_credits,
      provider_error: provider_error || null,
      source: is_admin && typeof provider_credits === "number" ? "provider_admin" : "local"
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error consultando saldo', detail: error.message });
  }
});

// 7. Biblioteca
app.get('/api/library/list', authenticate, async (req, res) => {
  try {
    const deleted = req.query.deleted === '1';
    let query = supabase.from('library_items').select('*').eq('user_id', req.user.id).eq('type', 'song').order('created_at', { ascending: false });
    
    if (deleted) query = query.not('deleted_at', 'is', null);
    else query = query.is('deleted_at', null);

    const { data: songs, error } = await query;
    if (error) throw error;

    // Obtener estado de publicación
    const ids = (songs || []).map(s => s.id);
    let publishedBySongId = {};
    if (ids.length > 0) {
      const { data: pubs } = await supabase.from('public_songs').select('song_id, genre, published_at').in('song_id', ids);
      (pubs || []).forEach(p => {
        publishedBySongId[p.song_id] = p;
      });
    }

    const formattedSongs = (songs || []).map(s => ({
      ...s,
      is_public: Boolean(publishedBySongId[s.id]),
      public_genre: publishedBySongId[s.id]?.genre || null,
      published_at: publishedBySongId[s.id]?.published_at || null
    }));

    return res.json({ songs: formattedSongs, cleanup_deleted: 0 });
  } catch (error) {
    return res.status(500).json({ error: 'Error cargando biblioteca', detail: error.message });
  }
});

// Health
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// App Version (matching production API for local consistency)
app.get('/api/app/version', (req, res) => {
  res.json({
    ok: true,
    version: 'local-dev-' + Date.now(),
    deployed_at: new Date().toISOString()
  });
});

// Server
app.listen(PORT, () => {
  console.log(`Backend RAMBER Tunes en http://localhost:${PORT}`);
});
