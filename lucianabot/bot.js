const fs = require('fs');
const path = require('path');
const { Telegraf } = require('telegraf');
const Groq = require('groq-sdk');
const axios = require('axios');

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

function mask(s) {
  const v = String(s || '');
  if (v.length <= 6) return '***';
  return v.slice(0, 3) + '***' + v.slice(-3);
}

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || '';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const VERCEL_URL = (process.env.VERCEL_URL || '').trim().replace(/\/+$/, '');
const VERCEL_SECRET = process.env.VERCEL_SECRET || '';

console.log('[boot] Iniciando LucIA Bot...');
console.log(
  '[boot] ENV ok?',
  'TELEGRAM_TOKEN=' + (TELEGRAM_TOKEN ? 'SI' : 'NO'),
  'GROQ_API_KEY=' + (GROQ_API_KEY ? 'SI' : 'NO'),
  'VERCEL_URL=' + (VERCEL_URL ? VERCEL_URL : 'NO'),
  'VERCEL_SECRET=' + (VERCEL_SECRET ? mask(VERCEL_SECRET) : 'NO')
);

if (!TELEGRAM_TOKEN) {
  console.log('[boot] FALTA TELEGRAM_TOKEN en /root/lucianabot/.env');
  process.exit(1);
}
if (!GROQ_API_KEY) {
  console.log('[boot] FALTA GROQ_API_KEY en /root/lucianabot/.env');
  process.exit(1);
}
if (!VERCEL_URL) {
  console.log('[boot] FALTA VERCEL_URL en /root/lucianabot/.env (ej: https://ramber-tunes.vercel.app)');
  process.exit(1);
}
if (!VERCEL_SECRET) {
  console.log('[boot] FALTA VERCEL_SECRET en /root/lucianabot/.env (TELEGRAM_BOT_SECRET)');
  process.exit(1);
}

const bot = new Telegraf(TELEGRAM_TOKEN);
const groq = new Groq({ apiKey: GROQ_API_KEY });

const headers = { 'x-telegram-secret': VERCEL_SECRET, 'Content-Type': 'application/json' };
const conversations = {};
const sessions = {};

const SYSTEM_PROMPT =
  'Eres LucIA, asistente musical de LucIAna | Music. ' +
  'Hablas en español mexicano, eres amable, clara y creativa. ' +
  'Cuando el usuario quiera una CANCIÓN, primero pregunta tema, estilo, mood y nombres. ' +
  'Cuando el usuario quiera un COVER, pide el audio, luego el estilo, luego genera letra y la muestras para aprobación. ' +
  'Cuando tengas todo para CANCIÓN, responde SOLO JSON sin texto extra: {"action":"generate","prompt":"descripcion detallada","style":"estilo musical","title":"titulo sugerido"}. ' +
  'Para COVER responde SOLO JSON: {"action":"cover","style":"...","title":"...","notes":"..."} ' +
  'Para CREDITOS: {"action":"credits"} ' +
  'No menciones proveedores ni cosas internas.';

async function callVercel(endpoint, data, telegramId) {
  console.log('[vercel] POST', endpoint, 'tg=', telegramId);
  try {
    const res = await axios.post(VERCEL_URL + endpoint, Object.assign({}, data || {}, { telegram_user_id: telegramId }), {
      headers,
    });
    console.log('[vercel] OK', endpoint, 'status=', res && res.status);
    return res.data;
  } catch (e) {
    const msg = (e && e.response && e.response.data && e.response.data.error) || (e && e.message) || 'Error';
    console.log('[vercel] ERROR', endpoint, msg);
    return { error: msg };
  }
}

function getSession(telegramId) {
  if (!sessions[telegramId]) sessions[telegramId] = { mode: 'idle' };
  return sessions[telegramId];
}

