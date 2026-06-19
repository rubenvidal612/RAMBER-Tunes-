import express from "express";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ffmpeg from "fluent-ffmpeg";

const app = express();
app.use(express.json({ limit: "2mb" }));

const PORT = Number(process.env.PORT || 8787);
const FFMPEG_PATH = (process.env.FFMPEG_PATH || "ffmpeg").toString().trim();

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

async function runFfmpeg(inputPath, outputPath, ffmpegArgs) {
  const args = Array.isArray(ffmpegArgs) && ffmpegArgs.length > 0 ? ffmpegArgs : ["-af", "loudnorm=I=-14:TP=-1.0:LRA=11"];
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
    await runFfmpeg(inputPath, outputPath, ffmpegArgs);
    await uploadFromFile(outputPath, outputUploadUrl);

    res.json({ ok: true });
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

app.listen(PORT, "127.0.0.1", () => {
  console.log(`Mastering worker escuchando en http://127.0.0.1:${PORT}`);
});
