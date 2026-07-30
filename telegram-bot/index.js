import "dotenv/config";
import { Telegraf, session } from "telegraf";
import { Scenes } from "telegraf";
import OpenAI from "openai";

function mustEnv(name) {
  const v = String(process.env[name] || "").trim();
  if (!v) throw new Error(`Falta variable de entorno: ${name}`);
  return v;
}

const BOT_TOKEN = mustEnv("TELEGRAM_BOT_TOKEN");
const TELEGRAM_BOT_SECRET = mustEnv("TELEGRAM_BOT_SECRET");
const OPENAI_API_KEY = mustEnv("OPENAI_API_KEY");
const BASE_URL = String(process.env.BASE_URL || "https://ramber-tunes.vercel.app").trim().replace(/\/+$/, "");

function isOkText(raw) {
  const s = String(raw || "").trim().toLowerCase();
  return s === "ok" || s === "okay" || s === "listo" || s === "si" || s === "sí";
}

function cleanText(raw) {
  return String(raw || "").trim().replace(/\s+/g, " ").trim();
}

async function apiPostJson(pathname, body) {
  const url = `${BASE_URL}${pathname.startsWith("/") ? "" : "/"}${pathname}`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-secret": TELEGRAM_BOT_SECRET,
    },
    body: JSON.stringify(body || {}),
  });
  const out = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data: out };
}

