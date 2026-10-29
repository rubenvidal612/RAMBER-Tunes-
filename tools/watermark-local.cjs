/**
 * Genera las marcas de agua de "Mis canciones" EN TU COMPUTADORA.
 *
 * Por que local: mezclar una cancion de 5 minutos dentro de una funcion de
 * Vercel revienta la memoria/tiempo (FUNCTION_INVOCATION_FAILED). Aqui no hay
 * limites.
 *
 * Que hace:
 *   1. Lee las canciones de la tabla public_songs
 *   2. Descarga el audio original
 *   3. Lo mezcla con tu voz cada 30 segundos (ffmpeg local)
 *   4. Sube el resultado a R2 en la llave que la app ya busca:
 *        share-watermark/song-<id>.mp3
 *   Con eso, el link de escucha sirve el archivo ya hecho (rapido) y la
 *   descarga sigue saliendo limpia.
 *
 * Uso:
 *   node tools/watermark-local.cjs --limit=1        (probar con una)
 *   node tools/watermark-local.cjs                  (todas las que falten)
 *   node tools/watermark-local.cjs --force          (regenerar aunque existan)
 *   node tools/watermark-local.cjs --only=10520     (una cancion en especifico)
 */

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");

// ---------------------------------------------------------------- argumentos
const argv = process.argv.slice(2);
const flag = (name, def = "") => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : def;
};
const has = (name) => argv.includes(`--${name}`) || argv.some((a) => a.startsWith(`--${name}=`));

const LIMIT = Number(flag("limit", "0")) || 0;
const ONLY = flag("only", "").trim();
const FORCE = has("force");
// --seconds=N : procesar solo los primeros N segundos (prueba rapida, poco calor)
const SECONDS = Number(flag("seconds", "0")) || 0;

// ---------------------------------------------------------------- .env
function loadEnv() {
  const file = path.join(process.cwd(), ".env");
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

const ENV = { ...loadEnv(), ...process.env };
const need = (k) => {
  const v = String(ENV[k] || "").trim();
  if (!v) throw new Error(`Falta ${k} en .env`);
  return v;
};

const SUPABASE_URL = need("SUPABASE_URL").replace(/\/+$/, "");
const SUPABASE_KEY = need("SUPABASE_SERVICE_ROLE_KEY");
const R2_BUCKET = need("R2_BUCKET_NAME");
const R2_ACCESS = need("R2_ACCESS_KEY_ID");
const R2_SECRET = need("R2_SECRET_ACCESS_KEY");
const R2_ENDPOINT = (() => {
  let v = String(ENV.R2_ENDPOINT || "").trim();
  // el .env puede traer la plantilla sin expandir: https://${R2_ACCOUNT_ID}.r2...
  v = v.replace(/\$\{?R2_ACCOUNT_ID\}?/g, String(ENV.R2_ACCOUNT_ID || "").trim());
  if (!v || v.includes("${")) {
    v = `https://${need("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`;
  }
  return v.replace(/\/+$/, "");
})();

// ---------------------------------------------------------------- helpers
const BUCKET_PREFIX = String(ENV.R2_BUCKET_PREFIX || "").trim().replace(/^\/+|\/+$/g, "");
const fullKey = (key) => (BUCKET_PREFIX ? `${BUCKET_PREFIX}/${key}` : key);

/** Misma regla que la app: share-watermark/song-<id>.mp3 */
function watermarkKeyForSong(songId) {
  const safe = String(songId || "").replace(/[^0-9A-Za-z_-]/g, "").slice(0, 64);
  return safe ? `share-watermark/song-${safe}.mp3` : "";
}

async function sb(pathAndQuery) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

let s3 = null;
async function s3client() {
  if (s3) return s3;
  const { S3Client } = await import("@aws-sdk/client-s3");
  s3 = new S3Client({
    region: "auto",
    endpoint: R2_ENDPOINT,
    credentials: { accessKeyId: R2_ACCESS, secretAccessKey: R2_SECRET },
    forcePathStyle: true,
  });
  return s3;
}

async function objectExists(key) {
  const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
  try {
    const c = await s3client();
    await c.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: fullKey(key) }));
    return true;
  } catch {
    return false;
  }
}

async function uploadFile(key, filePath) {
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const c = await s3client();
  await c.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: fullKey(key),
      Body: fs.createReadStream(filePath),
      ContentType: "audio/mpeg",
      CacheControl: "public, max-age=604800",
    }),
  );
}

