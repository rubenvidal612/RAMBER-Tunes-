import { createClient } from "@supabase/supabase-js";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

function send(res: any, status: number, body: any) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function safeExtFromName(name: string) {
  const raw = (name || "").toString().trim().toLowerCase();
  const ext = raw.includes(".") ? raw.split(".").pop() || "" : "";
  const cleaned = ext.replace(/[^a-z0-9]/g, "").slice(0, 8);
  return cleaned || "bin";
}

function uniqueId() {
  try {
    return crypto.randomBytes(12).toString("hex");
  } catch {
    return `${Date.now()}_${Math.random().toString(16).slice(2)}`.replace(/[^a-z0-9_]/gi, "");
  }
}

async function convertToMp3(inputPath: string, outputPath: string) {
  const mod = await import("fluent-ffmpeg");
  const ffmpeg = (mod as any)?.default || mod;
  const inst = await import("@ffmpeg-installer/ffmpeg");
  const ffmpegPath = (inst as any)?.path || (inst as any)?.default?.path;
  if (!ffmpegPath) throw new Error("No pude encontrar ffmpeg (falta @ffmpeg-installer/ffmpeg).");
  if (typeof (ffmpeg as any)?.setFfmpegPath === "function") (ffmpeg as any).setFfmpegPath(ffmpegPath);

  await new Promise<void>((resolve, reject) => {
    const cmd = (ffmpeg as any)(inputPath)
      .audioCodec("libmp3lame")
      .audioBitrate("192k")
      .format("mp3")
      .on("end", () => resolve())
      .on("error", (err: any) => reject(err))
      .save(outputPath);
    void cmd;
  });
}

export default async function handler(req: any, res: any) {
  if ((req.method || "").toUpperCase() !== "POST") return send(res, 405, { error: "Método no permitido" });

  const secret = (process.env.TELEGRAM_BOT_SECRET || "").toString().trim();
  if (!secret) return send(res, 500, { error: "TELEGRAM_BOT_SECRET no configurado" });
  const got = String(req?.headers?.["x-telegram-secret"] || "").trim();
  if (!got || got !== secret) return send(res, 401, { error: "No autorizado" });

  const supabaseUrl = (process.env.SUPABASE_URL || "").toString().trim();
  const supabaseService = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").toString().trim();
  if (!supabaseUrl || !supabaseService) return send(res, 500, { error: "Faltan variables de Supabase (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" });

  const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });

  const tmpDir = os.tmpdir();
  const inId = uniqueId();
  const outId = uniqueId();
  let inputFilePath = "";
  let outputFilePath = path.join(tmpDir, `tg_${outId}.mp3`);

  try {
    const busboyMod = await import("busboy");
    const BusboyCtor = (busboyMod as any)?.default || busboyMod;
    const bb = BusboyCtor({ headers: req.headers, limits: { files: 1, fileSize: 30 * 1024 * 1024 } });
    let didGetFile = false;
    let fileWriteDone: Promise<void> | null = null;
    let fileWriteErr: any = null;
    let originalName = "";

    bb.on("file", (fieldname: string, file: any, info: any) => {
      if (fieldname !== "file") {
        file.resume();
        return;
      }
      if (didGetFile) {
        file.resume();
        return;
      }
      didGetFile = true;
      originalName = String(info?.filename || "").trim();
      const ext = safeExtFromName(originalName);
      inputFilePath = path.join(tmpDir, `tg_${inId}.${ext}`);
      const out = fs.createWriteStream(inputFilePath);
      file.pipe(out);
      fileWriteDone = new Promise<void>((resolve, reject) => {
        out.on("finish", () => resolve());
        out.on("error", (e) => {
          fileWriteErr = e;
          reject(e);
        });
        file.on("error", (e: any) => {
          fileWriteErr = e;
          reject(e);
        });
      });
    });

    const finished = new Promise<void>((resolve, reject) => {
      bb.on("finish", () => resolve());
      bb.on("error", (e: any) => reject(e));
    });

    req.pipe(bb);
    await finished;
    if (!didGetFile || !inputFilePath || !fileWriteDone) return send(res, 400, { error: "Falta archivo 'file' (multipart/form-data)" });
    await fileWriteDone;
    if (fileWriteErr) return send(res, 400, { error: "Error leyendo archivo", detail: fileWriteErr instanceof Error ? fileWriteErr.message : String(fileWriteErr) });

    try {
      const st = fs.statSync(inputFilePath);
      if (!st.size) return send(res, 400, { error: "Archivo vacío" });
    } catch {
      return send(res, 400, { error: "Archivo inválido" });
    }

    await convertToMp3(inputFilePath, outputFilePath);

    const mp3Buf = fs.readFileSync(outputFilePath);
    if (!mp3Buf || mp3Buf.length === 0) return send(res, 500, { error: "La conversión produjo un archivo vacío" });

    const fileKey = `uploads/${new Date().toISOString().slice(0, 10)}/${uniqueId()}.mp3`;
    const bucket = "telegram-audio";
    const up = await admin.storage.from(bucket).upload(fileKey, mp3Buf, { contentType: "audio/mpeg", upsert: false });
    if (up.error) return send(res, 500, { error: "No pude subir a Storage", detail: up.error.message });

    const pub = admin.storage.from(bucket).getPublicUrl(fileKey);
    const url = String(pub?.data?.publicUrl || "").trim();
    if (!url) return send(res, 500, { error: "No pude obtener URL pública" });

    return send(res, 200, { url });
  } catch (e) {
    return send(res, 500, { error: "Error convirtiendo audio", detail: e instanceof Error ? e.message : String(e) });
  } finally {
    try {
      if (inputFilePath) fs.unlinkSync(inputFilePath);
    } catch {}
    try {
      if (outputFilePath) fs.unlinkSync(outputFilePath);
    } catch {}
  }
}
