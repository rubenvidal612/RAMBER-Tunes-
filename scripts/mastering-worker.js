import express from "express";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ffmpeg from "fluent-ffmpeg";

const app = express();
app.use(express.json({ limit: "2mb" }));

const PORT = Number(process.env.PORT || 8787);
const FFMPEG_PATH = (process.env.FFMPEG_PATH || "ffmpeg").toString().trim();
const FFPROBE_PATH = (() => {
  const direct = (process.env.FFPROBE_PATH || "").toString().trim();
  if (direct) return direct;
  if (!FFMPEG_PATH || FFMPEG_PATH === "ffmpeg") return "ffprobe";
  if (FFMPEG_PATH.toLowerCase().endsWith("ffmpeg.exe")) return FFMPEG_PATH.replace(/ffmpeg\.exe$/i, "ffprobe.exe");
  if (FFMPEG_PATH.toLowerCase().endsWith("/ffmpeg")) return FFMPEG_PATH.replace(/\/ffmpeg$/i, "/ffprobe");
  if (FFMPEG_PATH.toLowerCase().endsWith("\\ffmpeg")) return FFMPEG_PATH.replace(/\\ffmpeg$/i, "\\ffprobe");
  return "ffprobe";
})();

if (typeof ffmpeg?.setFfmpegPath === "function" && FFMPEG_PATH) {
  ffmpeg.setFfmpegPath(FFMPEG_PATH);
}

function uniqueBase() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function ensureHttpsUrl(raw, fieldName) {
  const value = (raw || "").toString().trim();
  if (!value) throw new Error(`Falta ${fieldName}`);
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error(`${fieldName} debe usar HTTPS`);
  return url.toString();
}

