import { useEffect, useRef, useState } from 'react';
import { Dices, RefreshCw, Plus, ListMusic, Music, Maximize2, List, X, ChevronDown, User, AudioLines, Pencil, Library, Trash2, RotateCcw, Search, Mic, Upload, BadgeCheck, ShieldCheck, Sparkles, Loader2, Play, Pause, Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type CreateMode, type SongItem } from '@/types';
import { ensureAnonSession, getAccessToken, supabaseBrowser } from '@/lib/supabaseBrowser';

const isDev = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

function normalizeLyricsTags(t: string) {
  const lines = (t || '').toString().replaceAll('\r\n', '\n').split('\n');
  const mapped = lines.map((line) => {
    const s = line.trim();
    if (!s) return '';
    const paren = /^\(([^)]+)\)\s*$/.exec(s) || /^\(([^)]+)\)\s*:\s*$/.exec(s);
    if (paren && paren[1]) {
      const inner = paren[1].toString().trim().replaceAll(':', '').trim();
      const innerLower = inner.toLowerCase();
      const innerIsTag =
        innerLower === 'coro' ||
        innerLower.startsWith('coro ') ||
        innerLower === 'chorus' ||
        innerLower.startsWith('chorus ') ||
        innerLower.startsWith('verso') ||
        innerLower.startsWith('verse') ||
        innerLower.startsWith('pre-coro') ||
        innerLower.startsWith('pre coro') ||
        innerLower.startsWith('bridge') ||
        innerLower.startsWith('puente') ||
        innerLower.startsWith('outro') ||
        innerLower.startsWith('intro');
      if (innerIsTag || inner.length < 30) return `[${inner}]`;
    }
    const lower = s.toLowerCase();
    const isTag =
      lower === 'coro' ||
      lower.startsWith('coro ') ||
      lower === 'chorus' ||
      lower.startsWith('chorus ') ||
      lower.startsWith('verso') ||
      lower.startsWith('verse') ||
      lower.startsWith('pre-coro') ||
      lower.startsWith('pre coro') ||
      lower.startsWith('bridge') ||
      lower.startsWith('puente') ||
      lower.startsWith('outro') ||
      lower.startsWith('intro');
    if (isTag && !s.startsWith('[')) return `[${s.replaceAll(':', '').trim()}]`;
    if (s.startsWith('[') && s.endsWith(']')) return s;
    if (s.endsWith(':') && s.length < 20) return `[${s.slice(0, -1).trim()}]`;
    return line;
  });
  return mapped.join('\n').replaceAll(/\n{3,}/g, '\n\n').trim();
}

function stripTitleFromLyrics(title: string, lyrics: string) {
  const t = (title || '').toString().trim().toLowerCase();
  if (!t) return lyrics;
  const lines = (lyrics || '').toString().replaceAll('\r\n', '\n').split('\n');
  const first = (lines[0] || '').trim();
  const firstLower = first.toLowerCase();
  if (!first) return lyrics;
  if (firstLower === t) return lines.slice(1).join('\n').trim();
  if (firstLower === `titulo: ${t}` || firstLower === `título: ${t}`) return lines.slice(1).join('\n').trim();
  if (firstLower.startsWith(`${t} -`) || firstLower.startsWith(`${t}:`)) return lines.slice(1).join('\n').trim();
  return lyrics;
}

function toUserFriendlySunoError(out: any, fallback: string) {
  const raw = (out?.detail || out?.error || out?.message || fallback || '').toString().trim();
  const lower = raw.toLowerCase();
  const looksLikeCopyright =
    lower.includes('copyright') ||
    lower.includes('copyrighted') ||
    lower.includes('dmca') ||
    lower.includes('rights') ||
    lower.includes('infring');
  if (looksLikeCopyright) {
    return 'Error por Copyright.\n\nEse audio parece ser de una canción protegida. Sube un audio original o usa otro audio.';
  }
  return raw || fallback;
}

interface CreateViewProps {
  onSongCreated?: (song: SongItem, audioBlob?: Blob) => void;
  credits?: number;
  openPersonaPickerSignal?: number;
  onGoLibrary?: () => void;
  onOpenBalance?: () => void;
  standaloneVoices?: boolean;
  onExitVoices?: () => void;
  onOpenCreateVoiceFullScreen?: () => void;
  openCreateVoiceSignal?: number;
  prefill?: { type: 'cover'; song: SongItem };
  prefillNonce?: number;
}

