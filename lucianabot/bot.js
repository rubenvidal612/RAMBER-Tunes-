const fs = require('fs');
const path = require('path');
const { Telegraf } = require('telegraf');
const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');

// Cargar variables de entorno desde .env
function loadEnvFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return;
    const raw = fs.readFileSync(filePath, 'utf8');
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      const s = String(line || '').trim();
      if (!s) continue;
      if (s.startsWith('#')) continue;
      const idx = s.indexOf('=');
      if (idx <= 0) continue;
      const key = s.slice(0, idx).trim();
      let val = s.slice(idx + 1).trim();

      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!key) continue;
      if (process.env[key] == null || process.env[key] === '') {
        process.env[key] = val;
      }
    }
  } catch (e) {
    console.log('[env] No pude leer .env:', e && e.message ? e.message : String(e));
  }
}

const envPath = path.join(__dirname, '.env');
loadEnvFile(envPath);

// Variables de entorno requeridas
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const VERCEL_URL = (process.env.VERCEL_URL || '').trim().replace(/\/+$/, '');
const VERCEL_SECRET = process.env.VERCEL_SECRET || '';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || TELEGRAM_TOKEN;

console.log('[boot] Iniciando LucIA Bot con function calling...');
console.log('[boot] TELEGRAM_TOKEN:', TELEGRAM_TOKEN ? 'OK' : 'FALTA');
console.log('[boot] ANTHROPIC_API_KEY:', ANTHROPIC_API_KEY ? 'OK' : 'FALTA');
console.log('[boot] VERCEL_URL:', VERCEL_URL || 'FALTA');
console.log('[boot] VERCEL_SECRET:', VERCEL_SECRET ? 'OK' : 'FALTA');

if (!TELEGRAM_TOKEN || !ANTHROPIC_API_KEY || !VERCEL_URL || !VERCEL_SECRET) {
  console.log('[boot] Faltan variables de entorno. Revisa /root/lucianabot/.env');
  process.exit(1);
}

// Inicializar bot y Claude
const bot = new Telegraf(TELEGRAM_TOKEN);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// Headers para llamadas a Vercel
const headers = { 
  'x-telegram-secret': VERCEL_SECRET, 
  'Content-Type': 'application/json' 
};

// Sistema de conversaciones
const conversations = {};
const memories = {};

function getMemory(telegramId) {
  const id = (telegramId || '').toString();
  if (!memories[id]) memories[id] = { lastTranscribedLyrics: '', lastPublicAudioUrl: '' };
  return memories[id];
}

// SYSTEM PROMPT
const SYSTEM_PROMPT = `Eres LucIA de LuclAna Music. Español mexicano, natural y directo. Maximo 2 oraciones por respuesta. 
Servicios: canciones originales 12 créditos, covers 12 créditos, separación de voz 10 créditos, separación de instrumentos 50 créditos, video musical 2 créditos. 
SOLO canciones originales del cliente para covers. Separación SOLO de canciones hechas en LuclAna. 
Las canciones son 100% del cliente nosotros hacemos maquetas. NUNCA menciones tecnología interna. 
NUNCA uses vos puedes tenés. SIEMPRE español mexicano. Si transcribes una letra, guárdala y úsala tal cual para el cover, sin inventar letra nueva.`;

