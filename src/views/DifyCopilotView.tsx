import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  History,
  Image as ImageIcon,
  Library,
  Loader2,
  Menu,
  MessageSquarePlus,
  Mic,
  MoreHorizontal,
  Music2,
  Paperclip,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Send,
  Sparkles,
  Sun,
  Moon,
  Trash2,
  User,
  WalletCards,
  X,
} from 'lucide-react';
import { getAccessToken, supabaseBrowser } from '@/lib/supabaseBrowser';
import { cn } from '@/lib/utils';
import type { ViewTab } from '@/types';
import { useTheme } from '../theme/ThemeProvider';

type ChatRole = 'user' | 'assistant';

type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  createdAt: number;
  structured?: null | ({ action: 'ready_to_generate' } & ReadyToGenerate) | { action: 'transcription_ready'; lyrics: string };
  persisted?: boolean;
  attachment?: null | {
    kind: 'image' | 'audio';
    previewUrl: string;
    name: string;
    bytes: number;
  };
};

type ReadyToGenerate = {
  prompt: string;
  style: string;
  title: string;
  instrumental: boolean;
  gender: 'Masculino' | 'Femenino';
};

type PendingGeneration = {
  task_id?: string;
  status?: string;
  startedAt: number;
};

type ConversationSummary = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  pinned?: boolean;
  deleted_at?: string | null;
  internal_dify_conversation_id?: string | null;
};

function uid() {
  if (typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function') {
    return (crypto as any).randomUUID();
  }
  return 'm_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

const COMPOSER_CHAR_LIMIT = 20000;
const DRAFT_STORAGE_PREFIX = 'luciana_bot_draft_v1__';
function draftStorageKey(userId: string | null | undefined, conversationId: string | null | undefined) {
  const u = String(userId || 'anon').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'anon';
  const c = String(conversationId || 'default').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'default';
  return DRAFT_STORAGE_PREFIX + u + '__' + c;
}
function readStoredDraft(userId: string | null | undefined, conversationId: string | null | undefined): string {
  if (typeof window === 'undefined' || !window.localStorage) return '';
  try {
    const raw = window.localStorage.getItem(draftStorageKey(userId, conversationId));
    return typeof raw === 'string' ? raw : '';
  } catch { return ''; }
}
function writeStoredDraft(userId: string | null | undefined, conversationId: string | null | undefined, text: string) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const key = draftStorageKey(userId, conversationId);
    const val = String(text || '').slice(0, COMPOSER_CHAR_LIMIT);
    if (val) window.localStorage.setItem(key, val);
    else window.localStorage.removeItem(key);
  } catch { /* ignore */ }
}
function clearStoredDraft(userId: string | null | undefined, conversationId: string | null | undefined) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try { window.localStorage.removeItem(draftStorageKey(userId, conversationId)); } catch { /* ignore */ }
}

function confirmDiscardDraft(): boolean {
  try {
    return window.confirm('Tienes un mensaje sin enviar. ¿Quieres descartarlo?');
  } catch { return true; }
}

function autoresizeTextarea(el: HTMLTextAreaElement | null | undefined) {
  if (!el) return;
  try {
    el.style.height = 'auto';
    const next = Math.min(el.scrollHeight, 136); // max-height ~7.6rem
    el.style.height = Math.max(next, 42) + 'px';
  } catch { /* ignore */ }
}

function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const fr = new FileReader();
      fr.onerror = () => reject(new Error('No pude leer el archivo.'));
      fr.onload = () => resolve(String(fr.result || ''));
      fr.readAsDataURL(file);
    } catch (e) {
      reject(e);
    }
  });
}

