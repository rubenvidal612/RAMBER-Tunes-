import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

function execFileAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { maxBuffer: 1024 * 1024 * 20, ...options }, (error, stdout, stderr) => {
      if (error) {
        const wrapped = new Error(String(stderr || error.message || 'FFmpeg falló').trim());
        wrapped.cause = error;
        reject(wrapped);
        return;
      }
      resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

function extractJsonBlock(text) {
  const matches = String(text || '').match(/\{[\s\S]*?\}/g);
  if (!matches || matches.length === 0) return null;
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const block = matches[i];
    if (block.includes('"input_i"') || block.includes('"output_i"')) return block;
  }
  return matches[matches.length - 1];
}

async function getPipelineFromApiRoute() {
  const here = fileURLToPath(new URL('.', import.meta.url));
  const repoRoot = path.resolve(here, '..');
  const apiRoutePath = path.join(repoRoot, 'api', '[...route].ts');
  const raw = await fs.readFile(apiRoutePath, 'utf8');
  const idx = raw.indexOf('function getMasteringPipeline()');
  if (idx < 0) throw new Error('No pude encontrar getMasteringPipeline() en api/[...route].ts');
  const slice = raw.slice(idx, idx + 4000);
  const arrayStart = slice.indexOf('const filter = [');
  if (arrayStart < 0) throw new Error('No pude encontrar const filter = [ en getMasteringPipeline()');
  const after = slice.slice(arrayStart);
  const arrayEnd = after.indexOf('].join');
  if (arrayEnd < 0) throw new Error('No pude encontrar el cierre de filter array en getMasteringPipeline()');
  const block = after.slice(0, arrayEnd);
  const parts = [];
  const re = /"([^"]+)"/g;
  for (;;) {
    const m = re.exec(block);
    if (!m) break;
    parts.push(m[1]);
  }
  if (parts.length === 0) throw new Error('No pude extraer filtros desde getMasteringPipeline()');
  return {
    filter: parts.join(','),
    args: ['-af', parts.join(','), '-c:a', 'libmp3lame', '-q:a', '2'],
  };
}

async function probeBasicMeta(ffmpegPath, filePath) {
  const { stderr } = await execFileAsync(ffmpegPath, ['-hide_banner', '-i', filePath]);
  const durationMatch = stderr.match(/Duration:\s*([0-9]{2}):([0-9]{2}):([0-9]{2}\.?[0-9]*)/);
  const bitrateMatch = stderr.match(/bitrate:\s*([0-9]+)\s*kb\/s/i);
  let durationSec = null;
  if (durationMatch) {
    const hh = Number(durationMatch[1]);
    const mm = Number(durationMatch[2]);
    const ss = Number(durationMatch[3]);
    if (Number.isFinite(hh) && Number.isFinite(mm) && Number.isFinite(ss)) {
      durationSec = hh * 3600 + mm * 60 + ss;
    }
  }
  const bitrateKbps = bitrateMatch ? Number(bitrateMatch[1]) : null;
  return {
    durationSec: Number.isFinite(durationSec) ? durationSec : null,
    bitrateKbps: Number.isFinite(bitrateKbps) ? bitrateKbps : null,
  };
}

async function measureLoudnormStats(ffmpegPath, filePath) {
  const args = [
    '-hide_banner',
    '-nostats',
    '-i',
    filePath,
    '-af',
    'loudnorm=I=-14:TP=-1.0:LRA=11:print_format=json',
    '-f',
    'null',
    '-',
  ];
  const { stderr } = await execFileAsync(ffmpegPath, args);
  const block = extractJsonBlock(stderr);
  if (!block) return null;
  try {
    const parsed = JSON.parse(block);
    const n = (v) => {
      const x = Number(v);
      return Number.isFinite(x) ? x : null;
    };
    return {
      input_i: n(parsed?.input_i),
      input_tp: n(parsed?.input_tp),
      output_i: n(parsed?.output_i),
      output_tp: n(parsed?.output_tp),
      target_offset: n(parsed?.target_offset),
    };
  } catch {
    return null;
  }
}

function toMb(bytes) {
  const b = Number(bytes);
  if (!Number.isFinite(b)) return null;
  return b / (1024 * 1024);
}