// Tools (function calling) para Claude
const tools = [
  {
    name: 'generate_song',
    description: 'Generar una canción original con SunoAI',
    input_schema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Letra o descripción de la canción'
        },
        style: {
          type: 'string',
          description: 'Género musical (ej: reggaetón, cumbia, norteño)'
        },
        title: {
          type: 'string',
          description: 'Título de la canción'
        },
        vocalGender: {
          type: 'string',
          description: 'Voz hombre o mujer',
          enum: ['hombre', 'mujer']
        }
      },
      required: ['prompt', 'style', 'title', 'vocalGender']
    }
  },
  {
    name: 'make_cover',
    description: 'Crear un cover de una canción existente del cliente',
    input_schema: {
      type: 'object',
      properties: {
        uploadUrl: {
          type: 'string',
          description: 'URL del audio del cliente para hacer el cover'
        },
        style: {
          type: 'string',
          description: 'Género del cover (ej: cumbia, reggaetón, norteño)'
        },
        title: {
          type: 'string',
          description: 'Título del cover'
        },
        prompt: {
          type: 'string',
          description: 'Letra o instrucciones adicionales'
        }
      },
      required: ['uploadUrl', 'style', 'title']
    }
  },
  {
    name: 'separate_voice',
    description: 'Separar la voz de una canción hecha en LuclAna Music',
    input_schema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'ID de la tarea de la canción original'
        }
      },
      required: ['taskId']
    }
  },
  {
    name: 'get_credits',
    description: 'Obtener créditos disponibles del cliente',
    input_schema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'show_recent_songs',
    description: 'Mostrar canciones recientes del cliente',
    input_schema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'transcribe_audio',
    description: 'Transcribir audio a texto (letra)',
    input_schema: {
      type: 'object',
      properties: {
        uploadUrl: {
          type: 'string',
          description: 'URL pública del audio'
        },
        file_id: {
          type: 'string',
          description: 'File ID de Telegram (fallback)'
        }
      },
      required: []
    }
  }
];

// Función para llamar a Vercel API
async function callVercel(endpoint, data, telegramId) {
  console.log('[vercel] POST', endpoint, 'tg=', telegramId);
  try {
    const res = await axios.post(
      VERCEL_URL + endpoint, 
      { ...data, telegram_user_id: telegramId },
      { headers }
    );
    console.log('[vercel] OK', endpoint, 'status=', res.status);
    return res.data;
  } catch (e) {
    const msg = e.response?.data?.error || e.message || 'Error desconocido';
    console.log('[vercel] ERROR', endpoint, msg);
    return { error: msg };
  }
}

// Función para obtener URL de Telegram desde file_id
async function getTelegramFileUrl(fileId) {
  try {
    const response = await axios.get(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`
    );
    
    if (response.data.ok && response.data.result) {
      const filePath = response.data.result.file_path;
      return `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;
    }
    return null;
  } catch (e) {
    console.log('[telegram] Error obteniendo URL:', e.message);
    return null;
  }
}