export function CreateView({ onSongCreated, credits, openPersonaPickerSignal, onGoLibrary, onOpenBalance, standaloneVoices, onExitVoices, onOpenCreateVoiceFullScreen, openCreateVoiceSignal, prefill, prefillNonce }: CreateViewProps) {
  const [mode, setMode] = useState<CreateMode>('personalizado');
  const [instrumental, setInstrumental] = useState(false);
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  
  const [title, setTitle] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [gender, setGender] = useState<'Masculino' | 'Femenino'>('Masculino');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTranscribingAudioLyrics, setIsTranscribingAudioLyrics] = useState(false);
  const [audioLyricsStatus, setAudioLyricsStatus] = useState<string>('');
  const lastTranscribedKeyRef = useRef<string>('');
  const [hasPendingTask, setHasPendingTask] = useState(false);
  const pendingListKey = 'ramber.pendingSunoTasks_v1';
  const pendingLegacyKey = 'ramber.pendingSunoTask';
  const [isBoostingStyle, setIsBoostingStyle] = useState(false);
  const [isGeneratingLyrics, setIsGeneratingLyrics] = useState(false);
  
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUploadUrl, setAudioUploadUrl] = useState<string>('');
  const [audioUploadPath, setAudioUploadPath] = useState<string>('');
  const [externalAudioLabel, setExternalAudioLabel] = useState<string>('');
  const [audioDurationSec, setAudioDurationSec] = useState<number>(0);
  const [audioPlayableUrl, setAudioPlayableUrl] = useState<string>('');
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [audioAction, setAudioAction] = useState<'cover' | 'instrumental' | 'vocals' | 'extend' | 'library'>('cover');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isAudioModalOpen, setIsAudioModalOpen] = useState(false);
  const [audioUploadError, setAudioUploadError] = useState<string | null>(null);
  const [audioJustPickedAt, setAudioJustPickedAt] = useState<number>(0);
  const savedUploadsKey = 'ramber.saved_uploads_v1';
  const [savedUploadKey, setSavedUploadKey] = useState<string>('');
  const [studioRecorderOpen, setStudioRecorderOpen] = useState(false);
  const [studioRecorderState, setStudioRecorderState] = useState<'idle' | 'recording' | 'stopping'>('idle');
  const [studioRecorderError, setStudioRecorderError] = useState('');
  const [studioRecorderElapsedMs, setStudioRecorderElapsedMs] = useState(0);
  const [studioRecorderBars, setStudioRecorderBars] = useState<number[]>([]);
  const studioRecorderElapsedMsRef = useRef<number>(0);
  const studioRecorderStateRef = useRef<'idle' | 'recording' | 'stopping'>('idle');
  const studioRecorderRef = useRef<MediaRecorder | null>(null);
  const studioRecorderStreamRef = useRef<MediaStream | null>(null);
  const studioRecorderChunksRef = useRef<Blob[]>([]);
  const studioRecorderStopRequestedAtRef = useRef<number>(0);
  const studioRecorderLastChunkAtRef = useRef<number>(0);
  const studioRecorderFinalizeIdRef = useRef<number>(0);
  const studioRecorderStopFallbackTimerRef = useRef<number | null>(null);
  const studioRecorderTimerRef = useRef<number | null>(null);
  const studioRecorderBarsTimerRef = useRef<number | null>(null);
  const studioRecorderStartedAtRef = useRef<number | null>(null);
  const studioRecorderAudioCtxRef = useRef<AudioContext | null>(null);
  const studioRecorderAnalyserRef = useRef<AnalyserNode | null>(null);

  const [model, setModel] = useState<'V5' | 'V5_5' | 'V4_5PLUS' | 'V4_5ALL' | 'V4_5' | 'V4'>('V5');
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const modelBtnRef = useRef<HTMLButtonElement | null>(null);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);

  const [weirdness, setWeirdness] = useState(50);
  const [styleInfluence, setStyleInfluence] = useState(50);
  const [audioInfluence, setAudioInfluence] = useState(25);
  const [showMoreOptions, setShowMoreOptions] = useState(false);

  const [isVoicesPickerOpen, setIsVoicesPickerOpen] = useState(false);
  const [voices, setVoices] = useState<
    Array<{
      voiceId: string;
      name: string;
      createdAt: string;
      taskId?: string;
      status?: string;
      profileImageUrl?: string;
      isPublic?: boolean;
      tags?: string[];
      description?: string;
      singerSkillLevel?: string;
    }>
  >([]);
  const [selectedVoice, setSelectedVoice] = useState<{ voiceId: string; name: string } | null>(null);
  const [isCreateVoiceOpen, setIsCreateVoiceOpen] = useState(false);
  const [voiceSearch, setVoiceSearch] = useState('');
  const [voicesTab, setVoicesTab] = useState<'mine' | 'favorites'>('mine');
  const [newVoiceName, setNewVoiceName] = useState('');
  const [newVoiceDescription, setNewVoiceDescription] = useState('');
  const [voiceSourceFile, setVoiceSourceFile] = useState<File | null>(null);
  const [voiceSourcePreviewUrl, setVoiceSourcePreviewUrl] = useState('');
  const [voiceSourceDurationSec, setVoiceSourceDurationSec] = useState(0);
  const [voiceStartSec, setVoiceStartSec] = useState(0);
  const [voiceEndSec, setVoiceEndSec] = useState(240);
  const [voiceCreateStep, setVoiceCreateStep] = useState<
    | 'pick_source'
    | 'trim'
    | 'segment'
    | 'generating_phrase'
    | 'phrase_ready'
    | 'recording_verify'
    | 'pick_verify'
    | 'generating_voice'
    | 'skill'
    | 'details'
    | 'done'
  >('pick_source');
  const [voiceCreateError, setVoiceCreateError] = useState('');
  const [voiceValidateTaskId, setVoiceValidateTaskId] = useState('');
  const voiceValidateTaskIdRef = useRef<string>('');
  const [voiceValidateInfo, setVoiceValidateInfo] = useState('');
  const [voiceVerifyFile, setVoiceVerifyFile] = useState<File | null>(null);
  const [voiceVerifyPreviewUrl, setVoiceVerifyPreviewUrl] = useState('');
  const [voiceGenerateTaskId, setVoiceGenerateTaskId] = useState('');
  const [voiceGeneratedVoiceId, setVoiceGeneratedVoiceId] = useState('');
  const [voiceIsAvailable, setVoiceIsAvailable] = useState<boolean | null>(null);
  const [voiceLibrarySongs, setVoiceLibrarySongs] = useState<Array<{ id: string; title: string; audioUrl: string }>>([]);
  const [voiceLibraryLoading, setVoiceLibraryLoading] = useState(false);
  const [voiceLibraryMode, setVoiceLibraryMode] = useState<'none' | 'source' | 'verify'>('none');
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceConsent, setVoiceConsent] = useState(false);
  const [voiceWaveBars, setVoiceWaveBars] = useState<number[]>([]);
  const voiceTrimAudioRef = useRef<HTMLAudioElement | null>(null);
  const [voiceTrimIsPlaying, setVoiceTrimIsPlaying] = useState(false);
  const [voiceTrimNowSec, setVoiceTrimNowSec] = useState(0);
  const voiceRecordInputRef = useRef<HTMLInputElement | null>(null);
  const voiceUploadInputRef = useRef<HTMLInputElement | null>(null);
  const voiceVerifyRecordInputRef = useRef<HTMLInputElement | null>(null);
  const voiceVerifyUploadInputRef = useRef<HTMLInputElement | null>(null);
  const [voiceRecorderOpen, setVoiceRecorderOpen] = useState(false);
  const [voiceRecorderMode, setVoiceRecorderMode] = useState<'source' | 'verify'>('source');
  const [voiceRecorderState, setVoiceRecorderState] = useState<'idle' | 'recording' | 'stopping'>('idle');
  const [voiceRecorderError, setVoiceRecorderError] = useState('');
  const [voiceRecorderElapsedMs, setVoiceRecorderElapsedMs] = useState(0);
  const [voiceRecorderMaxMs, setVoiceRecorderMaxMs] = useState<number | null>(null);
  const [voiceRecorderBars, setVoiceRecorderBars] = useState<number[]>([]);
  const voiceRecorderMaxMsRef = useRef<number | null>(null);
  const voiceRecorderElapsedMsRef = useRef<number>(0);
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceRecorderStreamRef = useRef<MediaStream | null>(null);
  const voiceRecorderChunksRef = useRef<Blob[]>([]);
  const voiceRecorderStopRequestedAtRef = useRef<number>(0);
  const voiceRecorderLastChunkAtRef = useRef<number>(0);
  const voiceRecorderTimerRef = useRef<number | null>(null);
  const voiceRecorderStartedAtRef = useRef<number | null>(null);
  const voiceRecorderBarsTimerRef = useRef<number | null>(null);
  const voiceRecorderAudioCtxRef = useRef<AudioContext | null>(null);
  const voiceRecorderAnalyserRef = useRef<AnalyserNode | null>(null);

  const [voiceSkillLevel, setVoiceSkillLevel] = useState('');
  const [voiceDetailsName, setVoiceDetailsName] = useState('');
  const [voiceDetailsTags, setVoiceDetailsTags] = useState('');
  const [voiceDetailsDescription, setVoiceDetailsDescription] = useState('');
  const [voiceDetailsIsPublic, setVoiceDetailsIsPublic] = useState(false);
  const [voiceDetailsImageKey, setVoiceDetailsImageKey] = useState('');
  const [voiceDetailsSaving, setVoiceDetailsSaving] = useState(false);
  const voiceDetailsImageInputRef = useRef<HTMLInputElement | null>(null);
  const [sunoVoiceDetailsOpen, setSunoVoiceDetailsOpen] = useState(false);
  const [sunoVoiceDetailsId, setSunoVoiceDetailsId] = useState('');

  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const audioCaptureInputRef = useRef<HTMLInputElement | null>(null);
  const uploadXhrRef = useRef<XMLHttpRequest | null>(null);

  const stopVoiceRecorder = async (finalize: boolean) => {
    try {
      if (voiceRecorderTimerRef.current) {
        window.clearInterval(voiceRecorderTimerRef.current);
      }
    } catch {
    }
    voiceRecorderTimerRef.current = null;

    try {
      if (voiceRecorderBarsTimerRef.current) {
        window.clearInterval(voiceRecorderBarsTimerRef.current);
      }
    } catch {
    }
    voiceRecorderBarsTimerRef.current = null;

    try {
      voiceRecorderAnalyserRef.current = null;
      const ctx = voiceRecorderAudioCtxRef.current;
      voiceRecorderAudioCtxRef.current = null;
      try {
        await ctx?.close?.();
      } catch {
      }
    } catch {
    }

    const mr = voiceRecorderRef.current;
    const stream = voiceRecorderStreamRef.current;

    if (finalize) {
      voiceRecorderStopRequestedAtRef.current = Date.now();
      if (mr && mr.state !== 'inactive') {
        try {
          (mr as any).requestData?.();
        } catch {
        }
        try {
          mr.stop();
        } catch {
        }
      }
      return;
    }

    voiceRecorderRef.current = null;
    voiceRecorderStreamRef.current = null;
    voiceRecorderMaxMsRef.current = null;
    voiceRecorderStartedAtRef.current = null;

    try {
      stream?.getTracks?.().forEach((t) => {
        try {
          t.stop();
        } catch {
        }
      });
    } catch {
    }
  };

  useEffect(() => {
    return () => {
      stopVoiceRecorder(false).catch(() => {});
    };
  }, []);

  const startVoiceRecorder = async (mode: 'source' | 'verify', maxSeconds?: number) => {
    setVoiceRecorderError('');

    const navAny = navigator as any;
    const canMedia =
      typeof window !== 'undefined' &&
      typeof navAny?.mediaDevices?.getUserMedia === 'function' &&
      typeof (window as any).MediaRecorder === 'function';

    if (!canMedia) {
      if (mode === 'verify') voiceVerifyRecordInputRef.current?.click?.();
      else voiceRecordInputRef.current?.click?.();
      return;
    }

    try {
      await stopVoiceRecorder(false);
      const modeAtStart = mode;
      setVoiceRecorderMode(mode);
      setVoiceRecorderElapsedMs(0);
      voiceRecorderElapsedMsRef.current = 0;
      voiceRecorderStopRequestedAtRef.current = 0;
      voiceRecorderLastChunkAtRef.current = 0;
      setVoiceRecorderBars([]);
      const maxMs = Number.isFinite(Number(maxSeconds)) ? Math.max(1, Math.floor(Number(maxSeconds))) * 1000 : null;
      voiceRecorderMaxMsRef.current = maxMs;
      setVoiceRecorderMaxMs(maxMs);
      setVoiceRecorderState('idle');
      setVoiceRecorderOpen(true);

      const stream = await navAny.mediaDevices.getUserMedia({ audio: true });
      voiceRecorderStreamRef.current = stream;
      voiceRecorderChunksRef.current = [];

      try {
        const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (typeof AC === 'function') {
          const ctx: AudioContext = new AC();
          voiceRecorderAudioCtxRef.current = ctx;
          const src = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.7;
          src.connect(analyser);
          voiceRecorderAnalyserRef.current = analyser;

          const freq = new Uint8Array(analyser.frequencyBinCount);
          const barsCount = 48;
          voiceRecorderBarsTimerRef.current = window.setInterval(() => {
            const a = voiceRecorderAnalyserRef.current;
            if (!a) return;
            a.getByteFrequencyData(freq);
            const binSize = Math.max(1, Math.floor(freq.length / barsCount));
            const next: number[] = [];
            for (let i = 0; i < barsCount; i++) {
              let sum = 0;
              const start = i * binSize;
              const end = Math.min(freq.length, start + binSize);
              for (let j = start; j < end; j++) sum += freq[j] || 0;
              const avg = sum / Math.max(1, end - start);
              const h = Math.max(6, Math.min(100, Math.round((avg / 255) * 100)));
              next.push(h);
            }
            setVoiceRecorderBars(next);
          }, 80);
        }
      } catch {
      }

      const MR = (window as any).MediaRecorder as typeof MediaRecorder;
      const pickMime = () => {
        const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4'];
        for (const t of types) {
          try {
            if (MR.isTypeSupported(t)) return t;
          } catch {
          }
        }
        return '';
      };
      const mimeType = pickMime();
      const mr = mimeType ? new MR(stream, { mimeType }) : new MR(stream);
      voiceRecorderRef.current = mr;

      mr.ondataavailable = (e: BlobEvent) => {
        const b = e.data;
        if (!b) return;
        if (!b.size) return;
        voiceRecorderChunksRef.current.push(b);
        voiceRecorderLastChunkAtRef.current = Date.now();
      };

      mr.onstop = () => {
        const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
        const run = async () => {
          const stopRequestedAt = Number(voiceRecorderStopRequestedAtRef.current || 0) || Date.now();
          const deadline = Date.now() + 1500;
          while (Date.now() < deadline) {
            const chunksNow = Array.isArray(voiceRecorderChunksRef.current) ? voiceRecorderChunksRef.current.length : 0;
            const lastAt = Number(voiceRecorderLastChunkAtRef.current || 0) || 0;
            if (chunksNow > 0 && lastAt && Date.now() - lastAt > 180) break;
            if (chunksNow === 0) {
              if (Date.now() - stopRequestedAt > 900) break;
            } else {
              if (Date.now() - stopRequestedAt > 1200) break;
            }
            await sleep(80);
          }

          const chunks = Array.isArray(voiceRecorderChunksRef.current) ? voiceRecorderChunksRef.current.slice() : [];
          voiceRecorderChunksRef.current = [];

          const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
          if (!blob.size || blob.size < 1024) {
            if (modeAtStart === 'verify') {
              setVoiceCreateError('No se grabó audio de la frase. Intenta de nuevo y asegúrate de permitir el micrófono.');
              setVoiceCreateStep('pick_verify');
            } else {
              setVoiceCreateError('No se grabó audio. Intenta de nuevo y asegúrate de permitir el micrófono.');
              setVoiceCreateStep('pick_source');
            }
            setVoiceRecorderState('idle');
            setVoiceRecorderOpen(false);
            stopVoiceRecorder(false).catch(() => {});
            return;
          }

          const ct = (blob.type || mr.mimeType || 'audio/webm').toLowerCase();
          const ext = ct.includes('mp4') ? 'm4a' : ct.includes('webm') ? 'webm' : 'webm';
          const file = new File([blob], `grabacion_${Date.now()}.${ext}`, { type: blob.type });

          if (modeAtStart === 'verify') {
            setVoiceVerifyFile(file);
            setVoiceCreateError('');
            setVoiceCreateStep('generating_voice');
            setTimeout(() => {
              generateCustomVoice(file).catch(() => {});
            }, 0);
          } else {
            const startedAt = voiceRecorderStartedAtRef.current;
            const stopAt = Number(voiceRecorderStopRequestedAtRef.current || 0) || Date.now();
            const elapsedMs =
              (Number.isFinite(Number(startedAt)) && startedAt ? Math.max(0, stopAt - startedAt) : 0) ||
              Math.max(0, Number(voiceRecorderElapsedMsRef.current || 0));
            const approxDurationSec = elapsedMs ? Math.max(1, Math.ceil(elapsedMs / 1000)) : 0;
            setVoiceSourceFile(file);
            setVoiceSourceDurationSec(approxDurationSec || 0);
            setVoiceVerifyFile(null);
            setVoiceStartSec(0);
            setVoiceEndSec(approxDurationSec ? Math.min(voiceTrimMaxSec, approxDurationSec) : voiceTrimMaxSec);
            setVoiceTrimNowSec(0);
            try {
              voiceTrimAudioRef.current?.pause?.();
            } catch {
            }
            setVoiceTrimIsPlaying(false);
            setVoiceCreateStep('trim');
            setVoiceCreateError('');
          }

          setVoiceRecorderState('idle');
          setVoiceRecorderOpen(false);
          stopVoiceRecorder(false).catch(() => {});
        };
        run().catch(() => {
          setVoiceRecorderState('idle');
          setVoiceRecorderOpen(false);
          stopVoiceRecorder(false).catch(() => {});
        });
      };

      mr.onerror = () => {
        setVoiceRecorderError('Falló la grabación. Prueba la “Grabación alternativa”.');
      };

      setVoiceRecorderState('recording');
      voiceRecorderStartedAtRef.current = Date.now();
      try {
        mr.start(1000);
      } catch {
        mr.start();
      }

      const startedAt = Date.now();
      voiceRecorderTimerRef.current = window.setInterval(() => {
        const elapsed = Date.now() - startedAt;
        setVoiceRecorderElapsedMs(elapsed);
        voiceRecorderElapsedMsRef.current = elapsed;
        const maxMs = voiceRecorderMaxMsRef.current;
        if (maxMs && elapsed >= maxMs) {
          setVoiceRecorderState('stopping');
          stopVoiceRecorder(true).catch(() => {});
        }
      }, 200);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setVoiceRecorderError(msg || 'No pude acceder al micrófono.');
      setVoiceRecorderState('idle');
      setVoiceRecorderMaxMs(null);
      try {
        await stopVoiceRecorder(false);
      } catch {
      }
    }
  };

  useEffect(() => {
    let cancelled = false;
    const f = voiceSourceFile;
    if (!f) return;
    if (Number(voiceSourceDurationSec || 0) > 0) return;
    const run = async () => {
      try {
        const buf = await f.arrayBuffer();
        const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (typeof AC !== 'function') return;
        const ctx: AudioContext = new AC();
        const decode = (ab: ArrayBuffer) =>
          new Promise<AudioBuffer>((resolve, reject) => {
            const anyCtx: any = ctx as any;
            const p = anyCtx.decodeAudioData(ab, resolve, reject);
            if (p && typeof p.then === 'function') {
              p.then(resolve).catch(reject);
            }
          });
        const audioBuf = await decode(buf.slice(0));
        const d = Math.floor(Number(audioBuf?.duration || 0));
        try {
          await ctx.close?.();
        } catch {
        }
        if (cancelled) return;
        if (!Number.isFinite(d) || d <= 0) return;
        const next = clampVoiceTrim(voiceStartSec, voiceEndSec || voiceTrimMaxSec, d);
        setVoiceSourceDurationSec(d);
        setVoiceStartSec(next.start);
        setVoiceEndSec(next.end || Math.min(voiceTrimMaxSec, Math.floor(d)));
        setVoiceTrimNowSec(next.start);
      } catch {
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [voiceSourceFile, voiceSourceDurationSec, voiceStartSec, voiceEndSec]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('ramber_create_draft_v1');
      if (!raw) return;
      const d = JSON.parse(raw);
      const m = typeof d?.mode === 'string' ? d.mode : '';
      if (m === 'simple' || m === 'personalizado') setMode(m);
      setInstrumental(Boolean(d?.instrumental));
      if (typeof d?.description === 'string') setDescription(d.description);
      if (typeof d?.instructions === 'string') setInstructions(d.instructions);
      if (typeof d?.title === 'string') setTitle(d.title);
      if (typeof d?.lyrics === 'string') setLyrics(d.lyrics);
      const g = typeof d?.gender === 'string' ? d.gender : '';
      if (g === 'Masculino' || g === 'Femenino') setGender(g);
      const w = Number(d?.weirdness);
      const si = Number(d?.styleInfluence);
      const ai = Number(d?.audioInfluence);
      if (Number.isFinite(w)) setWeirdness(Math.max(0, Math.min(100, Math.round(w))));
      if (Number.isFinite(si)) setStyleInfluence(Math.max(0, Math.min(100, Math.round(si))));
      if (Number.isFinite(ai)) setAudioInfluence(Math.max(0, Math.min(100, Math.round(ai))));
      const vid = typeof d?.voice_id === 'string' ? d.voice_id : '';
      const vn = typeof d?.voice_name === 'string' ? d.voice_name : '';
      if (vid) setSelectedVoice({ voiceId: vid, name: vn || 'Voz' });
      const draftAudioUrl = typeof d?.audioUploadUrl === 'string' ? d.audioUploadUrl : '';
      const draftAudioPath = typeof d?.audioUploadPath === 'string' ? d.audioUploadPath : '';
      const draftAudioLabel = typeof d?.audioLabel === 'string' ? d.audioLabel : '';
      const draftAudioAction = typeof d?.audioAction === 'string' ? d.audioAction : '';
      const draftAudioDuration = Number(d?.audioDurationSec ?? 0);
      if (!audioUploadUrl && !audioFile && draftAudioUrl.trim()) {
        setAudioUploadUrl(draftAudioUrl.trim());
        setAudioUploadPath(draftAudioPath.trim());
        setExternalAudioLabel(draftAudioLabel.trim());
        if (draftAudioAction === 'cover' || draftAudioAction === 'instrumental' || draftAudioAction === 'vocals' || draftAudioAction === 'extend' || draftAudioAction === 'library') {
          setAudioAction(draftAudioAction);
        }
        if (Number.isFinite(draftAudioDuration) && draftAudioDuration > 0) setAudioDurationSec(draftAudioDuration);
      }
    } catch {
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        'ramber_create_draft_v1',
        JSON.stringify({
          mode,
          instrumental,
          description,
          instructions,
          title,
          lyrics: (lyrics || '').toString().slice(0, 20000),
          gender,
          weirdness,
          styleInfluence,
          audioInfluence,
          voice_id: selectedVoice?.voiceId || '',
          voice_name: selectedVoice?.name || '',
          audioUploadUrl: (audioUploadUrl || '').toString(),
          audioUploadPath: (audioUploadPath || '').toString(),
          audioLabel: (audioFile?.name || externalAudioLabel || '').toString().slice(0, 200),
          audioAction: (audioAction || '').toString(),
          audioDurationSec: Number.isFinite(audioDurationSec) ? audioDurationSec : 0,
        }),
      );
    } catch {
    }
  }, [mode, instrumental, description, instructions, title, lyrics, gender, model, selectedVoice, weirdness, styleInfluence, audioInfluence, audioUploadUrl, audioUploadPath, externalAudioLabel, audioAction, audioDurationSec, audioFile]);

  useEffect(() => {
    if (!openPersonaPickerSignal) return;
    setIsVoicesPickerOpen(true);
  }, [openPersonaPickerSignal]);

  useEffect(() => {
    if (!prefillNonce) return;
    if (!prefill) return;
    if (prefill.type !== 'cover') return;
    const song = prefill.song;
    const url = (song?.audioUrl || '').toString().trim();
    if (!url) return;
    setMode('personalizado');
    setAudioAction('cover');
    setInstrumental(false);
    setAudioFile(null);
    setAudioUploadUrl(url);
    setAudioUploadPath('');
    setIsUploadingAudio(false);
    setUploadProgress(100);
    setExternalAudioLabel(song?.title ? `Cover de: ${song.title}` : 'Cover desde Biblioteca');
    setTitle((song?.title || 'Cover').toString().slice(0, 100));
    if (typeof song?.description === 'string') {
      setInstructions(song.description);
      setDescription(song.description);
    }
    const srcLyrics = typeof song?.lyrics === 'string' ? song.lyrics : '';
    if (srcLyrics.trim()) setLyrics(srcLyrics);
  }, [prefillNonce, prefill]);

  useEffect(() => {
    if (!isVoicesPickerOpen && !standaloneVoices) return;
    let cancelled = false;

    const loadFromLocalCache = () => {
      try {
        const raw = localStorage.getItem('ramber.suno_voices_v1');
        const parsed = raw ? JSON.parse(raw) : null;
        const list = Array.isArray(parsed) ? parsed : [];
        const clean = list
          .map((v: any) => ({
            voiceId: String(v?.voiceId || v?.voice_id || v?.suno_voice_id || '').trim(),
            name: String(v?.name || v?.voice_name || 'Voz').trim(),
            createdAt: String(v?.createdAt || v?.created_at || new Date().toISOString()).trim() || new Date().toISOString(),
            taskId: typeof v?.taskId === 'string' ? v.taskId : typeof v?.task_id === 'string' ? v.task_id : undefined,
            status: typeof v?.status === 'string' ? v.status : undefined,
            profileImageUrl: typeof v?.profileImageUrl === 'string' ? v.profileImageUrl : undefined,
            isPublic: typeof v?.isPublic === 'boolean' ? v.isPublic : undefined,
            tags: Array.isArray(v?.tags) ? v.tags.filter((x: any) => typeof x === 'string' && x.trim()).map((x: any) => String(x).trim()) : undefined,
            description: typeof v?.description === 'string' ? v.description : undefined,
            singerSkillLevel: typeof v?.singerSkillLevel === 'string' ? v.singerSkillLevel : undefined,
          }))
          .filter((v: any) => v.voiceId);
        if (!cancelled) setVoices(clean);
      } catch {
        if (!cancelled) setVoices([]);
      }
    };

    const loadFromDb = async () => {
      const t = await getAccessToken();
      if (!t.ok) {
        loadFromLocalCache();
        return;
      }
      const r = await fetch('/api/suno/voices', { headers: { authorization: `Bearer ${t.token}` } });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        loadFromLocalCache();
        return;
      }
      const rows = Array.isArray((out as any)?.voices) ? (out as any).voices : [];
      const clean = rows
        .map((v: any) => {
          const meta = v?.meta && typeof v.meta === 'object' && !Array.isArray(v.meta) ? v.meta : null;
          return {
            voiceId: String(v?.suno_voice_id || v?.voiceId || v?.voice_id || '').trim(),
            name: String(v?.name || v?.voice_name || 'Voz').trim(),
            createdAt: String(v?.created_at || v?.createdAt || new Date().toISOString()).trim() || new Date().toISOString(),
            taskId: String(v?.last_task_id || v?.task_id || v?.taskId || '').trim() || undefined,
            status: String(v?.status || '').trim() || undefined,
            profileImageUrl: meta && typeof meta?.profileImageUrl === 'string' ? String(meta.profileImageUrl).trim() : undefined,
            isPublic: meta && typeof meta?.isPublic === 'boolean' ? Boolean(meta.isPublic) : undefined,
            tags: meta && Array.isArray(meta?.tags) ? meta.tags.filter((x: any) => typeof x === 'string' && x.trim()).map((x: any) => String(x).trim()) : undefined,
            description: meta && typeof meta?.description === 'string' ? String(meta.description) : undefined,
            singerSkillLevel: meta && typeof meta?.singerSkillLevel === 'string' ? String(meta.singerSkillLevel) : undefined,
          };
        })
        .filter((v: any) => v.voiceId);

      if (!cancelled) setVoices(clean);
      try {
        localStorage.setItem('ramber.suno_voices_v1', JSON.stringify(clean.slice(0, 50)));
      } catch {
      }
    };

    loadFromDb().catch(() => loadFromLocalCache());
    return () => {
      cancelled = true;
    };
  }, [isVoicesPickerOpen, standaloneVoices]);

  useEffect(() => {
    if (!isModelMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as any;
      const btn = modelBtnRef.current;
      const menu = modelMenuRef.current;
      if (btn && (btn === t || btn.contains(t))) return;
      if (menu && (menu === t || menu.contains(t))) return;
      setIsModelMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [isModelMenuOpen]);

  useEffect(() => {
    if (!voiceSourceFile) {
      setVoiceSourcePreviewUrl('');
      setVoiceSourceDurationSec(0);
      return;
    }
    const url = URL.createObjectURL(voiceSourceFile);
    setVoiceSourcePreviewUrl(url);
    return () => {
      try {
        URL.revokeObjectURL(url);
      } catch {
      }
    };
  }, [voiceSourceFile]);

  useEffect(() => {
    if (!voiceVerifyFile) {
      setVoiceVerifyPreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(voiceVerifyFile);
    setVoiceVerifyPreviewUrl(url);
    return () => {
      try {
        URL.revokeObjectURL(url);
      } catch {
      }
    };
  }, [voiceVerifyFile]);

  useEffect(() => {
    if (!audioUploadUrl) {
      setAudioPlayableUrl('');
      return;
    }
    refreshAudioPlayableUrl().catch(() => setAudioPlayableUrl((audioUploadUrl || '').toString().trim()));
  }, [audioUploadUrl, audioUploadPath]);

  const clearAudio = () => {
    if (audioJustPickedAt && isUploadingAudio) return;
    try {
      uploadXhrRef.current?.abort();
    } catch {}
    uploadXhrRef.current = null;
    setAudioFile(null);
    setAudioUploadUrl('');
    setAudioUploadPath('');
    setAudioPlayableUrl('');
    setExternalAudioLabel('');
    setAudioDurationSec(0);
    setIsUploadingAudio(false);
    setAudioAction('cover');
    setUploadProgress(0);
    setIsAudioModalOpen(false);
    setAudioUploadError(null);
    setAudioLyricsStatus('');
    lastTranscribedKeyRef.current = '';
    if (audioInputRef.current) audioInputRef.current.value = '';
  };

  const refreshAudioPlayableUrl = async () => {
    const fallback = (audioUploadUrl || '').toString().trim();
    const key = (audioUploadPath || '').toString().trim().replace(/^\/+/, '');
    if (!key) {
      setAudioPlayableUrl(fallback);
      return;
    }
    const allowed = key.startsWith('uploads/audio/') || key.startsWith('uploads/');
    if (!allowed) {
      setAudioPlayableUrl(fallback);
      return;
    }
    const t = await getAccessToken();
    if (!t.ok) {
      setAudioPlayableUrl(fallback);
      return;
    }
    const r = await fetch(`/api/upload-audio?action=sign&key=${encodeURIComponent(key)}`, { headers: { authorization: `Bearer ${t.token}` } });
    const out = await r.json().catch(() => ({}));
    const url = (out?.url || '').toString().trim();
    if (r.ok && url) {
      setAudioPlayableUrl(url);
      return;
    }
    setAudioPlayableUrl(fallback);
  };

  const resetVoiceWizard = () => {
    setVoiceCreateError('');
    setVoiceCreateStep('pick_source');
    setNewVoiceName('');
    setNewVoiceDescription('');
    setVoiceSourceFile(null);
    setVoiceSourceDurationSec(0);
    setVoiceStartSec(0);
    setVoiceEndSec(240);
    setVoiceValidateTaskId('');
    voiceValidateTaskIdRef.current = '';
    setVoiceValidateInfo('');
    setVoiceVerifyFile(null);
    setVoiceGenerateTaskId('');
    setVoiceGeneratedVoiceId('');
    setVoiceIsAvailable(null);
    setVoiceLibrarySongs([]);
    setVoiceLibraryLoading(false);
    setVoiceLibraryMode('none');
    setVoiceBusy(false);
    setVoiceConsent(false);
    if (voiceRecordInputRef.current) voiceRecordInputRef.current.value = '';
    if (voiceUploadInputRef.current) voiceUploadInputRef.current.value = '';
    if (voiceVerifyRecordInputRef.current) voiceVerifyRecordInputRef.current.value = '';
    if (voiceVerifyUploadInputRef.current) voiceVerifyUploadInputRef.current.value = '';
  };

  const voiceTrimMaxSec = 240;
  const formatMmSs = (sec: number) => {
    const s = Math.max(0, Math.floor(Number(sec || 0)));
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  };

  const clampVoiceTrim = (start: number, end: number, duration: number) => {
    const d = Math.max(0, Math.floor(Number(duration || 0)));
    const s0 = Math.max(0, Math.min(d > 0 ? d : 0, Math.floor(Number(start || 0))));
    const e0 = Math.max(0, Math.min(d > 0 ? d : 0, Math.floor(Number(end || 0))));
    let s = Math.min(s0, e0);
    let e = Math.max(s0, e0);
    if (d > 0) {
      if (e - s > voiceTrimMaxSec) {
        e = s + voiceTrimMaxSec;
        if (e > d) {
          e = d;
          s = Math.max(0, e - voiceTrimMaxSec);
        }
      }
      if (e <= s) {
        e = Math.min(d, s + 1);
        if (e <= s) s = Math.max(0, e - 1);
      }
    }
    return { start: s, end: e, duration: d };
  };

  const toggleTrimPlay = () => {
    const el = voiceTrimAudioRef.current;
    if (!el) return;
    const d = Number(voiceSourceDurationSec || 0);
    const range = clampVoiceTrim(voiceStartSec, voiceEndSec || voiceTrimMaxSec, d);
    const start = Number(range.start || 0);
    const end = Number(range.end || 0);
    if (!Number.isFinite(end) || end <= start) return;

    const now = Number(el.currentTime || 0);
    if (!Number.isFinite(now) || now < start || now >= end) {
      try {
        el.currentTime = start;
        setVoiceTrimNowSec(start);
      } catch {
      }
    }

    if (el.paused) {
      el.play().then(() => setVoiceTrimIsPlaying(true)).catch(() => {});
    } else {
      el.pause();
      setVoiceTrimIsPlaying(false);
    }
  };

  useEffect(() => {
    const el = voiceTrimAudioRef.current;
    if (!el) return;
    if (el.paused) setVoiceTrimIsPlaying(false);
  }, [voiceCreateStep]);

  useEffect(() => {
    const file = voiceSourceFile;
    const d = Number(voiceSourceDurationSec || 0);
    if (!file || !Number.isFinite(d) || d <= 0) {
      setVoiceWaveBars([]);
      return;
    }
    try {
      const name = (file.name || '').toString();
      let seed = Number(file.size || 0) + Math.floor(d * 1000);
      for (let i = 0; i < name.length; i++) seed = (seed + name.charCodeAt(i) * (i + 1)) >>> 0;
      const count = 140;
      let x = seed >>> 0;
      const nextBars: number[] = [];
      for (let i = 0; i < count; i++) {
        x = (x * 1664525 + 1013904223) >>> 0;
        const r = x / 4294967296;
        const wave = (Math.sin(i / 7) + 1) / 2;
        const h = 18 + Math.floor((Math.pow(r, 0.35) * 0.7 + wave * 0.3) * 82);
        nextBars.push(Math.max(10, Math.min(100, h)));
      }
      setVoiceWaveBars(nextBars);
    } catch {
      setVoiceWaveBars([]);
    }
  }, [voiceSourceFile, voiceSourceDurationSec]);

  useEffect(() => {
    if (!standaloneVoices) return;
    resetVoiceWizard();
    setIsCreateVoiceOpen(true);
  }, [standaloneVoices, openCreateVoiceSignal]);

  const r2ValueToProxyUrl = (raw: any) => {
    const url = (raw || '').toString().trim();
    if (!url) return '';
    if (url.startsWith('blob:') || url.startsWith('data:')) return url;
    const keyish = url.replace(/^\/+/, '');
    const allowed = ['avatars/', 'profile-covers/', 'personas/', 'covers/'];
    if (!/^https?:\/\//i.test(url) && allowed.some((p) => keyish.startsWith(p))) {
      return `${window.location.origin}/api/r2/object?key=${encodeURIComponent(keyish)}`;
    }
    try {
      const u = new URL(url);
      const host = (u.hostname || '').toLowerCase();
      const isR2 =
        host.includes('.r2.cloudflarestorage.com') ||
        host.endsWith('.r2.dev') ||
        host.includes('.r2') ||
        url.includes('.r2.cloudflarestorage.com/');
      if (!isR2) return url;
      const key = (u.pathname || '').replace(/^\/+/, '');
      if (!key) return url;
      return `${window.location.origin}/api/r2/object?key=${encodeURIComponent(key)}`;
    } catch {
      return url;
    }
  };

  const saveSunoVoiceToDb = async (
    v: { voiceId: string; name: string; createdAt: string; taskId?: string; status?: string },
    meta?: any
  ) => {
    const t = await getAccessToken();
    if (!t.ok) return;
    await fetch('/api/suno/voices', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
      body: JSON.stringify({
        sunoVoiceId: v.voiceId,
        name: v.name,
        status: v.status || null,
        taskId: v.taskId || null,
        meta: meta || undefined,
      }),
    }).catch(() => {});
  };

  const upsertLocalVoice = (v: { voiceId: string; name: string; createdAt: string; taskId?: string; status?: string }) => {
    try {
      const raw = localStorage.getItem('ramber.suno_voices_v1');
      const parsed = raw ? JSON.parse(raw) : null;
      const list = Array.isArray(parsed) ? parsed : [];
      const next = [
        v,
        ...list.filter((x: any) => String(x?.voiceId || x?.voice_id || '').trim() !== v.voiceId),
      ].slice(0, 50);
      localStorage.setItem('ramber.suno_voices_v1', JSON.stringify(next));
      const clean = next
        .map((x: any) => ({
          voiceId: String(x?.voiceId || x?.voice_id || '').trim(),
          name: String(x?.name || x?.voice_name || 'Voz').trim(),
          createdAt: String(x?.createdAt || x?.created_at || new Date().toISOString()).trim() || new Date().toISOString(),
          taskId: typeof x?.taskId === 'string' ? x.taskId : typeof x?.task_id === 'string' ? x.task_id : undefined,
          status: typeof x?.status === 'string' ? x.status : undefined,
        }))
        .filter((x: any) => x.voiceId);
      setVoices(clean);
    } catch {
    }
    saveSunoVoiceToDb(v).catch(() => {});
  };

  const openSunoVoiceDetails = (v: {
    voiceId: string;
    name: string;
    profileImageUrl?: string;
    isPublic?: boolean;
    tags?: string[];
    description?: string;
    singerSkillLevel?: string;
  }) => {
    setSunoVoiceDetailsId(v.voiceId);
    setVoiceGeneratedVoiceId(v.voiceId);
    setVoiceDetailsName((v.name || '').toString());
    setVoiceDetailsTags(Array.isArray(v.tags) ? v.tags.join(', ') : '');
    setVoiceDetailsDescription((v.description || '').toString());
    setVoiceDetailsIsPublic(Boolean(v.isPublic));
    setVoiceDetailsImageKey((v.profileImageUrl || '').toString());
    setVoiceSkillLevel((v.singerSkillLevel || '').toString());
    setVoiceCreateError('');
    setVoiceDetailsSaving(false);
    setSunoVoiceDetailsOpen(true);
  };

  useEffect(() => {
    if (!sunoVoiceDetailsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setSunoVoiceDetailsOpen(false);
      setSunoVoiceDetailsId('');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sunoVoiceDetailsOpen]);

  const persistSunoVoiceProfile = async (voiceId: string) => {
    const id = (voiceId || '').toString().trim();
    if (!id) return;
    const nm = (voiceDetailsName || 'Mi voz').toString().trim().slice(0, 120) || 'Mi voz';
    const tags = (voiceDetailsTags || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20);
    const meta = {
      profileImageUrl: voiceDetailsImageKey || null,
      tags,
      description: (voiceDetailsDescription || '').toString().trim().slice(0, 800) || null,
      isPublic: Boolean(voiceDetailsIsPublic),
      singerSkillLevel: (voiceSkillLevel || '').toString().trim() || null,
    };
    const existing = voices.find((x) => x.voiceId === id);
    await saveSunoVoiceToDb(
      { voiceId: id, name: nm, createdAt: new Date().toISOString(), taskId: existing?.taskId || voiceGenerateTaskId || undefined, status: existing?.status || (voiceIsAvailable ? 'ready' : 'processing') },
      meta
    );
    setVoices((prev) =>
      prev.map((x) =>
        x.voiceId === id
          ? {
              ...x,
              name: nm,
              profileImageUrl: voiceDetailsImageKey || undefined,
              isPublic: voiceDetailsIsPublic,
              tags,
              description: (voiceDetailsDescription || '').toString().trim() || undefined,
              singerSkillLevel: (voiceSkillLevel || '').toString().trim() || undefined,
            }
          : x
      )
    );
    try {
      const raw = localStorage.getItem('ramber.suno_voices_v1');
      const parsed = raw ? JSON.parse(raw) : null;
      const list = Array.isArray(parsed) ? parsed : [];
      const next = [
        {
          voiceId: id,
          name: nm,
          createdAt: new Date().toISOString(),
          taskId: existing?.taskId || voiceGenerateTaskId || undefined,
          status: existing?.status || (voiceIsAvailable ? 'ready' : 'processing'),
          profileImageUrl: voiceDetailsImageKey || undefined,
          isPublic: voiceDetailsIsPublic,
          tags,
          description: (voiceDetailsDescription || '').toString().trim() || undefined,
          singerSkillLevel: (voiceSkillLevel || '').toString().trim() || undefined,
        },
        ...list.filter((x: any) => String(x?.voiceId || x?.voice_id || '').trim() !== id),
      ].slice(0, 50);
      localStorage.setItem('ramber.suno_voices_v1', JSON.stringify(next));
    } catch {
    }
  };

  const deleteSunoVoice = async (voiceId: string) => {
    const id = (voiceId || '').toString().trim();
    if (!id) return;
    const ok = window.confirm('¿Eliminar esta voz?');
    if (!ok) return;
    const t = await getAccessToken();
    if (!t.ok) return;
    await fetch('/api/suno/voices', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
      body: JSON.stringify({ sunoVoiceId: id }),
    }).catch(() => {});
    setVoices((prev) => prev.filter((x) => x.voiceId !== id));
    if (selectedVoice?.voiceId === id) setSelectedVoice(null);
    try {
      const raw = localStorage.getItem('ramber.suno_voices_v1');
      const parsed = raw ? JSON.parse(raw) : null;
      const list = Array.isArray(parsed) ? parsed : [];
      const next = list.filter((x: any) => String(x?.voiceId || x?.voice_id || '').trim() !== id);
      localStorage.setItem('ramber.suno_voices_v1', JSON.stringify(next.slice(0, 50)));
    } catch {
    }
  };

  const uploadAudioForVoice = async (token: string, file: File) => {
    const name = (file?.name || 'audio').toString().trim() || 'audio';
    const ext = name.toLowerCase().split('.').pop() || '';
    const contentType =
      (file?.type || '').toString().trim() ||
      (ext === 'wav'
        ? 'audio/wav'
        : ext === 'ogg'
          ? 'audio/ogg'
          : ext === 'webm'
            ? 'audio/webm'
            : ext === 'aac'
              ? 'audio/aac'
              : ext === 'm4a' || ext === 'mp4'
                ? 'audio/mp4'
                : 'audio/mpeg');

    const readAsDataUrl = (f: File) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('No pude leer el archivo de audio'));
        reader.readAsDataURL(f);
      });

    const uploadInline = async () => {
      const arrayBuffer = await file.arrayBuffer();
      const fileArray = Array.from(new Uint8Array(arrayBuffer));
      const r = await fetch('/api/upload-audio', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: name, contentType, file: fileArray }),
      });
      const out = await r.json().catch(() => ({}));
      const url = (out?.url || '').toString().trim();
      const key = (out?.key || '').toString().trim();
      if (r.ok && out?.ok && url) return { url, key };
      throw new Error((out?.detail || out?.error || 'No pude subir el audio al servidor.').toString());
    };

    try {
      const prep = await fetch('/api/upload-audio', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: name, contentType }),
      });
      const prepOut = await prep.json().catch(() => ({}));
      
      if (prep.ok && prepOut?.ok) {
        const uploadUrl = (prepOut?.uploadUrl || '').toString().trim();
        const url = (prepOut?.url || '').toString().trim();
        if (uploadUrl) {
          const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'content-type': contentType }, body: file });
          if (!put.ok) throw new Error('Error en subida directa a R2');
        }
        const key = (prepOut?.key || '').toString().trim();
        return { url, key };
      }

      // Si el servidor dice que R2 no está listo o hay un error, usamos la subida inline (buffer)
      return await uploadInline();
    } catch (error) {
      console.log('Error en uploadAudioForVoice, intentando respaldo...', error);
      return await uploadInline();
    }
  };

  const getPublicAudioUrlForSuno = async (token: string, uploaded: { url: string; key?: string }) => {
    const direct = (uploaded?.url || '').toString().trim();
    return direct;
  };

  const sanitizeExternalUrl = (raw: string) => {
    const s = (raw || '').toString().trim();
    return s.replace(/^[`"' ]+/, '').replace(/[`"' ]+$/, '').trim();
  };

  const loadVoiceLibrary = async () => {
    setVoiceLibraryLoading(true);
    try {
      const t = await getAccessToken();
      if (!t.ok) throw new Error(t.error || 'No se pudo iniciar sesión.');
      const r = await fetch('/api/library/list?deleted=0', { headers: { authorization: `Bearer ${t.token}` } });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((out?.detail || out?.error || 'No pude cargar tu biblioteca.').toString());
      const rows = Array.isArray(out?.songs) ? out.songs : [];
      const mapped = rows
        .map((s: any) => ({
          id: String(s?.id || '').trim(),
          title: String(s?.title || '').trim() || 'Canción',
          audioUrl: String(s?.audio_url || s?.audioUrl || '').trim(),
        }))
        .filter((x: any) => x.id);
      setVoiceLibrarySongs(mapped);
    } finally {
      setVoiceLibraryLoading(false);
    }
  };

  const pickFromLibrary = async (songId: string) => {
    const sid = (songId || '').toString().trim();
    if (!sid) return;
    const r = await fetch(`/api/share/song/audio?id=${encodeURIComponent(sid)}&t=${Date.now()}`);
    if (!r.ok) throw new Error(`No pude descargar el audio de la biblioteca (HTTP ${r.status})`);
    const ct = (r.headers.get('content-type') || '').toString().trim();
    const ab = await r.arrayBuffer();
    const blob = new Blob([ab], { type: ct || 'audio/mpeg' });
    const ext = ct.includes('wav') ? 'wav' : ct.includes('ogg') ? 'ogg' : ct.includes('aac') ? 'aac' : ct.includes('mp4') ? 'm4a' : 'mp3';
    const name = `biblioteca_${sid}.${ext}`;
    return new File([blob], name, { type: ct || 'audio/mpeg' });
  };

  const generateValidationPhrase = async () => {
    if (voiceBusy) return;
    setVoiceCreateError('');
    if (!voiceConsent) {
      setVoiceCreateError('Marca la casilla de consentimiento para continuar.');
      return;
    }
    const name = (newVoiceName || '').toString().trim();
    if (!name) {
      setVoiceCreateError('Ponle un nombre a tu voz.');
      return;
    }
    if (!voiceSourceFile) {
      setVoiceCreateError('Selecciona un audio para crear la voz.');
      return;
    }
    const d = Number(voiceSourceDurationSec || 0);
    if (!Number.isFinite(d) || d <= 0) {
      setVoiceCreateError('No pude leer la duración del audio. Prueba con otro archivo.');
      return;
    }
    const trimmed = clampVoiceTrim(Number(voiceStartSec || 0), Number(voiceEndSec || voiceTrimMaxSec), d);
    const start = Math.max(0, Math.floor(Number(trimmed.start || 0)));
    const end = Math.max(0, Math.floor(Number(trimmed.end || 0)));
    if (end <= start) {
      setVoiceCreateError('El recorte es inválido. Ajusta el inicio y el final.');
      return;
    }

    setVoiceBusy(true);
    setVoiceCreateStep('generating_phrase');
    try {
      const t = await getAccessToken();
      if (!t.ok) throw new Error(t.error || 'No se pudo iniciar sesión.');

      const uploaded = await uploadAudioForVoice(t.token, voiceSourceFile);
      const voiceUrlForSuno = await getPublicAudioUrlForSuno(t.token, uploaded);
      const cleanVoiceUrl = sanitizeExternalUrl(voiceUrlForSuno || uploaded.url);
      const r = await fetch('/api/suno/voice-validate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
        body: JSON.stringify({ voiceUrl: cleanVoiceUrl, vocalStartS: start, vocalEndS: end, language: 'es' }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((out?.detail || out?.error || 'No pude iniciar la validación.').toString());
      const taskId = String(out?.taskId || '').trim();
      if (!taskId) throw new Error('No recibí taskId para la frase de validación.');
      setVoiceValidateTaskId(taskId);
      voiceValidateTaskIdRef.current = taskId;

      const startedAt = Date.now();
      while (Date.now() - startedAt < 3 * 60 * 1000) {
        await new Promise((r) => setTimeout(r, 2500));
        const qr = await fetch(`/api/suno/voice-validate-info?taskId=${encodeURIComponent(taskId)}`, {
          headers: { authorization: `Bearer ${t.token}` },
        });
        const qout = await qr.json().catch(() => ({}));
        if (!qr.ok) continue;
        const status = String(qout?.status || '').trim();
        const validateInfo = String(qout?.validateInfo || '').trim();
        if (status === 'wait_validating' && validateInfo) {
          setVoiceValidateInfo(validateInfo);
          setVoiceCreateStep('recording_verify');
          startVoiceRecorder('verify', 10).catch((e) => {
            setVoiceCreateError(e instanceof Error ? e.message : String(e));
            setVoiceCreateStep('phrase_ready');
          });
          return;
        }
        if (status === 'processing_validate_fail' || status === 'fail') {
          throw new Error(String(qout?.errorMessage || qout?.detail || qout?.error || 'No se pudo generar la frase de validación.').trim() || 'No se pudo generar la frase de validación.');
        }
      }
      throw new Error('La frase está tardando demasiado. Intenta de nuevo.');
    } catch (e) {
      setVoiceCreateError(e instanceof Error ? e.message : String(e));
      setVoiceCreateStep('segment');
    } finally {
      setVoiceBusy(false);
    }
  };

  const generateCustomVoice = async (verifyFileArg?: File) => {
    if (voiceBusy) return;
    setVoiceCreateError('');
    if (!voiceConsent) {
      setVoiceCreateError('Marca la casilla de consentimiento para continuar.');
      return;
    }
    const rawName = (newVoiceName || '').toString().trim();
    const defaultName = `Mi voz - ${new Date().toLocaleDateString('es-MX')}`.slice(0, 120);
    const name = (rawName || defaultName).toString().trim().slice(0, 120) || 'Mi voz';
    const validationTaskId = (voiceValidateTaskIdRef.current || voiceValidateTaskId || '').toString().trim();
    if (!validationTaskId) {
      setVoiceCreateError('Falta el taskId de validación. Regresa y genera la frase de validación otra vez.');
      setVoiceCreateStep('segment');
      return;
    }
    const verifyFile = verifyFileArg || voiceVerifyFile;
    if (!verifyFile) {
      setVoiceCreateError('Graba o sube la frase para validar.');
      return;
    }

    setVoiceBusy(true);
    setVoiceCreateStep('generating_voice');
    try {
      const t = await getAccessToken();
      if (!t.ok) throw new Error(t.error || 'No se pudo iniciar sesión.');

      const uploadedVerify = await uploadAudioForVoice(t.token, verifyFile);
      const verifyUrlForSuno = await getPublicAudioUrlForSuno(t.token, uploadedVerify);
      const cleanVerifyUrl = sanitizeExternalUrl(verifyUrlForSuno || uploadedVerify.url);
      const r = await fetch('/api/suno/voice-generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
        body: JSON.stringify({
          taskId: validationTaskId,
          verifyUrl: cleanVerifyUrl,
          voiceName: name,
        }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((out?.detail || out?.error || 'No pude iniciar la creación de voz.').toString());
      const genTaskId = String(out?.taskId || '').trim();
      if (!genTaskId) throw new Error('No recibí taskId de creación de voz.');
      setVoiceGenerateTaskId(genTaskId);

      let foundVoiceId = '';
      const startedAt = Date.now();
      while (Date.now() - startedAt < 25 * 60 * 1000) {
        await new Promise((r) => setTimeout(r, 4500));
        const qr = await fetch(`/api/suno/voice-record-info?taskId=${encodeURIComponent(genTaskId)}`, {
          headers: { authorization: `Bearer ${t.token}` },
        });
        const qout = await qr.json().catch(() => ({}));
        if (!qr.ok) continue;
        const status = String(qout?.status || '').trim();
        const voiceId = String(qout?.voiceId || '').trim();
        if (status === 'success' && voiceId) {
          foundVoiceId = voiceId;
          setVoiceGeneratedVoiceId(voiceId);
          break;
        }
        if (status === 'processing_validate_fail' || status === 'fail') {
          throw new Error(String(qout?.errorMessage || qout?.detail || qout?.error || 'La creación de voz falló.').trim() || 'La creación de voz falló.');
        }
      }

      const finalVoiceId = foundVoiceId || '';
      if (!finalVoiceId) {
        throw new Error('La voz está tardando demasiado. Intenta más tarde.');
      }

      let available: boolean | null = null;
      const availStarted = Date.now();
      while (Date.now() - availStarted < 3 * 60 * 1000) {
        const ar = await fetch('/api/suno/voice-check-voice', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
          body: JSON.stringify({ task_id: genTaskId }),
        });
        const aout = await ar.json().catch(() => ({}));
        if (ar.ok) {
          available = Boolean(aout?.isAvailable);
          if (available) break;
        }
        await new Promise((r) => setTimeout(r, 2500));
      }
      setVoiceIsAvailable(available);

      upsertLocalVoice({ voiceId: finalVoiceId, name, createdAt: new Date().toISOString(), taskId: genTaskId, status: available ? 'ready' : 'processing' });
      setSelectedVoice({ voiceId: finalVoiceId, name });
      setVoiceDetailsName(name);
      setVoiceDetailsTags('');
      setVoiceDetailsDescription('');
      setVoiceDetailsIsPublic(false);
      setVoiceDetailsImageKey('');
      setVoiceSkillLevel('');
      setVoiceCreateStep('skill');
    } catch (e) {
      setVoiceCreateError(e instanceof Error ? e.message : String(e));
      setVoiceCreateStep('pick_verify');
    } finally {
      setVoiceBusy(false);
    }
  };

  const transcribeLyricsFromAudio = async (auto?: boolean) => {
    if (!audioUploadUrl) {
      if (!auto) alert('Primero sube tu audio.');
      return;
    }
    if (isTranscribingAudioLyrics) return;
    setIsTranscribingAudioLyrics(true);
    if (auto) setAudioLyricsStatus('Transcribiendo letra…');
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        if (!auto) alert(t.error || 'No se pudo iniciar sesión.');
        if (auto) setAudioLyricsStatus('No pude transcribir la letra automáticamente.');
        return;
      }
      const guessMimeType = (u: string) => {
        const s = (u || '').toString().trim().toLowerCase();
        const q = s.split('?')[0].split('#')[0];
        if (q.endsWith('.mp3')) return 'audio/mpeg';
        if (q.endsWith('.wav')) return 'audio/wav';
        if (q.endsWith('.m4a')) return 'audio/mp4';
        if (q.endsWith('.mp4')) return 'audio/mp4';
        if (q.endsWith('.ogg')) return 'audio/ogg';
        if (q.endsWith('.webm')) return 'audio/webm';
        return '';
      };
      const byName = (audioFile?.name || '').toString().trim().toLowerCase();
      const mimeType = ((audioFile?.type || '').toString().trim() || (byName.endsWith('.mp3') ? 'audio/mpeg' : '') || guessMimeType(audioUploadUrl)).trim();
      const r = await fetch('/api/ai/transcribe-lyrics', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
        body: JSON.stringify({ uploadUrl: audioUploadUrl, mimeType }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok || out?.ok === false) {
        if (!auto) alert((out?.message || out?.detail || out?.error || 'No se pudo transcribir la letra.').toString());
        if (auto) setAudioLyricsStatus((out?.message || 'No pude transcribir la letra automáticamente.').toString());
        return;
      }
      const status = (out?.status || '').toString().trim().toUpperCase();
      if (status === 'ILEGIBLE' || status === 'SIN_LETRA') {
        if (!auto) alert((out?.message || 'No se pudo transcribir la letra.').toString());
        if (auto) setAudioLyricsStatus((out?.message || 'No pude transcribir la letra automáticamente.').toString());
        return;
      }
      const text = (out?.lyrics || '').toString().trim();
      if (!text) {
        if (!auto) alert('No detecté letra en ese audio.');
        if (auto) setAudioLyricsStatus('No pude detectar letra en ese audio.');
        return;
      }
      setLyrics(normalizeLyricsTags(text));
      if (auto) setAudioLyricsStatus('');
    } catch (e) {
      if (!auto) alert(e instanceof Error ? e.message : 'Error transcribiendo la letra.');
      if (auto) setAudioLyricsStatus('No pude transcribir la letra automáticamente.');
    } finally {
      setIsTranscribingAudioLyrics(false);
    }
  };

  const generateLyricsWithAI = async () => {
    if (isGeneratingLyrics) return;
    
    const topic = (lyrics || '').toString().trim() || description.trim() || instructions.trim();
    if (!topic) {
      alert('Escribe en el cuadro de Letras (o en Descripción/Instrucciones) de qué quieres que trate la canción.');
      return;
    }
    
    setIsGeneratingLyrics(true);
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        alert(t.error || 'No se pudo iniciar sesión.');
        return;
      }
      
      const response = await fetch('/api/ai/generate-lyrics', {
        method: 'POST',
        headers: { 
          'content-type': 'application/json', 
          authorization: `Bearer ${t.token}` 
        },
        body: JSON.stringify({ 
          topic: topic,
          gender: gender,
          style: instructions.trim() || 'General'
        }),
      });
      
      const result = await response.json().catch(() => ({}));
      
      if (!response.ok || result?.ok === false) {
        alert(result.error || result.message || 'No se pudo generar letras con IA.');
        return;
      }
      
      const nextLyrics = (result?.lyrics || '').toString().trim();
      if (nextLyrics) {
        setLyrics(normalizeLyricsTags(nextLyrics));
        return;
      }
      alert((result?.message || 'La IA no devolvió letra. Intenta con un tema más específico o espera unos minutos.').toString());
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error generando letras con IA.');
    } finally {
      setIsGeneratingLyrics(false);
    }
  };

  useEffect(() => {
    const readList = () => {
      try {
        const raw = window.localStorage.getItem(pendingListKey);
        const arr = raw ? JSON.parse(raw) : null;
        return Array.isArray(arr) ? arr : [];
      } catch {
        return [];
      }
    };
    const migrateLegacyIfNeeded = () => {
      try {
        const existing = readList();
        if (existing.length > 0) return existing;
        const legacyRaw = window.localStorage.getItem(pendingLegacyKey);
        if (!legacyRaw) return existing;
        const legacy = JSON.parse(legacyRaw);
        const taskId = typeof legacy?.taskId === 'string' ? legacy.taskId.trim() : '';
        if (!taskId) return existing;
        const kind = typeof legacy?.kind === 'string' ? legacy.kind.trim() : 'generate';
        const startedAt = Number(legacy?.startedAt || 0);
        const draft = legacy?.draft ?? null;
        const next = [{ taskId, kind, startedAt: Number.isFinite(startedAt) ? startedAt : Date.now(), draft }];
        window.localStorage.setItem(pendingListKey, JSON.stringify(next));
        window.localStorage.removeItem(pendingLegacyKey);
        return next;
      } catch {
        return readList();
      }
    };
    const tick = () => {
      const list = migrateLegacyIfNeeded();
      setHasPendingTask(Array.isArray(list) && list.length > 0);
    };
    tick();
    const id = window.setInterval(tick, 1500);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!audioUploadUrl) return;
    setUploadProgress(100);
  }, [audioUploadUrl]);

  useEffect(() => {
    if (!audioUploadUrl) return;
    const key = (audioUploadPath || audioUploadUrl).toString().trim();
    if (!key) return;
    if (lastTranscribedKeyRef.current === key) return;
    lastTranscribedKeyRef.current = key;
    transcribeLyricsFromAudio(true).catch(() => {});
  }, [audioUploadUrl, audioUploadPath]);

  useEffect(() => {
    if (!onSongCreated) return;
    if (!audioFile) return;
    if (!audioUploadUrl) return;
    const key = (audioUploadPath || audioUploadUrl).toString().trim();
    if (!key) return;
    if (savedUploadKey && savedUploadKey === key) return;
    try {
      const raw = window.localStorage.getItem(savedUploadsKey);
      const list = raw ? JSON.parse(raw) : [];
      const arr = Array.isArray(list) ? list : [];
      if (arr.includes(key)) {
        setSavedUploadKey(key);
        return;
      }
      const titleFromFile = (audioFile.name || 'Audio').toString().slice(0, 120);
      onSongCreated({
        id: `upload_${Date.now()}`,
        title: titleFromFile,
        description: 'Audio subido',
        lyrics: undefined,
        genre: gender,
        audioUrl: audioUploadUrl,
        coverUrl: makeAudioCoverSvgUrl(titleFromFile),
        sunoTaskId: null,
        sunoAudioId: null,
        isCover: false,
      });
      const next = [...arr, key].slice(-80);
      window.localStorage.setItem(savedUploadsKey, JSON.stringify(next));
      setSavedUploadKey(key);
    } catch {
    }
  }, [audioUploadUrl, audioUploadPath, audioFile, gender, onSongCreated, savedUploadKey]);

  const makeAudioCoverSvgUrl = (seed: string) => {
    const s = (seed || 'audio').toString().slice(0, 80);
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    const hue1 = h % 360;
    const hue2 = (hue1 + 50) % 360;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue1} 80% 55%)"/><stop offset="1" stop-color="hsl(${hue2} 80% 45%)"/></linearGradient></defs><rect width="512" height="512" rx="48" fill="url(#g)"/><rect x="0" y="0" width="512" height="512" rx="48" fill="rgba(0,0,0,0.25)"/><g fill="rgba(255,255,255,0.95)"><path d="M214 174c0-10 8-18 18-18h48c10 0 18 8 18 18v140c0 29-24 52-52 52s-52-23-52-52 24-52 52-52c12 0 23 4 32 10V174h-44v0z"/></g><text x="36" y="470" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="44" font-weight="800" fill="rgba(255,255,255,0.9)">RAMBER</text></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  };

  const getAudioDurationSeconds = (file: File) =>
    new Promise<number>((resolve) => {
      try {
        const url = URL.createObjectURL(file);
        const a = document.createElement('audio');
        a.preload = 'metadata';
        a.onloadedmetadata = () => {
          const d = Number(a.duration || 0);
          try {
            URL.revokeObjectURL(url);
          } catch {}
          resolve(Number.isFinite(d) ? d : 0);
        };
        a.onerror = () => {
          try {
            URL.revokeObjectURL(url);
          } catch {}
          resolve(0);
        };
        a.src = url;
      } catch {
        resolve(0);
      }
    });

  const uploadAudio = async (file: File) => {
    setAudioUploadError(null);
    setIsUploadingAudio(true);
    setAudioUploadUrl('');
    setAudioUploadPath('');
    setUploadProgress(0);
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        setAudioUploadError(t.error || 'No se pudo iniciar sesión.');
        alert(t.error || 'No se pudo iniciar sesión.');
        return;
      }

      const ua = (typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : '').toLowerCase();
      const isMobileUa = /android|iphone|ipad|ipod/.test(ua);
      const guessAudioContentType = (f: File) => {
        const ct = (f?.type || '').toString().trim();
        if (ct) return ct;
        const name = (f?.name || '').toString().toLowerCase();
        const ext = name.includes('.') ? name.split('.').pop() || '' : '';
        if (ext === 'wav') return 'audio/wav';
        if (ext === 'ogg' || ext === 'opus') return 'audio/ogg';
        if (ext === 'webm') return 'audio/webm';
        if (ext === 'aac') return 'audio/aac';
        if (ext === 'm4a' || ext === 'mp4') return 'audio/mp4';
        if (ext === '3gp' || ext === '3gpp') return 'audio/3gpp';
        if (ext === 'mp3' || ext === 'mpeg') return 'audio/mpeg';
        return 'audio/mpeg';
      };
      const contentType = guessAudioContentType(file);

      const uploadViaServer = async () => {
        const maxServerBytes = 12 * 1024 * 1024;
        if ((file?.size || 0) > maxServerBytes) {
          throw new Error(
            'Tu audio es muy pesado para subirlo por el servidor.\n\n' +
              'En celular normalmente se sube directo a Cloudflare R2, pero eso requiere CORS.\n' +
              'Si quieres, te paso los pasos para activar CORS en R2.'
          );
        }
        setUploadProgress((p) => (p > 0 ? p : 1));
        const base64Str = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error('No pude leer el audio.'));
          reader.onload = () => resolve((String(reader.result || '').split(',')[1] || '').trim());
          reader.readAsDataURL(file);
        });
        if (!base64Str) throw new Error('No pude leer el audio.');
        setUploadProgress((p) => Math.max(p, 8));
        const resp = await fetch('/api/upload-audio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', authorization: `Bearer ${t.token}` },
          body: JSON.stringify({ title: file.name, contentType, file: base64Str }),
        });
        const raw = await resp.text().catch(() => '');
        let out: any = {};
        try {
          out = raw ? JSON.parse(raw) : {};
        } catch {
          out = { error: raw || 'Respuesta inválida del servidor.' };
        }
        if (!resp.ok || out?.ok === false) {
          throw new Error((out?.message || out?.error || 'No pude subir el audio.').toString());
        }
        const url = (out?.url || '').toString().trim();
        const key = (out?.key || '').toString().trim();
        if (!url) throw new Error((out?.error || 'No pude terminar la subida del audio.').toString());
        return { url, key };
      };

      if (isMobileUa) {
        try {
          const uploaded = await uploadViaServer();
          setAudioUploadUrl(uploaded.url);
          setAudioUploadPath(uploaded.key);
          setAudioFile(file);
          setExternalAudioLabel('');
          setUploadProgress(100);
          return;
        } catch {
        }
      }
      
      const response = await fetch('/api/upload-audio', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'authorization': `Bearer ${t.token}`,
        },
        body: JSON.stringify({
          title: file.name,
          contentType,
        }),
      });
      
      const raw = await response.text().catch(() => '');
      let result: any = {};
      try {
        result = raw ? JSON.parse(raw) : {};
      } catch {
        result = { error: raw || 'Respuesta inválida del servidor.' };
      }

      if (!response.ok) {
        setAudioUploadError(result.error || 'No se pudo subir el audio.');
        alert(result.error || 'No se pudo subir el audio.');
        return;
      }

      const uploadUrl = (result?.uploadUrl || '').toString().trim();
      const url = (result?.url || '').toString().trim();
      const key = (result?.key || '').toString().trim();
      const via = (result?.via || '').toString().trim();
      if (via === 'server' && url && key) {
        setAudioUploadUrl(url);
        setAudioUploadPath(key);
        setAudioFile(file);
        setExternalAudioLabel('');
        setUploadProgress(100);
        return;
      }

      if (!uploadUrl || !url || !key) {
        const msg = (result?.error || 'No recibí URLs para subir el audio.').toString();
        setAudioUploadError(msg);
        alert(msg);
        return;
      }
      
      try {
        await new Promise<void>((resolve, reject) => {
          try {
            const xhr = new XMLHttpRequest();
            uploadXhrRef.current = xhr;
            xhr.open('PUT', uploadUrl);
            xhr.setRequestHeader('Content-Type', contentType);
            xhr.upload.onprogress = (e) => {
              if (!e.lengthComputable) return;
              const pct = Math.max(0, Math.min(100, Math.round((e.loaded / e.total) * 100)));
              setUploadProgress(pct);
            };
            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) return resolve();
              return reject(new Error(`No se pudo subir el audio (HTTP ${xhr.status}).`));
            };
            xhr.onerror = () => reject(new Error('No se pudo subir el audio.'));
            xhr.onabort = () => reject(new Error('Subida cancelada.'));
            xhr.send(file);
          } catch (e) {
            reject(e instanceof Error ? e : new Error('No se pudo subir el audio.'));
          }
        });
      } catch (putErr) {
        try {
          const uploaded = await uploadViaServer();
          setAudioUploadUrl(uploaded.url);
          setAudioUploadPath(uploaded.key);
          setAudioFile(file);
          setExternalAudioLabel('');
          setUploadProgress(100);
          return;
        } catch (serverErr) {
          const msg = (serverErr instanceof Error ? serverErr.message : '') || (putErr instanceof Error ? putErr.message : 'No se pudo subir el audio.');
          setAudioUploadError(msg);
          alert(msg);
          return;
        }
      }

      setAudioUploadUrl(url);
      setAudioUploadPath(key);
      setAudioFile(file);
      setExternalAudioLabel('');
      setUploadProgress(100);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo subir el audio.';
      setAudioUploadError(msg);
      alert(msg);
    } finally {
      setIsUploadingAudio(false);
    }
  };

  const pickAudio = async (file: File) => {
    const now = Date.now();
    setAudioJustPickedAt(now);
    window.setTimeout(() => {
      setAudioJustPickedAt((v) => (v === now ? 0 : v));
    }, 900);
    setAudioFile(file);
    setAudioUploadUrl('');
    setAudioAction('cover');
    setUploadProgress(0);
    setIsAudioModalOpen(true);
    setAudioUploadError(null);
    getAudioDurationSeconds(file).then((d) => setAudioDurationSec(d)).catch(() => {});
    uploadAudio(file).catch(() => {});
  };

  const stopStudioRecorder = async (finalize: boolean) => {
    try {
      if (studioRecorderStopFallbackTimerRef.current) window.clearTimeout(studioRecorderStopFallbackTimerRef.current);
    } catch {
    }
    studioRecorderStopFallbackTimerRef.current = null;

    try {
      if (studioRecorderTimerRef.current) window.clearInterval(studioRecorderTimerRef.current);
    } catch {
    }
    studioRecorderTimerRef.current = null;

    try {
      if (studioRecorderBarsTimerRef.current) window.clearInterval(studioRecorderBarsTimerRef.current);
    } catch {
    }
    studioRecorderBarsTimerRef.current = null;

    try {
      studioRecorderAnalyserRef.current = null;
      const ctx = studioRecorderAudioCtxRef.current;
      studioRecorderAudioCtxRef.current = null;
      try {
        await ctx?.close?.();
      } catch {
      }
    } catch {
    }

    const mr = studioRecorderRef.current;
    const stream = studioRecorderStreamRef.current;

    if (finalize) {
      const finalizeId = Date.now();
      studioRecorderFinalizeIdRef.current = finalizeId;
      studioRecorderStopRequestedAtRef.current = Date.now();
      try {
        if (studioRecorderStopFallbackTimerRef.current) window.clearTimeout(studioRecorderStopFallbackTimerRef.current);
      } catch {
      }
      studioRecorderStopFallbackTimerRef.current = window.setTimeout(() => {
        if (studioRecorderFinalizeIdRef.current !== finalizeId) return;
        if (studioRecorderStateRef.current !== 'stopping') return;
        const chunksNow = Array.isArray(studioRecorderChunksRef.current) ? studioRecorderChunksRef.current.slice() : [];
        if (chunksNow.length === 0) {
          setStudioRecorderError('No se pudo guardar la grabación. Usa “Grabación alternativa” o prueba de nuevo.');
          setStudioRecorderState('idle');
          studioRecorderStateRef.current = 'idle';
          stopStudioRecorder(false).catch(() => {});
          return;
        }
        try {
          const ct = (mr?.mimeType || chunksNow[0]?.type || 'audio/webm').toLowerCase();
          const blob = new Blob(chunksNow, { type: ct || 'audio/webm' });
          if (!blob.size || blob.size < 1024) {
            setStudioRecorderError('No se grabó audio. Intenta de nuevo y asegúrate de permitir el micrófono.');
            setStudioRecorderState('idle');
            studioRecorderStateRef.current = 'idle';
            stopStudioRecorder(false).catch(() => {});
            return;
          }
          const ext = ct.includes('mp4') ? 'm4a' : ct.includes('ogg') ? 'ogg' : ct.includes('webm') ? 'webm' : 'webm';
          const name = `grabacion_${Date.now()}.${ext}`;
          let file: File;
          try {
            file = new File([blob], name, { type: blob.type || 'audio/webm' });
          } catch {
            const b: any = blob;
            b.name = name;
            b.lastModified = Date.now();
            file = b as File;
          }
          setStudioRecorderState('idle');
          studioRecorderStateRef.current = 'idle';
          setStudioRecorderOpen(false);
          stopStudioRecorder(false).catch(() => {});
          window.setTimeout(() => pickAudio(file).catch(() => {}), 180);
        } catch {
          setStudioRecorderError('No se pudo guardar la grabación. Usa “Grabación alternativa” o sube un archivo.');
          setStudioRecorderState('idle');
          studioRecorderStateRef.current = 'idle';
          stopStudioRecorder(false).catch(() => {});
        }
      }, 3500);
      if (mr && mr.state !== 'inactive') {
        try {
          (mr as any).requestData?.();
        } catch {
        }
        try {
          mr.stop();
        } catch {
        }
      }
      return;
    }

    studioRecorderRef.current = null;
    studioRecorderStreamRef.current = null;
    studioRecorderStartedAtRef.current = null;

    try {
      stream?.getTracks?.().forEach((t) => {
        try {
          t.stop();
        } catch {
        }
      });
    } catch {
    }
  };

  useEffect(() => {
    return () => {
      stopStudioRecorder(false).catch(() => {});
    };
  }, []);

  const startStudioRecorder = async () => {
    setStudioRecorderError('');
    const navAny = navigator as any;
    const ua = (typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : '').toLowerCase();
    const isMobileUa = /android|iphone|ipad|ipod/.test(ua);
    const canMedia =
      typeof window !== 'undefined' &&
      typeof navAny?.mediaDevices?.getUserMedia === 'function' &&
      typeof (window as any).MediaRecorder === 'function';

    if (!canMedia || isMobileUa) {
      audioCaptureInputRef.current?.click?.();
      return;
    }

    try {
      await stopStudioRecorder(false);
      setStudioRecorderElapsedMs(0);
      studioRecorderElapsedMsRef.current = 0;
      studioRecorderStopRequestedAtRef.current = 0;
      studioRecorderLastChunkAtRef.current = 0;
      studioRecorderFinalizeIdRef.current = 0;
      try {
        if (studioRecorderStopFallbackTimerRef.current) window.clearTimeout(studioRecorderStopFallbackTimerRef.current);
      } catch {
      }
      studioRecorderStopFallbackTimerRef.current = null;
      setStudioRecorderBars([]);
      setStudioRecorderState('idle');
      studioRecorderStateRef.current = 'idle';
      setStudioRecorderOpen(true);

      const stream = await navAny.mediaDevices.getUserMedia({ audio: true });
      studioRecorderStreamRef.current = stream;
      studioRecorderChunksRef.current = [];

      try {
        const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (typeof AC === 'function') {
          const ctx: AudioContext = new AC();
          studioRecorderAudioCtxRef.current = ctx;
          const src = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.7;
          src.connect(analyser);
          studioRecorderAnalyserRef.current = analyser;

          const freq = new Uint8Array(analyser.frequencyBinCount);
          const barsCount = 48;
          studioRecorderBarsTimerRef.current = window.setInterval(() => {
            const a = studioRecorderAnalyserRef.current;
            if (!a) return;
            a.getByteFrequencyData(freq);
            const binSize = Math.max(1, Math.floor(freq.length / barsCount));
            const next: number[] = [];
            for (let i = 0; i < barsCount; i++) {
              let sum = 0;
              const start = i * binSize;
              const end = Math.min(freq.length, start + binSize);
              for (let j = start; j < end; j++) sum += freq[j] || 0;
              const avg = sum / Math.max(1, end - start);
              const h = Math.max(6, Math.min(100, Math.round((avg / 255) * 100)));
              next.push(h);
            }
            setStudioRecorderBars(next);
          }, 80);
        }
      } catch {
      }

      const MR = (window as any).MediaRecorder as typeof MediaRecorder;
      const pickMime = () => {
        const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4'];
        for (const t of types) {
          try {
            if (MR.isTypeSupported(t)) return t;
          } catch {
          }
        }
        return '';
      };
      const mimeType = pickMime();
      const mr = mimeType ? new MR(stream, { mimeType }) : new MR(stream);
      studioRecorderRef.current = mr;

      mr.ondataavailable = (e: BlobEvent) => {
        const b = e.data;
        if (!b) return;
        if (!b.size) return;
        studioRecorderChunksRef.current.push(b);
        studioRecorderLastChunkAtRef.current = Date.now();
      };

      mr.onstop = () => {
        const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
        const run = async () => {
          try {
            if (studioRecorderStopFallbackTimerRef.current) window.clearTimeout(studioRecorderStopFallbackTimerRef.current);
          } catch {
          }
          studioRecorderStopFallbackTimerRef.current = null;
          const stopRequestedAt = Number(studioRecorderStopRequestedAtRef.current || 0) || Date.now();
          const deadline = Date.now() + 1500;
          while (Date.now() < deadline) {
            const chunksNow = Array.isArray(studioRecorderChunksRef.current) ? studioRecorderChunksRef.current.length : 0;
            const lastAt = Number(studioRecorderLastChunkAtRef.current || 0) || 0;
            if (chunksNow > 0 && lastAt && Date.now() - lastAt > 180) break;
            if (chunksNow === 0) {
              if (Date.now() - stopRequestedAt > 900) break;
            } else {
              if (Date.now() - stopRequestedAt > 1200) break;
            }
            await sleep(80);
          }

          const chunks = Array.isArray(studioRecorderChunksRef.current) ? studioRecorderChunksRef.current.slice() : [];
          studioRecorderChunksRef.current = [];
          const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
          if (!blob.size || blob.size < 1024) {
            setStudioRecorderError('No se grabó audio. Intenta de nuevo y asegúrate de permitir el micrófono.');
            setStudioRecorderState('idle');
            studioRecorderStateRef.current = 'idle';
            stopStudioRecorder(false).catch(() => {});
            return;
          }

          const ct = (blob.type || mr.mimeType || 'audio/webm').toLowerCase();
          const ext = ct.includes('mp4') ? 'm4a' : ct.includes('ogg') ? 'ogg' : ct.includes('webm') ? 'webm' : 'webm';
          const name = `grabacion_${Date.now()}.${ext}`;
          let file: File;
          try {
            file = new File([blob], name, { type: blob.type || 'audio/webm' });
          } catch {
            const b: any = blob;
            b.name = name;
            b.lastModified = Date.now();
            file = b as File;
          }
          setStudioRecorderState('idle');
          studioRecorderStateRef.current = 'idle';
          setStudioRecorderOpen(false);
          stopStudioRecorder(false).catch(() => {});
          window.setTimeout(() => pickAudio(file).catch(() => {}), 180);
        };
        run().catch(() => {
          setStudioRecorderError('No se pudo guardar la grabación. Usa “Grabación alternativa” o sube un archivo.');
          setStudioRecorderState('idle');
          studioRecorderStateRef.current = 'idle';
          stopStudioRecorder(false).catch(() => {});
        });
      };

      mr.onerror = () => {
        setStudioRecorderError('Falló la grabación. Intenta de nuevo o sube un archivo.');
      };

      setStudioRecorderState('recording');
      studioRecorderStateRef.current = 'recording';
      studioRecorderStartedAtRef.current = Date.now();
      try {
        mr.start(1000);
      } catch {
        mr.start();
      }

      const startedAt = Date.now();
      studioRecorderTimerRef.current = window.setInterval(() => {
        const elapsed = Date.now() - startedAt;
        setStudioRecorderElapsedMs(elapsed);
        studioRecorderElapsedMsRef.current = elapsed;
      }, 200);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStudioRecorderError(msg || 'No pude acceder al micrófono.');
      setStudioRecorderState('idle');
      studioRecorderStateRef.current = 'idle';
      try {
        await stopStudioRecorder(false);
      } catch {
      }
    }
  };

  const saveUploadedAudioToLibrary = async () => {
    if (!onSongCreated) return;
    if (!audioFile) return;
    if (!audioUploadUrl) {
      alert('Todavía se está subiendo el audio. Espera un momento.');
      return;
    }
    const titleFromFile = (audioFile.name || 'Audio').toString().slice(0, 120);
    onSongCreated({
      id: `upload_${Date.now()}`,
      title: titleFromFile,
      description: (instructions || 'Audio subido').toString().slice(0, 2000),
      lyrics: lyrics || undefined,
      genre: gender,
      audioUrl: audioUploadUrl,
      coverUrl: makeAudioCoverSvgUrl(titleFromFile),
      sunoTaskId: null,
      sunoAudioId: null,
      isCover: false,
    });
    clearAudio();
    onGoLibrary?.();
  };

  const continueFromAudio = async () => {
    if (audioAction === 'library') return saveUploadedAudioToLibrary();
    setIsAudioModalOpen(false);
  };

  const openMp3Converter = () => {
    const url = 'https://cloudconvert.com/mp3-converter';
    try {
      const w = window.open(url, '_blank', 'noopener,noreferrer');
      if (w) {
        try {
          (w as any).opener = null;
        } catch {}
        return;
      }
    } catch {}
    try {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    } catch {}
    try {
      window.location.href = url;
    } catch {}
  };

  const openMp3ConverterAlt = () => {
    const url = 'https://online-audio-converter.com/sp/';
    try {
      const w = window.open(url, '_blank', 'noopener,noreferrer');
      if (w) {
        try {
          (w as any).opener = null;
        } catch {}
        return;
      }
    } catch {}
    try {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    } catch {}
    try {
      window.location.href = url;
    } catch {}
  };

  const handleAddVocalsFromAudio = async () => {
    if (!onSongCreated) return;
    if (!audioUploadUrl) {
      alert('Primero sube tu audio.');
      return;
    }
    const baseLyrics = normalizeLyricsTags(stripTitleFromLyrics(title, (lyrics || '').toString()));
    const prompt = (baseLyrics || description || ' ').trim();
    if (!prompt) {
      alert('Escribe una descripción o letras para guiar las voces.');
      return;
    }
    const style = (instructions || 'General').trim() || 'General';
    const titleFromFile = (audioFile?.name || title || 'Clonador de Voz').toString().slice(0, 100);
    setIsSubmitting(true);
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        alert(t.error || 'No se pudo iniciar sesión.');
        return;
      }

      const payload: any = {
        uploadUrl: audioUploadUrl,
        uploadBucket: audioUploadPath ? 'ramber-tunes' : undefined,
        uploadPath: audioUploadPath || undefined,
        prompt,
        style,
        title: titleFromFile,
        negativeTags: 'None',
        vocalGender: gender === 'Femenino' ? 'f' : gender === 'Masculino' ? 'm' : undefined,
        model,
        weirdnessConstraint: weirdness / 100,
        styleWeight: styleInfluence / 100,
        audioWeight: audioInfluence / 100,
      };

      const r = await fetch('/api/suno/add-vocals', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${t.token}`,
        },
        body: JSON.stringify(payload),
      });

      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(toUserFriendlySunoError(out, 'No se pudo agregar voces.'));
        return;
      }

      const taskId = (out?.taskId || '').toString();
      if (!taskId) {
        alert('No recibí taskId del proveedor.');
        return;
      }

      const pendingRaw = window.localStorage.getItem(pendingListKey);
      const pending = (() => {
        try {
          return JSON.parse(pendingRaw || '[]');
        } catch {
          return [];
        }
      })();
      const next = Array.isArray(pending) ? pending : [];
      next.push({
        taskId,
        kind: 'add-vocals',
        startedAt: Date.now(),
        draft: {
          title: titleFromFile,
          description: style,
          lyrics: prompt,
          genre: gender,
          isCover: false,
        },
      });
      window.localStorage.setItem(pendingListKey, JSON.stringify(next.slice(-10)));

      setIsAudioModalOpen(false);
      onGoLibrary?.();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBoostStyle = async () => {
    const content = (instructions || '').trim();
    if (!content) {
      alert('Escribe algo en "Instrucciones" primero.');
      return;
    }
    setIsBoostingStyle(true);
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        alert(t.error || 'No se pudo iniciar sesión.');
        return;
      }
      const r = await fetch('/api/suno/boost-style', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
        body: JSON.stringify({ content }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert((out?.detail || out?.error || 'No se pudo optimizar el estilo.').toString());
        return;
      }
      const result = (out?.result || out?.data?.result || '').toString().trim();
      if (!result) {
        alert('No recibí resultado del estilo.');
        return;
      }
      setInstructions(result);
    } finally {
      setIsBoostingStyle(false);
    }
  };

  const handleAddInstrumentalFromAudio = async () => {
    if (!onSongCreated) return;
    if (!audioUploadUrl) {
      alert('Primero sube tu audio.');
      return;
    }
    setIsSubmitting(true);
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        alert(t.error || 'No se pudo iniciar sesión.');
        return;
      }

      const titleFromFile = (audioFile?.name || title || 'Instrumental').toString().slice(0, 100);
      const tags = (instructions || 'Instrumental').trim() || 'Instrumental';
      const payload: any = {
        uploadUrl: audioUploadUrl,
        uploadBucket: audioUploadPath ? 'ramber-tunes' : undefined,
        uploadPath: audioUploadPath || undefined,
        title: titleFromFile,
        tags,
        negativeTags: 'None',
        vocalGender: gender === 'Femenino' ? 'f' : gender === 'Masculino' ? 'm' : undefined,
        model,
        weirdnessConstraint: weirdness / 100,
        styleWeight: styleInfluence / 100,
        audioWeight: audioInfluence / 100,
      };

      const r = await fetch('/api/suno/add-instrumental', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${t.token}`,
        },
        body: JSON.stringify(payload),
      });

      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(toUserFriendlySunoError(out, 'No se pudo generar el instrumental.'));
        return;
      }

      const taskId = (out?.taskId || '').toString();
      if (!taskId) {
        alert('No recibí taskId del proveedor.');
        return;
      }

      const pendingRaw = window.localStorage.getItem(pendingListKey);
      const pending = (() => {
        try {
          return JSON.parse(pendingRaw || '[]');
        } catch {
          return [];
        }
      })();
      const next = Array.isArray(pending) ? pending : [];
      next.push({
        taskId,
        kind: 'add-instrumental',
        startedAt: Date.now(),
        draft: {
          title: titleFromFile,
          description: tags,
          lyrics: tags,
          prompt: tags,
          genre: gender,
          isCover: false,
        },
      });
      window.localStorage.setItem(pendingListKey, JSON.stringify(next.slice(-10)));

      setIsAudioModalOpen(false);
      onGoLibrary?.();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCoverFromAudio = async () => {
    if (!onSongCreated) return;
    if (!audioUploadUrl) {
      alert('Primero sube tu audio.');
      return;
    }
    const dur = Number(audioDurationSec || 0);
    if (Number.isFinite(dur) && dur > 0) {
      if (dur > 60 * 8) {
        alert('Tu audio dura más de 8 minutos. El cover solo permite hasta 8 minutos.');
        return;
      }
      if (model === 'V4_5ALL' && dur > 60) {
        alert('Con el modelo V4.5 ALL el audio debe durar máximo 1 minuto. Cambia de modelo o usa un audio más corto.');
        return;
      }
    }
    setIsSubmitting(true);
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        alert(t.error || 'No se pudo iniciar sesión.');
        return;
      }

      const baseLyrics = normalizeLyricsTags(stripTitleFromLyrics(title, (lyrics || '').toString()));
      const promptRaw = (baseLyrics || description || '').trim();
      const prompt = promptRaw || ' ';
      const hasSelectedVoice = Boolean((selectedVoice?.voiceId || '').toString().trim());
      const payload: any = {
        uploadUrl: audioUploadUrl,
        uploadBucket: audioUploadPath ? 'ramber-tunes' : undefined,
        uploadPath: audioUploadPath || undefined,
        instrumental,
        prompt,
        style: (instructions || 'General').trim(),
        title: (title || 'Cover').trim(),
        model: hasSelectedVoice ? 'V5' : model,
        weirdnessConstraint: weirdness / 100,
        styleWeight: styleInfluence / 100,
        audioWeight: audioInfluence / 100,
      };
      if (hasSelectedVoice) {
        payload.personaId = (selectedVoice?.voiceId || '').toString().trim();
        payload.personaModel = 'voice_persona';
      }

      const r = await fetch('/api/suno/upload-cover', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${t.token}`,
        },
        body: JSON.stringify(payload),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(toUserFriendlySunoError(out, 'No se pudo hacer el cover.'));
        return;
      }
      const taskId = typeof out?.taskId === 'string' ? out.taskId : '';
      if (!taskId) {
        alert('No recibí taskId del servidor.');
        return;
      }
      try {
        const raw = window.localStorage.getItem(pendingListKey);
        const arr = raw ? JSON.parse(raw) : [];
        const list = Array.isArray(arr) ? arr : [];
        list.push({
          taskId,
          kind: 'upload-cover',
          startedAt: Date.now(),
          draft: {
            title: (title || 'Cover').toString(),
            description: (instructions || 'Cover').toString(),
            lyrics: promptRaw ? promptRaw : null,
            prompt: promptRaw ? promptRaw : null,
            genre: gender,
            isCover: true,
          },
        });
        window.localStorage.setItem(pendingListKey, JSON.stringify(list));
        try {
          window.localStorage.removeItem(pendingLegacyKey);
        } catch {
        }
      } catch {
      }
      onGoLibrary?.();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error haciendo cover');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreate = async () => {
    if (!onSongCreated) return;

    if (audioUploadUrl) {
      if (audioAction === 'cover') return handleCoverFromAudio();
      if (audioAction === 'instrumental') return handleAddInstrumentalFromAudio();
      if (audioAction === 'vocals') return handleAddVocalsFromAudio();
      if (audioAction === 'extend') {
        alert('Extender: Próximamente');
        return;
      }
    }

    const baseLyrics = instrumental ? '' : normalizeLyricsTags(stripTitleFromLyrics(title, (lyrics || '').toString()));
    const prompt = (mode === 'simple' ? description : (baseLyrics || description)).trim();
    if (!prompt) {
      alert('Escribe una descripción o letra para crear la canción.');
      return;
    }

    setIsSubmitting(true);
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        alert(t.error || 'No se pudo iniciar sesión.');
        return;
      }

      const hasSelectedVoice = Boolean((selectedVoice?.voiceId || '').toString().trim());
      const wantsCustomMode = mode === 'personalizado' || hasSelectedVoice;
      const payload: any = {
        prompt,
        instrumental,
        customMode: wantsCustomMode,
        model: hasSelectedVoice ? 'V5' : model,
      };
      if (wantsCustomMode) {
        payload.style = (instructions || 'General').trim() || 'General';
        payload.title = (title || 'Nueva Canción').trim() || 'Nueva Canción';
        payload.weirdnessConstraint = weirdness / 100;
        payload.styleWeight = styleInfluence / 100;
        payload.audioWeight = audioInfluence / 100;
      }
      if (hasSelectedVoice) {
        payload.personaId = (selectedVoice?.voiceId || '').toString().trim();
        payload.personaModel = 'voice_persona';
      }

      const r = await fetch('/api/suno/generate', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${t.token}`,
        },
        body: JSON.stringify(payload),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(toUserFriendlySunoError(out, 'No se pudo crear la canción.'));
        return;
      }

      const taskId = typeof out?.taskId === 'string' ? out.taskId : '';
      if (!taskId) {
        alert('No recibí taskId del servidor.');
        return;
      }
      try {
        const raw = window.localStorage.getItem(pendingListKey);
        const arr = raw ? JSON.parse(raw) : [];
        const list = Array.isArray(arr) ? arr : [];
        list.push({
          taskId,
          kind: 'generate',
          startedAt: Date.now(),
          draft: {
            title: (title || 'Nueva Canción').toString(),
            description: (mode === 'simple' ? description : instructions).toString(),
            lyrics: (baseLyrics || '').toString().trim() ? (baseLyrics || '').toString() : null,
            prompt: prompt,
            genre: gender,
            isCover: Boolean(audioFile || audioUploadUrl),
          },
        });
        window.localStorage.setItem(pendingListKey, JSON.stringify(list));
        try {
          window.localStorage.removeItem(pendingLegacyKey);
        } catch {
        }
      } catch {
      }
      onGoLibrary?.();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error creando la canción');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className={cn(
        "flex-1 flex flex-col relative",
        standaloneVoices ? "overflow-hidden w-full bg-[#030303] text-white" : "overflow-y-auto"
      )}
    >
      {standaloneVoices ? (
        <div className="p-4 border-b border-white/10 flex items-center gap-3">
          <button
            type="button"
            onClick={() => onExitVoices?.()}
            className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200 hover:bg-white/10 transition-colors"
          >
            <ChevronDown className="w-6 h-6 rotate-90" />
          </button>
          <div className="text-white font-extrabold text-lg">Clonador de Voz</div>
        </div>
      ) : null}

      {!standaloneVoices && (
        <>
      {/* Top Header Tabs */}
      <div className="flex items-center justify-between px-4 mt-4 mb-4">
        <div className="flex bg-white/5 rounded-full p-1 border border-white/5">
          <button 
            onClick={() => setMode('simple')}
            className={cn(
              "px-5 py-1.5 rounded-full text-sm font-semibold transition-colors",
              mode === 'simple' ? "bg-white text-black" : "text-slate-300 hover:text-white"
            )}
          >
            Simple
          </button>
          <button 
            onClick={() => setMode('personalizado')}
            className={cn(
              "px-5 py-1.5 rounded-full text-sm font-semibold transition-colors",
              mode === 'personalizado' ? "bg-white text-black" : "text-slate-300 hover:text-white"
            )}
          >
            Personalizado
          </button>
        </div>
        
        <div className="relative">
          <div className="border border-white/20 hover:border-white/40 block rounded-full px-3 py-1.5 hover:bg-white/5 transition-colors md:hidden">
            <div className="flex items-center gap-2">
              <select
                value={model}
                onChange={(e) => {
                  const v = e.target.value as any;
                  setModel(v);
                }}
                style={{ colorScheme: 'dark' }}
                className="bg-transparent text-xs font-semibold text-slate-200 outline-none appearance-none pr-4"
              >
                <option value="V5_5" className="bg-[#0b0f16] text-slate-200">V5.5</option>
                <option value="V5" className="bg-[#0b0f16] text-slate-200">V5</option>
                <option value="V4_5PLUS" className="bg-[#0b0f16] text-slate-200">V4.5+</option>
                <option value="V4_5ALL" className="bg-[#0b0f16] text-slate-200">V4.5 All</option>
                <option value="V4_5" className="bg-[#0b0f16] text-slate-200">V4.5</option>
                <option value="V4" className="bg-[#0b0f16] text-slate-200">V4</option>
              </select>
              <ChevronDown className="w-4 h-4 text-slate-200 -ml-3 pointer-events-none" />
            </div>
          </div>

          <button
            ref={modelBtnRef}
            type="button"
            onClick={() => setIsModelMenuOpen((v) => !v)}
            className="hidden md:flex items-center gap-2 border border-white/20 hover:border-white/40 rounded-full px-3 py-1.5 hover:bg-white/5 transition-colors"
          >
            <span className="text-xs font-semibold text-slate-200">{model === 'V5_5' ? 'V5.5' : model === 'V4_5PLUS' ? 'V4.5+' : model === 'V4_5ALL' ? 'V4.5 All' : model === 'V4_5' ? 'V4.5' : model}</span>
            <ChevronDown className={cn("w-4 h-4 text-slate-200 transition-transform", isModelMenuOpen ? "rotate-180" : "rotate-0")} />
          </button>

          {isModelMenuOpen && (
            <div
              ref={modelMenuRef}
              className="hidden md:block absolute right-0 mt-2 w-[160px] bg-[#0b0f16] border border-white/10 rounded-2xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.55)] z-[90]"
            >
              {[
                { value: 'V5_5', label: 'V5.5' },
                { value: 'V5', label: 'V5' },
                { value: 'V4_5PLUS', label: 'V4.5+' },
                { value: 'V4_5ALL', label: 'V4.5 All' },
                { value: 'V4_5', label: 'V4.5' },
                { value: 'V4', label: 'V4' },
              ].map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => {
                    setModel(m.value as any);
                    setIsModelMenuOpen(false);
                  }}
                  className={cn(
                    "w-full text-left px-4 py-3 text-sm hover:bg-white/5 transition-colors",
                    model === (m.value as any) ? "text-emerald-300" : "text-slate-200"
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="px-4 space-y-4 pb-[220px] md:pb-32">
        {mode === 'simple' ? (
          <SimpleForm instrumental={instrumental} setInstrumental={setInstrumental} description={description} setDescription={setDescription} isDev={isDev} />
        ) : (
          <CustomForm 
            instrumental={instrumental} 
            setInstrumental={setInstrumental}
            description={description}
            lyrics={lyrics}
            setLyrics={setLyrics}
            gender={gender}
            setGender={setGender}
            title={title}
            setTitle={setTitle}
            instructions={instructions}
            setInstructions={setInstructions}
            isBoostingStyle={isBoostingStyle}
            onBoostStyle={handleBoostStyle}
            showMoreOptions={showMoreOptions}
            setShowMoreOptions={setShowMoreOptions}
            weirdness={weirdness}
            setWeirdness={setWeirdness}
            styleInfluence={styleInfluence}
            setStyleInfluence={setStyleInfluence}
            audioInfluence={audioInfluence}
            setAudioInfluence={setAudioInfluence}
            audioAction={audioAction}
            audioFile={audioFile}
            setAudioFile={setAudioFile}
            audioInputRef={audioInputRef}
            audioCaptureInputRef={audioCaptureInputRef}
            audioUploadUrl={audioUploadUrl}
            externalAudioLabel={externalAudioLabel}
            audioLyricsStatus={audioLyricsStatus}
            isUploadingAudio={isUploadingAudio}
            onUploadAudio={uploadAudio}
            onClearAudio={clearAudio}
            onCoverFromAudio={handleCoverFromAudio}
            onOpenBalance={onOpenBalance}
            credits={credits}
            onOpenPersonaPicker={() => setIsVoicesPickerOpen(true)}
            onPickAudio={pickAudio}
            uploadProgress={uploadProgress}
            onOpenAudioModal={() => setIsAudioModalOpen(true)}
            selectedPersona={selectedVoice}
            onClearPersona={() => setSelectedVoice(null)}
            isTranscribingAudioLyrics={isTranscribingAudioLyrics}
            onTranscribeAudioLyrics={transcribeLyricsFromAudio}
            setAudioUploadError={setAudioUploadError}
            openMp3Converter={openMp3Converter}
            openMp3ConverterAlt={openMp3ConverterAlt}
            generateLyricsWithAI={generateLyricsWithAI}
            isGeneratingLyrics={isGeneratingLyrics}
            isDev={isDev}
          />
        )}
      </div>

      {studioRecorderOpen ? (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#0b0f16] p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-white font-extrabold">Grabadora de audio</div>
              <button
                type="button"
                onClick={() => {
                  setStudioRecorderOpen(false);
                  setStudioRecorderState('idle');
                  studioRecorderStateRef.current = 'idle';
                  stopStudioRecorder(false).catch(() => {});
                }}
                className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-300 hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-3 text-slate-400 text-sm">Graba con el micrófono (PC o celular). Luego se sube automáticamente.</div>

            {studioRecorderError ? <div className="mt-3 text-red-300 text-sm">{studioRecorderError}</div> : null}

            <div className="mt-4 h-10 rounded-2xl border border-white/10 bg-black/20 px-3 flex items-end justify-center gap-[2px] overflow-hidden">
              {(studioRecorderBars.length ? studioRecorderBars : Array.from({ length: 48 }).map(() => 6)).map((h, idx) => (
                <div key={idx} className="w-[3px] rounded-full bg-white/30" style={{ height: `${Math.max(6, Math.min(100, Number(h) || 6))}%` }} />
              ))}
            </div>

            <div className="mt-4 flex flex-col items-center">
              <div className="text-slate-300 text-sm tabular-nums">{Math.floor(Math.max(0, studioRecorderElapsedMs || 0) / 1000)}s</div>
              <div className="mt-1 text-slate-500 text-xs">
                {studioRecorderState === 'recording' ? 'Grabando…' : studioRecorderState === 'stopping' ? 'Guardando…' : 'Listo'}
              </div>
            </div>

            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setStudioRecorderOpen(false);
                  setStudioRecorderState('idle');
                  studioRecorderStateRef.current = 'idle';
                  stopStudioRecorder(false).catch(() => {});
                }}
                className="flex-1 bg-white/5 border border-white/10 rounded-full py-3 text-slate-200 font-semibold hover:bg-white/10 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (studioRecorderState !== 'recording') return;
                  setStudioRecorderState('stopping');
                  studioRecorderStateRef.current = 'stopping';
                  stopStudioRecorder(true).catch(() => {});
                }}
                disabled={studioRecorderState !== 'recording'}
                className={cn(
                  'flex-1 h-[44px] rounded-full font-extrabold text-sm',
                  studioRecorderState === 'recording' ? 'bg-emerald-500 hover:bg-emerald-400 text-black' : 'bg-white/5 border border-white/10 text-slate-400'
                )}
              >
                Detener
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Action Buttons & Sticky Create */}
      <div className="fixed md:sticky bottom-[76px] md:bottom-0 left-0 right-0 w-full px-4 flex flex-col gap-2 bg-gradient-to-t from-[#020617] via-[#020617] to-transparent pt-12 pb-6 z-30">
        {/* Create Button */}
        <button 
          onClick={() => handleCreate().catch(() => {})}
          disabled={isSubmitting || (audioFile && !audioUploadUrl) || (audioAction === 'extend' && Boolean(audioUploadUrl))}
          className="w-full bg-green-500 hover:bg-green-400 text-[#020617] h-[48px] rounded-full font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-70"
        >
          {isSubmitting ? (
            <RefreshCw className="w-5 h-5 animate-spin" />
          ) : (
            <Music className="w-5 h-5" strokeWidth={2} />
          )}
          <span>
            {isSubmitting
              ? 'Creando…'
              : audioFile && !audioUploadUrl
                ? 'Subiendo audio…'
                : audioUploadUrl && audioAction === 'cover'
                  ? 'Crear cover'
                  : audioUploadUrl && audioAction === 'instrumental'
                    ? 'Crear instrumental'
                    : audioUploadUrl && audioAction === 'vocals'
                      ? 'Crear voces'
                      : audioUploadUrl && audioAction === 'extend'
                        ? 'Extender (Próximamente)'
                        : audioUploadUrl && audioAction === 'library'
                          ? 'Guardar en Biblioteca'
                          : 'Crear'}
          </span>
        </button>
      </div>
        </>
      )}

      {isVoicesPickerOpen && (
        <div className="fixed inset-0 md:absolute md:inset-0 z-[120]">
          <div className="absolute inset-0 bg-black/55 backdrop-blur-md" />
          <div className="absolute inset-0 bg-[#0b0f16] border border-white/10 rounded-none md:rounded-3xl overflow-hidden shadow-[0_-20px_60px_rgba(0,0,0,0.6)] flex flex-col">
            <div className="flex items-center justify-center p-5 border-b border-white/10 relative">
              <div className="text-white font-extrabold text-lg">Clonador de Voz</div>
              <button
                onClick={() => setIsVoicesPickerOpen(false)}
                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200 absolute right-5 top-1/2 -translate-y-1/2 hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto min-h-0">
              <div className="flex bg-white/5 rounded-full p-1 border border-white/5 mb-6 w-full">
                <button
                  type="button"
                  onClick={() => setVoicesTab('mine')}
                  className={cn(
                    "flex-1 px-4 py-2 rounded-full text-sm font-semibold transition-colors",
                    voicesTab === 'mine' ? "bg-white text-black" : "text-slate-300 hover:text-white"
                  )}
                >
                  Mis Clones
                </button>
                <button
                  type="button"
                  onClick={() => setVoicesTab('favorites')}
                  className={cn(
                    "flex-1 px-4 py-2 rounded-full text-sm font-semibold transition-colors flex items-center justify-center gap-2",
                    voicesTab === 'favorites' ? "bg-white text-black" : "text-slate-300 hover:text-white"
                  )}
                >
                  <Heart className="w-4 h-4" /> Favoritos
                </button>
              </div>

              <div className="relative mb-6">
                <Search className="w-5 h-5 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  value={voiceSearch}
                  onChange={(e) => setVoiceSearch(e.target.value)}
                  placeholder="Buscar"
                  className="w-full bg-white/5 border border-white/10 rounded-full pl-12 pr-4 py-3.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-emerald-500/40"
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsVoicesPickerOpen(false);
                  if (onOpenCreateVoiceFullScreen) {
                    onOpenCreateVoiceFullScreen();
                    return;
                  }
                  setVoiceCreateError('');
                  setVoiceCreateStep('pick_source');
                  setVoiceSourceFile(null);
                  setVoiceVerifyFile(null);
                  setVoiceValidateTaskId('');
                  voiceValidateTaskIdRef.current = '';
                  setVoiceValidateInfo('');
                  setVoiceGenerateTaskId('');
                  setVoiceGeneratedVoiceId('');
                  setVoiceIsAvailable(null);
                  setVoiceIsAvailable(null);
                  setVoiceStartSec(0);
                  setVoiceEndSec(voiceTrimMaxSec);
                  setVoiceTrimNowSec(0);
                  try {
                    voiceTrimAudioRef.current?.pause?.();
                  } catch {
                  }
                  setVoiceTrimIsPlaying(false);
                  setIsCreateVoiceOpen(true);
                }}
                className="w-full rounded-2xl p-[1px] bg-gradient-to-r from-amber-500/40 via-rose-500/25 to-fuchsia-500/35"
              >
                <div className="w-full rounded-2xl p-4 bg-[#0b0f16] border border-white/10 flex items-center gap-4 hover:bg-white/5 transition-colors">
                  <div className="w-12 h-12 rounded-full border border-white/20 flex items-center justify-center text-slate-200 shrink-0 border-dashed">
                    <Plus className="w-5 h-5" />
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="text-white font-extrabold text-base truncate">Crear voz</div>
                      <div className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-fuchsia-500/20 border border-fuchsia-400/30 text-fuchsia-200">
                        NUEVO
                      </div>
                    </div>
                    <div className="text-slate-400 text-sm truncate">Graba o sube tu voz</div>
                  </div>
                  <ChevronDown className="w-5 h-5 text-slate-500 rotate-[-90deg]" />
                </div>
              </button>

              {voicesTab === 'favorites' ? (
                <div className="mt-6 text-slate-400 text-sm text-center">Próximamente</div>
              ) : (
                (() => {
                  const q = (voiceSearch || '').toString().trim().toLowerCase();
                  const list = q
                    ? voices.filter((v) => `${v.name} ${v.voiceId}`.toLowerCase().includes(q))
                    : voices;
                  if (!list.length) {
                    return <div className="mt-6 text-slate-400 text-sm text-center">No tienes voces todavía.</div>;
                  }
                  return (
                    <div className="mt-5 grid grid-cols-2 gap-4">
                      {list.slice(0, 20).map((v) => (
                        <button
                          key={v.voiceId}
                          type="button"
                          onClick={() => {
                            setSelectedVoice({ voiceId: v.voiceId, name: v.name });
                            setIsVoicesPickerOpen(false);
                          }}
                          className="group text-left"
                        >
                          <div className="relative aspect-square rounded-[28px] bg-white/5 border border-white/10 overflow-hidden">
                            <img
                              src={v.profileImageUrl ? r2ValueToProxyUrl(v.profileImageUrl) : makeAudioCoverSvgUrl((v.name || 'Voz').toString())}
                              alt=""
                              className="w-full h-full object-cover opacity-95 group-hover:opacity-100 transition-opacity"
                            />
                            <div className="absolute top-2 right-2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  openSunoVoiceDetails(v);
                                }}
                                className="w-9 h-9 rounded-full bg-black/50 border border-white/10 flex items-center justify-center text-white hover:bg-black/70"
                                aria-label="Editar"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  deleteSunoVoice(v.voiceId).catch(() => {});
                                }}
                                className="w-9 h-9 rounded-full bg-black/50 border border-white/10 flex items-center justify-center text-white hover:bg-black/70"
                                aria-label="Eliminar"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          <div className="mt-3 text-white font-extrabold text-sm truncate">{v.name || 'Voz'}</div>
                          <div className="text-slate-500 text-xs truncate">{v.description ? String(v.description) : v.status ? String(v.status) : 'Sin descripción.'}</div>
                        </button>
                      ))}
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        </div>
      )}

      {sunoVoiceDetailsOpen ? (
        <div className="fixed inset-0 z-[10050] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <button
            className="absolute inset-0 w-full h-full cursor-default"
            onClick={() => {
              setSunoVoiceDetailsOpen(false);
              setSunoVoiceDetailsId('');
            }}
            aria-label="Cerrar"
          />
          <div className="relative w-11/12 max-w-5xl max-h-[90dvh] bg-[#0b0f16] border border-white/10 rounded-3xl overflow-hidden shadow-[0_-20px_60px_rgba(0,0,0,0.6)] flex flex-col">
            <div className="p-5 border-b border-white/10 flex items-center justify-center relative shrink-0">
              <div className="text-white font-extrabold text-lg">Detalles de la voz</div>
              <button
                type="button"
                onClick={() => {
                  setSunoVoiceDetailsOpen(false);
                  setSunoVoiceDetailsId('');
                }}
                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200 absolute right-5 top-1/2 -translate-y-1/2 hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 md:p-8 overflow-y-auto min-h-0">
              <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-5 items-start">
                <div className="flex flex-col items-center">
                  <button
                    type="button"
                    onClick={() => voiceDetailsImageInputRef.current?.click()}
                    className="w-[140px] h-[140px] rounded-[36px] bg-white/5 border border-white/10 overflow-hidden flex items-center justify-center"
                    disabled={voiceDetailsSaving}
                  >
                    {voiceDetailsImageKey ? (
                      <img src={r2ValueToProxyUrl(voiceDetailsImageKey)} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <img src={makeAudioCoverSvgUrl((voiceDetailsName || 'Voz').toString())} alt="" className="w-full h-full object-cover opacity-95" />
                    )}
                  </button>
                  <input
                    ref={voiceDetailsImageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      e.currentTarget.value = '';
                      if (!f) return;
                      if (f.size > 25 * 1024 * 1024) {
                        setVoiceCreateError('La imagen es muy pesada. Usa una menor a 25 MB.');
                        return;
                      }
                      (async () => {
                        setVoiceCreateError('');
                        const t = await getAccessToken();
                        if (!t.ok) throw new Error(t.error || 'No se pudo iniciar sesión.');
                        const ab = await f.arrayBuffer();
                        const fileArray = Array.from(new Uint8Array(ab));
                        const safeCt = (f.type || 'image/jpeg').toString().slice(0, 120);
                        const userId = (await supabaseBrowser.auth.getUser()).data.user?.id || 'unknown';
                        const id = (sunoVoiceDetailsId || voiceGeneratedVoiceId || '').toString().trim() || `temp_${Date.now()}`;
                        const path = `personas/${userId}/suno_voice_${id}_${Date.now()}.jpg`;
                        const r = await fetch('/api/account/upload-profile-image', {
                          method: 'POST',
                          headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
                          body: JSON.stringify({ path, data: fileArray, contentType: safeCt }),
                        });
                        const out = await r.json().catch(() => ({}));
                        if (!r.ok) throw new Error((out?.error || out?.detail || 'No pude subir la imagen.').toString());
                        const key = (out?.key || path).toString().trim() || path;
                        setVoiceDetailsImageKey(key);
                      })().catch((e) => setVoiceCreateError(e instanceof Error ? e.message : String(e)));
                    }}
                  />
                  <div className="mt-3 text-slate-400 text-xs">Toca para cambiar la imagen</div>
                </div>

                <div className="min-w-0">
                  <div className="glass-card rounded-2xl p-4 border border-white/10">
                    <div className="text-slate-400 text-xs font-semibold">Nombre de la voz</div>
                    <input
                      value={voiceDetailsName}
                      onChange={(e) => setVoiceDetailsName(e.target.value)}
                      placeholder="Ponle un nombre"
                      className="mt-2 w-full bg-transparent outline-none text-white font-extrabold"
                      maxLength={120}
                    />
                  </div>

                  <div className="mt-3 glass-card rounded-2xl p-4 border border-white/10">
                    <div className="text-slate-400 text-xs font-semibold">Tags de estilo (opcional)</div>
                    <input
                      value={voiceDetailsTags}
                      onChange={(e) => setVoiceDetailsTags(e.target.value)}
                      placeholder="Ej: regional, mariachi, norteño"
                      className="mt-2 w-full bg-transparent outline-none text-white"
                      maxLength={220}
                    />
                  </div>

                  <div className="mt-3 glass-card rounded-2xl p-4 border border-white/10">
                    <div className="text-slate-400 text-xs font-semibold">Descripción (opcional)</div>
                    <textarea
                      value={voiceDetailsDescription}
                      onChange={(e) => setVoiceDetailsDescription(e.target.value)}
                      placeholder="Agrega una descripción"
                      className="mt-2 w-full bg-transparent outline-none text-white resize-none"
                      rows={3}
                      maxLength={800}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => setVoiceDetailsIsPublic((v) => !v)}
                    className={cn(
                      "mt-3 w-full rounded-2xl p-4 border text-left transition-colors",
                      voiceDetailsIsPublic ? "bg-emerald-500/15 border-emerald-500/25 text-emerald-200" : "bg-white/5 border-white/10 text-slate-200 hover:bg-white/10"
                    )}
                  >
                    <div className="font-extrabold">Público</div>
                    <div className="text-xs opacity-80">Permite que otros usuarios encuentren esta voz</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const id = (sunoVoiceDetailsId || '').toString().trim();
                      if (!id) return;
                      setVoiceDetailsSaving(true);
                      deleteSunoVoice(id)
                        .then(() => {
                          setSunoVoiceDetailsOpen(false);
                          setSunoVoiceDetailsId('');
                        })
                        .catch(() => {})
                        .finally(() => setVoiceDetailsSaving(false));
                    }}
                    disabled={voiceDetailsSaving || !(sunoVoiceDetailsId || '').toString().trim()}
                    className="mt-3 w-full h-[46px] rounded-full bg-red-500/20 border border-red-500/30 text-red-200 font-extrabold hover:bg-red-500/25 disabled:opacity-60"
                  >
                    Eliminar voz
                  </button>
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-white/10 bg-[#0b0f16] shrink-0">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setSunoVoiceDetailsOpen(false);
                    setSunoVoiceDetailsId('');
                  }}
                  className="h-[46px] rounded-full bg-white/5 border border-white/10 text-slate-200 font-extrabold hover:bg-white/10"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const id = (sunoVoiceDetailsId || '').toString().trim();
                    if (!id) return;
                    setVoiceDetailsSaving(true);
                    persistSunoVoiceProfile(id)
                      .then(() => {
                        setSunoVoiceDetailsOpen(false);
                        setSunoVoiceDetailsId('');
                      })
                      .catch(() => {})
                      .finally(() => setVoiceDetailsSaving(false));
                  }}
                  disabled={voiceDetailsSaving || !(sunoVoiceDetailsId || '').toString().trim()}
                  className="h-[46px] rounded-full bg-white text-black font-extrabold disabled:opacity-60"
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isCreateVoiceOpen && (
        <div className={`${standaloneVoices ? 'absolute' : 'fixed'} inset-0 z-[125] bg-black/65 backdrop-blur-sm flex items-end md:items-center justify-center p-4`}>
          <button
            className="absolute inset-0 w-full h-full cursor-default"
            onClick={() => {
              if (voiceBusy) return;
              setIsCreateVoiceOpen(false);
              resetVoiceWizard();
            }}
            aria-label="Cerrar"
          />
          <div className="relative w-full h-[90dvh] md:w-[80vw] md:h-[85vh] md:max-w-5xl bg-gradient-to-br from-[#0b0f16] via-[#0b0f16] to-indigo-950/60 border border-white/10 rounded-3xl overflow-hidden shadow-[0_-20px_60px_rgba(99,102,241,0.12)] flex flex-col">
            <div className="p-5 border-b border-white/10 bg-gradient-to-r from-emerald-500/10 via-fuchsia-500/10 to-indigo-500/10 flex items-center justify-center relative">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-emerald-200" />
                </div>
                <div className="text-center">
                  <div className="text-white font-extrabold text-lg leading-tight">Clonador de Voz</div>
                  <div className="text-slate-300 text-xs">Graba o sube una muestra para crear tu voz</div>
                </div>
              </div>
              <button
                onClick={() => {
                  if (voiceBusy) return;
                  setIsCreateVoiceOpen(false);
                  resetVoiceWizard();
                }}
                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200 absolute right-5 top-1/2 -translate-y-1/2 hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 md:p-10 flex flex-col items-center bg-gradient-to-b from-white/5 to-transparent">
              <div className="w-full">
              {voiceCreateError ? (
                <div className="mb-4 bg-red-500/10 border border-red-500/25 rounded-2xl p-3 text-sm text-red-200">
                  {voiceCreateError}
                </div>
              ) : null}

              {voiceLibraryMode !== 'none' ? (
                <div className="mt-4">
                  <div className="flex items-center justify-between">
                    <div className="text-white font-bold">Selecciona de tu Biblioteca</div>
                    <button
                      type="button"
                      onClick={() => setVoiceLibraryMode('none')}
                      className="text-slate-300 text-sm hover:text-white"
                    >
                      Volver
                    </button>
                  </div>

                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => loadVoiceLibrary().catch((e) => setVoiceCreateError(e instanceof Error ? e.message : String(e)))}
                      disabled={voiceLibraryLoading}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 text-slate-200 font-semibold hover:bg-white/10 transition-colors disabled:opacity-60"
                    >
                      {voiceLibraryLoading ? 'Cargando…' : 'Actualizar lista'}
                    </button>
                  </div>

                  <div className="mt-3 space-y-2">
                    {voiceLibrarySongs.length === 0 ? (
                      <div className="text-slate-400 text-sm">No encontré canciones en tu Biblioteca.</div>
                    ) : (
                      voiceLibrarySongs.slice(0, 60).map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={async () => {
                            try {
                              setVoiceCreateError('');
                              const f = await pickFromLibrary(s.id);
                              if (!f) return;
                              if (voiceLibraryMode === 'source') {
                                setVoiceSourceFile(f);
                                setVoiceVerifyFile(null);
                                setVoiceStartSec(0);
                                setVoiceEndSec(voiceTrimMaxSec);
                                setVoiceTrimNowSec(0);
                                try {
                                  voiceTrimAudioRef.current?.pause?.();
                                } catch {
                                }
                                setVoiceTrimIsPlaying(false);
                                setVoiceCreateStep('trim');
                              } else {
                                setVoiceVerifyFile(f);
                                setVoiceCreateStep('pick_verify');
                              }
                              setVoiceLibraryMode('none');
                            } catch (e) {
                              setVoiceCreateError(e instanceof Error ? e.message : String(e));
                            }
                          }}
                          className="w-full glass-card rounded-2xl p-4 flex items-center gap-3 hover:bg-white/10 transition-colors border border-white/10"
                        >
                          <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-200 shrink-0">
                            <Music className="w-5 h-5" />
                          </div>
                          <div className="flex-1 text-left min-w-0">
                            <div className="text-white font-bold truncate">{s.title}</div>
                            <div className="text-slate-500 text-xs truncate">Biblioteca</div>
                          </div>
                          <ChevronDown className="w-5 h-5 text-slate-500 rotate-[-90deg]" />
                        </button>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {(() => {
                    const isVerifyStep = voiceCreateStep === 'pick_verify' || voiceCreateStep === 'generating_voice' || voiceCreateStep === 'done';
                    if (!isVerifyStep && voiceCreateStep === 'trim') return null;
                    const title = isVerifyStep ? 'Sube la grabación de la frase' : 'Agrega tu voz';
                    const subtitle = isVerifyStep
                      ? 'Graba o sube la frase para validar tu voz.'
                      : 'Graba o sube un audio (ideal: voz limpia, sin ruido).';
                    const fileName = isVerifyStep ? voiceVerifyFile?.name : voiceSourceFile?.name;
                    const previewUrl = isVerifyStep ? voiceVerifyPreviewUrl : voiceSourcePreviewUrl;

                    const pickRecord = () => {
                      startVoiceRecorder(isVerifyStep ? 'verify' : 'source', isVerifyStep ? 10 : undefined).catch((e) => {
                        setVoiceCreateError(e instanceof Error ? e.message : String(e));
                      });
                    };
                    const pickAltRecord = () => {
                      if (isVerifyStep) voiceVerifyRecordInputRef.current?.click?.();
                      else voiceRecordInputRef.current?.click?.();
                    };
                    const pickUpload = () => {
                      if (isVerifyStep) voiceVerifyUploadInputRef.current?.click?.();
                      else voiceUploadInputRef.current?.click?.();
                    };
                    const pickLibrary = () => {
                      setVoiceCreateError('');
                      setVoiceLibraryMode(isVerifyStep ? 'verify' : 'source');
                      if (voiceLibrarySongs.length === 0) loadVoiceLibrary().catch((e) => setVoiceCreateError(e instanceof Error ? e.message : String(e)));
                    };

                    const onDropFile = (f: File) => {
                      if (isVerifyStep) {
                        setVoiceVerifyFile(f);
                        setVoiceCreateStep('pick_verify');
                      } else {
                        setVoiceSourceFile(f);
                        setVoiceVerifyFile(null);
                        setVoiceStartSec(0);
                        setVoiceEndSec(voiceTrimMaxSec);
                        setVoiceTrimNowSec(0);
                        try {
                          voiceTrimAudioRef.current?.pause?.();
                        } catch {
                        }
                        setVoiceTrimIsPlaying(false);
                        setVoiceCreateStep('trim');
                      }
                      setVoiceCreateError('');
                    };

                    return (
                      <div className="mt-4">
                        {isVerifyStep ? (
                          <div className="glass-card rounded-2xl p-4 border border-white/10 bg-gradient-to-b from-white/5 to-transparent">
                            <div className="text-white font-extrabold text-center">{title}</div>
                            <div className="mt-1 text-slate-400 text-sm text-center">{subtitle}</div>

                            <div
                              className="mt-4 rounded-2xl border border-dashed border-white/15 bg-black/20 p-6 text-center"
                              onDragOver={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const f = e.dataTransfer?.files?.[0] || null;
                                if (!f) return;
                                onDropFile(f);
                              }}
                            >
                              <div className="text-slate-300 text-sm">{fileName ? `Seleccionado: ${fileName}` : 'Arrastra un archivo de audio aquí.'}</div>
                              <div className="mt-2 text-slate-500 text-xs">o usa una opción de abajo</div>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2 justify-center">
                              <button
                                type="button"
                                onClick={pickRecord}
                                disabled={voiceBusy}
                                className="bg-white/5 border border-white/10 rounded-full px-4 py-2 text-slate-200 font-semibold hover:bg-white/10 transition-colors disabled:opacity-60 flex items-center gap-2"
                              >
                                <Mic className="w-4 h-4" /> Grabar
                              </button>
                              <button
                                type="button"
                                onClick={pickAltRecord}
                                disabled={voiceBusy}
                                className="bg-white/5 border border-white/10 rounded-full px-4 py-2 text-slate-200 font-semibold hover:bg-white/10 transition-colors disabled:opacity-60 flex items-center gap-2"
                              >
                                <Mic className="w-4 h-4" /> Grabación alternativa
                              </button>
                              <button
                                type="button"
                                onClick={pickUpload}
                                disabled={voiceBusy}
                                className="bg-white/5 border border-white/10 rounded-full px-4 py-2 text-slate-200 font-semibold hover:bg-white/10 transition-colors disabled:opacity-60 flex items-center gap-2"
                              >
                                <Upload className="w-4 h-4" /> Subir audio
                              </button>
                              <button
                                type="button"
                                onClick={pickLibrary}
                                disabled={voiceBusy}
                                className="bg-white/5 border border-white/10 rounded-full px-4 py-2 text-slate-200 font-semibold hover:bg-white/10 transition-colors disabled:opacity-60 flex items-center gap-2"
                              >
                                <Library className="w-4 h-4" /> Seleccionar de Biblioteca
                              </button>
                            </div>

                            {previewUrl ? (
                              <div className="mt-3">
                                <audio controls preload="metadata" src={previewUrl} className="w-full" />
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="rounded-3xl p-[1px] bg-gradient-to-r from-amber-500/35 via-rose-500/20 to-fuchsia-500/30">
                            <div className="rounded-3xl bg-[#0b0f16] border border-transparent px-6 py-16 md:px-12">
                              <div className="text-center">
                                <div className="text-white font-extrabold text-2xl">Agrega tu voz a la mezcla.</div>
                                <div className="mt-3 text-slate-400 text-base max-w-[400px] mx-auto">
                                  Graba o sube una muestra y usaremos ese contenido para influir en cómo sonarán tus canciones.
                                </div>
                              </div>

                              <div
                                className="mt-8 rounded-2xl bg-black/20 border border-white/10 px-6 py-12 text-center"
                                onDragOver={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const f = e.dataTransfer?.files?.[0] || null;
                                  if (!f) return;
                                  onDropFile(f);
                                }}
                              >
                                <div className="text-slate-300 text-sm">{fileName ? `Seleccionado: ${fileName}` : 'Arrastra un archivo de audio aquí.'}</div>
                                <div className="mt-2 text-slate-500 text-xs">o usa una opción de abajo</div>

                                <div className="mt-6 flex flex-col md:flex-row gap-3 justify-center">
                                  <button
                                    type="button"
                                    onClick={pickRecord}
                                    disabled={voiceBusy}
                                    className="bg-white/5 border border-white/10 rounded-full px-6 py-2.5 text-slate-200 font-semibold hover:bg-white/10 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                                  >
                                    <Mic className="w-4 h-4" /> Grabar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={pickAltRecord}
                                    disabled={voiceBusy}
                                    className="bg-white/5 border border-white/10 rounded-full px-6 py-2.5 text-slate-200 font-semibold hover:bg-white/10 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                                  >
                                    <Mic className="w-4 h-4" /> Grabación alternativa
                                  </button>
                                  <button
                                    type="button"
                                    onClick={pickUpload}
                                    disabled={voiceBusy}
                                    className="bg-white/5 border border-white/10 rounded-full px-6 py-2.5 text-slate-200 font-semibold hover:bg-white/10 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                                  >
                                    <Upload className="w-4 h-4" /> Subir audio
                                  </button>
                                  <button
                                    type="button"
                                    onClick={pickLibrary}
                                    disabled={voiceBusy}
                                    className="bg-white/5 border border-white/10 rounded-full px-6 py-2.5 text-slate-200 font-semibold hover:bg-white/10 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                                  >
                                    <Library className="w-4 h-4" /> Seleccionar de Biblioteca
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {voiceCreateStep === 'trim' && voiceSourceFile ? (
                    <div className="mt-4 glass-card rounded-2xl p-4 border border-white/10">
                      <div className="text-center">
                        <div className="text-white font-extrabold">Recorta tu grabación</div>
                        <div className="mt-1 text-slate-400 text-sm">Mantén la parte donde más se parezca a tu voz.</div>
                      </div>

                      {Number(voiceSourceDurationSec || 0) <= 0 ? (
                        <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 text-amber-100 text-sm">
                          <div className="font-bold">No pude leer la duración del audio.</div>
                          <div className="mt-1 text-amber-100/80">
                            Si estás en Android y el recorte se queda en 00:00, usa “Grabación alternativa”.
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (voiceBusy) return;
                              setVoiceSourceFile(null);
                              setVoiceSourceDurationSec(0);
                              setVoiceStartSec(0);
                              setVoiceEndSec(voiceTrimMaxSec);
                              setVoiceTrimNowSec(0);
                              setVoiceCreateStep('pick_source');
                              setVoiceCreateError('');
                              window.setTimeout(() => voiceRecordInputRef.current?.click?.(), 0);
                            }}
                            disabled={voiceBusy}
                            className="mt-3 w-full bg-white/5 border border-white/10 rounded-full py-3 text-slate-100 font-semibold hover:bg-white/10 transition-colors disabled:opacity-60"
                          >
                            Abrir Grabación alternativa
                          </button>
                        </div>
                      ) : null}

                      <audio
                        ref={voiceTrimAudioRef}
                        src={voiceSourcePreviewUrl}
                        preload="metadata"
                        className="hidden"
                        onLoadedMetadata={(e) => {
                          const d = Number((e.currentTarget as any)?.duration);
                          if (!Number.isFinite(d) || d <= 0) return;
                          const next = clampVoiceTrim(voiceStartSec, voiceEndSec || voiceTrimMaxSec, d);
                          setVoiceSourceDurationSec(d);
                          setVoiceStartSec(next.start);
                          setVoiceEndSec(next.end || Math.min(voiceTrimMaxSec, Math.floor(d)));
                          setVoiceTrimNowSec(next.start);
                        }}
                        onTimeUpdate={(e) => {
                          const el = e.currentTarget as any;
                          const now = Number(el?.currentTime || 0);
                          if (!Number.isFinite(now)) return;
                          setVoiceTrimNowSec(now);
                          const d = Number(voiceSourceDurationSec || 0);
                          const range = clampVoiceTrim(voiceStartSec, voiceEndSec || voiceTrimMaxSec, d);
                          const end = Number(range.end || 0);
                          if (end > 0 && now >= end) {
                            try {
                              el.pause();
                            } catch {
                            }
                            setVoiceTrimIsPlaying(false);
                          }
                        }}
                        onEnded={() => {
                          setVoiceTrimIsPlaying(false);
                        }}
                      />

                      <div className="mt-6 rounded-2xl bg-black/20 border border-white/10 px-4 pt-6 pb-4">
                        <div className="relative w-full h-[180px] rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
                          <div className="absolute inset-0 flex items-center gap-[2px] px-3">
                            {(voiceWaveBars.length ? voiceWaveBars : new Array(140).fill(22)).map((h, i) => (
                              <div
                                key={i}
                                className="w-[2px] rounded-full bg-white/35"
                                style={{ height: `${Math.max(10, Math.min(130, Math.round((Number(h) || 20) * 1.35)))}px` }}
                              />
                            ))}
                          </div>

                          {(() => {
                            const d = Math.max(0, Number(voiceSourceDurationSec || 0));
                            const range = clampVoiceTrim(voiceStartSec, voiceEndSec || voiceTrimMaxSec, d);
                            const s = Math.max(0, Math.min(d || 0, Number(range.start || 0)));
                            const e = Math.max(0, Math.min(d || 0, Number(range.end || 0)));
                            const left = d > 0 ? (Math.min(s, e) / d) * 100 : 0;
                            const right = d > 0 ? (Math.max(s, e) / d) * 100 : 0;
                            const center = left + (right - left) / 2;
                            return (
                              <>
                                <div className="absolute inset-0 bg-black/20" />
                                <div className="absolute inset-y-0 left-0 bg-black/45" style={{ width: `${left}%` }} />
                                <div className="absolute inset-y-0 bg-black/45" style={{ left: `${right}%`, right: 0 }} />
                                <div
                                  className="absolute inset-y-2 border-2 border-fuchsia-400/90 rounded-xl shadow-[0_0_0_1px_rgba(255,255,255,0.04)]"
                                  style={{ left: `${left}%`, width: `${Math.max(0, right - left)}%` }}
                                />
                                <div className="absolute inset-y-2" style={{ left: `${left}%`, width: `${Math.max(0, right - left)}%` }}>
                                  <div className="absolute inset-y-0 left-0 w-[8px] bg-fuchsia-400 rounded-l-xl" />
                                  <div className="absolute inset-y-0 right-0 w-[8px] bg-fuchsia-400 rounded-r-xl" />
                                </div>
                                <div className="absolute -top-4" style={{ left: `${center}%`, transform: 'translateX(-50%)' }}>
                                  <div className="px-3 py-1 rounded-full bg-fuchsia-500 border border-fuchsia-300/40 text-black text-[11px] font-extrabold">
                                    {formatMmSs(voiceTrimMaxSec)}
                                  </div>
                                </div>
                                {(() => {
                                  const now = Math.max(0, Math.min(d || 0, Number(voiceTrimNowSec || 0)));
                                  const pos = d > 0 ? (now / d) * 100 : 0;
                                  return <div className="absolute top-0 bottom-0 w-[2px] bg-white/40" style={{ left: `${pos}%` }} />;
                                })()}
                              </>
                            );
                          })()}

                          <div className="absolute inset-0">
                            <input
                              type="range"
                              min={0}
                              max={Math.max(0, Math.floor(voiceSourceDurationSec || 0))}
                              value={Math.max(0, Math.min(Math.floor(voiceSourceDurationSec || 0), Math.floor(voiceStartSec || 0)))}
                              onChange={(e) => {
                                const d = Number(voiceSourceDurationSec || 0);
                                const next = clampVoiceTrim(Number(e.target.value), voiceEndSec, d);
                                setVoiceStartSec(next.start);
                                setVoiceEndSec(next.end);
                                setVoiceTrimNowSec(next.start);
                                try {
                                  if (voiceTrimAudioRef.current) voiceTrimAudioRef.current.currentTime = next.start;
                                } catch {
                                }
                              }}
                              className="absolute inset-0 w-full h-full opacity-0"
                            />
                            <input
                              type="range"
                              min={0}
                              max={Math.max(0, Math.floor(voiceSourceDurationSec || 0))}
                              value={Math.max(0, Math.min(Math.floor(voiceSourceDurationSec || 0), Math.floor(voiceEndSec || 0)))}
                              onChange={(e) => {
                                const d = Number(voiceSourceDurationSec || 0);
                                const next = clampVoiceTrim(voiceStartSec, Number(e.target.value), d);
                                setVoiceStartSec(next.start);
                                setVoiceEndSec(next.end);
                                setVoiceTrimNowSec(next.start);
                                try {
                                  if (voiceTrimAudioRef.current) voiceTrimAudioRef.current.currentTime = next.start;
                                } catch {
                                }
                              }}
                              className="absolute inset-0 w-full h-full opacity-0"
                            />
                          </div>
                        </div>

                        <div className="mt-4 text-center text-slate-400 text-xs">
                          {formatMmSs(voiceStartSec)} — {formatMmSs(Math.min(voiceEndSec, voiceStartSec + voiceTrimMaxSec))}
                        </div>

                        <div className="mt-5 flex items-center justify-center">
                          <button
                            type="button"
                            onClick={toggleTrimPlay}
                            className="w-14 h-14 rounded-full bg-black/30 border border-white/10 flex items-center justify-center text-white hover:bg-black/20 transition-colors"
                          >
                            {voiceTrimIsPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
                          </button>
                        </div>

                        <div className="mt-6 grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              if (voiceBusy) return;
                              try {
                                voiceTrimAudioRef.current?.pause?.();
                              } catch {
                              }
                              setVoiceTrimIsPlaying(false);
                              setVoiceSourceFile(null);
                              setVoiceSourceDurationSec(0);
                              setVoiceStartSec(0);
                              setVoiceEndSec(voiceTrimMaxSec);
                              setVoiceTrimNowSec(0);
                              setVoiceCreateStep('pick_source');
                            }}
                            disabled={voiceBusy}
                            className="flex-1 bg-white/5 border border-white/10 rounded-full py-3 text-slate-200 font-semibold hover:bg-white/10 transition-colors disabled:opacity-60"
                          >
                            Volver a empezar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (voiceBusy) return;
                              try {
                                voiceTrimAudioRef.current?.pause?.();
                              } catch {
                              }
                              setVoiceTrimIsPlaying(false);
                              setVoiceCreateStep('segment');
                            }}
                            disabled={voiceBusy}
                            className="flex-1 bg-white hover:bg-white/90 text-black h-[44px] rounded-full font-extrabold text-sm disabled:opacity-60"
                          >
                            Usar voz
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {voiceCreateStep !== 'trim' ? (
                    <>
                      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <div className="text-slate-300 text-xs font-semibold mb-1">Nombre de la voz</div>
                          <input
                            value={newVoiceName}
                            onChange={(e) => setNewVoiceName(e.target.value)}
                            placeholder="Ej: RUBEN"
                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-emerald-500/40"
                          />
                        </div>
                        <div>
                          <div className="text-slate-300 text-xs font-semibold mb-1">Descripción (opcional)</div>
                          <input
                            value={newVoiceDescription}
                            onChange={(e) => setNewVoiceDescription(e.target.value)}
                            placeholder="Ej: Voz cantada en español"
                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-emerald-500/40"
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setVoiceConsent((v) => !v)}
                        className="mt-4 w-full glass-card rounded-2xl p-4 border border-white/10 flex items-start gap-3 text-left hover:bg-white/10 transition-colors"
                      >
                        <div
                          className={cn(
                            "mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0",
                            voiceConsent ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-200" : "bg-white/5 border-white/15 text-transparent"
                          )}
                        >
                          <BadgeCheck className="w-4 h-4" />
                        </div>
                        <div className="text-slate-200 text-sm">
                          Entiendo que la creación de una voz implica el procesamiento de datos de voz que pueden considerarse información biométrica según ciertas leyes, y doy mi consentimiento para la recopilación y procesamiento de dicha información de acuerdo con los Términos de Servicio y la Política de Privacidad de RAMBER Tunes
                        </div>
                      </button>

                      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="glass-card rounded-2xl p-4 border border-white/10">
                          <div className="flex items-center gap-2 text-white font-bold text-sm">
                            <Sparkles className="w-4 h-4 text-emerald-200" /> Canta o habla claro
                          </div>
                          <div className="mt-1 text-slate-400 text-sm">Sin ruido, sin eco, y con buena pronunciación.</div>
                        </div>
                        <div className="glass-card rounded-2xl p-4 border border-white/10">
                          <div className="flex items-center gap-2 text-white font-bold text-sm">
                            <ShieldCheck className="w-4 h-4 text-emerald-200" /> Mínimo 10 segundos
                          </div>
                          <div className="mt-1 text-slate-400 text-sm">Entre más limpio el audio, mejor sale la voz.</div>
                        </div>
                      </div>

                      {voiceSourceFile && voiceCreateStep === 'segment' ? (
                        <button
                          type="button"
                          onClick={() => generateValidationPhrase().catch(() => {})}
                          disabled={voiceBusy}
                          className="mt-4 w-full bg-emerald-500 hover:bg-emerald-400 text-black h-[44px] rounded-full font-extrabold text-sm disabled:opacity-60"
                        >
                          Generar frase de validación
                        </button>
                      ) : null}
                    </>
                  ) : null}

                  {voiceRecorderOpen ? (
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#0b0f16] p-5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-white font-extrabold">Grabadora</div>
                          <button
                            type="button"
                            onClick={() => {
                              setVoiceRecorderOpen(false);
                              setVoiceRecorderState('idle');
                              stopVoiceRecorder(false).catch(() => {});
                            }}
                            className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-300 hover:bg-white/10"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="mt-3 text-slate-400 text-sm">
                          {voiceRecorderMode === 'verify' ? 'Graba la frase de validación (solo voz).' : 'Graba una muestra de tu voz (solo voz, sin música).'}
                        </div>

                        {voiceRecorderError ? <div className="mt-3 text-red-300 text-sm">{voiceRecorderError}</div> : null}

                        {voiceRecorderMode === 'verify' && voiceValidateInfo ? (
                          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-center">
                            <div className="text-slate-400 text-xs font-semibold">LEE ESTO EN VOZ ALTA</div>
                            <div className="mt-2 text-white font-extrabold text-lg md:text-2xl leading-snug">“{voiceValidateInfo}”</div>
                          </div>
                        ) : null}

                        <div className="mt-4 h-10 rounded-2xl border border-white/10 bg-black/20 px-3 flex items-end justify-center gap-[2px] overflow-hidden">
                          {(voiceRecorderBars.length ? voiceRecorderBars : Array.from({ length: 48 }).map(() => 6)).map((h, idx) => (
                            <div
                              key={idx}
                              className="w-[3px] rounded-full bg-white/30"
                              style={{ height: `${Math.max(6, Math.min(100, Number(h) || 6))}%` }}
                            />
                          ))}
                        </div>

                        {(() => {
                          const maxMs = voiceRecorderMaxMs || 0;
                          const elapsed = Math.max(0, voiceRecorderElapsedMs || 0);
                          const remainingSec = maxMs ? Math.max(0, Math.ceil((maxMs - elapsed) / 1000)) : Math.floor(elapsed / 1000);
                          const pct = maxMs ? Math.max(0, Math.min(1, elapsed / maxMs)) : 0;
                          const radius = 44;
                          const stroke = 8;
                          const circumference = 2 * Math.PI * radius;
                          const dash = circumference * pct;
                          const gap = Math.max(0, circumference - dash);
                          const canStop = voiceRecorderState === 'recording';
                          return (
                            <div className="mt-4 flex flex-col items-center">
                              <div className="relative w-[130px] h-[130px] flex items-center justify-center">
                                <svg width="130" height="130" viewBox="0 0 130 130" className="absolute inset-0">
                                  <circle
                                    cx="65"
                                    cy="65"
                                    r={radius}
                                    fill="none"
                                    stroke="rgba(255,255,255,0.12)"
                                    strokeWidth={stroke}
                                  />
                                  {maxMs ? (
                                    <circle
                                      cx="65"
                                      cy="65"
                                      r={radius}
                                      fill="none"
                                      stroke="rgb(16 185 129)"
                                      strokeWidth={stroke}
                                      strokeLinecap="round"
                                      strokeDasharray={`${dash} ${gap}`}
                                      transform="rotate(-90 65 65)"
                                    />
                                  ) : null}
                                </svg>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setVoiceRecorderState('stopping');
                                    stopVoiceRecorder(true).catch(() => {});
                                  }}
                                  disabled={!canStop}
                                  className={cn(
                                    'w-[78px] h-[78px] rounded-full flex items-center justify-center border font-extrabold',
                                    canStop ? 'bg-emerald-500 hover:bg-emerald-400 text-black border-emerald-300/30' : 'bg-white/5 text-slate-400 border-white/10'
                                  )}
                                >
                                  <BadgeCheck className="w-7 h-7" />
                                </button>
                              </div>

                              <div className="mt-2 text-slate-300 text-sm tabular-nums">
                                {voiceRecorderMaxMs ? `${remainingSec}s` : `${remainingSec}s`}
                              </div>
                              <div className="mt-1 text-slate-500 text-xs">
                                {voiceRecorderMaxMs ? 'Presiona el botón antes de que termine el contador.' : voiceRecorderState === 'recording' ? 'Grabando…' : 'Listo'}
                              </div>
                            </div>
                          );
                        })()}

                        <div className="mt-5 flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setVoiceRecorderOpen(false);
                              setVoiceRecorderState('idle');
                              stopVoiceRecorder(false).catch(() => {});
                            }}
                            className="flex-1 bg-white/5 border border-white/10 rounded-full py-3 text-slate-200 font-semibold hover:bg-white/10 transition-colors"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (voiceRecorderState !== 'recording') return;
                              setVoiceRecorderState('stopping');
                              stopVoiceRecorder(true).catch(() => {});
                            }}
                            disabled={voiceRecorderState !== 'recording'}
                            className={cn(
                              "flex-1 h-[44px] rounded-full font-extrabold text-sm",
                              voiceRecorderState === 'recording'
                                ? "bg-emerald-500 hover:bg-emerald-400 text-black"
                                : "bg-white/5 border border-white/10 text-slate-400"
                            )}
                          >
                            Detener
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <input
                    ref={voiceRecordInputRef}
                    type="file"
                    accept="audio/*"
                    capture="microphone"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      e.currentTarget.value = '';
                      if (!f) return;
                      setVoiceSourceFile(f);
                      setVoiceVerifyFile(null);
                      setVoiceStartSec(0);
                      setVoiceEndSec(voiceTrimMaxSec);
                      setVoiceTrimNowSec(0);
                      try {
                        voiceTrimAudioRef.current?.pause?.();
                      } catch {
                      }
                      setVoiceTrimIsPlaying(false);
                      setVoiceCreateStep('trim');
                      setVoiceCreateError('');
                    }}
                  />
                  <input
                    ref={voiceUploadInputRef}
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      e.currentTarget.value = '';
                      if (!f) return;
                      setVoiceSourceFile(f);
                      setVoiceVerifyFile(null);
                      setVoiceStartSec(0);
                      setVoiceEndSec(voiceTrimMaxSec);
                      setVoiceTrimNowSec(0);
                      try {
                        voiceTrimAudioRef.current?.pause?.();
                      } catch {
                      }
                      setVoiceTrimIsPlaying(false);
                      setVoiceCreateStep('trim');
                      setVoiceCreateError('');
                    }}
                  />
                  <input
                    ref={voiceVerifyRecordInputRef}
                    type="file"
                    accept="audio/*"
                    capture="microphone"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      e.currentTarget.value = '';
                      if (!f) return;
                      setVoiceVerifyFile(f);
                      setVoiceCreateError('');
                      setVoiceCreateStep('generating_voice');
                      setTimeout(() => {
                        generateCustomVoice(f).catch(() => {});
                      }, 0);
                    }}
                  />
                  <input
                    ref={voiceVerifyUploadInputRef}
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      e.currentTarget.value = '';
                      if (!f) return;
                      setVoiceVerifyFile(f);
                      setVoiceCreateError('');
                      setVoiceCreateStep('generating_voice');
                      setTimeout(() => {
                        generateCustomVoice(f).catch(() => {});
                      }, 0);
                    }}
                  />

                  {voiceCreateStep === 'generating_phrase' ? (
                    <div className="mt-4 flex items-center gap-3 text-slate-200">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <div>Generando frase…</div>
                    </div>
                  ) : null}

                  {voiceCreateStep === 'phrase_ready' ? (
                    <div className="mt-4 glass-card rounded-2xl p-4 border border-white/10">
                      <div className="text-white font-extrabold">Lee esto en voz alta</div>
                      <div className="mt-2 text-slate-200 text-sm whitespace-pre-wrap">{voiceValidateInfo}</div>
                      <button
                        type="button"
                        onClick={() => {
                          setVoiceCreateError('');
                          startVoiceRecorder('verify', 10).catch((e) => {
                            setVoiceCreateError(e instanceof Error ? e.message : String(e));
                          });
                        }}
                        className="mt-3 w-full bg-emerald-500 hover:bg-emerald-400 text-black h-[44px] rounded-full font-extrabold text-sm"
                      >
                        Empezar grabación
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setVoiceCreateStep('pick_verify');
                          setVoiceCreateError('');
                        }}
                        className="mt-3 w-full bg-white/5 border border-white/10 rounded-full py-3 text-slate-200 font-semibold hover:bg-white/10 transition-colors"
                      >
                        Ya la grabé / subir archivo
                      </button>
                    </div>
                  ) : null}

                  {voiceCreateStep === 'pick_verify' ? (
                    <div className="mt-4 glass-card rounded-2xl p-4 border border-white/10">
                      <div className="text-white font-extrabold">Sube la grabación de la frase</div>
                      <div className="mt-2 text-slate-400 text-sm">Recomendación: canta o habla claro, sin ruido.</div>
                      {voiceVerifyFile && voiceVerifyPreviewUrl ? (
                        <div className="mt-3">
                          <div className="text-slate-300 text-xs font-semibold mb-1">Tu grabación</div>
                          <audio controls preload="metadata" src={voiceVerifyPreviewUrl} className="w-full" />
                        </div>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => generateCustomVoice(voiceVerifyFile || undefined).catch(() => {})}
                        disabled={voiceBusy || !voiceVerifyFile}
                        className="mt-3 w-full bg-emerald-500 hover:bg-emerald-400 text-black h-[44px] rounded-full font-extrabold text-sm disabled:opacity-60"
                      >
                        Continuar
                      </button>
                    </div>
                  ) : null}

                  {voiceCreateStep === 'generating_voice' ? (
                    <div className="mt-4 glass-card rounded-2xl p-6 border border-white/10 text-center">
                      <div className="text-emerald-300 font-extrabold text-lg">¡Listo!</div>
                      <div className="mt-3 flex items-center justify-center gap-3 text-slate-200">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <div>Verificando tu voz…</div>
                      </div>
                    </div>
                  ) : null}

                  {voiceCreateStep === 'skill' ? (
                    <div className="mt-4 glass-card rounded-2xl p-6 border border-white/10 text-center">
                      <div className="text-white font-extrabold text-lg">Preparando tu voz</div>
                      <div className="mt-2 text-slate-400 text-sm">Pregunta rápida mientras terminamos.</div>
                      <div className="mt-4 text-white font-extrabold text-xl">¿Cómo describirías tu canto?</div>
                      <div className="mt-5 space-y-3">
                        {[
                          { key: 'beginner', label: 'Principiante', desc: 'Todavía estoy encontrando mi voz' },
                          { key: 'intermediate', label: 'Intermedio', desc: 'Puedo sostener la melodía' },
                          { key: 'advanced', label: 'Avanzado', desc: 'La gente lo nota' },
                          { key: 'professional', label: 'Profesional', desc: 'Es a lo que me dedico' },
                        ].map((opt) => (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => {
                              const next = String(opt.key);
                              setVoiceSkillLevel(next);
                              const id = (voiceGeneratedVoiceId || '').toString().trim();
                              const nm = (voiceDetailsName || newVoiceName || 'Mi voz').toString().trim() || 'Mi voz';
                              if (id) {
                                saveSunoVoiceToDb(
                                  { voiceId: id, name: nm, createdAt: new Date().toISOString(), taskId: voiceGenerateTaskId || undefined, status: voiceIsAvailable ? 'ready' : 'processing' },
                                  { singerSkillLevel: next }
                                ).catch(() => {});
                              }
                              setVoiceCreateStep('details');
                            }}
                            className="w-full rounded-2xl bg-white/5 border border-white/10 px-5 py-4 text-left hover:bg-white/10 transition-colors"
                          >
                            <div className="text-white font-extrabold">{opt.label}</div>
                            <div className="text-slate-400 text-sm">{opt.desc}</div>
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            setVoiceSkillLevel('');
                            setVoiceCreateStep('details');
                          }}
                          className="w-full rounded-2xl bg-white/5 border border-white/10 px-5 py-4 text-white font-extrabold hover:bg-white/10 transition-colors"
                        >
                          Omitir
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {voiceCreateStep === 'details' ? (
                    <div className="mt-4 glass-card rounded-2xl p-5 border border-white/10">
                      <div className="text-white font-extrabold text-lg text-center">Detalles de la voz</div>

                      <div className="mt-5 grid grid-cols-1 md:grid-cols-[180px_1fr] gap-5 items-start">
                        <div className="flex flex-col items-center">
                          <button
                            type="button"
                            onClick={() => voiceDetailsImageInputRef.current?.click()}
                            className="w-[140px] h-[140px] rounded-[36px] bg-white/5 border border-white/10 overflow-hidden flex items-center justify-center"
                            disabled={voiceDetailsSaving}
                          >
                            {voiceDetailsImageKey ? (
                              <img src={r2ValueToProxyUrl(voiceDetailsImageKey)} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <img src={makeAudioCoverSvgUrl((voiceDetailsName || 'Voz').toString())} alt="" className="w-full h-full object-cover opacity-95" />
                            )}
                          </button>
                          <input
                            ref={voiceDetailsImageInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0] || null;
                              e.currentTarget.value = '';
                              if (!f) return;
                              if (f.size > 25 * 1024 * 1024) {
                                setVoiceCreateError('La imagen es muy pesada. Usa una menor a 25 MB.');
                                return;
                              }
                              (async () => {
                                setVoiceCreateError('');
                                const t = await getAccessToken();
                                if (!t.ok) throw new Error(t.error || 'No se pudo iniciar sesión.');
                                const ab = await f.arrayBuffer();
                                const fileArray = Array.from(new Uint8Array(ab));
                                const safeCt = (f.type || 'image/jpeg').toString().slice(0, 120);
                                const userId = (await supabaseBrowser.auth.getUser()).data.user?.id || 'unknown';
                                const id = (voiceGeneratedVoiceId || '').toString().trim() || `temp_${Date.now()}`;
                                const path = `personas/${userId}/suno_voice_${id}_${Date.now()}.jpg`;
                                const r = await fetch('/api/account/upload-profile-image', {
                                  method: 'POST',
                                  headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
                                  body: JSON.stringify({ path, data: fileArray, contentType: safeCt }),
                                });
                                const out = await r.json().catch(() => ({}));
                                if (!r.ok) throw new Error((out?.error || out?.detail || 'No pude subir la imagen.').toString());
                                const key = (out?.key || path).toString().trim() || path;
                                setVoiceDetailsImageKey(key);
                              })().catch((e) => setVoiceCreateError(e instanceof Error ? e.message : String(e)));
                            }}
                          />
                          <div className="mt-3 text-slate-400 text-xs">Toca para cambiar la imagen</div>
                        </div>

                        <div className="min-w-0">
                          <div className="glass-card rounded-2xl p-4 border border-white/10">
                            <div className="text-slate-400 text-xs font-semibold">Nombre de la voz</div>
                            <input
                              value={voiceDetailsName}
                              onChange={(e) => setVoiceDetailsName(e.target.value)}
                              placeholder="Ponle un nombre"
                              className="mt-2 w-full bg-transparent outline-none text-white font-extrabold"
                              maxLength={120}
                            />
                          </div>

                          <div className="mt-3 glass-card rounded-2xl p-4 border border-white/10">
                            <div className="text-slate-400 text-xs font-semibold">Tags de estilo (opcional)</div>
                            <input
                              value={voiceDetailsTags}
                              onChange={(e) => setVoiceDetailsTags(e.target.value)}
                              placeholder="Ej: regional, mariachi, norteño"
                              className="mt-2 w-full bg-transparent outline-none text-white"
                              maxLength={220}
                            />
                          </div>

                          <div className="mt-3 glass-card rounded-2xl p-4 border border-white/10">
                            <div className="text-slate-400 text-xs font-semibold">Descripción (opcional)</div>
                            <textarea
                              value={voiceDetailsDescription}
                              onChange={(e) => setVoiceDetailsDescription(e.target.value)}
                              placeholder="Agrega una descripción"
                              className="mt-2 w-full bg-transparent outline-none text-white resize-none"
                              rows={3}
                              maxLength={800}
                            />
                          </div>

                          <button
                            type="button"
                            onClick={() => setVoiceDetailsIsPublic((v) => !v)}
                            className={cn(
                              "mt-3 w-full rounded-2xl p-4 border text-left transition-colors",
                              voiceDetailsIsPublic ? "bg-emerald-500/15 border-emerald-500/25 text-emerald-200" : "bg-white/5 border-white/10 text-slate-200 hover:bg-white/10"
                            )}
                          >
                            <div className="font-extrabold">Público</div>
                            <div className="text-xs opacity-80">Permite que otros usuarios encuentren esta voz</div>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              const id = (voiceGeneratedVoiceId || '').toString().trim();
                              if (!id) return;
                              setVoiceDetailsSaving(true);
                              persistSunoVoiceProfile(id)
                                .then(() => {
                                  setIsCreateVoiceOpen(false);
                                  resetVoiceWizard();
                                })
                                .catch(() => {})
                                .finally(() => setVoiceDetailsSaving(false));
                            }}
                            disabled={voiceDetailsSaving || !(voiceGeneratedVoiceId || '').toString().trim()}
                            className="mt-4 w-full bg-white text-black h-[48px] rounded-full font-extrabold disabled:opacity-60"
                          >
                            Guardar
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </>
              )}
              </div>
            </div>
          </div>
        </div>
      )}

      {isAudioModalOpen && audioFile && (
        <div className="fixed inset-0 md:absolute md:inset-0 z-[130] bg-black/70 flex items-end md:items-center justify-center">
          <button
            className="absolute inset-0 w-full h-full"
            onClick={() => {
              if (audioJustPickedAt) return;
              if (isUploadingAudio || !audioUploadUrl) return;
              setIsAudioModalOpen(false);
            }}
            aria-label="Cerrar"
          />
          <div className="relative w-full md:w-11/12 md:max-w-5xl bg-[#0b0f16] border border-white/10 rounded-t-3xl md:rounded-3xl overflow-hidden shadow-[0_-20px_60px_rgba(0,0,0,0.6)] flex flex-col max-h-[90dvh]">
            {audioJustPickedAt ? <div className="absolute inset-0 z-[10]" /> : null}
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="text-white font-extrabold">Crear desde tu audio</div>
              <button
                onClick={() => {
                  if (audioJustPickedAt) return;
                  if (isUploadingAudio || !audioUploadUrl) return;
                  setIsAudioModalOpen(false);
                }}
                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto min-h-0">
              {(() => {
                const pct = Math.max(0, Math.min(100, Math.round(Number(uploadProgress || 0))));
                const hot = pct >= 87 && pct < 100;
                const deg = Math.max(0, Math.min(100, Number(uploadProgress || 0))) * 3.6;
                const ringColor = pct >= 100 ? '#3b82f6' : hot ? '#ef4444' : '#22c55e';
                const pctText = `${pct}%`;
                return (
                  <>
              <div className="flex items-center gap-4">
                <div
                  className="w-14 h-14 rounded-full p-[2px] shrink-0"
                  style={{
                    background: `conic-gradient(${ringColor} ${deg}deg, rgba(255,255,255,0.10) 0deg)`,
                  }}
                >
                  <div className="w-full h-full rounded-full bg-[#0b0f16] border border-white/10 flex items-center justify-center">
                    <div className={cn("text-xs font-extrabold", hot ? "text-red-400" : "text-slate-100")}>{pctText}</div>
                  </div>
                </div>
                <div className="w-14 h-14 rounded-2xl overflow-hidden bg-white/5 border border-white/10 shrink-0">
                  <img
                    src={makeAudioCoverSvgUrl((audioFile?.name || 'audio').toString())}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="min-w-0">
                  <div className="text-white font-extrabold truncate">{audioFile.name}</div>
                  <div className={cn("text-sm", pct >= 100 ? "text-blue-300" : hot ? "text-red-300" : "text-slate-400")}>
                    {isUploadingAudio ? 'Subiendo…' : audioUploadUrl ? 'Listo' : 'Preparando…'}
                  </div>
                </div>
              </div>

              {audioUploadError && (
                <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-2xl p-3 text-sm text-red-200">
                  <div>{audioUploadError}</div>
                  {String(audioUploadError || '').toLowerCase().includes('mp3') ? (
                    <>
                      <button
                        type="button"
                        onClick={openMp3Converter}
                        className="mt-2 w-full bg-yellow-400 hover:bg-yellow-300 text-black h-[44px] rounded-full font-extrabold text-sm"
                      >
                        Abrir Convertidor a MP3 (Opción 1)
                      </button>
                      <button
                        type="button"
                        onClick={openMp3ConverterAlt}
                        className="mt-2 w-full bg-yellow-400 hover:bg-yellow-300 text-black h-[44px] rounded-full font-extrabold text-sm"
                      >
                        Abrir Convertidor a MP3 (Opción 2)
                      </button>
                    </>
                  ) : null}
                </div>
              )}

              <div className="mt-4 text-slate-300 text-sm">Elige qué quieres hacer</div>
                  </>
                );
              })()}

              <div className="grid grid-cols-2 gap-3 mt-3">
                <button
                  onClick={() => setAudioAction('cover')}
                  className={cn(
                    "rounded-2xl p-4 border transition-colors text-left",
                    audioAction === 'cover' ? "border-emerald-400/70 bg-emerald-500/10" : "border-white/10 bg-white/5 hover:bg-white/10"
                  )}
                  disabled={isUploadingAudio}
                >
                  <div className="w-10 h-10 rounded-xl bg-black/30 border border-white/10 flex items-center justify-center text-slate-200">
                    <AudioLines className="w-5 h-5" />
                  </div>
                  <div className="mt-3 text-white font-bold">Cover</div>
                </button>

                <button
                  onClick={() => setAudioAction('instrumental')}
                  className={cn(
                    "rounded-2xl p-4 border transition-colors text-left",
                    audioAction === 'instrumental' ? "border-emerald-400/70 bg-emerald-500/10" : "border-white/10 bg-white/5 hover:bg-white/10"
                  )}
                  disabled={isUploadingAudio}
                >
                  <div className="w-10 h-10 rounded-xl bg-black/30 border border-white/10 flex items-center justify-center text-slate-200">
                    <Music className="w-5 h-5" />
                  </div>
                  <div className="mt-3 text-white font-bold">Instrumental</div>
                </button>

                <button
                  onClick={() => setAudioAction('vocals')}
                  className={cn(
                    "rounded-2xl p-4 border transition-colors text-left",
                    audioAction === 'vocals' ? "border-emerald-400/70 bg-emerald-500/10" : "border-white/10 bg-white/5 hover:bg-white/10"
                  )}
                  disabled={isUploadingAudio}
                >
                  <div className="w-10 h-10 rounded-xl bg-black/30 border border-white/10 flex items-center justify-center text-slate-200">
                    <User className="w-5 h-5" />
                  </div>
                  <div className="mt-3 text-white font-bold">Clonador</div>
                </button>

                <button
                  onClick={() => setAudioAction('extend')}
                  className={cn(
                    "rounded-2xl p-4 border transition-colors text-left",
                    audioAction === 'extend' ? "border-emerald-400/70 bg-emerald-500/10" : "border-white/10 bg-white/5 hover:bg-white/10"
                  )}
                  disabled={isUploadingAudio}
                >
                  <div className="w-10 h-10 rounded-xl bg-black/30 border border-white/10 flex items-center justify-center text-slate-200">
                    <Pencil className="w-5 h-5" />
                  </div>
                  <div className="mt-3 text-white font-bold">Extender</div>
                </button>

                <button
                  onClick={() => setAudioAction('library')}
                  className={cn(
                    "rounded-2xl p-4 border transition-colors text-left",
                    audioAction === 'library' ? "border-emerald-400/70 bg-emerald-500/10" : "border-white/10 bg-white/5 hover:bg-white/10"
                  )}
                  disabled={isUploadingAudio}
                >
                  <div className="w-10 h-10 rounded-xl bg-black/30 border border-white/10 flex items-center justify-center text-slate-200">
                    <Library className="w-5 h-5" />
                  </div>
                  <div className="mt-3 text-white font-bold">Biblioteca</div>
                </button>
              </div>

              <button
                onClick={() => {
                  if (audioJustPickedAt) return;
                  continueFromAudio().catch(() => {});
                }}
                disabled={
                  audioJustPickedAt || isUploadingAudio || !audioUploadUrl || (audioAction === 'library' && (!audioUploadUrl || isUploadingAudio))
                }
                className="mt-4 w-full bg-green-500 hover:bg-green-400 text-[#020617] h-[52px] rounded-full font-extrabold text-sm transition-colors disabled:opacity-60"
              >
                Listo
              </button>

              <button
                onClick={() => {
                  if (audioFile) {
                    uploadAudio(audioFile).catch(() => {});
                    return;
                  }
                }}
                disabled={isUploadingAudio || !audioFile}
                className="mt-3 w-full bg-white/5 border border-white/10 rounded-full py-3 text-slate-200 font-semibold hover:bg-white/10 transition-colors disabled:opacity-60"
              >
                Reintentar subida
              </button>

              <button
                onClick={() => {
                  if (audioJustPickedAt) return;
                  if (isUploadingAudio) return;
                  clearAudio();
                }}
                disabled={audioJustPickedAt || isUploadingAudio}
                className="mt-3 w-full bg-white/5 border border-white/10 rounded-full py-3 text-slate-200 font-semibold hover:bg-white/10 transition-colors"
              >
                Eliminar audio
              </button>

              <button
                onClick={() => {
                  if (audioJustPickedAt) return;
                  if (isUploadingAudio) return;
                  clearAudio();
                  window.setTimeout(() => audioInputRef.current?.click(), 0);
                }}
                disabled={audioJustPickedAt || isUploadingAudio}
                className="mt-3 w-full bg-white/5 border border-white/10 rounded-full py-3 text-slate-200 font-semibold hover:bg-white/10 transition-colors"
              >
                Subir otro audio
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SimpleForm({ instrumental, setInstrumental, description, setDescription, isDev }: any) {
  return (
    <>
      <div className="glass-card rounded-3xl p-5 relative">
        <div className="flex items-start justify-between mb-2">
          <label className="text-sm font-semibold text-slate-200">Descripción de la canción</label>
          <button className="bg-white/5 p-1.5 rounded-full text-slate-300 hover:text-white transition-colors">
            <Dices className="w-4 h-4" />
          </button>
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ej: una balada pop sobre un amanecer en la playa..."
          className="w-full bg-transparent text-white placeholder:text-slate-500 resize-none outline-none min-h-[80px]"
        />
        
        <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          <button className="flex-shrink-0 bg-white/5 w-8 h-8 rounded-full flex items-center justify-center text-slate-400">
            <RefreshCw className="w-4 h-4" />
          </button>
          <span className="flex-shrink-0 bg-indigo-500/20 text-indigo-300 px-3 py-1.5 rounded-full text-xs font-medium border border-indigo-500/20 truncate max-w-[150px]">
            female background vocals
          </span>
          <span className="flex-shrink-0 bg-indigo-500/20 text-indigo-300 px-3 py-1.5 rounded-full text-xs font-medium border border-indigo-500/20 truncate max-w-[150px]">
            dungeon neo so...
          </span>
        </div>
      </div>

        <div className="glass-card rounded-2xl p-4 flex items-center justify-between">
          <button className="flex items-center gap-2 text-white font-medium hover:text-gray-300 transition-colors">
            <Plus className="w-5 h-5" /> Letras
          </button>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-300">Instrumental</span>
            <Toggle checked={instrumental} onChange={() => setInstrumental(!instrumental)} />
          </div>
        </div>
    </>
  );
}

function CustomForm({
  instrumental,
  setInstrumental,
  description,
  lyrics,
  setLyrics,
  gender,
  setGender,
  title,
  setTitle,
  instructions,
  setInstructions,
  isBoostingStyle,
  onBoostStyle,
  showMoreOptions,
  setShowMoreOptions,
  weirdness,
  setWeirdness,
  styleInfluence,
  setStyleInfluence,
  audioInfluence,
  setAudioInfluence,
  audioAction,
  audioFile,
  setAudioFile,
  audioInputRef,
  audioCaptureInputRef,
  audioUploadUrl,
  externalAudioLabel,
  audioLyricsStatus,
  isUploadingAudio,
  onUploadAudio,
  onClearAudio,
  onCoverFromAudio,
  onOpenBalance,
  credits,
  onOpenPersonaPicker,
  onPickAudio,
  uploadProgress,
  onOpenAudioModal,
  selectedPersona,
  onClearPersona,
  isTranscribingAudioLyrics,
  onTranscribeAudioLyrics,
  setAudioUploadError,
  openMp3Converter,
  openMp3ConverterAlt,
  generateLyricsWithAI,
  isGeneratingLyrics,
  isDev,
  onRecordStudioAudio
}: any) {
  const [isLyricsExpanded, setIsLyricsExpanded] = useState(false);
  const [prevLyrics, setPrevLyrics] = useState<string>('');

  const normalizeLyrics = (t: string) => {
    const lines = (t || '').toString().replaceAll('\r\n', '\n').split('\n');
    const mapped = lines.map((line) => {
      const s = line.trim();
      if (!s) return '';
      const lower = s.toLowerCase();
      const isTag =
        lower === 'coro' ||
        lower.startsWith('coro ') ||
        lower === 'chorus' ||
        lower.startsWith('chorus ') ||
        lower.startsWith('verso') ||
        lower.startsWith('verse') ||
        lower.startsWith('pre-coro') ||
        lower.startsWith('pre coro') ||
        lower.startsWith('bridge') ||
        lower.startsWith('puente') ||
        lower.startsWith('outro') ||
        lower.startsWith('intro');
      if (isTag && !s.startsWith('[')) return `[${s.replaceAll(':', '').trim()}]`;
      if (s.startsWith('[') && s.endsWith(']')) return s;
      if (s.endsWith(':') && s.length < 20) return `[${s.slice(0, -1).trim()}]`;
      return line;
    });
    return mapped.join('\n').replaceAll(/\n{3,}/g, '\n\n').trim();
  };

  const setLyricsWithUndo = (next: string) => {
    const current = (lyrics || '').toString();
    const n = (next || '').toString();
    if (n === current) return;
    setPrevLyrics(current);
    setLyrics(n);
  };

  

  return (
    <>
      <div className="flex gap-4">
        <div className="flex-1 flex gap-2">
          <button
            type="button"
            onClick={() => {
              if (audioFile) {
                onOpenAudioModal?.();
                return;
              }
              audioInputRef?.current?.click?.();
            }}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-white/10 rounded-2xl text-sm font-semibold border border-white/5 text-slate-300 hover:text-white cursor-pointer relative transition-colors shadow-inner"
          >
            <Plus className="w-5 h-5 text-slate-400" /> {audioUploadUrl ? 'Audio cargado' : 'Audio'}
          </button>
          {!!audioUploadUrl && (
            <button
              type="button"
              onClick={() => onClearAudio?.()}
              className="w-12 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-center text-slate-200"
              aria-label="Eliminar audio"
              title="Eliminar audio"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}
        </div>
        <input 
          type="file" 
          accept="audio/*" 
          className="hidden" 
          ref={audioInputRef}
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              const f = e.target.files[0];
              e.currentTarget.value = '';
              onPickAudio(f);
            }
          }}
        />
        <input
          type="file"
          accept="audio/*"
          capture="microphone"
          className="hidden"
          ref={audioCaptureInputRef}
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              const f = e.target.files[0];
              e.currentTarget.value = '';
              onPickAudio(f);
            }
          }}
        />
        <button
          onClick={onOpenPersonaPicker}
          className="flex-1 flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-white/10 rounded-2xl text-sm font-semibold border border-white/5 text-slate-300 hover:text-white transition-colors shadow-inner"
        >
          <Plus className="w-5 h-5 text-slate-400" /> Clonador
        </button>
      </div>

      {!audioUploadUrl && (
        <div className="mt-2 px-1">
          <button
            type="button"
            onClick={openMp3Converter}
            className="text-xs font-semibold text-yellow-300 hover:text-yellow-200 underline underline-offset-4"
          >
            Si tu audio no se sube, convertir a MP3 (Opción 1)
          </button>
          <button
            type="button"
            onClick={openMp3ConverterAlt}
            className="mt-2 text-xs font-semibold text-yellow-300 hover:text-yellow-200 underline underline-offset-4"
          >
            Convertir a MP3 (Opción 2)
          </button>
        </div>
      )}

      {(audioFile || audioUploadUrl) && (
        <div className="glass-card rounded-2xl p-4 border border-white/10 mt-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-white font-bold truncate">{audioFile ? audioFile.name : (externalAudioLabel || 'Audio listo')}</div>
              <div className="text-xs text-slate-400">
                {isUploadingAudio || !audioUploadUrl
                  ? `Subiendo… ${Math.max(0, Math.min(100, Math.round(Number(uploadProgress || 0))))}%`
                  : `Audio listo · Acción: ${
                      audioAction === 'cover'
                        ? 'Cover'
                        : audioAction === 'instrumental'
                          ? 'Instrumental'
                          : audioAction === 'vocals'
                            ? 'Clonador'
                            : audioAction === 'extend'
                              ? 'Extender'
                              : audioAction === 'library'
                                ? 'Biblioteca'
                                : 'Cover'
                    }`}
              </div>
              {audioUploadUrl && (
                <div className="text-[11px] text-slate-500 mt-1">
                  Edita letras/instrucciones aquí, y cuando toques “Crear” se empezará el proceso y te mandará a Biblioteca.
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                if (audioFile) {
                  onOpenAudioModal?.();
                  return;
                }
                audioInputRef?.current?.click?.();
              }}
              className="shrink-0 bg-white/5 border border-white/10 rounded-full px-4 py-2 text-xs font-bold text-slate-200 hover:bg-white/10 transition-colors"
            >
              Cambiar
            </button>
          </div>
          <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-emerald-400"
              style={{ width: `${Math.max(0, Math.min(100, Math.round(Number(uploadProgress || 0))))}%` }}
            />
          </div>
          {!!audioUploadUrl && !isUploadingAudio && (
            <div className="mt-3">
              <audio
                controls
                preload="metadata"
                src={(audioPlayableUrl || audioUploadUrl).toString()}
                className="w-full"
                onError={() => {
                  refreshAudioPlayableUrl().catch(() => {});
                }}
              />
            </div>
          )}
        </div>
      )}

      {selectedPersona?.voiceId && (
        <div className="glass-card rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-200 shrink-0">
              <User className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-white font-bold truncate">{selectedPersona.name || 'Voz'}</div>
              <div className="text-slate-500 text-xs">Usando voz</div>
            </div>
          </div>
          <button onClick={onClearPersona} className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {instrumental ? (
          <div className="glass-card rounded-2xl p-4 flex items-center justify-between mt-2 border border-white/10">
            <div className="min-w-0">
              <div className="text-white font-extrabold">Instrumental</div>
              <div className="text-[11px] text-slate-400 truncate">Se crea sin letra</div>
            </div>
            <Toggle checked={instrumental} onChange={() => setInstrumental(!instrumental)} />
          </div>
        ) : (
        <div className="bg-[#111318] border border-white/5 rounded-2xl p-5 flex flex-col mt-2 shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <label className="font-bold text-white text-base">Letras</label>
              <button
                type="button"
                onClick={() => {
                  if (!prevLyrics) return;
                  const current = (lyrics || '').toString();
                  setPrevLyrics(current);
                  setLyrics(prevLyrics);
                }}
                disabled={!prevLyrics}
                className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200 disabled:opacity-40"
                aria-label="Regresar letra"
                title="Regresar letra"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  const current = (lyrics || '').toString();
                  if (!current.trim()) {
                    setLyrics('');
                    return;
                  }
                  if (!confirm('¿Seguro que quieres eliminar la letra?')) return;
                  setPrevLyrics(current);
                  setLyrics('');
                }}
                className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200 hover:bg-white/10"
                aria-label="Eliminar letra"
                title="Eliminar letra"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={generateLyricsWithAI}
                disabled={isGeneratingLyrics}
                className="text-slate-400 hover:text-white transition-colors disabled:opacity-50" 
                type="button"
                aria-label="Generar letras con IA"
                title="Generar letras con IA basadas en tu tema"
              >
                {isGeneratingLyrics ? (
                  <RefreshCw className="w-5 h-5 animate-spin" />
                ) : (
                  <ListMusic className="w-5 h-5" />
                )}
              </button>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-300">Instrumental</span>
                <Toggle checked={instrumental} onChange={() => setInstrumental(!instrumental)} />
              </div>
            </div>
          </div>
          
          <div className="relative flex flex-col">
            <textarea
              value={lyrics}
              onChange={(e) => setLyricsWithUndo(e.target.value)}
              placeholder="Agrega tu propia letra (se guardará en tu Biblioteca)"
              className="w-full bg-transparent text-[15px] placeholder:text-slate-500 font-medium resize-none outline-none min-h-[120px] text-white"
            />
            {!!audioLyricsStatus && (
              <div className="mt-2 text-[12px] text-slate-400">
                {audioLyricsStatus}
              </div>
            )}
            
            <div className="flex justify-end items-center gap-2 mt-2">
              <button
                type="button"
                onClick={() => setIsLyricsExpanded(true)}
                className="bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 w-10 h-10 rounded-full text-sm font-semibold transition-colors flex items-center justify-center"
                aria-label="Expandir letras"
                title="Expandir letras"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
        )}

      {isLyricsExpanded && (
        <div className="fixed inset-0 z-[140] bg-black/70 flex items-end md:items-center justify-center">
          <button className="absolute inset-0 w-full h-full" onClick={() => setIsLyricsExpanded(false)} aria-label="Cerrar" />
          <div className="relative w-full md:w-11/12 md:max-w-5xl bg-[#0b0f16] border border-white/10 rounded-t-3xl md:rounded-3xl overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="text-white font-extrabold">Letras</div>
              <button
                onClick={() => setIsLyricsExpanded(false)}
                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              <textarea
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                placeholder="Agrega tu propia letra (se guardará en tu Biblioteca)"
                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-[15px] text-white placeholder:text-slate-500 outline-none min-h-[55vh] resize-none"
              />
            </div>
          </div>
        </div>
      )}

      <div className="bg-[#111318] border border-white/5 rounded-2xl p-5 shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] mt-4">
        <button
          type="button"
          onClick={() => setShowMoreOptions(!showMoreOptions)}
          className="w-full flex items-center justify-between"
        >
          <div className="text-white font-bold text-base">Más opciones</div>
          <ChevronDown className={cn("w-5 h-5 text-slate-400 transition-transform", showMoreOptions ? "rotate-180" : "rotate-0")} />
        </button>

        {showMoreOptions && (
          <div className="mt-4 space-y-4">
            <SliderRow
              label="Weirdness"
              value={weirdness}
              onChange={setWeirdness}
            />
            <SliderRow
              label="Influencia de estilo"
              value={styleInfluence}
              onChange={setStyleInfluence}
            />
            <SliderRow
              label="Influencia de audio"
              value={audioInfluence}
              onChange={setAudioInfluence}
            />
          </div>
        )}
      </div>

      {/* Instrucciones (Estilos) */}
      <div className="bg-[#111318] border border-white/5 rounded-2xl p-5 shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] mt-4">
        <label className="font-bold text-white text-base mb-4 block">Instrucciones</label>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Describe el estilo, el ambiente o los instrumentos de tu música"
          className="w-full bg-transparent text-[15px] placeholder:text-slate-500 font-medium resize-none outline-none min-h-[80px] text-white"
        />
        
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar mt-4">
          <button className="flex-shrink-0 bg-white/5 w-9 h-9 rounded-full flex items-center justify-center text-slate-400 border border-white/5">
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => onBoostStyle?.()}
            disabled={Boolean(isBoostingStyle)}
            className="flex-shrink-0 bg-white/5 w-9 h-9 rounded-full flex items-center justify-center text-slate-400 border border-white/5 disabled:opacity-60"
            aria-label="Optimizar estilo"
            title="Optimizar estilo"
          >
            <RefreshCw className={cn("w-4 h-4", isBoostingStyle ? "animate-spin" : "")} />
          </button>
          <span className="flex-shrink-0 bg-white/5 text-slate-300 px-4 py-2 rounded-full text-sm font-medium border border-white/5 truncate max-w-[200px]">
            raspy female vocals
          </span>
          <span className="flex-shrink-0 bg-white/5 text-slate-300 px-4 py-2 rounded-full text-sm font-medium border border-white/5 truncate max-w-[200px]">
            modern danceh...
          </span>
        </div>
      </div>

      {/* Género */}
      {!instrumental ? (
        <div className="bg-[#111318] border border-white/5 rounded-2xl p-5 shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] mt-4 flex items-center justify-between">
          <label className="font-bold text-white text-base">Género</label>
          <div className="flex gap-4">
            <button 
              onClick={() => setGender('Masculino')}
              className={cn("text-sm font-semibold transition-colors", gender === 'Masculino' ? "text-slate-200" : "text-slate-500")}
            >
              Masculino
            </button>
            <button 
              onClick={() => setGender('Femenino')}
              className={cn("text-sm font-semibold transition-colors", gender === 'Femenino' ? "text-slate-200" : "text-slate-500")}
            >
              Femenino
            </button>
          </div>
        </div>
      ) : null}

      {/* Título de la canción */}
      <div className="bg-[#111318] border border-white/5 rounded-2xl p-5 shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] mt-4 mb-4">
        <label className="font-bold text-white text-base mb-4 block">Título de la canción <span className="text-slate-500 font-normal">(Opcional)</span></label>
        <div className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3 border border-white/5">
          <input 
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value.substring(0, 80))}
            placeholder="Introduce el título de tu canción"
            className="bg-transparent text-white placeholder:text-slate-500 outline-none flex-1 text-[15px]"
          />
          <span className="text-slate-500 text-sm">{title.length}/80</span>
        </div>
        <button
          type="button"
          onClick={() => onOpenBalance?.()}
          className="mt-4 w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 flex items-center justify-between hover:bg-white/10 transition-colors"
        >
          <div className="text-slate-200 font-extrabold">Saldo</div>
          <div className="flex items-center gap-2">
            <div className="text-slate-300 text-sm font-semibold">Créditos: {Number(credits || 0)}</div>
            <ChevronDown className="w-4 h-4 text-slate-400" />
          </div>
        </button>
      </div>
    </>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button 
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={cn(
        "w-10 h-6 rounded-full flex items-center px-1 transition-colors relative",
        checked ? "bg-indigo-500" : "bg-white/10"
      )}
    >
      <div 
        className={cn(
          "w-4 h-4 bg-white rounded-full transition-transform shadow-md",
          checked ? "translate-x-4" : "translate-x-0"
        )}
      />
    </button>
  );
}

function SliderRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  const v = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  const hot = v >= 87;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-slate-300 text-sm font-semibold">{label}</div>
        <div className="text-slate-400 text-sm">{v}%</div>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={v}
        onChange={(e) => onChange(Math.max(0, Math.min(100, Number(e.target.value))))}
        className={cn("w-full", hot ? "accent-red-500" : "accent-emerald-500")}
      />
    </div>
  );
}