async function main() {
  const inputPathRaw = process.argv[2];
  const inputPath = String(inputPathRaw || '').trim();
  if (!inputPath) {
    throw new Error('Uso: node scripts/test-mastering-local.js "C:\\\\ruta\\\\cancion.mp3"');
  }

  const inputAbs = path.resolve(process.cwd(), inputPath);
  const inStat = await fs.stat(inputAbs).catch(() => null);
  if (!inStat || !inStat.isFile()) throw new Error(`No existe el archivo: ${inputAbs}`);

  const parsed = path.parse(inputAbs);
  const outAbs = path.join(parsed.dir, `${parsed.name}.masterizado.mp3`);

  const ffmpegPath = String(ffmpegInstaller?.path || '').trim() || 'ffmpeg';
  const pipeline = await getPipelineFromApiRoute();

  const inputMeta = await probeBasicMeta(ffmpegPath, inputAbs).catch(() => ({ durationSec: null, bitrateKbps: null }));
  const inputLoud = await measureLoudnormStats(ffmpegPath, inputAbs).catch(() => null);

  await execFileAsync(ffmpegPath, ['-y', '-i', inputAbs, ...pipeline.args, outAbs]);

  const outStat = await fs.stat(outAbs).catch(() => null);
  if (!outStat || !outStat.isFile()) throw new Error('FFmpeg terminó sin producir el archivo masterizado.');

  const outputMeta = await probeBasicMeta(ffmpegPath, outAbs).catch(() => ({ durationSec: null, bitrateKbps: null }));
  const outputLoud = await measureLoudnormStats(ffmpegPath, outAbs).catch(() => null);

  const fmtLufs = (v) => (v === null || v === undefined ? '—' : `${Number(v).toFixed(2)} LUFS`);
  const fmtTp = (v) => (v === null || v === undefined ? '—' : `${Number(v).toFixed(2)} dBTP`);
  const fmtSec = (v) => (v === null || v === undefined ? '—' : `${Number(v).toFixed(2)} s`);
  const fmtKbps = (v) => (v === null || v === undefined ? '—' : `${Math.round(Number(v))} kbps`);
  const fmtMb = (v) => (v === null || v === undefined ? '—' : `${Number(v).toFixed(2)} MB`);

  process.stdout.write('\n');
  process.stdout.write('Masterización local (sin APIs, sin créditos)\n');
  process.stdout.write('------------------------------------------\n');
  process.stdout.write(`Archivo original:   ${inputAbs}\n`);
  process.stdout.write(`Archivo masterizado: ${outAbs}\n`);
  process.stdout.write('\n');
  process.stdout.write('Medición (loudnorm JSON)\n');
  process.stdout.write('------------------------------------------\n');
  process.stdout.write(`Original  LUFS: ${fmtLufs(inputLoud?.input_i)} | True Peak: ${fmtTp(inputLoud?.input_tp)}\n`);
  process.stdout.write(`Final     LUFS: ${fmtLufs(outputLoud?.input_i)} | True Peak: ${fmtTp(outputLoud?.input_tp)}\n`);
  process.stdout.write('\n');
  process.stdout.write('Info básica\n');
  process.stdout.write('------------------------------------------\n');
  process.stdout.write(`Original  duración: ${fmtSec(inputMeta.durationSec)} | tamaño: ${fmtMb(toMb(inStat.size))} | bitrate: ${fmtKbps(inputMeta.bitrateKbps)}\n`);
  process.stdout.write(`Final     duración: ${fmtSec(outputMeta.durationSec)} | tamaño: ${fmtMb(toMb(outStat.size))} | bitrate: ${fmtKbps(outputMeta.bitrateKbps)}\n`);
  process.stdout.write('\n');
  process.stdout.write('Pipeline usado (extraído de api/[...route].ts)\n');
  process.stdout.write('------------------------------------------\n');
  process.stdout.write(`${pipeline.filter}\n`);
  process.stdout.write('\n');
}

main().catch((err) => {
  process.stderr.write('\nERROR:\n');
  process.stderr.write(String(err?.message || err || 'Error desconocido'));
  process.stderr.write('\n\n');
  process.exitCode = 1;
});