async function apiPostMultipart(pathname, formData) {
  const url = `${BASE_URL}${pathname.startsWith("/") ? "" : "/"}${pathname}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "x-telegram-secret": TELEGRAM_BOT_SECRET },
    body: formData,
  });
  const out = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data: out };
}

// Función para convertir audio a MP3 descargándolo primero
async function convertAudioToMp3(telegram_user_id, audioUrl) {
  try {
    // Descargar el audio desde la URL
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      return { ok: false, status: audioResponse.status, data: { error: "Error descargando audio" } };
    }
    
    // Obtener el buffer del audio
    const audioBuffer = await audioResponse.arrayBuffer();
    
    // Crear FormData
    const formData = new FormData();
    
    // Crear un blob con el audio
    const audioBlob = new Blob([audioBuffer], { type: "audio/mpeg" });
    
    // Agregar el archivo al FormData
    // Usar un nombre de archivo genérico ya que no tenemos el nombre original
    formData.append("file", audioBlob, "audio.mp3");
    
    // Llamar al endpoint de conversión
    const url = `${BASE_URL}/api/telegram/convert-audio`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "x-telegram-secret": TELEGRAM_BOT_SECRET },
      body: formData,
    });
    
    const out = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data: out };
    
  } catch (error) {
    console.error("Error en convertAudioToMp3:", error);
    return { ok: false, status: 500, data: { error: "Error interno al convertir audio" } };
  }
}

function extractStatus(providerResponse) {
  const d = providerResponse?.data ?? providerResponse ?? {};
  const statusRaw = d?.data?.status ?? d?.data?.successFlag ?? d?.data?.data?.status ?? d?.data?.data?.successFlag ?? "";
  return String(statusRaw || "").toUpperCase();
}

function collectStrings(obj, out) {
  if (!obj) return;
  if (typeof obj === "string") {
    out.push(obj);
    return;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) collectStrings(item, out);
    return;
  }
  if (typeof obj === "object") {
    for (const v of Object.values(obj)) collectStrings(v, out);
  }
}

function extractAudioUrls(providerResponse) {
  const root = providerResponse?.data ?? providerResponse ?? {};
  const found = [];
  const candidates = [];
  collectStrings(root, candidates);
  for (const s of candidates) {
    const u = String(s || "").trim();
    if (!/^https?:\/\//i.test(u)) continue;
    const lower = u.toLowerCase();
    if (lower.includes("replicate.delivery")) continue;
    if (lower.includes("r2.cloudflarestorage.com")) continue;
    if (lower.endsWith(".mp3") || lower.endsWith(".wav") || lower.endsWith(".m4a") || lower.includes("audio")) found.push(u);
  }
  const dedup = Array.from(new Set(found));
  return dedup.slice(0, 2);
}

function extractLyricsText(providerResponse) {
  const root = providerResponse?.data ?? providerResponse ?? {};
  const candidates = [];
  collectStrings(root, candidates);
  const likely = candidates
    .map((s) => String(s || "").trim())
    .filter((s) => s.length >= 40 && s.length <= 8000)
    .filter((s) => !/^https?:\/\//i.test(s))
    .filter((s) => s.includes("\n") || s.toLowerCase().includes("coro") || s.toLowerCase().includes("verso"));
  if (likely.length === 0) return "";
  likely.sort((a, b) => b.length - a.length);
  return likely[0];
}

// Configuración de OpenAI API
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// System prompt para OpenAI
const SYSTEM_PROMPT = `Eres LucianaMusic, la asistente musical con IA de la plataforma RamberTunes (ramber-tunes.vercel.app). Tienes personalidad carismática, apasionada por la música y muy cercana con los clientes. 
 
 QUIÉN ERES: 
 - Te llamas LucianaMusic, eres una IA musical creada para RamberTunes 
 - Hablas en español de forma natural, cálida y con energía musical 
 - Usas emojis musicales ocasionalmente 🎵🎶🎤🎸 
 - Eres experta en todos los géneros: reggaeton, cumbia, banda, pop, trap, balada, etc. 
 
 LO QUE PUEDES HACER: 
 - Crear canciones originales con IA (cuesta 12 créditos) 
 - Hacer covers tomando el audio del cliente y cambiando el estilo musical (cuesta 12 créditos) 
 - Consultar cuántos créditos tiene el cliente 
 - Vincular la cuenta de RamberTunes con Telegram 
 - Ver el estado de una canción en proceso 
 
 CÓMO AYUDAS: 
 - Cuando alguien quiere una canción, pregunta el género y el tema de forma conversacional 
 - Antes de hacer un cover, genera primero la letra y pide aprobación 
 - Si no tienen créditos, los mandas a recargar en ramber-tunes.vercel.app 
 - Si no han vinculado su cuenta, les explicas que deben ir a ramber-tunes.vercel.app → Perfil → generar código de vinculación 
 - Siempre muestras ambas versiones de la canción cuando están listas 
 
 IMPORTANTE: 
 - Nunca menciones sunoapi.org ni detalles técnicos internos 
 - Si te preguntan cómo funcinas, di que usas IA avanzada de última generación 
 - Siempre sé positiva y motivadora con los clientes`;

// Historial de conversación por usuario
const conversationHistory = new Map();

// Función para mantener historial limitado (máximo 20 mensajes)
function addToHistory(userId, role, content) {
  if (!conversationHistory.has(userId)) {
    conversationHistory.set(userId, []);
  }
  const history = conversationHistory.get(userId);
  history.push({ role, content });
  
  // Mantener solo los últimos 20 mensajes
  if (history.length > 20) {
    conversationHistory.set(userId, history.slice(-20));
  }
}

// Función para obtener historial de usuario
function getHistory(userId) {
  return conversationHistory.get(userId) || [];
}

// Tools para OpenAI
const OPENAI_TOOLS = [
  {
    type: "function",
    function: {
      name: "generate_song",
      description: "Genera una canción original basada en una descripción o tema",
      parameters: {
        type: "object",
        properties: {
          description: {
            type: "string",
            description: "Descripción de la canción que el usuario quiere crear"
          }
        },
        required: ["description"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "check_credits",
      description: "Consulta los créditos disponibles del usuario",
      parameters: {
        type: "object",
        properties: {
          telegram_user_id: {
            type: "string",
            description: "ID del usuario de Telegram"
          }
        },
        required: ["telegram_user_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "make_cover",
      description: "Crea un cover de una canción existente",
      parameters: {
        type: "object",
        properties: {
          song_description: {
            type: "string",
            description: "Descripción de la canción original para hacer el cover"
          }
        },
        required: ["song_description"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "link_account",
      description: "Vincula la cuenta de Telegram con RamberTunes",
      parameters: {
        type: "object",
        properties: {
          telegram_user_id: {
            type: "string",
            description: "ID del usuario de Telegram"
          }
        },
        required: ["telegram_user_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "separate_vocals",
      description: "Separa las vocales de un audio para obtener la pista instrumental y la vocal",
      parameters: {
        type: "object",
        properties: {
          audioUrl: {
            type: "string",
            description: "URL del audio a procesar"
          }
        },
        required: ["audioUrl"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "check_status",
      description: "Consulta el estado de una tarea en proceso",
      parameters: {
        type: "object",
        properties: {
          telegram_user_id: {
            type: "string",
            description: "ID del usuario de Telegram"
          },
          taskId: {
            type: "string",
            description: "ID de la tarea a consultar"
          }
        },
        required: ["telegram_user_id", "taskId"]
      }
    }
  }
];

// Función para procesar tool calls de OpenAI
async function processToolCall(toolName, input, ctx) {
  const telegram_user_id = String(ctx.from?.id || "");
  
  switch (toolName) {
    case "generate_song":
      const r1 = await apiPostJson("/api/telegram/generate", {
        telegram_user_id,
        description: input.description
      });
      return r1;
      
    case "check_credits":
      const r2 = await apiPostJson("/api/telegram/credits", {
        telegram_user_id: input.telegram_user_id || telegram_user_id
      });
      return r2;
      
    case "make_cover":
      const r3 = await apiPostJson("/api/telegram/upload-cover", {
        telegram_user_id,
        description: input.song_description,
        styleWeight: 0.7,
        audioWeight: 0.3,
      });
      return r3;
      
    case "link_account":
      const r4 = await apiPostJson("/api/telegram/link", {
        telegram_user_id: input.telegram_user_id || telegram_user_id
      });
      return r4;
      
    case "separate_vocals":
      const r6 = await apiPostJson("/api/telegram/separate-vocals", {
        telegram_user_id,
        audioUrl: input.audioUrl
      });
      return r6;
      
    case "check_status":
      const r5 = await apiPostJson("/api/telegram/status", {
        telegram_user_id: input.telegram_user_id || telegram_user_id,
        taskId: input.taskId
      });
      return r5;
      
    default:
      return { ok: false, status: 400, data: { error: `Tool desconocida: ${toolName}` } };
  }
}

// Función principal para interactuar con OpenAI
async function chatWithOpenAI(userId, userMessage, ctx) {
  try {
    // Agregar mensaje del usuario al historial
    addToHistory(userId, "user", userMessage);
    
    // Obtener historial de conversación
    const history = getHistory(userId);
    
    // Preparar mensajes para OpenAI
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history.map(msg => ({ role: msg.role, content: msg.content }))
    ];
    
    // Llamar a OpenAI API
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 1024,
      messages: messages,
      tools: OPENAI_TOOLS,
      tool_choice: "auto"
    });
    
    const message = response.choices[0].message;
    
    // Debugging: ver qué responde GPT
    console.log('GPT finish_reason:', response.choices[0].finish_reason);
    console.log('GPT tool_calls:', JSON.stringify(message.tool_calls));
    console.log('GPT content:', message.content?.substring(0, 100));
    
    let finalResponse = message.content || "";
    let toolCalls = message.tool_calls || [];
    
    // Si OpenAI usó tools, procesarlas
    if (toolCalls.length > 0) {
      const toolResults = [];
      
      for (const toolCall of toolCalls) {
        // Ejecutar la tool
        const toolResult = await processToolCall(toolCall.function.name, JSON.parse(toolCall.function.arguments), ctx);
        
        // Formatear resultado para OpenAI
        let resultText = "";
        if (toolResult.ok) {
          resultText = `Éxito: ${JSON.stringify(toolResult.data, null, 2)}`;
        } else {
          resultText = `Error (${toolResult.status}): ${JSON.stringify(toolResult.data, null, 2)}`;
        }
        
        toolResults.push({
          tool_call_id: toolCall.id,
          role: "tool",
          name: toolCall.function.name,
          content: resultText
        });
      }
      
      // Si hay tool results, hacer un segundo turno con OpenAI
      if (toolResults.length > 0) {
        // Agregar tool calls al historial
        addToHistory(userId, "assistant", `[Usé tools: ${toolCalls.map(t => t.function.name).join(', ')}]`);
        
        // Preparar mensajes para el segundo turno
        const secondTurnMessages = [
          { role: "system", content: SYSTEM_PROMPT },
          ...getHistory(userId),
          { role: "assistant", content: "", tool_calls: toolCalls },
          ...toolResults.map(tr => ({
            role: tr.role,
            content: tr.content,
            tool_call_id: tr.tool_call_id,
            name: tr.name
          }))
        ];
        
        // Segundo turno con OpenAI
        const secondResponse = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          max_tokens: 1024,
          messages: secondTurnMessages,
          tools: OPENAI_TOOLS,
          tool_choice: "auto"
        });
        
        // Procesar segunda respuesta
        const secondMessage = secondResponse.choices[0].message;
        finalResponse = secondMessage.content || "";
        
        // Agregar respuesta final al historial
        if (finalResponse.trim()) {
          addToHistory(userId, "assistant", finalResponse);
        }
      }
    }
    
    // Si no hubo tool calls, agregar la respuesta directa al historial
    if (toolCalls.length === 0 && finalResponse.trim()) {
      addToHistory(userId, "assistant", finalResponse);
    }
    
    return finalResponse || "Recibí tu mensaje. ¿En qué más puedo ayudarte?";
    
  } catch (error) {
    console.error("Error al chat con OpenAI:", error);
    return "Lo siento, hubo un error al procesar tu mensaje. Por favor, intenta de nuevo.";
  }
}

async function pollTask(telegram_user_id, taskId, onTick) {
  const started = Date.now();
  while (Date.now() - started < 30 * 60 * 1000) {
    const r = await apiPostJson("/api/telegram/status", { telegram_user_id, taskId });
    if (!r.ok) return { ok: false, status: r.status, data: r.data };
    const status = extractStatus(r.data);
    if (typeof onTick === "function") {
      try {
        await onTick({ status, raw: r.data });
      } catch {
      }
    }
    if (status === "SUCCESS") return { ok: true, status: 200, data: r.data };
    if (status === "FAILED" || status.includes("FAILED") || status === "CALLBACK_EXCEPTION") return { ok: false, status: 502, data: r.data };
    await new Promise((r2) => setTimeout(r2, 15000));
  }
  return { ok: false, status: 504, data: { error: "Tiempo de espera" } };
}

function handleApiError(ctx, r) {
  const msg = String(r?.data?.error || "").trim();
  if (r?.status === 402 || msg.toLowerCase().includes("créditos")) {
    return ctx.reply("No tienes créditos suficientes. Recarga en ramber-tunes.vercel.app");
  }
  if (r?.status === 401 && (msg.toLowerCase().includes("vincul") || msg.toLowerCase().includes("cuenta"))) {
    return ctx.reply("Tu cuenta no está vinculada. Ve a ramber-tunes.vercel.app → Perfil → genera tu código y luego usa /vincular");
  }
  return ctx.reply(msg || "Ocurrió un error. Intenta otra vez.");
}

const linkWizard = new Scenes.WizardScene(
  "link",
  async (ctx) => {
    await ctx.reply("Envíame tu código de 6 dígitos (lo generas en ramber-tunes.vercel.app → Perfil).");
    return ctx.wizard.next();
  },
  async (ctx) => {
    const token = cleanText(ctx.message?.text || "");
    if (!/^\d{6}$/.test(token)) {
      await ctx.reply("El código debe tener 6 dígitos. Envíalo otra vez.");
      return;
    }
    const telegram_user_id = ctx.from?.id;
    const telegram_username = ctx.from?.username || "";
    const r = await apiPostJson("/api/telegram/link", { telegram_user_id, telegram_username, token });
    if (!r.ok) {
      await handleApiError(ctx, r);
      return ctx.scene.leave();
    }
    await ctx.reply("Listo. Tu cuenta quedó vinculada.");
    return ctx.scene.leave();
  },
);

const songWizard = new Scenes.WizardScene(
  "song",
  async (ctx) => {
    ctx.wizard.state.data = {};
    await ctx.reply("Vamos a crear tu canción. ¿Qué género quieres? (ej: reggaeton, cumbia, pop, banda)");
    return ctx.wizard.next();
  },
  async (ctx) => {
    const genre = cleanText(ctx.message?.text || "");
    if (!genre) {
      await ctx.reply("Dime un género.");
      return;
    }
    ctx.wizard.state.data.genre = genre;
    await ctx.reply("¿De qué tema quieres la canción? (ej: amor, fiesta, desamor, superación)");
    return ctx.wizard.next();
  },
  async (ctx) => {
    const theme = cleanText(ctx.message?.text || "");
    if (!theme) {
      await ctx.reply("Dime un tema.");
      return;
    }
    ctx.wizard.state.data.theme = theme;
    await ctx.reply("¿Quieres letra propia o automática? Responde: PROPIA o AUTO");
    return ctx.wizard.next();
  },
  async (ctx) => {
    const choice = cleanText(ctx.message?.text || "").toLowerCase();
    if (choice !== "propia" && choice !== "auto") {
      await ctx.reply("Responde PROPIA o AUTO.");
      return;
    }
    ctx.wizard.state.data.lyricsMode = choice;
    await ctx.reply("¿Con voz o instrumental? Responde: VOZ o INSTRUMENTAL");
    return ctx.wizard.next();
  },
  async (ctx) => {
    const v = cleanText(ctx.message?.text || "").toLowerCase();
    if (v !== "voz" && v !== "instrumental") {
      await ctx.reply("Responde VOZ o INSTRUMENTAL.");
      return;
    }
    ctx.wizard.state.data.instrumental = v === "instrumental";
    if (ctx.wizard.state.data.lyricsMode === "propia" && !ctx.wizard.state.data.instrumental) {
      await ctx.reply("Pégame tu letra completa.");
      return ctx.wizard.next();
    }
    return ctx.wizard.selectStep(6);
  },
  async (ctx) => {
    const lyrics = String(ctx.message?.text || "").trim();
    if (!lyrics || lyrics.length < 20) {
      await ctx.reply("La letra parece muy corta. Pégala completa.");
      return;
    }
    ctx.wizard.state.data.lyrics = lyrics;
    return ctx.wizard.next();
  },
  async (ctx) => {
    const telegram_user_id = ctx.from?.id;
    const genre = ctx.wizard.state.data.genre;
    const theme = ctx.wizard.state.data.theme;
    const instrumental = Boolean(ctx.wizard.state.data.instrumental);
    const title = String(theme || "Canción").slice(0, 80);
    const lyricsMode = ctx.wizard.state.data.lyricsMode;
    const lyrics =
      lyricsMode === "propia" && typeof ctx.wizard.state.data.lyrics === "string"
        ? ctx.wizard.state.data.lyrics
        : `Letra en español sobre: ${theme}. Incluye versos y coro.`;
    const body = {
      telegram_user_id,
      prompt: lyrics,
      style: genre,
      title,
      customMode: true,
      instrumental,
      model: "V5",
    };
    await ctx.reply("Generando tu canción. Esto puede tardar unos minutos.");
    const started = await apiPostJson("/api/telegram/generate", body);
    if (!started.ok) {
      await handleApiError(ctx, started);
      return ctx.scene.leave();
    }
    const taskId = String(started.data?.taskId || "").trim();
    if (!taskId) {
      await ctx.reply("No pude iniciar la tarea.");
      return ctx.scene.leave();
    }
    const done = await pollTask(telegram_user_id, taskId);
    if (!done.ok) {
      await ctx.reply("No se pudo completar la canción. Intenta otra vez.");
      return ctx.scene.leave();
    }
    const urls = extractAudioUrls(done.data);
    if (urls.length === 0) {
      await ctx.reply("Terminó, pero no encontré los links de audio. Revisa en la web.");
      return ctx.scene.leave();
    }
    const msg =
      urls.length >= 2
        ? `Tu canción está lista:\nVersión 1: ${urls[0]}\nVersión 2: ${urls[1]}`
        : `Tu canción está lista:\nAudio: ${urls[0]}`;
    await ctx.reply(msg);
    return ctx.scene.leave();
  },
);

const coverWizard = new Scenes.WizardScene(
  "cover",
  async (ctx) => {
    ctx.wizard.state.data = {};
    await ctx.reply("Envíame el audio (nota de voz o archivo).");
    return ctx.wizard.next();
  },
  async (ctx) => {
    const voice = ctx.message?.voice;
    const audio = ctx.message?.audio;
    const doc = ctx.message?.document;
    const fileId = voice?.file_id || audio?.file_id || doc?.file_id || "";
    const fileName = (audio?.file_name || doc?.file_name || "audio.ogg").toString();
    if (!fileId) {
      await ctx.reply("No recibí audio. Envíalo como nota de voz o archivo.");
      return;
    }
    const link = await ctx.telegram.getFileLink(fileId);
    const r = await fetch(link.href);
    if (!r.ok) {
      await ctx.reply("No pude descargar tu audio desde Telegram. Intenta otra vez.");
      return ctx.scene.leave();
    }
    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.length) {
      await ctx.reply("El archivo llegó vacío.");
      return ctx.scene.leave();
    }
    await ctx.reply("Convirtiendo tu audio a MP3...");
    const form = new FormData();
    const blob = new Blob([buf], { type: "application/octet-stream" });
    form.append("file", blob, fileName);
    const converted = await apiPostMultipart("/api/telegram/convert-audio", form);
    if (!converted.ok) {
      await handleApiError(ctx, converted);
      return ctx.scene.leave();
    }
    const url = String(converted.data?.url || "").trim();
    if (!url) {
      await ctx.reply("No pude obtener la URL del audio convertido.");
      return ctx.scene.leave();
    }
    ctx.wizard.state.data.uploadUrl = url;
    await ctx.reply("¿Qué género quieres para el cover? (ej: reggaeton, cumbia, pop, banda)");
    return ctx.wizard.next();
  },
  async (ctx) => {
    const genre = cleanText(ctx.message?.text || "");
    if (!genre) {
      await ctx.reply("Dime un género.");
      return;
    }
    ctx.wizard.state.data.genre = genre;
    await ctx.reply("¿Cómo se llama la canción?");
    return ctx.wizard.next();
  },
  async (ctx) => {
    const title = cleanText(ctx.message?.text || "");
    if (!title) {
      await ctx.reply("Dime el título.");
      return;
    }
    ctx.wizard.state.data.title = title;
    await ctx.reply("Voy a generar una letra. Espera un momento.");
    const telegram_user_id = ctx.from?.id;
    const genre = ctx.wizard.state.data.genre;
    const prompt = `Genera solo la letra de una canción de ${genre} llamada ${title}, sin introducción ni explicación, solo la letra con versos y coro`;
    const started = await apiPostJson("/api/telegram/generate", {
      telegram_user_id,
      prompt,
      customMode: false,
      model: "V5",
    });
    if (!started.ok) {
      await handleApiError(ctx, started);
      return ctx.scene.leave();
    }
    const taskId = String(started.data?.taskId || "").trim();
    if (!taskId) {
      await ctx.reply("No pude iniciar la generación de letra.");
      return ctx.scene.leave();
    }
    const done = await pollTask(telegram_user_id, taskId);
    if (!done.ok) {
      await ctx.reply("No pude generar la letra. Intenta otra vez.");
      return ctx.scene.leave();
    }
    const lyrics = extractLyricsText(done.data);
    if (!lyrics) {
      await ctx.reply("No pude extraer la letra. Podemos continuar igual, pero no te la puedo mostrar.");
      ctx.wizard.state.data.lyrics = prompt;
    } else {
      ctx.wizard.state.data.lyrics = lyrics;
      await ctx.reply(`Esta es la letra:\n\n${lyrics}\n\n¿Te gusta? Responde OK para continuar o dime qué cambiar.`);
      return ctx.wizard.next();
    }
    await ctx.reply("¿Te gusta? Responde OK para continuar o dime qué cambiar.");
    return ctx.wizard.next();
  },
  async (ctx) => {
    const text = String(ctx.message?.text || "").trim();
    const telegram_user_id = ctx.from?.id;
    const genre = ctx.wizard.state.data.genre;
    const title = ctx.wizard.state.data.title;
    if (!isOkText(text)) {
      const changeReq = cleanText(text);
      if (!changeReq) {
        await ctx.reply("Responde OK o dime qué cambiar.");
        return;
      }
      await ctx.reply("Regenerando la letra con tus cambios...");
      const prompt = `Genera solo la letra de una canción de ${genre} llamada ${title}. Cambios solicitados: ${changeReq}. Sin introducción, solo versos y coro.`;
      const started = await apiPostJson("/api/telegram/generate", {
        telegram_user_id,
        prompt,
        customMode: false,
        model: "V5",
      });
      if (!started.ok) {
        await handleApiError(ctx, started);
        return ctx.scene.leave();
      }
      const taskId = String(started.data?.taskId || "").trim();
      const done = await pollTask(telegram_user_id, taskId);
      if (!done.ok) {
        await ctx.reply("No pude regenerar la letra. Intenta otra vez.");
        return ctx.scene.leave();
      }
      const lyrics = extractLyricsText(done.data);
      ctx.wizard.state.data.lyrics = lyrics || prompt;
      await ctx.reply(`Nueva letra:\n\n${ctx.wizard.state.data.lyrics}\n\n¿OK para continuar?`);
      return;
    }
    await ctx.reply("Haciendo tu cover. Esto tarda unos minutos.");
    const uploadUrl = ctx.wizard.state.data.uploadUrl;
    const lyrics = ctx.wizard.state.data.lyrics;
    const r = await apiPostJson("/api/telegram/upload-cover", {
      telegram_user_id,
      uploadUrl,
      style: genre,
      prompt: lyrics,
      title,
      model: "V5",
      styleWeight: 0.7,
      audioWeight: 0.3,
    });
    if (!r.ok) {
      await handleApiError(ctx, r);
      return ctx.scene.leave();
    }
    const taskId = String(r.data?.taskId || "").trim();
    if (!taskId) {
      await ctx.reply("No pude iniciar el cover.");
      return ctx.scene.leave();
    }
    const done = await pollTask(telegram_user_id, taskId);
    if (!done.ok) {
      await ctx.reply("No se pudo completar el cover. Intenta otra vez.");
      return ctx.scene.leave();
    }
    const urls = extractAudioUrls(done.data);
    if (urls.length === 0) {
      await ctx.reply("Terminó, pero no encontré los links de audio. Revisa en la web.");
      return ctx.scene.leave();
    }
    const msg =
      urls.length >= 2
        ? `Tu cover "${title}" está listo:\nVersión 1: ${urls[0]}\nVersión 2: ${urls[1]}`
        : `Tu cover "${title}" está listo:\nAudio: ${urls[0]}`;
    await ctx.reply(msg);
    return ctx.scene.leave();
  },
);

const stage = new Scenes.Stage([linkWizard, songWizard, coverWizard]);
const bot = new Telegraf(BOT_TOKEN);

bot.use(session());
bot.use(stage.middleware());

bot.start(async (ctx) => {
  await ctx.reply("Hola. Usa /vincular, /creditos, /cancion o /cover.");
});

bot.command("vincular", (ctx) => ctx.scene.enter("link"));

bot.command("creditos", async (ctx) => {
  const telegram_user_id = ctx.from?.id;
  const r = await apiPostJson("/api/telegram/credits", { telegram_user_id });
  if (!r.ok) return handleApiError(ctx, r);
  const credits = Number(r.data?.credits ?? 0);
  if (!Number.isFinite(credits)) return ctx.reply("No pude leer tus créditos.");
  return ctx.reply(`Créditos disponibles: ${credits}`);
});

bot.command("cancion", (ctx) => ctx.scene.enter("song"));
bot.command("cover", (ctx) => ctx.scene.enter("cover"));

bot.on("text", async (ctx, next) => {
  console.log('Mensaje recibido:', ctx.from.id, ctx.message.text);
  
  const raw = cleanText(ctx.message?.text || "");
  if (!raw) return next();
  if (raw.trim().startsWith("/")) return next();
  
  const currentScene =
    ctx.scene?.current?.id ||
    ctx.scene?.current ||
    ctx.scene?.session?.current ||
    ctx.session?.__scenes?.current ||
    "";
  if (currentScene) return next();

  const userId = String(ctx.from?.id || "");
  const userMessage = raw;
  
  // Detectar palabras clave para vinculación automática
  const lowerMessage = raw.toLowerCase();
  if (lowerMessage.includes("vincular") || lowerMessage.includes("conectar mi cuenta") || 
      lowerMessage.includes("enlazar") || lowerMessage.includes("link")) {
    // Iniciar el proceso de vinculación automáticamente
    await ctx.reply("¡Perfecto! Para vincular tu cuenta, necesito tu código de 6 dígitos. " +
                   "Ve a ramber-tunes.vercel.app → Perfil → genera tu código y envíamelo aquí.");
    return;
  }
  
  // Si hay audioUrl en la sesión, el usuario está respondiendo con el género para un cover
  if (ctx.session?.audioUrl) {
    const audioUrl = ctx.session.audioUrl;
    const genre = raw; // El texto del usuario es el género
    
    console.log('Audio URL encontrado en sesión, ejecutando cover automáticamente con género:', genre);
    
    // Limpiar el audioUrl de la sesión para no repetir
    delete ctx.session.audioUrl;
    
    // Ejecutar la tool make_cover automáticamente
    try {
      await ctx.reply(`🎵 ¡Perfecto! Voy a hacer un cover en estilo ${genre}. Esto puede tardar unos minutos...`);
      
      const r = await apiPostJson("/api/telegram/upload-cover", {
        telegram_user_id: userId,
        uploadUrl: audioUrl,
        style: genre,
        title: "Cover",
        model: "V5",
        styleWeight: 0.7,
        audioWeight: 0.3,
      });
      
      if (!r.ok) {
        await handleApiError(ctx, r);
        return;
      }
      
      const taskId = String(r.data?.taskId || "").trim();
      if (!taskId) {
        await ctx.reply("No pude iniciar el cover.");
        return;
      }
      
      const done = await pollTask(userId, taskId);
      if (!done.ok) {
        await ctx.reply("No se pudo completar el cover. Intenta otra vez.");
        return;
      }
      
      const urls = extractAudioUrls(done.data);
      if (urls.length === 0) {
        await ctx.reply("Terminó, pero no encontré los links de audio. Revisa en la web.");
        return;
      }
      
      const msg =
        urls.length >= 2
          ? `Tu cover en estilo ${genre} está listo:\nVersión 1: ${urls[0]}\nVersión 2: ${urls[1]}`
          : `Tu cover en estilo ${genre} está listo:\nAudio: ${urls[0]}`;
      await ctx.reply(msg);
      return;
      
    } catch (error) {
      console.error("Error ejecutando cover automáticamente:", error);
      await ctx.reply("Lo siento, hubo un error al hacer el cover. Por favor, intenta de nuevo.");
      return;
    }
  }
  
  try {
    // Obtener respuesta de OpenAI
    const openaiResponse = await chatWithOpenAI(userId, userMessage, ctx);
    
    // Enviar respuesta al usuario
    if (openaiResponse && openaiResponse.trim()) {
      await ctx.reply(openaiResponse);
    } else {
      await ctx.reply("No recibí una respuesta clara. ¿Podrías reformular tu pregunta?");
    }
    
  } catch (error) {
    console.error("Error en handler de texto:", error);
    await ctx.reply("Lo siento, hubo un error al procesar tu mensaje. Por favor, intenta de nuevo.");
  }
});

// Handler para recibir audios de voz (voice messages)
bot.on("voice", async (ctx) => {
  console.log('Audio de voz recibido:', ctx.from.id);
  
  try {
    const fileId = ctx.message.voice.file_id;
    const fileLink = await ctx.telegram.getFileLink(fileId);
    
    // Guardar URL del audio en la sesión
    ctx.session.audioUrl = fileLink.href;
    
    // Convertir audio a MP3 primero usando la nueva función
    const convertResult = await convertAudioToMp3(ctx.from.id, fileLink.href);
    
    if (convertResult.ok && convertResult.data.url) {
      ctx.session.audioUrl = convertResult.data.url;
      await ctx.reply("🎵 ¡Recibí tu audio de voz! Ahora dime: ¿qué género musical quieres para el cover? (ej: reggaeton, cumbia, pop, banda)");
    } else {
      await ctx.reply("🎵 ¡Recibí tu audio de voz! Hubo un problema al convertir el audio. Ahora dime: ¿qué género musical quieres para el cover?");
    }
    
  } catch (error) {
    console.error("Error procesando audio de voz:", error);
    await ctx.reply("Lo siento, hubo un error al procesar tu audio. Por favor, intenta enviarlo de nuevo.");
  }
});

// Handler para recibir audios (audio files)
bot.on("audio", async (ctx) => {
  console.log('Archivo de audio recibido:', ctx.from.id);
  
  try {
    const fileId = ctx.message.audio.file_id;
    const fileLink = await ctx.telegram.getFileLink(fileId);
    
    // Guardar URL del audio en la sesión
    ctx.session.audioUrl = fileLink.href;
    
    // Convertir audio a MP3 primero usando la nueva función
    const convertResult = await convertAudioToMp3(ctx.from.id, fileLink.href);
    
    if (convertResult.ok && convertResult.data.url) {
      ctx.session.audioUrl = convertResult.data.url;
      await ctx.reply("🎵 ¡Recibí tu archivo de audio! Ahora dime: ¿qué género musical quieres para el cover? (ej: reggaeton, cumbia, pop, banda)");
    } else {
      await ctx.reply("🎵 ¡Recibí tu archivo de audio! Hubo un problema al convertir el audio. Ahora dime: ¿qué género musical quieres para el cover?");
    }
    
  } catch (error) {
    console.error("Error procesando archivo de audio:", error);
    await ctx.reply("Lo siento, hubo un error al procesar tu audio. Por favor, intenta enviarlo de nuevo.");
  }
});

// Handler para recibir documentos (document files)
bot.on("document", async (ctx) => {
  console.log('Documento recibido:', ctx.from.id);
  
  // Verificar si es un archivo de audio por la extensión
  const fileName = ctx.message.document.file_name || "";
  const mimeType = ctx.message.document.mime_type || "";
  
  const isAudioFile = fileName.match(/\.(mp3|wav|m4a|ogg|flac)$/i) || 
                     mimeType.includes("audio");
  
  if (!isAudioFile) {
    await ctx.reply("Por favor, envía un archivo de audio (MP3, WAV, M4A, etc.) para hacer un cover.");
    return;
  }
  
  try {
    const fileId = ctx.message.document.file_id;
    const fileLink = await ctx.telegram.getFileLink(fileId);
    
    // Guardar URL del audio en la sesión
    ctx.session.audioUrl = fileLink.href;
    
    // Convertir audio a MP3 primero usando la nueva función
    const convertResult = await convertAudioToMp3(ctx.from.id, fileLink.href);
    
    if (convertResult.ok && convertResult.data.url) {
      ctx.session.audioUrl = convertResult.data.url;
      await ctx.reply("🎵 ¡Recibí tu archivo de audio! Ahora dime: ¿qué género musical quieres para el cover? (ej: reggaeton, cumbia, pop, banda)");
    } else {
      await ctx.reply("🎵 ¡Recibí tu archivo de audio! Hubo un problema al convertir el audio. Ahora dime: ¿qué género musical quieres para el cover?");
    }
    
  } catch (error) {
    console.error("Error procesando documento de audio:", error);
    await ctx.reply("Lo siento, hubo un error al procesar tu audio. Por favor, intenta enviarlo de nuevo.");
  }
});

bot.catch(async (err, ctx) => {
  try {
    const msg = err instanceof Error ? err.message : String(err);
    await ctx.reply(`Error: ${msg}`);
  } catch {
  }
});

bot.launch({ dropPendingUpdates: true });
console.log('Bot LucianaMusic iniciado correctamente');

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