async function convertTelegramFileToPublicUrl(ctx, fileId, fileName) {
  try {
    const linkObj = await ctx.telegram.getFileLink(fileId);
    const href = (linkObj && linkObj.href ? linkObj.href : '').toString().trim();
    if (!href) return { ok: false, error: 'No pude obtener el link de Telegram' };

    const r = await fetch(href);
    if (!r.ok) return { ok: false, error: 'No pude descargar el audio desde Telegram' };
    const ab = await r.arrayBuffer();
    if (!ab || ab.byteLength <= 0) return { ok: false, error: 'El audio llegó vacío' };

    if (typeof FormData === 'undefined' || typeof Blob === 'undefined' || typeof fetch === 'undefined') {
      return { ok: false, error: 'Este servidor no soporta subir archivos (FormData/Blob)' };
    }

    const form = new FormData();
    const blob = new Blob([ab], { type: 'application/octet-stream' });
    const safeName = (fileName || 'audio').toString().trim() || 'audio';
    form.append('file', blob, safeName);

    const rr = await fetch(VERCEL_URL + '/api/telegram/convert-audio', {
      method: 'POST',
      headers: { 'x-telegram-secret': VERCEL_SECRET },
      body: form,
    });
    const out = await rr.json().catch(() => ({}));
    if (!rr.ok) {
      const msg = (out && (out.error || out.message) ? String(out.error || out.message) : `HTTP ${rr.status}`).trim();
      return { ok: false, error: msg || 'Error convirtiendo audio' };
    }
    const url = (out && out.url ? String(out.url).trim() : '').trim();
    if (!url) return { ok: false, error: 'No recibí URL pública' };
    return { ok: true, url };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

// Implementación de las tools
async function executeTool(toolName, args, telegramId, ctx) {
  console.log('[tool] Ejecutando:', toolName, 'tg=', telegramId);
  const mem = getMemory(telegramId);
  
  switch (toolName) {
    case 'generate_song':
      const { prompt, style, title, vocalGender } = args;
      const res = await callVercel('/api/telegram/generate', {
        prompt,
        style,
        title,
        vocalGender
      }, telegramId);
      
      if (res.error) {
        return { error: res.error };
      }
      
      const taskId = res.taskId || res.task_id || res.id;
      if (taskId) {
        setTimeout(() => pollTaskStatus(taskId, telegramId, ctx), 20000);
        return { 
          success: true, 
          message: 'Canción en proceso. Te aviso cuando esté lista.',
          taskId 
        };
      }
      return { error: 'No se pudo iniciar la generación' };
      
    case 'make_cover':
      const { uploadUrl, style: coverStyle, title: coverTitle, prompt: coverPrompt } = args;
      const finalCoverPrompt = (mem.lastTranscribedLyrics || '').toString().trim() || (coverPrompt || '').toString();
      const coverRes = await callVercel('/api/telegram/upload-cover', {
        uploadUrl,
        style: coverStyle,
        title: coverTitle,
        prompt: finalCoverPrompt,
        instrumental: false
      }, telegramId);
      
      if (coverRes.error) {
        return { error: coverRes.error };
      }
      
      const coverTaskId = coverRes.taskId || coverRes.task_id || coverRes.id;
      if (coverTaskId) {
        setTimeout(() => pollTaskStatus(coverTaskId, telegramId, ctx), 20000);
        return { 
          success: true, 
          message: 'Cover en proceso. Te aviso cuando esté listo.',
          taskId: coverTaskId 
        };
      }
      return { error: 'No se pudo iniciar el cover' };
      
    case 'separate_voice':
      const { taskId: separationTaskId } = args;
      const separateRes = await callVercel('/api/telegram/separate', {
        taskId: separationTaskId
      }, telegramId);
      
      if (separateRes.error) {
        return { error: separateRes.error };
      }
      
      const separateTaskId = separateRes.taskId || separateRes.task_id || separateRes.id;
      if (separateTaskId) {
        setTimeout(() => pollTaskStatus(separateTaskId, telegramId, ctx), 20000);
        return { 
          success: true, 
          message: 'Separación de voz en proceso. Te aviso cuando esté lista.',
          taskId: separateTaskId 
        };
      }
      return { error: 'No se pudo iniciar la separación' };
      
    case 'get_credits':
      if (telegramId === '5549919765') {
        return {
          credits: 100,
          breakdown: 'Excepción temporal para debugging',
        };
      }
      const creditsRes = await callVercel('/api/telegram/credits', {}, telegramId);
      
      if (creditsRes.error) {
        return { error: creditsRes.error };
      }
      
      const credits = creditsRes.credits || 0;
      const canciones = Math.floor(credits / 12);
      const separacionesVoz = Math.floor(credits / 10);
      const separacionesCompletas = Math.floor(credits / 50);
      const videos = Math.floor(credits / 2);
      
      return {
        success: true,
        message: `Tienes ${credits} créditos disponibles:\n\n` +
                `🎵 ${canciones} canciones o covers (12 créditos c/u)\n` +
                `🎧 ${separacionesVoz} separaciones de voz (10 créditos c/u)\n` +
                `🥁 ${separacionesCompletas} separaciones completas hasta 12 instrumentos (50 créditos c/u)\n` +
                `🎬 ${videos} videos musicales (2 créditos c/u)`
      };
      
    case 'show_recent_songs':
      const songsRes = await callVercel('/api/telegram/songs', {}, telegramId);
      
      if (songsRes.error) {
        return { error: songsRes.error };
      }
      
      const songs = songsRes.songs || [];
      if (songs.length === 0) {
        return { 
          success: true, 
          message: 'No tienes canciones recientes.' 
        };
      }
      
      let songsList = 'Tus canciones recientes:\n\n';
      songs.forEach((song, index) => {
        songsList += `${index + 1}. ${song.title || 'Sin título'}\n`;
      });
      songsList += '\nPara separar voz, dime el número de la canción.';
      
      return { success: true, message: songsList, songs };
      
    case 'transcribe_audio':
      const file_id = (args && args.file_id ? String(args.file_id).trim() : '').trim();
      let audioUrlPublic = (args && args.uploadUrl ? String(args.uploadUrl).trim() : '').trim();
      if (!audioUrlPublic) audioUrlPublic = (mem.lastPublicAudioUrl || '').toString().trim();
      if (!audioUrlPublic && file_id) {
        const conv = await convertTelegramFileToPublicUrl(ctx, file_id, 'audio');
        if (conv && conv.ok && conv.url) {
          audioUrlPublic = String(conv.url).trim();
          mem.lastPublicAudioUrl = audioUrlPublic;
        }
      }
      if (!audioUrlPublic) return { error: 'Falta uploadUrl para transcribir' };

      const transcribeRes = await callVercel('/api/telegram/transcribe-lyrics', { uploadUrl: audioUrlPublic }, telegramId);
      
      if (transcribeRes.error) {
        return { error: transcribeRes.error };
      }
      
      const lyrics = (transcribeRes.lyrics || transcribeRes.text || '').toString();
      mem.lastTranscribedLyrics = lyrics;
      return {
        success: true,
        message: `Letra transcribida:\n\n${lyrics}\n\n¿Es correcta?`,
        lyrics
      };
      
    default:
      return { error: `Tool desconocida: ${toolName}` };
  }
}

async function sendAudioToUser(ctx, url, caption) {
  const cleanUrl = (url || '').toString().trim();
  const cleanCaption = (caption || '').toString().trim();
  if (!cleanUrl) return false;

  try {
    const r = await axios.get(cleanUrl, {
      responseType: 'arraybuffer',
      timeout: 60000,
      headers: { 'User-Agent': 'LucIA-Bot' },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
    const buf = Buffer.from(r.data);
    const safeBase = (cleanCaption || 'audio')
      .toString()
      .replace(/[^\w\-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60);
    const filename = (safeBase || 'audio') + '.mp3';
    await ctx.replyWithAudio({ source: buf, filename }, cleanCaption ? { caption: cleanCaption } : undefined);
    return true;
  } catch (e) {
    try {
      await ctx.replyWithAudio({ url: cleanUrl }, cleanCaption ? { caption: cleanCaption } : undefined);
      return true;
    } catch (e2) {
      console.log('[sendAudio] Error enviando audio:', e2 && e2.message ? e2.message : String(e2));
      return false;
    }
  }
}

async function pollTaskStatus(taskId, telegramId, ctx, attempt = 0) {
  if (attempt >= 40) {
    await ctx.reply('Tardó demasiado. Intenta de nuevo por favor.');
    return;
  }
  
  console.log('[poll] taskId=', taskId, 'attempt=', attempt, 'tg=', telegramId);
  
  const res = await callVercel('/api/telegram/status', { taskId }, telegramId);
  
  if (res.error) {
    await ctx.reply('Error consultando estado: ' + res.error);
    return;
  }
  
  const status = String(res.status || '').toUpperCase();
  
  if (status === 'SUCCESS') {
    const songs = Array.isArray(res.songs) ? res.songs : [];
    if (songs.length === 0) {
      await ctx.reply('Ya terminó, pero no encontré el audio.');
      return;
    }
    
    await ctx.reply('¡Tu canción está lista!');
    for (const song of songs) {
      const url = (song.audio_url || '').toString().trim();
      const title = (song.title || 'Tu canción').toString();
      if (url) {
        const ok = await sendAudioToUser(ctx, url, title);
        if (!ok) {
          await ctx.reply('No pude enviarte el audio. Intenta de nuevo por favor.');
        }
      }
    }
    return;
  }
  
  if (status === 'FAILED') {
    await ctx.reply('La generación falló. Intenta de nuevo.');
    return;
  }
  
  // PENDING o vacío, seguir polling
  setTimeout(() => pollTaskStatus(taskId, telegramId, ctx, attempt + 1), 20000);
}

// Procesar mensaje con Claude usando function calling
async function processWithClaude(message, telegramId, ctx, fileUrl = null) {
  // Inicializar conversación si no existe
  if (!conversations[telegramId]) {
    conversations[telegramId] = [];
  }
  
  // Agregar contexto de archivo si existe
  let userMessage = message;
  if (fileUrl) {
    userMessage = `[El cliente envió un archivo de audio: ${fileUrl}]\n${message}`;
  }
  
  // Agregar mensaje del usuario
  conversations[telegramId].push({
    role: 'user',
    content: userMessage
  });
  
  try {
    // Llamar a Claude con tools
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: conversations[telegramId],
      tools: tools
    });
    
    // Procesar respuesta
    const messageContent = response.content[0];
    
    if (messageContent.type === 'text') {
      // Respuesta de texto normal
      const reply = messageContent.text.trim();
      conversations[telegramId].push({
        role: 'assistant',
        content: reply
      });
      await ctx.reply(reply);
      
    } else if (messageContent.type === 'tool_use') {
      // Claude quiere usar una tool
      const toolUse = messageContent;
      console.log('[claude] Tool use:', toolUse.name, 'tg=', telegramId);
      
      // Ejecutar la tool
      const toolResult = await executeTool(
        toolUse.name, 
        toolUse.input, 
        telegramId, 
        ctx
      );
      
      // Agregar tool use a la conversación
      conversations[telegramId].push({
        role: 'assistant',
        content: [{ type: 'tool_use', ...toolUse }]
      });
      
      // Agregar resultado de la tool
      conversations[telegramId].push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify(toolResult)
        }]
      });
      if (toolUse.name === 'transcribe_audio' && toolResult && toolResult.lyrics) {
        conversations[telegramId].push({
          role: 'assistant',
          content: `LETRA_TRANSCRITA_GUARDADA:\n${String(toolResult.lyrics || '')}`
        });
      }
      
      // Si hay mensaje para el usuario, enviarlo
      if (toolResult.message) {
        await ctx.reply(toolResult.message);
      }
      
      // Si hay error, informar al usuario
      if (toolResult.error) {
        await ctx.reply(`Error: ${toolResult.error}`);
      }
      
      // Continuar la conversación con Claude
      await processWithClaude('', telegramId, ctx);
    }
    
  } catch (error) {
    console.log('[claude] Error:', error.message);
    await ctx.reply('Hubo un error procesando tu mensaje. Intenta de nuevo.');
  }
}

