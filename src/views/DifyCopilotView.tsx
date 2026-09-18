import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  History,
  Image as ImageIcon,
  Library,
  Loader2,
  MessageSquarePlus,
  Mic,
  Music2,
  Paperclip,
  Plus,
  Send,
  Sparkles,
  Sun,
  Moon,
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
  structured?: null | {
    action: 'ready_to_generate';
    prompt: string;
    style: string;
    title: string;
    instrumental: boolean;
  };
  persisted?: boolean;
};

type ReadyToGenerate = {
  prompt: string;
  style: string;
  title: string;
  instrumental: boolean;
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
  internal_dify_conversation_id?: string | null;
};

function uid() {
  if (typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function') {
    return (crypto as any).randomUUID();
  }
  return 'm_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function escapeHTML(s: string) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function simpleMarkdown(text: string, dark: boolean): string {
  const raw = String(text || '');
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

const CHAT_AVATAR_ASSISTANT = '/logo-luciana-hd.svg?v=20260917-3';
const OFFICIAL_BRAND_LOGO = '/assets/luciana-music-logo.jpeg';
const STORAGE_KEY = 'luciana_chat_ui_v1';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB (imágenes)
const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MB (audios propios MP3/WAV/etc)
const MAX_GENERIC_BYTES = 20 * 1024 * 1024; // 20 MB (otros archivos)
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const ALLOWED_AUDIO_TYPES = new Set([
  'audio/mpeg', 'audio/mp3', 'audio/x-mp3', 'audio/mpeg3', 'audio/x-mpeg3',
]);
const isFileNameMp3 = (name: string) => /\.mp3$/i.test(String(name || '').trim());
const openMp3ConverterUrl = () => {
  try { window.open('https://cloudconvert.com/mp3-converter', '_blank', 'noopener,noreferrer'); } catch {}
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

export function DifyCopilotView({ onChange }: { onChange: (t: ViewTab) => void }) {
  // Tema LOCAL del chat (NO afecta al resto del sitio)
  const [chatTheme, setChatTheme] = useState<'dark' | 'light'>(() => {
    try {
      const saved = String(window.localStorage.getItem('luciana_chat_theme_v1') || '').toLowerCase().trim();
      if (saved === 'light' || saved === 'dark') return saved;
    } catch { /* ignore */ }
    // Por defecto: chat en oscuro (colores brand)
    return 'dark';
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
        'Hola, soy LucIAna Bot. Cuéntame de qué quieres hacer la canción: estilo, tema, título, estado de ánimo, público o cualquier detalle. Juntos definimos letra, estilo, título y si es instrumental. Cuando esté todo listo te mostraré el botón **"Generar canción"** y se cobrarán 12 créditos.',
      createdAt: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string>('');
  const [activeReady, setActiveReady] = useState<ReadyToGenerate | null>(null);
  const [generating, setGenerating] = useState(false);
  const [lastPending, setLastPending] = useState<PendingGeneration | null>(null);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [bootFailed, setBootFailed] = useState(false);
  const [attachedImg, setAttachedImg] = useState<AttachedImage | null>(null);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [pendingAttachKind, setPendingAttachKind] = useState<AttachMenuKind | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const attachMenuRef = useRef<HTMLDivElement | null>(null);

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
      setToast({ kind: 'err', text: 'Tu navegador no permite grabar audio aquí. Usa la opción Subir audio MP3.' });
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
    patch: { title?: string; internal_dify_conversation_id?: string; summary_snapshot?: any; archived?: boolean }
  ): Promise<boolean> => {
    if (!convId) return false;
    const r = await apiRequest<{ success?: boolean }>(`/api/chat/${encodeURIComponent(convId)}`, 'PATCH', token, patch);
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
        ? {
            action: 'ready_to_generate',
            prompt: String(structuredRaw.prompt || '').trim(),
            style: String(structuredRaw.style || '').trim(),
            title: String(structuredRaw.title || '').trim(),
            instrumental: Boolean(structuredRaw.instrumental),
          }
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
    return (r.json.conversations as ConversationSummary[]).map((c: any) => ({
      id: c.id,
      title: String(c.title || 'Nuevo chat'),
      created_at: c.created_at,
      updated_at: c.updated_at,
      archived_at: c.archived_at || null,
      internal_dify_conversation_id: c.internal_dify_conversation_id || null,
    }));
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
              setMessages(loaded.messages);
              const lastReadyMsg = [...loaded.messages].reverse().find((m) => m.structured?.action === 'ready_to_generate');
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
        setMessages(loaded.messages);
        const lastReadyMsg = [...loaded.messages].reverse().find((m) => m.structured?.action === 'ready_to_generate');
        if (lastReadyMsg && lastReadyMsg.structured) setActiveReady({ ...lastReadyMsg.structured });
      } else {
        setMessages([
          {
            id: uid(),
            role: 'assistant',
            text:
              'Hola, soy LucIAna Bot. Cuéntame de qué quieres hacer la canción: estilo, tema, título, estado de ánimo, público o cualquier detalle. Juntos definimos letra, estilo, título y si es instrumental. Cuando esté todo listo te mostraré el botón **"Generar canción"** y se cobrarán 12 créditos.',
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
  }, [getValidBearerToken, loadConversationById, scrollToBottomNow, setUi]);

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
            'Empezamos con un chat nuevo ✨. Cuéntame de qué quieres hacer la canción: estilo, tema, título, público, estado de ánimo o cualquier detalle que se te ocurra.',
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
      const ok = window.confirm('¿Quieres iniciar un nuevo chat? Tu conversación anterior se conservará en el historial.');
      if (!ok) return;
      if (attachedImg) {
        try { URL.revokeObjectURL(attachedImg.previewUrl); } catch {}
        setAttachedImg(null);
      }
      await startNewChat({ persistOldAsArchived: true });
    } catch { /* ignore */ }
  }, [startNewChat, attachedImg]);

  const handleAttachPick = useCallback(() => {
    if (loading || generating) return;
    setAttachMenuOpen((o) => !o);
  }, [loading, generating]);

  const triggerFilePickForKind = useCallback((kind: AttachMenuKind) => {
    if (kind === 'mic') {
      startMicRecorder().catch(() => {});
      return;
    }
    if (kind === 'drive') {
      // No hay integración Google Drive configurada aún. Avisa honestamente y orienta a subir archivo MP3.
      setToast({ kind: 'ok', text: '☁️ Drive: usa la opción Subir audio MP3 y selecciona tu archivo. Si tu audio está en Drive, descárgalo primero a tu teléfono/PC.' });
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
    setTimeout(() => inp.click(), 50);
  }, []);

  // Cerrar menú de adjuntar al hacer click fuera
  useEffect(() => {
    if (!attachMenuOpen) return;
    const onDocClick = (ev: any) => {
      const t = ev?.target as HTMLElement | null;
      if (!t) return;
      if (attachMenuRef.current && attachMenuRef.current.contains(t)) return;
      // click en el botón de clip lo maneja el propio onClick
      if (t.closest('.luciana-attach-btn')) return;
      setAttachMenuOpen(false);
    };
    const onEsc = (ev: any) => { if (ev?.key === 'Escape') setAttachMenuOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('touchstart', onDocClick as any);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('touchstart', onDocClick as any);
      document.removeEventListener('keydown', onEsc);
    };
  }, [attachMenuOpen]);

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
      errTypeText = 'Sólo se admiten archivos MP3. Convierte tu archivo antes de subirlo.';
      finalKind = 'audio';
      const mimeOk = ALLOWED_AUDIO_TYPES.has(mime);
      const nameOk = isFileNameMp3(f.name);
      if (!mimeOk && !nameOk) {
        setToast({ kind: 'err', text: errTypeText, actionLabel: 'Convertir a MP3', onAction: openMp3ConverterUrl });
        try { if (fileInputRef.current) fileInputRef.current.value = ''; } catch {}
        setPendingAttachKind(null);
        return;
      }
    } else {
      // kind generic: imágenes, audios, textos, PDF, Word
      if (!mime.startsWith('audio/') && !mime.startsWith('image/') && !mime.startsWith('text/') &&
          mime !== 'application/pdf' && mime !== 'application/json' &&
          !mime.includes('officedocument') && !f.name.toLowerCase().match(/\.(doc|docx|txt|md|rtf|pdf)$/)) {
        setToast({ kind: 'err', text: 'Tipo de archivo no admitido. Puedes subir imágenes, audios (MP3/WAV), textos, PDF o Word.' });
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
    if (finalKind === 'image') {
      try { previewUrl = URL.createObjectURL(f); } catch {}
    } else {
      // audio/generic: sin preview por ahora; usamos icono visualmente
      previewUrl = '';
    }
    setAttachedImg({ file: f, name: String(f.name || 'archivo').slice(0, 160), bytes: Number(f.size || 0), previewUrl, kind: finalKind });
    try { if (fileInputRef.current) fileInputRef.current.value = ''; } catch {}
    setPendingAttachKind(null);
  }, [attachedImg, pendingAttachKind]);

  const handleAttachRemove = useCallback(() => {
    if (!attachedImg) return;
    try { URL.revokeObjectURL(attachedImg.previewUrl); } catch {}
    setAttachedImg(null);
  }, [attachedImg]);

  useEffect(() => () => {
    // cleanup preview URL al desmontar
    if (attachedImg) { try { URL.revokeObjectURL(attachedImg.previewUrl); } catch {} }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendMessage = useCallback(async () => {
    const text = String(input || '').trim();
    if (!text) return;
    if (!supabaseBrowser) {
      setToast({ kind: 'err', text: 'No se pudo conectar con LucIAna. Cierra y abre la app de nuevo.' });
      return;
    }
    setLoading(true);
    sentScrollRef.current = true;
    try {
      if (attachedImg) {
        const what =
          attachedImg.kind === 'image'
            ? 'la extracción automática de letra de foto'
            : attachedImg.kind === 'audio'
            ? 'la transcripción automática de audio'
            : 'la lectura automática de texto del archivo';
        setToast({
          kind: 'ok',
          text: `📎 ${what.charAt(0).toUpperCase()}${what.slice(1)} · próxima funcionalidad. Tu texto se enviará pero el archivo aún no se procesa. Cuando esté activo, ${what} para ayudarte.`,
        });
        handleAttachRemove();
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
      };
      setMessages((m) => [...m, userMsg]);
      setInput('');
      if (textareaRef.current) textareaRef.current.value = '';

      // Asegurar conversación activa en Supabase
      let activeConvId = uiState.activeConversationId;
      let activeDifyId = conversationId;
      if (!activeConvId) {
        const created = await createSupabaseConversation(accessToken, { title: text.slice(0, 60) || 'Nuevo chat' });
        if (created) {
          activeConvId = created.id;
          activeDifyId = String(created.internal_dify_conversation_id || '').trim();
          setUi((p) => ({ ...p, activeConversationId: activeConvId!, conversations: created ? [created, ...p.conversations] : p.conversations }));
        }
      }
      // Guardar mensaje usuario en Supabase (async pero no bloqueante)
      if (activeConvId) {
        void (async () => {
          try { await appendMessageToConversation(accessToken, activeConvId!, { role: 'user', content: text }); }
          catch (e) { console.warn('[chat] save user msg failed', e instanceof Error ? e.message : e); }
        })();
      }

      const bodyPayload: any = { message: text };
      if (activeDifyId) bodyPayload.conversation_id = activeDifyId;

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

      const replyText = String(
        (json && typeof (json as any).reply_text === 'string')
          ? (json as any).reply_text
          : (json && typeof (json as any).message === 'string')
          ? (json as any).message
          : 'No pude leer la respuesta de LucIAna Bot.'
      ).trim();

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
        const stOk: ReadyToGenerate = {
          prompt: String(rawStructured.prompt || '').trim(),
          style: String(rawStructured.style || '').trim(),
          title: String(rawStructured.title || '').trim(),
          instrumental: Boolean(rawStructured.instrumental),
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
              : 'Hubo un problema al contactar con LucIAna Bot. Inténtalo de nuevo en 30 segundos.');
        setLoading(false);
        const mappedCode = (() => {
          if (isAuth) return 'sesión expirada, vuelve a iniciar sesión';
          const c = String(errCode || '').trim();
          if (c === 'dify_copilot_not_configured') return 'asistente no configurado';
          if (c === 'network_error') return 'error de conexión';
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
      const payload = {
        prompt: String(activeReady.prompt || '').trim().slice(0, 12000),
        style: String(activeReady.style || '').trim().slice(0, 600),
        title: String(activeReady.title || '').trim().slice(0, 220),
        instrumental: Boolean(activeReady.instrumental),
        model: 'V6',
      };
      const r = await fetch('/api/gpt/generate', {
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
      const taskId = String((json as any)?.task_id || (json as any)?.taskId || '').trim() || undefined;
      const statusRaw = String((json as any)?.status || (taskId ? 'queued' : 'unknown')).trim();
      setLastPending({ task_id: taskId, status: statusRaw, startedAt: Date.now() });
      const titleOk = payload.title || 'Canción sin título';
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
      // Persistir el mensaje OK de confirmación en Supabase
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
  const showNewChatSuggestion = useMemo(() => {
    const key1 = totalTurns >= 27 ? `turns_${Math.floor(totalTurns / 6)}` : null;
    return key1 && uiState.lastDismissedSuggestionKey !== key1 ? key1 : null;
  }, [totalTurns, uiState.lastDismissedSuggestionKey]);

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

        {showNewChatSuggestion && (
          <div className="luciana-newchat-hint">
            <span>
              💡 Ya lleváis unas {totalTurns} intervenciones. Si vas a empezar una idea distinta, te recomiendo crear un chat nuevo.
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

        {showAfterGenerateHint && (
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

        {messages.map((m) => {
          const isUser = m.role === 'user';
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
                <div className="luciana-msg-bubble">
                  <div
                    className="prose-luciana"
                    dangerouslySetInnerHTML={{ __html: simpleMarkdown(m.text, isDark) }}
                  />
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
                </div>
              </div>
            </div>
          );
        })}

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

        {activeReady && (
          <div style={{
            maxWidth: '48rem',
            margin: '1.3rem auto 0.5rem',
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

              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--brand-primary)' }}>
                  Estilo musical
                </span>
                <input
                  type="text"
                  value={activeReady.style}
                  onChange={(e) => setActiveReady({ ...activeReady, style: e.target.value })}
                  placeholder="Ej: Pop español, guitarra acústica, voz femenina suave"
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

              <label
                className="md:col-span-2 inline-flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3"
                style={{ borderColor: 'var(--border)', background: 'var(--bg-elev-1)' }}
              >
                <input
                  type="checkbox"
                  checked={activeReady.instrumental}
                  onChange={(e) => setActiveReady({ ...activeReady, instrumental: e.target.checked })}
                  style={{ height: '1.25rem', width: '1.25rem', accentColor: 'var(--brand-primary)' }}
                />
                <div className="min-w-0">
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text)' }}>
                    ¿Es una canción instrumental?
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Si marcas esta opción se generará sin letra cantada (solo música).
                  </div>
                </div>
              </label>
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
        )}
      </div>

      <div className="luciana-chat-composer">
        {attachedImg && (
          <div className="luciana-attach-preview" role="group" aria-label="Archivo adjunto">
            {attachedImg.kind === 'image' && attachedImg.previewUrl ? (
              <img src={attachedImg.previewUrl} alt={attachedImg.name} loading="lazy" />
            ) : attachedImg.kind === 'audio' ? (
              <div className="luciana-attach-preview__icon" aria-hidden="true"><Music2 className="h-7 w-7" /></div>
            ) : (
              <div className="luciana-attach-preview__icon" aria-hidden="true"><Library className="h-7 w-7" /></div>
            )}
            <div className="luciana-attach-preview__info">
              <span className="luciana-attach-preview__name">{attachedImg.name}</span>
              <span className="luciana-attach-preview__meta">
                {(attachedImg.bytes / 1024).toFixed(attachedImg.bytes > 1024 * 100 ? 0 : 1)} KB · {attachedImg.file.type || (attachedImg.kind === 'image' ? 'imagen' : attachedImg.kind === 'audio' ? 'audio' : 'archivo')}
              </span>
              {attachedImg.kind === 'image' ? (
                <span className="badge-soon" style={{ opacity: 0.9 }}>📸 Imagen adjunta · se procesará al enviar</span>
              ) : attachedImg.kind === 'audio' ? (
                <span className="badge-soon" style={{ opacity: 0.9 }}>🎙️ Audio adjunto · máximo 25 MB</span>
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
        <div className="luciana-composer-inner">
          <div className="relative">
            <button
              type="button"
              className="luciana-attach-btn"
              onClick={handleAttachPick}
              disabled={loading || generating}
              aria-label="Adjuntar (imagen, audio MP3 o grabar con micrófono)"
              aria-expanded={attachMenuOpen}
              title="Adjuntar · imagen / audio MP3 / grabar con micrófono"
            >
              <Paperclip className="h-4.5 w-4.5" />
            </button>
            {attachMenuOpen && (
              <div className="luciana-attach-menu" ref={attachMenuRef} role="menu" aria-label="Opciones de adjuntar">
                <button type="button" className="luciana-attach-menu__item" onClick={() => triggerFilePickForKind('image')} role="menuitem">
                  <span className="luciana-attach-menu__icon"><ImageIcon className="h-5 w-5" /></span>
                  <span className="luciana-attach-menu__label">
                    <strong>Subir imagen</strong>
                    <small>Foto de tu letra · JPG, PNG o WEBP</small>
                  </span>
                </button>
                <button type="button" className="luciana-attach-menu__item" onClick={() => triggerFilePickForKind('audio')} role="menuitem">
                  <span className="luciana-attach-menu__icon"><Music2 className="h-5 w-5" /></span>
                  <span className="luciana-attach-menu__label">
                    <strong>Subir audio</strong>
                    <small>Sólo archivos MP3 · máximo 25 MB</small>
                  </span>
                </button>
                <button type="button" className="luciana-attach-menu__item" onClick={() => triggerFilePickForKind('mic')} role="menuitem">
                  <span className="luciana-attach-menu__icon"><Mic className="h-5 w-5" /></span>
                  <span className="luciana-attach-menu__label">
                    <strong>Quiero cantarlo</strong>
                    <small>Grabar con micrófono · igual que en Crear</small>
                  </span>
                </button>
              </div>
            )}
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
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
              onKeyDown={onInputKeyDown}
              rows={1}
              placeholder=""
              disabled={loading || generating}
            />
            <div className="luciana-composer-counter">
              {String(input || '').length} / 20,000
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
        onClick={() => setHistoryOpen(false)}
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
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => void openConversation(c)}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '0.6rem 0.75rem',
                        borderRadius: '0.85rem',
                        border: `1px solid ${isActive ? 'color-mix(in srgb, var(--brand-primary) 45%, var(--border))' : 'transparent'}`,
                        background: isActive
                          ? 'color-mix(in srgb, var(--brand-primary) 14%, var(--bg-elev-1))'
                          : 'var(--bg-elev-1)',
                        color: 'var(--text)',
                        cursor: 'pointer',
                      }}
                    >
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
                        }}>
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
                    </button>
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