function escapeHTML(s: string) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function simpleMarkdown(text: string, dark: boolean): string {
  const raw = stripInternalReasoning(text);
  if (!raw) return '';
  let out = escapeHTML(raw);
  const strongClass = dark ? 'font-semibold text-white' : 'font-semibold text-slate-900';
  const codeBg = dark
    ? 'rounded bg-white/10 px-1.5 py-0.5 text-[0.8em] text-fuchsia-200'
    : 'rounded bg-violet-100/80 px-1.5 py-0.5 text-[0.8em] text-violet-800';
  out = out.replace(/\*\*(.+?)\*\*/g, `<strong class="${strongClass}">$1</strong>`);
  out = out.replace(/`([^`\n]+)`/g, `<code class="${codeBg}">$1</code>`);
  out = out.replace(/\n{2,}/g, '\n\n');
  out = out.replace(/\n/g, '<br/>');
  return out;
}

function stripInternalReasoning(raw: unknown): string {
  let s = typeof raw === 'string' ? raw : String(raw == null ? '' : raw);
  if (!s) return '';
  try {
    s = s.replace(/<\s*think\b[^>]*>[\s\S]*?<\s*\/\s*think\s*>/gi, '');
    s = s.replace(/<\s*think\s*\/\s*>/gi, '');
    s = s.replace(/<!--\s*dify[-_]?deepseek[-_]?reasoning\s*-->[\s\S]*?<!--\s*\/\s*dify[-_]?deepseek[-_]?reasoning\s*-->/gi, '');
    s = s.replace(/<!--\s*dify[-_]?deepseek[-_]?reasoning\s*\/\s*-->/gi, '');
    s = s.replace(/<!--\s*reasoning[\s\S]*?-->/gi, '');
    s = s.replace(/^\s*<[?!][^>]*>/m, '');
    s = s.replace(/\n{3,}/g, '\n\n');
    return s.replace(/^[ \t]+|[ \t]+$/gm, (m) => m).replace(/^\s+|\s+$/g, '');
  } catch {
    return s;
  }
}

function formatDay(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    const isSameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (isSameDay) {
      return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
  } catch {
    return '';
  }
}

const CHAT_AVATAR_ASSISTANT = '/assets/luciana-logo-oficial.png?v=20260918-2';
const OFFICIAL_BRAND_LOGO = '/assets/luciana-logo-oficial.png?v=20260918-2';
const STORAGE_KEY = 'luciana_chat_ui_v1';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB (imágenes)
const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MB (audios propios solo MP3)
const MAX_GENERIC_BYTES = 20 * 1024 * 1024; // 20 MB (otros archivos)
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const ALLOWED_AUDIO_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/x-mp3',
  'audio/mpeg3',
  'audio/x-mpeg3',
]);
const isFileNameAllowedAudio = (name: string) => /\.mp3$/i.test(String(name || '').trim());
const openMp3ConverterUrl = () => {
  try { window.open('https://online-audio-converter.com/sp/', '_blank', 'noopener,noreferrer'); } catch {}
};

type AttachedImage = {
  file: File;
  name: string;
  bytes: number;
  previewUrl: string;
  kind: 'image' | 'audio' | 'generic';
};
type AttachMenuKind = 'image' | 'audio' | 'generic' | 'mic' | 'drive';

type UiState = {
  activeConversationId: string | null;
  conversations: ConversationSummary[];
  welcomeShown: boolean;
  lastDismissedSuggestionKey: string | null;
};

function loadUiState(): UiState {
  const fallback: UiState = {
    activeConversationId: null,
    conversations: [],
    welcomeShown: false,
    lastDismissedSuggestionKey: null,
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const j = JSON.parse(raw);
    if (!j || typeof j !== 'object') return fallback;
    return { ...fallback, ...j };
  } catch {
    return fallback;
  }
}
function saveUiState(s: UiState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

export function DifyCopilotView({ onChange, onMenuClick }: { onChange: (t: ViewTab) => void; onMenuClick?: () => void }) {
  // Tema LOCAL del chat (NO afecta al resto del sitio)
  const [chatTheme, setChatTheme] = useState<'dark' | 'light'>(() => {
    try {
      const saved = String(window.localStorage.getItem('luciana_chat_theme_v1') || '').toLowerCase().trim();
      if (saved === 'light' || saved === 'dark') return saved;
    } catch { /* ignore */ }
    // Por defecto: chat en modo claro
    return 'light';
  });
  const toggleChatTheme = useCallback(() => {
    setChatTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try { window.localStorage.setItem('luciana_chat_theme_v1', next); } catch { /* ignore */ }
      return next;
    });
  }, []);
  // Efecto: actualiza data-chat-theme en el shell DOM por si CSS lo lee, y forzar re-render
  useEffect(() => {
    try {
      const el = document.querySelector('.luciana-chat-shell') as HTMLElement | null;
      if (el) el.setAttribute('data-chat-theme', chatTheme);
    } catch { /* ignore */ }
  }, [chatTheme]);
  const isDark = chatTheme !== 'light';
  // useTheme legacy NO se usa (el tema del chat es local)
  void useTheme; // silence unused
  const _legacyTheme = useTheme();

  const [uiState, setUiState] = useState<UiState>(() => loadUiState());
  const setUi = useCallback((updater: (prev: UiState) => UiState) => {
    setUiState((prev) => {
      const next = updater(prev);
      saveUiState(next);
      return next;
    });
  }, []);

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: uid(),
      role: 'assistant',
      text:
        '¡Hola! 🎶 Cuéntame qué canción quieres crear.',
      createdAt: Date.now(),
    },
  ]);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const activeConversationIdRef = useRef<string | null | undefined>(undefined);
  const setInputAndDraftRef = useRef<((v: string, clearStorage?: boolean) => void) | null>(null);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string>('');
  const [activeReady, setActiveReady] = useState<ReadyToGenerate | null>(null);
  const [generating, setGenerating] = useState(false);
  const [lastPending, setLastPending] = useState<PendingGeneration | null>(null);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyMenuOpenId, setHistoryMenuOpenId] = useState<string | null>(null);
  const historyBackdropRef = useRef<HTMLDivElement | null>(null);
  const [bootFailed, setBootFailed] = useState(false);
  const [attachedImg, setAttachedImg] = useState<AttachedImage | null>(null);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [attachMenuRect, setAttachMenuRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const [pendingAttachKind, setPendingAttachKind] = useState<AttachMenuKind | null>(null);
  const [welcomeFadingOut, setWelcomeFadingOut] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const attachBtnRef = useRef<HTMLButtonElement | null>(null);
  const attachMenuRef = useRef<HTMLDivElement | null>(null);
  const [audioBusy, setAudioBusy] = useState(false);
  const [coverDraft, setCoverDraft] = useState<null | { title: string; style: string; gender: 'Masculino' | 'Femenino' }>(null);
  const [coverWizard, setCoverWizard] = useState<null | {
    phase: 'lyrics' | 'style' | 'mood' | 'direction' | 'title' | 'voice' | 'summary';
    lyrics: string;
    style: string;
    mood: string;
    direction: string;
    title: string;
    voice: 'Hombre' | 'Mujer' | '';
  }>(null);
  const [coverGenerating, setCoverGenerating] = useState(false);

  const [micRecorderOpen, setMicRecorderOpen] = useState(false);
  const [micRecorderState, setMicRecorderState] = useState<'idle' | 'recording' | 'stopping'>('idle');
  const [micRecorderError, setMicRecorderError] = useState('');
  const [micRecorderElapsedMs, setMicRecorderElapsedMs] = useState(0);
  const [micRecorderBars, setMicRecorderBars] = useState<number[]>([]);
  const micRecorderStateRef = useRef<'idle' | 'recording' | 'stopping'>('idle');
  const micRecorderRef = useRef<any | null>(null);
  const micRecorderStreamRef = useRef<MediaStream | null>(null);
  const micRecorderChunksRef = useRef<Blob[]>([]);
  const micRecorderStopRequestedAtRef = useRef<number>(0);
  const micRecorderLastChunkAtRef = useRef<number>(0);
  const micRecorderStopFallbackTimerRef = useRef<number | null>(null);
  const micRecorderTimerRef = useRef<number | null>(null);
  const micRecorderBarsTimerRef = useRef<number | null>(null);
  const micRecorderAudioCtxRef = useRef<any | null>(null);
  const micRecorderAnalyserRef = useRef<any | null>(null);
  const micRecorderElapsedMsRef = useRef<number>(0);
  const stopMicRecorderRef = useRef<((finalize: boolean) => Promise<void>) | null>(null);

  // 1) stopMicRecorderRef.function (sin useCallback + sin auto-dep)
  const stopMicRecorder: (finalize: boolean) => Promise<void> = async (finalize: boolean) => {
    try {
      if (micRecorderStopFallbackTimerRef.current) window.clearTimeout(micRecorderStopFallbackTimerRef.current);
    } catch {}
    micRecorderStopFallbackTimerRef.current = null;
    try {
      if (micRecorderTimerRef.current) window.clearInterval(micRecorderTimerRef.current);
    } catch {}
    micRecorderTimerRef.current = null;
    try {
      if (micRecorderBarsTimerRef.current) window.clearInterval(micRecorderBarsTimerRef.current);
    } catch {}
    micRecorderBarsTimerRef.current = null;
    try {
      micRecorderAnalyserRef.current = null;
      const ctx = micRecorderAudioCtxRef.current;
      micRecorderAudioCtxRef.current = null;
      try { await ctx?.close?.(); } catch {}
    } catch {}

    const mr: any = micRecorderRef.current;
    const stream = micRecorderStreamRef.current;

    if (finalize) {
      const finalizeId = Date.now();
      micRecorderStopRequestedAtRef.current = Date.now();
      try {
        if (micRecorderStopFallbackTimerRef.current) window.clearTimeout(micRecorderStopFallbackTimerRef.current);
      } catch {}
      micRecorderStopFallbackTimerRef.current = window.setTimeout(() => {
        const chunksNow = Array.isArray(micRecorderChunksRef.current) ? micRecorderChunksRef.current.slice() : [];
        if (chunksNow.length === 0) {
          setMicRecorderError('No se pudo guardar la grabación. Intenta de nuevo o sube un MP3.');
          setMicRecorderState('idle');
          micRecorderStateRef.current = 'idle';
          stopMicRecorderRef.current?.(false).catch(() => {});
          return;
        }
        try {
          const ct = String((mr?.mimeType || chunksNow[0]?.type || 'audio/webm')).toLowerCase();
          const blob = new Blob(chunksNow, { type: ct || 'audio/webm' });
          if (!blob.size || blob.size < 1024) throw new Error('grabacion vacia');
          const ext = ct.includes('mp4') ? 'm4a' : ct.includes('ogg') ? 'ogg' : ct.includes('webm') ? 'webm' : 'webm';
          const name = `grabacion_lucianabot_${finalizeId}.${ext}`;
          const file = new File([blob], name, { type: ct || 'audio/webm' });
          setMicRecorderOpen(false);
          setMicRecorderState('idle');
          micRecorderStateRef.current = 'idle';
          stopMicRecorderRef.current?.(false).catch(() => {});
          window.setTimeout(() => {
            const preview = URL.createObjectURL(blob);
            setAttachedImg({ file, name: file.name, bytes: file.size, previewUrl: preview, kind: 'audio' });
            setToast({ kind: 'ok', text: '🎙️ Grabación lista. Puedes enviarla adjunta con tu mensaje.' });
          }, 180);
        } catch {
          setMicRecorderError('No se pudo guardar la grabación. Intenta de nuevo o sube un MP3.');
          setMicRecorderState('idle');
          micRecorderStateRef.current = 'idle';
          stopMicRecorderRef.current?.(false).catch(() => {});
        }
      }, 3500);
      if (mr && mr.state !== 'inactive') {
        try { mr.requestData?.(); } catch {}
        try { mr.stop(); } catch {}
      }
      micRecorderRef.current = null;
      micRecorderStreamRef.current = null;
      return;
    }

    micRecorderRef.current = null;
    micRecorderStreamRef.current = null;
    try {
      stream?.getTracks?.().forEach((t) => {
        try { t.stop(); } catch {}
      });
    } catch {}
  };
  stopMicRecorderRef.current = stopMicRecorder;

  useEffect(() => {
    return () => { stopMicRecorderRef.current?.(false).catch(() => {}); };
  }, []);

  // 2) startMicRecorder (no useCallback, llama ref.stopMicRecorderRef → no dep circular)
  const startMicRecorder = async () => {
    setMicRecorderError('');
    const navAny: any = typeof navigator === 'undefined' ? null : navigator;
    const canMedia =
      typeof window !== 'undefined' &&
      typeof navAny?.mediaDevices?.getUserMedia === 'function' &&
      typeof (window as any).MediaRecorder === 'function';
    if (!canMedia) {
      setToast({ kind: 'err', text: 'Tu navegador no permite grabar audio aquí. Usa la opción Subir audio.' });
      setAttachMenuOpen(false);
      return;
    }
    try {
      await stopMicRecorderRef.current?.(false);
      setMicRecorderElapsedMs(0);
      micRecorderElapsedMsRef.current = 0;
      micRecorderStopRequestedAtRef.current = 0;
      micRecorderLastChunkAtRef.current = 0;
      try {
        if (micRecorderStopFallbackTimerRef.current) window.clearTimeout(micRecorderStopFallbackTimerRef.current);
      } catch {}
      micRecorderStopFallbackTimerRef.current = null;
      setMicRecorderBars([]);
      setMicRecorderState('idle');
      micRecorderStateRef.current = 'idle';
      setMicRecorderOpen(true);
      setAttachMenuOpen(false);

      const stream = await navAny.mediaDevices.getUserMedia({ audio: true });
      micRecorderStreamRef.current = stream;
      micRecorderChunksRef.current = [];

      try {
        const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (typeof AC === 'function') {
          const ctx: any = new AC();
          micRecorderAudioCtxRef.current = ctx;
          const src = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.7;
          src.connect(analyser);
          micRecorderAnalyserRef.current = analyser;
          const freq = new Uint8Array(analyser.frequencyBinCount);
          const barsCount = 48;
          micRecorderBarsTimerRef.current = window.setInterval(() => {
            const a = micRecorderAnalyserRef.current;
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
            setMicRecorderBars(next);
          }, 80);
        }
      } catch {}

      const MR: typeof MediaRecorder = (window as any).MediaRecorder;
      const pickMime = () => {
        const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4'];
        for (const t of types) {
          try { if ((MR as any).isTypeSupported(t)) return t; } catch {}
        }
        return '';
      };
      const mimeType = pickMime();
      const mr = mimeType ? new MR(stream, { mimeType }) : new MR(stream);
      micRecorderRef.current = mr;
      mr.ondataavailable = (e: BlobEvent) => {
        const b = e.data;
        if (!b) return;
        if (!b.size) return;
        micRecorderChunksRef.current.push(b);
        micRecorderLastChunkAtRef.current = Date.now();
      };
      mr.onstop = () => {
        const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
        (async () => {
          try {
            if (micRecorderStopFallbackTimerRef.current) window.clearTimeout(micRecorderStopFallbackTimerRef.current);
          } catch {}
          micRecorderStopFallbackTimerRef.current = null;
          const stopRequestedAt = Number(micRecorderStopRequestedAtRef.current || 0) || Date.now();
          const deadline = Date.now() + 1500;
          while (Date.now() < deadline) {
            const chunksNow = Array.isArray(micRecorderChunksRef.current) ? micRecorderChunksRef.current.length : 0;
            const lastAt = Number(micRecorderLastChunkAtRef.current || 0) || 0;
            if (chunksNow > 0 && lastAt && Date.now() - lastAt > 180) break;
            if (chunksNow === 0) {
              if (Date.now() - stopRequestedAt > 900) break;
            } else {
              if (Date.now() - stopRequestedAt > 1200) break;
            }
            await sleep(80);
          }
          const chunks = Array.isArray(micRecorderChunksRef.current) ? micRecorderChunksRef.current.slice() : [];
          micRecorderChunksRef.current = [];
          const type = String((mr as any).mimeType || 'audio/webm').toLowerCase();
          const blob = new Blob(chunks, { type: type || 'audio/webm' });
          if (!blob.size || blob.size < 1024) {
            setMicRecorderError('No se grabó audio. Asegúrate de permitir el micrófono e intenta de nuevo.');
            setMicRecorderState('idle');
            micRecorderStateRef.current = 'idle';
            stopMicRecorderRef.current?.(false).catch(() => {});
            return;
          }
          const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : type.includes('webm') ? 'webm' : 'webm';
          const name = `grabacion_lucianabot_${Date.now()}.${ext}`;
          const file = new File([blob], name, { type: type || 'audio/webm' });
          setMicRecorderOpen(false);
          setMicRecorderState('idle');
          micRecorderStateRef.current = 'idle';
          stopMicRecorderRef.current?.(false).catch(() => {});
          window.setTimeout(() => {
            const preview = URL.createObjectURL(blob);
            setAttachedImg({ file, name: file.name, bytes: file.size, previewUrl: preview, kind: 'audio' });
            setToast({ kind: 'ok', text: '🎙️ Grabación lista. Puedes enviarla adjunta con tu mensaje.' });
          }, 180);
        })().catch(() => {
          setMicRecorderError('No se pudo guardar la grabación. Intenta de nuevo o sube un MP3.');
          setMicRecorderState('idle');
          micRecorderStateRef.current = 'idle';
          stopMicRecorderRef.current?.(false).catch(() => {});
        });
      };
      mr.start(250);
      micRecorderStateRef.current = 'recording';
      setMicRecorderState('recording');
      const startedAt = Date.now();
      micRecorderTimerRef.current = window.setInterval(() => {
        const now = Date.now();
        const elapsed = Math.max(0, now - startedAt);
        micRecorderElapsedMsRef.current = elapsed;
        setMicRecorderElapsedMs(elapsed);
      }, 200);
    } catch (e: any) {
      setMicRecorderOpen(false);
      setMicRecorderState('idle');
      micRecorderStateRef.current = 'idle';
      stopMicRecorderRef.current?.(false).catch(() => {});
      const msg = e instanceof Error ? e.message : String(e || 'No se pudo iniciar la grabación');
      setToast({ kind: 'err', text: `🎙️ ${msg}` });
    }
  };

  const listRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const sentScrollRef = useRef(false);

  useEffect(() => { saveUiState(uiState); }, [uiState]);

  const scrollToBottomNow = useCallback(() => {
    if (!listRef.current) return;
    try {
      listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    } catch {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    if (sentScrollRef.current) {
      sentScrollRef.current = false;
      scrollToBottomNow();
      return;
    }
    const t = setTimeout(() => scrollToBottomNow(), 60);
    return () => clearTimeout(t);
  }, [messages, loading, activeReady, generating, scrollToBottomNow]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  // Capturar user_id desde la sesión actual (para keys localStorage por usuario)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!supabaseBrowser) return;
        const { data } = await supabaseBrowser.auth.getUser();
        if (cancelled) return;
        const uid = typeof (data as any)?.user?.id === 'string' ? (data as any).user.id : null;
        if (uid) setCurrentUserId(uid);
        const { data: sessionData } = await supabaseBrowser.auth.getSession();
        if (cancelled) return;
        const suid = typeof (sessionData as any)?.session?.user?.id === 'string' ? (sessionData as any).session.user.id : null;
        if (suid) setCurrentUserId(suid);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (typeof supabaseBrowser === 'undefined' || !supabaseBrowser) return;
    try {
      const { data } = supabaseBrowser.auth.onAuthStateChange((_evt: any, session: any) => {
        const uid = typeof session?.user?.id === 'string' ? session.user.id : null;
        setCurrentUserId(uid);
      });
      return () => { try { (data as any)?.subscription?.unsubscribe?.(); } catch {} };
    } catch {}
  }, []);

  // Sincronizar activeConversationIdRef y recargar draft al cambiar conversación
  useEffect(() => {
    const convId = uiState.activeConversationId || conversationId || null;
    activeConversationIdRef.current = convId;
    const stored = readStoredDraft(currentUserId, convId);
    if (typeof stored === 'string' && stored.trim()) {
      setInput(stored);
      requestAnimationFrame(() => autoresizeTextarea(textareaRef.current));
    } else {
      setInput('');
      requestAnimationFrame(() => autoresizeTextarea(textareaRef.current));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uiState.activeConversationId, conversationId, currentUserId]);

  // Persistir draft en localStorage al escribir
  useEffect(() => {
    const convId = uiState.activeConversationId || conversationId || activeConversationIdRef.current || null;
    const t = window.setTimeout(() => {
      writeStoredDraft(currentUserId, convId, input);
      autoresizeTextarea(textareaRef.current);
    }, 40);
    return () => window.clearTimeout(t);
  }, [input, uiState.activeConversationId, conversationId, currentUserId]);

  // Autoresize en mount y cada re-render visual
  useEffect(() => {
    autoresizeTextarea(textareaRef.current);
  }, [input]);

  // Confirmar al cerrar la pestaña si hay borrador sin enviar
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!String(input || '').trim()) return;
      try { e.preventDefault(); e.returnValue = ''; } catch {}
      return '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [input]);

  // Helper ref: setInput + sincronizar localStorage. Usado dentro de useCallback para evitar stale closures.
  const setInputAndDraft = useCallback((newValue: string, clearStorage: boolean = false) => {
    setInput(String(newValue || ''));
    const convId = uiState.activeConversationId || conversationId || activeConversationIdRef.current || null;
    if (clearStorage) {
      clearStoredDraft(currentUserId, convId);
    } else {
      writeStoredDraft(currentUserId, convId, String(newValue || ''));
    }
    requestAnimationFrame(() => autoresizeTextarea(textareaRef.current));
  }, [uiState.activeConversationId, conversationId, currentUserId]);
  useEffect(() => { setInputAndDraftRef.current = setInputAndDraft; }, [setInputAndDraft]);

  const isEmptyState = useMemo(() => (
    messages.length <= 1 &&
    messages.every((m) =>
      m.role === 'assistant' && !(m.attachment) && !(m.structured?.action)
    )
  ), [messages]);

  useEffect(() => {
    if (!isEmptyState && !welcomeFadingOut) {
      setWelcomeFadingOut(true);
      const t = window.setTimeout(() => setWelcomeFadingOut(false), 320);
      return () => window.clearTimeout(t);
    }
    if (isEmptyState && welcomeFadingOut) {
      setWelcomeFadingOut(false);
    }
    return undefined;
  }, [isEmptyState, welcomeFadingOut]);

  const canSend = useMemo(() => {
    if (loading || generating) return false;
    if (!String(input || '').trim()) return false;
    return true;
  }, [input, loading, generating]);

  const signOutAndReload = useCallback(() => {
    try { void supabaseBrowser?.auth?.signOut?.().catch(() => {}); } catch {}
    try {
      const base = window.location.origin.toString().replace(/\/+$/, '');
      window.location.href = `${base}/crear`;
    } catch {}
  }, []);

  const getValidBearerToken = useCallback(async (): Promise<string | null> => {
    if (!supabaseBrowser) return null;
    let accessToken = '';
    let sessionOk = false;
    try {
      const result = await getAccessToken();
      if (
        result &&
        typeof result === 'object' &&
        (result as any).ok &&
        typeof (result as any).token === 'string' &&
        (result as any).token.trim()
      ) {
        accessToken = String((result as any).token).trim();
        sessionOk = true;
      }
    } catch {}
    if (!sessionOk) {
      try {
        const { data } = await supabaseBrowser.auth.getSession();
        const s = data?.session as any;
        if (s && typeof s?.access_token === 'string' && String(s.access_token).trim()) {
          accessToken = String(s.access_token).trim();
          sessionOk = true;
        }
      } catch {}
    }
    if (!sessionOk) {
      try {
        const { data } = await supabaseBrowser.auth.refreshSession();
        const s = data?.session as any;
        if (s && typeof s?.access_token === 'string' && String(s.access_token).trim()) {
          accessToken = String(s.access_token).trim();
          sessionOk = true;
        }
      } catch {}
    }
    return sessionOk && accessToken ? accessToken : null;
  }, [signOutAndReload]);

  async function apiRequest<T = any>(url: string, method: 'GET' | 'POST' | 'PATCH', token: string, body?: any): Promise<{ ok: boolean; status: number; json: T | null; raw: string }> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
    };
    let payload: BodyInit | undefined;
    if (body !== undefined) {
      headers['content-type'] = 'application/json; charset=utf-8';
      payload = JSON.stringify(body);
    }
    try {
      const r = await fetch(url, { method, headers, body: payload });
      const raw = await r.text();
      let json: any = null;
      try { json = raw ? JSON.parse(raw) : null; } catch { json = null; }
      return { ok: r.ok, status: r.status, json, raw };
    } catch (e: any) {
      return {
        ok: false,
        status: 0,
        json: null,
        raw: e instanceof Error ? e.message : String(e || ''),
      };
    }
  }

  const createSupabaseConversation = useCallback(async (
    token: string,
    opts?: { title?: string; internal_dify_conversation_id?: string; summary_snapshot?: any }
  ): Promise<ConversationSummary | null> => {
    const body: any = {};
    if (opts?.title) body.title = opts.title;
    if (opts?.internal_dify_conversation_id) body.internal_dify_conversation_id = opts.internal_dify_conversation_id;
    if (opts?.summary_snapshot) body.summary_snapshot = opts.summary_snapshot;
    const r = await apiRequest<{ success?: boolean; conversation?: any }>('/api/chat', 'POST', token, body);
    if (r.ok && r.json?.success && r.json.conversation) return r.json.conversation as ConversationSummary;
    return null;
  }, []);

  const appendMessageToConversation = useCallback(async (
    token: string,
    convId: string,
    msg: { role: ChatRole; content: string; structured_action?: any; tokens?: number }
  ): Promise<boolean> => {
    if (!convId) return false;
    const body: any = { role: msg.role, content: msg.content };
    if (msg.structured_action !== undefined && msg.structured_action !== null) body.structured_action = msg.structured_action;
    if (msg.tokens !== undefined && msg.tokens !== null) body.tokens = msg.tokens;
    const r = await apiRequest<{ success?: boolean }>(`/api/chat/${encodeURIComponent(convId)}/messages`, 'POST', token, body);
    return !!(r.ok && r.json?.success);
  }, []);

  const updateConversation = useCallback(async (
    token: string,
    convId: string,
    patch: { title?: string; internal_dify_conversation_id?: string; summary_snapshot?: any; archived?: boolean; pinned?: boolean; deleted?: boolean }
  ): Promise<boolean> => {
    if (!convId) return false;
    const r = await apiRequest<{ success?: boolean }>(`/api/chat/${encodeURIComponent(convId)}`, 'PATCH', token, patch);
    return !!(r.ok && r.json?.success);
  }, []);

  const deleteConversationById = useCallback(async (token: string, convId: string): Promise<boolean> => {
    if (!convId) return false;
    const r = await apiRequest<{ success?: boolean }>(`/api/chat/${encodeURIComponent(convId)}`, 'DELETE', token);
    return !!(r.ok && r.json?.success);
  }, []);

  const loadConversationById = useCallback(async (token: string, convId: string)
    : Promise<{ conversation: ConversationSummary | null; messages: ChatMessage[]; ok: boolean }> => {
    const r = await apiRequest<{ success?: boolean; conversation?: any; messages?: any[] }>(
      `/api/chat/${encodeURIComponent(convId)}`,
      'GET',
      token
    );
    if (!r.ok || !r.json?.success) return { conversation: null, messages: [], ok: false };
    const rawMsgs = Array.isArray(r.json.messages) ? r.json.messages : [];
    const msgs: ChatMessage[] = rawMsgs.map((m: any) => {
      const role: ChatRole = m.role === 'user' ? 'user' : 'assistant';
      const structuredRaw =
        m.structured_action && typeof m.structured_action === 'object' && (m.structured_action as any).action === 'ready_to_generate'
          ? (m.structured_action as any)
          : null;
      const structured: ChatMessage['structured'] = structuredRaw
        ? (() => {
            const gRaw = String(structuredRaw.gender || structuredRaw.vocalGender || structuredRaw.voz || '').trim();
            const genderDefault: 'Masculino' | 'Femenino' = /fem|mujer|femenina|f/i.test(gRaw) ? 'Femenino' : 'Masculino';
            return {
              action: 'ready_to_generate',
              prompt: String(structuredRaw.prompt || '').trim(),
              style: String(structuredRaw.style || '').trim(),
              title: String(structuredRaw.title || '').trim(),
              instrumental: Boolean(structuredRaw.instrumental),
              gender: genderDefault,
            };
          })()
        : null;
      const ts = m.created_at ? new Date(m.created_at).getTime() : Date.now();
      return {
        id: String(m.id || uid()),
        role,
        text: String(m.content || ''),
        createdAt: Number.isFinite(ts) ? ts : Date.now(),
        structured,
        persisted: true,
      };
    });
    return {
      conversation: (r.json.conversation as ConversationSummary) || null,
      messages: msgs,
      ok: true,
    };
  }, []);

  const fetchConversationList = useCallback(async (token: string): Promise<ConversationSummary[]> => {
    const r = await apiRequest<{ success?: boolean; conversations?: any[] }>('/api/chat?limit=100', 'GET', token);
    if (!r.ok || !r.json?.success || !Array.isArray(r.json.conversations)) return [];
    const raw = (r.json.conversations as ConversationSummary[]).map((c: any) => ({
      id: c.id,
      title: String(c.title || 'Nuevo chat'),
      created_at: c.created_at,
      updated_at: c.updated_at,
      archived_at: c.archived_at || null,
      internal_dify_conversation_id: c.internal_dify_conversation_id || null,
      pinned: Boolean(c.pinned),
      deleted_at: c.deleted_at || null,
    }));
    raw.sort((a, b) => {
      const pa = a.pinned ? 1 : 0;
      const pb = b.pinned ? 1 : 0;
      if (pa !== pb) return pb - pa;
      const ta = new Date(a.updated_at || 0).getTime() || 0;
      const tb = new Date(b.updated_at || 0).getTime() || 0;
      return tb - ta;
    });
    return raw;
  }, []);

  const refreshHistoryList = useCallback(async () => {
    try {
      setHistoryLoading(true);
      const token = await getValidBearerToken();
      if (!token) return;
      const list = await fetchConversationList(token);
      setUi((p) => ({ ...p, conversations: list }));
    } catch {
      /* ignore */
    } finally {
      setHistoryLoading(false);
    }
  }, [fetchConversationList, getValidBearerToken, setUi]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const token = await getValidBearerToken();
        if (!token) { setBootFailed(true); return; }
        const list = await fetchConversationList(token);
        if (!alive) return;
        setUi((p) => {
          let nextActive = p.activeConversationId;
          if (!nextActive && list.length > 0) {
            const firstNotArchived = list.find((c) => !c.archived_at) || list[0];
            nextActive = firstNotArchived.id;
          }
          return { ...p, conversations: list, activeConversationId: nextActive || null };
        });
        const activeId = uiState.activeConversationId;
        if (activeId) {
          const loaded = await loadConversationById(token, activeId);
          if (!alive) return;
          if (loaded.ok && loaded.conversation) {
            setConversationId(String(loaded.conversation.internal_dify_conversation_id || '').trim());
            if (loaded.messages.length > 0) {
              const cleaned = loaded.messages.map((m: any) =>
                m.role === 'assistant' || m.role === 'system' ? { ...m, text: stripInternalReasoning(m.text) } : m
              );
              setMessages(cleaned);
              const lastReadyMsg = [...cleaned].reverse().find((m) => m.structured?.action === 'ready_to_generate');
              if (lastReadyMsg && lastReadyMsg.structured) setActiveReady({ ...lastReadyMsg.structured });
            }
          }
        }
      } catch (e) {
        if (alive) setBootFailed(true);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openConversation = useCallback(async (conv: ConversationSummary) => {
    try {
      // Si hay texto sin enviar: PREGUNTAR antes de cambiar de conversación (nunca descartar silenciosamente)
      if (String(input || '').trim()) {
        const okDiscard = confirmDiscardDraft();
        if (!okDiscard) return; // "Seguir escribiendo" → cancelar navegación
      }
      setHistoryOpen(false);
      setActiveReady(null);
      setLoading(true);
      const token = await getValidBearerToken();
      if (!token) {
        setLoading(false);
        return;
      }
      const loaded = await loadConversationById(token, conv.id);
      if (!loaded.ok || !loaded.conversation) {
        setLoading(false);
        setToast({ kind: 'err', text: 'No pude abrir esa conversación.' });
        return;
      }
      setConversationId(String(loaded.conversation.internal_dify_conversation_id || '').trim());
      if (loaded.messages.length > 0) {
        const cleaned = loaded.messages.map((m: any) =>
          m.role === 'assistant' || m.role === 'system' ? { ...m, text: stripInternalReasoning(m.text) } : m
        );
        setMessages(cleaned);
        const lastReadyMsg = [...cleaned].reverse().find((m) => m.structured?.action === 'ready_to_generate');
        if (lastReadyMsg && lastReadyMsg.structured) setActiveReady({ ...lastReadyMsg.structured });
      } else {
        setMessages([
          {
            id: uid(),
            role: 'assistant',
            text:
              '¡Hola! 🎶 Cuéntame qué canción quieres crear.',
            createdAt: Date.now(),
          },
        ]);
      }
      setUi((p) => ({ ...p, activeConversationId: conv.id }));
      sentScrollRef.current = true;
      setTimeout(() => scrollToBottomNow(), 30);
    } catch (e) {
      setToast({ kind: 'err', text: e instanceof Error ? e.message : String(e || 'Error') });
    } finally {
      setLoading(false);
    }
  }, [getValidBearerToken, loadConversationById, scrollToBottomNow, setUi, input]);

  const startNewChat = useCallback(async (opts?: { persistOldAsArchived?: boolean }) => {
    try {
      const token = await getValidBearerToken();
      if (!token) {
        setToast({ kind: 'err', text: 'Sesión expirada para guardar el historial. Inicia sesión de nuevo.' });
        return;
      }
      // Persistir el chat actual si tiene mensajes reales (> 1 para evitar mensaje bienvenida solo)
      const currentConvId = uiState.activeConversationId;
      const hasRealMessages = messages.some((m) => m.role === 'user');
      if (hasRealMessages && currentConvId && opts?.persistOldAsArchived !== false) {
        void (async () => {
          try { await updateConversation(token, currentConvId, { archived: true }); } catch {}
        })();
      }
      const created = await createSupabaseConversation(token, { title: 'Nuevo chat' });
      setConversationId('');
      setActiveReady(null);
      setLastPending(null);
      setMessages([
        {
          id: uid(),
          role: 'assistant',
          text:
            '¡Hola! 🎶 Cuéntame qué canción quieres crear.',
          createdAt: Date.now(),
        },
      ]);
      setUi((p) => ({
        ...p,
        activeConversationId: created?.id || null,
        conversations: created ? [created, ...p.conversations] : p.conversations,
      }));
      sentScrollRef.current = true;
      setTimeout(() => scrollToBottomNow(), 30);
      setToast({ kind: 'ok', text: 'Listo · chat nuevo creado. El anterior se guardó en el historial.' });
    } catch (e) {
      setToast({ kind: 'err', text: e instanceof Error ? e.message : String(e || 'Error') });
    }
  }, [createSupabaseConversation, messages, scrollToBottomNow, setUi, uiState.activeConversationId, updateConversation, getValidBearerToken]);

  const onNewChatClick = useCallback(async () => {
    try {
      // Si hay texto sin enviar, PREGUNTAR ANTES (nunca borrar silenciosamente)
      if (String(input || '').trim()) {
        const okDiscard = confirmDiscardDraft();
        if (!okDiscard) return; // "Seguir escribiendo" → salir sin tocar nada
      }
      const ok = window.confirm('¿Quieres iniciar un nuevo chat? Tu conversación anterior se conservará en el historial.');
      if (!ok) return;
      if (attachedImg) {
        try { URL.revokeObjectURL(attachedImg.previewUrl); } catch {}
        setAttachedImg(null);
      }
      // Limpiar el borrador de ESTA conversación anterior (antes de cambiar de chat)
      if (setInputAndDraftRef.current) setInputAndDraftRef.current('', true);
      else { setInput(''); clearStoredDraft(currentUserId, uiState.activeConversationId || conversationId || null); }
      await startNewChat({ persistOldAsArchived: true });
    } catch { /* ignore */ }
  }, [startNewChat, attachedImg, input, currentUserId, uiState.activeConversationId, conversationId]);

  const handleAttachPick = useCallback(() => {
    if (loading || generating) {
      setToast({
        kind: 'ok',
        text: 'Espera tantito: estoy procesando algo. Si se quedó trabado, toca “Reintentar” o recarga la página.',
      });
      return;
    }
    setAttachMenuOpen((o) => !o);
  }, [loading, generating]);

  const triggerFilePickForKind = useCallback((kind: AttachMenuKind) => {
    if (kind === 'mic') {
      startMicRecorder().catch(() => {});
      return;
    }
    if (kind === 'drive') {
      // No hay integración Google Drive configurada aún. Avisa honestamente y orienta a subir archivo MP3.
      setToast({ kind: 'ok', text: '☁️ Drive: usa la opción Subir audio y selecciona tu archivo. Si tu audio está en Drive, descárgalo primero a tu teléfono/PC.' });
      setAttachMenuOpen(false);
      return;
    }
    const inp = fileInputRef.current;
    if (!inp) return;
    try { inp.value = ''; } catch {}
    if (kind === 'image') inp.accept = 'image/jpeg,image/png,image/webp';
    else if (kind === 'audio') inp.accept = 'audio/mpeg,.mp3';
    else inp.accept = 'image/*,text/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.doc,.docx,.txt,.md,.rtf';
    setPendingAttachKind(kind);
    setAttachMenuOpen(false);
    try { inp.click(); } catch {}
  }, []);

  const handleAttachFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) { setPendingAttachKind(null); return; }
    const f = files[0];
    const kind: AttachMenuKind = pendingAttachKind || 'generic';
    const mime = String(f.type || '').toLowerCase();

    let maxBytes = MAX_GENERIC_BYTES;
    let errSizeText = 'El archivo supera los 20 MB permitidos.';
    let errTypeText = 'Formato no admitido para esta opción.';
    let finalKind: AttachedImage['kind'] = 'generic';

    if (kind === 'image') {
      maxBytes = MAX_IMAGE_BYTES;
      errSizeText = 'La imagen supera los 10 MB permitidos.';
      errTypeText = 'Formato de imagen no admitido. Usa JPG, PNG o WEBP.';
      finalKind = 'image';
      if (!ALLOWED_IMAGE_TYPES.has(mime)) {
        setToast({ kind: 'err', text: errTypeText });
        try { if (fileInputRef.current) fileInputRef.current.value = ''; } catch {}
        setPendingAttachKind(null);
        return;
      }
    } else if (kind === 'audio') {
      maxBytes = MAX_AUDIO_BYTES;
      errSizeText = 'El audio supera los 25 MB permitidos.';
      errTypeText = 'Por ahora LucIAna acepta audio en formato MP3. Puedes convertir tu archivo gratis aquí: https://online-audio-converter.com/sp/';
      finalKind = 'audio';
      const isMp3 = /\.mp3$/i.test(String(f.name || ''));
      const mimeIsMpeg = mime === 'audio/mpeg' || mime === 'audio/mp3';
      if (!isMp3 && !mimeIsMpeg) {
        setToast({ kind: 'err', text: errTypeText });
        try { if (fileInputRef.current) fileInputRef.current.value = ''; } catch {}
        setPendingAttachKind(null);
        return;
      }
    } else {
      // kind generic: imágenes, audios, textos, PDF, Word
      if (!mime.startsWith('audio/') && !mime.startsWith('image/') && !mime.startsWith('text/') &&
          mime !== 'application/pdf' && mime !== 'application/json' &&
          !mime.includes('officedocument') && !f.name.toLowerCase().match(/\.(doc|docx|txt|md|rtf|pdf)$/)) {
        setToast({ kind: 'err', text: 'Tipo de archivo no admitido. Puedes subir imágenes, audios (solo MP3), textos, PDF o Word.' });
        try { if (fileInputRef.current) fileInputRef.current.value = ''; } catch {}
        setPendingAttachKind(null);
        return;
      }
      if (mime.startsWith('image/')) finalKind = 'image';
      else if (mime.startsWith('audio/')) finalKind = 'audio';
    }

    if (f.size > maxBytes) {
      setToast({ kind: 'err', text: errSizeText });
      try { if (fileInputRef.current) fileInputRef.current.value = ''; } catch {}
      setPendingAttachKind(null);
      return;
    }
    if (attachedImg) {
      try { URL.revokeObjectURL(attachedImg.previewUrl); } catch {}
    }
    let previewUrl = '';
    if (finalKind === 'image' || finalKind === 'audio') {
      try { previewUrl = URL.createObjectURL(f); } catch {}
    } else {
      // audio/generic: sin preview por ahora; usamos icono visualmente
      previewUrl = '';
    }
    setAttachedImg({ file: f, name: String(f.name || 'archivo').slice(0, 160), bytes: Number(f.size || 0), previewUrl, kind: finalKind });
    try { if (fileInputRef.current) fileInputRef.current.value = ''; } catch {}
    setPendingAttachKind(null);
    if (finalKind === 'audio') {
      setTimeout(() => { try { window.dispatchEvent(new (window as any).CustomEvent('luciana:audio-attached')); } catch {} }, 0);
    }
  }, [attachedImg, pendingAttachKind]);

  const handleAttachRemove = useCallback(() => {
    if (!attachedImg) return;
    try { URL.revokeObjectURL(attachedImg.previewUrl); } catch {}
    setAttachedImg(null);
    setCoverWizard(null);
    setCoverDraft(null);
  }, [attachedImg]);

  const confirmAudioAuth = useCallback(() => {
    try {
      return window.confirm('¿Confirmas que este audio es tuyo o tienes autorización para usarlo?');
    } catch {
      return true;
    }
  }, []);

  const wizardPushMessage = useCallback((text: string) => {
    const m: ChatMessage = { id: uid(), role: 'assistant', text, createdAt: Date.now() };
    setMessages((list) => [...list, m]);
    try {
      (async () => {
        try {
          const token = await getValidBearerToken();
          const convId = (await (0, eval)('(async () => {})')).toString ? '' : '';
          void token; void convId;
        } catch {}
        try {
          const accessToken = await getValidBearerToken();
          const activeConvId = (() => { try { return (uiState as any).activeConversationId as string | null; } catch { return null; } })();
          if (accessToken && activeConvId) {
            try {
              await appendMessageToConversation(accessToken, activeConvId, { role: 'assistant', content: stripInternalReasoning(text) });
            } catch {}
          }
        } catch {}
      })();
    } catch {}
  }, [uiState]);

  const transcribeAudioForWizard = useCallback(async () => {
    if (!attachedImg || attachedImg.kind !== 'audio') return;
    if (loading || generating || audioBusy || coverGenerating) return;
    if (!confirmAudioAuth()) return;
    if (!supabaseBrowser) {
      setToast({ kind: 'err', text: 'No se pudo conectar. Cierra y abre la app de nuevo.' });
      return;
    }

    setAudioBusy(true);
    setLoading(true);
    sentScrollRef.current = true;
    setCoverDraft(null);
    setCoverWizard(null);
    const audioName = String(attachedImg.name || attachedImg.file?.name || 'audio').slice(0, 160) || 'audio';
    const audioFile = attachedImg.file;
    const msgAudioUrl = (() => {
      try { return URL.createObjectURL(audioFile); } catch { return attachedImg.previewUrl || ''; }
    })();

    try {
      const accessToken = await getValidBearerToken();
      if (!accessToken) {
        setLoading(false);
        setAudioBusy(false);
        setToast({ kind: 'err', text: 'Sesión expirada. Vuelve a iniciar sesión con Google.' });
        setTimeout(() => signOutAndReload(), 1200);
        return;
      }

      const userMsg: ChatMessage = {
        id: uid(),
        role: 'user',
        text: `Audio adjunto · ${audioName}`,
        createdAt: Date.now(),
        attachment: msgAudioUrl ? { kind: 'audio', previewUrl: msgAudioUrl, name: audioName, bytes: attachedImg.bytes } : null,
      };
      setMessages((m) => [...m, userMsg]);

      let activeConvId = uiState.activeConversationId;
      if (!activeConvId) {
        const created = await createSupabaseConversation(accessToken, { title: 'Cover con audio' });
        if (created) {
          activeConvId = created.id;
          setUi((p) => ({ ...p, activeConversationId: activeConvId!, conversations: created ? [created, ...p.conversations] : p.conversations }));
        }
      }
      if (activeConvId) {
        void (async () => {
          try { await appendMessageToConversation(accessToken, activeConvId!, { role: 'user', content: `[Audio adjunto: ${audioName}]` }); } catch {}
        })();
      }

      setToast({ kind: 'ok', text: 'Transcribiendo audio…' });
      wizardPushMessage('🎙️ Transcribiendo tu audio… esto puede tardar entre 10 y 60 segundos.');

      let uploadJson: any = null;
      let uploadStatus = 0;
      try {
        const fd = new FormData();
        fd.append('file', audioFile, audioName);
        const r = await fetch('/api/gpt/upload-audio', {
          method: 'POST',
          headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
          body: fd,
        });
        uploadStatus = r.status;
        const raw = await r.text();
        try { uploadJson = raw ? JSON.parse(raw) : null; } catch { uploadJson = { error: 'invalid_json', message: raw }; }
      } catch {
        uploadStatus = 0;
        uploadJson = { error: 'network_error' };
      }
      if (uploadStatus < 200 || uploadStatus >= 300 || (uploadJson && uploadJson.success === false) || (uploadJson && typeof uploadJson.error === 'string')) {
        const friendly = uploadStatus === 413 ? 'El audio es demasiado pesado (máx. 25 MB).' : 'No pude subir el audio.';
        setLoading(false);
        setAudioBusy(false);
        setToast({ kind: 'err', text: friendly });
        setMessages((m) => [...m, { id: uid(), role: 'assistant', text: friendly, createdAt: Date.now() }]);
        return;
      }

      const audioUrl = String(uploadJson?.url || uploadJson?.upload_url || uploadJson?.uploadUrl || '').trim();
      if (!audioUrl) {
        const friendly = 'No pude preparar el audio para transcribir.';
        setLoading(false);
        setAudioBusy(false);
        setToast({ kind: 'err', text: friendly });
        setMessages((m) => [...m, { id: uid(), role: 'assistant', text: friendly, createdAt: Date.now() }]);
        return;
      }

      let trJson: any = null;
      let trStatus = 0;
      try {
        const r = await fetch('/api/gpt/transcribe', {
          method: 'POST',
          headers: {
            'content-type': 'application/json; charset=utf-8',
            authorization: `Bearer ${accessToken}`,
            accept: 'application/json',
          },
          body: JSON.stringify({ audio_url: audioUrl, title: audioName }),
        });
        trStatus = r.status;
        const raw = await r.text();
        try { trJson = raw ? JSON.parse(raw) : null; } catch { trJson = { error: 'invalid_json' }; }
      } catch {
        trStatus = 0;
        trJson = { error: 'network_error' };
      }
      if (trStatus < 200 || trStatus >= 300 || (trJson && trJson.success === false) || (trJson && typeof trJson.error === 'string')) {
        const friendly = trStatus === 413
          ? 'El audio es demasiado pesado para transcribir. Usa un fragmento más corto.'
          : 'No pude transcribir este audio. Prueba con un fragmento más corto o con menos ruido.';
        setLoading(false);
        setAudioBusy(false);
        setToast({ kind: 'err', text: friendly });
        setMessages((m) => [...m, { id: uid(), role: 'assistant', text: friendly, createdAt: Date.now() }]);
        return;
      }

      const lyrics = String(trJson?.lyrics || '').trim();
      if (!lyrics) {
        const friendly = 'No pude obtener una transcripción (texto vacío). Prueba con un fragmento más claro.';
        setLoading(false);
        setAudioBusy(false);
        setToast({ kind: 'err', text: friendly });
        setMessages((m) => [...m, { id: uid(), role: 'assistant', text: friendly, createdAt: Date.now() }]);
        return;
      }

      setCoverWizard({
        phase: 'lyrics',
        lyrics,
        style: '',
        mood: '',
        direction: '',
        title: '',
        voice: '',
      });

      const aMsg: ChatMessage = {
        id: uid(),
        role: 'assistant',
        text:
          `🎙️ Detecté esta letra:\n\n` +
          `\`\`\`\n${lyrics}\n\`\`\`\n\n` +
          `¿Está correcta o quieres cambiar algo?\n` +
          `- Si está bien: escríbeme **“sí está bien”** (o cualquier confirmación corta).\n` +
          `- Si quieres corregirla: pégame la letra corregida (solo la letra).`,
        createdAt: Date.now(),
        structured: { action: 'wizard_lyrics', lyrics },
      };
      setMessages((m) => [...m, aMsg]);

      if (activeConvId) {
        void (async () => {
          try { await appendMessageToConversation(accessToken, activeConvId!, { role: 'assistant', content: stripInternalReasoning(aMsg.text) }); } catch {}
        })();
      }

      setLoading(false);
      setAudioBusy(false);
      // IMPORTANTE: NO limpiar setInput aquí. El usuario pudo haber escrito texto
      // mientras esperaba la transcripción; el borrador lo conservamos intacto.
      requestAnimationFrame(() => autoresizeTextarea(textareaRef.current));
    } catch {
      const friendly = 'No pude transcribir este audio en este momento.';
      setLoading(false);
      setAudioBusy(false);
      setToast({ kind: 'err', text: friendly });
      setMessages((m) => [...m, { id: uid(), role: 'assistant', text: friendly, createdAt: Date.now() }]);
    }
  }, [attachedImg, audioBusy, confirmAudioAuth, coverGenerating, generating, loading, setUi, setToast, supabaseBrowser, uiState.activeConversationId, wizardPushMessage]);

  useEffect(() => {
    const onAutoTranscribe = () => {
      try { window.setTimeout(() => void transcribeAudioForWizard(), 0); } catch {}
    };
    window.addEventListener('luciana:audio-attached', onAutoTranscribe);
    return () => { window.removeEventListener('luciana:audio-attached', onAutoTranscribe); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcribeAudioForWizard]);

  const handleGenerateCoverFromAudio = useCallback(async () => {
    if (!attachedImg || attachedImg.kind !== 'audio') return;
    if (!coverDraft) return;
    if (loading || generating || audioBusy || coverGenerating) return;
    if (!confirmAudioAuth()) return;
    if (!supabaseBrowser) {
      setToast({ kind: 'err', text: 'No se pudo conectar. Cierra y abre la app de nuevo.' });
      return;
    }

    setCoverGenerating(true);
    setLoading(true);
    sentScrollRef.current = true;
    const audioName = String(attachedImg.name || attachedImg.file?.name || 'audio').slice(0, 160) || 'audio';
    const audioFile = attachedImg.file;
    const msgAudioUrl = (() => {
      try { return URL.createObjectURL(audioFile); } catch { return attachedImg.previewUrl || ''; }
    })();
    const title = String(coverDraft.title || 'Cover').trim().slice(0, 100) || 'Cover';
    const styleRaw = String(coverDraft.style || '').trim().slice(0, 1200);
    const styleParts = [styleRaw].filter(Boolean);
    if (coverDraft.gender) styleParts.push(`Voz deseada: ${coverDraft.gender}.`);
    const style = styleParts.filter(Boolean).join('\n') || 'Pop';
    const vocalGender = coverDraft.gender === 'Femenino' ? 'f' : 'm';
    const COST_CREDITS = 12;

    try {
      const accessToken = await getValidBearerToken();
      if (!accessToken) {
        setLoading(false);
        setCoverGenerating(false);
        setToast({ kind: 'err', text: 'Sesión expirada. Vuelve a iniciar sesión con Google.' });
        setTimeout(() => signOutAndReload(), 1200);
        return;
      }

      const userMsg: ChatMessage = {
        id: uid(),
        role: 'user',
        text: `Crear cover · ${title}`,
        createdAt: Date.now(),
        attachment: msgAudioUrl ? { kind: 'audio', previewUrl: msgAudioUrl, name: audioName, bytes: attachedImg.bytes } : null,
      };
      setMessages((m) => [...m, userMsg]);

      try { handleAttachRemove(); } catch {}
      setCoverDraft(null);

      let activeConvId = uiState.activeConversationId;
      let activeDifyId = conversationId;
      if (!activeConvId) {
        const created = await createSupabaseConversation(accessToken, { title: title.slice(0, 60) || 'Cover' });
        if (created) {
          activeConvId = created.id;
          activeDifyId = String(created.internal_dify_conversation_id || '').trim();
          setUi((p) => ({ ...p, activeConversationId: activeConvId!, conversations: created ? [created, ...p.conversations] : p.conversations }));
        }
      }
      if (activeConvId) {
        void (async () => {
          try { await appendMessageToConversation(accessToken, activeConvId!, { role: 'user', content: `[Audio adjunto: ${audioName}] Crear cover · ${title}` }); } catch {}
        })();
      }

      setToast({ kind: 'ok', text: 'Creando cover…' });

      let uploadJson: any = null;
      let uploadStatus = 0;
      try {
        const fd = new FormData();
        fd.append('file', audioFile, audioName);
        const r = await fetch('/api/gpt/upload-audio', {
          method: 'POST',
          headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
          body: fd,
        });
        uploadStatus = r.status;
        const raw = await r.text();
        try { uploadJson = raw ? JSON.parse(raw) : null; } catch { uploadJson = { error: 'invalid_json', message: raw }; }
      } catch {
        uploadStatus = 0;
        uploadJson = { error: 'network_error' };
      }
      if (uploadStatus < 200 || uploadStatus >= 300 || (uploadJson && uploadJson.success === false) || (uploadJson && typeof uploadJson.error === 'string')) {
        const friendly = uploadStatus === 413 ? 'El audio es demasiado pesado (máx. 25 MB).' : 'No pude subir el audio.';
        setLoading(false);
        setCoverGenerating(false);
        setToast({ kind: 'err', text: friendly });
        setMessages((m) => [...m, { id: uid(), role: 'assistant', text: friendly, createdAt: Date.now() }]);
        return;
      }
      const uploadUrl = String(uploadJson?.url || uploadJson?.upload_url || uploadJson?.uploadUrl || '').trim();
      const uploadPath = String(uploadJson?.r2_key || uploadJson?.upload_path || uploadJson?.uploadPath || uploadJson?.key || '').trim();
      if (!uploadUrl && !uploadPath) {
        const friendly = 'No pude preparar el audio para el cover.';
        setLoading(false);
        setCoverGenerating(false);
        setToast({ kind: 'err', text: friendly });
        setMessages((m) => [...m, { id: uid(), role: 'assistant', text: friendly, createdAt: Date.now() }]);
        return;
      }

      let coverJson: any = null;
      let coverStatus = 0;
      try {
        const lyrics = String((coverWizard && coverWizard.phase === 'summary' && coverWizard.lyrics) || (coverDraft && (coverDraft as any).lyrics) || '').trim();
        const payload: any = {
          uploadUrl: uploadUrl || undefined,
          uploadBucket: uploadPath ? 'ramber-tunes' : undefined,
          uploadPath: uploadPath || undefined,
          instrumental: false,
          prompt: lyrics || ' ',
          style,
          title,
          model: 'V6',
          vocalGender,
        };
        if (payload.style) payload.style = [payload.style, `Voz deseada: ${coverDraft.gender}.`].filter(Boolean).join('\n');
        const r = await fetch('/api/suno/upload-cover', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
          body: JSON.stringify(payload),
        });
        coverStatus = r.status;
        const raw = await r.text();
        try { coverJson = raw ? JSON.parse(raw) : null; } catch { coverJson = { error: 'invalid_json', message: raw }; }
      } catch {
        coverStatus = 0;
        coverJson = { error: 'network_error' };
      }

      if (coverStatus < 200 || coverStatus >= 300 || (coverJson && typeof coverJson.error === 'string')) {
        const isCredits = coverStatus === 402 || String(coverJson?.error || '').toLowerCase().includes('credit');
        const friendly = isCredits
          ? 'No tienes créditos suficientes para crear el cover.'
          : 'No pude crear el cover. Revisa tu audio e inténtalo de nuevo.';
        setLoading(false);
        setCoverGenerating(false);
        setToast({ kind: 'err', text: friendly });
        setMessages((m) => [...m, { id: uid(), role: 'assistant', text: friendly, createdAt: Date.now() }]);
        return;
      }

      const taskId = String(coverJson?.taskId || coverJson?.task_id || '').trim();
      if (!taskId) {
        const friendly = 'No pude iniciar el cover (no recibí el identificador de la tarea).';
        setLoading(false);
        setCoverGenerating(false);
        setToast({ kind: 'err', text: friendly });
        setMessages((m) => [...m, { id: uid(), role: 'assistant', text: friendly, createdAt: Date.now() }]);
        return;
      }

      try {
        const pendingListKey = 'ramber.pendingSunoTasks_v1';
        const pendingLegacyKey = 'ramber.pendingSunoTask';
        const raw = window.localStorage.getItem(pendingListKey);
        const arr = raw ? JSON.parse(raw) : [];
        const list = Array.isArray(arr) ? arr : [];
        list.push({
          taskId,
          kind: 'upload-cover',
          startedAt: Date.now(),
          draft: {
            title,
            description: style,
            lyrics: null,
            prompt: null,
            model: 'V6',
            genre: coverDraft.gender,
            isCover: true,
          },
        });
        window.localStorage.setItem(pendingListKey, JSON.stringify(list.slice(-10)));
        try { window.localStorage.removeItem(pendingLegacyKey); } catch {}
      } catch {}

      setLoading(false);
      setCoverGenerating(false);
      setToast({ kind: 'ok', text: `Cover en cola (${COST_CREDITS} créditos). Ir a Biblioteca.` });
      setTimeout(() => { try { onChange('biblioteca'); } catch {} }, 1200);
      return;
    } catch {
      const friendly = 'No pude crear el cover en este momento.';
      setLoading(false);
      setCoverGenerating(false);
      setToast({ kind: 'err', text: friendly });
      setMessages((m) => [...m, { id: uid(), role: 'assistant', text: friendly, createdAt: Date.now() }]);
    }
  }, [attachedImg, audioBusy, confirmAudioAuth, conversationId, coverDraft, coverGenerating, generating, handleAttachRemove, loading, onChange, supabaseBrowser, uiState.activeConversationId, setUi]);

  useEffect(() => () => {
    // cleanup preview URL al desmontar
    if (attachedImg) { try { URL.revokeObjectURL(attachedImg.previewUrl); } catch {} }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendMessage = useCallback(async () => {
    const text = String(input || '').trim();
    if (!supabaseBrowser) {
      setToast({ kind: 'err', text: 'No se pudo conectar con LucIAna. Cierra y abre la app de nuevo.' });
      return;
    }

    // ========== WIZARD CONVERSACIONAL para cover desde audio ==========
    if (coverWizard && attachedImg && attachedImg.kind === 'audio') {
      if (!text) {
        setToast({ kind: 'ok', text: 'Escríbeme tu respuesta para seguir.' });
        return;
      }
      const phase = coverWizard.phase;
      const affirmRe = /^(si|s[íi]|correcto|ok|okay|esta bien|está bien|va bien|bien|tal cual|usar tal cual|confirmar|si esta|sí está|asi esta|así está|perfecto|listo|ya esta|ya está|continuar|seguir)[\s\.!,¡]*$/i;
      const textLower = String(text || '').toLowerCase().trim();
      const normalized = text;

      let next: typeof coverWizard = { ...coverWizard };

      if (phase === 'lyrics') {
        if (affirmRe.test(textLower)) {
          next.phase = 'style';
          wizardPushMessage(
            '✅ Letra confirmada.\n\nAhora dime: ¿de qué **género o estilo musical** quieres que sea tu cover?\n' +
            'Ejemplos: pop, reggaetón, balada, rock, bachata, jazz, electrónica, ranchero, urbano…'
          );
        } else {
          next.lyrics = normalized;
          next.phase = 'style';
          wizardPushMessage(
            '✅ Letra actualizada.\n\nAhora dime: ¿de qué **género o estilo musical** quieres que sea tu cover?\n' +
            'Ejemplos: pop, reggaetón, balada, rock, bachata, jazz, electrónica, ranchero, urbano…'
          );
        }
      } else if (phase === 'style') {
        next.style = normalized;
        next.phase = 'mood';
        wizardPushMessage(
          '🎼 Entendido el estilo.\n\n¿Qué **mood o energía** quieres? Ejemplos: alegre y bailable, triste y melancólica, épica y cinematográfica, romántica e íntima, agresiva, relajada, misteriosa, motivadora…'
        );
      } else if (phase === 'mood') {
        next.mood = normalized;
        next.phase = 'direction';
        wizardPushMessage(
          '🎚️ Genial.\n\n¿Qué **instrumentos o dirección musical** quieres resaltar?\n' +
          'Ejemplos: guitarra acústica, piano, bajo grueso, cuerdas sinfónicas, beat 808, sintetizadores vintage, banda, mariachis, 120 BPM, 170 BPM…\n' +
          'Si no tienes preferencias, escribe **“cualquiera”**.'
        );
      } else if (phase === 'direction') {
        next.direction = /^(cualquiera|ninguno|nada|no|no tengo|lo que sea|libre)[\s\.!,¡]*$/i.test(textLower) ? '' : normalized;
        next.phase = 'title';
        wizardPushMessage(
          '🎯 Casi listo.\n\n¿Qué **título** quieres ponerle a tu cover?\n' +
          'Si prefieres que te deje una sugerencia, escribe **“sugiere uno”**.'
        );
      } else if (phase === 'title') {
        if (/^(sugiere uno|sugiere|propon|propón|tu eliges|tú eliges|elige|elije|sugerir)[\s\.!,¡]*$/i.test(textLower)) {
          const base = String(attachedImg.name || 'Cover').replace(/\.[^.]+$/, '').trim();
          next.title = base ? `${base} · cover` : 'Mi cover';
        } else {
          next.title = normalized;
        }
        next.phase = 'voice';
        wizardPushMessage(
          '🎙️ Perfecto.\n\nPara terminar: ¿quieres voz de **Hombre** o de **Mujer**?\n' +
          'Escribe solo **“Hombre”** o **“Mujer”**.'
        );
      } else if (phase === 'voice') {
        const v = /mujer|femenino|muj|fem/i.test(textLower) ? 'Mujer' : 'Hombre';
        next.voice = v;
        next.phase = 'summary';
      }

      setCoverWizard(next);

      const userMsg: ChatMessage = {
        id: uid(),
        role: 'user',
        text,
        createdAt: Date.now(),
      };
      setMessages((m) => [...m, userMsg]);
      // Limpiar SOLO al confirmar envío de texto (wizard de cover es parte del flujo conversacional real)
      if (setInputAndDraftRef.current) setInputAndDraftRef.current('', true);
      else { setInput(''); clearStoredDraft(currentUserId, uiState.activeConversationId || conversationId || null); }
      if (textareaRef.current) textareaRef.current.value = '';
      autoresizeTextarea(textareaRef.current);

      try {
        const tk = await getValidBearerToken();
        const activeConvId = (uiState as any).activeConversationId as string | null | undefined;
        if (tk && activeConvId) {
          try { await appendMessageToConversation(tk, activeConvId, { role: 'user', content: text }); } catch {}
          if (next.phase === phase) { /* no new assistant message via wizard */ }
        }
      } catch {}

      if (next.phase === 'summary') {
        const genderFinal: 'Masculino' | 'Femenino' = next.voice === 'Mujer' ? 'Femenino' : 'Masculino';
        const styleBits = [next.style, next.mood, next.direction].filter(Boolean);
        const styleFinal = styleBits.join(' · ');
        setCoverDraft({ title: next.title || 'Cover', style: styleFinal, gender: genderFinal });
        const summaryText =
          `✨ Ya tenemos todo para el cover:\n\n` +
          `**Título:** ${next.title || 'Cover'}\n` +
          `**Estilo / dirección:** ${styleFinal || 'Pop'}\n` +
          `**Voz:** ${next.voice || genderFinal}\n\n` +
          `Revisa los detalles arriba. Cuando esté bien pulsa **Generar cover** (12 créditos).`;
        wizardPushMessage(summaryText);
      }

      setLoading(false);
      return;
    }

    if (attachedImg && attachedImg.kind === 'audio') {
      // Fallback si el wizard aún no se activó (raramente, por race). Bloquear envío normal
      setToast({ kind: 'ok', text: 'Estoy preparando la transcripción. Espera un momento o vuelve a subir el audio.' });
      return;
    }

    let imgAttachment: null | {
      kind: 'image';
      name: string;
      bytes: number;
      mime_type: string;
      bytes_base64: string;
      previewUrl: string;
    } = null;
    let otherHint: null | string = null;
    if (attachedImg) {
      if (attachedImg.kind === 'image') {
        try {
          const dataUrl = await fileToDataURL(attachedImg.file);
          imgAttachment = {
            kind: 'image',
            name: String(attachedImg.name || 'imagen.jpg'),
            bytes: Number(attachedImg.bytes || 0),
            mime_type: String(attachedImg.file.type || 'image/jpeg'),
            bytes_base64: dataUrl,
            previewUrl: attachedImg.previewUrl || '',
          };
        } catch (e: any) {
          setToast({ kind: 'err', text: 'No pude leer la imagen. Vuelve a seleccionarla.' });
          return;
        }
      } else {
        otherHint =
          '📝 Archivo adjunto (texto / PDF / Word). La lectura de documentos aún no está activa en esta versión de LucIAna Bot.';
      }
    }
    if (!text && !imgAttachment) {
      if (otherHint) {
        setToast({ kind: 'ok', text: otherHint });
      }
      return;
    }
    setLoading(true);
    sentScrollRef.current = true;
    try {
      if (otherHint) {
        setToast({ kind: 'ok', text: otherHint });
      }
      const accessToken = await getValidBearerToken();
      if (!accessToken) {
        setLoading(false);
        setToast({ kind: 'err', text: 'Sesión expirada. Vuelve a iniciar sesión con Google.' });
        const errMsg: ChatMessage = {
          id: uid(),
          role: 'assistant',
          text: 'Tu sesión de LucIAna expiró. Vuelve a iniciar sesión con Google para seguir usando a LucIAna Bot.',
          createdAt: Date.now(),
        };
        setMessages((m) => [...m, errMsg]);
        return;
      }

      const userMsg: ChatMessage = {
        id: uid(),
        role: 'user',
        text,
        createdAt: Date.now(),
        attachment: imgAttachment
          ? {
              kind: 'image',
              previewUrl: imgAttachment.bytes_base64,
              name: imgAttachment.name,
              bytes: imgAttachment.bytes,
            }
          : null,
      };
      setMessages((m) => [...m, userMsg]);
      setInput('');
      if (textareaRef.current) textareaRef.current.value = '';
      // Limpiar preview adjunta tras enviarla
      if (attachedImg) {
        try { handleAttachRemove(); } catch {}
      }

      // Asegurar conversación activa en Supabase
      let activeConvId = uiState.activeConversationId;
      let activeDifyId = conversationId;
      if (!activeConvId) {
        const created = await createSupabaseConversation(accessToken, { title: text.slice(0, 60) || 'Foto de letra' });
        if (created) {
          activeConvId = created.id;
          activeDifyId = String(created.internal_dify_conversation_id || '').trim();
          setUi((p) => ({ ...p, activeConversationId: activeConvId!, conversations: created ? [created, ...p.conversations] : p.conversations }));
        }
      }
      // Guardar mensaje usuario en Supabase (async pero no bloqueante)
      if (activeConvId) {
        void (async () => {
          try {
            const prefixImg = imgAttachment ? `[Imagen adjunta: ${imgAttachment.name}] ` : '';
            await appendMessageToConversation(accessToken, activeConvId!, {
              role: 'user',
              content: prefixImg + String(text || ''),
            });
          } catch (e) { console.warn('[chat] save user msg failed', e instanceof Error ? e.message : e); }
        })();
      }

      const bodyPayload: any = { message: text };
      if (activeDifyId) bodyPayload.conversation_id = activeDifyId;
      if (imgAttachment) {
        bodyPayload.attachment = {
          kind: imgAttachment.kind,
          name: imgAttachment.name,
          mime_type: imgAttachment.mime_type,
          bytes_base64: imgAttachment.bytes_base64,
        };
      }

      let json: any = null;
      let httpStatus = 0;
      try {
        const r = await fetch('/api/dify/chat', {
          method: 'POST',
          headers: {
            'content-type': 'application/json; charset=utf-8',
            authorization: `Bearer ${accessToken}`,
            accept: 'application/json',
          },
          body: JSON.stringify(bodyPayload),
        });
        httpStatus = r.status;
        const rawText = await r.text();
        try { json = rawText ? JSON.parse(rawText) : null; }
        catch { json = { reply_text: rawText, error: 'invalid_json' }; }
      } catch (e: any) {
        httpStatus = 0;
        json = { error: 'network_error', reply_text: e instanceof Error ? String(e.message) : String(e || '') };
      }

      const replyText = stripInternalReasoning(
        String(
          (json && typeof (json as any).reply_text === 'string')
            ? (json as any).reply_text
            : (json && typeof (json as any).message === 'string')
            ? (json as any).message
            : 'No pude leer la respuesta de LucIAna Bot.'
        )
      );

      const newCid = String(
        (json && typeof (json as any).conversation_id === 'string') ? (json as any).conversation_id : activeDifyId || ''
      ).trim();
      if (newCid && newCid !== activeDifyId) {
        setConversationId(newCid);
        activeDifyId = newCid;
        if (activeConvId) {
          void (async () => {
            try { await updateConversation(accessToken, activeConvId!, { internal_dify_conversation_id: newCid }); }
            catch {}
          })();
        }
      }

      const rawStructured =
        (json && typeof (json as any).structured_action === 'object' && (json as any).structured_action !== null)
          ? (json as any).structured_action
          : null;
      let structured: ChatMessage['structured'] = null;
      if (rawStructured && String(rawStructured.action || '').toLowerCase() === 'ready_to_generate') {
        const gRaw = String(rawStructured.gender || rawStructured.vocalGender || rawStructured.voz || '').trim();
        const genderDefault: 'Masculino' | 'Femenino' = /fem|mujer|femenina|f/i.test(gRaw) ? 'Femenino' : 'Masculino';
        const stOk: ReadyToGenerate = {
          prompt: String(rawStructured.prompt || '').trim(),
          style: String(rawStructured.style || '').trim(),
          title: String(rawStructured.title || '').trim(),
          instrumental: Boolean(rawStructured.instrumental),
          gender: genderDefault,
        };
        if (stOk.prompt) structured = { action: 'ready_to_generate', ...stOk };
      }

      if (httpStatus >= 400 || (json && typeof (json as any).error === 'string')) {
        const errCode = String((json as any).error || '').trim();
        const isAuth =
          httpStatus === 401 ||
          errCode === 'unauthorized' ||
          errCode === 'missing_bearer_authorization_header' ||
          errCode === 'sesion_expirada' ||
          errCode === 'session_expired';
        const fallbackText = isAuth
          ? 'Tu sesión de LucIAna expiró. Cierra y vuelve a iniciar sesión con Google para seguir usando a LucIAna Bot.'
          : replyText || (errCode === 'dify_copilot_not_configured'
              ? 'Falta configurar el asistente en el servidor. Avisa a tu administrador/a.'
              : /^image_/i.test(errCode) || errCode === 'image_upload_error'
                ? (replyText || 'No pude procesar la imagen que enviaste. Revisa el formato (JPG/PNG/WEBP) y que no supere 10 MB.')
                : 'Hubo un problema al contactar con LucIAna Bot. Inténtalo de nuevo en 30 segundos.');
        setLoading(false);
        const mappedCode = (() => {
          if (isAuth) return 'sesión expirada, vuelve a iniciar sesión';
          const c = String(errCode || '').trim();
          if (c === 'dify_copilot_not_configured') return 'asistente no configurado';
          if (c === 'network_error') return 'error de conexión';
          if (/^image_/i.test(c)) return 'no pude procesar la imagen';
          if (!c) return '';
          return 'operación rechazada';
        })();
        setToast({ kind: 'err', text: httpStatus ? `Error ${httpStatus} · ${mappedCode || 'petición rechazada'}` : 'Error de red' });
        if (isAuth) setTimeout(() => signOutAndReload(), 1200);
        const errMsg: ChatMessage = { id: uid(), role: 'assistant', text: fallbackText, createdAt: Date.now() };
        setMessages((m) => [...m, errMsg]);
        if (activeConvId) {
          void (async () => {
            try { await appendMessageToConversation(accessToken, activeConvId!, { role: 'assistant', content: fallbackText }); } catch {}
          })();
        }
        return;
      }

      const assistantMsg: ChatMessage = {
        id: uid(),
        role: 'assistant',
        text: replyText || 'Listo.',
        createdAt: Date.now(),
        structured,
      };
      setMessages((m) => [...m, assistantMsg]);
      if (structured) {
        setActiveReady({
          prompt: structured.prompt,
          style: structured.style,
          title: structured.title,
          instrumental: structured.instrumental,
        });
      }
      if (activeConvId) {
        void (async () => {
          try {
            await appendMessageToConversation(accessToken, activeConvId!, {
              role: 'assistant',
              content: assistantMsg.text,
              structured_action: assistantMsg.structured || undefined,
            });
          } catch {}
          // Actualiza título si es el primer mensaje de usuario y el título sigue siendo "Nuevo chat"
          try {
            const firstUserText = text;
            const c0 = uiState.conversations.find((c) => c.id === activeConvId);
            if (c0 && (c0.title === 'Nuevo chat' || !c0.title)) {
              const newTitle = firstUserText.slice(0, 60).trim() || 'Nuevo chat';
              await updateConversation(accessToken, activeConvId!, { title: newTitle });
              setUi((p) => ({
                ...p,
                conversations: p.conversations.map((c) => (c.id === activeConvId ? { ...c, title: newTitle } : c)),
              }));
            }
            if (activeConvId === uiState.activeConversationId) {
              // Actualizar la lista en memoria para que aparezca actualizada si abres historial
              await refreshHistoryList();
            }
          } catch {}
        })();
      }
      setLoading(false);
    } catch (e: any) {
      setLoading(false);
      setToast({ kind: 'err', text: e instanceof Error ? e.message : String(e || '') });
    }
  }, [
    input,
    conversationId,
    supabaseBrowser,
    signOutAndReload,
    getValidBearerToken,
    createSupabaseConversation,
    appendMessageToConversation,
    updateConversation,
    uiState.activeConversationId,
    uiState.conversations,
    setUi,
    refreshHistoryList,
    attachedImg,
    handleAttachRemove,
    coverWizard,
    wizardPushMessage,
  ]);

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void sendMessage();
    }
  };

  const clearReady = () => setActiveReady(null);

  const handleGenerate = async () => {
    if (!activeReady) return;
    if (!activeReady.prompt) {
      setToast({ kind: 'err', text: 'El campo Letra / Prompt no puede estar vacío.' });
      return;
    }
    if (!supabaseBrowser) {
      setToast({ kind: 'err', text: 'Supabase no está disponible. No puedo cobrar a tu cuenta.' });
      return;
    }
    setGenerating(true);
    try {
      const accessToken = await getValidBearerToken();
      if (!accessToken) {
        setGenerating(false);
        setToast({ kind: 'err', text: 'Sesión expirada. Vuelve a iniciar sesión con Google.' });
        setTimeout(() => signOutAndReload(), 1200);
        return;
      }
      const pendingListKey = 'ramber.pendingSunoTasks_v1';
      const pendingLegacyKey = 'ramber.pendingSunoTask';
      const titleRaw = String(activeReady.title || 'Canción sin título').trim().slice(0, 100) || 'Canción sin título';
      const promptRaw = String(activeReady.prompt || '').trim().slice(0, 12000);
      const isInstrumental = Boolean(activeReady.instrumental);
      const gender = activeReady.gender || 'Masculino';
      const vocalGender = gender === 'Femenino' ? 'f' : 'm';
      const mergedLower = `${String(activeReady.style || '').toLowerCase()}\n${promptRaw.toLowerCase()}`;
      const genrePhrases = [
        'regional mexicano',
        'corrido tumbado',
        'corridos tumbados',
        'corridos',
        'corrido',
        'banda',
        'norteño',
        'norteno',
        'sierreño',
        'mariachi',
        'cumbia',
        'reggaetón',
        'reggaeton',
        'salsa',
        'bachata',
        'merengue',
      ];
      const inferredGenre = genrePhrases.find((g) => mergedLower.includes(g)) || '';
      let baseStyle = String(activeReady.style || '').trim();
      if (!baseStyle) {
        baseStyle = inferredGenre ? `Género: ${inferredGenre}` : 'General';
      } else if (inferredGenre && !baseStyle.toLowerCase().includes(inferredGenre)) {
        baseStyle = `${baseStyle}\nGénero: ${inferredGenre}`;
      }
      const styleWithGender = !isInstrumental
        ? [baseStyle, `Voz deseada: ${gender}.`].filter(Boolean).join('\n')
        : baseStyle;
      const hasJazzMention = mergedLower.includes('jazz');
      const payload: any = {
        prompt: promptRaw,
        instrumental: isInstrumental,
        customMode: true,
        model: 'V6',
        vocalGender: vocalGender,
        style: styleWithGender.slice(0, 1000),
        title: titleRaw,
        weirdnessConstraint: 0.7,
        styleWeight: 0.7,
        audioWeight: 0.7,
      };
      if (inferredGenre && !hasJazzMention) {
        payload.negativeTags = 'jazz, swing, bebop, saxophone';
      }
      const r = await fetch('/api/suno/generate', {
        method: 'POST',
        headers: {
          'content-type': 'application/json; charset=utf-8',
          authorization: `Bearer ${accessToken}`,
          accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const rawText = await r.text();
      let json: any = null;
      try { json = rawText ? JSON.parse(rawText) : null; } catch { json = null; }
      if (r.status < 200 || r.status >= 300) {
        const code = String((json as any)?.error_code || (json as any)?.code || '').trim();
        const msgRaw = String(
          (json as any)?.message || (json as any)?.detail || (json as any)?.error || `HTTP ${r.status}`
        ).trim();
        const msg =
          msgRaw ||
          (code === 'insufficient_credits' || /insufficient/i.test(code)
            ? 'No tienes créditos suficientes. Recarga saldo en Planes.'
            : '') ||
          (r.status === 401 ? 'Tu sesión expiró. Vuelve a iniciar sesión con Google.' : '');
        setGenerating(false);
        setToast({ kind: 'err', text: msg || 'Error al generar la canción.' });
        return;
      }
      const taskId = String((json as any)?.taskId || (json as any)?.task_id || '').trim() || undefined;
      const statusRaw = String((json as any)?.status || (taskId ? 'queued' : 'unknown')).trim();
      setLastPending({ task_id: taskId, status: statusRaw, startedAt: Date.now() });
      if (taskId) {
        try {
          const raw = window.localStorage.getItem(pendingListKey);
          const arr = raw ? JSON.parse(raw) : [];
          const list = Array.isArray(arr) ? arr : [];
          list.push({
            taskId,
            kind: 'generate',
            startedAt: Date.now(),
            draft: {
              title: titleRaw,
              description: String(activeReady.style || '').toString(),
              lyrics: promptRaw.trim() ? promptRaw : null,
              prompt: promptRaw,
              model: 'V6',
              genre: gender,
              isCover: false,
            },
          });
          window.localStorage.setItem(pendingListKey, JSON.stringify(list.slice(-10)));
          try { window.localStorage.removeItem(pendingLegacyKey); } catch {}
        } catch {}
      }
      const titleOk = titleRaw || 'Canción sin título';
      const okMsg: ChatMessage = {
        id: uid(),
        role: 'assistant',
        text:
          `**Canción en cola.**\n\n` +
          `· Título: ${titleOk || '-'}\n` +
          `· Créditos cobrados: 12 créditos\n` +
          `La generación tarda ~30-60s. Ve a tu **Biblioteca** para escucharla cuando esté lista.`,
        createdAt: Date.now(),
      };
      setMessages((m) => [...m, okMsg]);
      if (uiState.activeConversationId) {
        void (async () => {
          try { await appendMessageToConversation(accessToken, uiState.activeConversationId!, { role: 'assistant', content: okMsg.text }); }
          catch {}
        })();
      }
      setActiveReady(null);
      setGenerating(false);
      setToast({ kind: 'ok', text: 'Canción en cola. Ir a Biblioteca.' });
      setTimeout(() => { try { onChange('biblioteca'); } catch {} }, 1200);
    } catch (e: any) {
      setGenerating(false);
      setToast({ kind: 'err', text: e instanceof Error ? e.message : String(e || 'Error desconocido') });
    }
  };

  const readyIsValid = !!(activeReady && String(activeReady.prompt || '').trim());

  // Número total de intervenciones (solo user + assistant, system si lo hubiera no cuenta)
  const totalTurns = messages.reduce((n, m) => n + (m.role === 'user' || m.role === 'assistant' ? 1 : 0), 0);
  const isChatVeryLong = totalTurns >= 40;
  const showNewChatSuggestion = useMemo(() => {
    const threshold = isChatVeryLong ? 40 : 27;
    const step = isChatVeryLong ? 10 : 6;
    const key1 = totalTurns >= threshold ? `turns_${Math.floor(totalTurns / step)}` : null;
    return key1 && uiState.lastDismissedSuggestionKey !== key1 ? key1 : null;
  }, [totalTurns, isChatVeryLong, uiState.lastDismissedSuggestionKey]);

  // Sugerencia después de generar (no automática)
  const [showAfterGenerateHint, setShowAfterGenerateHint] = useState(false);
  useEffect(() => {
    if (!lastPending || !lastPending.task_id) return;
    setShowAfterGenerateHint(true);
    const t = setTimeout(() => setShowAfterGenerateHint(false), 15000);
    return () => clearTimeout(t);
  }, [lastPending]);

  return (
    <div className="luciana-chat-shell" role="application" aria-label="LucIAna Bot" data-chat-theme={chatTheme}>
      <header className="luciana-chat-header">
        <div className="flex min-w-0 items-center gap-2">
          {typeof onMenuClick === 'function' && (
            <button
              type="button"
              className="md:hidden inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition"
              onClick={() => onMenuClick()}
              style={{ borderColor: 'var(--border)', background: 'var(--bg-elev-1)', color: 'var(--text)' }}
              aria-label="Menú principal"
              title="Menú principal"
            >
              <Menu className="h-4.5 w-4.5" />
            </button>
          )}
          <div className="luciana-msg-avatar" style={{ width: '2.25rem', height: '2.25rem' }}>
            <img src={CHAT_AVATAR_ASSISTANT} alt="LucIAna Bot" loading="lazy" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-[0.98rem] font-black" style={{ color: 'var(--text)' }}>
              LucIAna<span style={{ color: 'var(--brand-accent)' }}> Bot</span>
            </h1>
            <p className="truncate text-[0.72rem]" style={{ color: 'var(--text-muted)' }}>
              Asistente musical · letra, estilo y generación
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          {lastPending?.task_id && (
            <button
              type="button"
              onClick={() => onChange('biblioteca')}
              className={cn(
                'inline-flex h-9 items-center gap-1.5 rounded-2xl px-2.5 text-[0.72rem] font-bold ring-1 transition sm:px-3',
              )}
              style={{
                background: 'color-mix(in srgb, #10b981 18%, transparent)',
                color: isDark ? '#d1fae5' : '#065f46',
                borderColor: 'color-mix(in srgb, #10b981 30%, transparent)',
                borderWidth: 1,
                borderStyle: 'solid',
              }}
            >
              <Library className="h-3.5 w-3.5" /> Biblioteca
            </button>
          )}
          <button
            type="button"
            aria-label="Cambiar tema del chat (solo LucIAna Bot)"
            onClick={toggleChatTheme}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--bg-elev-1)',
              color: 'var(--text)',
            }}
          >
            {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>
          <button
            type="button"
            aria-label="Historial de chats"
            onClick={() => { setHistoryOpen(true); void refreshHistoryList(); }}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-elev-1)', color: 'var(--text)' }}
          >
            <History className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => void onNewChatClick()}
            className={cn(
              'inline-flex h-9 shrink-0 items-center gap-1 rounded-full px-2.5 text-[0.72rem] font-bold transition sm:px-3',
            )}
            style={{
              background: isDark ? 'linear-gradient(135deg, rgba(124,58,237,.25), rgba(37,99,235,.22))' : 'linear-gradient(135deg, rgba(124,58,237,.12), rgba(37,99,235,.10))',
              color: 'var(--text)',
              border: '1px solid var(--border)',
            }}
          >
            <MessageSquarePlus className="h-3.5 w-3.5" /> Nuevo chat
          </button>
        </div>
      </header>

      {bootFailed && (
        <div style={{
          padding: '0.6rem 1rem',
          background: isDark ? 'rgba(244,63,94,.14)' : 'rgba(244,63,94,.1)',
          color: isDark ? '#fecdd3' : '#881337',
          borderBottom: '1px solid var(--border)',
          fontSize: '0.82rem',
        }}>
          ⚠️ Tu sesión no se pudo validar. Cierra y vuelve a iniciar sesión para usar el historial.
        </div>
      )}

      <div ref={listRef} className="luciana-chat-messages">

        {/* Header PERMANENTE: logo + marca — visible SIEMPRE al principio de cada chat.
            Si chat está nuevo/vacío: GRANDE y centrado (bienvenida).
            Si chat ya tiene mensajes: COMPACTO, arriba del todo, como banner brand. */}
        <div
          className={cn(
            'flex w-full flex-col items-center text-center transition-all ease-out duration-300',
            isEmptyState ? 'min-h-full justify-center px-6 md:px-10 py-10 md:py-6' : 'px-3 md:px-4 pt-3 pb-2'
          )}
        >
          <div
            className={cn(
              'w-full flex items-center justify-center gap-3 rounded-[1.15rem] border px-3 py-3 md:px-4 md:py-3.5',
              isEmptyState
                ? 'border-transparent bg-transparent'
                : ''
            )}
            style={isEmptyState ? undefined : {
              borderColor: 'color-mix(in srgb, var(--brand-accent) 25%, var(--border))',
              background: isDark
                ? 'linear-gradient(100deg, rgba(124,58,237,.12), rgba(7,10,18,1) 60%, rgba(236,72,153,.08) 100%)'
                : 'linear-gradient(100deg, rgba(124,58,237,.06), rgba(255,255,255,1) 60%, rgba(236,72,153,.04) 100%)',
              boxShadow: isDark ? '0 0 0 1px rgba(183,122,255,.07) inset, 0 12px 32px rgba(124,58,237,.14)' : undefined,
            }}
          >
            <img
              src={OFFICIAL_BRAND_LOGO}
              alt="Logo oficial LucIAna Music"
              className={cn(
                'object-contain drop-shadow-[0_0_24px_rgba(183,122,255,.45)] flex-shrink-0'
              )}
              style={isEmptyState ? {
                width: 'clamp(6rem, 19vw, 9rem)',
                height: 'clamp(6rem, 19vw, 9rem)',
                maxWidth: '144px',
                maxHeight: '144px',
                marginBottom: '0.15rem',
              } : {
                width: '3.1rem',
                height: '3.1rem',
                maxWidth: '48px',
                maxHeight: '48px',
                flexShrink: 0,
              }}
            />
            <div
              className={cn(
                'min-w-0 flex-1 flex',
                isEmptyState ? 'mt-1 flex-col items-center' : 'flex-col items-start text-left'
              )}
              style={{ maxWidth: isEmptyState ? '640px' : undefined }}
            >
              <div
                className={cn(
                  'font-black tracking-tight text-balance break-words'
                )}
                style={{
                  color: 'var(--text)',
                  fontSize: isEmptyState
                    ? 'clamp(1.25rem, 5.6vw, 1.8rem)'
                    : 'clamp(0.96rem, 3.6vw, 1.12rem)',
                  lineHeight: 1.15,
                  textAlign: isEmptyState ? 'center' : 'left',
                }}
              >
                Luc<span style={{ color: 'var(--brand-accent)', WebkitTextStroke: '0.3px currentColor' }}>IA</span>na Music <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>|</span> Canciones, Covers y MP3
              </div>
              {isEmptyState ? (
                <>
                  <div
                    className="mt-2 md:mt-1.5 font-semibold"
                    style={{
                      color: 'var(--text-muted)',
                      fontSize: 'clamp(0.9rem, 3.4vw, 1.05rem)',
                    }}
                  >
                    Por Ruben Vidal Hernandez
                  </div>
                  <div
                    className="mt-5 md:mt-4 font-semibold"
                    style={{
                      color: 'var(--text)',
                      fontSize: 'clamp(0.95rem, 3.8vw, 1.08rem)',
                      lineHeight: 1.45,
                      maxWidth: '480px',
                      marginInline: 'auto',
                    }}
                  >
                    Crea canciones completas con IA, elige el estilo, escribe tu idea y descarga tu MP3 al instante. 🎧⚡
                  </div>
                </>
              ) : (
                <div
                  className="mt-0.5"
                  style={{
                    color: 'var(--text-muted)',
                    fontSize: 'clamp(0.74rem, 2.8vw, 0.84rem)',
                    fontWeight: 600,
                  }}
                >
                  Por Ruben Vidal Hernandez · {uiState.conversations.find((x) => x.id === uiState.activeConversationId)?.created_at
                    ? `Chat guardado · ${formatDay((uiState.conversations.find((x) => x.id === uiState.activeConversationId) as any)?.updated_at || (uiState.conversations.find((x) => x.id === uiState.activeConversationId) as any)?.created_at || new Date().toISOString())}`
                    : 'Asistente musical premium · 24/7'}
                </div>
              )}
            </div>
          </div>
        </div>

        {showNewChatSuggestion && !isEmptyState && (
          <div className="luciana-newchat-hint">
            <span>
              {isChatVeryLong
                ? 'Este chat ya es muy largo. Para que LucIAna mantenga mejor el contexto, te recomendamos iniciar un chat nuevo.'
                : `💡 Ya lleváis unas ${totalTurns} intervenciones. Si vas a empezar una idea distinta, te recomiendo crear un chat nuevo.`}
            </span>
            <button
              type="button"
              onClick={() => {
                setUi((p) => ({ ...p, lastDismissedSuggestionKey: showNewChatSuggestion }));
                void onNewChatClick();
              }}
            >
              Nuevo chat
            </button>
          </div>
        )}

        {showAfterGenerateHint && !isEmptyState && (
          <div className="luciana-newchat-hint">
            <span>✨ Canción generada correctamente. Si tienes otra idea, puedes empezar un chat nuevo.</span>
            <button
              type="button"
              onClick={() => { setShowAfterGenerateHint(false); void onNewChatClick(); }}
            >
              Nuevo chat
            </button>
          </div>
        )}

        {messages
          .filter((m) => !(isEmptyState && m.role === 'assistant'))
          .map((m) => {
          const isUser = m.role === 'user';
          const img = m.attachment && m.attachment.kind === 'image' ? m.attachment : null;
          const aud = m.attachment && m.attachment.kind === 'audio' ? m.attachment : null;
          return (
            <div key={m.id} className={cn('luciana-msg-row', isUser ? 'is-user' : 'is-assistant')}>
              <div className="luciana-msg-wrap">
                <div className={cn('luciana-msg-avatar', isUser ? 'user' : '')} aria-hidden>
                  {isUser ? (
                    <User className="h-4 w-4 text-white" />
                  ) : (
                    <img src={CHAT_AVATAR_ASSISTANT} alt="LucIAna" loading="lazy" />
                  )}
                </div>
                <div className="luciana-msg-bubble" style={img || aud ? { padding: '0.5rem', overflow: 'hidden' } : undefined}>
                  {img && (
                    <div
                      style={{
                        marginBottom: m.text ? '0.5rem' : '0',
                        display: 'flex',
                        justifyContent: isUser ? 'flex-end' : 'flex-start',
                      }}
                    >
                      <img
                        src={img.previewUrl}
                        alt={img.name || 'imagen'}
                        loading="lazy"
                        onClick={() => {
                          try { window.open(img.previewUrl, '_blank', 'noopener,noreferrer'); } catch {}
                        }}
                        style={{
                          maxWidth: '260px',
                          maxHeight: '260px',
                          width: 'auto',
                          height: 'auto',
                          objectFit: 'contain',
                          borderRadius: '0.9rem',
                          cursor: 'zoom-in',
                          border: isUser
                            ? '1px solid color-mix(in srgb, var(--brand-primary) 24%, transparent)'
                            : '1px solid var(--border)',
                        }}
                      />
                    </div>
                  )}
                  {aud && (
                    <div style={{ marginBottom: m.text ? '0.5rem' : '0' }}>
                      <audio
                        controls
                        preload="metadata"
                        src={aud.previewUrl}
                        style={{ width: '260px', maxWidth: '100%' }}
                      />
                    </div>
                  )}
                  {m.text ? (
                    <div
                      className="prose-luciana"
                      dangerouslySetInnerHTML={{ __html: simpleMarkdown(m.text, isDark) }}
                    />
                  ) : null}
                  {m.structured?.action === 'ready_to_generate' && (
                    <div
                      style={{
                        marginTop: '0.7rem',
                        padding: '0.55rem 0.7rem',
                        borderRadius: '0.85rem',
                        border: '1px solid color-mix(in srgb, #10b981 35%, transparent)',
                        background: 'color-mix(in srgb, #10b981 16%, transparent)',
                        color: isDark ? '#d1fae5' : '#064e3b',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                      }}
                    >
                      <CheckCircle2 className="h-4 w-4" /> Resumen listo: revisa y pulsa <b>Generar canción</b>.
                    </div>
                  )}
                  {m.structured?.action === 'transcription_ready' && (
                    <div style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <button
                        type="button"
                        onClick={() => {
                          try {
                            const t = String((m.structured as any)?.lyrics || '').trim();
                            if (!t) return;
                            setInput(t);
                            if (textareaRef.current) textareaRef.current.value = t;
                            try { textareaRef.current?.focus?.(); } catch {}
                            setToast({ kind: 'ok', text: 'Corrige la transcripción y luego envíala para que LucIAna Bot la use.' });
                          } catch {}
                        }}
                        className="inline-flex h-9 items-center justify-center rounded-2xl border px-3 text-xs font-bold"
                        style={{ borderColor: 'var(--border)', background: 'var(--bg-elev-1)', color: 'var(--text)' }}
                      >
                        Corregir
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          try {
                            const t = String((m.structured as any)?.lyrics || '').trim();
                            if (!t) return;
                            setInput(t);
                            if (textareaRef.current) textareaRef.current.value = t;
                            setTimeout(() => { try { void sendMessage(); } catch {} }, 60);
                          } catch {}
                        }}
                        className="inline-flex h-9 items-center justify-center rounded-2xl border px-3 text-xs font-black"
                        style={{
                          borderColor: 'transparent',
                          background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-accent))',
                          color: '#fff',
                        }}
                      >
                        Usar tal cual
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {activeReady && (
          <div className="luciana-msg-row is-assistant">
            <div className="luciana-msg-wrap">
              <div className="luciana-msg-avatar" aria-hidden>
                <img src={CHAT_AVATAR_ASSISTANT} alt="LucIAna" loading="lazy" />
              </div>
              <div
                className="luciana-msg-bubble"
                style={{
                  width: '100%',
                  padding: 0,
                  background: 'transparent',
                  border: 'none',
                  boxShadow: 'none',
                }}
              >
                <div style={{
                  padding: '1rem 1.05rem',
                  borderRadius: '1.25rem',
                  border: '1px solid color-mix(in srgb, var(--brand-primary) 30%, var(--border))',
                  background: isDark
                    ? 'linear-gradient(135deg, rgba(124,58,237,.14), rgba(37,99,235,.10))'
                    : 'linear-gradient(135deg, rgba(124,58,237,.08), rgba(37,99,235,.06))',
                  backdropFilter: 'blur(8px)',
                  color: 'var(--text)',
                }}>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="inline-flex h-9 w-9 items-center justify-center rounded-2xl ring-1"
                        style={{
                          background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-accent))',
                          boxShadow: '0 10px 24px color-mix(in srgb, var(--brand-primary) 28%, transparent)',
                          borderColor: 'transparent',
                          color: '#fff',
                        }}
                      >
                        <Music2 className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <h2 className="text-base font-black" style={{ color: 'var(--text)' }}>
                          Resumen para generar canción
                        </h2>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          Revisa, edita si quieres y pulsa <b style={{ color: 'var(--brand-primary)' }}>Generar canción</b>.
                          Se cobran <b style={{ color: 'var(--brand-accent)' }}>12 créditos</b> a tu cuenta real.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={clearReady}
                      disabled={generating}
                      className="inline-flex h-9 items-center gap-1.5 rounded-2xl border px-3 text-xs font-bold transition disabled:opacity-60"
                      style={{ borderColor: 'var(--border)', color: 'var(--text)', background: 'var(--bg-elev-1)' }}
                    >
                      Quitar resumen
                    </button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="md:col-span-2 block">
                      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--brand-primary)' }}>
                        Letra / Prompt
                      </span>
                      <textarea
                        rows={7}
                        value={activeReady.prompt}
                        onChange={(e) => setActiveReady({ ...activeReady, prompt: e.target.value })}
                        style={{
                          display: 'block',
                          width: '100%',
                          resize: 'vertical',
                          borderRadius: '1rem',
                          border: '1px solid var(--border)',
                          background: 'var(--bg-elev-1)',
                          color: 'var(--text)',
                          padding: '0.7rem 0.9rem',
                          fontSize: '0.9rem',
                          lineHeight: 1.55,
                          outline: 'none',
                        }}
                      />
                      <div style={{ marginTop: '0.15rem', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        {String(activeReady.prompt || '').length} / 12,000 caracteres
                      </div>
                    </label>

                    <label className="block">
                      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--brand-primary)' }}>
                        Título
                      </span>
                      <input
                        type="text"
                        value={activeReady.title}
                        onChange={(e) => setActiveReady({ ...activeReady, title: e.target.value })}
                        placeholder="Ej: Noches de verano"
                        style={{
                          display: 'block',
                          width: '100%',
                          height: '2.75rem',
                          borderRadius: '1rem',
                          border: '1px solid var(--border)',
                          background: 'var(--bg-elev-1)',
                          color: 'var(--text)',
                          padding: '0 0.9rem',
                          fontSize: '0.9rem',
                          outline: 'none',
                        }}
                      />
                    </label>

                    <label className="md:col-span-2 block">
                      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--brand-primary)' }}>
                        Estilo musical
                      </span>
                      <textarea
                        rows={3}
                        value={activeReady.style}
                        onChange={(e) => setActiveReady({ ...activeReady, style: e.target.value })}
                        placeholder="Ej: Latino-pop festivo, 108 BPM, guitarra acústica, voz femenina cálida, bajo eléctrico, ambiente feliz de fiesta"
                        style={{
                          display: 'block',
                          width: '100%',
                          resize: 'vertical',
                          minHeight: '5rem',
                          maxHeight: '11rem',
                          borderRadius: '1rem',
                          border: '1px solid var(--border)',
                          background: 'var(--bg-elev-1)',
                          color: 'var(--text)',
                          padding: '0.8rem 0.95rem',
                          fontSize: '0.92rem',
                          lineHeight: 1.55,
                          outline: 'none',
                        }}
                      />
                      <div style={{ marginTop: '0.2rem', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        Cuantos más detalles mejor: género, tempo, instrumentos, estado de ánimo, acentos.
                      </div>
                    </label>

                    <div className="md:col-span-2 block">
                      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--brand-primary)' }}>
                        Voz deseada
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setActiveReady({ ...activeReady, gender: 'Masculino' })}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem',
                            height: '3rem',
                            borderRadius: '1rem',
                            border: `1px solid ${activeReady.gender === 'Masculino' ? 'transparent' : 'var(--border)'}`,
                            background:
                              activeReady.gender === 'Masculino'
                                ? 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)'
                                : 'var(--bg-elev-1)',
                            color: activeReady.gender === 'Masculino' ? '#fff' : 'var(--text)',
                            fontWeight: 800,
                            fontSize: '0.95rem',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            boxShadow: activeReady.gender === 'Masculino' ? '0 10px 24px color-mix(in srgb, #2563eb 30%, transparent)' : 'none',
                          }}
                        >
                          👨 Hombre
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveReady({ ...activeReady, gender: 'Femenino' })}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem',
                            height: '3rem',
                            borderRadius: '1rem',
                            border: `1px solid ${activeReady.gender === 'Femenino' ? 'transparent' : 'var(--border)'}`,
                            background:
                              activeReady.gender === 'Femenino'
                                ? 'linear-gradient(135deg, #ec4899 0%, var(--brand-accent) 100%)'
                                : 'var(--bg-elev-1)',
                            color: activeReady.gender === 'Femenino' ? '#fff' : 'var(--text)',
                            fontWeight: 800,
                            fontSize: '0.95rem',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            boxShadow: activeReady.gender === 'Femenino' ? '0 10px 24px color-mix(in srgb, #ec4899 30%, transparent)' : 'none',
                          }}
                        >
                          👩 Mujer
                        </button>
                      </div>
                      <div style={{ marginTop: '0.25rem', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        Elige el tipo de voz que quieres para cantar la canción.
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col-reverse items-stretch gap-3 md:flex-row md:items-center md:justify-between">
                    <div
                      className="flex items-center gap-2 rounded-2xl border px-4 py-3 text-xs"
                      style={{
                        borderColor: 'color-mix(in srgb, var(--brand-accent) 35%, transparent)',
                        background: 'color-mix(in srgb, var(--brand-accent) 14%, transparent)',
                        color: isDark ? '#fde68a' : '#78350f',
                      }}
                    >
                      <WalletCards className="h-4 w-4" />
                      <div>
                        <div style={{ fontWeight: 900 }}>12 créditos</div>
                        <div style={{ opacity: 0.88 }}>se descontarán de tu cuenta real de LucIAna cuando pulses el botón.</div>
                      </div>
                    </div>
                    <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center">
                      <button
                        type="button"
                        onClick={clearReady}
                        disabled={generating}
                        className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border px-5 text-sm font-bold transition disabled:opacity-60"
                        style={{ borderColor: 'var(--border)', background: 'var(--bg-elev-1)', color: 'var(--text)' }}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleGenerate()}
                        disabled={generating || !readyIsValid}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.5rem',
                          height: '3rem',
                          minWidth: '220px',
                          padding: '0 1.5rem',
                          borderRadius: '1rem',
                          border: '1px solid transparent',
                          fontWeight: 900,
                          fontSize: '1rem',
                          color: '#fff',
                          background: 'linear-gradient(135deg, var(--brand-primary) 0%, #ec4899 50%, var(--brand-accent) 100%)',
                          boxShadow: '0 14px 40px color-mix(in srgb, var(--brand-primary) 32%, transparent)',
                          cursor: generating || !readyIsValid ? 'not-allowed' : 'pointer',
                          opacity: generating || !readyIsValid ? 0.78 : 1,
                          transition: 'filter 0.15s ease, transform 0.15s ease',
                        }}
                        onMouseEnter={(e) => { if (!(generating || !readyIsValid)) (e.currentTarget.style.filter = 'brightness(1.08)'); }}
                        onMouseLeave={(e) => (e.currentTarget.style.filter = 'none')}
                      >
                        {generating ? (
                          <>
                            <Loader2 className="h-5 w-5 animate-spin" /> Generando canción…
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-5 w-5" /> Generar canción
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {coverDraft && attachedImg && attachedImg.kind === 'audio' && coverWizard && coverWizard.phase === 'summary' && (
          <div className="luciana-msg-row is-assistant">
            <div className="luciana-msg-wrap">
              <div className="luciana-msg-avatar" aria-hidden>
                <img src={CHAT_AVATAR_ASSISTANT} alt="LucIAna" loading="lazy" />
              </div>
              <div
                className="luciana-msg-bubble"
                style={{
                  width: '100%',
                  padding: 0,
                  background: 'transparent',
                  border: 'none',
                  boxShadow: 'none',
                }}
              >
                <div style={{
                  padding: '1rem 1.05rem',
                  borderRadius: '1.25rem',
                  border: '1px solid color-mix(in srgb, var(--brand-primary) 30%, var(--border))',
                  background: isDark
                    ? 'linear-gradient(135deg, rgba(124,58,237,.14), rgba(37,99,235,.10))'
                    : 'linear-gradient(135deg, rgba(124,58,237,.08), rgba(37,99,235,.06))',
                  backdropFilter: 'blur(8px)',
                  color: 'var(--text)',
                }}>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="inline-flex h-9 w-9 items-center justify-center rounded-2xl ring-1"
                        style={{
                          background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-accent))',
                          boxShadow: '0 10px 24px color-mix(in srgb, var(--brand-primary) 28%, transparent)',
                          borderColor: 'transparent',
                          color: '#fff',
                        }}
                      >
                        <Music2 className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <h2 className="text-base font-black" style={{ color: 'var(--text)' }}>
                          Resumen final · cover
                        </h2>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          Revisa los detalles. Se cobrarán <b style={{ color: 'var(--brand-accent)' }}>12 créditos</b> solo cuando pulses <b style={{ color: 'var(--brand-primary)' }}>Generar cover</b>.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setCoverDraft(null); setCoverWizard(null); }}
                      disabled={coverGenerating || loading}
                      className="inline-flex h-9 items-center gap-1.5 rounded-2xl border px-3 text-xs font-bold transition disabled:opacity-60"
                      style={{ borderColor: 'var(--border)', color: 'var(--text)', background: 'var(--bg-elev-1)' }}
                    >
                      Cerrar
                    </button>
                  </div>

                  {attachedImg.previewUrl ? (
                    <div style={{ marginBottom: '0.75rem' }}>
                      <audio controls preload="metadata" src={attachedImg.previewUrl} style={{ width: '100%', maxWidth: '520px' }} />
                    </div>
                  ) : null}

                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--brand-primary)' }}>
                        Título
                      </span>
                      <input
                        type="text"
                        value={coverDraft.title}
                        onChange={(e) => setCoverDraft({ ...coverDraft, title: e.target.value })}
                        placeholder="Ej: Mi cover"
                        style={{
                          display: 'block',
                          width: '100%',
                          height: '2.75rem',
                          borderRadius: '1rem',
                          border: '1px solid var(--border)',
                          background: 'var(--bg-elev-1)',
                          color: 'var(--text)',
                          padding: '0 0.9rem',
                          fontSize: '0.9rem',
                          outline: 'none',
                        }}
                      />
                    </label>

                    <div className="block">
                      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--brand-primary)' }}>
                        Voz
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setCoverDraft({ ...coverDraft, gender: 'Masculino' })}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem',
                            height: '2.75rem',
                            borderRadius: '1rem',
                            border: `1px solid ${coverDraft.gender === 'Masculino' ? 'transparent' : 'var(--border)'}`,
                            background:
                              coverDraft.gender === 'Masculino'
                                ? 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)'
                                : 'var(--bg-elev-1)',
                            color: coverDraft.gender === 'Masculino' ? '#fff' : 'var(--text)',
                            fontWeight: 800,
                            fontSize: '0.92rem',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            boxShadow: coverDraft.gender === 'Masculino' ? '0 10px 24px color-mix(in srgb, #2563eb 30%, transparent)' : 'none',
                          }}
                        >
                          👨 Hombre
                        </button>
                        <button
                          type="button"
                          onClick={() => setCoverDraft({ ...coverDraft, gender: 'Femenino' })}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem',
                            height: '2.75rem',
                            borderRadius: '1rem',
                            border: `1px solid ${coverDraft.gender === 'Femenino' ? 'transparent' : 'var(--border)'}`,
                            background:
                              coverDraft.gender === 'Femenino'
                                ? 'linear-gradient(135deg, #ec4899 0%, var(--brand-accent) 100%)'
                                : 'var(--bg-elev-1)',
                            color: coverDraft.gender === 'Femenino' ? '#fff' : 'var(--text)',
                            fontWeight: 800,
                            fontSize: '0.92rem',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            boxShadow: coverDraft.gender === 'Femenino' ? '0 10px 24px color-mix(in srgb, #ec4899 30%, transparent)' : 'none',
                          }}
                        >
                          👩 Mujer
                        </button>
                      </div>
                    </div>

                    <label className="md:col-span-2 block">
                      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--brand-primary)' }}>
                        Estilo musical
                      </span>
                      <textarea
                        rows={3}
                        value={coverDraft.style}
                        onChange={(e) => setCoverDraft({ ...coverDraft, style: e.target.value })}
                        placeholder="Ej: Pop romántico moderno, 100 BPM, guitarra acústica, ambiente suave"
                        style={{
                          display: 'block',
                          width: '100%',
                          resize: 'vertical',
                          minHeight: '5rem',
                          maxHeight: '11rem',
                          borderRadius: '1rem',
                          border: '1px solid var(--border)',
                          background: 'var(--bg-elev-1)',
                          color: 'var(--text)',
                          padding: '0.8rem 0.95rem',
                          fontSize: '0.92rem',
                          lineHeight: 1.55,
                          outline: 'none',
                        }}
                      />
                    </label>

                    <label className="md:col-span-2 block">
                      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--brand-primary)' }}>
                        Letra / prompt
                      </span>
                      <textarea
                        rows={6}
                        value={coverWizard.lyrics}
                        onChange={(e) => setCoverWizard((prev) => prev ? { ...prev, lyrics: e.target.value } : prev)}
                        placeholder="Letra que usará el cover"
                        style={{
                          display: 'block',
                          width: '100%',
                          resize: 'vertical',
                          minHeight: '9rem',
                          maxHeight: '18rem',
                          borderRadius: '1rem',
                          border: '1px solid var(--border)',
                          background: 'var(--bg-elev-1)',
                          color: 'var(--text)',
                          padding: '0.8rem 0.95rem',
                          fontSize: '0.9rem',
                          lineHeight: 1.55,
                          outline: 'none',
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                          whiteSpace: 'pre-wrap',
                        }}
                      />
                    </label>
                  </div>

                  <div className="mt-4 flex flex-col-reverse items-stretch gap-2 md:flex-row md:items-center md:justify-between">
                    <button
                      type="button"
                      onClick={() => { setCoverDraft(null); setCoverWizard(null); }}
                      disabled={coverGenerating || loading}
                      className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border px-5 text-sm font-bold transition disabled:opacity-60"
                      style={{ borderColor: 'var(--border)', background: 'var(--bg-elev-1)', color: 'var(--text)' }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleGenerateCoverFromAudio()}
                      disabled={
                        coverGenerating || loading ||
                        !String(coverDraft.title || '').trim() ||
                        !String(coverDraft.style || '').trim() ||
                        !String(coverWizard.lyrics || '').trim() ||
                        (coverDraft.gender !== 'Masculino' && coverDraft.gender !== 'Femenino')
                      }
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        height: '3rem',
                        minWidth: '220px',
                        padding: '0 1.5rem',
                        borderRadius: '1rem',
                        border: '1px solid transparent',
                        fontWeight: 900,
                        fontSize: '1rem',
                        color: '#fff',
                        background: 'linear-gradient(135deg, var(--brand-primary) 0%, #ec4899 50%, var(--brand-accent) 100%)',
                        boxShadow: '0 14px 40px color-mix(in srgb, var(--brand-primary) 32%, transparent)',
                        cursor: (coverGenerating || loading ||
                          !String(coverDraft.title || '').trim() ||
                          !String(coverDraft.style || '').trim() ||
                          !String(coverWizard.lyrics || '').trim() ||
                          (coverDraft.gender !== 'Masculino' && coverDraft.gender !== 'Femenino')) ? 'not-allowed' : 'pointer',
                        opacity: (coverGenerating || loading ||
                          !String(coverDraft.title || '').trim() ||
                          !String(coverDraft.style || '').trim() ||
                          !String(coverWizard.lyrics || '').trim() ||
                          (coverDraft.gender !== 'Masculino' && coverDraft.gender !== 'Femenino')) ? 0.72 : 1,
                        transition: 'filter 0.15s ease, transform 0.15s ease',
                      }}
                    >
                      {coverGenerating ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin" /> Generando cover…
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-5 w-5" /> Generar cover (12 créditos)
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {loading && (
          <div className="luciana-msg-row is-assistant">
            <div className="luciana-msg-wrap">
              <div className="luciana-msg-avatar" aria-hidden>
                <img src={CHAT_AVATAR_ASSISTANT} alt="" loading="lazy" />
              </div>
              <div
                className="luciana-msg-bubble"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.88rem' }}
              >
                <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--brand-primary)' }} />
                <span>LucIAna Bot está escribiendo…</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="luciana-chat-composer">
        {attachedImg && (
          <div className="luciana-attach-preview" role="group" aria-label="Archivo adjunto">
            {attachedImg.kind === 'image' && attachedImg.previewUrl ? (
              <img src={attachedImg.previewUrl} alt={attachedImg.name} loading="lazy" />
            ) : attachedImg.kind === 'audio' ? (
              attachedImg.previewUrl ? (
                <audio
                  controls
                  preload="metadata"
                  src={attachedImg.previewUrl}
                  style={{ width: '240px', maxWidth: '100%' }}
                />
              ) : (
                <div className="luciana-attach-preview__icon" aria-hidden="true"><Music2 className="h-7 w-7" /></div>
              )
            ) : (
              <div className="luciana-attach-preview__icon" aria-hidden="true"><Library className="h-7 w-7" /></div>
            )}
            <div className="luciana-attach-preview__info">
              <span className="luciana-attach-preview__name">{attachedImg.name}</span>
              <span className="luciana-attach-preview__meta">
                {(attachedImg.bytes / 1024).toFixed(attachedImg.bytes > 1024 * 100 ? 0 : 1)} KB · {attachedImg.file.type || (attachedImg.kind === 'image' ? 'imagen' : attachedImg.kind === 'audio' ? 'audio' : 'archivo')}
              </span>
              {attachedImg.kind === 'image' ? (
                <span className="badge-soon" style={{ opacity: 0.9 }}>📸 Foto lista · se enviará junto con tu mensaje</span>
              ) : attachedImg.kind === 'audio' ? (
                <span className="badge-soon" style={{ opacity: 0.9 }}>
                  {coverWizard
                    ? (
                      coverWizard.phase === 'lyrics' ? '🎙️ Transcripción lista · corrige o confirma en el chat'
                        : coverWizard.phase === 'summary' ? '🎛️ Revisa el resumen y pulsa “Generar cover”'
                        : `🎙️ Siguiente paso en el chat: ${coverWizard.phase === 'style' ? 'género/estilo'
                          : coverWizard.phase === 'mood' ? 'mood/energía'
                          : coverWizard.phase === 'direction' ? 'instrumentos/dirección'
                          : coverWizard.phase === 'title' ? 'título'
                          : coverWizard.phase === 'voice' ? 'voz Hombre/Mujer'
                          : 'preparando…'}`)
                    : '🎙️ Audio cargado · confirmando autorización y transcribiendo…'}
                </span>
              ) : (
                <span className="badge-soon" style={{ opacity: 0.9 }}>📝 Archivo adjunto</span>
              )}
            </div>
            <button
              type="button"
              className="luciana-attach-preview__remove"
              onClick={handleAttachRemove}
              aria-label="Quitar archivo adjunto"
              title="Quitar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {attachMenuOpen && (
          <div className="luciana-attach-direct">
            <button
              type="button"
              className="luciana-attach-direct__btn"
              aria-disabled={loading || generating}
              data-disabled={loading || generating ? 'true' : 'false'}
              onClick={() => triggerFilePickForKind('image')}
            >
              <span className="luciana-attach-direct__icon"><ImageIcon className="h-5 w-5" /></span>
              <span className="luciana-attach-direct__label">
                <strong>Subir imagen</strong>
                <small>Foto de letra · JPG/PNG/WEBP</small>
              </span>
            </button>
            <button
              type="button"
              className="luciana-attach-direct__btn"
              aria-disabled={loading || generating}
              data-disabled={loading || generating ? 'true' : 'false'}
              onClick={() => triggerFilePickForKind('audio')}
            >
              <span className="luciana-attach-direct__icon"><Music2 className="h-5 w-5" /></span>
              <span className="luciana-attach-direct__label">
                <strong>Subir audio</strong>
                <small>Solo archivos MP3</small>
              </span>
            </button>
            <button
              type="button"
              className="luciana-attach-direct__btn"
              aria-disabled={loading || generating}
              data-disabled={loading || generating ? 'true' : 'false'}
              onClick={() => triggerFilePickForKind('mic')}
            >
              <span className="luciana-attach-direct__icon"><Mic className="h-5 w-5" /></span>
              <span className="luciana-attach-direct__label">
                <strong>Quiero cantarlo</strong>
                <small>Grabar con micrófono</small>
              </span>
            </button>
          </div>
        )}
        <div className="luciana-composer-inner">
          <div className="relative">
            <button
              type="button"
              className={cn('luciana-attach-btn', attachMenuOpen ? 'is-open' : '')}
              onClick={handleAttachPick}
              aria-disabled={loading || generating}
              data-disabled={loading || generating ? 'true' : 'false'}
              aria-label="Adjuntar (foto de letra o audio propio)"
              aria-expanded={attachMenuOpen}
              title={attachMenuOpen ? 'Cerrar opciones de adjuntar' : 'Adjuntar · foto de letra / audio propio'}
            >
              {attachMenuOpen ? (
                <X className="h-4.5 w-4.5" />
              ) : (
                <Paperclip className="h-4.5 w-4.5" />
              )}
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,audio/*,.doc,.docx,.txt,.md,.rtf,.pdf"
            onChange={handleAttachFileChange}
            style={{ display: 'none' }}
          />
          <div className="luciana-composer-textarea-wrap">
            <textarea
              ref={textareaRef}
              className="luciana-composer-textarea"
              value={input}
              maxLength={COMPOSER_CHAR_LIMIT}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
                // Bloqueo suave al alcanzar límite: NUNCA borra lo escrito, solo impide más caracteres
                const raw = e.target.value;
                const next = raw.length > COMPOSER_CHAR_LIMIT ? raw.slice(0, COMPOSER_CHAR_LIMIT) : raw;
                setInput(next);
                autoresizeTextarea(textareaRef.current);
              }}
              onInput={(e: any) => autoresizeTextarea(e?.target || textareaRef.current)}
              onKeyDown={onInputKeyDown}
              rows={1}
              placeholder="Escribe tu idea…"
              disabled={loading || generating}
              autoComplete="off"
              autoCorrect="on"
              spellCheck
            />
            <div
              className="luciana-composer-counter"
              title={String(input || '').length >= COMPOSER_CHAR_LIMIT ? 'Has alcanzado el límite de caracteres' : ''}
              style={{
                color: String(input || '').length > COMPOSER_CHAR_LIMIT * 0.92
                  ? 'color-mix(in srgb, #ef4444 85%, var(--text-muted))'
                  : undefined,
                fontWeight: String(input || '').length > COMPOSER_CHAR_LIMIT * 0.92 ? 700 : undefined,
              }}
            >
              {Math.min(String(input || '').length, COMPOSER_CHAR_LIMIT)} / {COMPOSER_CHAR_LIMIT}
            </div>
          </div>
          <button
            type="button"
            className="luciana-composer-send"
            onClick={() => void sendMessage()}
            disabled={!canSend}
            aria-label="Enviar mensaje"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4.5 w-4.5" />}
          </button>
        </div>
      </div>

      <div
        className={cn('luciana-history-backdrop', historyOpen ? 'is-open' : '')}
        onClick={() => { setHistoryOpen(false); setHistoryMenuOpenId(null); }}
        aria-hidden={!historyOpen}
      />
      <aside
        className={cn('luciana-history-panel', historyOpen ? 'is-open' : '')}
        role="dialog"
        aria-modal="true"
        aria-label="Historial de chats"
      >
        <div style={{
          flex: '0 0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.5rem',
          padding: '0.85rem 1rem',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-elev-1)',
          color: 'var(--text)',
        }}>
          <div className="flex items-center gap-2">
            <History className="h-4 w-4" />
            <span style={{ fontWeight: 800 }}>Historial</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="Nuevo chat"
              onClick={() => { setHistoryOpen(false); void onNewChatClick(); }}
              className="inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-[0.72rem] font-bold transition"
              style={{ borderColor: 'var(--border)', background: 'var(--bg-elev-2)', color: 'var(--text)' }}
            >
              <Plus className="h-3.5 w-3.5" /> Nuevo
            </button>
            <button
              type="button"
              aria-label="Cerrar historial"
              onClick={() => setHistoryOpen(false)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border transition"
              style={{ borderColor: 'var(--border)', background: 'var(--bg-elev-2)', color: 'var(--text)' }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div
          style={{
            flex: '1 1 auto',
            overflowY: 'auto',
            padding: '0.5rem',
            background: 'var(--bg)',
          }}
        >
          {historyLoading ? (
            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
              <Loader2 className="h-4 w-4 animate-spin" style={{ display: 'inline', marginRight: '0.4rem', verticalAlign: '-2px' }} />
              Cargando historial…
            </div>
          ) : uiState.conversations.length === 0 ? (
            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
              Aún no hay chats guardados. Cuando cierres o recargues la pestaña aparecerán aquí.
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {uiState.conversations.map((c) => {
                const isActive = c.id === uiState.activeConversationId;
                const isMenuOpen = historyMenuOpenId === c.id;
                return (
                  <li key={c.id} style={{ position: 'relative' }}>
                    <div
                      onClick={() => void openConversation(c)}
                      style={{
                        display: 'flex',
                        width: '100%',
                        textAlign: 'left',
                        padding: '0.6rem 0.75rem',
                        paddingRight: '2.3rem',
                        borderRadius: '0.85rem',
                        border: `1px solid ${isActive ? 'color-mix(in srgb, var(--brand-primary) 45%, var(--border))' : 'transparent'}`,
                        background: isActive
                          ? 'color-mix(in srgb, var(--brand-primary) 14%, var(--bg-elev-1))'
                          : 'var(--bg-elev-1)',
                        color: 'var(--text)',
                        cursor: 'pointer',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: '0.5rem',
                      }}
                    >
                      <div style={{ minWidth: 0, flex: '1 1 auto' }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'baseline',
                          justifyContent: 'space-between',
                          gap: '0.5rem',
                        }}>
                          <span style={{
                            fontWeight: 700,
                            fontSize: '0.86rem',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: '72%',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                          }}>
                            {c.pinned ? (
                              <Pin className="h-3.5 w-3.5" style={{ color: 'var(--brand-primary)', flexShrink: 0 }} />
                            ) : null}
                            {c.title || 'Nuevo chat'}
                          </span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            {formatDay(c.updated_at || c.created_at)}
                          </span>
                        </div>
                        {c.archived_at ? (
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                            Archivado · {formatDay(c.archived_at)}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label={isMenuOpen ? 'Cerrar opciones' : 'Opciones de este chat'}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setHistoryMenuOpenId(isMenuOpen ? null : c.id);
                      }}
                      style={{
                        position: 'absolute',
                        top: '0.45rem',
                        right: '0.35rem',
                        width: '1.85rem',
                        height: '1.85rem',
                        borderRadius: '9999px',
                        border: `1px solid ${isMenuOpen ? 'color-mix(in srgb, var(--brand-primary) 40%, var(--border))' : 'transparent'}`,
                        background: isMenuOpen
                          ? 'color-mix(in srgb, var(--brand-primary) 14%, var(--bg-elev-2))'
                          : 'transparent',
                        color: 'var(--text-muted)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        zIndex: 3,
                      }}
                      onMouseEnter={(e) => { (e.currentTarget.style.background = 'color-mix(in srgb, var(--brand-primary) 10%, var(--bg-elev-2))'); }}
                      onMouseLeave={(e) => {
                        if (!isMenuOpen) (e.currentTarget.style.background = 'transparent');
                      }}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                    {isMenuOpen ? (
                      <div
                        role="menu"
                        onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                        style={{
                          position: 'absolute',
                          top: '2.3rem',
                          right: '0.35rem',
                          minWidth: '13rem',
                          zIndex: 10,
                          padding: '0.35rem',
                          borderRadius: '0.9rem',
                          border: '1px solid var(--border)',
                          background: 'var(--bg-elev-2)',
                          color: 'var(--text)',
                          boxShadow: '0 18px 44px rgba(0,0,0,0.28)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.1rem',
                        }}
                      >
                        <button
                          type="button"
                          role="menuitem"
                          onClick={async (e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            try {
                              const token = await getValidBearerToken();
                              if (!token) { setToast({ kind: 'err', text: 'Sesión expirada. Inicia sesión de nuevo.' }); return; }
                              const ok = await updateConversation(token, c.id, { pinned: !c.pinned });
                              if (!ok) { setToast({ kind: 'err', text: c.pinned ? 'No pude desfijar el chat.' : 'No pude fijar el chat.' }); return; }
                              setHistoryMenuOpenId(null);
                              setToast({ kind: 'ok', text: c.pinned ? 'Chat desfijado.' : 'Chat fijado. Ahora aparece primero.' });
                              void refreshHistoryList();
                            } catch {
                              setToast({ kind: 'err', text: c.pinned ? 'No pude desfijar el chat.' : 'No pude fijar el chat.' });
                            }
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.55rem',
                            padding: '0.55rem 0.7rem',
                            borderRadius: '0.7rem',
                            border: '0',
                            background: 'transparent',
                            color: 'var(--text)',
                            cursor: 'pointer',
                            fontSize: '0.82rem',
                            fontWeight: 600,
                            textAlign: 'left',
                          }}
                        >
                          {c.pinned ? (
                            <>
                              <PinOff className="h-4 w-4" style={{ color: 'var(--brand-primary)' }} />
                              <span>Desfijar chat</span>
                            </>
                          ) : (
                            <>
                              <Pin className="h-4 w-4" style={{ color: 'var(--brand-primary)' }} />
                              <span>Fijar chat</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={async (e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            try {
                              const newName = window.prompt('Cambiar nombre del chat', c.title || 'Nuevo chat');
                              if (newName === null) { setHistoryMenuOpenId(null); return; }
                              const trimmed = String(newName || '').trim().slice(0, 200);
                              if (!trimmed) { setToast({ kind: 'err', text: 'El nombre no puede quedar vacío.' }); return; }
                              const token = await getValidBearerToken();
                              if (!token) { setToast({ kind: 'err', text: 'Sesión expirada. Inicia sesión de nuevo.' }); return; }
                              const ok = await updateConversation(token, c.id, { title: trimmed });
                              if (!ok) { setToast({ kind: 'err', text: 'No pude cambiar el nombre.' }); return; }
                              setHistoryMenuOpenId(null);
                              setToast({ kind: 'ok', text: 'Nombre actualizado.' });
                              void refreshHistoryList();
                            } catch {
                              setToast({ kind: 'err', text: 'No pude cambiar el nombre.' });
                            }
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.55rem',
                            padding: '0.55rem 0.7rem',
                            borderRadius: '0.7rem',
                            border: '0',
                            background: 'transparent',
                            color: 'var(--text)',
                            cursor: 'pointer',
                            fontSize: '0.82rem',
                            fontWeight: 600,
                            textAlign: 'left',
                          }}
                        >
                          <Pencil className="h-4 w-4" style={{ color: 'var(--brand-primary)' }} />
                          <span>Cambiar nombre</span>
                        </button>
                        {c.pinned ? null : (
                          <>
                            <div style={{ height: '1px', background: 'var(--border)', margin: '0.18rem 0.25rem' }} aria-hidden="true" />
                            <button
                              type="button"
                              role="menuitem"
                              onClick={async (e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                try {
                                  const confirm = window.confirm('¿Eliminar esta conversación? Podrás recuperarla solicitando ayuda.');
                                  if (!confirm) { setHistoryMenuOpenId(null); return; }
                                  const token = await getValidBearerToken();
                                  if (!token) { setToast({ kind: 'err', text: 'Sesión expirada. Inicia sesión de nuevo.' }); return; }
                                  const wasActive = c.id === uiState.activeConversationId;
                                  const ok = await deleteConversationById(token, c.id);
                                  if (!ok) { setToast({ kind: 'err', text: 'No pude eliminar la conversación.' }); return; }
                                  setHistoryMenuOpenId(null);
                                  setToast({ kind: 'ok', text: 'Conversación eliminada. (Se puede recuperar pidiendo ayuda).' });
                                  if (wasActive) {
                                    if (attachedImg) {
                                      try { URL.revokeObjectURL(attachedImg.previewUrl); } catch {}
                                      setAttachedImg(null);
                                    }
                                    if (setInputAndDraftRef.current) setInputAndDraftRef.current('', true);
                                    else { setInput(''); clearStoredDraft(currentUserId, uiState.activeConversationId || conversationId || null); }
                                    await startNewChat({ persistOldAsArchived: false });
                                  } else {
                                    void refreshHistoryList();
                                  }
                                } catch {
                                  setToast({ kind: 'err', text: 'No pude eliminar la conversación.' });
                                }
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.55rem',
                                padding: '0.55rem 0.7rem',
                                borderRadius: '0.7rem',
                                border: '0',
                                background: 'transparent',
                                color: 'color-mix(in srgb, #ef4444 82%, var(--text))',
                                cursor: 'pointer',
                                fontSize: '0.82rem',
                                fontWeight: 700,
                                textAlign: 'left',
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                              <span>Eliminar chat</span>
                            </button>
                          </>
                        )}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      {toast && (
        <div
          style={{
            position: 'fixed',
            left: '50%',
            transform: 'translateX(-50%)',
            bottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))',
            width: 'min(92vw, 520px)',
            zIndex: 80,
            padding: '0.7rem 1rem',
            borderRadius: '1rem',
            fontWeight: 700,
            fontSize: '0.85rem',
            pointerEvents: 'none',
            boxShadow: '0 10px 40px rgba(0,0,0,0.35)',
            backdropFilter: 'blur(10px)',
            color: toast.kind === 'ok' ? (isDark ? '#d1fae5' : '#064e3b') : (isDark ? '#fecdd3' : '#881337'),
            background:
              toast.kind === 'ok'
                ? (isDark ? 'rgba(16,185,129,.18)' : 'rgba(16,185,129,.13)')
                : (isDark ? 'rgba(244,63,94,.18)' : 'rgba(244,63,94,.13)'),
            border:
              toast.kind === 'ok'
                ? '1px solid color-mix(in srgb, #10b981 30%, transparent)'
                : '1px solid color-mix(in srgb, #f43f5e 30%, transparent)',
          }}
        >
          <div className="flex items-center gap-2">
            {toast.kind === 'ok' ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <AlertTriangle className="h-5 w-5" />
            )}
            <span style={{ wordBreak: 'break-word', lineHeight: 1.35 }}>{toast.text}</span>
          </div>
        </div>
      )}
      {/* ====== Modal: Grabador de micrófono (Quiero cantarlo) ====== */}
      {micRecorderOpen && (
        <div className="luciana-recorder-modal" role="dialog" aria-modal="true" aria-label="Grabar con micrófono">
          <div className="luciana-recorder-modal__card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>
                <Mic className="h-5 w-5" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 8 }} />
                Quiero cantarlo
              </h3>
              <button
                type="button"
                onClick={() => {
                  setMicRecorderError('');
                  if (micRecorderState === 'idle') {
                    setMicRecorderOpen(false);
                  } else {
                    setMicRecorderState('stopping');
                    micRecorderStateRef.current = 'stopping';
                    stopMicRecorderRef.current?.(false).catch(() => {});
                    window.setTimeout(() => setMicRecorderOpen(false), 400);
                  }
                }}
                className="luciana-icon-button"
                aria-label="Cerrar grabador"
                style={{ color: 'var(--text-muted)' }}
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.45 }}>
              Canta o habla al micrófono. Cuando termines, la grabación se adjuntará automáticamente al chat.
              Puedes adjuntarla junto con tu mensaje.
            </p>

            <div className="luciana-recorder-modal__time">
              <strong style={{ fontSize: 36, fontVariantNumeric: 'tabular-nums' }}>
                {String(Math.floor(micRecorderElapsedMs / 60000)).padStart(2, '0')}:
                {String(Math.floor((micRecorderElapsedMs % 60000) / 1000)).padStart(2, '0')}
              </strong>
              <small style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                {micRecorderState === 'recording' ? 'Grabando… habla cerca del micrófono' : micRecorderState === 'stopping' ? 'Guardando…' : 'Listo para empezar'}
              </small>
            </div>

            <div className="luciana-recorder-modal__bars" aria-hidden="true">
              {micRecorderBars.length === 0 ? (
                Array.from({ length: 48 }).map((_, i) => (
                  <span key={i} style={{ width: 4, height: 8, borderRadius: 4, background: 'var(--border)' }} />
                ))
              ) : (
                micRecorderBars.map((h, i) => (
                  <span
                    key={i}
                    style={{
                      width: 4,
                      height: Math.max(6, h),
                      borderRadius: 4,
                      background:
                        micRecorderState === 'recording'
                          ? 'linear-gradient(180deg, #22c55e 0%, #16a34a 100%)'
                          : 'var(--border)',
                    }}
                  />
                ))
              )}
            </div>

            {micRecorderError ? (
              <div style={{ marginTop: 12, padding: 10, borderRadius: 10, border: '1px solid #fb718555', color: '#fecdd3', background: '#7f1d1d33', fontSize: 12 }}>
                {micRecorderError}
              </div>
            ) : null}

            <div className="luciana-recorder-modal__actions">
              <button
                type="button"
                onClick={() => {
                  setMicRecorderError('');
                  if (micRecorderState === 'idle') {
                    setMicRecorderOpen(false);
                  } else {
                    setMicRecorderState('stopping');
                    micRecorderStateRef.current = 'stopping';
                    stopMicRecorderRef.current?.(false).catch(() => {});
                    window.setTimeout(() => setMicRecorderOpen(false), 400);
                  }
                }}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 999,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-elev-1)',
                  color: 'var(--text)',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>

              {micRecorderState === 'idle' ? (
                <button
                  type="button"
                  onClick={() => startMicRecorder().catch(() => {})}
                  style={{
                    flex: 2,
                    height: 44,
                    borderRadius: 999,
                    border: 'none',
                    background: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
                    color: '#fff',
                    fontWeight: 800,
                    fontSize: 15,
                    boxShadow: '0 10px 30px rgba(236,72,153,0.45)',
                    cursor: 'pointer',
                  }}
                >
                  🎤 Comenzar a grabar
                </button>
              ) : (
                <button
                  type="button"
                  disabled={micRecorderState === 'stopping'}
                  onClick={() => {
                    if (micRecorderState !== 'recording') return;
                    setMicRecorderState('stopping');
                    micRecorderStateRef.current = 'stopping';
                    stopMicRecorderRef.current?.(true).catch(() => {});
                  }}
                  style={{
                    flex: 2,
                    height: 44,
                    borderRadius: 999,
                    border: 'none',
                    background: micRecorderState === 'stopping' ? '#9ca3af' : 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                    color: '#fff',
                    fontWeight: 800,
                    fontSize: 15,
                    boxShadow: micRecorderState === 'stopping' ? 'none' : '0 10px 30px rgba(34,197,94,0.45)',
                    cursor: micRecorderState === 'stopping' ? 'progress' : 'pointer',
                  }}
                >
                  {micRecorderState === 'stopping' ? 'Guardando…' : '✔ Detener y adjuntar'}
                </button>
              )}
            </div>

            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <button
                type="button"
                onClick={openMp3ConverterUrl}
                style={{
                  padding: '6px 10px',
                  borderRadius: 999,
                  border: '1px dashed var(--border)',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                🎧 Convertir a MP3 después si hace falta
              </button>
              <small style={{ color: 'var(--text-muted)', fontSize: 11 }}>El audio adjunto se envía al backend de LucIAna.</small>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