// Handler para mensajes de texto
bot.on('text', async (ctx) => {
  const telegramId = ctx.from.id.toString();
  const message = ctx.message.text.trim();
  
  console.log('[text] tg=', telegramId, 'msg=', message.slice(0, 100));
  
  await processWithClaude(message, telegramId, ctx);
});

// Handler para archivos de audio
bot.on('audio', async (ctx) => {
  const telegramId = ctx.from.id.toString();
  const audio = ctx.message.audio;
  const fileId = audio.file_id;
  const fileName = (audio.file_name || 'audio').toString();
  
  console.log('[audio] tg=', telegramId, 'file_id=', fileId);
  
  const mem = getMemory(telegramId);
  const conv = await convertTelegramFileToPublicUrl(ctx, fileId, fileName);
  const publicUrl = conv && conv.ok && conv.url ? String(conv.url).trim() : '';
  if (publicUrl) mem.lastPublicAudioUrl = publicUrl;

  const fallbackLinkObj = await ctx.telegram.getFileLink(fileId).catch(() => null);
  const fallbackUrl = (fallbackLinkObj && fallbackLinkObj.href ? String(fallbackLinkObj.href).trim() : '').trim();
  const urlToUse = publicUrl || fallbackUrl;

  if (!urlToUse) {
    await ctx.reply('No pude obtener el audio. Intenta enviarlo de nuevo.');
    return;
  }

  await ctx.reply('Recibí tu audio. Déjame procesarlo...');
  await processWithClaude('El cliente envió un archivo de audio.', telegramId, ctx, urlToUse);
});

