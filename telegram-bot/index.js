import "dotenv/config";
import { Telegraf, session } from "telegraf";
import { Scenes } from "telegraf";

function mustEnv(name) {
  const v = String(process.env[name] || "").trim();
  if (!v) throw new Error(`Falta variable de entorno: ${name}`);
  return v;
}

const BOT_TOKEN = mustEnv("TELEGRAM_BOT_TOKEN");
const TELEGRAM_BOT_SECRET = mustEnv("TELEGRAM_BOT_SECRET");
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

  const n = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  const hasAny = (arr) => arr.some((k) => n.includes(k));
  const isCredits = hasAny(["creditos", "credito", "saldo", "cuanto tengo", "cuantos tengo"]);
  const isCover = hasAny(["cover", "cubre", "version"]);
  const isSong = hasAny(["cancion", "musica", "quiero", "hacer", "crea", "crear", "genera", "generar"]);
  const isHello = hasAny(["hola", "buenas", "hey", "hi"]);

  if (isCredits) {
    const telegram_user_id = ctx.from?.id;
    const r = await apiPostJson("/api/telegram/credits", { telegram_user_id });
    if (!r.ok) return handleApiError(ctx, r);
    const credits = Number(r.data?.credits ?? 0);
    if (!Number.isFinite(credits)) return ctx.reply("No pude leer tus créditos.");
    return ctx.reply(`Créditos disponibles: ${credits}`);
  }

  if (isCover) return ctx.scene.enter("cover");
  if (isSong) return ctx.scene.enter("song");

  if (isHello) {
    return ctx.reply("Hola. Puedes pedirme: una canción, un cover, o ver tus créditos. Usa /cancion, /cover o /creditos.");
  }

  return ctx.reply("No entendí. Puedes pedirme: una canción, un cover, o ver tus créditos");
});

bot.catch(async (err, ctx) => {
  try {
    const msg = err instanceof Error ? err.message : String(err);
    await ctx.reply(`Error: ${msg}`);
  } catch {
  }
});

bot.launch({ dropPendingUpdates: true });

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
