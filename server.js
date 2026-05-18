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

const getR2Env = () => ({
  accountId: process.env.R2_ACCOUNT_ID,
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  bucketName: process.env.R2_BUCKET_NAME || 'ramber-tunes-audio',
  endpoint: process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  publicBaseUrl: `https://${process.env.R2_BUCKET_NAME || 'ramber-tunes-audio'}.${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
});

async function getR2Client() {
  const { S3Client } = await import("@aws-sdk/client-s3");
  const env = getR2Env();
  return new S3Client({
    region: "auto",
    endpoint: env.endpoint,
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

async function sunoFetchJson(path) {
  const baseEnv = process.env.SUNO_API_BASE_URL || process.env.SUNO_BASE_URL || "";
  const base = normalizeSunoBaseUrl(baseEnv) || "https://api.sunoapi.org";
  const apiKey = process.env.SUNO_API_KEY || process.env.SUNO_KEY || "";
  if (!apiKey) throw new Error("Falta SUNO_API_KEY");

  const r = await fetch(new URL(path, base).toString(), {
    method: "GET",
    headers: { authorization: `Bearer ${apiKey}` },
  });
  const text = await r.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { res: r, data, text };
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
  const apiKey = (process.env.GEMINI_API_KEY || "").toString().trim();
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

    console.log("Iniciando separación principal en Replicate (Kim Vocal 2)...");
    const initRes = await fetch('https://api.replicate.com/v1/models/erickluis00/all-in-one-audio/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${replicateToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
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

  if (!predictionId) return res.status(400).json({ error: "Falta predictionId" });

  const replicateToken = process.env.REPLICATE_API_TOKEN;
  if (!replicateToken) return res.status(500).json({ error: "Falta REPLICATE_API_TOKEN" });

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

        console.log("Iniciando extracción de segundas voces (UVR-BVE)...");
        const bveRes = await fetch('https://api.replicate.com/v1/models/erickluis00/all-in-one-audio/predictions', {
          method: 'POST',
          headers: {
            'Authorization': `Token ${replicateToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
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
          message: "Listo para sincronizar."
        });
      }
    }

    if (status === 'failed' || status === 'canceled') {
      return res.json({ ok: false, error: `Replicate: ${status}. ${pollData?.error || ""}` });
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

// 2.6 Upload Audio to R2 (Helper for both Clone Voice and Karaoke)
app.post('/api/upload-audio', authenticate, async (req, res) => {
  try {
    const { title, contentType, file, path } = req.body;
    const user = req.user;
    
    const ext = contentType === 'audio/wav' ? 'wav' : 'mp3';
    const key = path || `uploads/${user.id}/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
    
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
    } else {
      // Normal: generate pre-signed URL for direct upload
      const command = new PutObjectCommand({
        Bucket: env.bucketName,
        Key: key,
        ContentType: contentType || 'audio/mpeg',
      });
      
      const uploadUrl = await getSignedUrl(r2Client, command, { expiresIn: 3600 });
      const url = `${env.publicBaseUrl}/${key}`;
      
      return res.json({ ok: true, uploadUrl, url, key });
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