function ffmpegPath() {
  const inst = require("@ffmpeg-installer/ffmpeg");
  return String(inst.path);
}

/** Comando probado: voz cada 30 s (0, 30, 60...). */
function mixArgs(inPath, wmPath, outPath) {
  return [
    "-y",
    "-i", inPath,
    "-i", wmPath,
    "-f", "lavfi", "-t", "26.52", "-i", "anullsrc=r=44100:cl=mono",
    "-filter_complex",
    "[1:a]aresample=44100,volume=4.5[v];" +
      "[v][2:a]concat=n=2:v=0:a=1[bed];" +
      "[bed]aloop=loop=-1:size=1323000[w];" +
      "[0:a][w]amix=inputs=2:duration=first:dropout_transition=0,volume=2,alimiter=limit=0.95[a]",
    "-map", "[a]",
    // ---- limites de carga: la PC se apagaba con ffmpeg a full ----
    "-threads", "1",
    "-filter_threads", "1",
    "-b:a", "128k",
    ...(SECONDS > 0 ? ["-t", String(SECONDS)] : []),
    outPath,
  ];
}

function runFfmpeg(args, timeoutMs = 15 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath(), args, { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    // prioridad minima: que la PC no se caliente ni se apague
    try {
      if (p.pid) os.setPriority(p.pid, os.constants.priority.PRIORITY_IDLE);
    } catch {}
    let err = "";
    p.stderr.on("data", (d) => {
      err += String(d);
      if (err.length > 20000) err = err.slice(-20000);
    });
    const timer = setTimeout(() => {
      try { p.kill("SIGKILL"); } catch {}
      reject(new Error("ffmpeg_tiempo_agotado"));
    }, timeoutMs);
    p.on("error", (e) => { clearTimeout(timer); reject(e); });
    p.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve();
      // quedarse solo con las lineas que explican el fallo
      const lineas = err
        .split(/\r?\n/)
        .filter((l) => /error|invalid|no such|unable|failed|could not|does not|matches no/i.test(l))
        .slice(-6)
        .join(" | ");
      reject(new Error(`ffmpeg(${code}): ${lineas || err.slice(-300)}`));
    });
  });
}

