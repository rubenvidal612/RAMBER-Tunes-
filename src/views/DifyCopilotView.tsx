import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Cloud,
  Eye,
  EyeOff,
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
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Sun,
  Moon,
  Trash2,
  User,
  Volume2,
  WalletCards,
  X,
} from 'lucide-react';
import { getAccessToken, supabaseBrowser } from '@/lib/supabaseBrowser';
import { formatLyricsForEditing } from '@/lib/lyricsFormatting.js';
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
  function toggleChatTheme() {
    setChatTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try { window.localStorage.setItem('luciana_chat_theme_v1', next); } catch { /* ignore */ }
      return next;
    });
  }
  // Efecto: actualiza data-chat-theme en el shell DOM por si CSS lo lee, y forzar re-render
  useEffect(() => {
    try {
      const el = document.querySelector('.luciana-chat-shell') as HTMLElement | null;
      if (el) el.setAttribute('data-chat-theme', chatTheme);
    } catch { /* ignore */ }
  }, [chatTheme]);
  const isDark = chatTheme !== 'light';
  // useTheme legacy NO se usa (el tema del chat es local)
  const _legacyTheme = useTheme();

  const [uiState, setUiState] = useState<UiState>(() => loadUiState());
  function setUi(updater: (prev: UiState) => UiState) {
    setUiState((prev) => {
      const next = updater(prev);
      saveUiState(next);
      return next;
    });
  }

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: uid(),
      role: 'assistant',
      text:
        '¡Hola! 🎶 Cuéntame qué canción quieres crear.',
      createdAt: Date.now(),
      _seq: 0 as any,
    },
  ]);
  const insertSeqRef = useRef<number>(1);

  function nextInsertSeq(): number {
    try {
      const n = insertSeqRef.current;
      insertSeqRef.current = (Number.isFinite(n) ? n : 0) + 1;
      return n;
    } catch {
      return Date.now();
    }
  }

  function assignSeqToMessage<T extends object>(m: T): T & { _seq: number } {
    const out: any = { ...m };
    if (typeof out._seq !== 'number' || !Number.isFinite(out._seq)) {
      out._seq = nextInsertSeq();
    }
    return out;
  }

  function rebaseSeqFromList(list: ChatMessage[]): void {
    try {
      let maxSeq = -1;
      for (const m of list) {
        const s = typeof (m as any)?._seq === 'number' ? (m as any)._seq : -1;
        if (s > maxSeq) maxSeq = s;
      }
      insertSeqRef.current = Math.max(0, maxSeq + 1);
    } catch {}
  }

  function sortMessagesAscStable(list: ChatMessage[]): ChatMessage[] {
    if (!Array.isArray(list) || list.length === 0) return [];
    try {
      return [...list].sort((a, b) => {
        const at = typeof (a as any)?.createdAt === 'number' ? (a as any).createdAt : 0;
        const bt = typeof (b as any)?.createdAt === 'number' ? (b as any).createdAt : 0;
        if (at !== bt) return at - bt;
        const as = typeof (a as any)?._seq === 'number' ? (a as any)._seq : 0;
        const bs = typeof (b as any)?._seq === 'number' ? (b as any)._seq : 0;
        return as - bs;
      });
    } catch {
      return list;
    }
  }

  const orderedMessages = useMemo<ChatMessage[]>(() => {
    try {
      let needsSeq = false;
      for (const m of messages) {
        if (typeof (m as any)?._seq !== 'number') { needsSeq = true; break; }
      }
      if (needsSeq) {
        const normalized = messages.map((m) => assignSeqToMessage(m));
        return sortMessagesAscStable(normalized);
      }
      return sortMessagesAscStable(messages);
    } catch {
      return messages;
    }
  }, [messages]);

  function updateMessageById(msgId: string, patch: Partial<ChatMessage>): void {
    if (!msgId) return;
    try {
      setMessages((prev) => {
        let changed = false;
        const next = prev.map((m) => {
          if (m.id !== msgId) return m;
          const merged: any = { ...m, ...(patch || {}) };
          changed = true;
          return merged as ChatMessage;
        });
        return changed ? next : prev;
      });
    } catch {}
  }

  function sanitizeStyleValue(raw: string): string {
    try {
      let s = String(raw || '').replace(/\r\n/g, '\n').trim();
      if (!s) return '';
      s = s.replace(/^\s*[\?\.\!\,\;\:\-_\*\#]+[\s\.]+/g, '');
      s = s.replace(/\s{2,}/g, ' ');
      let safety = 8;
      while (safety-- > 0 && s.length > 0 && /^[\?\.\!\,\;\:\-_\*\#\s]+/.test(s)) {
        s = s.replace(/^[\?\.\!\,\;\:\-_\*\#\s]+/, '');
      }
      safety = 8;
      while (safety-- > 0 && s.length > 0 && /[\?\.\!\,\;\:\-_\*\#\s]+$/.test(s)) {
        s = s.replace(/[\?\.\!\,\;\:\-_\*\#\s]+$/, '');
      }
      return s.slice(0, 400);
    } catch {
      return String(raw || '').trim().slice(0, 400);
    }
  }

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
  const [coverDraft, setCoverDraft] = useState<null | { title: string; style: string; gender: 'Masculino' | 'Femenino'; instructions?: string }>(null);
  const [coverWizard, setCoverWizard] = useState<null | {
    phase: 'lyrics' | 'style' | 'mood' | 'direction' | 'title' | 'voice' | 'summary';
    lyrics: string;
    style: string;
    mood: string;
    direction: string;
    title: string;
    voice: 'Hombre' | 'Mujer' | '';
  }>(null);
  const [coverAudioMsgId, setCoverAudioMsgId] = useState<string | null>(null);
  const coverAudioRef = useRef<{
    file?: File | null;
    previewUrl: string;
    name: string;
    bytes: number;
    mime?: string;
    r2Key?: string;
  } | null>(null);
  const coverSnapshotLockRef = useRef<number>(0);
  const lastSavedSnapshotRef = useRef<string>("");
  const [coverGenerating, setCoverGenerating] = useState(false);

  async function persistCoverSnapshot(pending?: {
    audioMeta?: { msg_id: string | null; r2_key: string | null; name: string | null; mime: string | null; bytes: number | null };
    wizard?: typeof coverWizard | null;
    draft?: typeof coverDraft | null;
  }) {
    try {
      const activeConvId = uiState.activeConversationId as string | null | undefined;
      if (!activeConvId) return;
      const tk = await getValidBearerToken();
      if (!tk) return;
      const audioIn = pending?.audioMeta;
      const wizIn = pending?.wizard === undefined ? coverWizard : pending?.wizard;
      const draftIn = pending?.draft === undefined ? coverDraft : pending?.draft;
      const audio = audioIn ? audioIn : (coverAudioRef.current ? {
        msg_id: coverAudioMsgId,
        r2_key: coverAudioRef.current.r2Key || null,
        name: coverAudioRef.current.name || null,
        mime: (coverAudioRef.current as any)?.mime || null,
        bytes: Number(coverAudioRef.current.bytes || 0) || null,
      } : null);
      const snapshot: any = { version: 1, saved_at: new Date().toISOString() };
      if (audio) snapshot.audio = audio;
      if (wizIn) snapshot.wizard = wizIn;
      if (draftIn) snapshot.draft = draftIn;
      const token = ++coverSnapshotLockRef.current;
      try {
        const convRes = await fetch(`/api/chat/${encodeURIComponent(activeConvId)}`, {
          method: 'GET',
          headers: { authorization: `Bearer ${tk}`, accept: 'application/json' },
        });
        if (token !== coverSnapshotLockRef.current) return;
        let base: any = {};
        if (convRes.ok) {
          try {
            const j = await convRes.json();
            if (j?.success && j?.conversation?.summary_snapshot && typeof j.conversation.summary_snapshot === 'object') {
              base = { ...j.conversation.summary_snapshot };
            }
          } catch {}
        }
        const toSend: any = { summary_snapshot: { ...base, cover_draft: snapshot } };
        const patchRes = await fetch(`/api/chat/${encodeURIComponent(activeConvId)}`, {
          method: 'PATCH',
          headers: { authorization: `Bearer ${tk}`, 'content-type': 'application/json; charset=utf-8', accept: 'application/json' },
          body: JSON.stringify(toSend),
        });
        try {
          lastSavedSnapshotRef.current = JSON.stringify(snapshot);
        } catch {}
        void patchRes;
      } catch {}
    } catch {}
  }

  // ================================================================
  // FEATURE FLAG TEMPORAL (2026-09-20)
  //   Desactiva la experiencia "Crear personaje / Clonar voz" dentro
  //   del chat LucIAna Bot mientras terminamos de estabilizarla en
  //   producción. No borra datos ni código; solo oculta acceso.
  //   Para volver a activarla: cambiar a true.
  // ================================================================
  const VOICE_FLOW_ENABLED_IN_BOT: boolean = false;
  const VOICE_FLOW_TEMP_DISABLED_MSG: string =
    "🎙️ Para clonar tu voz, abre el menú ☰ y entra a “Clonador de voz”.\n\nAhí sigue estos pasos:\n1. Pulsa “Crear personaje”.\n2. Confirma que tienes permiso para usar esa voz.\n3. Sube o graba una muestra de tu voz.\n4. Lee o canta la frase de verificación que aparezca.\n5. Ponle un nombre a tu personaje y espera a que quede listo.\n\nCrear tu personaje es gratis. Los créditos solo se usan cuando generas canciones o covers.\n\nEste proceso se realiza fuera del chat para cuidar tu privacidad y verificar tu voz correctamente.";

  type VoiceProfilePublic = {
    id: string;
    name: string | null;
    status: string;
    consent_given_at: string | null;
    consent_version: string | null;
    sample_ready: boolean;
    verify_ready: boolean;
    current_phrase: string | null;
    is_active: boolean;
    expires_at: string | null;
    cost_for_next_activation: number;
    active_activation_id: string | null;
  };
  type VoiceFlowState = {
    open: boolean;
    list: VoiceProfilePublic[];
    listLoading: boolean;
    selectedId: string | null;
    current: VoiceProfilePublic | null;
    step: 'intro' | 'consent' | 'sample' | 'phrase' | 'verify' | 'name' | 'cost' | 'creating' | 'ready' | 'expired' | 'hidden';
    uploadKind: 'sample' | 'verify' | null;
    uploading: boolean;
    uploadingProgress: number;
    nameInput: string;
    confirmPermanentText: string;
    busy: boolean;
    lastMessage: string;
    phraseLoading: boolean;
    phraseRequestedAt: number | null;
    phraseError: string;
    phraseErrorId: string | null;
  };
  const [voiceFlow, setVoiceFlow] = useState<VoiceFlowState>({
    open: false,
    list: [],
    listLoading: false,
    selectedId: null,
    current: null,
    step: 'intro',
    uploadKind: null,
    uploading: false,
    uploadingProgress: 0,
    nameInput: '',
    confirmPermanentText: '',
    busy: false,
    lastMessage: '',
    phraseLoading: false,
    phraseRequestedAt: null,
    phraseError: '',
    phraseErrorId: null,
  });
  function setVF(patch: Partial<VoiceFlowState> | ((prev: VoiceFlowState) => VoiceFlowState)): void {
    if (typeof patch === 'function') setVoiceFlow(patch);
    else setVoiceFlow((prev) => ({ ...prev, ...patch }));
  }
  const voiceFlowRef = useRef(voiceFlow);
  voiceFlowRef.current = voiceFlow;
  const voiceRefreshTimerRef = useRef<number | null>(null);

  // NOTA DE NEGOCIO (2026-09-19): Crear personaje y reactivar personaje es GRATIS.
  // Los créditos solo se descuentan al generar canciones o covers (costo interno).
  const VF_ACTIVATION_COST = 0;

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
  // NOTA: function declaration (hoisting) para evitar TDZ "Cannot access before init" en build minificado
  async function stopMicRecorder(finalize: boolean) {
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
            try { window.dispatchEvent(new CustomEvent('luciana:audio-attached', { detail: { file, kind: 'audio' } })); } catch {}
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
  // NOTA: function declaration (hoisting) para evitar TDZ "Cannot access before init" en build minificado
  async function startMicRecorder() {
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
            try { window.dispatchEvent(new CustomEvent('luciana:audio-attached', { detail: { file, kind: 'audio' } })); } catch {}
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

  function isUserNearBottom(threshold = 120): boolean {
    const el = listRef.current;
    if (!el) return true;
    const remaining = el.scrollHeight - (el.clientHeight + el.scrollTop);
    return remaining <= Math.max(0, threshold);
  }

  function scrollToBottomNow(force = false) {
    if (!listRef.current) return;
    if (!force && !isUserNearBottom()) return;
    try {
      listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: force ? 'smooth' : 'auto' });
    } catch {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }

  useEffect(() => {
    if (sentScrollRef.current) {
      sentScrollRef.current = false;
      scrollToBottomNow(true);
      return;
    }
    const t = setTimeout(() => scrollToBottomNow(false), 60);
    return () => clearTimeout(t);
  }, [messages, loading, activeReady, generating]);

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

  // Helper ref: setInput + sincronizar localStorage. Usado dentro de callbacks para evitar stale closures.
  function setInputAndDraft(newValue: string, clearStorage: boolean = false) {
    setInput(String(newValue || ''));
    const convId = uiState.activeConversationId || conversationId || activeConversationIdRef.current || null;
    if (clearStorage) {
      clearStoredDraft(currentUserId, convId);
    } else {
      writeStoredDraft(currentUserId, convId, String(newValue || ''));
    }
    requestAnimationFrame(() => autoresizeTextarea(textareaRef.current));
  }
  useEffect(() => { setInputAndDraftRef.current = setInputAndDraft; });

  const isEmptyState = useMemo(() => (
    orderedMessages.length <= 1 &&
    orderedMessages.every((m) =>
      m.role === 'assistant' && !(m.attachment) && !(m.structured?.action)
    )
  ), [orderedMessages]);

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

  function signOutAndReload() {
    try { void supabaseBrowser?.auth?.signOut?.().catch(() => {}); } catch {}
    try {
      const base = window.location.origin.toString().replace(/\/+$/, '');
      window.location.href = `${base}/crear`;
    } catch {}
  }

  async function getValidBearerToken(): Promise<string | null> {
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
  }

  async function apiRequest<T = any>(
    url: string,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    bearerToken: string,
    body?: any,
  ): Promise<{ ok: boolean; status: number; json: T | null }> {
    try {
      const headers: Record<string, string> = {
        accept: 'application/json',
        authorization: `Bearer ${String(bearerToken || '').trim()}`,
      };
      if (body !== undefined && body !== null) headers['content-type'] = 'application/json; charset=utf-8';
      const r = await fetch(url, {
        method,
        headers,
        body: (body !== undefined && body !== null) ? JSON.stringify(body) : undefined,
      });
      const raw = await r.text();
      let json: any = null;
      try { json = raw ? JSON.parse(raw) : null; } catch { json = { _raw: raw } as any; }
      return { ok: r.status >= 200 && r.status < 300, status: r.status, json: json as T | null };
    } catch (e) {
      const msg = e instanceof Error ? String(e.message) : String(e || '');
      return { ok: false, status: 0, json: { error: 'network_error', message: msg } as any };
    }
  }

  async function createSupabaseConversation(
    token: string,
    opts?: { title?: string; internal_dify_conversation_id?: string; summary_snapshot?: any }
  ): Promise<ConversationSummary | null> {
    const body: any = {};
    if (opts?.title) body.title = opts.title;
    if (opts?.internal_dify_conversation_id) body.internal_dify_conversation_id = opts.internal_dify_conversation_id;
    if (opts?.summary_snapshot) body.summary_snapshot = opts.summary_snapshot;
    const r = await apiRequest<{ success?: boolean; conversation?: any }>('/api/chat', 'POST', token, body);
    if (r.ok && r.json?.success && r.json.conversation) return r.json.conversation as ConversationSummary;
    return null;
  }

  async function appendMessageToConversation(
    token: string,
    convId: string,
    msg: { role: ChatRole; content: string; structured_action?: any; tokens?: number }
  ): Promise<boolean> {
    if (!convId) return false;
    const body: any = { role: msg.role, content: msg.content };
    if (msg.structured_action !== undefined && msg.structured_action !== null) body.structured_action = msg.structured_action;
    if (msg.tokens !== undefined && msg.tokens !== null) body.tokens = msg.tokens;
    const r = await apiRequest<{ success?: boolean }>(`/api/chat/${encodeURIComponent(convId)}/messages`, 'POST', token, body);
    return !!(r.ok && r.json?.success);
  }

  async function updateConversation(
    token: string,
    convId: string,
    patch: { title?: string; internal_dify_conversation_id?: string; summary_snapshot?: any; archived?: boolean; pinned?: boolean; deleted?: boolean }
  ): Promise<boolean> {
    if (!convId) return false;
    const r = await apiRequest<{ success?: boolean }>(`/api/chat/${encodeURIComponent(convId)}`, 'PATCH', token, patch);
    return !!(r.ok && r.json?.success);
  }

  async function deleteConversationById(token: string, convId: string): Promise<boolean> {
    if (!convId) return false;
    const r = await apiRequest<{ success?: boolean }>(`/api/chat/${encodeURIComponent(convId)}`, 'DELETE', token);
    return !!(r.ok && r.json?.success);
  }

  async function loadConversationById(
    token: string,
    convId: string
  ): Promise<{
    conversation: ConversationSummary | null;
    messages: ChatMessage[];
    ok: boolean;
    cover_audio_preview?: string;
    cover_draft_snapshot?: any;
  }> {
    const r = await apiRequest<{ success?: boolean; conversation?: any; messages?: any[]; cover_audio_preview?: string }>(
      `/api/chat/${encodeURIComponent(convId)}`,
      'GET',
      token
    );
    if (!r.ok || !r.json?.success) return { conversation: null, messages: [], ok: false };
    const coverAudioPreview = typeof r.json.cover_audio_preview === 'string' ? r.json.cover_audio_preview : '';
    const coverDraftSnapshot = (r.json?.conversation && typeof r.json.conversation === 'object' && (r.json.conversation as any).summary_snapshot && typeof (r.json.conversation as any).summary_snapshot === 'object')
      ? (r.json.conversation as any).summary_snapshot?.cover_draft || null
      : null;
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
      let attachment: ChatMessage['attachment'] = null;
      try {
        const sa = m.structured_action;
        if (sa && typeof sa === 'object' && (sa as any).action === 'audio_attachment') {
          const kind = String((sa as any).kind || 'audio').trim() || 'audio';
          const name = String((sa as any).name || '').trim();
          const bytes = Number((sa as any).bytes || 0) || 0;
          const preview = typeof (m as any).attachment_preview_url === 'string' ? (m as any).attachment_preview_url : '';
          if (preview || name) {
            attachment = {
              kind: (kind as any) === 'audio' ? 'audio' : 'audio',
              previewUrl: preview,
              name,
              bytes,
            };
          }
        }
      } catch {}
      const ts = m.created_at ? new Date(m.created_at).getTime() : Date.now();
      return {
        id: String(m.id || uid()),
        role,
        text: String(m.content || ''),
        createdAt: Number.isFinite(ts) ? ts : Date.now(),
        structured,
        attachment,
        persisted: true,
      };
    });
    return {
      conversation: (r.json.conversation as ConversationSummary) || null,
      messages: msgs,
      ok: true,
      cover_audio_preview: coverAudioPreview || undefined,
      cover_draft_snapshot: coverDraftSnapshot || undefined,
    };
  }

  async function fetchConversationList(token: string): Promise<ConversationSummary[]> {
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
  }

  async function refreshHistoryList() {
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
  }

  useEffect(() => {
    let alive = true;
    let authUnsub: any = null;

    async function runBoot() {
      try {
        const token = await getValidBearerToken();
        if (!token) {
          setBootFailed(true);
          return;
        }
        setBootFailed(false);
        let list: ConversationSummary[] = [];
        try {
          list = await fetchConversationList(token);
        } catch (e) {
          list = [];
        }
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
          try {
            const loaded = await loadConversationById(token, activeId);
            if (!alive) return;
            if (loaded.ok && loaded.conversation) {
              setConversationId(String(loaded.conversation.internal_dify_conversation_id || '').trim());
              if (loaded.messages.length > 0) {
                const cleaned = loaded.messages.map((m: any) =>
                  m.role === 'assistant' || m.role === 'system' ? { ...m, text: stripInternalReasoning(m.text) } : m
                );
                const withSeq = cleaned.map((m: any) => assignSeqToMessage(m));
                setMessages(withSeq);
                rebaseSeqFromList(withSeq);
                setCoverAudioMsgId(null);
                coverAudioRef.current = null;
                setCoverDraft(null);
                setCoverWizard(null);
                const lastReadyMsg = [...withSeq].reverse().find((m) => m.structured?.action === 'ready_to_generate');
                if (lastReadyMsg && lastReadyMsg.structured) setActiveReady({ ...lastReadyMsg.structured });
              }
            }
          } catch {
            /* ignore: fallo al cargar conversación activa; no romper banner */
          }
        }
      } catch (e) {
        if (!alive) return;
        try {
          const token = await getValidBearerToken();
          if (!token) setBootFailed(true);
        } catch {
          setBootFailed(true);
        }
      }
    }

    void runBoot();

    if (supabaseBrowser && typeof (supabaseBrowser.auth as any)?.onAuthStateChange === 'function') {
      try {
        const { data } = (supabaseBrowser.auth as any).onAuthStateChange((_event: any, session: any) => {
          if (session?.user) void runBoot();
          else setBootFailed(true);
        });
        authUnsub = data?.subscription;
      } catch {}
    }

    return () => {
      alive = false;
      try { authUnsub?.unsubscribe?.(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openConversation(conv: ConversationSummary) {
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
        const withSeq = cleaned.map((m: any) => assignSeqToMessage(m));
        setMessages(withSeq);
        rebaseSeqFromList(withSeq);

        let rehydratedAudio: any = null;
        let rehydratedWizard: any = null;
        let rehydratedDraft: any = null;
        let rehydratedMsgId: string | null = null;
        let rehydratedPreview = typeof (loaded as any).cover_audio_preview === 'string' ? String((loaded as any).cover_audio_preview).trim() : '';

        try {
          const snap = (loaded as any).cover_draft_snapshot;
          if (snap && typeof snap === 'object') {
            try {
              const a = snap.audio;
              if (a && typeof a === 'object') {
                rehydratedMsgId = typeof a.msg_id === 'string' ? a.msg_id : null;
                const name = String(a.name || '').trim();
                const mime = String(a.mime || 'audio/mpeg').trim();
                const bytes = Number(a.bytes || 0) || 0;
                const r2Key = String(a.r2_key || '').trim();
                if (name || rehydratedPreview || r2Key) {
                  rehydratedAudio = {
                    file: null,
                    previewUrl: rehydratedPreview,
                    name,
                    bytes,
                    mime: mime || 'audio/mpeg',
                    r2Key: r2Key,
                  };
                }
              }
            } catch {}
            try {
              const w = snap.wizard;
              if (w && typeof w === 'object' && ['lyrics','style','mood','direction','title','voice','summary'].includes(String(w.phase || ''))) {
                rehydratedWizard = {
                  phase: String(w.phase || 'summary'),
                  lyrics: String(w.lyrics || ''),
                  style: String(w.style || ''),
                  mood: String(w.mood || ''),
                  direction: String(w.direction || ''),
                  title: String(w.title || ''),
                  voice: String(w.voice || '') === 'Mujer' ? 'Mujer' : (String(w.voice || '') === 'Hombre' ? 'Hombre' : ''),
                };
              }
            } catch {}
            try {
              const d = snap.draft;
              if (d && typeof d === 'object' && (d.title || d.style || d.gender)) {
                rehydratedDraft = {
                  title: String(d.title || 'Cover').slice(0, 100) || 'Cover',
                  style: String(d.style || '').trim(),
                  gender: String(d.gender || '') === 'Femenino' ? 'Femenino' : 'Masculino',
                  instructions: typeof d.instructions === 'string' ? d.instructions : '',
                };
              }
            } catch {}
          }
        } catch {}

        if (rehydratedAudio) {
          coverAudioRef.current = rehydratedAudio;
          setCoverAudioMsgId(rehydratedMsgId);
        } else {
          coverAudioRef.current = null;
          setCoverAudioMsgId(null);
        }
        if (rehydratedWizard) setCoverWizard(rehydratedWizard); else setCoverWizard(null);
        if (rehydratedDraft) setCoverDraft(rehydratedDraft); else setCoverDraft(null);

        const lastReadyMsg = [...withSeq].reverse().find((m) => m.structured?.action === 'ready_to_generate');
        if (lastReadyMsg && lastReadyMsg.structured) setActiveReady({ ...lastReadyMsg.structured });
      } else {
        insertSeqRef.current = 0;
        setCoverAudioMsgId(null);
        coverAudioRef.current = null;
        setCoverDraft(null);
        setCoverWizard(null);
        setMessages([
          assignSeqToMessage({
            id: uid(),
            role: 'assistant',
            text:
              '¡Hola! 🎶 Cuéntame qué canción quieres crear.',
            createdAt: Date.now(),
          }),
        ]);
      }
      setUi((p) => ({ ...p, activeConversationId: conv.id }));
      sentScrollRef.current = true;
      setTimeout(() => scrollToBottomNow(true), 30);
    } catch (e) {
      setToast({ kind: 'err', text: e instanceof Error ? e.message : String(e || 'Error') });
    } finally {
      setLoading(false);
    }
  }

  async function startNewChat(opts?: { persistOldAsArchived?: boolean }) {
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
      insertSeqRef.current = 0;
      setCoverAudioMsgId(null);
      coverAudioRef.current = null;
      setCoverDraft(null);
      setCoverWizard(null);
      setMessages([
        assignSeqToMessage({
          id: uid(),
          role: 'assistant',
          text:
            '¡Hola! 🎶 Cuéntame qué canción quieres crear.',
          createdAt: Date.now(),
        }),
      ]);
      setUi((p) => ({
        ...p,
        activeConversationId: created?.id || null,
        conversations: created ? [created, ...p.conversations] : p.conversations,
      }));
      sentScrollRef.current = true;
      setTimeout(() => scrollToBottomNow(true), 30);
      setToast({ kind: 'ok', text: 'Listo · chat nuevo creado. El anterior se guardó en el historial.' });
    } catch (e) {
      setToast({ kind: 'err', text: e instanceof Error ? e.message : String(e || 'Error') });
    }
  }

  async function onNewChatClick() {
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
  }

  function handleAttachPick() {
    if (loading || generating) {
      setToast({
        kind: 'ok',
        text: 'Espera tantito: estoy procesando algo. Si se quedó trabado, toca “Reintentar” o recarga la página.',
      });
      return;
    }
    setAttachMenuOpen((o) => !o);
  }

  function triggerFilePickForKind(kind: AttachMenuKind) {
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
  }

  function handleAttachFileChange(e: ChangeEvent<HTMLInputElement>) {
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
  }

  function handleAttachRemove() {
    if (!attachedImg) return;
    try { URL.revokeObjectURL(attachedImg.previewUrl); } catch {}
    setAttachedImg(null);
    if (!coverWizard && !coverDraft) {
      setCoverAudioMsgId(null);
      coverAudioRef.current = null;
    }
    if (!coverWizard) setCoverWizard(null);
    if (!coverDraft) setCoverDraft(null);
  }

  function confirmAudioAuth(): boolean {
    try {
      return window.confirm('¿Confirmas que este audio es tuyo o tienes autorización para usarlo?');
    } catch {
      return true;
    }
  }

  function setVF(updater: (p: VoiceFlowState) => VoiceFlowState) {
    setVoiceFlow((prev) => {
      const next = updater(prev);
      voiceFlowRef.current = next;
      return next;
    });
  }
  function vfStepFromProfile(p: VoiceProfilePublic | null, listOpen: boolean): VoiceFlowState['step'] {
    if (!p) return listOpen ? 'intro' : 'intro';
    const s = String(p.status || '').toLowerCase();
    const isExpired = p.expires_at ? Date.now() > new Date(p.expires_at).getTime() : false;
    if (s === 'failed_verify') return 'verify';
    if (!p.consent_given_at) return 'consent';
    if (!p.sample_ready) return 'sample';
    if (!p.current_phrase) return 'phrase';
    if (!p.verify_ready) return 'verify';
    if (!p.name) return 'name';
    if (!p.is_active && (s === 'pending' || s === 'processing' || s === 'creating')) return 'creating';
    if (p.is_active && !isExpired && s === 'ready') return 'ready';
    if (isExpired || (!p.is_active && (s === 'ready' || s === 'expired' || s === ''))) return 'expired';
    if (!p.is_active) return 'creating';
    return 'creating';
  }
  async function callVoiceFlow<T = any>(payload: any, opts?: { showError?: boolean; list?: boolean }): Promise<{ ok: boolean; status: number; data: T }> {
    try {
      const token = await getValidBearerToken();
      if (!token) {
        if (opts?.showError !== false) setToast({ kind: 'err', text: 'Sesión expirada. Inicia sesión de nuevo.' });
        return { ok: false, status: 401, data: { error: 'Sin sesión' } as any };
      }
      const r = await fetch('/api/luciana/voice-flow', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, accept: 'application/json' },
        body: JSON.stringify(payload || {}),
      });
      const text = await r.text();
      let data: any = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
      if (opts?.showError !== false && (r.status < 200 || r.status >= 300)) {
        const base = data?.message || data?.error || 'No pude completar la acción en el servidor.';
        // Si el backend devuelve error_id, se lo mostramos al usuario para que lo comparta
        // (sin exponer detalles internos). Log técnico solo en servidor.
        const errId = (data as any)?.error_id;
        const userMsg = errId ? `${base} (Error ${String(errId)})` : String(base);
        setToast({ kind: 'err', text: userMsg });
      }
      return { ok: r.status >= 200 && r.status < 300, status: r.status, data: data as T };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e || 'Error de conexión');
      if (opts?.showError !== false) setToast({ kind: 'err', text: `Sin conexión al servidor: ${msg}` });
      return { ok: false, status: 0, data: { error: msg } as any };
    }
  }
  async function refreshVoiceList(opts?: { selectId?: string | null }) {
    setVF((p) => ({ ...p, listLoading: true }));
    const r = await callVoiceFlow<{ list?: VoiceProfilePublic[]; profile?: VoiceProfilePublic }>({ action: 'list' }, { showError: false });
    const list: VoiceProfilePublic[] = Array.isArray((r.data as any)?.list) ? (r.data as any).list : [];
    const first = list[0] || null;
    const selectedId = opts?.selectId ?? voiceFlowRef.current.selectedId ?? first?.id ?? null;
    const current = list.find((x) => x.id === selectedId) || first;
    setVF((p) => ({
      ...p,
      listLoading: false,
      list,
      selectedId: current?.id || selectedId || null,
      current: current || null,
      step: current ? vfStepFromProfile(current, p.open) : (list.length ? 'intro' : 'intro'),
    }));
    return { list, current };
  }
  async function refreshVoiceCurrent(forceStep?: VoiceFlowState['step']) {
    const id = voiceFlowRef.current.selectedId;
    if (!id) return null;
    const r = await callVoiceFlow<{ profile?: VoiceProfilePublic }>({ action: 'get', profileId: id }, { showError: false });
    const profile: VoiceProfilePublic | undefined = (r.data as any)?.profile;
    if (!profile) return null;
    setVF((p) => ({
      ...p,
      current: profile,
      list: p.list.map((x) => (x.id === profile.id ? profile : x)),
      step: forceStep ?? vfStepFromProfile(profile, p.open),
    }));
    return profile;
  }
  async function startVoiceFlowWizard(resetStuck = true) {
    if (!VOICE_FLOW_ENABLED_IN_BOT) {
      try {
        setVF((p) => ({ ...p, open: false, busy: false }));
      } catch {}
      try {
        wizardPushMessage(VOICE_FLOW_TEMP_DISABLED_MSG);
      } catch {}
      return;
    }
    setVF((p) => ({ ...p, open: true, step: 'intro', busy: false }));
    const { list, current } = await refreshVoiceList();

    // Detectar perfil STUCK: paso phrase SIN frase generada y han pasado >=2 minutos desde created_at o updated_at
    function isStuckPhrase(profile: VoiceProfilePublic | null): boolean {
      if (!profile) return false;
      if (!profile.consent_given_at || !profile.sample_ready) return false;
      if (profile.current_phrase) return false;
      if (profile.verify_ready) return false;
      const createdAt = profile.created_at ? new Date(profile.created_at).getTime() : Date.now();
      const ageMs = Date.now() - createdAt;
      return ageMs >= 2 * 60 * 1000;
    }

    // Si existe perfil actual y está STUCK en Paso 3 sin frase: resetear automáticamente si resetStuck
    if (resetStuck && current && isStuckPhrase(current)) {
      try { await callVoiceFlow({ action: 'hide', profileId: current.id }, { showError: false }); } catch {}
      const r2 = await callVoiceFlow<{ profile?: VoiceProfilePublic; profileId?: string }>({ action: 'create' });
      if (r2.ok && r2.data?.profileId) {
        const sel = await refreshVoiceList({ selectId: r2.data.profileId });
        if (sel.current) void scrollToBottomNow(true);
        return;
      }
    }

    if (!list.length) {
      const r = await callVoiceFlow<{ profile?: VoiceProfilePublic; profileId?: string }>({ action: 'create' });
      if (r.ok && r.data?.profileId) {
        const { current: cur } = await refreshVoiceList({ selectId: r.data.profileId });
        if (cur) void scrollToBottomNow(true);
      }
    } else {
      if (current) setVF((p) => ({ ...p, step: vfStepFromProfile(current, true) }));
      void scrollToBottomNow(true);
    }
  }

  // ====== Voice flow: limpiar timer al desmontar, y cargar lista al boot (cuando haya user) ======
  // NOTA: este useEffect debe ir DESPUÉS de setVF, vfStepFromProfile, callVoiceFlow, refreshVoiceList y getValidBearerToken
  // para evitar TDZ "Cannot access before initialization" en modo StrictMode + build minificado.
  useEffect(() => {
    return () => {
      if (voiceRefreshTimerRef.current) { window.clearInterval(voiceRefreshTimerRef.current); voiceRefreshTimerRef.current = null; }
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getValidBearerToken();
        if (!token) return;
        if (!supabaseBrowser) return;
        const { data: { user } } = await supabaseBrowser.auth.getUser();
        if (!user) return;
        if (cancelled) return;
        const { list, current } = await refreshVoiceList();
        if (cancelled) return;
        if (current && vfStepFromProfile(current, false) === 'creating') {
          if (voiceRefreshTimerRef.current) window.clearInterval(voiceRefreshTimerRef.current);
          voiceRefreshTimerRef.current = window.setInterval(async () => {
            const state = voiceFlowRef.current;
            if (!state.selectedId || state.step !== 'creating') {
              if (voiceRefreshTimerRef.current) { window.clearInterval(voiceRefreshTimerRef.current); voiceRefreshTimerRef.current = null; }
              return;
            }
            const res = await callVoiceFlow({ action: 'refresh-status', profileId: state.selectedId }, { showError: false });
            if (res.ok) {
              const p: VoiceProfilePublic | undefined = (res.data as any)?.profile;
              if (p) {
                setVF((prev) => ({
                  ...prev,
                  current: p,
                  list: prev.list.map((x) => (x.id === p.id ? p : x)),
                  step: (() => {
                    const next = vfStepFromProfile(p, prev.open);
                    if (next === 'ready' || next === 'expired' || next === 'verify') {
                      if (voiceRefreshTimerRef.current) { window.clearInterval(voiceRefreshTimerRef.current); voiceRefreshTimerRef.current = null; }
                    }
                    return next;
                  })(),
                }));
              }
            }
          }, 12000);
        }
        void list;
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [callVoiceFlow, getValidBearerToken, refreshVoiceList, setVF, vfStepFromProfile]);

  async function uploadAudioToVoiceFlow(profileId: string, kind: 'sample' | 'verify', file: File): Promise<boolean> {
    if (!file) return false;
    if (file.size > 25 * 1024 * 1024) {
      setToast({ kind: 'err', text: 'El audio supera los 25 MB permitidos.' });
      return false;
    }
    setVF((p) => ({ ...p, uploading: true, uploadingProgress: 2, uploadKind: kind, busy: true }));
    try {
      const ext = (file.name.split('.').pop() || 'webm').toLowerCase().replace(/[^a-z0-9]/g, '') || 'webm';
      const contentType = file.type || `audio/${ext === 'mp3' ? 'mpeg' : ext}`;
      const getUp = await callVoiceFlow<{ uploadUrl?: string; signedPutUrl?: string; upload_url?: string; suggested_path?: string; key?: string; r2_path?: string }>(
        { action: 'get-upload-url', profileId, kind, ext, contentType, filename: file.name },
        { showError: true },
      );
      if (!getUp.ok) return false;
      const getUpData: any = (getUp.data as any) || {};
      const putUrl: string = String(getUpData.uploadUrl || getUpData.signedPutUrl || getUpData.upload_url || '').trim();
      const r2Key: string = String(getUpData.r2_path || getUpData.suggested_path || getUpData.key || '').trim();
      if (!putUrl || !r2Key) {
        setToast({ kind: 'err', text: 'No pude preparar la subida del audio. Intenta de nuevo.' });
        return false;
      }
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', putUrl, true);
        try { xhr.setRequestHeader('Content-Type', contentType); } catch {}
        xhr.upload.onprogress = (e) => {
          if (e.total > 0) {
            const pct = Math.min(96, Math.round((e.loaded / e.total) * 100));
            setVF((prev) => ({ ...prev, uploadingProgress: pct }));
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`HTTP ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.send(file);
      });
      setVF((p) => ({ ...p, uploadingProgress: 98 }));
      const savePayload: any = {
        action: kind === 'sample' ? 'save-sample-path' : 'save-verify-path',
        profileId,
        r2_path: r2Key,
        suggested_path: r2Key,
        key: r2Key,
        filename: file.name,
        sizeBytes: file.size,
        contentType,
        ext,
      };
      if (voiceFlowRef.current?.activeActivationId) savePayload.activationId = voiceFlowRef.current.activeActivationId;
      const save = await callVoiceFlow(savePayload, { showError: true });
      if (!save.ok) return false;
      const refreshed = await refreshVoiceCurrent();
      setToast({ kind: 'ok', text: kind === 'sample' ? '🎙️ Muestra original guardada correctamente.' : '🎤 Grabación de verificación guardada.' });
      // Si es la muestra sample y ya tenemos consentimiento → pedir frase AUTOMÁTICAMENTE (no hacer click manual)
      if (kind === 'sample' && refreshed && refreshed.consent_given_at && !refreshed.current_phrase) {
        void vfRequestPhrase(false);
      }
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e || 'Error');
      setToast({ kind: 'err', text: `No pude subir el audio: ${msg}` });
      return false;
    } finally {
      setVF((p) => ({ ...p, uploading: false, uploadingProgress: 0, uploadKind: null, busy: false }));
    }
  }
  function pickVFVoiceAudioFile(kind: 'sample' | 'verify') {
    const profileId = voiceFlowRef.current.selectedId;
    if (!profileId) { setToast({ kind: 'err', text: 'Primero selecciona o crea un personaje.' }); return; }
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.mp3,audio/mpeg';
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f) return;
      if (!confirmAudioAuth()) return;
      void uploadAudioToVoiceFlow(profileId, kind, f);
    };
    try { inp.click(); } catch {}
  }
  function recordVFVoiceAudio(kind: 'sample' | 'verify') {
    const profileId = voiceFlowRef.current.selectedId;
    if (!profileId) { setToast({ kind: 'err', text: 'Primero selecciona o crea un personaje.' }); return; }
    const navAny: any = typeof navigator === 'undefined' ? null : navigator;
    const canMedia =
      typeof window !== 'undefined' &&
      typeof navAny?.mediaDevices?.getUserMedia === 'function' &&
      typeof (window as any).MediaRecorder === 'function';
    if (!canMedia) {
      setToast({ kind: 'err', text: 'Tu navegador no permite grabar aquí. Usa la opción Subir audio.' });
      return;
    }
    if (!confirmAudioAuth()) return;
    setVF((p) => ({ ...p, uploadKind: kind }));
    setTimeout(() => startMicRecorder().catch(() => {}), 30);
    const finalizeOnce = () => {
      window.removeEventListener('luciana:audio-attached', finalizeOnce);
      setTimeout(async () => {
        const realAttach = attachedImg;
        if (realAttach && realAttach.kind === 'audio' && realAttach.file) {
          try { URL.revokeObjectURL(realAttach.previewUrl); } catch {}
          setAttachedImg(null);
          void uploadAudioToVoiceFlow(profileId, kind, realAttach.file);
        } else {
          setVF((p) => ({ ...p, uploadKind: null }));
        }
      }, 60);
    };
    window.addEventListener('luciana:audio-attached', finalizeOnce);
  }
  async function vfAcceptConsent() {
    const id = voiceFlowRef.current.selectedId;
    if (!id) return;
    setVF((p) => ({ ...p, busy: true }));
    const r = await callVoiceFlow({ action: 'accept-consent', profileId: id }, { showError: true });
    if (r.ok) {
      await refreshVoiceCurrent('sample');
    }
    setVF((p) => ({ ...p, busy: false }));
  }
  async function vfRequestPhrase(regenerate?: boolean) {
    const id = voiceFlowRef.current.selectedId;
    if (!id) return;
    const startedAt = Date.now();
    setVF((p) => ({
      ...p,
      busy: true,
      step: 'phrase',
      phraseLoading: true,
      phraseRequestedAt: startedAt,
      phraseError: '',
      phraseErrorId: null,
    }));
    try {
      const r = await callVoiceFlow(
        { action: regenerate ? 'regenerate-phrase' : 'request-phrase', profileId: id },
        { showError: false }
      );
      if (!r.ok) {
        const errMsg = String(((r.data as any)?.error) || r.message || 'Error al pedir la frase.');
        const errId = String(((r.data as any)?.error_id) || ((r as any)?.error_id) || '').trim() || null;
        setVF((p) => ({
          ...p,
          phraseLoading: false,
          phraseError: errMsg,
          phraseErrorId: errId,
        }));
        setToast({
          kind: 'err',
          text: errId ? `${errMsg} (Error ${errId})` : errMsg,
        });
        return;
      }
      const phraseFromResp = String(((r.data as any)?.phrase) || '').trim();
      await refreshVoiceCurrent('phrase');
      // Si el backend aún no tiene la frase (Suno tardó más de 3.5s), reintentar c/7s hasta 42s
      if (!phraseFromResp && !voiceFlowRef.current.current?.current_phrase) {
        let tries = 0;
        const maxTries = 6;
        const tryTimer = window.setInterval(async () => {
          tries += 1;
          try {
            const p = await refreshVoiceCurrent('phrase');
            const hasNow = p && String(p.current_phrase || '').trim();
            if (hasNow) {
              window.clearInterval(tryTimer);
              setVF((prev) => ({ ...prev, phraseLoading: false, phraseError: '', phraseErrorId: null }));
              return;
            }
            if (tries >= maxTries || !voiceFlowRef.current.selectedId || voiceFlowRef.current.step !== 'phrase') {
              window.clearInterval(tryTimer);
              setVF((prev) => ({
                ...prev,
                phraseLoading: false,
                phraseError: 'La frase no se pudo preparar a tiempo. Pulsa "Volver a pedir frase" para reintentar.',
                phraseErrorId: null,
              }));
            }
          } catch {
            if (tries >= maxTries) {
              window.clearInterval(tryTimer);
              setVF((prev) => ({
                ...prev,
                phraseLoading: false,
                phraseError: 'La frase no se pudo preparar a tiempo. Pulsa "Volver a pedir frase" para reintentar.',
                phraseErrorId: null,
              }));
            }
          }
        }, 7000);
      } else {
        // Frase llegó OK
        setVF((prev) => ({ ...prev, phraseLoading: false, phraseError: '', phraseErrorId: null }));
      }
      void scrollToBottomNow(true);
    } catch (errAny) {
      const errMsg = 'Error de conexión al pedir la frase.';
      setVF((p) => ({
        ...p,
        phraseLoading: false,
        phraseError: errMsg,
        phraseErrorId: null,
      }));
      setToast({ kind: 'err', text: errMsg });
    } finally {
      setVF((p) => ({ ...p, busy: false }));
    }
  }
  async function vfSetName() {
    const id = voiceFlowRef.current.selectedId;
    const name = voiceFlowRef.current.nameInput.trim();
    if (!id) return;
    if (!name) { setToast({ kind: 'err', text: 'Escribe un nombre para tu personaje.' }); return; }
    if (name.length > 50) { setToast({ kind: 'err', text: 'El nombre es muy largo (máximo 50 caracteres).' }); return; }
    setVF((p) => ({ ...p, busy: true }));
    const r = await callVoiceFlow({ action: 'set-name', profileId: id, name }, { showError: true });
    if (r.ok) {
      await refreshVoiceCurrent('creating');
      void vfConfirmCreate();
    }
    setVF((p) => ({ ...p, busy: false }));
  }
  async function vfConfirmCreate() {
    const id = voiceFlowRef.current.selectedId;
    if (!id) return;
    setVF((p) => ({ ...p, busy: true, step: 'creating' }));
    const r = await callVoiceFlow({ action: 'confirm-create', profileId: id }, { showError: true });
    if (r.ok) {
      await refreshVoiceCurrent('creating');
      if (voiceRefreshTimerRef.current) window.clearInterval(voiceRefreshTimerRef.current);
      voiceRefreshTimerRef.current = window.setInterval(async () => {
        const state = voiceFlowRef.current;
        if (!state.selectedId || state.step !== 'creating') {
          if (voiceRefreshTimerRef.current) { window.clearInterval(voiceRefreshTimerRef.current); voiceRefreshTimerRef.current = null; }
          return;
        }
        const res = await callVoiceFlow({ action: 'refresh-status', profileId: state.selectedId }, { showError: false });
        if (res.ok) {
          const p: VoiceProfilePublic | undefined = (res.data as any)?.profile;
          if (p) {
            setVF((prev) => ({
              ...prev,
              current: p,
              list: prev.list.map((x) => (x.id === p.id ? p : x)),
              step: (() => {
                const next = vfStepFromProfile(p, prev.open);
                if (next === 'ready' || next === 'expired' || next === 'verify') {
                  if (voiceRefreshTimerRef.current) { window.clearInterval(voiceRefreshTimerRef.current); voiceRefreshTimerRef.current = null; }
                }
                return next;
              })(),
            }));
          }
        }
      }, 12000);
    }
    setVF((p) => ({ ...p, busy: false }));
  }
  async function vfReactivate() {
    const id = voiceFlowRef.current.selectedId;
    if (!id) return;
    setVF((p) => ({ ...p, busy: true }));
    const r = await callVoiceFlow({ action: 'reactivate', profileId: id }, { showError: true });
    if (r.ok) {
      await refreshVoiceCurrent('phrase');
    }
    setVF((p) => ({ ...p, busy: false }));
  }
  async function vfHide() {
    const id = voiceFlowRef.current.selectedId;
    if (!id) return;
    if (!window.confirm('Ocultar este personaje? Lo podrás recuperar después.')) return;
    const r = await callVoiceFlow({ action: 'hide', profileId: id }, { showError: true });
    if (r.ok) {
      await refreshVoiceList();
      setVF((p) => ({ ...p, open: false, step: 'intro' }));
    }
  }
  async function vfDeletePermanent() {
    const id = voiceFlowRef.current.selectedId;
    const written = voiceFlowRef.current.confirmPermanentText.trim();
    if (!id) return;
    if (written !== 'ELIMINAR_PERMANENTEMENTE') {
      setToast({ kind: 'err', text: 'Escribe exactamente ELIMINAR_PERMANENTEMENTE para confirmar.' });
      return;
    }
    setVF((p) => ({ ...p, busy: true }));
    const r = await callVoiceFlow({ action: 'delete-permanently', profileId: id, confirm: written }, { showError: true });
    if (r.ok) {
      setVF((p) => ({ ...p, confirmPermanentText: '', selectedId: null, current: null, open: false, step: 'intro' }));
      await refreshVoiceList();
      setToast({ kind: 'ok', text: '🗑️ Personaje eliminado de forma permanente.' });
    }
    setVF((p) => ({ ...p, busy: false }));
  }

  // ====== Detectar intención "quiero crear personaje / clonar voz" al enviar mensaje ======
  function textSuggestsVoiceWizard(raw: string) {
    const t = String(raw || '').toLowerCase().trim();
    if (!t) return false;
    const keywords = [
      'clonar voz', 'clona mi voz', 'clonar mi voz', 'crear personaje', 'crea un personaje',
      'mi personaje', 'personaje de voz', 'personaje voz', 'mi voz como', 'con mi voz',
      'usar mi voz', 'doble de voz', 'clon', 'personaje',
    ];
    return keywords.some((k) => t.includes(k));
  }

  function wizardPushMessage(text: string) {
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
  }

  async function transcribeAudioForWizard() {
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
    const audioBytes = Number(attachedImg.bytes || 0);
    const msgAudioUrl = (() => {
      try { return URL.createObjectURL(audioFile); } catch { return attachedImg.previewUrl || ''; }
    })();
    let audioR2Key = '';
    let audioMime = '';
    coverAudioRef.current = { file: audioFile, previewUrl: msgAudioUrl || attachedImg.previewUrl || '', name: audioName, bytes: audioBytes };

    let controller: AbortController | null = null;
    let timeoutTimer: number | null = null;
    let abortedByTimeout = false;
    let localAudioMsgId = coverAudioMsgId;

    const setStatusText = (label: string, extra?: Partial<ChatMessage>) => {
      try {
        if (!localAudioMsgId) return;
        const patch: any = {};
        if (label) patch.text = label;
        if (extra) Object.assign(patch, extra);
        updateMessageById(localAudioMsgId, patch);
      } catch {}
    };

    const cleanBusy = () => {
      setLoading(false);
      setAudioBusy(false);
      if (timeoutTimer != null) {
        try { window.clearTimeout(timeoutTimer); } catch {}
        timeoutTimer = null;
      }
      controller = null;
    };

    const saveSnapshotAfter = (audio: { r2_key?: string | null; mime?: string | null; name?: string | null; bytes?: number | null; msg_id?: string | null }, wizard: typeof coverWizard | null = coverWizard, draft: typeof coverDraft | null = coverDraft) => {
      try {
        const bytes = Number(audio.bytes || audioBytes || 0) || null;
        void persistCoverSnapshot({
          audioMeta: {
            msg_id: audio.msg_id || localAudioMsgId || null,
            r2_key: audio.r2_key || null,
            name: audio.name || audioName || null,
            mime: audio.mime || null,
            bytes,
          },
          wizard,
          draft,
        });
      } catch {}
    };

    const showErrorButtons = (msg: string, errId?: string) => {
      const idLabel = errId ? ` (Error ${String(errId).trim()})` : '';
      const safeMsg = `${msg}${idLabel}`.trim();
      setToast({ kind: 'err', text: safeMsg });
      setStatusText(`Audio fallido · ${audioName}`);
      setMessages((m) => {
        const last: ChatMessage = {
          id: uid(),
          role: 'assistant',
          text: safeMsg,
          createdAt: Date.now(),
          quickReplies: [
            { id: 'cover-transcribe-retry', label: 'Reintentar', value: 'cover:transcribe:retry', icon: 'refresh', variant: 'primary' },
            { id: 'cover-transcribe-manual', label: 'Escribir letra', value: 'cover:transcribe:manual', icon: 'edit', variant: 'secondary' },
          ],
          inputMode: 'text',
        };
        return [...m, last];
      });
      saveSnapshotAfter({ r2_key: audioR2Key || null, mime: audioMime || null }, null, null);
    };

    const showLyricsAndConfirm = (lyrics: string) => {
      const formatted = formatLyricsForEditing(lyrics);
      const trimmed = String(formatted || '').replace(/\r\n/g, '\n').trim();
      setStatusText(`Audio listo · ${audioName}`);
      const nextWiz: typeof coverWizard = {
        phase: 'lyrics',
        lyrics: trimmed,
        style: '',
        mood: '',
        direction: '',
        title: '',
        voice: '',
      };
      setCoverWizard(nextWiz);
      const aMsg: ChatMessage = {
        id: uid(),
        role: 'assistant',
        text:
          `🎙️ Detecté esta letra:\n\n` +
          `\`\`\`\n${trimmed}\n\`\`\`\n\n` +
          `¿Está correcta o quieres cambiar algo?\n` +
          `- Si está bien: escríbeme **“sí está bien”** (o cualquier confirmación corta).\n` +
          `- Si quieres corregirla: pégame la letra corregida (solo la letra).`,
        createdAt: Date.now(),
        structured: { action: 'wizard_lyrics', lyrics: trimmed },
        quickReplies: [
          { id: 'cover-lyrics-ok', label: 'Sí, está correcta', value: 'cover:lyrics:ok', icon: 'check', variant: 'primary' },
          { id: 'cover-lyrics-manual', label: 'Editar letra', value: 'cover:lyrics:manual', icon: 'edit', variant: 'secondary' },
        ],
        inputMode: 'multiline',
      };
      setMessages((m) => [...m, aMsg]);
      void (async () => {
        try {
          const accessToken = await getValidBearerToken();
          const activeConvId = uiState.activeConversationId;
          if (accessToken && activeConvId) {
            try { await appendMessageToConversation(accessToken, activeConvId, { role: 'assistant', content: stripInternalReasoning(aMsg.text) }); } catch {}
          }
        } catch {}
      })();
      saveSnapshotAfter({ r2_key: audioR2Key || null, mime: audioMime || null }, nextWiz, null);
    };

    try {
      const accessToken = await getValidBearerToken();
      if (!accessToken) {
        setToast({ kind: 'err', text: 'Sesión expirada. Vuelve a iniciar sesión con Google.' });
        setTimeout(() => signOutAndReload(), 1200);
        return;
      }

      if (!localAudioMsgId) {
        const newId = uid();
        localAudioMsgId = newId;
        setCoverAudioMsgId(newId);
        const userMsg: ChatMessage = {
          id: newId,
          role: 'user',
          text: `Subiendo audio · ${audioName}`,
          createdAt: Date.now(),
          attachment: msgAudioUrl ? { kind: 'audio', previewUrl: msgAudioUrl, name: audioName, bytes: audioBytes } : null,
        };
        setMessages((m) => [...m, userMsg]);
      } else {
        setStatusText(`Subiendo audio · ${audioName}`);
      }

      let activeConvId = uiState.activeConversationId;
      if (!activeConvId) {
        const created = await createSupabaseConversation(accessToken, { title: 'Cover con audio' });
        if (created) {
          activeConvId = created.id;
          setUi((p) => ({ ...p, activeConversationId: activeConvId!, conversations: created ? [created, ...p.conversations] : p.conversations }));
        }
      }

      try {
        setAttachedImg(null);
      } catch {}

      setToast({ kind: 'ok', text: 'Transcribiendo audio…' });
      setStatusText(`Procesando audio · ${audioName}`);
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
        setToast({ kind: 'err', text: friendly });
        setStatusText(`Audio fallido · ${audioName}`);
        setMessages((m) => [...m, { id: uid(), role: 'assistant', text: friendly, createdAt: Date.now() }]);
        return;
      }

      const audioUrl = String(uploadJson?.url || uploadJson?.upload_url || uploadJson?.uploadUrl || '').trim();
      audioR2Key = String(uploadJson?.r2_key || uploadJson?.key || '').trim();
      audioMime = String(uploadJson?.content_type || uploadJson?.contentType || audioFile?.type || 'audio/mpeg').trim();
      if (coverAudioRef.current) {
        coverAudioRef.current.r2Key = audioR2Key;
        coverAudioRef.current.mime = audioMime;
      }
      if (activeConvId && audioR2Key) {
        void (async () => {
          try {
            await appendMessageToConversation(accessToken, activeConvId!, {
              role: 'user',
              content: `[Audio adjunto: ${audioName}]`,
              structured_action: {
                action: 'audio_attachment',
                kind: 'audio',
                r2_key: audioR2Key,
                name: audioName,
                mime: audioMime || 'audio/mpeg',
                bytes: audioBytes || 0,
              },
            });
          } catch {}
        })();
      }
      saveSnapshotAfter({ r2_key: audioR2Key || null, mime: audioMime || null, name: audioName, bytes: audioBytes || 0, msg_id: localAudioMsgId }, null, null);
      if (!audioUrl) {
        const friendly = 'No pude preparar el audio para transcribir.';
        setToast({ kind: 'err', text: friendly });
        setStatusText(`Audio fallido · ${audioName}`);
        setMessages((m) => [...m, { id: uid(), role: 'assistant', text: friendly, createdAt: Date.now() }]);
        return;
      }

      let trJson: any = {};
      let trStatus = 0;
      let trOk = false;
      try {
        controller = new AbortController();
        timeoutTimer = window.setTimeout(() => {
          if (!controller) return;
          abortedByTimeout = true;
          try { controller.abort(); } catch {}
        }, 65000);

        const byName = (audioFile?.name || '').toString().trim().toLowerCase();
        const byType = (audioFile?.type || '').toString().trim();
        const mimeType = byType || (byName.endsWith('.mp3') ? 'audio/mpeg' : 'audio/mpeg');

        const r = await fetch('/api/ai/transcribe-lyrics', {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            authorization: `Bearer ${accessToken}`,
            accept: 'application/json',
            'x-transcribe-source': 'bot',
          },
          body: JSON.stringify({ uploadUrl: audioUrl, mimeType, source: 'bot' }),
        });
        trStatus = r.status;
        const raw = await r.text();
        try { trJson = raw ? JSON.parse(raw) : {}; } catch { trJson = { error: 'invalid_json' }; }
        trOk = r.ok && trJson && trJson.ok === true && typeof trJson?.lyrics === 'string' && String(trJson.lyrics || '').trim().length > 0;
      } catch (e) {
        const isAbort = abortedByTimeout || (e instanceof DOMException && e.name === 'AbortError') || /abort|timeout|timed out/i.test(e instanceof Error ? e.message : String(e));
        if (abortedByTimeout || isAbort) {
          showErrorButtons('La transcripción tardó demasiado. Intenta de nuevo o escribe la letra manualmente.');
          return;
        }
        trStatus = 0;
        trJson = { error: 'network_error' };
        trOk = false;
      }

      if (trOk) {
        const lyrics = String(trJson?.lyrics || '').trim();
        showLyricsAndConfirm(lyrics);
        return;
      }

      if (abortedByTimeout) {
        showErrorButtons('La transcripción tardó demasiado. Intenta de nuevo o escribe la letra manualmente.');
        return;
      }

      const msg = (trJson?.message || 'No pudimos transcribir este audio. Intenta de nuevo o pega la letra manualmente.').toString();
      const id = (trJson?.error_id || '').toString();
      showErrorButtons(msg, id);
      return;
    } catch {
      showErrorButtons('No pudimos transcribir este audio. Intenta de nuevo o pega la letra manualmente.');
      return;
    } finally {
      cleanBusy();
      try { requestAnimationFrame(() => autoresizeTextarea(textareaRef.current)); } catch {}
    }
  }

  useEffect(() => {
    const onAutoTranscribe = () => {
      try { window.setTimeout(() => void transcribeAudioForWizard(), 0); } catch {}
    };
    window.addEventListener('luciana:audio-attached', onAutoTranscribe);
    return () => { window.removeEventListener('luciana:audio-attached', onAutoTranscribe); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcribeAudioForWizard]);

  useEffect(() => {
    const hasAudio = !!coverAudioRef.current || !!coverAudioMsgId;
    const hasWizard = !!coverWizard;
    const hasDraft = !!coverDraft;
    if (!hasAudio && !hasWizard && !hasDraft) return;
    const id = window.setTimeout(() => {
      void persistCoverSnapshot();
    }, 250);
    return () => { try { window.clearTimeout(id); } catch {} };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coverWizard, coverDraft, coverAudioMsgId]);

  async function handleGenerateCoverFromAudio() {
    const audioSrc = coverAudioRef.current || (attachedImg && attachedImg.kind === 'audio' ? {
      file: attachedImg.file,
      previewUrl: attachedImg.previewUrl || '',
      name: attachedImg.name,
      bytes: attachedImg.bytes,
    } : null);
    if (!audioSrc) return;
    const hasFile = !!(audioSrc.file && typeof (audioSrc.file as any).arrayBuffer === 'function');
    const hasR2Key = typeof (audioSrc as any).r2Key === 'string' && String((audioSrc as any).r2Key).trim().length > 0;
    if (!hasFile && !hasR2Key) return;
    if (!coverDraft) return;
    if (!coverWizard || coverWizard.phase !== 'summary') return;
    if (loading || generating || audioBusy || coverGenerating) return;
    if (!confirmAudioAuth()) return;
    if (!supabaseBrowser) {
      setToast({ kind: 'err', text: 'No se pudo conectar. Cierra y abre la app de nuevo.' });
      return;
    }

    const lyricsFinal = String(coverWizard.lyrics || '').trim();
    if (!lyricsFinal) {
      setToast({ kind: 'err', text: 'Falta la letra para hacer el cover. Vuelve atrás y pega la letra.' });
      try {
        setCoverWizard({ ...coverWizard, phase: 'lyrics' });
      } catch {}
      return;
    }

    setCoverGenerating(true);
    setLoading(true);
    sentScrollRef.current = true;
    const audioName = String(audioSrc.name || audioSrc.file?.name || 'audio').slice(0, 160) || 'audio';
    const audioFile = audioSrc.file;
    const audioBytes = Number(audioSrc.bytes || 0);
    const msgAudioUrl = audioSrc.previewUrl || (() => {
      try { return URL.createObjectURL(audioFile); } catch { return ''; }
    })();
    const title = String(coverDraft.title || 'Cover').trim().slice(0, 100) || 'Cover';
    const styleClean = sanitizeStyleValue(coverDraft.style || '');
    const instrRaw = String((coverDraft as any)?.instructions || '').trim();
    const instructionsClean = sanitizeStyleValue(instrRaw);
    const vocalGender = coverDraft.gender === 'Femenino' ? 'f' : 'm';
    const COST_CREDITS = 12;

    const styleFinal = [
      styleClean || null,
      instructionsClean || null,
      (coverDraft.gender ? `Voz deseada: ${coverDraft.gender}.` : null),
    ].filter(Boolean).join('\n') || 'Pop';

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
        attachment: msgAudioUrl ? { kind: 'audio', previewUrl: msgAudioUrl, name: audioName, bytes: audioBytes } : null,
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
      if (hasR2Key && !hasFile) {
        try {
          uploadStatus = 200;
          uploadJson = { success: true, r2_key: String((audioSrc as any).r2Key).trim() };
        } catch {
          uploadStatus = 0;
          uploadJson = { error: 'invalid_r2key' };
        }
      } else if (hasFile) {
        try {
          const fd = new FormData();
          fd.append('file', audioFile as any, audioName);
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
      } else {
        uploadStatus = 0;
        uploadJson = { error: 'no_audio_source' };
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
        const payload: any = {
          uploadUrl: uploadUrl || undefined,
          uploadBucket: uploadPath ? 'ramber-tunes' : undefined,
          uploadPath: uploadPath || undefined,
          instrumental: false,
          prompt: lyricsFinal,
          style: styleFinal,
          title,
          model: 'V6',
          vocalGender,
        };
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
            description: styleFinal,
            lyrics: lyricsFinal,
            prompt: instructionsClean,
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
  }

  useEffect(() => () => {
    // cleanup preview URL al desmontar
    if (attachedImg) { try { URL.revokeObjectURL(attachedImg.previewUrl); } catch {} }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendMessage() {
    const text = String(input || '').trim();
    if (!supabaseBrowser) {
      setToast({ kind: 'err', text: 'No se pudo conectar con LucIAna. Cierra y abre la app de nuevo.' });
      return;
    }

    // ========== DETECCIÓN: Crear personaje / clonar voz → abrir flujo guiado ==========
    if (!coverWizard && textSuggestsVoiceWizard(text)) {
      const userMsg: ChatMessage = { id: uid(), role: 'user', text, createdAt: Date.now() };
      setMessages((m) => [...m, userMsg]);
      // Forzar orden user → assistant: esperar 1 microtick antes de insertar respuesta assistant
      await Promise.resolve();
      setLoading(true);

      if (!VOICE_FLOW_ENABLED_IN_BOT) {
        // Bloqueo temporal: NO abrir flujo. Responder al usuario mensaje seguro.
        wizardPushMessage(VOICE_FLOW_TEMP_DISABLED_MSG);
        setLoading(false);
        if (setInputAndDraftRef.current) setInputAndDraftRef.current('', true);
        else { setInput(''); clearStoredDraft(currentUserId, uiState.activeConversationId || conversationId || null); }
        if (textareaRef.current) textareaRef.current.value = '';
        autoresizeTextarea(textareaRef.current);
        return;
      }

      wizardPushMessage(
        '🎙️ ¡Perfecto! Vamos a **crear tu personaje de voz** paso a paso. Cuando termine, podrás usar tu propia voz para cantar cualquier canción o cover durante 24 horas.'
      );
      setLoading(false);
      if (setInputAndDraftRef.current) setInputAndDraftRef.current('', true);
      else { setInput(''); clearStoredDraft(currentUserId, uiState.activeConversationId || conversationId || null); }
      if (textareaRef.current) textareaRef.current.value = '';
      autoresizeTextarea(textareaRef.current);
      void startVoiceFlowWizard();
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
          const base = String(coverAudioRef.current?.name || attachedImg?.name || 'Cover').replace(/\.[^.]+$/, '').trim();
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
        const styleClean = sanitizeStyleValue(next.style || '');
        const instrBits = [next.mood, next.direction].map((s) => sanitizeStyleValue(String(s || ''))).filter(Boolean);
        const instrFinal = instrBits.join(' · ');
        setCoverDraft({
          title: String(next.title || 'Cover').trim().slice(0, 100) || 'Cover',
          style: styleClean || 'Pop',
          gender: genderFinal,
          instructions: instrFinal,
        });
        const summaryText =
          `✨ Ya tenemos todo para el cover:\n\n` +
          `**Título:** ${next.title || 'Cover'}\n` +
          `**Estilo musical:** ${styleClean || 'Pop'}\n` +
          (instrFinal ? `**Instrucciones:** ${instrFinal}\n` : '') +
          `**Voz:** ${next.voice || genderFinal}\n\n` +
          `Revisa los detalles arriba. Cuando esté bien pulsa **Generar cover** (12 créditos).`;
        wizardPushMessage(summaryText);
      }

      setLoading(false);
      return;
    }

    if (attachedImg && attachedImg.kind === 'audio') {
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
      if (attachedImg) {
        try { handleAttachRemove(); } catch {}
      }

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
  }

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
  const totalTurns = orderedMessages.reduce((n, m) => n + (m.role === 'user' || m.role === 'assistant' ? 1 : 0), 0);
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

  function VFRow({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          padding: highlight ? '10px 14px' : '4px 2px',
          borderRadius: 12,
          border: highlight ? '1px solid rgba(236, 72, 153, 0.35)' : '1px solid transparent',
          background: highlight
            ? 'linear-gradient(135deg, rgba(236,72,153,0.08) 0%, rgba(124,58,237,0.08) 50%, rgba(37,99,235,0.08) 100%)'
            : 'transparent',
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.12,
            textTransform: 'uppercase',
            color: 'var(--text-dim)',
            opacity: 0.9,
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 14,
            fontWeight: highlight ? 800 : 600,
            color: highlight ? '#ec4899' : 'var(--text)',
            lineHeight: 1.3,
          }}
        >
          {value}
        </div>
      </div>
    );
  }

  function VFUploadProgress({ voiceFlow }: { voiceFlow: VoiceFlowState }) {
    const pct = Math.max(0, Math.min(100, voiceFlow.uploadingProgress || 0));
    return (
      <div
        style={{
          marginTop: 14,
          padding: '10px 14px',
          borderRadius: 12,
          border: '1px solid var(--border)',
          background: 'var(--bg-elev-1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
            {pct < 98 ? 'Subiendo audio…' : 'Finalizando…'}
          </div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 800,
              color: '#7c3aed',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {pct}%
          </div>
        </div>
        <div
          style={{
            height: 8,
            width: '100%',
            borderRadius: 4,
            background: 'var(--border)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${pct}%`,
              transition: 'width 180ms ease',
              background: 'linear-gradient(90deg, #ec4899 0%, #7c3aed 50%, #2563eb 100%)',
            }}
          />
        </div>
      </div>
    );
  }

  function PhraseRequestingCard({
    voiceFlow,
    onRetry,
  }: {
    voiceFlow: VoiceFlowState;
    onRetry: () => void;
  }) {
    // Reloj local para mostrar "sigue cargando" vs "tarda mucho -> pulsar reintentar"
    const [, forceTick] = useState(0);
    useEffect(() => {
      const t = window.setInterval(() => forceTick((n) => n + 1), 1000);
      return () => window.clearInterval(t);
    }, []);

    const now = Date.now();
    const startedAt = voiceFlow.phraseRequestedAt || voiceFlow.current?.created_at
      ? new Date(voiceFlow.current?.created_at || '').getTime() || now
      : now;
    const secsSinceRequested = Math.max(0, Math.floor((now - startedAt) / 1000));
    const isLoading = voiceFlow.phraseLoading || voiceFlow.busy;
    const hasError = Boolean(voiceFlow.phraseError || voiceFlow.phraseErrorId);
    const takesTooLong = !hasError && (secsSinceRequested >= 15 || !isLoading);

    // Sub-caso 1: Error explícito (el más prioritario)
    if (hasError) {
      return (
        <div style={{
          padding: '1rem 0.9rem',
          borderRadius: '0.95rem',
          border: '1px solid color-mix(in srgb, #ef4444 50%, var(--border))',
          background: isDark ? 'rgba(239,68,68,.10)' : 'rgba(239,68,68,.06)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.6rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
            <AlertTriangle className="h-4 w-4" style={{ color: '#ef4444', marginTop: '2px', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#ef4444', marginBottom: '0.25rem' }}>
                No pudimos preparar la frase.
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>
                {String(voiceFlow.phraseError || 'Inténtalo de nuevo en unos segundos.')}
                {voiceFlow.phraseErrorId ? ` (Error ${voiceFlow.phraseErrorId})` : ''}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onRetry}
            disabled={voiceFlow.busy}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-2xl px-4 text-xs font-black w-full disabled:opacity-60"
            style={{
              background: 'linear-gradient(135deg, #16a34a, #10b981)',
              color: '#fff',
              border: '1px solid transparent',
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Volver a pedir frase de verificación
          </button>
        </div>
      );
    }

    // Sub-caso 2: Sigue cargando PERO ya han pasado 15s -> recomendamos reintentar
    if (takesTooLong) {
      return (
        <div style={{
          padding: '1rem 0.9rem',
          borderRadius: '0.95rem',
          border: '1px solid color-mix(in srgb, var(--brand-accent) 35%, var(--border))',
          background: isDark ? 'rgba(124,58,237,.08)' : 'rgba(124,58,237,.05)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.6rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
            <Clock className="h-4 w-4" style={{ color: 'var(--brand-accent)', marginTop: '2px', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text)', marginBottom: '0.25rem' }}>
                Está tardando más de lo normal.
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>
                Puedes seguir esperando, o pulsar el botón verde para volver a solicitar la frase.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onRetry}
            disabled={voiceFlow.busy}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-2xl px-4 text-xs font-black w-full disabled:opacity-60"
            style={{
              background: 'linear-gradient(135deg, #16a34a, #10b981)',
              color: '#fff',
              border: '1px solid transparent',
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Volver a pedir frase de verificación
          </button>
        </div>
      );
    }

    // Sub-caso 3: Menos de 15s y sin error -> loader normal "Preparando..."
    return (
      <div style={{
        padding: '1.1rem 1rem',
        borderRadius: '0.95rem',
        border: '1px solid color-mix(in srgb, var(--brand-accent) 35%, var(--border))',
        background: 'color-mix(in srgb, var(--brand-accent) 10%, transparent)',
        textAlign: 'center',
        color: 'var(--text)',
        fontSize: '0.82rem',
        fontWeight: 800,
      }}>
        <Loader2 className="h-4 w-4 animate-spin" style={{ verticalAlign: '-3px', marginRight: '0.4rem' }} />
        Preparando la frase de verificación ✨ (solo unos segundos)
      </div>
    );
  }

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
          {VOICE_FLOW_ENABLED_IN_BOT && (
            <button
              type="button"
              aria-label="Crear personaje de voz"
              onClick={() => void startVoiceFlowWizard()}
              className={cn(
                'inline-flex h-9 shrink-0 items-center gap-1 rounded-full px-2.5 text-[0.72rem] font-black transition sm:px-3',
              )}
              style={{
                background: 'linear-gradient(135deg, #ec4899 0%, #7c3aed 50%, #2563eb 100%)',
                color: '#fff',
                border: '1px solid transparent',
                boxShadow: '0 10px 28px color-mix(in srgb, #7c3aed 28%, transparent)',
              }}
              onMouseEnter={(e) => { (e.currentTarget.style.filter = 'brightness(1.08)'); }}
              onMouseLeave={(e) => { (e.currentTarget.style.filter = 'none'); }}
            >
              <Mic className="h-3.5 w-3.5" /> Crear personaje
            </button>
          )}
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

        {/* Header PERMANENTE: logo + marca — visible SIEMPRE, EXACTAMENTE IGUAL de grande.
            Al enviar el 1er mensaje NO se hace más chico: se queda con el mismo tamaño GRANDE de bienvenida.
            Los mensajes del chat empiezan a renderizarse DEBAJO de este header. */}
        <div
          className={cn(
            'flex min-h-0 w-full flex-col items-center justify-center px-6 md:px-10 py-10 md:py-6 text-center transition-all ease-out duration-300'
          )}
        >
          <img
            src={OFFICIAL_BRAND_LOGO}
            alt="Logo oficial LucIAna Music"
            className={cn(
              'mb-4 md:mb-3 object-contain drop-shadow-[0_0_24px_rgba(183,122,255,.45)]'
            )}
            style={{
              width: 'clamp(6rem, 19vw, 9rem)',
              height: 'clamp(6rem, 19vw, 9rem)',
              maxWidth: '144px',
              maxHeight: '144px',
            }}
          />
          <div style={{ maxWidth: '640px' }} className="w-full">
            <div
              className={cn(
                'font-black tracking-tight text-balance break-words'
              )}
              style={{
                color: 'var(--text)',
                fontSize: 'clamp(1.25rem, 5.6vw, 1.8rem)',
                lineHeight: 1.15,
              }}
            >
              Luc<span style={{ color: 'var(--brand-accent)', WebkitTextStroke: '0.3px currentColor' }}>IA</span>na Music <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>|</span> Canciones, Covers y MP3
            </div>
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

        {/* ====== TARJETA FLUJO CREAR PERSONAJE / CLONAR VOZ ====== */}
        {VOICE_FLOW_ENABLED_IN_BOT && voiceFlow.open && (
          <div className="luciana-msg-row is-assistant" style={{ marginTop: '0.25rem', marginBottom: '0.5rem' }}>
            <div className="luciana-msg-wrap" style={{ width: '100%' }}>
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
                  padding: '1rem 1.05rem calc(1.1rem + env(safe-area-inset-bottom, 0px))',
                  borderRadius: '1.25rem',
                  border: '1px solid color-mix(in srgb, #ec4899 28%, color-mix(in srgb, #7c3aed 22%, var(--border)))',
                  background: isDark
                    ? 'linear-gradient(135deg, rgba(236,72,153,.12), rgba(124,58,237,.12) 50%, rgba(37,99,235,.10))'
                    : 'linear-gradient(135deg, rgba(236,72,153,.08), rgba(124,58,237,.07) 50%, rgba(37,99,235,.06))',
                  backdropFilter: 'blur(8px)',
                  color: 'var(--text)',
                  // Evitar que la tarjeta se corte / superponga con la caja de escritura en PC + móvil.
                  position: 'relative',
                  zIndex: 2,
                }}>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="inline-flex h-9 w-9 items-center justify-center rounded-2xl ring-1"
                        style={{
                          background: 'linear-gradient(135deg, #ec4899 0%, #7c3aed 50%, #2563eb 100%)',
                          boxShadow: '0 10px 24px color-mix(in srgb, #7c3aed 26%, transparent)',
                          borderColor: 'transparent',
                          color: '#fff',
                        }}
                      >
                        <Volume2 className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <h2 className="text-base font-black" style={{ color: 'var(--text)' }}>
                          Crea tu personaje de voz
                        </h2>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          Tu propia voz para cantar canciones y covers. Disponible 24h. <b style={{ color: '#22c55e' }}>Crear tu personaje es gratis.</b> Los créditos solo se usan al generar canciones o covers.
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {voiceFlow.current && voiceFlow.step !== 'intro' && voiceFlow.step !== 'creating' && voiceFlow.step !== 'ready' && voiceFlow.step !== 'expired' && (
                        <button
                          type="button"
                          onClick={() => {
                            if (!window.confirm('Cancelar este personaje y empezar uno nuevo desde cero?')) return;
                            (async () => {
                              const id = voiceFlowRef.current.selectedId;
                              if (id) try { await callVoiceFlow({ action: 'hide', profileId: id }, { showError: false }); } catch {}
                              await startVoiceFlowWizard(false);
                            })();
                          }}
                          disabled={voiceFlow.busy || voiceFlow.uploading}
                          className="inline-flex h-9 items-center gap-1.5 rounded-2xl border px-3 text-xs font-bold transition disabled:opacity-60"
                          style={{ borderColor: 'color-mix(in srgb, #ef4444 40%, var(--border))', color: '#ef4444', background: 'var(--bg-elev-1)' }}
                        >
                          <RotateCcw className="h-3.5 w-3.5" /> Cancelar y volver a empezar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setVF((p) => ({ ...p, open: false }))}
                        disabled={voiceFlow.busy || voiceFlow.uploading}
                        className="inline-flex h-9 items-center gap-1.5 rounded-2xl border px-3 text-xs font-bold transition disabled:opacity-60"
                        style={{ borderColor: 'var(--border)', color: 'var(--text)', background: 'var(--bg-elev-1)' }}
                      >
                        <X className="h-3.5 w-3.5" /> Cerrar
                      </button>
                    </div>
                  </div>

                  {/* Sub selector: lista personajes */}
                  {voiceFlow.list.length > 1 && (
                    <div style={{ marginBottom: '0.8rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                      {voiceFlow.list.map((p) => {
                        const active = p.id === voiceFlow.selectedId;
                        const exp = p.expires_at ? Date.now() > new Date(p.expires_at).getTime() : false;
                        const statusBadge =
                          !p.consent_given_at ? 'Pendiente' :
                          !p.sample_ready ? 'Muestra' :
                          !p.current_phrase ? 'Frase' :
                          !p.verify_ready ? 'Verif.' :
                          !p.name ? 'Nombre' :
                          p.is_active && !exp ? '✅ Listo' :
                          exp ? '⏰ Vencido' :
                          String(p.status || '').toLowerCase() === 'ready' ? '✅ Listo' : 'Creando…';
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setVF((prev) => ({
                                ...prev,
                                selectedId: p.id,
                                current: p,
                                step: vfStepFromProfile(p, prev.open),
                              }));
                            }}
                            className="inline-flex h-9 items-center gap-1.5 rounded-2xl border px-3 text-xs font-bold transition"
                            style={{
                              borderColor: active ? 'transparent' : 'var(--border)',
                              background: active ? 'linear-gradient(135deg, #ec4899, #7c3aed)' : 'var(--bg-elev-1)',
                              color: active ? '#fff' : 'var(--text)',
                              boxShadow: active ? '0 10px 24px color-mix(in srgb, #7c3aed 28%, transparent)' : 'none',
                            }}
                          >
                            <span>{p.name || 'Personaje sin nombre'}</span>
                            <span style={{
                              fontSize: '0.6rem',
                              padding: '0.1rem 0.35rem',
                              borderRadius: '999px',
                              border: `1px solid ${active ? '#ffffff55' : 'var(--border)'}`,
                              opacity: 0.9,
                            }}>{statusBadge}</span>
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={async () => {
                          const r = await callVoiceFlow<{ profileId?: string }>({ action: 'create' });
                          if (r.ok && r.data?.profileId) { await refreshVoiceList({ selectId: r.data.profileId }); }
                        }}
                        className="inline-flex h-9 items-center gap-1 rounded-2xl border border-dashed px-3 text-xs font-bold"
                        style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'transparent' }}
                      >
                        <Plus className="h-3.5 w-3.5" /> Nuevo personaje
                      </button>
                    </div>
                  )}

                  {/* ========== PASO INTRO (si no hay personaje) ========== */}
                  {!voiceFlow.current && (
                    <div style={{ padding: '0.75rem 0.5rem', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                      {voiceFlow.listLoading ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Loader2 className="h-4 w-4 animate-spin" /> Cargando tus personajes…
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                          <p style={{ color: 'var(--text)', fontWeight: 700, fontSize: '0.92rem' }}>
                            🎙️ Aún no tienes personajes. Crea el primero en 5 pasos rápidos:
                          </p>
                          <ol style={{ margin: 0, paddingLeft: '1.2rem', lineHeight: 1.55 }}>
                            <li>Confirmo que la voz es mía (consentimiento).</li>
                            <li>Subo o grabo una muestra de mi voz original (15-60s).</li>
                            <li>Generaremos una frase de verificación única.</li>
                            <li>Grabo la frase exactamente como aparece.</li>
                            <li>Elijo un nombre para mi personaje → ¡listo en ~2 min!</li>
                          </ol>
                          <div style={{
                            marginTop: '0.4rem',
                            padding: '0.55rem 0.8rem',
                            borderRadius: '0.85rem',
                            border: '1px solid #22c55e40',
                            background: isDark ? 'rgba(34,197,94,.08)' : 'rgba(34,197,94,.05)',
                            fontSize: '0.78rem',
                            lineHeight: 1.4,
                            color: isDark ? '#bbf7d0' : '#14532d',
                            fontWeight: 700,
                          }}>
                            ✨ <b>Crear tu personaje es gratis.</b> Los créditos solo se usan al generar canciones o covers.
                          </div>
                          <button
                            type="button"
                            onClick={async () => {
                              const r = await callVoiceFlow<{ profileId?: string }>({ action: 'create' });
                              if (r.ok && r.data?.profileId) { await refreshVoiceList({ selectId: r.data.profileId }); }
                            }}
                            disabled={voiceFlow.busy}
                            className="mt-1 inline-flex h-11 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-black self-start"
                            style={{
                              background: 'linear-gradient(135deg, #ec4899 0%, #7c3aed 50%, #2563eb 100%)',
                              color: '#fff',
                              boxShadow: '0 12px 30px color-mix(in srgb, #7c3aed 32%, transparent)',
                              cursor: voiceFlow.busy ? 'progress' : 'pointer',
                              opacity: voiceFlow.busy ? 0.8 : 1,
                            }}
                          >
                            {voiceFlow.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                            Empezar ahora
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ========== BARRA DE PROGRESO PASOS ========== */}
                  {voiceFlow.current && (
                    <div style={{
                      marginBottom: '0.8rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.4rem',
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      color: 'var(--text-muted)',
                    }}>
                      {['Consentimiento', 'Muestra', 'Frase', 'Verificación', 'Nombre'].map((lbl, i) => {
                        const step = voiceFlow.step;
                        const stepOrder: VoiceFlowState['step'][] = ['consent', 'sample', 'phrase', 'verify', 'name', 'creating', 'ready', 'expired', 'hidden'];
                        // Para la barra: 'creating' y más allá ya se marca como completo (nombre está hecho).
                        const mappedStep: VoiceFlowState['step'] = (step === 'cost' || step === 'creating' || step === 'ready' || step === 'expired' || step === 'hidden')
                          ? 'name'
                          : step;
                        const curIdx = Math.max(0, stepOrder.indexOf(mappedStep === 'intro' ? 'consent' : mappedStep));
                        const done = i < curIdx;
                        const active = i === curIdx;
                        return (
                          <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flex: 1 }}>
                            <span style={{
                              display: 'inline-flex',
                              width: '1.1rem',
                              height: '1.1rem',
                              borderRadius: '999px',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.6rem',
                              fontWeight: 900,
                              color: done || active ? '#fff' : 'var(--text-muted)',
                              background: done ? 'linear-gradient(135deg,#22c55e,#16a34a)' : active ? 'linear-gradient(135deg,#ec4899,#7c3aed)' : 'var(--bg-elev-2)',
                              border: `1px solid ${active ? 'transparent' : done ? 'transparent' : 'var(--border)'}`,
                            }}>{done ? '✓' : i + 1}</span>
                            <span style={{
                              color: active ? 'var(--text)' : done ? 'var(--brand-primary)' : 'var(--text-muted)',
                              fontWeight: active ? 800 : 700,
                              whiteSpace: 'nowrap',
                            }}>{lbl}</span>
                            {i < 4 && <div style={{ flex: 1, height: '2px', background: done ? '#22c55e66' : 'var(--border)', borderRadius: '2px' }} />}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* ========== PASO 1: CONSENTIMIENTO ========== */}
                  {voiceFlow.current && voiceFlow.step === 'consent' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                      <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text)' }}>
                        <b style={{ color: 'var(--brand-accent)' }}>Paso 1 de 5 · Consentimiento:</b> Para proteger tu identidad, debes confirmar que la voz que vas a usar es tuya o que tienes autorización escrita.
                      </p>
                      <div style={{
                        padding: '0.7rem 0.85rem',
                        borderRadius: '0.95rem',
                        border: '1px dashed color-mix(in srgb, var(--brand-accent) 40%, var(--border))',
                        background: 'color-mix(in srgb, var(--brand-accent) 8%, transparent)',
                        color: isDark ? '#fce7f3' : '#831843',
                        fontSize: '0.8rem',
                        lineHeight: 1.45,
                      }}>
                        <ShieldCheck className="h-4 w-4" style={{ display: 'inline', verticalAlign: '-3px', marginRight: '0.35rem' }} />
                        <b>Confirmo que esta es mi voz o que tengo autorización explícita para usarla.</b> Guardaré tu aceptación junto con la fecha y la versión del texto (v1-es-20260919).
                      </div>
                      {voiceFlow.uploading && voiceFlow.uploadKind && (
                        <VFUploadProgress voiceFlow={voiceFlow} />
                      )}
                      <button
                        type="button"
                        onClick={() => void vfAcceptConsent()}
                        disabled={voiceFlow.busy}
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-black self-start"
                        style={{
                          background: 'linear-gradient(135deg, #16a34a 0%, #10b981 100%)',
                          color: '#fff',
                          boxShadow: '0 12px 30px rgba(34,197,94,0.3)',
                          cursor: voiceFlow.busy ? 'progress' : 'pointer',
                          opacity: voiceFlow.busy ? 0.8 : 1,
                        }}
                      >
                        {voiceFlow.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        Acepto y continuar
                      </button>
                    </div>
                  )}

                  {/* ========== PASO 2: MUESTRA ORIGINAL ========== */}
                  {voiceFlow.current && voiceFlow.step === 'sample' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                      <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text)' }}>
                        <b style={{ color: 'var(--brand-accent)' }}>Paso 2 de 5 · Muestra de tu voz original (15 - 60 segundos):</b> Habla o canta claro, sin ruido de fondo, en un lugar silencioso. Si dudas, usa el micrófono.
                      </p>
                      <div style={{
                        padding: '0.6rem 0.8rem',
                        borderRadius: '0.9rem',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-elev-1)',
                        fontSize: '0.72rem',
                        color: 'var(--text-muted)',
                        lineHeight: 1.45,
                      }}>
                        💡 <b>Consejos para una muestra perfecta:</b> Habla o canta con tu voz natural (sin hacer voces raras). Sin música de fondo, sin ecos, sin ruido de viento/ventilador. 15-40s es ideal. Puedes grabarla en el móvil sin problema.
                      </div>
                      {voiceFlow.current.sample_ready ? (
                        <div style={{
                          padding: '0.55rem 0.8rem',
                          borderRadius: '0.9rem',
                          border: '1px solid #22c55e55',
                          background: 'color-mix(in srgb, #22c55e 12%, transparent)',
                          color: isDark ? '#bbf7d0' : '#14532d',
                          fontSize: '0.8rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          fontWeight: 800,
                        }}>
                          <CheckCircle2 className="h-4 w-4" /> Muestra original guardada correctamente.
                        </div>
                      ) : null}
                      {voiceFlow.uploading && voiceFlow.uploadKind === 'sample' && (
                        <VFUploadProgress voiceFlow={voiceFlow} />
                      )}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <button
                          type="button"
                          onClick={() => pickVFVoiceAudioFile('sample')}
                          disabled={voiceFlow.busy || voiceFlow.uploading}
                          className="inline-flex h-10 items-center gap-1.5 rounded-2xl border px-4 text-xs font-bold transition disabled:opacity-60"
                          style={{ borderColor: 'var(--border)', background: 'var(--bg-elev-1)', color: 'var(--text)' }}
                        >
                          <Cloud className="h-3.5 w-3.5" /> Subir audio (MP3)
                        </button>
                        <button
                          type="button"
                          onClick={() => void recordVFVoiceAudio('sample')}
                          disabled={voiceFlow.busy || voiceFlow.uploading}
                          className="inline-flex h-10 items-center gap-1.5 rounded-2xl px-4 text-xs font-black transition disabled:opacity-60"
                          style={{
                            background: 'linear-gradient(135deg, #ec4899 0%, #7c3aed 100%)',
                            color: '#fff',
                            boxShadow: '0 10px 24px color-mix(in srgb, #7c3aed 30%, transparent)',
                            border: '1px solid transparent',
                          }}
                        >
                          <Mic className="h-3.5 w-3.5" /> Grabar ahora con micrófono
                        </button>
                        {voiceFlow.current.sample_ready && (
                          <button
                            type="button"
                            onClick={() => void vfRequestPhrase(false)}
                            disabled={voiceFlow.busy}
                            className="inline-flex h-10 items-center gap-1.5 rounded-2xl px-4 text-xs font-black self-end ml-auto disabled:opacity-60"
                            style={{
                              background: 'linear-gradient(135deg, #16a34a, #10b981)',
                              color: '#fff',
                              border: '1px solid transparent',
                            }}
                          >
                            Siguiente paso → Generar frase <Sparkles className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ========== PASO 3: FRASE VERIFICACIÓN ========== */}
                  {voiceFlow.current && voiceFlow.step === 'phrase' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                      <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text)' }}>
                        <b style={{ color: 'var(--brand-accent)' }}>Paso 3 de 5 · Frase de verificación:</b> Generaremos una frase única para confirmar que eres tú.
                      </p>

                      {/* CASO A: FRASE YA LISTA ✅ */}
                      {voiceFlow.current.current_phrase ? (
                        <div style={{
                          padding: '1.1rem 1rem',
                          borderRadius: '0.95rem',
                          border: '1px solid color-mix(in srgb, var(--brand-primary) 40%, var(--border))',
                          background: isDark
                            ? 'linear-gradient(135deg, rgba(37,99,235,.14), rgba(124,58,237,.12))'
                            : 'linear-gradient(135deg, rgba(37,99,235,.08), rgba(124,58,237,.07))',
                          textAlign: 'center',
                        }}>
                          <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', fontWeight: 800, marginBottom: '0.4rem' }}>
                            Canta o lee esta frase exactamente
                          </div>
                          <div style={{
                            fontSize: 'clamp(1rem, 3.6vw, 1.35rem)',
                            fontWeight: 900,
                            color: 'var(--text)',
                            lineHeight: 1.25,
                            wordBreak: 'break-word',
                            fontStyle: 'italic',
                          }}>
                            “{voiceFlow.current.current_phrase}”
                          </div>
                        </div>
                      ) : (
                        <PhraseRequestingCard
                          voiceFlow={voiceFlow}
                          onRetry={() => void vfRequestPhrase(true)}
                        />
                      )}

                      {voiceFlow.uploading && voiceFlow.uploadKind === 'sample' && <VFUploadProgress voiceFlow={voiceFlow} />}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {voiceFlow.current.current_phrase && !voiceFlow.busy && (
                          <>
                            <button
                              type="button"
                              onClick={() => void vfRequestPhrase(true)}
                              disabled={voiceFlow.busy}
                              className="inline-flex h-9 items-center gap-1.5 rounded-2xl border px-3 text-xs font-bold transition disabled:opacity-60"
                              style={{ borderColor: 'var(--border)', background: 'var(--bg-elev-1)', color: 'var(--text-muted)' }}
                            >
                              <Sparkles className="h-3.5 w-3.5" /> Quiero otra frase distinta
                            </button>
                            <button
                              type="button"
                              onClick={() => setVF((p) => ({ ...p, step: 'verify' }))}
                              disabled={voiceFlow.busy}
                              className="inline-flex h-10 items-center gap-1.5 rounded-2xl px-4 text-xs font-black ml-auto disabled:opacity-60"
                              style={{
                                background: 'linear-gradient(135deg, #16a34a, #10b981)',
                                color: '#fff',
                                border: '1px solid transparent',
                              }}
                            >
                              Siguiente → Grabar verificación <Mic className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ========== PASO 4: GRABAR VERIFICACIÓN ========== */}
                  {voiceFlow.current && voiceFlow.step === 'verify' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                      <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text)' }}>
                        <b style={{ color: 'var(--brand-accent)' }}>Paso 4 de 5 · Verificación:</b> Ahora graba leyendo/cantando la frase anterior <b>exactamente igual</b>. Si fallas, puedes repetirla.
                      </p>
                      {voiceFlow.current.current_phrase && (
                        <div style={{
                          padding: '0.55rem 0.8rem',
                          borderRadius: '0.9rem',
                          border: '1px solid color-mix(in srgb, var(--brand-primary) 30%, var(--border))',
                          background: isDark ? 'rgba(37,99,235,.10)' : 'rgba(37,99,235,.06)',
                          fontSize: '0.88rem',
                          fontWeight: 800,
                          color: 'var(--text)',
                          textAlign: 'center',
                          lineHeight: 1.3,
                        }}>
                          “{voiceFlow.current.current_phrase}”
                        </div>
                      )}
                      {String(voiceFlow.current.status || '').toLowerCase() === 'failed_verify' && (
                        <div style={{
                          padding: '0.55rem 0.8rem',
                          borderRadius: '0.9rem',
                          border: '1px solid #f43f5e55',
                          background: 'color-mix(in srgb, #f43f5e 12%, transparent)',
                          color: isDark ? '#fecdd3' : '#881337',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                        }}>
                          ⚠️ La verificación anterior falló. Asegúrate de leer la frase exactamente igual, sin ruido de fondo y con tu voz natural. Vuelve a grabar.
                        </div>
                      )}
                      {voiceFlow.current.verify_ready && (
                        <div style={{
                          padding: '0.55rem 0.8rem',
                          borderRadius: '0.9rem',
                          border: '1px solid #22c55e55',
                          background: 'color-mix(in srgb, #22c55e 12%, transparent)',
                          color: isDark ? '#bbf7d0' : '#14532d',
                          fontSize: '0.8rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          fontWeight: 800,
                        }}>
                          <CheckCircle2 className="h-4 w-4" /> Verificación guardada.
                        </div>
                      )}
                      {voiceFlow.uploading && voiceFlow.uploadKind === 'verify' && <VFUploadProgress voiceFlow={voiceFlow} />}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <button
                          type="button"
                          onClick={() => pickVFVoiceAudioFile('verify')}
                          disabled={voiceFlow.busy || voiceFlow.uploading}
                          className="inline-flex h-10 items-center gap-1.5 rounded-2xl border px-4 text-xs font-bold transition disabled:opacity-60"
                          style={{ borderColor: 'var(--border)', background: 'var(--bg-elev-1)', color: 'var(--text)' }}
                        >
                          <Cloud className="h-3.5 w-3.5" /> Subir grabación (MP3)
                        </button>
                        <button
                          type="button"
                          onClick={() => void recordVFVoiceAudio('verify')}
                          disabled={voiceFlow.busy || voiceFlow.uploading}
                          className="inline-flex h-10 items-center gap-1.5 rounded-2xl px-4 text-xs font-black transition disabled:opacity-60"
                          style={{
                            background: 'linear-gradient(135deg, #ec4899 0%, #7c3aed 100%)',
                            color: '#fff',
                            boxShadow: '0 10px 24px color-mix(in srgb, #7c3aed 30%, transparent)',
                            border: '1px solid transparent',
                          }}
                        >
                          <Mic className="h-3.5 w-3.5" /> Grabar la frase ahora
                        </button>
                        {voiceFlow.current.verify_ready && (
                          <button
                            type="button"
                            onClick={() => setVF((p) => ({ ...p, step: 'name', nameInput: p.current?.name || '' }))}
                            disabled={voiceFlow.busy}
                            className="inline-flex h-10 items-center gap-1.5 rounded-2xl px-4 text-xs font-black ml-auto disabled:opacity-60"
                            style={{
                              background: 'linear-gradient(135deg, #16a34a, #10b981)',
                              color: '#fff',
                              border: '1px solid transparent',
                            }}
                          >
                            Siguiente → Poner nombre <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ========== PASO 5: NOMBRE ========== */}
                  {voiceFlow.current && voiceFlow.step === 'name' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                      <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text)' }}>
                        <b style={{ color: 'var(--brand-accent)' }}>Paso 5 de 5 · Nombre del personaje:</b> Ponle un nombre corto (máx. 50 caracteres). Después lo encontrarás en la lista de voces al crear canciones.
                      </p>
                      <label className="block" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--brand-primary)' }}>
                          Nombre
                        </span>
                        <input
                          type="text"
                          value={voiceFlow.nameInput}
                          onChange={(e) => setVF((p) => ({ ...p, nameInput: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); void vfSetName(); }
                          }}
                          maxLength={50}
                          placeholder="Ej: Mi Voz, Mariachi Voz, Voz Carlos..."
                          style={{
                            display: 'block',
                            width: '100%',
                            height: '2.85rem',
                            borderRadius: '0.9rem',
                            border: '1px solid var(--border)',
                            background: 'var(--bg-elev-1)',
                            color: 'var(--text)',
                            padding: '0 0.95rem',
                            fontSize: '0.92rem',
                            fontWeight: 700,
                            outline: 'none',
                          }}
                        />
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                          {voiceFlow.nameInput.length} / 50
                        </div>
                      </label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <button
                          type="button"
                          onClick={() => setVF((p) => ({ ...p, step: 'verify' }))}
                          className="inline-flex h-10 items-center gap-1.5 rounded-2xl border px-4 text-xs font-bold"
                          style={{ borderColor: 'var(--border)', background: 'var(--bg-elev-1)', color: 'var(--text-muted)' }}
                        >
                          ← Volver a verificación
                        </button>
                        <button
                          type="button"
                          onClick={() => void vfSetName()}
                          disabled={voiceFlow.busy || !voiceFlow.nameInput.trim()}
                          className="inline-flex h-10 items-center gap-1.5 rounded-2xl px-5 text-xs font-black ml-auto disabled:opacity-60"
                          style={{
                            background: 'linear-gradient(135deg, #16a34a, #10b981)',
                            color: '#fff',
                            border: '1px solid transparent',
                          }}
                        >
                          {voiceFlow.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                          Guardar nombre
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ========== PASO 6 (RETIRADO): sin paso costo. Se salta directo a creating ========== */}

                  {/* ========== ESTADO: CREANDO (polling) ========== */}
                  {voiceFlow.current && voiceFlow.step === 'creating' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                      <div style={{
                        padding: '1rem 1rem',
                        borderRadius: '0.95rem',
                        border: '1px solid color-mix(in srgb, var(--brand-primary) 35%, var(--border))',
                        background: isDark ? 'rgba(37,99,235,.10)' : 'rgba(37,99,235,.06)',
                        textAlign: 'center',
                      }}>
                        <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--brand-primary)', verticalAlign: '-4px', marginRight: '0.5rem' }} />
                        <span style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text)' }}>
                          🎙️ Creando tu personaje… preparando tu voz.
                        </span>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                          Esto suele tardar entre <b>1 y 3 minutos</b>. Puedes irte a otra pestaña; cuando esté listo aparecerá automáticamente. Actualizo el estado cada 12 segundos.
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          const r = await callVoiceFlow({ action: 'refresh-status', profileId: voiceFlow.current?.id }, { showError: false });
                          if (r.ok) {
                            const p: VoiceProfilePublic | undefined = (r.data as any)?.profile;
                            if (p) {
                              setVF((prev) => ({
                                ...prev,
                                current: p,
                                list: prev.list.map((x) => (x.id === p.id ? p : x)),
                                step: vfStepFromProfile(p, prev.open),
                              }));
                            }
                          }
                        }}
                        className="self-start inline-flex h-9 items-center gap-1.5 rounded-2xl border px-3 text-xs font-bold"
                        style={{ borderColor: 'var(--border)', background: 'var(--bg-elev-1)', color: 'var(--text)' }}
                      >
                        <Sparkles className="h-3.5 w-3.5" /> Comprobar ahora mismo
                      </button>
                    </div>
                  )}

                  {/* ========== ESTADO: LISTO (is_active, expires_at no pasado) ========== */}
                  {voiceFlow.current && voiceFlow.step === 'ready' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                      <div style={{
                        padding: '1rem 1rem',
                        borderRadius: '0.95rem',
                        border: '1px solid #22c55e66',
                        background: isDark ? 'linear-gradient(135deg, rgba(34,197,94,.14), rgba(16,185,129,.10))' : 'linear-gradient(135deg, rgba(34,197,94,.08), rgba(16,185,129,.06))',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
                          <CheckCircle2 className="h-5 w-5" style={{ color: '#22c55e' }} />
                          <div style={{ fontSize: '1.05rem', fontWeight: 900, color: 'var(--text)' }}>
                            🎉 ¡Tu personaje <span style={{ color: '#16a34a' }}>“{voiceFlow.current.name || 'Tu personaje'}”</span> está listo!
                          </div>
                        </div>
                        <div style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '0.4rem',
                          fontSize: '0.78rem',
                          color: 'var(--text-muted)',
                          fontWeight: 700,
                        }}>
                          <span style={{
                            padding: '0.25rem 0.6rem',
                            borderRadius: '999px',
                            border: '1px solid #22c55e44',
                            background: isDark ? 'rgba(34,197,94,.14)' : 'rgba(34,197,94,.08)',
                            color: isDark ? '#bbf7d0' : '#14532d',
                          }}>
                            ✅ Disponible hasta {voiceFlow.current.expires_at
                              ? new Date(voiceFlow.current.expires_at).toLocaleString('es-ES', {
                                  day: '2-digit', month: '2-digit', year: 'numeric',
                                  hour: '2-digit', minute: '2-digit',
                                })
                              : '—'}
                          </span>
                          <span style={{
                            padding: '0.25rem 0.6rem',
                            borderRadius: '999px',
                            border: '1px solid #7c3aed44',
                            background: isDark ? 'rgba(124,58,237,.14)' : 'rgba(124,58,237,.08)',
                            color: isDark ? '#ddd6fe' : '#4c1d95',
                          }}>
                            🎤 Ya está seleccionada para usarse al crear
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <button
                          type="button"
                          onClick={() => {
                            try {
                              onChange('studio');
                              (window as any).__LUCIANA_SELECTED_CLONE_VOICE__ = {
                                id: voiceFlow.current?.active_activation_id || voiceFlow.current?.id || null,
                                name: voiceFlow.current?.name || 'Mi personaje',
                                type: 'suno-personaje',
                                fromBot: true,
                                ts: Date.now(),
                              };
                              window.dispatchEvent(new (window as any).CustomEvent('luciana:voice-selected', {
                                detail: (window as any).__LUCIANA_SELECTED_CLONE_VOICE__,
                              }));
                              setToast({ kind: 'ok', text: '🎙️ Voz seleccionada. Ahora crea tu canción.' });
                            } catch {}
                          }}
                          className="inline-flex h-11 items-center gap-1.5 rounded-2xl px-5 text-sm font-black"
                          style={{
                            background: 'linear-gradient(135deg, #16a34a 0%, #10b981 100%)',
                            color: '#fff',
                            boxShadow: '0 12px 30px rgba(34,197,94,0.32)',
                            border: '1px solid transparent',
                          }}
                        >
                          <Sparkles className="h-4 w-4" /> Crear canción con esta voz
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            try {
                              onChange('studio');
                              (window as any).__LUCIANA_SELECTED_CLONE_VOICE__ = {
                                id: voiceFlow.current?.active_activation_id || voiceFlow.current?.id || null,
                                name: voiceFlow.current?.name || 'Mi personaje',
                                type: 'suno-personaje',
                                fromBot: true,
                                mode: 'cover',
                                ts: Date.now(),
                              };
                              window.dispatchEvent(new (window as any).CustomEvent('luciana:voice-selected', {
                                detail: (window as any).__LUCIANA_SELECTED_CLONE_VOICE__,
                              }));
                              setToast({ kind: 'ok', text: '🎙️ Voz seleccionada. Ahora crea tu cover.' });
                            } catch {}
                          }}
                          className="inline-flex h-11 items-center gap-1.5 rounded-2xl px-5 text-sm font-black"
                          style={{
                            background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
                            color: '#fff',
                            boxShadow: '0 12px 30px rgba(124,58,237,0.32)',
                            border: '1px solid transparent',
                          }}
                        >
                          <Music2 className="h-4 w-4" /> Crear cover con esta voz
                        </button>
                        <button
                          type="button"
                          onClick={() => void vfHide()}
                          disabled={voiceFlow.busy}
                          className="inline-flex h-10 items-center gap-1.5 rounded-2xl border px-3 text-xs font-bold"
                          style={{ borderColor: 'var(--border)', background: 'var(--bg-elev-1)', color: 'var(--text-muted)' }}
                        >
                          <EyeOff className="h-3.5 w-3.5" /> Ocultar
                        </button>
                        <button
                          type="button"
                          onClick={() => setVF((p) => ({ ...p, step: 'expired' }))}
                          className="inline-flex h-10 items-center gap-1.5 rounded-2xl border px-3 text-xs font-bold ml-auto"
                          style={{ borderColor: 'var(--border)', background: 'var(--bg-elev-1)', color: 'var(--text-muted)' }}
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Eliminar / Reactivar
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ========== ESTADO: VENCIDO / REACTIVAR ========== */}
                  {voiceFlow.current && voiceFlow.step === 'expired' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                      <div style={{
                        padding: '1rem 1rem',
                        borderRadius: '0.95rem',
                        border: '1px solid #f59e0b55',
                        background: isDark ? 'rgba(245,158,11,.12)' : 'rgba(245,158,11,.08)',
                      }}>
                        <div style={{ fontSize: '0.95rem', fontWeight: 900, color: 'var(--text)' }}>
                          ⏰ Tu personaje <b>“{voiceFlow.current.name || 'Tu personaje'}”</b> venció su vigencia de 24h.
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.4rem', lineHeight: 1.45 }}>
                          ✅ Buenas noticias: <b>la muestra original se conserva</b> (no tienes que volver a subir tu voz de nuevo).
                          Solo tenemos que pedir una frase nueva y volver a grabar la verificación, y listo.
                          El costo es el mismo: <b style={{ color: 'var(--brand-accent)' }}>{VF_ACTIVATION_COST} créditos</b>.
                        </div>
                      </div>

                      <div style={{
                        padding: '0.75rem 0.85rem',
                        borderRadius: '0.9rem',
                        border: '1px dashed #f43f5e55',
                        background: isDark ? 'rgba(244,63,94,.10)' : 'rgba(244,63,94,.06)',
                        fontSize: '0.78rem',
                        color: isDark ? '#fecdd3' : '#881337',
                      }}>
                        <b>⚠️ ¿Quieres eliminarlo para siempre?</b> Esto borra tu muestra original, la última verificación y todas las activaciones. No se puede deshacer.
                        <label style={{ display: 'block', marginTop: '0.5rem' }}>
                          <span style={{ fontSize: '0.68rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            Escribe aquí para confirmar:
                          </span>
                          <input
                            type="text"
                            value={voiceFlow.confirmPermanentText}
                            onChange={(e) => setVF((p) => ({ ...p, confirmPermanentText: e.target.value }))}
                            placeholder="ELIMINAR_PERMANENTEMENTE"
                            style={{
                              display: 'block',
                              width: '100%',
                              marginTop: '0.3rem',
                              height: '2.5rem',
                              borderRadius: '0.75rem',
                              border: '1px solid var(--border)',
                              background: 'var(--bg-elev-1)',
                              color: 'var(--text)',
                              padding: '0 0.8rem',
                              fontSize: '0.82rem',
                              fontWeight: 700,
                              outline: 'none',
                              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                            }}
                          />
                        </label>
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                        <button
                          type="button"
                          onClick={() => void vfReactivate()}
                          disabled={voiceFlow.busy}
                          className="inline-flex h-11 items-center gap-1.5 rounded-2xl px-5 text-sm font-black disabled:opacity-70"
                          style={{
                            background: 'linear-gradient(135deg, #ec4899 0%, #7c3aed 50%, #2563eb 100%)',
                            color: '#fff',
                            boxShadow: '0 14px 34px color-mix(in srgb, #7c3aed 32%, transparent)',
                            border: '1px solid transparent',
                          }}
                        >
                          {voiceFlow.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-5 w-5" />}
                          🔄 Reactivar personaje
                        </button>
                        <button
                          type="button"
                          onClick={() => void vfDeletePermanent()}
                          disabled={voiceFlow.busy || voiceFlow.confirmPermanentText.trim() !== 'ELIMINAR_PERMANENTEMENTE'}
                          className="inline-flex h-11 items-center gap-1.5 rounded-2xl px-5 text-sm font-black disabled:opacity-40"
                          style={{
                            background: '#f43f5e',
                            color: '#fff',
                            border: '1px solid transparent',
                            marginLeft: 'auto',
                          }}
                        >
                          {voiceFlow.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          Eliminar permanentemente
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              </div>
            </div>
          </div>
        )}

        {orderedMessages
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

        {coverDraft && (attachedImg?.kind === 'audio' || coverAudioRef.current) && coverWizard && coverWizard.phase === 'summary' && (() => {
          const coverAudioPreview = (coverAudioRef.current && coverAudioRef.current.previewUrl) || (attachedImg?.kind === 'audio' ? attachedImg.previewUrl : '');
          const cleanStyleVal = sanitizeStyleValue(coverDraft.style);
          const instructionsVal = String((coverDraft as any)?.instructions || '').trim();
          return (
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

                  {coverAudioPreview ? (
                    <div style={{ marginBottom: '0.75rem' }}>
                      <audio controls preload="metadata" src={coverAudioPreview} style={{ width: '100%', maxWidth: '520px' }} />
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
                        Letra
                      </span>
                      <textarea
                        rows={6}
                        value={coverWizard.lyrics}
                        onChange={(e) => setCoverWizard((prev) => prev ? { ...prev, lyrics: e.target.value } : prev)}
                        placeholder="Pega aquí la letra de la canción (debe contener la letra real, no instrucciones)."
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

                    <label className="md:col-span-2 block">
                      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--brand-primary)' }}>
                        Estilo musical
                      </span>
                      <textarea
                        rows={3}
                        value={cleanStyleVal}
                        onChange={(e) => setCoverDraft({ ...coverDraft, style: e.target.value })}
                        placeholder="Ej: Pop romántico moderno, Reggaetón, Balada, Rock, Banda, Ranchero…"
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
                        Prompt / instrucciones
                      </span>
                      <textarea
                        rows={4}
                        value={instructionsVal}
                        onChange={(e) => setCoverDraft({ ...coverDraft, instructions: e.target.value })}
                        placeholder="Ej: Banda sinaloense, voz de hombre profunda, tempo medio, guitarra acústica, ambiente íntimo, alegre y bailable…"
                        style={{
                          display: 'block',
                          width: '100%',
                          resize: 'vertical',
                          minHeight: '6rem',
                          maxHeight: '14rem',
                          borderRadius: '1rem',
                          border: '1px solid var(--border)',
                          background: 'var(--bg-elev-1)',
                          color: 'var(--text)',
                          padding: '0.8rem 0.95rem',
                          fontSize: '0.9rem',
                          lineHeight: 1.55,
                          outline: 'none',
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
          );
        })()}

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