async function waitAndSend(ctx, taskId, telegramId, attempts) {
  const n = Number(attempts || 0);
  console.log('[poll] taskId=', taskId, 'attempt=', n, 'tg=', telegramId);

  if (n > 30) {
    await ctx.reply('Tardó demasiado. Intenta de nuevo por favor.');
    return;
  }

  setTimeout(async () => {
    const res = await callVercel('/api/telegram/status', { taskId }, telegramId);
    if (res && res.error) {
      await ctx.reply('Error consultando estado: ' + res.error);
      return;
    }

    const status = String(res && res.status ? res.status : '').toUpperCase();
    console.log('[poll] status=', status);

    if (status === 'SUCCESS') {
      const songs = Array.isArray(res.songs) ? res.songs : [];
      if (songs.length === 0) {
        await ctx.reply('Ya terminó, pero no encontré el audio en la respuesta.');
        return;
      }
      await ctx.reply('¡Tu canción está lista!');
      for (let i = 0; i < songs.length; i++) {
        const s = songs[i] || {};
        const url = (s.audio_url || '').toString().trim();
        const title = (s.title || 'Tu canción').toString();
        if (url) {
          console.log('[send] audio_url=', url.slice(0, 60) + '...');
          await ctx.replyWithAudio({ url }, { caption: title });
        }
      }
      return;
    }

    if (status === 'FAILED') {
      await ctx.reply('La generación falló. Intenta de nuevo.');
      return;
    }

    await waitAndSend(ctx, taskId, telegramId, n + 1);
  }, 20000);
}

async function generateLyricsDraft(topic, style) {
  const prompt =
    'Genera una letra ORIGINAL en español mexicano. ' +
    'Estructura clara con etiquetas [Intro], [Verso], [Coro], [Puente], [Outro]. ' +
    'No uses markdown. No uses comillas. ' +
    'Tema: ' +
    String(topic || '').trim() +
    '\n' +
    'Estilo musical: ' +
    String(style || '').trim();

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: 'Eres un compositor profesional. Entrega SOLO la letra.' },
      { role: 'user', content: prompt },
    ],
    max_tokens: 700,
    temperature: 0.8,
  });

  const text = response.choices[0].message.content || '';
  return String(text).trim();
}

async function startCoverFlow(ctx, fileId) {
  const telegramId = ctx.from.id.toString();
  console.log('[cover] start tg=', telegramId, 'fileId=', fileId);

  const s = getSession(telegramId);
  s.mode = 'await_cover_style';
  s.cover = { fileId, uploadUrl: '', style: '', title: 'Cover', lyricsDraft: '', transcribedLyrics: '' };

  try {
    const link = await ctx.telegram.getFileLink(fileId);
    const url = String(link || '').trim();
    s.cover.uploadUrl = url;
    console.log('[cover] fileLink=', url.slice(0, 80) + '...');
  } catch (e) {
    console.log('[cover] getFileLink error:', e && e.message ? e.message : String(e));
    await ctx.reply('No pude leer tu audio de Telegram. Intenta mandar el archivo otra vez.');
    s.mode = 'idle';
    return;
  }

  try {
    const r = await callVercel('/api/telegram/transcribe-lyrics', { file_id: fileId }, telegramId);
    const ok = r && r.ok === true && String(r.status || '').toUpperCase() === 'OK';
    const lyrics = ok && typeof r.lyrics === 'string' ? String(r.lyrics || '').trim() : '';
    if (lyrics) {
      s.cover.transcribedLyrics = lyrics;
      s.mode = 'await_cover_transcription_approve';
      console.log('[cover] transcribedLyrics ok len=', lyrics.length);
      await ctx.reply('Aquí está la letra de tu canción. ¿Es correcta?\n\n' + lyrics + '\n\nResponde: SI o NO.');
      return;
    } else {
      console.log('[cover] transcribedLyrics not available');
    }
  } catch (e) {
    console.log('[cover] transcribedLyrics error:', e && e.message ? e.message : String(e));
  }

  await ctx.reply('Listo. Ahora dime el estilo del cover (ej: cumbia, reggaetón, norteño) y de qué trata la letra.');
}