async function fetchBuffer(url, timeoutMs = 120000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`descarga HTTP ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  } finally {
    clearTimeout(t);
  }
}

/** Trae el WAV de la marca de agua desde Supabase Storage. */
async function downloadWatermark(tmpDir) {
  const outP = path.join(tmpDir, "wm.wav");
  const candidates = [
    `${SUPABASE_URL}/storage/v1/object/${String(ENV.SUPABASE_AUDIO_BUCKET || "ramber-tunes")}/form/watermark.wav`,
  ];
  let lastErr = null;
  for (const url of candidates) {
    try {
      const buf = await fetchBufferWithAuth(url);
      if (buf.length > 512) {
        await fsp.writeFile(outP, buf);
        return outP;
      }
    } catch (e) {
      lastErr = e;
    }
  }
  // Ultimo recurso: archivo local
  const local = path.join(process.cwd(), "form", "watermark.wav");
  if (fs.existsSync(local)) return local;
  throw new Error(`No pude bajar el watermark: ${lastErr ? lastErr.message : "desconocido"}`);
}

async function fetchBufferWithAuth(url, timeoutMs = 60000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  } finally {
    clearTimeout(t);
  }
}

// ---------------------------------------------------------------- main
async function main() {
  console.log("=".repeat(64));
  console.log(" MARCA DE AGUA LOCAL  ·  Luciana Music");
  console.log("=".repeat(64));
  console.log(` R2 bucket : ${R2_BUCKET}`);
  console.log(` R2 endpo  : ${R2_ENDPOINT}`);
  if (BUCKET_PREFIX) console.log(` Prefijo   : ${BUCKET_PREFIX}`);
  console.log(` Modo      : ${FORCE ? "regenerar todo" : "solo las que falten"}`);
  if (ONLY) console.log(` Solo      : ${ONLY}`);
  if (LIMIT) console.log(` Limite    : ${LIMIT}`);
  console.log("=".repeat(64));

  // --check: solo valida credenciales, no procesa audio
  if (has("check")) {
    console.log("\nModo revision: solo valido las credenciales...\n");
    try {
      const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
      const c = await s3client();
      const r = await c.send(new ListObjectsV2Command({ Bucket: R2_BUCKET, MaxKeys: 3 }));
      console.log("  Credenciales : OK");
      console.log(`  Bucket       : ${R2_BUCKET} accesible`);
      console.log(`  Muestra      : ${(r.Contents || []).length} objeto(s)`);
      for (const o of r.Contents || []) {
        console.log(`    - ${o.Key}  (${Math.round(Number(o.Size || 0) / 1024)} KB)`);
      }
      const ya = await objectExists(watermarkKeyForSong("10363"));
      console.log(`  Marca cancion 10363: ${ya ? "YA EXISTE" : "falta generarla"}`);
      console.log("\n  Todo bien. Corre sin --check para generar.\n");
    } catch (e) {
      console.error("\n  FALLO:", String(e && e.message ? e.message : e).slice(0, 300));
      console.error("  Revisa las claves del .env\n");
      process.exit(1);
    }
    return;
  }

  // 1. canciones
  const query = ONLY
    ? `public_songs?select=song_id,title,audio_url&song_id=eq.${encodeURIComponent(ONLY)}`
    : `public_songs?select=song_id,title,audio_url&order=song_id.desc`;
  let songs = await sb(query);
  songs = (Array.isArray(songs) ? songs : []).filter((s) => s && s.song_id && s.audio_url);
  if (LIMIT > 0) songs = songs.slice(0, LIMIT);

  console.log(`\nCanciones con audio: ${songs.length}\n`);
  if (!songs.length) {
    console.log("Nada que procesar.");
    return;
  }

  const tmpBase = path.join(process.cwd(), ".wm-tmp");
  await fsp.mkdir(tmpBase, { recursive: true }).catch(() => {});
  const tmpDir = await fsp.mkdtemp(path.join(tmpBase, "run-"));
  console.log("Bajando tu marca de agua...");
  const wmPath = await downloadWatermark(tmpDir);
  const wmStat = await fsp.stat(wmPath);
  console.log(`  OK  ${wmPath}  (${Math.round(wmStat.size / 1024)} KB)\n`);

  let hechas = 0;
  let saltadas = 0;
  let fallidas = 0;
  const errores = [];

  for (let i = 0; i < songs.length; i++) {
    const s = songs[i];
    const id = String(s.song_id);
    const titulo = String(s.title || "(sin titulo)").slice(0, 40);
    const key = watermarkKeyForSong(id);
    const pref = `[${i + 1}/${songs.length}] ${id} · ${titulo}`;

    if (!key) {
      console.log(`${pref}  -> id invalido, saltada`);
      saltadas++;
      continue;
    }

    if (!FORCE && (await objectExists(key))) {
      console.log(`${pref}  -> ya existe, saltada`);
      saltadas++;
      continue;
    }

    const inP = path.join(tmpDir, "in.mp3");
    const outP = path.join(tmpDir, "out.mp3");
    const t0 = Date.now();
    try {
      console.log(`${pref}  -> descargando...`);
      const buf = await fetchBuffer(String(s.audio_url));
      await fsp.writeFile(inP, buf);

      console.log(`${pref}  -> mezclando (${Math.round(buf.length / 1024)} KB)...`);
      await runFfmpeg(mixArgs(inP, wmPath, outP));

      const outStat = await fsp.stat(outP);
      if (outStat.size < 2048) throw new Error("salida vacia");

      console.log(`${pref}  -> subiendo a R2...`);
      await uploadFile(key, outP);

      const seg = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`${pref}  -> LISTO  (${seg}s, ${Math.round(outStat.size / 1024)} KB)\n`);
      hechas++;
    } catch (e) {
      fallidas++;
      const msg = String(e && e.message ? e.message : e).slice(0, 300);
      errores.push(`${id}: ${msg}`);
      console.log(`${pref}  -> FALLO  ${msg}\n`);
    } finally {
      await fsp.rm(inP, { force: true }).catch(() => {});
      await fsp.rm(outP, { force: true }).catch(() => {});
    }
  }

  await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});

  console.log("=".repeat(64));
  console.log(` Generadas : ${hechas}`);
  console.log(` Saltadas  : ${saltadas}`);
  console.log(` Fallidas  : ${fallidas}`);
  if (errores.length) {
    console.log("\n Errores:");
    for (const e of errores.slice(0, 10)) console.log("   - " + e);
  }
  console.log("=".repeat(64));
  if (hechas > 0) {
    console.log("\n Ya puedes abrir el link de escucha: sonara tu voz cada 30 s.");
    console.log(" La descarga seguira saliendo limpia.\n");
  }
}

main().catch((e) => {
  console.error("\nERROR:", e && e.message ? e.message : e);
  process.exit(1);
});