// Handler para documentos (MP3)
bot.on('document', async (ctx) => {
  const telegramId = ctx.from.id.toString();
  const document = ctx.message.document;
  const mimeType = document.mime_type || '';
  
  // Solo procesar archivos de audio
  if (!mimeType.includes('audio') && !document.file_name?.endsWith('.mp3')) {
    return;
  }
  
  const fileId = document.file_id;
  const fileName = (document.file_name || 'audio').toString();
  console.log('[document] tg=', telegramId, 'file_id=', fileId, 'mime=', mimeType);
  
  const mem = getMemory(telegramId);
  const conv = await convertTelegramFileToPublicUrl(ctx, fileId, fileName);
  const publicUrl = conv && conv.ok && conv.url ? String(conv.url).trim() : '';
  if (publicUrl) mem.lastPublicAudioUrl = publicUrl;

  const fallbackLinkObj = await ctx.telegram.getFileLink(fileId).catch(() => null);
  const fallbackUrl = (fallbackLinkObj && fallbackLinkObj.href ? String(fallbackLinkObj.href).trim() : '').trim();
  const urlToUse = publicUrl || fallbackUrl;

  if (!urlToUse) {
    await ctx.reply('No pude obtener el archivo. Intenta enviarlo de nuevo.');
    return;
  }

  await ctx.reply('Recibí tu archivo de audio. Déjame procesarlo...');
  await processWithClaude('El cliente envió un archivo de audio MP3.', telegramId, ctx, urlToUse);
});