async function handleCoverText(ctx, text) {
  const telegramId = ctx.from.id.toString();
  const s = getSession(telegramId);
  const msg = String(text || '').trim();

  if (s.mode === 'await_cover_transcription_approve') {
    const upper = msg.toUpperCase();

    if (upper === 'SI' || upper === 'SÍ' || upper === 'OK' || upper.includes('APROBAR')) {
      s.cover.lyricsDraft = s.cover.transcribedLyrics || '';
      s.mode = 'await_cover_style';
      console.log('[cover] transcription approved');
      await ctx.reply('Perfecto. Ahora dime el estilo del cover (ej: cumbia, reggaetón, norteño).');
      return;
    }

    if (upper === 'NO' || upper.includes('CAMBIAR')) {
      s.cover.transcribedLyrics = '';
      s.cover.lyricsDraft = '';
      s.mode = 'await_cover_style';
      console.log('[cover] transcription rejected');
      await ctx.reply('Entendido. Ahora dime el estilo del cover (ej: cumbia, reggaetón, norteño) y de qué trata la letra.');
      return;
    }

    await ctx.reply('Solo responde: SI o NO.');
    return;
  }

  if (s.mode === 'await_cover_style') {
    s.cover.style = msg || 'General';
    console.log('[cover] style/topic=', s.cover.style);

    if (s.cover.lyricsDraft) {
      console.log('[cover] using approved lyrics');
      await ctx.reply('Perfecto. Voy a usar la letra aprobada y empezar tu cover...');

      const payload = {
        uploadUrl: s.cover.uploadUrl,
        style: s.cover.style || 'General',
        title: s.cover.title || 'Cover',
        prompt: s.cover.lyricsDraft || ' ',
        instrumental: false,
      };

      const res = await callVercel('/api/telegram/upload-cover', payload, telegramId);
      if (res && res.error) {
        await ctx.reply('Error: ' + res.error);
        s.mode = 'idle';
        return;
      }

      const taskId = (res.taskId || res.task_id || res.id || '').toString().trim();
      if (!taskId) {
        await ctx.reply('No pude iniciar el cover.');
        s.mode = 'idle';
        return;
      }

      await ctx.reply('Cover en proceso. Te aviso cuando esté listo.');
      s.mode = 'idle';
      await waitAndSend(ctx, taskId, telegramId, 0);
      return;
    }

    await ctx.reply('Perfecto. Estoy creando una letra para que la apruebes...');
    let lyrics = '';
    try {
      lyrics = await generateLyricsDraft(msg, s.cover.style);
    } catch (e) {
      console.log('[cover] generateLyricsDraft error:', e && e.message ? e.message : String(e));
      await ctx.reply('No pude generar la letra ahorita. Intenta otra vez.');
      s.mode = 'idle';
      return;
    }

    if (!lyrics) {
      await ctx.reply('No salió letra. Intenta con un tema más específico.');
      s.mode = 'idle';
      return;
    }

    s.cover.lyricsDraft = lyrics;
    s.mode = 'await_cover_approve';

    await ctx.reply(
      'Aquí está la letra propuesta:\n\n' + lyrics + '\n\nResponde: APROBAR para continuar o CAMBIAR para modificarla.'
    );
    return;
  }

  if (s.mode === 'await_cover_approve') {
    const upper = msg.toUpperCase();
    if (upper.includes('APROBAR') || upper === 'SI' || upper === 'OK') {
      console.log('[cover] approved');
      await ctx.reply('Va. Procesando tu cover…');

      const payload = {
        uploadUrl: s.cover.uploadUrl,
        style: s.cover.style || 'General',
        title: s.cover.title || 'Cover',
        prompt: s.cover.lyricsDraft || ' ',
        instrumental: false,
      };

      const res = await callVercel('/api/telegram/upload-cover', payload, telegramId);
      if (res && res.error) {
        await ctx.reply('Error: ' + res.error);
        s.mode = 'idle';
        return;
      }

      const taskId = (res.taskId || res.task_id || res.id || '').toString().trim();
      if (!taskId) {
        await ctx.reply('No pude iniciar el cover.');
        s.mode = 'idle';
        return;
      }

      await ctx.reply('Cover en proceso. Te aviso cuando esté listo.');
      s.mode = 'idle';
      await waitAndSend(ctx, taskId, telegramId, 0);
      return;
    }

    if (upper.includes('CAMBIAR')) {
      console.log('[cover] wants change');
      s.mode = 'await_cover_style';
      await ctx.reply('Dime qué quieres cambiar (tema/estilo/mood) y genero otra letra.');
      return;
    }

    await ctx.reply('Solo responde: APROBAR o CAMBIAR.');
    return;
  }
}