async function downloadToFile(url, targetPath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`No pude descargar el audio original. HTTP ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  await fs.writeFile(targetPath, Buffer.from(arrayBuffer));
}

async function uploadFromFile(filePath, uploadUrl) {
  const buffer = await fs.readFile(filePath);
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "content-type": "audio/mpeg",
      "content-length": String(buffer.length),
    },
    body: buffer,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`No pude subir el resultado a R2. HTTP ${response.status} ${text}`.trim());
  }
}

async function execFileJson(command, args) {
  return await new Promise((resolve, reject) => {
    execFile(command, args, { maxBuffer: 1024 * 1024 * 5 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error((stderr || error.message || "No pude ejecutar el comando").toString().trim()));
        return;
      }
      resolve(String(stdout || "").trim());
    });
  });
}

async function runFfmpeg(inputPath, outputPath, ffmpegArgs) {
  const args = Array.isArray(ffmpegArgs) && ffmpegArgs.length > 0 ? ffmpegArgs : ["-af", "highpass=f=28:p=2,lowpass=f=18500:p=2,equalizer=f=110:t=q:w=1.0:g=1.0,equalizer=f=3000:t=q:w=1.1:g=1.2,equalizer=f=8500:t=q:w=1.0:g=-0.8,acompressor=threshold=0.125:ratio=2.2:attack=20:release=250:makeup=1.4:knee=2.5,loudnorm=I=-14:TP=-1.0:LRA=11,alimiter=limit=0.98:level=false", "-c:a", "libmp3lame", "-q:a", "2"];
  await new Promise((resolve, reject) => {
    try {
      ffmpeg(inputPath)
        .outputOptions(args)
        .format("mp3")
        .on("end", resolve)
        .on("error", (err) => reject(err instanceof Error ? err : new Error(String(err))))
        .save(outputPath);
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

async function measureLoudnessJson(filePath) {
  const args = [
    "-hide_banner",
    "-nostats",
    "-i",
    filePath,
    "-af",
    "loudnorm=I=-14:TP=-1.0:LRA=11:print_format=json",
    "-f",
    "null",
    "-",
  ];
  return await new Promise((resolve) => {
    execFile(FFMPEG_PATH, args, { maxBuffer: 1024 * 1024 * 10 }, (_error, _stdout, stderr) => {
      const text = String(stderr || "");
      const match = text.match(/\{[\s\S]*\}/m);
      if (!match) return resolve(null);
      try {
        const parsed = JSON.parse(match[0]);
        const i = Number(parsed?.output_i ?? parsed?.input_i);
        const tp = Number(parsed?.output_tp ?? parsed?.input_tp);
        resolve({
          integratedLufs: Number.isFinite(i) ? i : null,
          truePeakDb: Number.isFinite(tp) ? tp : null,
        });
      } catch {
        resolve(null);
      }
    });
  });
}

async function probeDurationSeconds(filePath) {
  const raw = await execFileJson(FFPROBE_PATH, [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error("No pude calcular la duración del audio con ffprobe");
  }
  return seconds;
}

async function runPreviewWatermark(originalPath, watermarkPath, outputPath, introDelayMs = 2000) {
  const songDurationSeconds = await probeDurationSeconds(originalPath);
  const watermarkDurationSeconds = await probeDurationSeconds(watermarkPath);
  const safeIntroDelayMs = Math.max(0, Math.floor(Number(introDelayMs) || 0));
  const safeMidSeconds = Math.max(
    2,
    Math.min(songDurationSeconds / 2, Math.max(2, songDurationSeconds - watermarkDurationSeconds - 2))
  );
  const midDelayMs = Math.max(2000, Math.floor(safeMidSeconds * 1000));
  const filter = [
    `[1:a]volume=1.5,adelay=${safeIntroDelayMs}|${safeIntroDelayMs},apad[wm1]`,
    `[1:a]volume=1.5,adelay=${midDelayMs}|${midDelayMs},apad[wm2]`,
    `[wm1][wm2]amix=inputs=2:duration=longest:normalize=0[wm]`,
    `[0:a][wm]sidechaincompress=threshold=0.03:ratio=10:attack=15:release=250:makeup=1[ducked]`,
    `[ducked][wm]amix=inputs=2:duration=first:normalize=0[out]`,
  ].join(";");

  await new Promise((resolve, reject) => {
    execFile(
      FFMPEG_PATH,
      [
        "-y",
        "-i",
        originalPath,
        "-i",
        watermarkPath,
        "-filter_complex",
        filter,
        "-map",
        "[out]",
        "-c:a",
        "libmp3lame",
        "-b:a",
        "192k",
        outputPath,
      ],
      { maxBuffer: 1024 * 1024 * 10 },
      (error, _stdout, stderr) => {
        if (error) {
          reject(new Error((stderr || error.message || "No pude ejecutar FFmpeg para el preview").toString().trim()));
          return;
        }
        resolve();
      }
    );
  });
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "mastering-worker" });
});

app.post("/masterize", async (req, res) => {
  const base = uniqueBase();
  const inputPath = path.join(os.tmpdir(), `master_in_${base}.mp3`);
  const outputPath = path.join(os.tmpdir(), `master_out_${base}.mp3`);

  try {
    const inputUrl = ensureHttpsUrl(req.body?.inputUrl, "inputUrl");
    const outputUploadUrl = ensureHttpsUrl(req.body?.outputUploadUrl, "outputUploadUrl");
    const ffmpegArgs = Array.isArray(req.body?.ffmpegArgs) ? req.body.ffmpegArgs.map((x) => String(x)) : undefined;

    await downloadToFile(inputUrl, inputPath);
    const inputDurationSec = await probeDurationSeconds(inputPath).catch(() => null);
    const inputLoudness = await measureLoudnessJson(inputPath).catch(() => null);
    await runFfmpeg(inputPath, outputPath, ffmpegArgs);
    const outputDurationSec = await probeDurationSeconds(outputPath).catch(() => null);
    const outputLoudness = await measureLoudnessJson(outputPath).catch(() => null);
    await uploadFromFile(outputPath, outputUploadUrl);

    const inStat = await fs.stat(inputPath).catch(() => null);
    const outStat = await fs.stat(outputPath).catch(() => null);
    res.json({
      ok: true,
      analysis: {
        pipeline: {
          filter: "highpass=f=28:p=2,lowpass=f=18500:p=2,equalizer=f=110:t=q:w=1.0:g=1.0,equalizer=f=3000:t=q:w=1.1:g=1.2,equalizer=f=8500:t=q:w=1.0:g=-0.8,acompressor=threshold=0.125:ratio=2.2:attack=20:release=250:makeup=1.4:knee=2.5,loudnorm=I=-14:TP=-1.0:LRA=11,alimiter=limit=0.98:level=false",
          target: { lufs: -14, truePeakDb: -1 },
        },
        input: {
          bytes: inStat?.size ?? null,
          durationSec: inputDurationSec,
          loudness: inputLoudness,
        },
        output: {
          bytes: outStat?.size ?? null,
          durationSec: outputDurationSec,
          loudness: outputLoudness,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: "No pude masterizar en el VPS",
      detail: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
  }
});

app.post("/preview-watermark", async (req, res) => {
  const base = uniqueBase();
  const originalPath = path.join(os.tmpdir(), `preview_original_${base}.mp3`);
  const watermarkPath = path.join(os.tmpdir(), `preview_watermark_${base}.mp3`);
  const outputPath = path.join(os.tmpdir(), `preview_output_${base}.mp3`);

  try {
    const originalInputUrl = ensureHttpsUrl(req.body?.originalInputUrl, "originalInputUrl");
    const watermarkInputUrl = ensureHttpsUrl(req.body?.watermarkInputUrl, "watermarkInputUrl");
    const outputUploadUrl = ensureHttpsUrl(req.body?.outputUploadUrl, "outputUploadUrl");
    const introDelayMs = Number(req.body?.introDelayMs);

    await downloadToFile(originalInputUrl, originalPath);
    await downloadToFile(watermarkInputUrl, watermarkPath);
    await runPreviewWatermark(originalPath, watermarkPath, outputPath, introDelayMs);
    await uploadFromFile(outputPath, outputUploadUrl);

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: "No pude generar el preview con watermark en el VPS",
      detail: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await fs.unlink(originalPath).catch(() => {});
    await fs.unlink(watermarkPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
  }
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`Mastering worker escuchando en http://127.0.0.1:${PORT}`);
});