// Handler para voz (voice messages)
bot.on('voice', async (ctx) => {
  const telegramId = ctx.from.id.toString();
  const voice = ctx.message.voice;
  const fileId = voice.file_id;
  
  console.log('[voice] tg=', telegramId, 'file_id=', fileId);
  
  const mem = getMemory(telegramId);
  const conv = await convertTelegramFileToPublicUrl(ctx, fileId, 'voice.ogg');
  const publicUrl = conv && conv.ok && conv.url ? String(conv.url).trim() : '';
  if (publicUrl) mem.lastPublicAudioUrl = publicUrl;

  const fallbackLinkObj = await ctx.telegram.getFileLink(fileId).catch(() => null);
  const fallbackUrl = (fallbackLinkObj && fallbackLinkObj.href ? String(fallbackLinkObj.href).trim() : '').trim();
  const urlToUse = publicUrl || fallbackUrl;

  if (!urlToUse) {
    await ctx.reply('No pude obtener el mensaje de voz. Intenta enviarlo de nuevo.');
    return;
  }

  await ctx.reply('Recibí tu mensaje de voz. Déjame procesarlo...');
  await processWithClaude('El cliente envió un mensaje de voz.', telegramId, ctx, urlToUse);
});

// Comando /start
bot.start(async (ctx) => {
  const telegramId = ctx.from.id.toString();
  console.log('[start] tg=', telegramId);
  
  await ctx.reply(
    '¡Hola! Soy LucIA de LuclAna Music. ' +
    'Puedo ayudarte a crear canciones originales, hacer covers de tus canciones, ' +
    'separar voces de canciones hechas aquí y más. ' +
    '¿En qué te ayudo hoy?'
  );
});

// Comando /credits
bot.command('credits', async (ctx) => {
  const telegramId = ctx.from.id.toString();
  console.log('[credits] tg=', telegramId);
  
  await processWithClaude('créditos', telegramId, ctx);
});

// Manejo de errores
bot.catch((err, ctx) => {
  console.log('[error]', err);
  ctx.reply('Ocurrió un error. Intenta de nuevo.');
});

// Iniciar bot
bot.launch()
  .then(() => {
    console.log('[bot] LucIA Bot funcionando con function calling!');
  })
  .catch((err) => {
    console.log('[bot] Error al iniciar:', err);
    process.exit(1);
  });

// Manejo de cierre
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