async function chat(ctx, userMessage) {
  const telegramId = ctx.from.id.toString();
  const s = getSession(telegramId);

  console.log('[text] tg=', telegramId, 'mode=', s.mode, 'msg=', String(userMessage || '').slice(0, 120));

  if (s.mode === 'await_cover_transcription_approve' || s.mode === 'await_cover_style' || s.mode === 'await_cover_approve') {
    await handleCoverText(ctx, userMessage);
    return;
  }

  if (!conversations[telegramId]) conversations[telegramId] = [];
  conversations[telegramId].push({ role: 'user', content: userMessage });
  if (conversations[telegramId].length > 20) conversations[telegramId] = conversations[telegramId].slice(-20);

  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'system', content: SYSTEM_PROMPT }].concat(conversations[telegramId]),
      max_tokens: 500,
      temperature: 0.7,
    });

    const reply = (response.choices[0].message.content || '').trim();
    conversations[telegramId].push({ role: 'assistant', content: reply });

    console.log('[ai] reply=', reply.slice(0, 200));

    try {
      const json = JSON.parse(reply);
      if (json && json.action) {
        const action = String(json.action || '').trim();

        if (action === 'credits') {
          const res = await callVercel('/api/telegram/credits', {}, telegramId);
          if (res && res.error) return ctx.reply('Error: ' + res.error);
          return ctx.reply('Tienes ' + res.credits + ' créditos disponibles.');
        }

        if (action === 'generate') {
          await ctx.reply('Generando tu canción, espera unos minutos…');
          const res = await callVercel(
            '/api/telegram/generate',
            { prompt: json.prompt || userMessage, style: json.style || 'General', title: json.title || 'Canción', instrumental: false, customMode: true },
            telegramId
          );

          if (res && res.error) return ctx.reply('Error: ' + res.error);
          const taskId = (res.taskId || res.task_id || res.id || '').toString().trim();
          if (!taskId) return ctx.reply('No se pudo iniciar la generación.');
          await ctx.reply('Canción en proceso. Te aviso cuando esté lista.');
          return waitAndSend(ctx, taskId, telegramId, 0);
        }

        if (action === 'cover') {
          return ctx.reply(
            'Mándame el audio (mp3/m4a) y luego te pido el estilo. Yo genero la letra y te la muestro para aprobar.'
          );
        }
      }
    } catch (e) {
      // ignore
    }

    return ctx.reply(reply || 'No entendí. ¿Quieres canción, cover o créditos?');
  } catch (e) {
    console.log('[ai] error:', e && e.message ? e.message : String(e));
    return ctx.reply('Error de IA: ' + (e && e.message ? e.message : 'error'));
  }
}

bot.start((ctx) => {
  const name = ctx.from.first_name || 'amigo';
  console.log('[start] tg=', ctx.from.id.toString());
  ctx.reply('Hola ' + name + '! Soy LucIA. Puedo crear canciones originales o hacer covers. ¿Qué quieres hacer hoy?');
});

bot.on('audio', async (ctx) => {
  const telegramId = ctx.from.id.toString();
  const fileId = ctx.message.audio.file_id;
  console.log('[audio] tg=', telegramId, 'fileId=', fileId);
  await ctx.reply('Recibí tu audio. Vamos a hacer un cover: primero genero la letra y te la muestro para aprobar.');
  await startCoverFlow(ctx, fileId);
});

bot.on('document', async (ctx) => {
  const telegramId = ctx.from.id.toString();
  const doc = ctx.message.document || {};
  const fileId = doc.file_id;
  const name = String(doc.file_name || '');
  console.log('[document] tg=', telegramId, 'fileId=', fileId, 'name=', name);
  await ctx.reply('Recibí tu archivo. Si es audio, hacemos un cover: primero genero la letra y te la muestro para aprobar.');
  await startCoverFlow(ctx, fileId);
});

bot.on('text', (ctx) => chat(ctx, ctx.message.text));

bot.launch();
console.log('[boot] LucIA Bot iniciado correctamente');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
