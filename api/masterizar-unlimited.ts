import { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseCreateClient } from '../lib/supabase';
import { getSignedR2Url, getSignedR2PutUrl } from '../lib/r2';

// Función para verificar suscripción de masterización
async function checkMasteringSubscription(userId: string) {
  const supabaseUrl = (process.env.SUPABASE_URL || "").toString().trim();
  const supabaseService = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").toString().trim();
  
  if (!supabaseUrl || !supabaseService) {
    throw new Error('Faltan variables de Supabase');
  }

  const createClient = await getSupabaseCreateClient();
  const supabase = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });

  const { data, error } = await supabase
    .from('profiles')
    .select('mastering_subscription_active, mastering_subscription_expires_at')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Error al verificar suscripción:', error);
    return { active: false, expires_at: null };
  }

  const active = data.mastering_subscription_active || false;
  const expires_at = data.mastering_subscription_expires_at;

  // Verificar si la suscripción ha expirado
  if (active && expires_at) {
    const now = new Date();
    const expiresDate = new Date(expires_at);
    
    if (now > expiresDate) {
      // Actualizar estado a inactivo
      await supabase
        .from('profiles')
        .update({ 
          mastering_subscription_active: false,
          mastering_subscription_expires_at: null
        })
        .eq('id', userId);
      
      return { active: false, expires_at: null };
    }
  }

  return { active, expires_at };
}

// Función para ejecutar masterización con el worker del VPS
async function runMasteringWithWorker(params: { 
  workerUrl: string; 
  inputUrl: string; 
  outputPutUrl: string;
}) {
  const workerUrl = params.workerUrl.replace(/\/+$/, "");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10 * 60 * 1000);
  
  try {
    const r = await fetch(workerUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        inputUrl: params.inputUrl,
        outputUploadUrl: params.outputPutUrl,
        ffmpegArgs: ["-af", "loudnorm=I=-14:TP=-1.0:LRA=11"],
      }),
      signal: ctrl.signal as any,
    }).finally(() => clearTimeout(timer));
    
    const out = await r.json().catch(() => ({}));
    if (!r.ok || out?.ok === false) {
      const msg = String(out?.error || out?.detail || `HTTP ${r.status}`);
      throw new Error(msg || "No pude masterizar en el worker");
    }
    return true;
  } finally {
    clearTimeout(timer);
  }
}

// Función para obtener usuario desde cookie de sesión
async function getUserFromSession(req: NextApiRequest) {
  const supabaseUrl = (process.env.SUPABASE_URL || "").toString().trim();
  const supabaseAnon = (process.env.SUPABASE_ANON_KEY || "").toString().trim();
  
  if (!supabaseUrl || !supabaseAnon) {
    return null;
  }

  const createClient = await getSupabaseCreateClient();
  const supabase = createClient(supabaseUrl, supabaseAnon, { 
    auth: { persistSession: false } 
  });

  // Extraer token de las cookies
  const cookies = req.headers.cookie || '';
  const sessionCookie = cookies.split(';').find(c => c.trim().startsWith('sb-'));
  
  if (!sessionCookie) {
    return null;
  }

  // Obtener usuario desde Supabase
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error || !user) {
    return null;
  }

  return user;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Solo permitir POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    // Obtener usuario si está autenticado
    const user = await getUserFromSession(req);
    const isLoggedIn = !!user;
    const userId = user?.id;

    // Verificar si hay archivo en la solicitud
    if (!req.body || !req.body.file) {
      return res.status(400).json({ error: 'No se proporcionó archivo' });
    }

    // Validar que sea MP3
    const file = req.body.file;
    const fileName = file.name || 'audio.mp3';
    const fileType = file.type || 'audio/mpeg';
    
    if (!fileName.toLowerCase().endsWith('.mp3') && !fileType.includes('audio/mpeg')) {
      return res.status(400).json({ 
        error: 'El archivo debe ser MP3',
        converterUrl: 'https://online-audio-converter.com/sp/' 
      });
    }

    // Generar clave única para el archivo
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 10);
    const fileKey = `uploads/masterizar-unlimited/${userId || 'anonymous'}/${timestamp}_${random}_${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    // Subir archivo a R2
    const uploadUrl = await getSignedR2PutUrl(fileKey, fileType, 600);
    
    // Subir el archivo
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': fileType,
      },
    });

    if (!uploadResponse.ok) {
      throw new Error('Error al subir archivo a R2');
    }

    // Obtener URL firmada para el archivo de entrada
    const inputUrl = await getSignedR2Url(fileKey, 3600);

    // Generar clave para el archivo de salida
    const outputKey = `masterized-unlimited/${userId || 'anonymous'}/${timestamp}_${random}_masterized.mp3`;
    const outputPutUrl = await getSignedR2PutUrl(outputKey, 'audio/mpeg', 600);

    // URL del worker del VPS
    const workerUrl = (process.env.MASTERING_WORKER_URL || "").toString().trim();
    
    if (!workerUrl) {
      throw new Error('MASTERING_WORKER_URL no configurada');
    }

    // Ejecutar masterización
    await runMasteringWithWorker({
      workerUrl,
      inputUrl,
      outputPutUrl,
    });

    // Obtener URL para preview
    const previewUrl = await getSignedR2Url(outputKey, 3600);

    // Verificar suscripción si el usuario está autenticado
    let subscriptionActive = false;
    let expiresAt = null;
    let downloadUrl = null;

    if (isLoggedIn && userId) {
      const subscription = await checkMasteringSubscription(userId);
      subscriptionActive = subscription.active;
      expiresAt = subscription.expires_at;
      
      if (subscriptionActive) {
        downloadUrl = previewUrl;
      }
    }

    // Responder con las URLs
    return res.status(200).json({
      success: true,
      previewUrl,
      downloadUrl,
      subscriptionActive,
      expiresAt,
      isLoggedIn,
      message: subscriptionActive 
        ? '¡Masterización completada! Puedes descargar el archivo.' 
        : '¡Masterización completada! Puedes escuchar el preview gratis. Para descargar, necesitas una suscripción activa.'
    });

  } catch (error: any) {
    console.error('Error en masterizar-unlimited:', error);
    
    return res.status(500).json({
      error: 'Error al procesar la masterización',
      message: error.message || 'Error desconocido',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

// Configuración para manejar archivos grandes
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb', // Tamaño máximo para archivos MP3
    },
  },
};